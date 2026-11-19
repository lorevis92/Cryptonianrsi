import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Chart from './Chart.jsx'
import Icon from './Icon.jsx'
import { TrendMark } from './TrendBadge.jsx'
import { useCandles } from '../lib/useCandles.js'
import { readState } from '../lib/stochrsi.js'
import { TF_LABEL, planFor } from '../lib/plans.js'
import { fmtK, fmtPrice, ZONE_LABEL } from '../lib/format.js'
import { isDesktop, reducedMotion, smoothLayout } from '../lib/motion.js'

export default function TimeframeCard({ symbol, tf, unlocked, params, onState, onLocked, trend }) {
  const { bars, ema, precision, error, loading } = useCandles(symbol, tf, unlocked)
  const s = useMemo(() => (bars ? readState(bars, params) : null), [bars, params])
  const [big, setBig] = useState(false)   // computer: card a tutta la riga
  const [full, setFull] = useState(false) // telefono: grafico a tutto schermo
  const card = useRef()

  // Da computer la card si allarga con una transizione; da telefono il grafico sale a tutto schermo.
  const expand = () => {
    if (!isDesktop()) { setFull(true); return }
    smoothLayout(() => setBig(v => !v), card.current?.parentElement)
  }

  useEffect(() => { onState(tf, unlocked ? s : null) }, [tf, s, unlocked, onState])

  if (!unlocked) {
    const plan = planFor(tf)
    return (
      <article className="card is-locked" style={{ viewTransitionName: `card-${tf}` }} aria-label={`${TF_LABEL[tf]}, bloccato`}>
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
    <article ref={card} className={`card is-${s?.zone || 'neutral'} ${pulse ? 'is-pulse' : ''} ${big ? 'is-big' : ''}`} style={{ '--i': s?.intensity || 0, viewTransitionName: `card-${tf}` }} aria-label={TF_LABEL[tf]}>
      <header className="card__head">
        <span className="card__tf">{tf}<TrendMark t={trend} tf={tf} /></span>
        <span className="card__zone">{s?.K != null ? ZONE_LABEL[s.zone] : ''}</span>
        <span className="card__price">{fmtPrice(last?.c, precision)}</span>
        <button className="icon-btn" onClick={expand} aria-label={big ? 'Riduci il grafico' : 'Ingrandisci il grafico'} aria-pressed={big || full}><Icon name="expand" size={16} /></button>
      </header>
      <Reading s={s} />
      {/* Il grafico si monta solo quando ci sono candele e lo stato è calcolato.
          Appena sbloccato un timeframe, per un render loading è ancora false: resta lo scheletro. */}
      {bars?.length && s
        ? <Chart bars={bars} k={s.k} d={s.d} upper={params.upper} lower={params.lower} tall={big} ema={ema} precision={precision} />
        : bars && !bars.length ? <p className="card__msg">Nessuna candela disponibile per questo titolo.</p>
        : error && !loading ? <p className="card__msg">{error}. Riprovo tra poco.</p>
        : <div className="card__skeleton" aria-label="Caricamento" />}
      {full && bars?.length > 0 && s && (
        <FullChart tf={tf} s={s} bars={bars} ema={ema} precision={precision} params={params} price={last?.c} onClose={() => setFull(false)} />
      )}
    </article>
  )
}

function Reading({ s }) {
  return (
    <div className="card__read">
      <span><i className="sw sw--k" />K <b>{fmtK(s?.K)}</b></span>
      <span><i className="sw sw--d" />D <b>{fmtK(s?.D)}</b></span>
      {s?.cross && <span className={`card__cross is-${s.cross.dir}`}><Icon name={s.cross.dir} size={14} />{s.cross.dir === 'up' ? 'K sopra D' : 'K sotto D'}</span>}
    </div>
  )
}

// Telefono: il grafico sale dal basso e occupa tutto lo schermo.
// Il grafico nasce già alla misura finale, quindi durante la salita non si ridisegna.
function FullChart({ tf, s, bars, ema, precision, params, price, onClose }) {
  const [closing, setClosing] = useState(false)
  const close = () => (reducedMotion() ? onClose() : setClosing(true))

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const esc = e => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', esc)
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', esc) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return createPortal(
    <div className={`full is-${s.zone}` + (closing ? ' is-closing' : '')} role="dialog" aria-modal="true" aria-label={`Grafico ${TF_LABEL[tf]}`}
      onAnimationEnd={e => { if (closing && e.target === e.currentTarget) onClose() }}>
      <header className="full__head">
        <span className="card__tf">{tf}</span>
        <span className="card__zone">{s.K != null ? ZONE_LABEL[s.zone] : ''}</span>
        <span className="card__price">{fmtPrice(price, precision)}</span>
        <button className="icon-btn" onClick={close} aria-label="Chiudi il grafico" autoFocus><Icon name="close" /></button>
      </header>
      <Reading s={s} />
      <div className="full__body">
        <Chart bars={bars} k={s.k} d={s.d} upper={params.upper} lower={params.lower} ema={ema} precision={precision} fill alwaysActive />
      </div>
    </div>,
    document.body,
  )
}
