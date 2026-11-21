import { createClient } from '@supabase/supabase-js'

// Supabase lato server. Le variabili arrivano dall'integrazione del Marketplace di Vercel.
// La chiave service role (o secret key) supera la RLS: resta SOLO qui, nelle funzioni del server.
// .trim(): una variabile incollata con uno spazio o un TAB in fondo non deve rompere niente
const env = (...names) => names.map(n => (process.env[n] || '').trim()).find(Boolean) || ''
const URL_ = env('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL')
const ANON = env('SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
const SERVICE = env('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY')

export const hasSupabase = () => !!(URL_ && ANON && SERVICE)

// Configurazione pubblica per il browser: URL e chiave anon/publishable (pubbliche per definizione,
// i dati sono protetti dalla RLS). La service role non esce mai da qui.
export const publicConfig = () => (URL_ && ANON ? { url: URL_, anonKey: ANON } : null)

let admin = null
export function db() {
  if (!hasSupabase()) throw new Error('Supabase non configurato')
  admin ||= createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })
  return admin
}

// Utente della richiesta, dal token di accesso (Authorization: Bearer <jwt>) verificato da Supabase.
export async function userFrom(req) {
  const h = req.headers?.authorization || ''
  const token = h.startsWith('Bearer ') ? h.slice(7) : ''
  if (!token || token.length > 4096) return null
  const { data, error } = await db().auth.getUser(token)
  return error ? null : data.user
}

// Tutte le righe, a pagine da 1000 (limite di Supabase per richiesta)
export async function selectAll(build) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999)
    if (error) throw new Error(error.message)
    out.push(...data)
    if (data.length < 1000) return out
  }
}
