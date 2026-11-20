// Piccolo wrapper su localStorage (prefisso crsi:). È anche la copia locale delle impostazioni:
// con l'account, quelle sincronizzate (preferiti, calcolatore, indicatore) vanno anche su Supabase (vedi account.jsx).
const listeners = new Set()

export function load(key, fallback) {
  try {
    const v = localStorage.getItem('crsi:' + key)
    return v == null ? fallback : JSON.parse(v)
  } catch { return fallback }
}
export function save(key, value) {
  try { localStorage.setItem('crsi:' + key, JSON.stringify(value)) } catch { /* storage pieno o bloccato */ }
  listeners.forEach(fn => fn(key, value))
}
export function remove(key) {
  try { localStorage.removeItem('crsi:' + key) } catch { /* niente */ }
}

// Chi vuole sapere quando cambia un valore (la sincronizzazione con l'account)
export function onSave(fn) { listeners.add(fn); return () => listeners.delete(fn) }

// Valori arrivati dall'account: li scrivo in locale senza rimandarli indietro e avviso i componenti
export function applyRemote(values) {
  for (const [key, value] of Object.entries(values)) {
    try { localStorage.setItem('crsi:' + key, JSON.stringify(value)) } catch { /* niente */ }
  }
  window.dispatchEvent(new CustomEvent('crsi:remote', { detail: Object.keys(values) }))
}
export function onRemote(keys, fn) {
  const h = e => { if (e.detail.some(k => keys.includes(k))) fn() }
  window.addEventListener('crsi:remote', h)
  return () => window.removeEventListener('crsi:remote', h)
}
