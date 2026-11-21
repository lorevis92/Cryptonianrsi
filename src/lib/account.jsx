import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { load, save, onSave, applyRemote } from './storage.js'
import { DEFAULT_RULE } from '../alerts/rules.js'

// Account utente con Supabase Auth: Google oppure email e password. Nessuna conferma via email:
// dopo la registrazione si entra subito; l'email la controlla l'utente nell'Area personale ("La tua email è corretta?").
// - La libreria di Supabase si carica dopo il primo disegno: la mappa resta istantanea.
// - Il browser usa solo URL e chiave anon/publishable (da /api/config): i dati sono protetti dalla RLS.
// - Profilo, impostazioni e notifiche si leggono e scrivono direttamente (solo le proprie righe);
//   piano, Telegram, trasferimento ed eliminazione passano dal server (/api/account, /api/notify).
//
// status: 'loading' | 'off' (Supabase non configurato) | 'out' (senza login) | 'in'

// Chiavi locali sincronizzate con l'account → colonna di user_settings
const SYNC = { favorites: 'favorites', risk: 'risk', params: 'indicator' }
const SAVE_DELAY = 800

// Requisiti della password: gli stessi da impostare in Supabase (lunghezza minima 8, lettere e numeri)
export const PASSWORD_MIN = 8
export const passwordChecks = pw => [
  { ok: pw.length >= PASSWORD_MIN, text: `Almeno ${PASSWORD_MIN} caratteri` },
  { ok: /[A-Za-zÀ-ÿ]/.test(pw), text: 'Almeno una lettera' },
  { ok: /\d/.test(pw), text: 'Almeno un numero' },
]

// Errori di Supabase Auth in italiano
export function authMessage(e) {
  const code = e?.code || '', msg = (e?.message || '').toLowerCase()
  if (code === 'invalid_credentials' || msg.includes('invalid login credentials')) return 'Email o password non corrette.'
  if (code === 'user_already_exists' || code === 'email_exists' || msg.includes('already registered')) return 'Questa email è già registrata: accedi, oppure recupera la password.'
  if (code === 'weak_password' || msg.includes('password should')) return 'Password troppo debole: almeno 8 caratteri, con lettere e numeri.'
  if (code === 'same_password') return 'La nuova password deve essere diversa da quella attuale.'
  if (code.includes('rate_limit') || msg.includes('rate limit') || msg.includes('security purposes')) return 'Troppe richieste: riprova tra qualche minuto.'
  if (code === 'signup_disabled') return 'Le nuove registrazioni sono chiuse in questo momento.'
  if (code === 'validation_failed' || msg.includes('invalid email') || msg.includes('unable to validate email')) return "Controlla l'indirizzo email."
  if (code === 'reauthentication_needed') return 'Per sicurezza esci e rientra, poi cambia la password.'
  if (code === 'otp_expired' || msg.includes('expired')) return 'Il link è scaduto: chiedine uno nuovo.'
  if (msg.includes('fetch') || msg.includes('network')) return 'Connessione assente: riprova.'
  return e?.message || 'Qualcosa non ha funzionato: riprova.'
}
const fail = e => { const x = new Error(authMessage(e)); x.code = e?.code; throw x }

const Ctx = createContext(null)
export const useAccount = () => useContext(Ctx)

let clientJob = null
async function getClient() {
  clientJob ||= (async () => {
    let cfg = load('sbconfig', null)
    const fresh = fetch('/api/config').then(r => r.json()).then(j => { save('sbconfig', j.supabase); return j.supabase }).catch(() => null)
    if (!cfg) cfg = await fresh
    if (!cfg?.url || !cfg?.anonKey) return null
    const { createClient } = await import('@supabase/supabase-js')
    return createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'crsi:auth' },
    })
  })()
  return clientJob
}

const isEmpty = v => v == null || (Array.isArray(v) ? !v.length : typeof v === 'object' ? !Object.keys(v).length : false)

