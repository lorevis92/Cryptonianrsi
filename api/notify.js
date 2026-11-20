import { randomBytes } from 'node:crypto'
import { redis, hasStore } from './_store.js'
import { hasBot, botName, send } from './_telegram.js'
import { db, hasSupabase, userFrom } from './_supabase.js'

// Collegamento Telegram dell'account (solo le operazioni che l'utente non può fare da sé con la RLS).
// Titoli seguiti e regola l'app li scrive direttamente su Supabase (tabella alert_subscriptions, solo le proprie righe).
//   GET                         { configured, bot }
//   POST { action: 'link' }     link personale al bot: t.me/<bot>?start=<codice> (vale 15 minuti)
//   POST { action: 'unlink' }   scollega Telegram
// Autenticazione: Authorization: Bearer <token di accesso Supabase>.
const LINK_TTL = 15 * 60

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (!hasStore() || !hasBot() || !hasSupabase()) return res.status(200).json({ configured: false })
  try {
    const user = await userFrom(req)
    if (!user) return res.status(401).json({ error: 'Accedi per usare le notifiche' })
    const bot = await botName().catch(() => null)

    if (req.method === 'GET') return res.status(200).json({ configured: true, bot })
    if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non previsto' })

    const { action } = req.body || {}
    if (action === 'link') {
      if (!bot) throw new Error('Il bot Telegram non risponde')
      const code = randomBytes(16).toString('base64url')
      await redis('SET', 'link:' + code, user.id, 'EX', LINK_TTL)
      return res.status(200).json({ url: `https://t.me/${bot}?start=${code}`, expires: Date.now() + LINK_TTL * 1000 })
    }
    if (action === 'unlink') {
      const { data } = await db().from('alert_subscriptions').select('telegram_chat_id').eq('user_id', user.id).maybeSingle()
      const chat = data?.telegram_chat_id
      const { error } = await db().from('alert_subscriptions').update({ telegram_chat_id: null, telegram_name: null }).eq('user_id', user.id)
      if (error) throw new Error(error.message)
      if (chat) await send(chat, 'Telegram scollegato da Cryptonian RSI. Non riceverai più avvisi qui.').catch(() => null)
      return res.status(200).json({ ok: true })
    }
    return res.status(400).json({ error: 'Azione non prevista' })
  } catch (e) {
    return res.status(502).json({ error: e.message })
  }
}
