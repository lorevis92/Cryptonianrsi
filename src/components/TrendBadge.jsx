import { useEffect, useState } from 'react'
import { trendOf, trendExplain, MAIN_TREND_TF } from '../lib/trend.js'

// Badge del trend (EMA 200). Al passaggio del mouse il title, al tocco una piccola nota che sparisce da sola.
// Sta anche dentro le righe-bottone dell'elenco: il tocco sul badge non apre il dettaglio.
// t: 1 / -1 / 0 (dati insufficienti) · undefined = ancora sconosciuto, non mostra niente
export default function TrendBadge({ t, tf = MAIN_TREND_TF, compact = false }) {
  const [tip, setTip] = useState(false)
  useEffect(() => { if (!tip) return; const x = setTimeout(() => setTip(false), 3500); return () => clearTimeout(x) }, [tip])
  if (t === undefined || t === null) return null
  const x = trendOf(t)
  const why = trendExplain(t, tf)
  const toggle = e => { e.stopPropagation(); e.preventDefault(); setTip(v => !v) }
  return (
    <span className={`trend is-${x.id}` + (tip ? ' is-tip' : '')} title={why} onClick={toggle} aria-label={`${x.label}: ${why}`}>
      <span aria-hidden="true">{x.glyph}</span>
      {!compact && <><span className="trend__text" aria-hidden="true">{x.label}</span><span className="trend__short" aria-hidden="true">{x.short}</span></>}
      {tip && <span className="trend__tip" role="status">{why}</span>}
    </span>
  )
}

// Trend di un timeframe nel dettaglio, sempre a parole (il triangolo solo insieme alla parola).
// size: 'short' = "Rialzista" (scala dei timeframe), 'auto' = "Trend rialzista", breve se la card è stretta.
export function TrendMark({ t, tf, size = 'short' }) {
  if (t === undefined || t === null) return null
  const x = trendOf(t)
  const word = x.id === 'none' ? (size === 'short' ? 'Dati insuff.' : x.label) : null
  return (
    <span className={`trend-word is-${x.id} is-${size}`} title={trendExplain(t, tf)} aria-label={`${tf}: ${x.label}`}>
      {x.id !== 'none' && <span className="trend-word__glyph" aria-hidden="true">{x.glyph}</span>}
      {word ?? (size === 'short' ? x.short : <><span className="trend-word__long">{x.label}</span><span className="trend-word__short">{x.short}</span></>)}
    </span>
  )
}
