import { klinesBack, pricePrecision } from './_bitunix.js'
import { emaLine } from './_scan.js'
import { withHistory, historyBefore } from './_history.js'

// Quanto tempo la risposta resta in cache su Vercel, per timeframe (secondi).
// Così più utenti sullo stesso titolo non moltiplicano le richieste a Bitunix.
const CACHE = { '1m': 10, '3m': 20, '5m': 25, '15m': 50, '1h': 100, '4h': 240, '1d': 500, '1w': 1000 }
const ALLOWED = Object.keys(CACHE)

export default async function handler(req, res) {
  const { symbol = 'BTCUSDT', interval = '1h', limit = '300' } = req.query || {}
  if (!/^[A-Z0-9]{2,30}$/.test(symbol) || !ALLOWED.includes(interval)) {
    res.status(400).json({ error: 'Simbolo o timeframe non valido' })
    return
  }
  try {
    // Scorrendo a sinistra: candele più vecchie di end (Bitunix, poi lo storico salvato per le crypto 1d/1w).
    // Non cambiano più: la CDN le tiene a lungo.
    const end = Number(req.query?.end) || 0
    if (end > 0) {
      const n = Math.min(500, Number(limit) || 300)
      let older = await klinesBack(symbol, interval, n, end - 1)
      older = older.filter(b => b.t < end)
      if (older.length < n) {
        const first = older.length ? older[0].t : end
        older = [...(await historyBefore(symbol, interval, first - 1, n - older.length).catch(() => [])), ...older]
      }
      res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=86400')
      return res.status(200).json({ symbol, interval, bars: older, older: true })
    }
    // 1d e 1w delle crypto: tutto lo storico (le candele prima di Bitunix arrivano da Binance/Bybit, salvate sul server)
    const recent = await klinesBack(symbol, interval, Math.min(400, Number(limit) || 300))
    // 1w: tutto lo storico subito; 1d: le ultime ~600 candele, le altre arrivano scorrendo a sinistra
    const bars = await withHistory(symbol, interval, recent, interval === '1d' ? 600 : null).catch(() => recent)
    // EMA 200 (stessi valori del semaforo) e decimali del prezzo da Bitunix; se mancano, il grafico ne fa a meno
    const [line, precision] = await Promise.all([
      emaLine(symbol, interval, bars).catch(() => null),
      pricePrecision(symbol).catch(() => null),
    ])
    const sig = v => (v == null || !Number.isFinite(v) ? null : Number(v.toPrecision(8)))
    const s = CACHE[interval]
    res.setHeader('Cache-Control', `public, s-maxage=${s}, stale-while-revalidate=${s}`)
    res.status(200).json({ symbol, interval, bars, ema: line ? line.map(sig) : null, precision })
  } catch (e) {
    res.status(502).json({ error: e.message || 'Bitunix non risponde' })
  }
}
