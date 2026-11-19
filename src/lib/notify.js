import { load, save } from './storage.js'

// Codice segreto del dispositivo per le notifiche (niente login nel prototipo).
// Chi lo ha può cambiare le notifiche di questo dispositivo: resta solo nel browser.
export function deviceId() {
  let id = load('notifyId', null)
  if (!/^[a-f0-9]{32}$/.test(id || '')) {
    const b = new Uint8Array(16)
    crypto.getRandomValues(b)
    id = [...b].map(x => x.toString(16).padStart(2, '0')).join('')
    save('notifyId', id)
  }
  return id
}

// GET senza body, POST con { action, ... }
export async function notifyApi(body) {
  const r = await fetch('/api/notify', {
    method: body ? 'POST' : 'GET',
    headers: { 'x-crsi-id': deviceId(), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || 'Server non raggiungibile')
  return j
}
