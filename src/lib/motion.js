import { flushSync } from 'react-dom'

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches
export const isDesktop = () => matchMedia('(min-width: 980px)').matches

const frames = n => new Promise(resolve => {
  const step = () => (--n <= 0 ? resolve() : requestAnimationFrame(step))
  requestAnimationFrame(step)
})

// Cambio di disposizione morbido (card che si allarga a tutta la riga).
// View Transitions dove ci sono: il browser fotografa prima e dopo e passa dall'una all'altra,
// quindi il grafico non si ridisegna a metà. Aspettiamo due fotogrammi perché il grafico
// abbia già preso la nuova misura prima della foto finale.
// Altrimenti animazione FLIP: ogni card parte dalla vecchia posizione e misura.
export function smoothLayout(update, scope) {
  if (reducedMotion()) { update(); return }
  if (document.startViewTransition) {
    document.startViewTransition(async () => { flushSync(update); await frames(2) })
    return
  }
  const els = scope ? [...scope.children] : []
  const before = new Map(els.map(el => [el, el.getBoundingClientRect()]))
  flushSync(update)
  for (const el of els) {
    const a = before.get(el), b = el.getBoundingClientRect()
    if (!b.width || !b.height) continue
    const dx = a.left - b.left, dy = a.top - b.top, sx = a.width / b.width, sy = a.height / b.height
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) continue
    el.animate([
      { transformOrigin: 'top left', transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
      { transformOrigin: 'top left', transform: 'none' },
    ], { duration: 420, easing: 'cubic-bezier(.5, 0, .2, 1)' })
  }
}
