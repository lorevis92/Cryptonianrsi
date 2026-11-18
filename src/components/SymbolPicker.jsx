import { useEffect, useMemo, useState } from 'react'
import Icon from './Icon.jsx'

// Ricerca su tutte le coppie di Bitunix: cripto, oro, azioni, indici.
// Senza testo: prima i preferiti, poi tutti gli altri titoli.
export default function SymbolPicker({ current, favorites, onToggleFavorite, onPick }) {
  const [pairs, setPairs] = useState(null)
  const [error, setError] = useState(null)
  const [q, setQ] = useState('')

  useEffect(() => {
    fetch('/api/pairs').then(r => r.json()).then(j => {
      if (j.error) throw new Error(j.error)
      setPairs(j.pairs.map(p => p.symbol).sort())
    }).catch(e => setError(e.message))
  }, [])

  const term = q.trim().toUpperCase()
  const found = useMemo(() => (term ? (pairs || favorites).filter(s => s.includes(term)).slice(0, 60) : []), [pairs, favorites, term])
  const others = useMemo(() => (pairs || []).filter(s => !favorites.includes(s)), [pairs, favorites])

  const row = s => {
    const fav = favorites.includes(s)
    return (
      <li key={s} className="picker__row">
        <button className={'picker__item' + (s === current ? ' is-on' : '')} onClick={() => onPick(s)}>
          <span>{s.replace(/USDT$/, '')}</span><span className="picker__quote">USDT</span>
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
      {error && <p className="hint">Non riesco a caricare l'elenco di Bitunix. Puoi scegliere tra i preferiti.</p>}

      {term ? (
        <ul className="picker__list">
          {found.map(row)}
          {pairs && !found.length && <li className="hint">Nessuna coppia trovata per «{q}»</li>}
        </ul>
      ) : (
        <>
          <p className="hint">Preferiti</p>
          <ul className="picker__list">
            {favorites.map(row)}
            {!favorites.length && <li className="hint">Tocca la stellina accanto a un titolo per aggiungerlo qui.</li>}
          </ul>
          {others.length > 0 && <>
            <p className="hint">Tutti i titoli</p>
            <ul className="picker__list">{others.map(row)}</ul>
          </>}
        </>
      )}
    </div>
  )
}
