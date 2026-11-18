// Piccolo wrapper su localStorage: nel prototipo non c'è login, tutto resta nel browser.
export function load(key, fallback) {
  try {
    const v = localStorage.getItem('crsi:' + key)
    return v == null ? fallback : JSON.parse(v)
  } catch { return fallback }
}
export function save(key, value) {
  try { localStorage.setItem('crsi:' + key, JSON.stringify(value)) } catch { /* storage pieno o bloccato */ }
}
