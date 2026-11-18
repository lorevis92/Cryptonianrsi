import { DEFAULTS } from '../lib/stochrsi.js'

const FIELDS = [
  ['rsi', 'Lunghezza RSI', 2, 50], ['stoch', 'Lunghezza stocastico', 2, 50],
  ['k', 'Media K', 1, 10], ['d', 'Media D', 1, 10],
  ['upper', 'Soglia ipercomprato', 55, 99], ['lower', 'Soglia ipervenduto', 1, 45],
]

export default function IndicatorPanel({ params, onChange }) {
  const set = (key, v, min, max) => {
    const n = Math.round(Number(v))
    if (Number.isFinite(n)) onChange({ ...params, [key]: Math.min(max, Math.max(min, n)) })
  }
  return (
    <div className="indicator">
      <div className="indicator__grid">
        {FIELDS.map(([key, label, min, max]) => (
          <label key={key} className="num">
            <span>{label}</span>
            <input type="number" inputMode="numeric" min={min} max={max} value={params[key]} onChange={e => set(key, e.target.value, min, max)} />
          </label>
        ))}
      </div>
      <button className="btn btn--ghost" onClick={() => onChange(DEFAULTS)}>Ripristina valori classici</button>
    </div>
  )
}
