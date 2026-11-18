import { useEffect, useRef } from 'react'
import { drawBubble, easeNode, newNode, setTargets, snapNode, HALO, PULSE_REACH } from '../lib/bubbleDraw.js'

// Una sola bolla, identica a quelle della mappa (stesso disegno di lib/bubbleDraw.js).
// size = diametro della bolla in px; alone e impulso escono dal riquadro senza spostare il layout.
// data: { label, rings, score, side, signal }
export default function Bubble({ data, size = 64, onClick, label }) {
  const cvs = useRef(), node = useRef(null), loop = useRef({})

  const r = size / 2
  const pad = Math.ceil(Math.max(r * (HALO - 1), PULSE_REACH)) + 2
  const box = size + pad * 2

  // Prepara il canvas e il ciclo di disegno (gira solo mentre i valori si stanno muovendo)
  useEffect(() => {
    const c = cvs.current
    const ctx = c.getContext('2d')
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    c.width = Math.round(box * dpr); c.height = Math.round(box * dpr)
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!node.current) node.current = newNode()
    const n = node.current
    n.x = box / 2; n.y = box / 2; n.r = r
    let raf = 0, last = 0

    const draw = now => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, box, box)
      drawBubble(ctx, n, now)
    }
    const frame = now => {
      const dt = last ? Math.min(3, (now - last) / 16.67) : 1
      last = now
      const moving = easeNode(n, dt)
      draw(now)
      raf = moving ? requestAnimationFrame(frame) : 0
      if (!raf) last = 0
    }
    loop.current = {
      kick() {
        if (reduced) { snapNode(n); draw(performance.now()); return }
        if (!raf) raf = requestAnimationFrame(frame)
      },
      reduced,
    }
    loop.current.kick()
    document.fonts?.ready.then(() => loop.current.kick?.())
    return () => { cancelAnimationFrame(raf); loop.current = {} }
  }, [box, r])

  // Nuovi valori: la bolla ci arriva con la stessa transizione morbida della mappa
  useEffect(() => {
    const n = node.current
    if (!n || !data) return
    setTargets(n, data, { now: performance.now(), reduced: loop.current.reduced })
    loop.current.kick?.()
  }, [data])

  return (
    <button type="button" className="bubble" style={{ width: size, height: size }} onClick={onClick} aria-label={label}>
      <canvas ref={cvs} className="bubble__canvas" aria-hidden="true"
        style={{ width: box, height: box, left: -pad, top: -pad }} />
    </button>
  )
}
