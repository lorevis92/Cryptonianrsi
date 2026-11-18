import { useCallback, useEffect, useRef, useState } from 'react'
import Icon from './components/Icon.jsx'
import Sheet from './components/Sheet.jsx'
import Confluence from './components/Confluence.jsx'
import TimeframeCard from './components/TimeframeCard.jsx'
import SymbolPicker from './components/SymbolPicker.jsx'
import PlanPanel from './components/PlanPanel.jsx'
import IndicatorPanel from './components/IndicatorPanel.jsx'
import AlertsPanel from './components/AlertsPanel.jsx'
import CardBoundary from './components/CardBoundary.jsx'
import BubbleMap from './components/BubbleMap.jsx'
import { useFavorites } from './lib/favorites.js'
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
  const [favorites, toggleFavorite] = useFavorites()
  const chips = useRef()
  // La mappa a bolle è la pagina iniziale; il dettaglio di un titolo ci sta sopra nella cronologia,
  // così anche il tasto Indietro del telefono riporta alla mappa.
  const [view, setView] = useState('map')

  useEffect(() => {
    if (history.state?.crsi) history.replaceState(null, '')
    const onPop = () => setView(history.state?.crsi === 'detail' ? 'detail' : 'map')
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const openSymbol = useCallback(sym => {
    setSymbol(sym)
    setView(v => {
      if (v !== 'detail') history.pushState({ crsi: 'detail' }, '')
      return 'detail'
    })
    window.scrollTo(0, 0)
  }, [])
  const backToMap = useCallback(() => {
    if (history.state?.crsi === 'detail') history.back()
    else setView('map')
  }, [])

  useEffect(() => save('symbol', symbol), [symbol])
  useEffect(() => save('plan', plan), [plan])
  useEffect(() => save('params', params), [params])
  useEffect(() => setStates({}), [symbol])
  // Il chip del titolo attivo resta in vista nella fila dei preferiti
  useEffect(() => {
    const el = view === 'detail' && chips.current?.querySelector('.chip.is-on')
    if (el) chips.current.scrollTo({ left: el.offsetLeft - chips.current.clientWidth / 2 + el.clientWidth / 2, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }, [symbol, favorites, view])
  useEffect(() => { runAlerts(symbol, states, load('alertPrefs', null)) }, [symbol, states])

  const unlocked = planById(plan).timeframes
  const isFav = favorites.includes(symbol)
  const onState = useCallback((tf, s) => setStates(prev => (prev[tf] === s ? prev : { ...prev, [tf]: s })), [])
  const openPlans = useCallback(() => setSheet('plan'), [])

  const titles = { symbol: 'Scegli il titolo', menu: 'Menu', plan: 'Il tuo piano', indicator: 'Indicatore', alerts: 'Avvisi' }

  return (
    <div className={'app is-' + view}>
      <div className="topbar">
        {/* Telefono: in alto mappa, titolo e menu; sotto il selettore del titolo con i preferiti.
            Da 980px tutto su una riga, con i preferiti sotto. */}
        <header className="top">
          {view === 'detail' && (
            <button className="icon-btn top__back" onClick={backToMap} aria-label="Torna alla mappa"><Icon name="bubbles" size={20} /></button>
          )}
          <div className="brand">
            <span className="brand__name">Cryptonian <em>RSI</em></span>
          </div>
          <div className="symbol">
            {view === 'map' ? (
              <button className="symbol-btn" onClick={() => setSheet('symbol')} aria-label="Cerca un titolo">
                <Icon name="search" size={15} /><span className="symbol-btn__quote">Cerca</span>
              </button>
            ) : <>
              <button className={'star' + (isFav ? ' is-on' : '')} onClick={() => toggleFavorite(symbol)} aria-pressed={isFav}
                aria-label={isFav ? `Togli ${symbol} dai preferiti` : `Aggiungi ${symbol} ai preferiti`}>
                <Icon name="star" size={18} filled={isFav} />
              </button>
              <button className="symbol-btn" onClick={() => setSheet('symbol')} aria-label={`Titolo: ${symbol}. Cambia`}>
                <span className="symbol-btn__base">{symbol.replace(/USDT$/, '')}</span>
                {symbol.endsWith('USDT') && <span className="symbol-btn__quote">USDT</span>}
                <Icon name="chevron" size={14} />
              </button>
            </>}
          </div>
          <button className="icon-btn top__menu" onClick={() => setSheet('menu')} aria-label="Apri il menu"><Icon name="menu" /></button>
          <span className="top__break" aria-hidden="true" />
          <nav className="chips" ref={chips} aria-label="Preferiti">
            {favorites.length
              ? favorites.map(f => (
                <button key={f} className={'chip' + (view === 'detail' && f === symbol ? ' is-on' : '')} onClick={() => openSymbol(f)} aria-current={view === 'detail' && f === symbol ? 'true' : undefined}>
                  {f.replace(/USDT$/, '')}
                </button>
              ))
              : <span className="chips__empty">Tocca la stellina per aggiungere preferiti.</span>}
          </nav>
        </header>
      </div>

      {view === 'map' ? (
        <BubbleMap favorites={favorites} params={params} onOpen={openSymbol} />
      ) : (
        <main className="layout">
          <aside className="layout__side">
            <Confluence states={states} unlocked={unlocked} params={params} onLocked={openPlans} />
          </aside>
          <div className="layout__cards">
            {TIMEFRAMES.map(tf => (
              <CardBoundary key={symbol + tf} tf={tf}>
                <TimeframeCard symbol={symbol} tf={tf} unlocked={unlocked.includes(tf)} params={params} onState={onState} onLocked={openPlans} />
              </CardBoundary>
            ))}
          </div>
        </main>
      )}

      <Sheet open={!!sheet} title={titles[sheet]} onClose={() => setSheet(null)}>
        {sheet === 'symbol' && <SymbolPicker current={symbol} favorites={favorites} onToggleFavorite={toggleFavorite} onPick={s => { openSymbol(s); setSheet(null) }} />}
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
