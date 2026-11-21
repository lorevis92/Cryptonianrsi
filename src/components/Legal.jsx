import { useEffect, useRef } from 'react'
import { DISCLAIMER, DISCLAIMER_SHORT, LEGAL } from '../lib/legal.js'
import { PRIVACY, PRIVACY_UPDATED } from '../lib/privacy.js'

// Schermata del primo avvio: da accettare una volta (crsi:disclaimer).
export function DisclaimerGate({ onAccept, onRead }) {
  const btn = useRef()
  useEffect(() => { btn.current?.focus() }, [])
  return (
    <div className="gate" role="dialog" aria-modal="true" aria-labelledby="gate-title">
      <div className="gate__panel">
        <p className="brand__name gate__brand">Cryptonian <em>RSI</em></p>
        <h2 id="gate-title" className="gate__title">Prima di iniziare</h2>
        <p className="gate__text">{DISCLAIMER}</p>
        <button ref={btn} className="btn btn--ghost gate__ok" onClick={onAccept}>Ho capito</button>
        <button className="legal-link" onClick={onRead}>Leggi le note legali</button>
      </div>
    </div>
  )
}

// Riga discreta in fondo alla home e al dettaglio: l'unico accesso a Note legali e Privacy (oltre agli indirizzi diretti)
export function LegalLine({ onTerms, onPrivacy }) {
  return (
    <p className="legal-line">
      {DISCLAIMER_SHORT} <a className="legal-link" href="/termini" onClick={e => { e.preventDefault(); onTerms() }}>Note legali</a>
      <span aria-hidden="true"> · </span>
      <a className="legal-link" href="/privacy" onClick={e => { e.preventDefault(); onPrivacy() }}>Privacy</a>
    </p>
  )
}

// Pagina "Note legali" (nel menu)
export function LegalPanel() {
  return (
    <div className="legal">
      <p className="legal__lead">{DISCLAIMER}</p>
      {LEGAL.map(([title, paras]) => (
        <section key={title}>
          <h3 className="legal__title">{title}</h3>
          {paras.map((p, i) => <p key={i}>{p}</p>)}
        </section>
      ))}
    </div>
  )
}

// Pagina "Privacy" (nel menu): quali dati, a cosa servono, come cancellarli
export function PrivacyPanel() {
  return (
    <div className="legal">
      {PRIVACY.map(([title, paras]) => (
        <section key={title}>
          <h3 className="legal__title">{title}</h3>
          {paras.map((p, i) => <p key={i}>{p}</p>)}
        </section>
      ))}
      <p className="hint">Aggiornata il {PRIVACY_UPDATED}.</p>
    </div>
  )
}
