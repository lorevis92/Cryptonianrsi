// ─────────────────────────────────────────────────────────────────────────────
// Regole delle notifiche Telegram. È l'unico file da toccare per cambiarle:
// lo usano sia l'app (pagina Notifiche) sia il controllo sul server (api/alerts/check.js).
// ─────────────────────────────────────────────────────────────────────────────

// Regola preimpostata: 3m e 5m entrambi sotto 20 (ipervenduto) o entrambi sopra 80 (ipercomprato).
// L'utente può cambiare timeframe e soglie dalla pagina Notifiche.
export const DEFAULT_RULE = { tfs: ['3m', '5m'], lower: 20, upper: 80 }

// Avviso di avvicinamento (si attiva per titolo): tutti sotto 30 o tutti sopra 70.
export const APPROACH = { lower: 30, upper: 70 }

// Anti-spam: dopo un avviso, il successivo arriva solo quando il titolo è uscito davvero dalla zona,
// cioè almeno un timeframe è tornato indietro di REARM_GAP punti oltre la soglia. Così un K che balla
// attorno a 20 non manda un messaggio a ogni minuto.
export const REARM_GAP = 5

// Limiti per utente
export const MAX_SYMBOLS = 20
export const MAX_RULE_TFS = 4
export const RULE_LIMITS = { lower: [1, 45], upper: [55, 99] }

// ─────────────────────────────────────────────────────────────────────────────

const TFS = ['1m', '3m', '5m', '15m', '1h', '4h', '1d', '1w']

export function cleanRule(r) {
  const tfs = TFS.filter(tf => r?.tfs?.includes(tf)).slice(0, MAX_RULE_TFS)
  const num = (v, [lo, hi], def) => (v !== '' && v != null && Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Math.round(Number(v)))) : def)
  return {
    tfs: tfs.length ? tfs : DEFAULT_RULE.tfs,
    lower: num(r?.lower, RULE_LIMITS.lower, DEFAULT_RULE.lower),
    upper: num(r?.upper, RULE_LIMITS.upper, DEFAULT_RULE.upper),
  }
}

export const isDefaultRule = r => JSON.stringify(cleanRule(r)) === JSON.stringify(DEFAULT_RULE)

// values: { '3m': K, '5m': K } · near: avviso di avvicinamento attivo · mem: memoria del titolo (null la prima volta)
// Restituisce { events: [{ kind: 'zone' | 'near', side: 'oversold' | 'overbought' }], mem }
export function check(values, rule, near, mem) {
  const ks = rule.tfs.map(tf => values[tf])
  if (ks.some(k => k == null)) return { events: [], mem }
  const sides = {
    oversold: { zone: rule.lower, approach: APPROACH.lower, beyond: (k, t) => k <= t, gap: REARM_GAP },
    overbought: { zone: rule.upper, approach: APPROACH.upper, beyond: (k, t) => k >= t, gap: -REARM_GAP },
  }
  const first = !mem
  const next = {}
  const events = []
  for (const [side, s] of Object.entries(sides)) {
    const all = t => ks.every(k => s.beyond(k, t))
    // L'avvicinamento ha senso solo se la sua soglia viene prima di quella della zona
    const nearOn = near && (side === 'oversold' ? s.approach > s.zone : s.approach < s.zone)
    const inZone = all(s.zone)
    const inNear = nearOn && all(s.approach)
    const m = { z: false, n: false, ...(mem?.[side] || {}) }
    if (first) { m.z = inZone; m.n = inNear || inZone } // chi inizia a seguire un titolo già in zona non riceve subito l'avviso
    else if (inZone && !m.z) { events.push({ kind: 'zone', side }); m.z = true; m.n = true }
    else if (inNear && !inZone && !m.n) { events.push({ kind: 'near', side }); m.n = true }
    // Riarmo: solo quando il titolo è uscito davvero (soglia + margine)
    if (!all(s.zone + s.gap)) m.z = false
    if (!all((nearOn ? s.approach : s.zone) + s.gap)) m.n = false
    next[side] = m
  }
  return { events, mem: next }
}
