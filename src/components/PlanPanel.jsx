import { PLANS, TIMEFRAMES } from '../lib/plans.js'

// Prototipo: si passa da un piano all'altro liberamente. Più avanti qui andrà il pagamento.
export default function PlanPanel({ plan, onChange }) {
  return (
    <div className="plans">
      {PLANS.map(p => (
        <button key={p.id} className={'plan' + (p.id === plan ? ' is-on' : '')} onClick={() => onChange(p.id)} aria-pressed={p.id === plan}>
          <div className="plan__top">
            <span className="plan__name">{p.name}</span>
            <span className="plan__price">{p.price === '0' ? 'Gratis' : p.price}</span>
          </div>
          <p className="plan__note">{p.note}</p>
          <div className="plan__tfs">
            {TIMEFRAMES.map(tf => <span key={tf} className={p.timeframes.includes(tf) ? 'on' : ''}>{tf}</span>)}
          </div>
        </button>
      ))}
      <p className="hint">Versione di prova: puoi cambiare piano quando vuoi, senza pagare.</p>
    </div>
  )
}
