import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Icon from './components/Icon.jsx'
import Sheet from './components/Sheet.jsx'
import Confluence from './components/Confluence.jsx'
import TimeframeCard from './components/TimeframeCard.jsx'
import SymbolPicker from './components/SymbolPicker.jsx'
import PlanPanel from './components/PlanPanel.jsx'
import IndicatorPanel from './components/IndicatorPanel.jsx'
import NotifyPanel from './components/NotifyPanel.jsx'
import RiskPanel from './components/RiskPanel.jsx'
import { DisclaimerGate, LegalLine, LegalPanel, PrivacyPanel } from './components/Legal.jsx'
import AccountPanel from './components/AccountPanel.jsx'
import { useAccount } from './lib/account.jsx'
import { DISCLAIMER_VERSION } from './lib/legal.js'
import CardBoundary from './components/CardBoundary.jsx'
import BubbleMap from './components/BubbleMap.jsx'
import { useFavorites } from './lib/favorites.js'
import { useSymbolTails } from './lib/useScan.js'
import { alignment } from './lib/alignment.js'
import { bubbleData } from './lib/bubbleDraw.js'
import { TIMEFRAMES, planById } from './lib/plans.js'
import { DEFAULTS } from './lib/stochrsi.js'
import { MAIN_TREND_TF } from './lib/trend.js'
import { load, save, onRemote } from './lib/storage.js'

const MENU = [['account', 'Account'], ['plan', 'Il tuo piano'], ['indicator', 'Indicatore'], ['notify', 'Notifiche'], ['legal', 'Note legali'], ['privacy', 'Privacy']]

