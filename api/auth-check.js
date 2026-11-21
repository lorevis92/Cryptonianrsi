import { redis, hasStore } from './_store.js'
import { db, hasSupabase } from './_supabase.js'

// Esiste un account con questa email? Serve ai messaggi chiari del login e di "Password dimenticata".
//   POST { email } → { exists, password, google }
// Limite: 10 richieste ogni 15 minuti per indirizzo IP (Upstash), così non si possono provare in massa le email.
const LIMIT = 10
const WINDOW_S = 15 * 60

function clientIp(req) {
  const h = req.headers || {}
  const fwd = String(h['x-vercel-forwarded-for'] || h['x-forwarded-for'] || h['x-real-ip'] || '').split(',')[0].trim()
  return fwd || req.socket?.remoteAddress || 'sconosciuto'
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non previsto' })
  if (!hasSupabase() || !hasStore()) return res.status(503).json({ error: 'Verifica non disponibile' })

  const email = String(req.body?.email || '').trim().toLowerCase()
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return res.status(400).json({ error: "Controlla l'indirizzo email." })

  try {
    // Limite per IP: contatore che scade dopo 15 minuti dalla prima richiesta
    const key = 'rl:auth-check:' + clientIp(req)
    const n = await redis('INCR', key)
    if (n === 1) await redis('EXPIRE', key, WINDOW_S)
    if (n > LIMIT) {
      res.setHeader('Retry-After', String(WINDOW_S))
      return res.status(429).json({ error: 'Troppi tentativi: riprova tra qualche minuto.' })
    }

    const { data, error } = await db().rpc('auth_email_status', { p_email: email })
    if (error) throw new Error(error.message)
    const row = Array.isArray(data) ? data[0] : data
    if (!row?.found) return res.status(200).json({ exists: false, password: false, google: false })
    return res.status(200).json({ exists: true, password: !!row.has_password, google: (row.providers || []).includes('google') })
  } catch (e) {
    return res.status(502).json({ error: e.message })
  }
}
