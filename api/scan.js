import { scan, readParams, TTL } from './_scan.js'

// Scansione di un timeframe su richiesta:
//   /api/scan?tf=1h                      i ~50 titoli più scambiati
//   /api/scan?tf=1h&symbols=XAUUSDT,...  titoli scelti (preferiti fuori dai primi 50, dettaglio)
// La mappa normalmente usa /api/snapshot; questa serve per i titoli in più
// e per chi ha cambiato i parametri dell'indicatore.
export default async function handler(req, res) {
  const q = req.query || {}
  const tf = q.tf
  if (!TTL[tf]) { res.status(400).json({ error: 'Timeframe non valido' }); return }
  let symbols = null
  if (q.symbols) {
    symbols = [...new Set(String(q.symbols).split(','))].filter(s => /^[A-Z0-9]{2,30}$/.test(s)).slice(0, 30)
    if (!symbols.length) { res.status(400).json({ error: 'Titoli non validi' }); return }
  }
  try {
    const data = await scan(tf, symbols, readParams(q))
    const ttl = TTL[tf]
    res.setHeader('Cache-Control', `public, max-age=0, s-maxage=${Math.round(ttl / 2)}, stale-while-revalidate=${ttl * 4}`)
    res.status(200).json(data)
  } catch (e) {
    res.status(502).json({ error: e.message || 'Bitunix non risponde' })
  }
}
