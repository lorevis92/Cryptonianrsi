import { tradingPairs, volumes } from './_bitunix.js'

// Tutte le coppie di Bitunix con il volume delle ultime 24 ore (USDT), dalla più scambiata.
// Cache di 5 minuti su Vercel: il volume si aggiorna senza pesare su Bitunix.
export default async function handler(req, res) {
  try {
    const [pairs, vol] = await Promise.all([tradingPairs(), volumes().catch(() => new Map())])
    const out = pairs.map(p => ({ ...p, vol: vol.get(p.symbol) || 0 })).sort((a, b) => b.vol - a.vol)
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600')
    res.status(200).json({ pairs: out, at: Date.now() })
  } catch (e) {
    res.status(502).json({ error: e.message || 'Bitunix non risponde' })
  }
}
