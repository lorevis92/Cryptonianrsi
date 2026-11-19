import { klinesBack, pricePrecision } from './_bitunix.js'
import { emaLine } from './_scan.js'

// Quanto tempo la risposta resta in cache su Vercel, per timeframe (secondi).
// Così più utenti sullo stesso titolo non moltiplicano le richieste a Bitunix.
const CACHE = { '1m': 10, '3m': 20, '5m': 25, '15m': 50, '1h': 100, '4h': 240, '1d': 500 }
const ALLOWED = Object.keys(CACHE)

export default async function handler(req, res) {
  const { symbol = 'BTCUSDT', interval = '1h', limit = '300' } = req.query || {}
  if (!/^[A-Z0-9]{2,30}$/.test(symbol) || !ALLOWED.includes(interval)) {
    res.status(400).json({ error: 'Simbolo o timeframe non valido' })
    return
  }
  try {
    const bars = await klinesBack(symbol, interval, Math.min(400, Number(limit) || 300))
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
