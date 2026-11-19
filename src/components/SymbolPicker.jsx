import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import Icon from './Icon.jsx'
import { fmtVol } from '../lib/format.js'

// Elenco delle coppie tenuto in memoria: riaprendo la ricerca è subito pronto,
// e si aggiorna in sottofondo ogni 5 minuti (volume 24h compreso).
const REFRESH = 5 * 60e3
const TOP_SHOWN = 100 // a ricerca vuota; scrivendo si cerca tra tutte
const cache = { pairs: null, at: 0, job: null }

function loadPairs() {
  if (!cache.job) {
    cache.job = fetch('/api/pairs').then(r => r.json()).then(j => {
      if (j.error) throw new Error(j.error)
      cache.pairs = j.pairs.map(p => ({ symbol: p.symbol, base: (p.base || p.symbol.replace(/USDT$/, '')).toUpperCase(), vol: Number(p.vol) || 0 }))
        .sort((a, b) => b.vol - a.vol)
      cache.at = Date.now()
      return cache.pairs
    }).finally(() => { cache.job = null })
  }
  return cache.job
}

// Elenco delle coppie, aggiornato ogni 5 minuti mentre il componente è aperto. Restituisce [pairs, error].
export function usePairs() {
  const [pairs, setPairs] = useState(cache.pairs)
  const [error, setError] = useState(null)
  useEffect(() => {
    let alive = true
    const refresh = () => loadPairs().then(p => { if (alive) { setPairs(p); setError(null) } }).catch(e => { if (alive) setError(e.message) })
    if (!cache.pairs || Date.now() - cache.at > REFRESH) refresh()
    const t = setInterval(refresh, REFRESH)
    return () => { alive = false; clearInterval(t) }
  }, [])
  return [pairs, error]
}

// Corrispondenza esatta, poi "inizia con", poi le altre; dentro ogni gruppo per volume.
export function matchPairs(src, term, max = 60) {
  const exact = [], starts = [], rest = []
  for (const p of src) { // già in ordine di volume, quindi ogni gruppo resta ordinato per volume
    if (p.base === term || p.symbol === term) exact.push(p)
    else if (p.base.startsWith(term) || p.symbol.startsWith(term)) starts.push(p)
    else if (p.symbol.includes(term)) rest.push(p)
  }
  return [...exact, ...starts, ...rest].slice(0, max)
}

// Ricerca su tutte le coppie di Bitunix, dalle più scambiate nelle ultime 24 ore.
// Senza testo: preferiti, poi i più scambiati. Scrivendo: corrispondenza esatta, poi "inizia con", poi le altre.
export default function SymbolPicker({ current, favorites, onToggleFavorite, onPick }) {
  const [pairs, error] = usePairs()
  const [q, setQ] = useState('')
  const term = useDeferredValue(q.trim().toUpperCase())

  const bySymbol = useMemo(() => new Map((pairs || []).map(p => [p.symbol, p])), [pairs])
  const info = s => bySymbol.get(s) || { symbol: s, base: s.replace(/USDT$/, ''), vol: 0 }

  const found = useMemo(() => {
    if (!term) return []
    return matchPairs(pairs || favorites.map(info), term)
  }, [pairs, favorites, term]) // eslint-disable-line react-hooks/exhaustive-deps

  const top = useMemo(() => (pairs || []).filter(p => !favorites.includes(p.symbol)).slice(0, TOP_SHOWN), [pairs, favorites])

  const row = p => {
    const s = p.symbol
    const fav = favorites.includes(s)
    const vol = p.vol > 0 ? fmtVol(p.vol) : null
    return (
      <li key={s} className="picker__row">
        <button className={'picker__item' + (s === current ? ' is-on' : '')} onClick={() => onPick(s)}
          aria-label={`${s}${vol ? `, volume 24 ore ${vol} USDT` : ''}`}>
          <span>{s.replace(/USDT$/, '')}</span>
          {s.endsWith('USDT') && <span className="picker__quote">USDT</span>}
          {vol && <span className="picker__vol" aria-hidden="true">{vol}</span>}
        </button>
        <button className={'star' + (fav ? ' is-on' : '')} onClick={() => onToggleFavorite(s)} aria-pressed={fav}
          aria-label={fav ? `Togli ${s} dai preferiti` : `Aggiungi ${s} ai preferiti`}>
          <Icon name="star" size={18} filled={fav} />
        </button>
      </li>
    )
  }

  return (
    <div className="picker">
      <label className="field">
        <Icon name="search" size={16} />
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="BTC, oro, NVDA…" aria-label="Cerca un titolo" />
      </label>
      {error && !pairs && <p className="hint">Non riesco a caricare l'elenco di Bitunix. Puoi scegliere tra i preferiti.</p>}

      {term ? (
        <ul className="picker__list">
          {found.map(row)}
          {pairs && !found.length && <li className="hint">Nessuna coppia trovata per «{q}»</li>}
        </ul>
      ) : (
        <>
          <p className="hint picker__section">Preferiti</p>
          <ul className="picker__list">
            {favorites.map(s => row(info(s)))}
            {!favorites.length && <li className="hint">Tocca la stellina accanto a un titolo per aggiungerlo qui.</li>}
          </ul>
          {top.length > 0 && <>
            <p className="hint picker__section">Più scambiati <span>volume 24 ore, USDT</span></p>
            <ul className="picker__list">{top.map(row)}</ul>
            {pairs.length > top.length + favorites.length && <p className="hint">Scrivi per cercare tra tutti i {pairs.length} titoli di Bitunix.</p>}
          </>}
          {!pairs && !error && <p className="hint">Carico i titoli di Bitunix…</p>}
        </>
      )}
    </div>
  )
}
