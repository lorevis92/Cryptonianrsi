import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import Icon from './Icon.jsx'
import { usePairs, matchPairs } from './SymbolPicker.jsx'
import { useAccount } from '../lib/account.jsx'
import { Login } from './AccountPanel.jsx'
import { planById, PLANS, TIMEFRAMES } from '../lib/plans.js'
import { fmtVol } from '../lib/format.js'
import { DEFAULT_RULE, APPROACH, MAX_SYMBOLS, MAX_RULE_TFS, RULE_LIMITS, cleanRule, isDefaultRule } from '../alerts/rules.js'

const POLL = 3e3 // dopo "Collega Telegram", controllo ogni 3 secondi se l'utente ha premuto Avvia
const join = a => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} e ${a[a.length - 1]}`)
const base = s => s.replace(/USDT$/, '')

// Pagina Notifiche: Telegram, regola e titoli seguiti. Serve l'account e il piano con gli avvisi.
export default function NotifyPanel({ onUpgrade, onPrivacy }) {
  const acc = useAccount()
  const premium = PLANS.find(p => p.alerts)
  if (acc.status === 'loading') return <p className="hint">Un attimo…</p>
  if (acc.status !== 'in') return <Login onPrivacy={onPrivacy} lead="Accedi per ricevere su Telegram gli avvisi dei titoli che segui." />
  if (!planById(acc.plan).alerts) {
    return (
      <div className="notify">
        <p className="notify__lead">Ricevi su Telegram un avviso appena 3m e 5m entrano insieme in ipervenduto o in ipercomprato, con un link che apre subito il titolo nell'app.</p>
        <ul className="notify__perks">
          <li>Controllo ogni minuto, sulla candela in corso</li>
          <li>Scegli tu i titoli e, se vuoi, la regola</li>
          <li>Avviso di avvicinamento quando stanno per entrare in zona</li>
        </ul>
        <p className="hint">Le notifiche sono incluse nel piano {premium.name}.</p>
        <button className="btn btn--ghost notify__wide" onClick={onUpgrade}>Passa al piano {premium.name}</button>
      </div>
    )
  }
  return <NotifySettings />
}

function NotifySettings() {
  const acc = useAccount()
  const [server, setServer] = useState(null) // { configured, bot }
  const [error, setError] = useState(null)
  const [link, setLink] = useState(null) // { url, expires }
  const [waiting, setWaiting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [editRule, setEditRule] = useState(false)
  const [draft, setDraft] = useState(null) // modifiche non ancora salvate
  const timer = useRef()

  useEffect(() => {
    acc.api('/api/notify').then(setServer).catch(e => setError(e.message))
    return () => clearTimeout(timer.current)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const linked = !!acc.sub?.linked
  // Link personale pronto prima del tocco: così il telefono apre Telegram senza blocchi
  useEffect(() => {
    if (!server?.configured || linked || (link && link.expires - Date.now() > 60e3)) return
    acc.api('/api/notify', { action: 'link' }).then(setLink).catch(e => setError(e.message))
  }, [server?.configured, linked, link]) // eslint-disable-line react-hooks/exhaustive-deps

  // In attesa che l'utente prema Avvia su Telegram
  useEffect(() => {
    if (!waiting || linked) { if (linked) setWaiting(false); return }
    let alive = true
    const tick = () => acc.refresh().catch(() => null).finally(() => { if (alive) t = setTimeout(tick, POLL) })
    let t = setTimeout(tick, POLL)
    const stop = setTimeout(() => setWaiting(false), 15 * 60e3)
    return () => { alive = false; clearTimeout(t); clearTimeout(stop) }
  }, [waiting, linked]) // eslint-disable-line react-hooks/exhaustive-deps

  // Le modifiche si salvano da sole sull'account, mezzo secondo dopo l'ultima
  const st = { ...acc.sub, ...draft }
  const update = patch => {
    const next = { ...draft, ...patch }
    setDraft(next)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const out = {}
      if (next.symbols) out.symbols = next.symbols
      if (next.rule) out.rule = cleanRule(next.rule)
      acc.saveSub(out).then(() => { setDraft(null); setError(null) }).catch(e => setError(e.message))
    }, 500)
  }

  const unlink = async () => {
    setBusy(true)
    try { await acc.api('/api/notify', { action: 'unlink' }); setLink(null); await acc.refresh() } catch (e) { setError(e.message) }
    setBusy(false)
  }

  if (!server || !acc.sub) return <p className="hint">{error ? 'Non riesco a raggiungere il server delle notifiche. Riprova tra poco.' : 'Carico le tue notifiche…'}</p>
  if (!server.configured) return <p className="hint">Le notifiche Telegram non sono ancora attive su questo server.</p>
  st.bot = server.bot

  const rule = st.rule || DEFAULT_RULE
  const symbols = st.symbols || []

  return (
    <div className="notify">
      <section className="notify__block" aria-labelledby="n-tg">
        <h3 id="n-tg" className="notify__title">Telegram</h3>
        {st.linked ? (
          <div className="notify__linked">
            <p><span className="notify__dot" aria-hidden="true" />Collegato{st.name ? <> come <b>{st.name}</b></> : ''}</p>
            <button className="btn btn--ghost" onClick={unlink} disabled={busy}>Scollega</button>
          </div>
        ) : <>
          <a className={'btn btn--ghost notify__wide notify__connect' + (link ? '' : ' is-off')} href={link?.url || undefined} target="_blank" rel="noopener noreferrer"
            aria-disabled={!link} onClick={e => { if (!link) e.preventDefault(); else setWaiting(true) }}>
            Collega Telegram
          </a>
          <p className="hint">{waiting ? 'In attesa: su Telegram premi Avvia, poi torna qui.' : `Si apre ${st.bot ? '@' + st.bot : 'il bot'} su Telegram: premi Avvia e il collegamento è fatto.`}</p>
        </>}
      </section>

      <section className="notify__block" aria-labelledby="n-rule">
        <div className="notify__row">
          <h3 id="n-rule" className="notify__title">Regola</h3>
          <button className="notify__link" aria-expanded={editRule} onClick={() => setEditRule(v => !v)}>{editRule ? 'Fatto' : 'Modifica'}</button>
        </div>
        <p className="notify__rule">
          Avviso quando {join(rule.tfs)} {rule.tfs.length > 1 ? 'sono tutti' : 'è'} sotto <b className="t-os">{rule.lower}</b> (ipervenduto) o sopra <b className="t-ob">{rule.upper}</b> (ipercomprato).
        </p>
        {editRule && <RuleEditor rule={rule} onChange={r => update({ rule: r })} />}
      </section>

      <section className="notify__block" aria-labelledby="n-sym">
        <div className="notify__row">
          <h3 id="n-sym" className="notify__title">Titoli seguiti</h3>
          <span className="hint">{symbols.length} di {MAX_SYMBOLS}</span>
        </div>
        <ul className="picker__list notify__list">
          {symbols.map(x => (
            <li key={x.s} className="picker__row notify__item">
              <span className="notify__sym">{base(x.s)}{x.s.endsWith('USDT') && <span className="picker__quote">USDT</span>}</span>
              <button className={'switch' + (x.near ? ' is-on' : '')} role="switch" aria-checked={x.near}
                onClick={() => update({ symbols: symbols.map(y => (y.s === x.s ? { ...y, near: !y.near } : y)) })}>
                <span className="switch__track" aria-hidden="true"><span /></span>Avvicinamento
              </button>
              <button className="icon-btn" aria-label={`Smetti di seguire ${x.s}`} onClick={() => update({ symbols: symbols.filter(y => y.s !== x.s) })}><Icon name="close" size={16} /></button>
            </li>
          ))}
          {!symbols.length && <li className="hint notify__empty">Nessun titolo: cerca qui sotto quelli per cui vuoi gli avvisi.</li>}
        </ul>
        <p className="hint notify__near">Avvicinamento: un avviso in più quando {rule.tfs.length > 1 ? 'tutti scendono' : 'scende'} sotto {APPROACH.lower} o {rule.tfs.length > 1 ? 'salgono' : 'sale'} sopra {APPROACH.upper}, prima di entrare in zona.</p>
        {symbols.length < MAX_SYMBOLS
          ? <SymbolSearch exclude={symbols.map(x => x.s)} onAdd={s => update({ symbols: [...symbols, { s, near: false }] })} />
          : <p className="hint">Hai raggiunto il massimo di {MAX_SYMBOLS} titoli.</p>}
      </section>

      <p className="hint">Un solo messaggio per ogni ingresso in zona: il successivo arriva quando il titolo ne è uscito. Il controllo gira ogni minuto.</p>
      {error && <p className="hint notify__error">Non riesco a salvare: {error}. Riprovo alla prossima modifica.</p>}
    </div>
  )
}

function RuleEditor({ rule, onChange }) {
  const [draft, setDraft] = useState({ lower: String(rule.lower), upper: String(rule.upper) })
  useEffect(() => setDraft({ lower: String(rule.lower), upper: String(rule.upper) }), [rule.lower, rule.upper])
  const toggle = tf => {
    const on = rule.tfs.includes(tf)
    if (on && rule.tfs.length === 1) return
    if (!on && rule.tfs.length >= MAX_RULE_TFS) return
    onChange({ ...rule, tfs: TIMEFRAMES.filter(t => (t === tf ? !on : rule.tfs.includes(t))) })
  }
  const num = (key, v) => {
    setDraft(d => ({ ...d, [key]: v }))
    const [lo, hi] = RULE_LIMITS[key]
    const n = Number(v)
    if (v !== '' && Number.isInteger(n) && n >= lo && n <= hi) onChange({ ...rule, [key]: n })
  }
  return (
    <div className="notify__editor">
      <p className="hint">Timeframe (da 1 a {MAX_RULE_TFS})</p>
      <div className="notify__tfs" role="group" aria-label="Timeframe della regola">
        {TIMEFRAMES.map(tf => (
          <button key={tf} className={'chip' + (rule.tfs.includes(tf) ? ' is-on' : '')} aria-pressed={rule.tfs.includes(tf)} onClick={() => toggle(tf)}>{tf}</button>
        ))}
      </div>
      <div className="indicator__grid">
        <label className="num"><span>Sotto (ipervenduto)</span>
          <input type="number" inputMode="numeric" min={RULE_LIMITS.lower[0]} max={RULE_LIMITS.lower[1]} value={draft.lower} onChange={e => num('lower', e.target.value)} />
        </label>
        <label className="num"><span>Sopra (ipercomprato)</span>
          <input type="number" inputMode="numeric" min={RULE_LIMITS.upper[0]} max={RULE_LIMITS.upper[1]} value={draft.upper} onChange={e => num('upper', e.target.value)} />
        </label>
      </div>
      {!isDefaultRule(rule) && <button className="btn btn--ghost" onClick={() => onChange(DEFAULT_RULE)}>Ripristina regola classica</button>}
    </div>
  )
}

function SymbolSearch({ exclude, onAdd }) {
  const [pairs, error] = usePairs()
  const [q, setQ] = useState('')
  const term = useDeferredValue(q.trim().toUpperCase())
  const found = useMemo(() => {
    const src = (pairs || []).filter(p => !exclude.includes(p.symbol))
    return term ? matchPairs(src, term, 30) : src.slice(0, 8)
  }, [pairs, term, exclude])
  return (
    <div className="picker notify__search">
      <label className="field">
        <Icon name="search" size={16} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Aggiungi un titolo: BTC, oro, NVDA…" aria-label="Cerca un titolo da seguire" />
      </label>
      {!term && pairs && <p className="hint picker__section">Più scambiati <span>volume 24 ore, USDT</span></p>}
      <ul className="picker__list">
        {found.map(p => (
          <li key={p.symbol} className="picker__row">
            <button className="picker__item" onClick={() => { onAdd(p.symbol); setQ('') }} aria-label={`Segui ${p.symbol}`}>
              <span>{p.base}</span>
              {p.symbol.endsWith('USDT') && <span className="picker__quote">USDT</span>}
              {p.vol > 0 && <span className="picker__vol" aria-hidden="true">{fmtVol(p.vol)}</span>}
            </button>
            <span className="notify__add" aria-hidden="true">Segui</span>
          </li>
        ))}
        {term && pairs && !found.length && <li className="hint">Nessuna coppia trovata per «{q}»</li>}
      </ul>
      {!pairs && <p className="hint">{error ? "Non riesco a caricare l'elenco di Bitunix." : 'Carico i titoli di Bitunix…'}</p>}
    </div>
  )
}
