// PREDISPOSTO — canali di invio degli avvisi.
// push: notifiche del browser/telefono (Notification API, poi Web Push con service worker)
// telegram, whatsapp: passano dal server (/api/alerts/send), che oggi risponde 501.

export const CHANNELS = [
  { id: 'push', name: 'Notifica sul telefono' },
  { id: 'telegram', name: 'Telegram' },
  { id: 'whatsapp', name: 'WhatsApp' },
]

export async function send(channel, event, to) {
  if (channel === 'push') {
    if (!('Notification' in window)) return { ok: false, reason: 'unsupported' }
    if (Notification.permission !== 'granted') return { ok: false, reason: 'permission' }
    new Notification(event.title, { body: event.body, icon: '/favicon.svg' })
    return { ok: true }
  }
  const r = await fetch('/api/alerts/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ channel, to, text: `${event.title}\n${event.body}` }),
  })
  return { ok: r.ok, status: r.status }
}
