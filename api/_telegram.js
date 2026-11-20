import { createHash } from 'node:crypto'

// Bot Telegram. Il token sta nella variabile d'ambiente TELEGRAM_BOT_TOKEN (Vercel > Settings > Environment Variables).
const TOKEN = process.env.TELEGRAM_BOT_TOKEN

export const hasBot = () => !!TOKEN

export async function tg(method, body = {}) {
  if (!TOKEN) throw new Error('TELEGRAM_BOT_TOKEN mancante')
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  const j = await r.json().catch(() => ({}))
  if (!j.ok) {
    const e = new Error(j.description || `Telegram ${r.status}`)
    e.code = j.error_code || r.status
    e.retryAfter = j.parameters?.retry_after || 0 // 429: secondi da aspettare
    throw e
  }
  return j.result
}

export const send = (chat, html) => tg('sendMessage', { chat_id: chat, text: html, parse_mode: 'HTML', link_preview_options: { is_disabled: true } })

// Nome del bot (per il link t.me/...), letto dal token: nessuna variabile in più.
let me = null
export async function botName() {
  me ||= tg('getMe').then(r => r.username).catch(e => { me = null; throw e })
  return me
}

// Segreto del webhook ricavato dal token: Telegram lo rimanda in ogni chiamata e così sappiamo che è lui.
export const webhookSecret = () => createHash('sha256').update('crsi-webhook:' + TOKEN).digest('hex').slice(0, 48)

export const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
