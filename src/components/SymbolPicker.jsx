import { useEffect, useMemo, useState } from 'react'
import Icon from './Icon.jsx'

export const FAVORITES = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XAUUSDT', 'NVDAUSDT', 'TSLAUSDT', 'QQQUSDT']

// Ricerca su tutte le coppie di Bitunix: cripto, oro, azioni, indici.
export default function SymbolPicker({ current, onPick }) {
  const [pairs, setPairs] = useState(null)
  const [error, setError] = useState(null)
  const [q, setQ] = useState('')

  useEffect(() => {
    fetch('/api/pairs').then(r => r.json()).then(j => {
      if (j.error) throw new Error(j.error)
      setPairs(j.pairs.map(p => p.symbol).sort())
    }).catch(e => setError(e.message))
  }, [])

  const list = useMemo(() => {
    const src = pairs || FAVORITES
    const term = q.trim().toUpperCase()
    if (!term) return FAVORITES.filter(s => !pairs || pairs.includes(s))
    return src.filter(s => s.includes(term)).slice(0, 60)
  }, [pairs, q])

  return (
    <div className="picker">
      <label className="field">
        <Icon name="search" size={16} />
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="BTC, oro, NVDA…" aria-label="Cerca un titolo" />
      </label>
      {!q && <p className="hint">Preferiti</p>}
      {error && <p className="hint">Non riesco a caricare l'elenco di Bitunix. Puoi scegliere tra i preferiti.</p>}
      <ul className="picker__list">
        {list.map(s => (
          <li key={s}>
            <button className={'picker__item' + (s === current ? ' is-on' : '')} onClick={() => onPick(s)}>
              <span>{s.replace(/USDT$/, '')}</span><span className="picker__quote">USDT</span>
            </button>
          </li>
        ))}
        {q && pairs && !list.length && <li className="hint">Nessuna coppia trovata per «{q}»</li>}
      </ul>
    </div>
  )
}
