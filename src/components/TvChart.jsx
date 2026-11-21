import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import Icon from './Icon.jsx'

// "Storico completo" per azioni e materie prime: il widget gratuito ufficiale di TradingView (Advanced Chart)
// del titolo sottostante, con timeframe settimanale o giornaliero e l'EMA 200 già attiva.
// Il marchio e il link di TradingView restano come li prevede il widget (lo chiedono i loro termini d'uso).
let scriptJob = null
function loadTv() {
  scriptJob ||= new Promise((resolve, reject) => {
    if (window.TradingView) return resolve(window.TradingView)
    const s = document.createElement('script')
    s.src = 'https://s3.tradingview.com/tv.js'
    s.async = true
    s.onload = () => resolve(window.TradingView)
    s.onerror = () => { scriptJob = null; reject(new Error('TradingView non raggiungibile')) }
    document.head.appendChild(s)
  })
  return scriptJob
}

export default function TvChart({ tvSymbol, tf, name, onClose }) {
  const id = 'tv-' + useId().replace(/[^a-zA-Z0-9]/g, '')
  const box = useRef()

  useEffect(() => {
    let alive = true
    loadTv().then(TV => {
      if (!alive || !TV || !box.current) return
      // eslint-disable-next-line no-new
      new TV.widget({
        container_id: id,
        symbol: tvSymbol,
        interval: tf === '1w' ? 'W' : 'D',
        // niente range: con range 'ALL' TradingView passa al mensile e ignora il settimanale
        autosize: true,
        theme: 'dark',
        style: '1',
        locale: 'it',
        timezone: 'Europe/Rome',
        toolbar_bg: '#06070B',
        backgroundColor: '#06070B',
        gridColor: 'rgba(200, 169, 106, 0.06)',
        enable_publishing: false,
        allow_symbol_change: false,
        hide_side_toolbar: true,
        withdateranges: true,
        save_image: false,
        studies: [{ id: 'MAExp@tv-basicstudies', inputs: { length: 200 } }],
      })
    }).catch(() => { if (alive && box.current) box.current.textContent = 'Non riesco a caricare il grafico di TradingView. Riprova tra poco.' })
    const esc = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc)
    return () => { alive = false; window.removeEventListener('keydown', esc) }
  }, [tvSymbol, tf]) // eslint-disable-line react-hooks/exhaustive-deps

  return createPortal(
    <div className="tv" role="dialog" aria-modal="true" aria-label={`Storico completo di ${name}`}>
      <header className="tv__head">
        <span className="tv__title"><b>{name}</b> · Storico completo <small>{tf === '1w' ? 'settimanale' : 'giornaliero'} · {tvSymbol}</small></span>
        <button className="icon-btn" onClick={onClose} aria-label="Chiudi"><Icon name="close" /></button>
      </header>
      <div className="tv__chart"><div id={id} ref={box} className="tv__host" /></div>
      <p className="tv__credit">
        <a href={`https://www.tradingview.com/symbols/${tvSymbol.replace(':', '-')}/`} rel="noopener nofollow" target="_blank">Grafico di {tvSymbol}</a> fornito da TradingView
      </p>
    </div>,
    document.body,
  )
}
