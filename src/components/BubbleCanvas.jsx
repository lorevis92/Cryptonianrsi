import { useEffect, useRef } from 'react'
import { forceSimulation, forceX, forceY, forceCollide } from 'd3-force'
import { drawBubble, easeNode, newNode, setTargets, snapNode } from '../lib/bubbleDraw.js'
import { trendOf, trendExplain } from '../lib/trend.js'

// Mappa a bolle su canvas: fisica leggera (d3-force), valori che cambiano lentamente.
// Il disegno della singola bolla è in lib/bubbleDraw.js, lo stesso della bolla nel dettaglio.
// items: [{ id, label, score 0–1, side, rings: { tf: -1…1 }, signal, visible }]

const FILL = 0.48          // quota dello schermo occupata dalle bolle
const EASE_R = 0.028       // velocità con cui cambia la grandezza (per fotogramma)

// Restano in memoria tra un'apertura e l'altra: l'entrata animata avviene una sola volta.
const nodes = new Map()
let entered = false

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

export default function BubbleCanvas({ items, highlight = null, onPick, onBlank, label }) {
  const wrap = useRef(), cvs = useRef()
  const env = useRef({ w: 0, h: 0, dpr: 1, items: [], highlight: null })
  env.current.onPick = onPick
  env.current.onBlank = onBlank

  useEffect(() => {
    const e = env.current
    const ctx = cvs.current.getContext('2d')
    const reduced = reducedMotion()
    let raf = 0, last = performance.now(), hover = null

    const collide = forceCollide(n => n.r + 1.5).strength(0.75).iterations(2)
    const sim = forceSimulation([]).velocityDecay(0.32).alphaTarget(reduced ? 0 : 0.14)
      .force('x', forceX(0)).force('y', forceY(0)).force('collide', collide).force('drift', drift).stop()

    // Deriva lenta e pareti morbide: le bolle galleggiano senza uscire dallo schermo.
    function drift() {
      const t = performance.now()
      for (const n of sim.nodes()) {
        if (!reduced) {
          n.vx += Math.sin(t * 0.00037 + n.ph) * 0.012
          n.vy += Math.cos(t * 0.00029 + n.ph * 1.7) * 0.012
        }
        const r = n.r
        if (n.x < r) n.vx += (r - n.x) * 0.06
        if (n.x > e.w - r) n.vx -= (n.x - (e.w - r)) * 0.06
        if (n.y < r) n.vy += (r - n.y) * 0.06
        if (n.y > e.h - r) n.vy -= (n.y - (e.h - r)) * 0.06
      }
    }

    function retarget() {
      const { w, h } = e
      if (!w || !h) return
      const list = e.items
      const rel = it => (it.visible ? 0.32 + 0.68 * it.score : 0)
      const sum = list.reduce((a, it) => a + rel(it) ** 2, 0) || 1
      const k = Math.min(Math.sqrt((FILL * w * h) / (Math.PI * sum)), Math.min(w, h) * 0.23)
      const now = performance.now()
      const seen = new Set()
      for (const it of list) {
        seen.add(it.id)
        let n = nodes.get(it.id)
        if (!n) {
          const a = Math.random() * Math.PI * 2, d = Math.random() * Math.min(w, h) * (entered ? 0.45 : 0.18)
          n = newNode({ id: it.id, x: w / 2 + Math.cos(a) * d, y: h / 2 + Math.sin(a) * d, vx: 0, vy: 0, ph: Math.random() * 6.3 })
          nodes.set(it.id, n)
        }
        setTargets(n, { ...it, score: it.visible ? it.score : 0, highlight: it.visible && it.id === e.highlight }, { now, reduced })
        n.tr = rel(it) * k
        n.visible = it.visible
      }
      for (const [id, n] of nodes) if (!seen.has(id)) { n.tr = 0; n.tg = 0; n.sig = false; n.hl = false; n.visible = false }
      if (list.length) entered = true
      sim.nodes([...nodes.values()])
      const sx = 0.05 * Math.min(1.8, Math.max(0.6, h / w)), sy = 0.05 * Math.min(1.8, Math.max(0.6, w / h))
      sim.force('x').x(w / 2).strength(sx)
      sim.force('y').y(h / 2).strength(sy)
      if (reduced) {
        for (const n of nodes.values()) { n.r = n.tr; snapNode(n) }
        collide.radius(n => n.r + 1.5)
        sim.alpha(1); sim.tick(220); draw(now)
      } else sim.alpha(Math.max(sim.alpha(), 0.35))
    }

    function ease(dt) {
      const fr = 1 - Math.pow(1 - EASE_R, dt)
      for (const [id, n] of nodes) {
        n.r += (n.tr - n.r) * fr
        easeNode(n, dt)
        if (n.tr === 0 && n.r < 0.3) nodes.delete(id)
      }
      collide.radius(n => n.r + 1.5)
      if (sim.nodes().length !== nodes.size) sim.nodes([...nodes.values()])
    }

    function draw(now) {
      const { w, h, dpr } = e
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      // Le più grandi sopra; il titolo evidenziato sopra a tutte
      const list = [...nodes.values()].filter(n => n.r > 0.5).sort((a, b) => (a.hlA - b.hlA) || (a.r - b.r))
      for (const n of list) drawBubble(ctx, n, now, { hover: hover === n.id })
    }

    function frame(now) {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(3, (now - last) / 16.67)
      last = now
      ease(dt)
      sim.tick()
      draw(now)
    }

    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      e.w = width; e.h = height; e.dpr = Math.min(2, window.devicePixelRatio || 1)
      cvs.current.width = Math.round(width * e.dpr)
      cvs.current.height = Math.round(height * e.dpr)
      retarget()
      if (reduced) draw(performance.now())
    })
    ro.observe(wrap.current)

    const at = ev => {
      const b = cvs.current.getBoundingClientRect()
      const px = ev.clientX - b.left, py = ev.clientY - b.top
      return [...nodes.values()].filter(n => n.visible && n.r > 4).sort((a, b) => b.r - a.r)
        .find(n => (n.x - px) ** 2 + (n.y - py) ** 2 <= n.r * n.r)
    }
    const onClick = ev => { const n = at(ev); if (n) e.onPick(n.id); else e.onBlank?.() }
    const onMove = ev => {
      const n = ev.pointerType === 'mouse' ? at(ev) : null
      hover = n?.id || null
      cvs.current.style.cursor = n ? 'pointer' : 'default'
      cvs.current.title = n && (n.trend === 1 || n.trend === -1) ? `${n.label} · ${trendOf(n.trend).label} · ${trendExplain(n.trend)}` : ''
      if (reduced) draw(performance.now())
    }
    const c = cvs.current
    c.addEventListener('click', onClick)
    c.addEventListener('pointermove', onMove)

    e.retarget = retarget
    if (!reduced) raf = requestAnimationFrame(frame)
    else document.fonts?.ready.then(() => draw(performance.now()))

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      sim.stop()
      c.removeEventListener('click', onClick)
      c.removeEventListener('pointermove', onMove)
      e.retarget = null
    }
  }, [])

  useEffect(() => {
    env.current.items = items
    env.current.highlight = highlight
    env.current.retarget?.()
  }, [items, highlight])

  return (
    <div ref={wrap} className="bubbles" role="img" aria-label={label}>
      <canvas ref={cvs} className="bubbles__canvas" />
    </div>
  )
}