export default function App() {
  const [symbol, setSymbol] = useState(() => load('symbol', 'BTCUSDT'))
  // Il piano sta sull'account (senza login: Gratuito)
  const account = useAccount()
  const plan = account.plan
  const [params, setParams] = useState(() => ({ ...DEFAULTS, ...load('params', {}) }))
  const [states, setStates] = useState({})
  const [sheet, setSheet] = useState(null)
  const [favorites, toggleFavorite] = useFavorites()
  // Avvertenza del primo avvio, da accettare una volta
  const [accepted, setAccepted] = useState(() => load('disclaimer', 0) >= DISCLAIMER_VERSION)
  const accept = () => { save('disclaimer', DISCLAIMER_VERSION); setAccepted(true) }
  const chips = useRef()
  // La mappa a bolle è la pagina iniziale; il dettaglio di un titolo ci sta sopra nella cronologia,
  // così anche il tasto Indietro del telefono riporta alla mappa.
  const [view, setView] = useState('map')
  const [highlight, setHighlight] = useState(null) // titolo evidenziato nella mappa al ritorno dal dettaglio

  useEffect(() => {
    if (history.state?.crsi) history.replaceState(null, '')
    const onPop = () => setView(history.state?.crsi === 'detail' ? 'detail' : 'map')
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const openSymbol = useCallback(sym => {
    setSymbol(sym)
    setHighlight(null)
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

  // Link dagli avvisi Telegram (/?s=BTCUSDT): apre subito il dettaglio del titolo; Indietro porta alla mappa.
  useEffect(() => {
    const s = new URLSearchParams(location.search).get('s')?.toUpperCase()
    if (!s) return
    history.replaceState(null, '', location.pathname + location.hash)
    if (/^[A-Z0-9]{2,24}$/.test(s)) openSymbol(s)
  }, [openSymbol])

  useEffect(() => save('symbol', symbol), [symbol])
  // Impostazioni dell'indicatore arrivate dall'account
  useEffect(() => onRemote(['params'], () => setParams({ ...DEFAULTS, ...load('params', {}) })), [])
  useEffect(() => save('params', params), [params])
  useEffect(() => setStates({}), [symbol])
  // Il chip del titolo attivo resta in vista nella fila dei preferiti
  useEffect(() => {
    const el = view === 'detail' && chips.current?.querySelector('.chip.is-on')
    if (el) chips.current.scrollTo({ left: el.offsetLeft - chips.current.clientWidth / 2 + el.clientWidth / 2, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }, [symbol, favorites, view])

  const unlocked = planById(plan).timeframes
  const isFav = favorites.includes(symbol)
  const onState = useCallback((tf, s) => setStates(prev => (prev[tf] === s ? prev : { ...prev, [tf]: s })), [])
  const openPlans = useCallback(() => setSheet('plan'), [])

  // Bolla del titolo nel dettaglio: i timeframe sbloccati arrivano in tempo reale dalle card,
  // quelli bloccati dalla stessa scansione della mappa (che è visibile su tutti i piani).
  // Dalla stessa scansione arriva anche il trend EMA 200 di ogni timeframe.
  const scanTails = useSymbolTails(symbol, view === 'detail' ? TIMEFRAMES : [], params)
  const trends = useMemo(() => Object.fromEntries(TIMEFRAMES.map(tf => [tf, scanTails[tf]?.t])), [scanTails])
  const bubble = useMemo(() => {
    const tails = {}
    for (const tf of TIMEFRAMES) {
      if (unlocked.includes(tf)) { if (states[tf]?.k) tails[tf] = { k: states[tf].k, d: states[tf].d } }
      else if (scanTails[tf]) tails[tf] = scanTails[tf]
    }
    return { ...bubbleData(symbol, alignment(tails, params)), trend: trends[MAIN_TREND_TF] }
  }, [symbol, states, scanTails, trends, unlocked, params])
  const bubbleToMap = useCallback(() => { setHighlight(symbol); backToMap() }, [symbol, backToMap])

  const titles = { symbol: 'Scegli il titolo', menu: 'Menu', plan: 'Il tuo piano', indicator: 'Indicatore', notify: 'Notifiche', legal: 'Note legali', privacy: 'Privacy', risk: 'Calcola il rischio', account: account.status === 'in' ? 'Area personale' : 'Accedi' }

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
        <BubbleMap favorites={favorites} params={params} onOpen={openSymbol} highlight={highlight} onClearHighlight={() => setHighlight(null)}
          footer={<LegalLine onOpen={() => setSheet('legal')} />} />
      ) : (
        <main className="layout">
          <aside className="layout__side">
            <Confluence states={states} unlocked={unlocked} params={params} onLocked={openPlans} bubble={bubble} onBubble={bubbleToMap} onRisk={() => setSheet('risk')} trends={trends} />
          </aside>
          <div className="layout__cards">
            {TIMEFRAMES.map(tf => (
              <CardBoundary key={symbol + tf} tf={tf}>
                <TimeframeCard symbol={symbol} tf={tf} unlocked={unlocked.includes(tf)} params={params} onState={onState} onLocked={openPlans} trend={trends[tf]} />
              </CardBoundary>
            ))}
          </div>
          <div className="layout__legal"><LegalLine onOpen={() => setSheet('legal')} /></div>
        </main>
      )}

      <Sheet open={!!sheet} title={titles[sheet]} onClose={() => setSheet(null)}>
        {sheet === 'symbol' && <SymbolPicker current={symbol} favorites={favorites} onToggleFavorite={toggleFavorite} onPick={s => { openSymbol(s); setSheet(null) }} />}
        {sheet === 'menu' && (
          <ul className="menu">
            {MENU.map(([id, label]) => <li key={id}><button onClick={() => setSheet(id)}>{id === 'account' ? (account.status === 'in' ? 'Area personale' : 'Accedi') : label}{id === 'plan' && <span className="menu__meta">{planById(plan).name}</span>}{id === 'account' && account.status === 'in' && <span className="menu__meta">{account.profile?.name || account.user?.email}</span>}</button></li>)}
          </ul>
        )}
        {sheet === 'account' && <AccountPanel onPlans={() => setSheet('plan')} onNotify={() => setSheet('notify')} onPrivacy={() => setSheet('privacy')} />}
        {sheet === 'plan' && <PlanPanel onLogin={() => setSheet('account')} />}
        {sheet === 'indicator' && <IndicatorPanel params={params} onChange={setParams} />}
        {sheet === 'notify' && <NotifyPanel onUpgrade={() => setSheet('plan')} onPrivacy={() => setSheet('privacy')} />}
        {sheet === 'legal' && <LegalPanel />}
        {sheet === 'privacy' && <PrivacyPanel />}
        {sheet === 'risk' && <RiskPanel symbol={symbol} />}
      </Sheet>
      {!accepted && sheet !== 'legal' && <DisclaimerGate onAccept={accept} onRead={() => setSheet('legal')} />}
    </div>
  )
}
