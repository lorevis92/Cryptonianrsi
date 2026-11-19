import { scan, TFS } from './_scan.js'

// Fotografia unica della mappa: Stochastic RSI dei ~50 titoli più scambiati su tutti e 7 i timeframe,
// già calcolato sul server. L'app scarica solo questa (circa 25 KB) invece di chiamare Bitunix.
//
// Come resta istantanea e aggiornata, senza database:
// - la CDN di Vercel la tiene in cache 60 secondi; dopo, continua a servire subito la copia
//   vecchia (fino a un giorno) mentre in sottofondo la funzione ne prepara una nuova;
// - la funzione ricalcola solo i timeframe scaduti (1m ogni minuto, 1d ogni 30 minuti),
//   rispettando il limite di Bitunix;
// - un job di GitHub Actions la richiama ogni 5 minuti, così è calda anche senza visitatori;
// - l'app salva l'ultima fotografia sul dispositivo e la mostra subito all'apertura.
const round = v => Math.round(v * 1e6) / 1e6

export default async function handler(req, res) {
  try {
    const parts = await Promise.all(TFS.map(tf => scan(tf).catch(() => null)))
    const tfs = {}
    let top = []
    for (const part of parts) {
      if (!part) continue
      const rows = {}
      for (const r of part.rows) rows[r.s] = { k: r.k, d: r.d, c: round(r.c), t: r.t }
      tfs[part.tf] = { at: part.at, rows }
      if (part.tf === '1m' || !top.length) top = part.symbols
    }
    if (!Object.keys(tfs).length) throw new Error('Bitunix non risponde')
    const at = Math.max(...Object.values(tfs).map(t => t.at))
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=86400')
    res.status(200).json({ v: 1, at, top, tfs })
  } catch (e) {
    res.status(502).json({ error: e.message || 'Bitunix non risponde' })
  }
}
