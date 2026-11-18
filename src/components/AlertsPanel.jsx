import { CHANNELS } from '../alerts/channels.js'

// Predisposto: i canali ci sono, l'algoritmo degli avvisi arriverà dopo.
export default function AlertsPanel({ plan }) {
  return (
    <div className="alerts">
      <p className="alerts__lead">Ti avviseremo quando i timeframe si allineano e il metodo dice di entrare.</p>
      <ul className="alerts__list">
        {CHANNELS.map(c => <li key={c.id}><span>{c.name}</span><span className="tag">In arrivo</span></li>)}
      </ul>
      {plan !== 'cryptonian' && <p className="hint">Gli avvisi saranno inclusi nel piano Cryptonian.</p>}
    </div>
  )
}
