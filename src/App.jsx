import { useCallback, useEffect, useState } from 'react'
import Icon from './components/Icon.jsx'
import Sheet from './components/Sheet.jsx'
import Confluence from './components/Confluence.jsx'
import TimeframeCard from './components/TimeframeCard.jsx'
import SymbolPicker from './components/SymbolPicker.jsx'
import PlanPanel from './components/PlanPanel.jsx'
import IndicatorPanel from './components/IndicatorPanel.jsx'
import AlertsPanel from './components/AlertsPanel.jsx'
import { TIMEFRAMES, planById } from './lib/plans.js'
import { DEFAULTS } from './lib/stochrsi.js'
import { load, save } from './lib/storage.js'
import { runAlerts } from './alerts/index.js'

const MENU = [['plan', 'Il tuo piano'], ['indicator', 'Indicatore'], ['alerts', 'Avvisi']]

export default function App() {
  const [symbol, setSymbol] = useState(() => load('symbol', 'BTCUSDT'))
  const [plan, setPlan] = useState(() => load('plan', 'free'))
  const [params, setParams] = useState(() => ({ ...DEFAULTS, ...load('params', {}) }))
  const [states, setStates] = useState({})
  const [sheet, setSheet] = useState(null)

  useEffect(() => save('symbol', symbol), [symbol])
  useEffect(() => save('plan', plan), [plan])
  useEffect(() => save('params', params), [params])
  useEffect(() => setStates({}), [symbol])
  useEffect(() => { runAlerts(symbol, states, load('alertPrefs', null)) }, [symbol, states])

  const unlocked = planById(plan).timeframes
  const onState = useCallback((tf, s) => setStates(prev => (prev[tf] === s ? prev : { ...prev, [tf]: s })), [])
  const openPlans = useCallback(() => setSheet('plan'), [])

  const titles = { symbol: 'Scegli il titolo', menu: 'Menu', plan: 'Il tuo piano', indicator: 'Indicatore', alerts: 'Avvisi' }

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="brand__name">Cryptonian <em>RSI</em></span>
        </div>
        <button className="symbol-btn" onClick={() => setSheet('symbol')} aria-label={`Titolo: ${symbol}. Cambia`}>
          {symbol.replace(/USDT$/, '')}<span>USDT</span><Icon name="chevron" size={14} />
        </button>
        <button className="icon-btn" onClick={() => setSheet('menu')} aria-label="Apri il menu"><Icon name="menu" /></button>
      </header>

      <main className="layout">
        <aside className="layout__side">
          <Confluence states={states} unlocked={unlocked} params={params} onLocked={openPlans} />
        </aside>
        <div className="layout__cards">
          {TIMEFRAMES.map(tf => (
            <TimeframeCard key={symbol + tf} symbol={symbol} tf={tf} unlocked={unlocked.includes(tf)} params={params} onState={onState} onLocked={openPlans} />
          ))}
        </div>
      </main>

      <Sheet open={!!sheet} title={titles[sheet]} onClose={() => setSheet(null)}>
        {sheet === 'symbol' && <SymbolPicker current={symbol} onPick={s => { setSymbol(s); setSheet(null) }} />}
        {sheet === 'menu' && (
          <ul className="menu">
            {MENU.map(([id, label]) => <li key={id}><button onClick={() => setSheet(id)}>{label}{id === 'plan' && <span className="menu__meta">{planById(plan).name}</span>}</button></li>)}
          </ul>
        )}
        {sheet === 'plan' && <PlanPanel plan={plan} onChange={setPlan} />}
        {sheet === 'indicator' && <IndicatorPanel params={params} onChange={setParams} />}
        {sheet === 'alerts' && <AlertsPanel plan={plan} />}
      </Sheet>
    </div>
  )
}
