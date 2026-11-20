import { useEffect, useRef, useState } from 'react'
import Icon from './Icon.jsx'
import AvatarCropper from './AvatarCropper.jsx'
import { useAccount } from '../lib/account.jsx'
import { planById } from '../lib/plans.js'

// Area personale. Senza login: accesso con Google o con un link via email (niente password).
export default function AccountPanel({ onPlans, onNotify, onPrivacy }) {
  const acc = useAccount()
  if (acc.status === 'loading') return <p className="hint">Un attimo…</p>
  if (acc.status === 'off') return <p className="hint">Gli account non sono ancora attivi su questo server.</p>
  if (acc.status === 'out') return <Login onPrivacy={onPrivacy} />
  return <Profile onPlans={onPlans} onNotify={onNotify} />
}

export function Login({ onPrivacy, lead }) {
  const acc = useAccount()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())

  const google = async () => {
    setBusy(true); setError(null)
    try { await acc.signInGoogle() } catch (e) { setError(e.message); setBusy(false) }
  }
  const link = async e => {
    e.preventDefault()
    if (!valid) return
    setBusy(true); setError(null)
    try { await acc.signInEmail(email.trim()); setSent(email.trim()) } catch (err) { setError(err.message) }
    setBusy(false)
  }

  if (acc.status === 'off') return <p className="hint">Gli account non sono ancora attivi su questo server.</p>
  return (
    <div className="account">
      <p className="account__lead">{lead || 'Accedi per salvare piano, preferiti e notifiche su tutti i tuoi dispositivi.'}</p>
      <button className="btn btn--ghost account__google" onClick={google} disabled={busy || acc.status === 'loading'}>
        <GoogleMark />Continua con Google
      </button>
      <div className="account__or" aria-hidden="true"><span>oppure</span></div>
      {sent ? (
        <div className="account__sent" role="status">
          <p>Ti ho mandato un link a <b>{sent}</b>.</p>
          <p className="hint">Aprilo da questo telefono per entrare. Non arriva? Guarda nella posta indesiderata.</p>
          <button className="legal-link" onClick={() => setSent(null)}>Usa un'altra email</button>
        </div>
      ) : (
        <form className="account__email" onSubmit={link}>
          <label className="field">
            <Icon name="mail" size={16} />
            <input type="email" inputMode="email" autoComplete="email" placeholder="La tua email" value={email} onChange={e => setEmail(e.target.value)} aria-label="Email" />
          </label>
          <button className="btn btn--ghost" type="submit" disabled={!valid || busy || acc.status === 'loading'}>Inviami il link</button>
        </form>
      )}
      {error && <p className="hint risk__warn">{error}</p>}
      <p className="hint">Niente password: entri con un link via email. {onPrivacy && <button className="legal-link" onClick={onPrivacy}>Privacy</button>}</p>
    </div>
  )
}

function Profile({ onPlans, onNotify }) {
  const acc = useAccount()
  const [name, setName] = useState(acc.profile?.name || '')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [confirm, setConfirm] = useState(false)
  const input = useRef()
  useEffect(() => setName(acc.profile?.name || ''), [acc.profile?.name])

  const run = async fn => {
    setBusy(true); setError(null)
    try { await fn() } catch (e) { setError(e.message) }
    setBusy(false)
  }
  const saveName = () => { if ((acc.profile?.name || '') !== name.trim()) run(() => acc.updateName(name)) }
  const initials = (acc.profile?.name || acc.user?.email || '?').trim().slice(0, 1).toUpperCase()

  if (file) {
    return <AvatarCropper file={file} onCancel={() => setFile(null)} onDone={blob => run(async () => { await acc.uploadAvatar(blob); setFile(null) })} busy={busy} error={error} />
  }

  return (
    <div className="account">
      <div className="account__head">
        <button className="avatar" onClick={() => input.current?.click()} aria-label="Cambia la foto del profilo">
          {acc.avatarUrl ? <img src={acc.avatarUrl} alt="" /> : <span aria-hidden="true">{initials}</span>}
          <i className="avatar__edit" aria-hidden="true"><Icon name="camera" size={13} /></i>
        </button>
        <input ref={input} type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setFile(f) }} />
        <div className="account__who">
          <label className="account__name">
            <span className="hint">Nome</span>
            <input value={name} maxLength={60} placeholder="Il tuo nome" onChange={e => setName(e.target.value)} onBlur={saveName}
              onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} />
          </label>
          <p className="account__email-line">{acc.user?.email}</p>
        </div>
      </div>
      {acc.avatarUrl && <button className="legal-link account__rm" onClick={() => run(acc.removeAvatar)} disabled={busy}>Togli la foto</button>}

      <dl className="account__facts">
        <div>
          <dt>Piano</dt>
          <dd>{planById(acc.plan).name}<button className="legal-link" onClick={onPlans}>Cambia</button></dd>
        </div>
        <div>
          <dt>Telegram</dt>
          <dd>
            {acc.sub?.linked ? <span className="account__ok"><i aria-hidden="true" />Collegato{acc.sub.name ? ` come ${acc.sub.name}` : ''}</span> : <span className="hint">Non collegato</span>}
            <button className="legal-link" onClick={onNotify}>Notifiche</button>
          </dd>
        </div>
      </dl>

      <button className="btn btn--ghost" onClick={() => run(acc.signOut)} disabled={busy}>Esci</button>

      <div className="account__danger">
        {!confirm ? (
          <button className="legal-link account__del" onClick={() => setConfirm(true)}>Elimina account</button>
        ) : (
          <div role="alert">
            <p>Elimino account, impostazioni, titoli seguiti, collegamento Telegram e foto. <b>Non si può annullare.</b></p>
            <div className="account__confirm">
              <button className="btn btn--ghost" onClick={() => setConfirm(false)} disabled={busy}>Annulla</button>
              <button className="btn btn--danger" onClick={() => run(acc.deleteAccount)} disabled={busy}>{busy ? 'Elimino…' : 'Elimina tutto'}</button>
            </div>
          </div>
        )}
      </div>
      {error && <p className="hint risk__warn">{error}</p>}
    </div>
  )
}

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}
