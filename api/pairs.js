import { tradingPairs } from './_bitunix.js'

export default async function handler(req, res) {
  try {
    const pairs = await tradingPairs()
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
    res.status(200).json({ pairs })
  } catch (e) {
    res.status(502).json({ error: e.message || 'Bitunix non risponde' })
  }
}
