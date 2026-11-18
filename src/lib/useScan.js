import { useEffect, useMemo, useState } from 'react'
import { TIMEFRAMES } from './plans.js'
import { DEFAULTS } from './stochrsi.js'

// Ogni quanto la mappa richiede di nuovo un timeframe (millisecondi). Il server ha la sua cache.
export const SCAN_REFRESH = { '1m': 30e3, '3m': 60e3, '5m': 60e3, '15m': 120e3, '1h': 240e3, '4h': 600e3, '1d': 1200e3 }

// I dati restano in memoria anche quando esci dalla mappa: tornando, è subito piena.
const store = { byTf: {}, top: [] }

function query(tf, params, symbols) {
  const q = new URLSearchParams({ tf })
  for (const key of ['rsi', 'stoch', 'k', 'd']) if (params[key] !== DEFAULTS[key]) q.set(key, params[key])
  if (symbols?.length) q.set('symbols', [...symbols].sort().join(','))
  return `/api/scan?${q}`
}

async function getScan(url) {
  const r = await fetch(url)
  const j = await r.json()
  if (!r.ok) throw new Error(j.error || 'Dati non disponibili')
  return j
}

// Scarica i 7 timeframe in parallelo; la mappa si riempie man mano che arrivano.
// Restituisce { tails: { SYM: { tf: {k, d} } }, symbols: [...], loaded: n timeframe arrivati, error }
export function useScan(favorites, params) {
  const [version, setVersion] = useState(0)
  const [error, setError] = useState(null)
  const favKey = favorites.join(',')
  const paramKey = `${params.rsi}-${params.stoch}-${params.k}-${params.d}`

  useEffect(() => {
    let alive = true
    const timers = {}

    async function load(tf) {
      clearTimeout(timers[tf])
      if (document.hidden) return
      try {
        const main = await getScan(query(tf, params))
        const extra = favorites.filter(s => !main.symbols.includes(s))
        const more = extra.length ? await getScan(query(tf, params, extra)).catch(() => null) : null
        if (!alive) return
        const rows = {}
        for (const row of [...main.rows, ...(more?.rows || [])]) rows[row.s] = row
        store.byTf[tf] = { paramKey, rows }
        store.top = main.symbols
        setError(null)
        setVersion(v => v + 1)
      } catch (e) {
        if (alive) setError(e.message)
      }
      if (alive) timers[tf] = setTimeout(() => load(tf), SCAN_REFRESH[tf])
    }

    // Con parametri diversi i dati vecchi non valgono più
    for (const tf of TIMEFRAMES) if (store.byTf[tf] && store.byTf[tf].paramKey !== paramKey) delete store.byTf[tf]
    TIMEFRAMES.forEach(load)
    const onVis = () => { if (!document.hidden) TIMEFRAMES.forEach(load) }
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
        const row = store.byTf[tf]?.rows[s]
        if (row) tails[s][tf] = row
      }
    }
    return { tails, symbols, loaded: TIMEFRAMES.filter(tf => store.byTf[tf]).length, error }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, favKey, error])
}
