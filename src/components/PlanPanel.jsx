import { useState } from 'react'
import { PLANS, TIMEFRAMES } from '../lib/plans.js'
import { useAccount } from '../lib/account.jsx'

// Il piano sta sull'account. Prototipo: si passa da un piano all'altro liberamente (lo cambia il server,
// non il browser). Più avanti qui andrà il pagamento.
export default function PlanPanel({ onLogin }) {
  const acc = useAccount()
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const signedIn = acc.status === 'in'
  const pick = async id => {
    if (!signedIn) { onLogin(); return }
    if (id === acc.plan) return
    setBusy(id); setError(null)
    try { await acc.setPlan(id) } catch (e) { setError(e.message) }
    setBusy(null)
  }
  return (
    <div className="plans">
      {!signedIn && (
        <div className="plans__login">
          <p>Senza account usi la versione base: mappa, elenco e dettaglio con 1m e 3m.</p>
          <button className="btn btn--ghost" onClick={onLogin} disabled={acc.status === 'loading' || acc.status === 'off'}>Accedi per scegliere il piano</button>
        </div>
      )}
      {PLANS.map(p => (
        <button key={p.id} className={'plan' + (p.id === acc.plan ? ' is-on' : '') + (busy === p.id ? ' is-busy' : '')} onClick={() => pick(p.id)} aria-pressed={p.id === acc.plan}>
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
      {error && <p className="hint risk__warn">{error}</p>}
      <p className="hint">Versione di prova: con l'account puoi cambiare piano quando vuoi, senza pagare.</p>
    </div>
  )
}
