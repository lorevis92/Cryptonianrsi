import { useEffect, useMemo, useState } from 'react'
import { TIMEFRAMES } from './plans.js'
import { DEFAULTS } from './stochrsi.js'
import { load, save } from './storage.js'

// Dati della mappa.
// Con i parametri classici dell'indicatore l'app scarica una sola fotografia già calcolata
// dal server (/api/snapshot) e ne tiene una copia sul dispositivo: all'apertura la mappa è subito piena,
// poi si aggiorna in sottofondo. Con parametri personalizzati calcola timeframe per timeframe (/api/scan).

// Ogni quanto si richiede di nuovo un timeframe (millisecondi) quando si usa /api/scan.
export const SCAN_REFRESH = { '1m': 30e3, '3m': 60e3, '5m': 60e3, '15m': 120e3, '1h': 240e3, '4h': 600e3, '1d': 1200e3 }
// Ogni quanto si chiede una fotografia nuova (la CDN la rinnova ogni minuto).
export const SNAPSHOT_REFRESH = 60e3

const keyOf = p => `${p.rsi}-${p.stoch}-${p.k}-${p.d}`
const DEFAULT_KEY = keyOf(DEFAULTS)

// I dati restano in memoria anche quando esci dalla mappa: tornando, è subito piena.
const store = { byTf: {}, top: [], extra: {}, at: 0, snap: null, hydrated: false }

function query(tf, params, symbols) {
  const q = new URLSearchParams({ tf })
  for (const key of ['rsi', 'stoch', 'k', 'd']) if (params[key] !== DEFAULTS[key]) q.set(key, params[key])
  if (symbols?.length) q.set('symbols', [...symbols].sort().join(','))
  return `/api/scan?${q}`
}

async function getJson(url, init) {
  const r = await fetch(url, init)
  const j = await r.json()
  if (!r.ok) throw new Error(j.error || 'Dati non disponibili')
  return j
}
const getScan = url => getJson(url)

function applySnapshot(j) {
  store.snap = j
  store.top = j.top || []
  store.at = j.at || 0
  for (const [tf, t] of Object.entries(j.tfs || {})) store.byTf[tf] = { paramKey: DEFAULT_KEY, rows: t.rows, at: t.at }
}

// Ultima fotografia salvata sul dispositivo (crsi:snapshot)
function hydrate() {
  if (store.hydrated) return
  store.hydrated = true
  const j = load('snapshot', null)
  if (j?.v === 1 && j.tfs) applySnapshot(j)
}

// Titoli fuori dalla fotografia (preferiti oltre i primi 50): una scansione ristretta per timeframe.
async function loadExtras(tf, symbols, params) {
  const paramKey = keyOf(params)
  const j = await getScan(query(tf, params, symbols))
  const box = (store.extra[tf] ||= {})
  for (const s of symbols) box[s] = { at: Date.now(), paramKey, row: j.rows.find(x => x.s === s) || null }
}

function readRow(tf, symbol, paramKey) {
  const a = store.byTf[tf], b = store.extra[tf]?.[symbol]
  const fromMap = a && a.paramKey === paramKey && a.rows[symbol] ? { at: a.at, row: a.rows[symbol] } : null
  const fromOne = b && b.paramKey === paramKey ? b : null
  if (fromMap && fromOne) return fromMap.at >= fromOne.at ? fromMap : fromOne
  return fromMap || fromOne
}

