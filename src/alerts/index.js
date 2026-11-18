import { evaluate } from './rules.js'
import { send } from './channels.js'

// Punto unico da chiamare quando cambiano gli stati dei timeframe.
// Spento finché l'algoritmo non è pronto (ENABLED = false).
export const ENABLED = false
const sent = new Set()

export async function runAlerts(symbol, states, prefs) {
  if (!ENABLED || !prefs?.channels?.length) return
  for (const ev of evaluate(symbol, states)) {
    if (sent.has(ev.id)) continue
    sent.add(ev.id)
    for (const ch of prefs.channels) await send(ch, ev, prefs.to?.[ch])
  }
}
