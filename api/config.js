import { publicConfig } from './_supabase.js'

// Configurazione pubblica dell'app (solo URL e chiave anon/publishable di Supabase, protette dalla RLS).
export default function handler(req, res) {
  const supabase = publicConfig()
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600')
  res.status(200).json({ supabase })
}
