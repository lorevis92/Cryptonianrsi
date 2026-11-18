import { klines, topSymbols } from './_bitunix.js'
import { stochRsi, DEFAULTS } from '../src/lib/stochrsi.js'

// Scansione di un timeframe per la mappa a bolle: per ogni titolo una sola richiesta
// (200 candele, il massimo di Bitunix per richiesta) e solo la coda di K e D nella risposta.
//   /api/scan?tf=1h                      i ~50 titoli più scambiati
//   /api/scan?tf=1h&symbols=XAUUSDT,...  titoli in più (i preferiti fuori dai primi 50)

// Cache su Vercel (secondi), simile alle card: 1m breve, 1d lungo.
const CACHE = { '1m': 20, '3m': 45, '5m': 60, '15m': 120, '1h': 240, '4h': 600, '1d': 1800 }
const TOP = 50
const TAIL = 4
const CONCURRENCY = 4 // insieme al limite di _bitunix.js resta sotto le 8 richieste/secondo

// Cache in memoria per istanza: più richieste uguali nello stesso momento ne fanno una sola a Bitunix.
const memo = new Map()

const round = v => (v == null ? null : Math.round(v * 10) / 10)

function readParams(q) {
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

async function scan(tf, symbols, p) {
  const list = symbols || await topSymbols(TOP)
  const rows = await pool(list, CONCURRENCY, async s => {
    const bars = await klines(s, tf, 200)
    if (bars.length < p.rsi + p.stoch + p.k + p.d) return null
    const { k, d } = stochRsi(bars, p)
    return { s, k: k.slice(-TAIL).map(round), d: d.slice(-TAIL).map(round), c: bars[bars.length - 1].c }
  })
  return { tf, at: Date.now(), symbols: list, rows: rows.filter(Boolean) }
}

export default async function handler(req, res) {
  const q = req.query || {}
  const tf = q.tf
  if (!CACHE[tf]) { res.status(400).json({ error: 'Timeframe non valido' }); return }

  let symbols = null
  if (q.symbols) {
    symbols = [...new Set(String(q.symbols).split(','))].filter(s => /^[A-Z0-9]{2,30}$/.test(s)).slice(0, 30)
    if (!symbols.length) { res.status(400).json({ error: 'Titoli non validi' }); return }
  }
  const p = readParams(q)
  const ttl = CACHE[tf]
  const key = JSON.stringify([tf, symbols, p.rsi, p.stoch, p.k, p.d])

  try {
    let hit = memo.get(key)
    if (!hit || Date.now() - hit.at > ttl * 1000) {
      if (memo.size > 60) memo.clear()
      hit = { at: Date.now(), job: scan(tf, symbols, p) }
      memo.set(key, hit)
      hit.job.catch(() => memo.delete(key))
    }
    const data = await hit.job
    res.setHeader('Cache-Control', `public, s-maxage=${ttl}, stale-while-revalidate=${ttl * 4}`)
    res.status(200).json(data)
  } catch (e) {
    res.status(502).json({ error: e.message || 'Bitunix non risponde' })
  }
}
