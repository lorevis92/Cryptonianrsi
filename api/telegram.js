import { redis, hasStore } from './_store.js'
import { hasBot, tg, send, webhookSecret } from './_telegram.js'
import { db, hasSupabase } from './_supabase.js'

// Webhook del bot Telegram.
// - Quando l'utente preme Avvia dal link personale, Telegram manda "/start <codice>":
//   il codice porta all'account e la chat viene collegata (una chat ↔ un account).
// - /stop scollega.
// Attivazione (una volta, dopo aver messo TELEGRAM_BOT_TOKEN e CRON_SECRET su Vercel):
//   apri https://<tuo-progetto>.vercel.app/api/telegram?setup=<CRON_SECRET>

export default async function handler(req, res) {
  if (!hasBot() || !hasStore() || !hasSupabase()) return res.status(503).json({ error: 'Notifiche non configurate' })

  if (req.method === 'GET') {
    if (!process.env.CRON_SECRET || req.query?.setup !== process.env.CRON_SECRET) return res.status(403).json({ error: 'Chiave mancante' })
    const host = req.headers?.['x-forwarded-host'] || req.headers?.host
    const url = `https://${host}/api/telegram`
    await tg('setWebhook', { url, secret_token: webhookSecret(), allowed_updates: ['message'], drop_pending_updates: true })
    await tg('setMyCommands', { commands: [{ command: 'stop', description: 'Scollega e smetti di ricevere avvisi' }] }).catch(() => null)
    return res.status(200).json({ ok: true, webhook: url })
  }

  if (req.headers?.['x-telegram-bot-api-secret-token'] !== webhookSecret()) return res.status(403).json({ error: 'Non autorizzato' })
  const msg = req.body?.message
  // A Telegram si risponde sempre 200, altrimenti ripete il messaggio
  if (!msg?.chat?.id || typeof msg.text !== 'string') return res.status(200).json({ ok: true })
  const chat = msg.chat.id
  const [cmd, code] = msg.text.trim().split(/\s+/)
  const subs = () => db().from('alert_subscriptions')
  try {
    if (cmd === '/start' && code) {
      const uid = await redis('GET', 'link:' + code)
      if (!uid) {
        await send(chat, "Questo link è scaduto. Torna nell'app, pagina <b>Notifiche</b>, e premi di nuovo <b>Collega Telegram</b>.")
      } else {
        await redis('DEL', 'link:' + code)
        const name = msg.from?.username ? '@' + msg.from.username : (msg.from?.first_name || '').slice(0, 60) || null
        // Una chat appartiene a un solo account: la tolgo da altri eventuali account
        await subs().update({ telegram_chat_id: null, telegram_name: null }).eq('telegram_chat_id', chat).neq('user_id', uid)
        const { data, error } = await subs().update({ telegram_chat_id: chat, telegram_name: name }).eq('user_id', uid).select('symbols').maybeSingle()
        if (error || !data) throw new Error(error?.message || 'Account non trovato')
        const n = Array.isArray(data.symbols) ? data.symbols.length : 0
        await send(chat, `<b>Collegato a Cryptonian RSI.</b>\nRiceverai qui gli avvisi ${n ? `per ${n === 1 ? '1 titolo' : `${n} titoli`}` : 'dei titoli che sceglierai nella pagina Notifiche'}.\nPer smettere: /stop`)
      }
    } else if (cmd === '/start') {
      await send(chat, 'Per ricevere gli avvisi apri Cryptonian RSI, pagina <b>Notifiche</b>, e premi <b>Collega Telegram</b>.')
    } else if (cmd === '/stop') {
      await subs().update({ telegram_chat_id: null, telegram_name: null }).eq('telegram_chat_id', chat)
      await send(chat, "Scollegato. Non riceverai più avvisi. Per ricollegarti usa la pagina <b>Notifiche</b> dell'app.")
    } else {
      await send(chat, 'Questo bot manda solo gli avvisi di Cryptonian RSI. Per smettere: /stop')
    }
  } catch (e) {
    console.error('telegram', e.message)
  }
  return res.status(200).json({ ok: true })
}
