import { useEffect, useMemo, useState } from 'react'
import Chart from './Chart.jsx'
import Icon from './Icon.jsx'
import { useCandles } from '../lib/useCandles.js'
import { readState } from '../lib/stochrsi.js'
import { TF_LABEL, planFor } from '../lib/plans.js'
import { fmtK, fmtPrice, ZONE_LABEL } from '../lib/format.js'

export default function TimeframeCard({ symbol, tf, unlocked, params, onState, onLocked }) {
  const { bars, error, loading } = useCandles(symbol, tf, unlocked)
  const s = useMemo(() => (bars ? readState(bars, params) : null), [bars, params])
  const [big, setBig] = useState(false)

  useEffect(() => { onState(tf, unlocked ? s : null) }, [tf, s, unlocked, onState])

  if (!unlocked) {
    const plan = planFor(tf)
    return (
      <article className="card is-locked" aria-label={`${TF_LABEL[tf]}, bloccato`}>
        <header className="card__head"><span className="card__tf">{tf}</span></header>
        <div className="card__ghost" aria-hidden="true" />
        <div className="card__lock">
          <Icon name="lock" size={20} />
          <p>Disponibile con il piano {plan.name}</p>
          <button className="btn btn--ghost" onClick={onLocked}>Vedi i piani</button>
        </div>
      </article>
    )
  }

  const last = bars?.[bars.length - 1]
  const pulse = s?.cross?.inZone && s.cross.ago <= 1
  return (
    <article className={`card is-${s?.zone || 'neutral'} ${pulse ? 'is-pulse' : ''} ${big ? 'is-big' : ''}`} style={{ '--i': s?.intensity || 0 }} aria-label={TF_LABEL[tf]}>
      <header className="card__head">
        <span className="card__tf">{tf}</span>
        <span className="card__zone">{s?.K != null ? ZONE_LABEL[s.zone] : ''}</span>
        <span className="card__price">{fmtPrice(last?.c)}</span>
        <button className="icon-btn" onClick={() => setBig(v => !v)} aria-label={big ? 'Riduci il grafico' : 'Ingrandisci il grafico'} aria-pressed={big}><Icon name="expand" size={16} /></button>
      </header>
      <div className="card__read">
        <span><i className="sw sw--k" />K <b>{fmtK(s?.K)}</b></span>
        <span><i className="sw sw--d" />D <b>{fmtK(s?.D)}</b></span>
        {s?.cross && <span className={`card__cross is-${s.cross.dir}`}><Icon name={s.cross.dir} size={14} />{s.cross.dir === 'up' ? 'K sopra D' : 'K sotto D'}</span>}
      </div>
      {/* Il grafico si monta solo quando ci sono candele e lo stato è calcolato.
          Appena sbloccato un timeframe, per un render loading è ancora false: resta lo scheletro. */}
      {bars?.length && s
        ? <Chart bars={bars} k={s.k} d={s.d} upper={params.upper} lower={params.lower} tall={big} />
        : bars && !bars.length ? <p className="card__msg">Nessuna candela disponibile per questo titolo.</p>
        : error && !loading ? <p className="card__msg">{error}. Riprovo tra poco.</p>
        : <div className="card__skeleton" aria-label="Caricamento" />}
    </article>
  )
}
