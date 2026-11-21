import { useEffect, useRef, useState } from 'react'
import Icon from './Icon.jsx'
import AvatarCropper from './AvatarCropper.jsx'
import { useAccount, passwordChecks } from '../lib/account.jsx'
import { planById } from '../lib/plans.js'

// Area personale. Senza login: Accedi / Registrati con email e password, oppure Google.
export default function AccountPanel({ onPlans, onNotify, onPrivacy }) {
  const acc = useAccount()
  if (acc.status === 'loading') return <p className="hint">Un attimo…</p>
  if (acc.status === 'off') return <p className="hint">Gli account non sono ancora attivi su questo server.</p>
  if (acc.recovery && acc.status === 'in') return <NewPassword />
  if (acc.status === 'out') return <Login onPrivacy={onPrivacy} />
  return <Profile onPlans={onPlans} onNotify={onNotify} />
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

// Campo password con "mostra"
function PasswordField({ label, value, onChange, autoComplete, autoFocus }) {
  const [show, setShow] = useState(false)
  return (
    <label className="field field--pw">
      <Icon name="lock" size={16} />
      <input type={show ? 'text' : 'password'} autoComplete={autoComplete} placeholder={label} aria-label={label} value={value}
        onChange={e => onChange(e.target.value)} autoFocus={autoFocus} />
      <button type="button" className="field__show" onClick={() => setShow(v => !v)} aria-pressed={show}>{show ? 'Nascondi' : 'Mostra'}</button>
    </label>
  )
}

// Requisiti della password, spuntati mentre si scrive
function PasswordRules({ password, confirm }) {
  const rules = [...passwordChecks(password), { ok: !!confirm && confirm === password, text: 'Le due password coincidono' }]
  return (
    <ul className="pw-rules" aria-label="Requisiti della password">
      {rules.map(r => <li key={r.text} className={r.ok ? 'is-ok' : ''}><span aria-hidden="true">{r.ok ? '✓' : '·'}</span>{r.text}</li>)}
    </ul>
  )
}
const passwordOk = (pw, confirm) => passwordChecks(pw).every(r => r.ok) && pw === confirm

export function Login({ onPrivacy, lead }) {
  const acc = useAccount()
  const [mode, setMode] = useState('in') // in · up · forgot
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [sent, setSent] = useState(null) // email a cui è partito il link per la nuova password
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null) // 'none' (email sconosciuta) · 'password' (password errata) · 'google' (account solo Google)
  const mail = email.trim()
  const go = m => { setMode(m); setError(null); setNotice(null); setPassword(''); setConfirm('') }

  const run = async fn => {
    setBusy(true); setError(null); setNotice(null)
    try { await fn() } catch (e) { setError(e.message) }
    setBusy(false)
  }
  // Che tipo di account c'è dietro questa email (verifica sul server, con limite di tentativi)
  const explain = async () => {
    const st = await acc.checkEmail(mail)
    if (!st) return null
    if (!st.exists) return 'none'
    if (!st.password && st.google) return 'google'
    return 'password'
  }
  const google = () => run(acc.signInGoogle)
  const submit = e => {
    e.preventDefault()
    if (mode === 'in') run(async () => {
      try { await acc.signIn(mail, password) } catch (err) {
        if (err.code !== 'invalid_credentials' && !/non corrette/.test(err.message)) throw err
        const why = await explain()
        if (!why) throw err // non si può sapere (troppi tentativi): messaggio generico
        setNotice(why)
      }
    })
    if (mode === 'up') run(() => acc.signUp(mail, password)) // si entra subito
    if (mode === 'forgot') run(async () => {
      const why = await explain()
      if (why === 'none' || why === 'google') { setNotice(why); return }
      await acc.resetPassword(mail)
      setSent(mail)
    })
  }
  // Messaggi chiari, con l'azione giusta a portata di dito
  const Notice = () => notice && (
    <div className={'auth-notice is-' + notice} role="alert">
      {notice === 'none' && <>
        <p className="auth-notice__title">Non esiste nessun account con questa email.</p>
        <p>Controlla di averla scritta correttamente oppure registrati.</p>
        <button className="btn btn--ghost auth-notice__btn" onClick={() => { const m = email; go('up'); setEmail(m) }}>Registrati</button>
      </>}
      {notice === 'password' && <>
        <p className="auth-notice__title">Password non corretta.</p>
        <button className="legal-link" onClick={() => go('forgot')}>Password dimenticata?</button>
      </>}
      {notice === 'google' && <>
        <p className="auth-notice__title">Questo account usa l'accesso con Google.</p>
        <p>Non ha una password: entra con il tuo account Google.</p>
        <button className="btn btn--ghost account__google auth-notice__btn" onClick={google} disabled={busy}><GoogleMark />Continua con Google</button>
      </>}
    </div>
  )
  const canSubmit = EMAIL_RE.test(mail) && !busy && acc.status !== 'loading' && (
    mode === 'in' ? password.length > 0 : mode === 'up' ? passwordOk(password, confirm) : true)

  if (acc.status === 'off') return <p className="hint">Gli account non sono ancora attivi su questo server.</p>

  if (sent) return (
    <div className="account">
      <div className="account__sent" role="status">
        <p>Se <b>{sent}</b> è registrata, ti abbiamo mandato un link per scegliere una nuova password.</p>
        <p className="hint">Il link vale un'ora. Non arriva? Guarda nella posta indesiderata.</p>
        <button className="legal-link" onClick={() => { setSent(null); go('in') }}>Torna ad Accedi</button>
      </div>
    </div>
  )

  return (
    <div className="account">
      {mode !== 'forgot' && <>
        <p className="account__lead">{lead || 'Accedi per salvare piano, preferiti e notifiche su tutti i tuoi dispositivi.'}</p>
        <div className="seg account__tabs" role="tablist" aria-label="Accedi o registrati">
          <button role="tab" aria-selected={mode === 'in'} className={'seg__btn' + (mode === 'in' ? ' is-on' : '')} onClick={() => go('in')}>Accedi</button>
          <button role="tab" aria-selected={mode === 'up'} className={'seg__btn' + (mode === 'up' ? ' is-on' : '')} onClick={() => go('up')}>Registrati</button>
        </div>
        <button className="btn btn--ghost account__google" onClick={google} disabled={busy || acc.status === 'loading'}>
          <GoogleMark />Continua con Google
        </button>
        <div className="account__or" aria-hidden="true"><span>oppure con email</span></div>
      </>}
      {mode === 'forgot' && <p className="account__lead">Scrivi la tua email: ti mandiamo un link per scegliere una nuova password.</p>}

      <form className="account__email" onSubmit={submit} noValidate>
        <label className="field">
          <Icon name="mail" size={16} />
          <input type="email" inputMode="email" autoComplete="email" placeholder="Email" aria-label="Email" value={email} onChange={e => setEmail(e.target.value)} />
        </label>
        {mode !== 'forgot' && <PasswordField label="Password" value={password} onChange={setPassword} autoComplete={mode === 'up' ? 'new-password' : 'current-password'} />}
        {mode === 'up' && <>
          <PasswordField label="Conferma password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
          <PasswordRules password={password} confirm={confirm} />
        </>}
        <button className="btn btn--ghost account__submit" type="submit" disabled={!canSubmit}>
          {busy ? 'Un attimo…' : mode === 'in' ? 'Accedi' : mode === 'up' ? 'Crea l\'account' : 'Inviami il link'}
        </button>
      </form>
      {error && <p className="hint risk__warn" role="alert">{error}</p>}
      <Notice />

      {mode === 'in' && notice !== 'password' && <button className="legal-link account__link" onClick={() => go('forgot')}>Password dimenticata?</button>}
      {mode === 'forgot' && <button className="legal-link account__link" onClick={() => go('in')}>Torna ad Accedi</button>}
      {mode === 'up' && <p className="hint">Creando l'account accetti le <a className="legal-link" href="/termini">Note legali</a>. {onPrivacy && <button className="legal-link" onClick={onPrivacy}>Privacy</button>}</p>}
    </div>
  )
}

// Arrivato dal link dell'email "reimposta la password"
function NewPassword() {
  const acc = useAccount()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const submit = async e => {
    e.preventDefault()
    setBusy(true); setError(null)
    try { await acc.updatePassword(password) } catch (err) { setError(err.message) }
    setBusy(false)
  }
  return (
    <form className="account" onSubmit={submit} noValidate>
      <p className="account__lead">Scegli la nuova password per <b>{acc.user?.email}</b>.</p>
      <PasswordField label="Nuova password" value={password} onChange={setPassword} autoComplete="new-password" autoFocus />
      <PasswordField label="Conferma password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
      <PasswordRules password={password} confirm={confirm} />
      <button className="btn btn--ghost" type="submit" disabled={!passwordOk(password, confirm) || busy}>{busy ? 'Salvo…' : 'Salva la nuova password'}</button>
      {error && <p className="hint risk__warn" role="alert">{error}</p>}
      <button type="button" className="legal-link account__link" onClick={acc.endRecovery}>Non ora</button>
    </form>
  )
}

// Area personale → Cambia password (solo account con password)
function ChangePassword({ onDone }) {
  const acc = useAccount()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [ok, setOk] = useState(false)
  const submit = async e => {
    e.preventDefault()
    setBusy(true); setError(null)
    try { await acc.updatePassword(password); setOk(true); setTimeout(onDone, 1500) } catch (err) { setError(err.message) }
    setBusy(false)
  }
  return (
    <form className="account__pw" onSubmit={submit} noValidate>
      <PasswordField label="Nuova password" value={password} onChange={setPassword} autoComplete="new-password" autoFocus />
      <PasswordField label="Conferma password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
      <PasswordRules password={password} confirm={confirm} />
      <div className="account__confirm">
        <button type="button" className="btn btn--ghost" onClick={onDone} disabled={busy}>Annulla</button>
        <button type="submit" className="btn btn--ghost" disabled={!passwordOk(password, confirm) || busy || ok}>{ok ? 'Fatto' : busy ? 'Salvo…' : 'Salva'}</button>
      </div>
      {ok && <p className="hint" role="status">Password cambiata.</p>}
      {error && <p className="hint risk__warn" role="alert">{error}</p>}
    </form>
  )
}

function Profile({ onPlans, onNotify }) {
  const acc = useAccount()
  const [name, setName] = useState(acc.profile?.name || '')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [confirm, setConfirm] = useState(false)
  const [pwOpen, setPwOpen] = useState(false)
  const [editEmail, setEditEmail] = useState(false)
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
          <p className="account__email-line"><span>{acc.user?.email}</span>{acc.emailChecked && !editEmail && <button className="legal-link" onClick={() => setEditEmail(true)}>Modifica</button>}</p>
        </div>
      </div>
      {/* La prima volta: l'utente controlla la sua email (non c'è conferma via email) */}
      {(editEmail || !acc.emailChecked) && <EmailCheck editing={editEmail} onEdit={() => setEditEmail(true)} onDone={() => setEditEmail(false)} />}
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

      {acc.hasPassword && (
        <div className="account__pwbox">
          {pwOpen ? <ChangePassword onDone={() => setPwOpen(false)} />
            : <button className="legal-link account__link" onClick={() => setPwOpen(true)}>Cambia password</button>}
        </div>
      )}

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

// "La tua email è corretta?" · Sì, è corretta / Modifica (cambio immediato, senza conferma via email)
function EmailCheck({ editing, onEdit, onDone }) {
  const acc = useAccount()
  const [email, setEmail] = useState(acc.user?.email || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const run = async fn => { setBusy(true); setError(null); try { await fn(); onDone() } catch (e) { setError(e.message) } setBusy(false) }
  const valid = EMAIL_RE.test(email.trim())
  if (!editing) return (
    <div className="email-check" role="group" aria-label="Controllo dell'email">
      <p className="email-check__q">La tua email è corretta?</p>
      <p className="email-check__mail">{acc.user?.email}</p>
      <div className="account__confirm">
        <button className="btn btn--ghost" onClick={() => run(acc.confirmEmail)} disabled={busy}>Sì, è corretta</button>
        <button className="btn btn--ghost email-check__edit" onClick={onEdit} disabled={busy}>Modifica</button>
      </div>
      {error && <p className="hint risk__warn" role="alert">{error}</p>}
    </div>
  )
  return (
    <form className="email-check" onSubmit={e => { e.preventDefault(); if (valid) run(() => acc.changeEmail(email.trim())) }} noValidate>
      <p className="email-check__q">Correggi la tua email</p>
      <label className="field">
        <Icon name="mail" size={16} />
        <input type="email" inputMode="email" autoComplete="email" aria-label="Email" value={email} onChange={e => setEmail(e.target.value)} autoFocus />
      </label>
      <div className="account__confirm">
        <button type="button" className="btn btn--ghost" onClick={onDone} disabled={busy}>Annulla</button>
        <button type="submit" className="btn btn--ghost" disabled={!valid || busy}>{busy ? 'Salvo…' : 'Salva'}</button>
      </div>
      {acc.hasPassword && <p className="hint">D'ora in poi accedi con la nuova email e la password di sempre.</p>}
      {error && <p className="hint risk__warn" role="alert">{error}</p>}
    </form>
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
