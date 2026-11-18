import { RING_SIZE } from '../lib/alignment.js'

const OUTER_TO_INNER = ['1d', '4h', '1h', '15m', '5m', '3m', '1m']
const TOTAL = OUTER_TO_INNER.reduce((a, tf) => a + RING_SIZE[tf], 0)

const color = v => (v > 0 ? `rgba(25,230,208,${(Math.min(1, v) * 0.92).toFixed(3)})`
  : v < 0 ? `rgba(255,79,123,${(Math.min(1, -v) * 0.92).toFixed(3)})` : 'transparent')

// Bolla in miniatura (SVG): stessi anelli della mappa. rings: { tf: -1…1 }
export default function MiniRings({ rings = {}, size = 34, signal = false }) {
  const R = size / 2 - (signal ? 3 : 1)
  const c = size / 2
  let outer = R
  const parts = OUTER_TO_INNER.map(tf => {
    const t = (R * RING_SIZE[tf]) / TOTAL
    const inner = Math.max(0, outer - t)
    const mid = (outer + inner) / 2
    const el = (
      <g key={tf}>
        <circle cx={c} cy={c} r={inner > 0 ? mid : outer / 2} fill="none" stroke={color(rings[tf] || 0)} strokeWidth={inner > 0 ? outer - inner : outer} />
        <circle cx={c} cy={c} r={Math.max(0.3, outer - 0.3)} fill="none" stroke="rgba(200,169,106,0.2)" strokeWidth="0.6" />
      </g>
    )
    outer = inner
    return el
  })
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="mini-rings">
      <circle cx={c} cy={c} r={R} fill="#0E1016" />
      {parts}
      {signal && <circle cx={c} cy={c} r={R + 2} fill="none" stroke="#EBD39A" strokeWidth="1" />}
    </svg>
  )
}
