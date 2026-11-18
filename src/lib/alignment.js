// ─────────────────────────────────────────────────────────────────────────────
// Pesi e regole della mappa a bolle. È l'unico file da toccare per adattarli
// alle indicazioni del mentore.
// ─────────────────────────────────────────────────────────────────────────────
import { readTail } from './stochrsi.js'

// Quanto conta ogni timeframe nel punteggio di allineamento.
export const WEIGHTS = { '1m': 1, '3m': 1.5, '5m': 2, '15m': 3, '1h': 4, '4h': 5, '1d': 6 }

// Spessore degli anelli nella bolla (proporzioni). 1m è il disco al centro,
// 1d l'anello più esterno: gli esterni sono più spessi perché contano di più.
export const RING_SIZE = { '1m': 1.6, '3m': 1, '5m': 1.1, '15m': 1.2, '1h': 1.35, '4h': 1.5, '1d': 1.7 }

// Il punteggio misura soprattutto QUANTI timeframe sono nella stessa zona (pesati),
// con un piccolo bonus per quanto sono estremi. Scala assoluta: non dipende dagli altri titoli.
// 0.85 = un timeframe appena entrato in zona vale l'85% del suo peso; il 15% che manca
// arriva man mano che K va verso 0 (ipervenduto) o 100 (ipercomprato).
// Così: tutti e 7 nella stessa zona = da 85 a 100.
export const IN_ZONE_BASE = 0.85

// Quanto toglie un timeframe nella zona opposta (0 = niente, 1 = annulla il suo peso).
export const OPPOSITE_PENALTY = 0.5

// Timeframe "grandi" su cui l'incrocio K/D dentro la zona è il segnale d'entrata.
export const SIGNAL_TIMEFRAMES = ['1h', '4h', '1d']

// Incrocio valido se avvenuto al massimo così tante candele fa (0 = candela attuale).
export const SIGNAL_MAX_AGO = 1

// ─────────────────────────────────────────────────────────────────────────────

const TOTAL = Object.values(WEIGHTS).reduce((a, b) => a + b, 0)

// tails: { '1m': { k: [...], d: [...] }, ... } per un titolo (i timeframe mancanti sono ignorati).
// Restituisce: per ogni timeframe lo stato, il punteggio 0–1, la zona dominante e il segnale.
export function alignment(tails, params) {
  const states = {}
  let os = 0, ob = 0
  for (const tf of Object.keys(WEIGHTS)) {
    const t = tails?.[tf]
    if (!t) continue
    const s = readTail(t.k, t.d, params)
    states[tf] = s
    const v = WEIGHTS[tf] * (IN_ZONE_BASE + (1 - IN_ZONE_BASE) * s.intensity)
    if (s.zone === 'oversold') os += v
    if (s.zone === 'overbought') ob += v
  }
  const side = os === 0 && ob === 0 ? 'neutral' : os >= ob ? 'oversold' : 'overbought'
  const main = side === 'oversold' ? os : ob
  const other = side === 'oversold' ? ob : os
  const score = side === 'neutral' ? 0 : Math.max(0, Math.min(1, (main - OPPOSITE_PENALTY * other) / TOTAL))

  // Segnale d'entrata: K incrocia D dentro la zona, su un timeframe grande, nella direzione giusta.
  let signal = null
  for (const tf of [...SIGNAL_TIMEFRAMES].reverse()) {
    const c = states[tf]?.cross
    if (c?.inZone && c.ago <= SIGNAL_MAX_AGO) { signal = { tf, dir: c.dir }; break }
  }
  return { states, score, side, signal, loaded: Object.keys(states).length }
}

// Valore di un anello da -1 a 1: positivo ciano (ipervenduto), negativo rosa (ipercomprato), 0 neutro.
// Anche al limite della zona il colore si vede; più K è estremo, più è pieno.
export function ringValue(s) {
  if (!s || s.zone === 'neutral') return 0
  const v = 0.22 + 0.78 * s.intensity
  return s.zone === 'oversold' ? v : -v
}
