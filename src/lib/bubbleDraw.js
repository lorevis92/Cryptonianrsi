import { RING_SIZE, ringValue } from './alignment.js'

// Disegno di una bolla, unico per la mappa e per il dettaglio: così le due viste restano identiche.
// Nodo: { x, y, r, label, rc: { tf: -1…1 }, rt (obiettivo), g (alone 0–1), tg, gs (lato), sigA, sig, pulseAt, hlA, hl }

export const OUTER_TO_INNER = ['1d', '4h', '1h', '15m', '5m', '3m', '1m']
const RING_TOTAL = OUTER_TO_INNER.reduce((a, tf) => a + RING_SIZE[tf], 0)
const CYAN = '25,230,208', PINK = '255,79,123'
export const EASE_C = 0.03   // velocità con cui cambiano colori, alone e anelli (per fotogramma)
export const PULSE_MS = 1700
// Spazio intorno alla bolla occupato da alone e impulso del segnale (in proporzione e in px)
export const HALO = 1.5, PULSE_REACH = 20

export function newNode(extra) {
  return { x: 0, y: 0, r: 0, rc: {}, rt: {}, g: 0, tg: 0, gs: null, sigA: 0, sig: false, pulseAt: 0, hlA: 0, hl: false, label: '', ...extra }
}

// Imposta gli obiettivi; l'impulso dorato parte solo quando il segnale compare.
export function setTargets(n, { rings, score, side, signal, label, highlight = false }, { now, reduced }) {
  n.rt = rings || {}
  n.tg = score || 0
  if (side && side !== 'neutral') n.gs = side
  if (signal && !n.sig && !reduced) n.pulseAt = now
  n.sig = !!signal
  n.hl = highlight
  if (label != null) n.label = label
}

// Avvicina colori, alone e segnale agli obiettivi. Restituisce true se c'è ancora movimento.
export function easeNode(n, dt) {
  const f = 1 - Math.pow(1 - EASE_C, dt)
  let moving = false
  const step = (cur, target) => {
    const next = cur + (target - cur) * f
    if (Math.abs(target - next) > 0.002) moving = true
    return Math.abs(target - next) > 0.002 ? next : target
  }
  n.g = step(n.g, n.tg)
  n.sigA = step(n.sigA, n.sig ? 1 : 0)
  n.hlA = step(n.hlA, n.hl ? 1 : 0)
  for (const tf of OUTER_TO_INNER) n.rc[tf] = step(n.rc[tf] || 0, n.rt?.[tf] || 0)
  return moving || !!n.pulseAt
}

// Tutto subito al valore (movimento ridotto)
export function snapNode(n) {
  n.g = n.tg; n.sigA = n.sig ? 1 : 0; n.hlA = n.hl ? 1 : 0; n.pulseAt = 0
  for (const tf of OUTER_TO_INNER) n.rc[tf] = n.rt?.[tf] || 0
}

function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2) }

export function drawBubble(ctx, n, now, { hover = false } = {}) {
  const { x, y, r } = n
  if (r <= 0.5) return

  // Alone proporzionale all'allineamento
  if (n.g > 0.03 && n.gs) {
    const col = n.gs === 'oversold' ? CYAN : PINK
    const grad = ctx.createRadialGradient(x, y, r * 0.85, x, y, r * HALO)
    grad.addColorStop(0, `rgba(${col},${0.3 * n.g})`)
    grad.addColorStop(1, `rgba(${col},0)`)
    ctx.fillStyle = grad
    circle(ctx, x, y, r * HALO); ctx.fill()
  }
  ctx.fillStyle = '#0E1016'
  circle(ctx, x, y, r); ctx.fill()

  // Anelli: 1d fuori, 1m al centro
  let outer = r
  for (const tf of OUTER_TO_INNER) {
    const inner = Math.max(0, outer - (r * RING_SIZE[tf]) / RING_TOTAL)
    const v = n.rc[tf] || 0
    if (Math.abs(v) > 0.01) {
      ctx.fillStyle = `rgba(${v > 0 ? CYAN : PINK},${Math.min(1, Math.abs(v)) * 0.92})`
      ctx.beginPath()
      ctx.arc(x, y, outer, 0, Math.PI * 2)
      if (inner > 0) { ctx.moveTo(x + inner, y); ctx.arc(x, y, inner, 0, Math.PI * 2, true) }
      ctx.fill()
    }
    if (r > 9) {
      ctx.strokeStyle = 'rgba(200,169,106,0.17)'
      ctx.lineWidth = 0.75
      circle(ctx, x, y, Math.max(0.5, outer - 0.4)); ctx.stroke()
    }
    outer = inner
  }

  // Zona di attenzione: anello dorato sottile, con un solo impulso quando compare
  if (n.sigA > 0.02) {
    ctx.strokeStyle = `rgba(235,211,154,${0.85 * n.sigA})`
    ctx.lineWidth = 1.2
    circle(ctx, x, y, r + 3.5); ctx.stroke()
  }
  if (n.pulseAt) {
    const p = (now - n.pulseAt) / PULSE_MS
    if (p >= 1) n.pulseAt = 0
    else if (p > 0) {
      const q = 1 - Math.pow(1 - p, 3)
      ctx.strokeStyle = `rgba(235,211,154,${0.7 * (1 - p)})`
      ctx.lineWidth = 1.6
      circle(ctx, x, y, r + 3.5 + q * (PULSE_REACH - 4)); ctx.stroke()
    }
  }

  // Titolo evidenziato (tornando dal dettaglio): anello avorio più largo
  if (n.hlA > 0.02) {
    ctx.strokeStyle = `rgba(237,234,226,${0.9 * n.hlA})`
    ctx.lineWidth = 1.5
    circle(ctx, x, y, r + 7.5); ctx.stroke()
  }

  // Nome al centro
  if (r >= 12 && n.label) {
    let fs = Math.max(9, Math.min(22, r * 0.34))
    ctx.font = `500 ${fs}px "Instrument Sans", system-ui, sans-serif`
    const tw = ctx.measureText(n.label).width
    if (tw > r * 1.7) { fs = Math.max(8, fs * (r * 1.7) / tw); ctx.font = `500 ${fs}px "Instrument Sans", system-ui, sans-serif` }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(6,7,11,0.82)'
    ctx.strokeText(n.label, x, y + 0.5)
    ctx.fillStyle = hover || n.hlA > 0.5 ? '#EBD39A' : '#EDEAE2'
    ctx.fillText(n.label, x, y + 0.5)
  }
}

// Dati di una bolla a partire dal risultato di alignment(): usata sia dalla mappa sia dal dettaglio.
export function bubbleData(symbol, a) {
  return {
    id: symbol, label: symbol.replace(/USDT$/, ''),
    score: a.score, side: a.side, signal: a.signal, loaded: a.loaded,
    rings: Object.fromEntries(OUTER_TO_INNER.map(tf => [tf, ringValue(a.states[tf])])),
  }
}
