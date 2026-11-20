import { useEffect, useRef } from 'react'
import { forceSimulation, forceX, forceY, forceCollide } from 'd3-force'
import { drawBubble, easeNode, newNode, setTargets, snapNode } from '../lib/bubbleDraw.js'
import { trendOf, trendExplain } from '../lib/trend.js'

// Mappa a bolle su canvas: fisica leggera (d3-force), valori che cambiano lentamente.
// Il disegno della singola bolla è in lib/bubbleDraw.js, lo stesso della bolla nel dettaglio.
// items: [{ id, label, score 0–1, side, rings: { tf: -1…1 }, signal, visible }]

const FILL = 0.48          // quota dello schermo occupata dalle bolle (telefono)
const FILL_WIDE = 0.56     // schermi larghi: le bolle si allargano su tutta l'area
const WIDE = 900           // da questa larghezza dell'area si usa la disposizione larga
const EDGE = 10            // margine minimo tra il bordo della bolla (anelli compresi) e il bordo dell'area
const RING = 8             // anello dorato del segnale e anello avorio dell'evidenziato fuori dal cerchio
const EASE_R = 0.028       // velocità con cui cambia la grandezza (per fotogramma)

// Restano in memoria tra un'apertura e l'altra: l'entrata animata avviene una sola volta.
const nodes = new Map()
let entered = false

// Punto di riferimento della bolla n. i nell'area, da -1 a 1 su x e y: sequenza di Halton (basi 2 e 3),
// che copre l'area in modo uniforme qualunque sia il numero di bolle.
const halton = (i, b) => { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b) } return r }
const anchor = i => [halton(i + 1, 2) * 2 - 1, halton(i + 1, 3) * 2 - 1]

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

export default function BubbleCanvas({ items, highlight = null, onPick, onBlank, label }) {
  const wrap = useRef(), cvs = useRef()
  const env = useRef({ w: 0, h: 0, dpr: 1, items: [], highlight: null, scale: 1 })
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
        const r = n.r + RING + EDGE
        if (n.x < r) n.vx += (r - n.x) * 0.06
        if (n.x > e.w - r) n.vx -= (n.x - (e.w - r)) * 0.06
        if (n.y < r) n.vy += (r - n.y) * 0.06
        if (n.y > e.h - r) n.vy -= (n.y - (e.h - r)) * 0.06
      }
    }

    // Pareti rigide: dopo ogni passo nessuna bolla può uscire dall'area (anelli compresi).
    // Se l'area è più piccola della bolla, la bolla resta al centro (e la scala si riduce, vedi fit).
    function contain() {
      for (const n of nodes.values()) {
        const r = n.r + RING + EDGE
        n.x = e.w <= 2 * r ? e.w / 2 : Math.min(e.w - r, Math.max(r, n.x))
        n.y = e.h <= 2 * r ? e.h / 2 : Math.min(e.h - r, Math.max(r, n.y))
      }
    }

    // Se le bolle non ci stanno senza sovrapporsi, riduco tutte le grandezze in proporzione
    // (e torno a ingrandirle piano quando c'è di nuovo spazio).
    let fitTick = 0
    function fit() {
      if (++fitTick % 20) return
      const list = [...nodes.values()].filter(n => n.visible && n.r > 2)
      let worst = 0
      for (let i = 0; i < list.length; i++) {
        const a = list[i]
        for (let j = i + 1; j < list.length; j++) {
          const b = list[j]
          const d = Math.hypot(a.x - b.x, a.y - b.y)
          const over = (a.r + b.r - d) / Math.min(a.r, b.r)
          if (over > worst) worst = over
        }
      }
      const settled = Math.abs(nodes.size ? [...nodes.values()].reduce((m, n) => Math.max(m, Math.abs(n.r - n.tr) / (n.tr || 1)), 0) : 0) < 0.08
      if (!settled) return
      if (worst > 0.18 && e.scale > 0.45) { e.scale *= 0.94; retarget(true) }
      else if (worst < 0.02 && e.scale < 1) { e.scale = Math.min(1, e.scale * 1.02); retarget(true) }
    }

    function retarget(keepScale = false) {
      const { w, h } = e
      if (!w || !h) return
      if (!keepScale) e.scale = 1
      const wide = w >= WIDE
      const list = e.items
      const rel = it => (it.visible ? 0.32 + 0.68 * it.score : 0)
      const sum = list.reduce((a, it) => a + rel(it) ** 2, 0) || 1
      // Area utile: tolgo margini e anelli dai bordi
      const aw = Math.max(1, w - 2 * (EDGE + RING)), ah = Math.max(1, h - 2 * (EDGE + RING))
      const k = Math.min(Math.sqrt(((wide ? FILL_WIDE : FILL) * aw * ah) / (Math.PI * sum)), Math.min(aw, ah) * 0.23) * e.scale
      const now = performance.now()
      const seen = new Set()
      list.forEach((it, i) => {
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
        ;[n.u, n.v] = anchor(i) // posizione di riferimento sugli schermi larghi (in ordine di elenco: stabile)
      })
      for (const [id, n] of nodes) if (!seen.has(id)) { n.tr = 0; n.tg = 0; n.sig = false; n.hl = false; n.visible = false }
      if (list.length) entered = true
      sim.nodes([...nodes.values()])
      // Attrazione verso il centro proporzionale alla forma dell'area: su schermi larghi è debole in orizzontale,
      // così le bolle si distribuiscono su tutta la larghezza invece di restare in una colonna al centro.
      // (attrazione proporzionale al quadrato della forma: più l'area è larga, più le bolle si stendono in orizzontale)
      const base = wide ? 0.024 : 0.05
      const ar = w / h
      const sx = wide ? base * Math.min(1, 1 / (ar * ar)) : 0.05 * Math.min(1.8, Math.max(0.6, h / w))
      const sy = wide ? base * Math.min(1.6, Math.max(0.8, ar * 0.8)) : 0.05 * Math.min(1.8, Math.max(0.6, w / h))
      if (wide) {
        // Schermi larghi: ogni bolla ha un suo punto di riferimento sparso su tutta l'area (sequenza di Halton
        // dal nome, quindi stabile), così la mappa riempie la larghezza invece di restare un mucchio al centro.
        const px = w / 2 - (EDGE + RING) - k * 0.3, py = h / 2 - (EDGE + RING) - k * 0.4
        sim.force('x').x(n => w / 2 + (n.u ?? 0) * Math.max(0, px)).strength(0.012)
        sim.force('y').y(n => h / 2 + (n.v ?? 0) * Math.max(0, py)).strength(0.02)
      } else {
        sim.force('x').x(w / 2).strength(sx)
        sim.force('y').y(h / 2).strength(sy)
      }
      if (reduced) {
        for (const n of nodes.values()) { n.r = n.tr; snapNode(n) }
        collide.radius(n => n.r + 1.5)
        sim.alpha(1)
        for (let i = 0; i < 220; i++) { sim.tick(); contain() }
        draw(now)
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
      contain()
      fit()
      draw(now)
    }

    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      e.w = width; e.h = height; e.dpr = Math.min(2, window.devicePixelRatio || 1)
      cvs.current.width = Math.round(width * e.dpr)
      cvs.current.height = Math.round(height * e.dpr)
      retarget()
      contain()
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
    env.current.retarget?.(true) // dati nuovi: tengo la riduzione già trovata (si azzera solo cambiando misura)
  }, [items, highlight])

  return (
    <div ref={wrap} className="bubbles" role="img" aria-label={label}>
      <canvas ref={cvs} className="bubbles__canvas" />
    </div>
  )
}