// Restituisce { tails: { SYM: { tf: {k, d} } }, symbols, loaded (timeframe pronti), error, at (ora dei dati) }
export function useScan(favorites, params) {
  const [version, setVersion] = useState(0)
  const [error, setError] = useState(null)
  const favKey = favorites.join(',')
  const paramKey = keyOf(params)
  const custom = paramKey !== DEFAULT_KEY
  const bump = () => setVersion(v => v + 1)

  useEffect(() => {
    let alive = true
    const timers = {}
    // Con parametri diversi i dati vecchi non valgono più
    for (const tf of TIMEFRAMES) if (store.byTf[tf] && store.byTf[tf].paramKey !== paramKey) delete store.byTf[tf]

    // --- Fotografia unica (parametri classici) ---
    async function snapshot() {
      clearTimeout(timers.snap)
      if (!document.hidden) {
        try {
          // no-cache: il browser chiede sempre alla CDN, che risponde subito dalla sua copia
          const j = await getJson('/api/snapshot', { cache: 'no-cache' })
          if (!alive) return
          applySnapshot(j)
          save('snapshot', j)
          setError(null)
          bump()
          const missing = favorites.filter(s => !store.top.includes(s))
          if (missing.length) {
            await Promise.all(TIMEFRAMES.map(tf => {
              const fresh = missing.every(s => { const e = store.extra[tf]?.[s]; return e && e.paramKey === paramKey && Date.now() - e.at < SCAN_REFRESH[tf] })
              return fresh ? null : loadExtras(tf, missing, params).catch(() => null)
            }))
            if (alive) bump()
          }
        } catch (e) {
          if (alive) setError(e.message)
        }
      }
      if (alive) timers.snap = setTimeout(snapshot, SNAPSHOT_REFRESH)
    }

    // --- Timeframe per timeframe (parametri personalizzati) ---
    async function scanTf(tf) {
      clearTimeout(timers[tf])
      if (document.hidden) return
      try {
        const main = await getScan(query(tf, params))
        const extra = favorites.filter(s => !main.symbols.includes(s))
        const more = extra.length ? await getScan(query(tf, params, extra)).catch(() => null) : null
        if (!alive) return
        const rows = {}
        for (const row of [...main.rows, ...(more?.rows || [])]) rows[row.s] = row
        store.byTf[tf] = { paramKey, rows, at: main.at || Date.now() }
        store.top = main.symbols
        setError(null)
        bump()
      } catch (e) {
        if (alive) setError(e.message)
      }
      if (alive) timers[tf] = setTimeout(() => scanTf(tf), SCAN_REFRESH[tf])
    }

    const start = () => {
      if (custom) TIMEFRAMES.forEach(scanTf)
      else snapshot()
    }
    if (!custom) {
      hydrate()
      if (store.snap) applySnapshot(store.snap) // tornando ai parametri classici
      bump()
    }
    start()
    const onVis = () => { if (!document.hidden) start() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      alive = false
      Object.values(timers).forEach(clearTimeout)
      document.removeEventListener('visibilitychange', onVis)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [favKey, paramKey])

  return useMemo(() => {
    const symbols = [...new Set([...store.top, ...favorites])]
    const tails = {}
    for (const s of symbols) {
      tails[s] = {}
      for (const tf of TIMEFRAMES) {
        const row = readRow(tf, s, paramKey)?.row
        if (row) tails[s][tf] = row
      }
    }
    const ready = TIMEFRAMES.filter(tf => store.byTf[tf]?.paramKey === paramKey)
    const at = custom ? Math.max(0, ...ready.map(tf => store.byTf[tf].at)) : store.at
    return { tails, symbols, loaded: ready.length, error, at }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, favKey, paramKey, error])
}

// Dettaglio di un titolo: la coda di K e D e il trend EMA 200 (t) per i timeframe indicati. K e D servono
// per i timeframe che le card non scaricano (i bloccati dal piano), il trend per tutti. Usa i dati della mappa se sono freschi, altrimenti la stessa scansione
// ristretta a quel titolo. Così la bolla del dettaglio è la stessa della mappa, con tutti e 7 gli anelli.
export function useSymbolTails(symbol, tfs, params) {
  const [version, setVersion] = useState(0)
  const paramKey = keyOf(params)
  const tfKey = tfs.join(',')

  useEffect(() => {
    if (!tfs.length) return
    hydrate()
    let alive = true
    const timers = {}
    async function load(tf) {
      clearTimeout(timers[tf])
      const have = readRow(tf, symbol, paramKey)
      const fresh = have && Date.now() - have.at < SCAN_REFRESH[tf] * 2 // la fotografia ha già i suoi tempi
      if (!fresh && !document.hidden) {
        try {
          const j = await getScan(query(tf, params, [symbol]))
          ;(store.extra[tf] ||= {})[symbol] = { at: Date.now(), paramKey, row: j.rows.find(x => x.s === symbol) || null }
          if (alive) setVersion(v => v + 1)
        } catch { /* riprova al prossimo giro */ }
      }
      const age = Date.now() - (readRow(tf, symbol, paramKey)?.at || 0)
      if (alive) timers[tf] = setTimeout(() => load(tf), Math.max(5e3, SCAN_REFRESH[tf] - age))
    }
    tfs.forEach(load)
    const onVis = () => { if (!document.hidden) tfs.forEach(load) }
    document.addEventListener('visibilitychange', onVis)
    return () => { alive = false; Object.values(timers).forEach(clearTimeout); document.removeEventListener('visibilitychange', onVis) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, tfKey, paramKey])

  return useMemo(() => {
    const out = {}
    for (const tf of tfs) {
      const row = readRow(tf, symbol, paramKey)?.row
      if (row) out[tf] = row
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, symbol, tfKey, paramKey])
}
