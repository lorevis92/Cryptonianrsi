import { klines, topSymbols } from './_bitunix.js'
import { stochRsi, DEFAULTS } from '../src/lib/stochrsi.js'

// Scansione di un timeframe: per ogni titolo una sola richiesta a Bitunix (200 candele)
// e solo la coda di K e D nel risultato. La usano /api/scan e /api/snapshot.

export const TFS = ['1m', '3m', '5m', '15m', '1h', '4h', '1d']
// Ogni quanto si ricalcola un timeframe (secondi): i timeframe lenti cambiano poco,
// così ogni aggiornamento della fotografia rifà solo quelli scaduti.
export const TTL = { '1m': 60, '3m': 90, '5m': 120, '15m': 240, '1h': 480, '4h': 900, '1d': 1800 }
const TOP = 50
const TAIL = 4
const CONCURRENCY = 4 // insieme al limite di _bitunix.js resta sotto le 8 richieste/secondo

const round = v => (v == null ? null : Math.round(v * 10) / 10)

export function readParams(q = {}) {
  const p = { ...DEFAULTS }
  for (const key of ['rsi', 'stoch', 'k', 'd']) {
    const n = Number(q[key])
    if (Number.isInteger(n) && n >= 1 && n <= 100) p[key] = n
  }
  return p
}

async function pool(items, n, fn) {
  const out = []
  let next = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i]).catch(() => null)
    }
  }))
  return out
}

async function run(tf, symbols, p) {
  const list = symbols || await topSymbols(TOP)
  const rows = await pool(list, CONCURRENCY, async s => {
    const bars = await klines(s, tf, 200)
    if (bars.length < p.rsi + p.stoch + p.k + p.d) return null
    const { k, d } = stochRsi(bars, p)
    return { s, k: k.slice(-TAIL).map(round), d: d.slice(-TAIL).map(round), c: bars[bars.length - 1].c }
  })
  return { tf, at: Date.now(), symbols: list, rows: rows.filter(Boolean) }
}

// Cache in memoria per istanza: richieste uguali nello stesso momento ne fanno una sola a Bitunix,
// e un risultato resta valido per TTL[tf] secondi.
const memo = new Map()

export function scan(tf, symbols = null, p = DEFAULTS) {
  const key = JSON.stringify([tf, symbols, p.rsi, p.stoch, p.k, p.d])
  const hit = memo.get(key)
  if (hit && Date.now() - hit.at < TTL[tf] * 1000) return hit.job
  if (memo.size > 80) memo.clear()
  const job = run(tf, symbols, p)
  // Finché il nuovo calcolo non è pronto, chi chiede riceve ancora il precedente (se c'è).
  const entry = { at: Date.now(), job, done: null }
  memo.set(key, entry)
  job.then(d => { entry.done = d }, () => { if (memo.get(key) === entry) memo.delete(key) })
  return hit?.done ? Promise.race([job, Promise.resolve(hit.done)]) : job
}