export function AccountProvider({ children }) {
  const [status, setStatus] = useState('loading')
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [sub, setSub] = useState(null)
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [error, setError] = useState(null)
  const [recovery, setRecovery] = useState(false) // arrivato dal link "reimposta la password"
  const sb = useRef(null)
  const uidRef = useRef(null)

  // Righe dell'utente (RLS: solo le sue)
  const refresh = useCallback(async (u = uidRef.current) => {
    const c = sb.current
    if (!c || !u) return
    const [p, s, n] = await Promise.all([
      c.from('profiles').select('id, name, avatar_path, plan').eq('id', u).maybeSingle(),
      c.from('user_settings').select('favorites, risk, indicator').eq('user_id', u).maybeSingle(),
      c.from('alert_subscriptions').select('symbols, rule, telegram_chat_id, telegram_name').eq('user_id', u).maybeSingle(),
    ])
    if (p.error || s.error || n.error) { setError((p.error || s.error || n.error).message); return null }
    setProfile(p.data)
    setSub(n.data ? { symbols: n.data.symbols || [], rule: n.data.rule || DEFAULT_RULE, linked: !!n.data.telegram_chat_id, name: n.data.telegram_name } : null)
    if (p.data?.avatar_path) {
      const { data } = await c.storage.from('avatars').createSignedUrl(p.data.avatar_path, 3600)
      setAvatarUrl(data?.signedUrl || null)
    } else setAvatarUrl(null)
    return { profile: p.data, settings: s.data }
  }, [])

  // Chiamate al server con il token di accesso
  const api = useCallback(async (path, body) => {
    const { data } = await sb.current.auth.getSession()
    const token = data.session?.access_token
    if (!token) throw new Error('Sessione scaduta: accedi di nuovo')
    const r = await fetch(path, {
      method: body ? 'POST' : 'GET',
      headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined, cache: 'no-store',
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error || 'Server non raggiungibile')
    return j
  }, [])

  // Primo accesso da questo dispositivo: porto sull'account quello che era legato al dispositivo
  const migrate = useCallback(async (u, settings) => {
    const flag = 'migrated:' + u
    const c = sb.current
    if (!load(flag, false)) {
      const local = { favorites: load('favorites', null), risk: load('risk', null), params: load('params', null) }
      const patch = {}
      if (Array.isArray(local.favorites)) {
        const merged = [...new Set([...(settings?.favorites || []), ...local.favorites])].slice(0, 100)
        if (merged.length !== (settings?.favorites || []).length) patch.favorites = merged
      }
      if (isEmpty(settings?.risk) && !isEmpty(local.risk)) patch.risk = local.risk
      if (isEmpty(settings?.indicator) && !isEmpty(local.params)) patch.indicator = local.params
      if (Object.keys(patch).length) await c.from('user_settings').update(patch).eq('user_id', u)
      // Piano e vecchio collegamento Telegram del dispositivo: li sposta il server
      await api('/api/account', { action: 'migrate', deviceId: load('notifyId', null), plan: load('plan', null) }).catch(() => null)
      save(flag, true)
      return { ...settings, ...patch }
    }
    return settings
  }, [api])

  useEffect(() => {
    let alive = true, off = null
    const start = async () => {
      const c = await getClient().catch(() => null)
      if (!alive) return
      if (!c) { setStatus('off'); return }
      sb.current = c
      const onUser = async u => {
        if (!alive) return
        if (!u) { uidRef.current = null; setUser(null); setProfile(null); setSub(null); setAvatarUrl(null); setStatus('out'); return }
        if (uidRef.current === u.id) { setUser(u); return }
        uidRef.current = u.id
        setUser(u)
        const got = await refresh(u.id)
        if (!alive || !got) { setStatus('in'); return }
        const settings = await migrate(u.id, got.settings)
        // L'account vince: le sue impostazioni diventano quelle del dispositivo
        const remote = {}
        if (Array.isArray(settings?.favorites) && settings.favorites.length) remote.favorites = settings.favorites
        if (!isEmpty(settings?.risk)) remote.risk = settings.risk
        if (!isEmpty(settings?.indicator)) remote.params = settings.indicator
        if (Object.keys(remote).length) applyRemote(remote)
        await refresh(u.id) // piano e Telegram dopo il trasferimento
        if (alive) setStatus('in')
      }
      const { data } = c.auth.onAuthStateChange((event, session) => {
        if (event === 'PASSWORD_RECOVERY') setRecovery(true)
        setTimeout(() => onUser(session?.user || null), 0)
      })
      off = () => data.subscription.unsubscribe()
      const { data: s } = await c.auth.getSession()
      onUser(s.session?.user || null)
    }
    // Dopo il primo disegno, o subito se si torna dal login (token o codice nell'indirizzo)
    const back = /access_token|code=|error_description|type=recovery/.test(location.hash + location.search)
    const t = back ? setTimeout(start, 0) : (window.requestIdleCallback ? requestIdleCallback(start, { timeout: 1500 }) : setTimeout(start, 300))
    return () => { alive = false; off?.(); if (!back && window.cancelIdleCallback) cancelIdleCallback(t); clearTimeout(t) }
  }, [refresh, migrate])

  // Impostazioni sincronizzate: ogni salvataggio locale va anche sull'account (raggruppato)
  useEffect(() => {
    if (status !== 'in') return
    let pending = {}, timer = null
    const flush = () => {
      const patch = pending; pending = {}
      if (Object.keys(patch).length && uidRef.current) sb.current.from('user_settings').update(patch).eq('user_id', uidRef.current).then(({ error: e }) => { if (e) setError(e.message) })
    }
    const offSave = onSave((key, value) => {
      if (!(key in SYNC)) return
      pending[SYNC[key]] = value
      clearTimeout(timer); timer = setTimeout(flush, SAVE_DELAY)
    })
    const onHide = () => { if (document.hidden) { clearTimeout(timer); flush() } }
    document.addEventListener('visibilitychange', onHide)
    return () => { offSave(); clearTimeout(timer); flush(); document.removeEventListener('visibilitychange', onHide) }
  }, [status])

  const value = useMemo(() => ({
    status, user, profile, sub, avatarUrl, error, recovery,
    plan: status === 'in' ? profile?.plan || 'free' : 'free',
    // Ha una password? (account email; chi entra solo con Google non ce l'ha)
    hasPassword: !!user?.identities?.some(i => i.provider === 'email') || (user?.app_metadata?.providers || []).includes('email'),
    api, refresh: () => refresh(),
    signInGoogle: async () => {
      const { error: e } = await sb.current.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + '/' } })
      if (e) throw new Error(e.message)
    },
    // Esiste un account con questa email? (dal server, con limite di tentativi). null se non si può sapere.
    checkEmail: async email => {
      try {
        const r = await fetch('/api/auth-check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }), cache: 'no-store' })
        return r.ok ? await r.json() : null
      } catch { return null }
    },
    signIn: async (email, password) => {
      const { error: e } = await sb.current.auth.signInWithPassword({ email, password })
      if (e) fail(e)
    },
    // Registrazione: si entra subito (in Supabase "Confirm email" è spento)
    signUp: async (email, password) => {
      const { data, error: e } = await sb.current.auth.signUp({ email, password })
      if (e) fail(e)
      if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) fail({ code: 'user_already_exists' })
      // Se Supabase chiedesse ancora la conferma non ci sarebbe la sessione: entro con la password appena scelta
      if (!data?.session) {
        const { error: e2 } = await sb.current.auth.signInWithPassword({ email, password })
        if (e2) fail(e2)
      }
    },
    // "La tua email è corretta?": risposta salvata sull'account (metadati dell'utente)
    emailChecked: !!user?.user_metadata?.email_checked_at,
    confirmEmail: async () => {
      const { data, error: e } = await sb.current.auth.updateUser({ data: { email_checked_at: new Date().toISOString() } })
      if (e) fail(e)
      if (data?.user) setUser(data.user)
    },
    // Cambio email senza conferma: lo fa il server con i permessi di amministratore
    changeEmail: async email => {
      await api('/api/account', { action: 'email', email })
      const { data } = await sb.current.auth.refreshSession()
      if (data?.user) setUser(data.user)
    },
    // Password dimenticata: email con il link (modello "Reset password"), che riporta qui per impostarne una nuova
    resetPassword: async email => {
      const { error: e } = await sb.current.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/?reset=1' })
      if (e) fail(e)
    },
    updatePassword: async password => {
      const { error: e } = await sb.current.auth.updateUser({ password })
      if (e) fail(e)
      setRecovery(false)
      if (/[?&]reset=1/.test(location.search)) history.replaceState(history.state, '', location.pathname)
    },
    endRecovery: () => setRecovery(false),
    signOut: async () => { await sb.current.auth.signOut() },
    updateName: async name => {
      const { error: e } = await sb.current.from('profiles').update({ name: name.trim().slice(0, 60) || null }).eq('id', uidRef.current)
      if (e) throw new Error(e.message)
      await refresh()
    },
    uploadAvatar: async blob => {
      const u = uidRef.current
      const ext = blob.type === 'image/webp' ? 'webp' : 'jpg'
      const path = `${u}/avatar-${Date.now()}.${ext}`
      const { error: e } = await sb.current.storage.from('avatars').upload(path, blob, { contentType: blob.type, upsert: false, cacheControl: '3600' })
      if (e) throw new Error(e.message)
      const old = profile?.avatar_path
      const { error: e2 } = await sb.current.from('profiles').update({ avatar_path: path }).eq('id', u)
      if (e2) throw new Error(e2.message)
      if (old && old !== path) await sb.current.storage.from('avatars').remove([old])
      await refresh()
    },
    removeAvatar: async () => {
      const old = profile?.avatar_path
      await sb.current.from('profiles').update({ avatar_path: null }).eq('id', uidRef.current)
      if (old) await sb.current.storage.from('avatars').remove([old])
      await refresh()
    },
    setPlan: async plan => {
      await api('/api/account', { action: 'plan', plan })
      setProfile(p => (p ? { ...p, plan } : p))
    },
    saveSub: async patch => {
      setSub(s => ({ ...s, ...patch }))
      const { error: e } = await sb.current.from('alert_subscriptions').update(patch).eq('user_id', uidRef.current)
      if (e) { setError(e.message); throw new Error(e.message) }
    },
    deleteAccount: async () => {
      await api('/api/account', { action: 'delete' })
      remove_local_account(uidRef.current)
      await sb.current.auth.signOut({ scope: 'local' }).catch(() => null)
    },
  }), [status, user, profile, sub, avatarUrl, error, recovery, api, refresh])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// Dopo l'eliminazione: niente dati dell'account sul dispositivo (restano solo le preferenze locali di base)
function remove_local_account(uid) {
  try {
    localStorage.removeItem('crsi:migrated:' + uid)
    localStorage.removeItem('crsi:notify')
  } catch { /* niente */ }
}
