import { redis, hasStore } from './_store.js'
import { isNonCrypto } from '../src/lib/tvSymbols.js'

// Storico lungo per le crypto sui timeframe 1d e 1w.
// Bitunix ha poco storico (è nato nel 2024): le candele PRECEDENTI alla prima di Bitunix arrivano dalle API
// pubbliche di Binance (spot) o di Bybit: si usa quello con lo storico più lungo. Servono solo per gli anni che mancano:
// dove Bitunix ha dati, valgono i suoi.
// Lo storico vecchio non cambia: si scarica una volta e resta su Upstash (hist:<tf>:<SYM>) e in memoria,
// con un aggiornamento ogni 30 giorni per restare attaccato alle candele recenti di Bitunix.
// Azioni e materie prime: niente (per loro contano solo i dati Bitunix).

const TFS = {
  '1d': { binance: '1d', bybit: 'D', max: 2000, ms: 86400e3 },
  '1w': { binance: '1w', bybit: 'W', max: 800, ms: 7 * 86400e3 },
}
const REFRESH_MS = 30 * 86400e3
const RETRY_EMPTY_MS = 3 * 86400e3     // titolo non trovato altrove: riprovo dopo 3 giorni
const MAX_GAP = 0.04                    // se i prezzi non tornano (oltre il 4%) è un'altra moneta: scarto
const memo = new Map()

export const hasLongHistory = (symbol, tf) => tf in TFS && !isNonCrypto(symbol)

// Bitunix usa contratti "1000PEPE": su Binance/Bybit è PEPE, con prezzo diviso 1000
function source(symbol) {
  const m = symbol.match(/^(1000000|10000|1000)(.+)$/)
  return m ? { sym: m[2], mult: Number(m[1]) } : { sym: symbol, mult: 1 }
}

async function getJson(url) {
  const r = await fetch(url, { headers: { accept: 'application/json' } })
  if (!r.ok) throw Object.assign(new Error('HTTP ' + r.status), { status: r.status })
  return r.json()
}

// Binance spot: fino a 1000 candele per richiesta, all'indietro
async function fromBinance(sym, cfg) {
  let out = [], end = null
  while (out.length < cfg.max) {
    const q = new URLSearchParams({ symbol: sym, interval: cfg.binance, limit: '1000' })
    if (end) q.set('endTime', String(end))
    const rows = await getJson('https://api.binance.com/api/v3/klines?' + q)
    if (!Array.isArray(rows) || !rows.length) break
    const page = rows.map(k => [Number(k[0]), +k[1], +k[2], +k[3], +k[4], +k[5]])
    out = [...page.filter(b => !out.length || b[0] < out[0][0]), ...out]
    if (rows.length < 1000) break
    end = page[0][0] - 1
  }
  return out
}

// Bybit spot: fino a 1000 candele per richiesta, dalla più recente
async function fromBybit(sym, cfg) {
  let out = [], end = null
  while (out.length < cfg.max) {
    const q = new URLSearchParams({ category: 'spot', symbol: sym, interval: cfg.bybit, limit: '1000' })
    if (end) q.set('end', String(end))
    const j = await getJson('https://api.bybit.com/v5/market/kline?' + q)
    const list = j?.result?.list
    if (j?.retCode !== 0 || !Array.isArray(list) || !list.length) break
    const page = list.map(k => [Number(k[0]), +k[1], +k[2], +k[3], +k[4], +k[5]]).sort((a, b) => a[0] - b[0])
    out = [...page.filter(b => !out.length || b[0] < out[0][0]), ...out]
    if (list.length < 1000) break
    end = page[0][0] - 1
  }
  return out
}

async function download(symbol, tf) {
  const cfg = TFS[tf], { sym, mult } = source(symbol)
  // Entrambi, una volta ogni 30 giorni: tengo quello con lo storico che parte prima
  // (un titolo può essere arrivato su Binance dopo che su Bybit, o viceversa)
  const [bn, bb] = await Promise.all([fromBinance(sym, cfg).catch(() => []), fromBybit(sym, cfg).catch(() => [])])
  const pick = !bb.length || (bn.length && bn[0][0] <= bb[0][0]) ? ['binance', bn] : ['bybit', bb]
  let [src, rows] = pick
  if (mult !== 1) rows = rows.map(([t, o, h, l, c, v]) => [t, o * mult, h * mult, l * mult, c * mult, v / mult])
  return { at: Date.now(), src: rows.length ? src : null, rows: rows.slice(-cfg.max) }
}

async function stored(symbol, tf) {
  const key = `hist:${tf}:${symbol}`
  const now = Date.now()
  let h = memo.get(key)
  if (!h && hasStore()) { try { h = JSON.parse((await redis('GET', key)) || 'null') } catch { h = null } }
  const stale = !h || now - h.at > (h.rows?.length ? REFRESH_MS : RETRY_EMPTY_MS)
  if (stale) {
    const fresh = await download(symbol, tf).catch(() => null)
    if (fresh) {
      h = fresh
      if (hasStore()) redis('SET', key, JSON.stringify(h), 'EX', 60 * 86400).catch(() => null)
    }
  }
  if (h) memo.set(key, h)
  if (memo.size > 400) memo.delete(memo.keys().next().value)
  return h
}

// Candele Bitunix (in ordine) + quelle più vecchie dell'altro exchange, solo prima della prima di Bitunix.
// Controllo che sia lo stesso titolo: sui giorni in comune i prezzi devono coincidere (entro il 4%).
export async function withHistory(symbol, tf, bars) {
  if (!hasLongHistory(symbol, tf) || !bars?.length) return bars
  const h = await stored(symbol, tf).catch(() => null)
  if (!h?.rows?.length) return bars
  const cfg = TFS[tf]
  const byTime = new Map(h.rows.map(r => [r[0], r[4]]))
  const gaps = []
  for (const b of bars) {
    const c = byTime.get(b.t) ?? nearest(h.rows, b.t, cfg.ms / 2)
    if (c) gaps.push(Math.abs(c - b.c) / b.c)
  }
  if (gaps.length) {
    gaps.sort((a, b) => a - b)
    if (gaps[Math.floor(gaps.length / 2)] > MAX_GAP) return bars // prezzi diversi: non è lo stesso titolo
  }
  const first = bars[0].t
  const before = h.rows.filter(r => r[0] < first - cfg.ms / 2).map(([t, o, h2, l, c, v]) => ({ t, o, h: h2, l, c, v }))
  return [...before.slice(-(cfg.max - bars.length)), ...bars]
}

function nearest(rows, t, tol) {
  let lo = 0, hi = rows.length - 1
  while (lo < hi) { const m = (lo + hi) >> 1; if (rows[m][0] < t) lo = m + 1; else hi = m }
  for (const i of [lo - 1, lo]) if (rows[i] && Math.abs(rows[i][0] - t) <= tol) return rows[i][4]
  return null
}
