import { redis, pipeline, hasStore, userKey, parse } from './_store.js'
import { hasBot, tg, send, webhookSecret } from './_telegram.js'

// Webhook del bot Telegram.
// - Quando l'utente preme Avvia dal link personale, Telegram manda "/start <codice>":
//   il codice porta al dispositivo e la chat viene collegata.
// - /stop scollega.
// Attivazione (una volta, dopo aver messo TELEGRAM_BOT_TOKEN e CRON_SECRET su Vercel):
//   apri https://<tuo-progetto>.vercel.app/api/telegram?setup=<CRON_SECRET>

const unlinked = u => JSON.stringify({ ...u, chat: null, name: null, at: Date.now() })

export default async function handler(req, res) {
  if (!hasBot() || !hasStore()) return res.status(503).json({ error: 'Notifiche non configurate' })

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
  try {
    if (cmd === '/start' && code) {
      const id = await redis('GET', 'link:' + code)
      if (!id) {
        await send(chat, "Questo link è scaduto. Torna nell'app, pagina <b>Notifiche</b>, e premi di nuovo <b>Collega Telegram</b>.")
      } else {
        const key = userKey(id)
        const u = parse(await redis('GET', key)) || { symbols: [] }
        // Se questa chat era collegata a un altro dispositivo, lo scollego
        const prev = await redis('GET', 'chat:' + chat)
        if (prev && prev !== id) {
          const p = parse(await redis('GET', userKey(prev)))
          if (p) await pipeline([['SREM', 'users', prev], ['SET', userKey(prev), unlinked(p)]])
        }
        if (u.chat && u.chat !== chat) await redis('DEL', 'chat:' + u.chat)
        const name = msg.from?.username ? '@' + msg.from.username : msg.from?.first_name || null
        await pipeline([
          ['SET', key, JSON.stringify({ ...u, chat, name, at: Date.now() })],
          ['SET', 'chat:' + chat, id], ['SADD', 'users', id], ['DEL', 'link:' + code],
        ])
        const n = u.symbols?.length || 0
        await send(chat, `<b>Collegato a Cryptonian RSI.</b>\nRiceverai qui gli avvisi ${n ? `per ${n === 1 ? '1 titolo' : `${n} titoli`}` : 'dei titoli che sceglierai nella pagina Notifiche'}.\nPer smettere: /stop`)
      }
    } else if (cmd === '/start') {
      await send(chat, 'Per ricevere gli avvisi apri Cryptonian RSI, pagina <b>Notifiche</b>, e premi <b>Collega Telegram</b>.')
    } else if (cmd === '/stop') {
      const id = await redis('GET', 'chat:' + chat)
      if (id) {
        const u = parse(await redis('GET', userKey(id)))
        await pipeline([['SREM', 'users', id], ['DEL', 'chat:' + chat], ...(u ? [['SET', userKey(id), unlinked(u)]] : [])])
      }
      await send(chat, "Scollegato. Non riceverai più avvisi. Per ricollegarti usa la pagina <b>Notifiche</b> dell'app.")
    } else {
      await send(chat, 'Questo bot manda solo gli avvisi di Cryptonian RSI. Per smettere: /stop')
    }
  } catch (e) {
    console.error('telegram', e)
  }
  return res.status(200).json({ ok: true })
}
