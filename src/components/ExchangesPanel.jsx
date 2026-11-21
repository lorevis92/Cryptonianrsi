import { EXCHANGES, EXCHANGES_INTRO, EXCHANGES_NOTE } from '../lib/exchanges.js'

// Exchange consigliati: una scheda per exchange (nome, punti, Registrati). Niente loghi: solo il nome, in serif oro.
export default function ExchangesPanel() {
  return (
    <div className="exchanges">
      <p className="exchanges__intro">{EXCHANGES_INTRO}</p>
      {EXCHANGES.map(x => (
        <article key={x.id} className="exchange" aria-labelledby={'ex-' + x.id}>
          <h3 id={'ex-' + x.id} className="exchange__name">{x.name}</h3>
          <ul className="exchange__points">
            {x.points.map(p => <li key={p}>{p}</li>)}
          </ul>
          <a className="btn exchange__cta" href={x.url} target="_blank" rel="noopener noreferrer sponsored" aria-label={`Registrati su ${x.name} (si apre in una nuova scheda)`}>
            Registrati
          </a>
        </article>
      ))}
      <p className="exchanges__note">{EXCHANGES_NOTE}</p>
    </div>
  )
}
