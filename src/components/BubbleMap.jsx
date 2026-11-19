import { useEffect, useMemo, useRef, useState } from 'react'
import BubbleCanvas from './BubbleCanvas.jsx'
import MiniRings from './MiniRings.jsx'
import Icon from './Icon.jsx'
import { useScan } from '../lib/useScan.js'
import { alignment, SIGNAL_TIMEFRAMES, WEIGHTS, IN_ZONE_BASE, STRONG_SCORE } from '../lib/alignment.js'
import { bubbleData } from '../lib/bubbleDraw.js'
import { TIMEFRAMES } from '../lib/plans.js'
import { ZONE_LABEL, STRONG_LABEL, ATTENTION_LABEL, signalLabel } from '../lib/format.js'
import { load, save } from '../lib/storage.js'

const FILTERS = [['all', 'Tutti'], ['oversold', 'Ipervenduto'], ['overbought', 'Ipercomprato']]
const VIEWS = [['bubbles', 'Bolle'], ['list', 'Elenco']]
// "aggiornato 3 min fa"
function ago(ms) {
  const m = Math.floor(ms / 60e3)
  if (m < 1) return 'adesso'
  if (m < 60) return `${m} min fa`
  const h = Math.floor(m / 60)
  if (h < 24) return h === 1 ? "un'ora fa" : `${h} ore fa`
  const d = Math.floor(h / 24)
  return d === 1 ? 'ieri' : `${d} giorni fa`
}
const fmtW = w => String(w).replace('.', ',')
const listJoin = a => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} o ${a[a.length - 1]}`)

// Pagina iniziale: l'allineamento dello Stochastic RSI sui 7 timeframe, a colpo d'occhio.
export default function BubbleMap({ favorites, params, onOpen, highlight = null, onClearHighlight, footer = null }) {
  const [view, setView] = useState(() => load('mapView', 'bubbles'))
  const [filter, setFilter] = useState(() => load('mapFilter', 'all'))
  const [legend, setLegend] = useState(false)
  useEffect(() => save('mapView', view), [view])
  useEffect(() => save('mapFilter', filter), [filter])

  const { tails, symbols, loaded, error, at } = useScan(favorites, params)
  // Orologio per "aggiornato X min fa"
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30e3); return () => clearInterval(t) }, [])

  const rows = useMemo(() => symbols.map((s, rank) => ({ ...bubbleData(s, alignment(tails[s], params)), rank })), [tails, symbols, params])

  const match = r => filter === 'all' || (r.side === filter && r.score > 0)
  const items = useMemo(() => rows.map(r => ({ ...r, visible: match(r), signal: !!r.signal })), [rows, filter]) // eslint-disable-line react-hooks/exhaustive-deps
  const ranked = useMemo(() => rows.filter(match).sort((a, b) => b.score - a.score || a.rank - b.rank), [rows, filter]) // eslint-disable-line react-hooks/exhaustive-deps

  // Titolo evidenziato tornando dal dettaglio: se il filtro lo nasconde, torno a "Tutti";
  // nell'elenco la sua riga viene portata in vista.
  const hlRow = useRef()
  const hl = rows.find(r => r.id === highlight)
  useEffect(() => {
    if (hl && filter !== 'all' && !match(hl)) setFilter('all')
  }, [highlight, hl?.side, hl?.score]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (view === 'list') hlRow.current?.scrollIntoView({ block: 'center' })
  }, [view, highlight, !!hl]) // eslint-disable-line react-hooks/exhaustive-deps

  const status = !loaded ? (error ? 'Bitunix non risponde, riprovo tra poco.' : null)
    : loaded < TIMEFRAMES.length && !at ? `Sto leggendo i timeframe: ${loaded} di ${TIMEFRAMES.length}`
    : at ? `Aggiornato ${ago(Math.max(0, now - at))}${error ? ' · nuovo tentativo tra poco' : ''}` : null

  return (
    <section className="map" aria-label="Mappa dell'allineamento">
      <div className="map__bar">
        <div className="seg" role="group" aria-label="Vista">
          {VIEWS.map(([id, label]) => (
            <button key={id} className={'seg__btn' + (view === id ? ' is-on' : '')} aria-pressed={view === id} onClick={() => setView(id)}>{label}</button>
          ))}
        </div>
        <button className={'map__legend-btn' + (legend ? ' is-on' : '')} aria-expanded={legend} aria-controls="legenda" onClick={() => setLegend(v => !v)}>
          Legenda<Icon name="chevron" size={14} />
        </button>
        <div className="seg seg--filter" role="group" aria-label="Filtro">
          {FILTERS.map(([id, label]) => (
            <button key={id} className={`seg__btn is-${id}` + (filter === id ? ' is-on' : '')} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>
          ))}
        </div>
      </div>

      {legend && (
        <div className="legend" id="legenda">
          <MiniRings size={92} rings={{ '1d': 0.9, '4h': 0.7, '1h': 0.45, '15m': 0, '5m': -0.3, '3m': -0.6, '1m': -0.95 }} signal />
          <div className="legend__text">
            <p><b>Lo Stochastic RSI</b> va da 0 a 100 e dice se un prezzo ha corso troppo: sotto {params.lower} è <em className="t-os">ipervenduto</em> (il prezzo è sceso molto e in fretta), sopra {params.upper} è <em className="t-ob">ipercomprato</em> (è salito molto e in fretta). Descrive il movimento, non dice cosa fare.</p>
            <p><b>Ogni anello è un timeframe.</b> All'esterno 1d, poi 4h, 1h, 15m, 5m, 3m, fino a 1m al centro. Più K è estremo, più il colore è pieno.</p>
            <p className="legend__keys">
              <span><i className="key key--os" />Ipervenduto</span>
              <span><i className="key key--ob" />Ipercomprato</span>
              <span><i className="key key--n" />Neutro</span>
              <span><i className="key key--sig" />Zona di attenzione</span>
            </p>
            <p><b>Il punteggio, da 0 a 100,</b> conta soprattutto quanti timeframe sono nella stessa zona: sotto {params.lower} o sopra {params.upper}. I timeframe grandi pesano di più:</p>
            <p className="legend__weights">
              {Object.entries(WEIGHTS).map(([tf, w]) => <span key={tf}>{tf} <b>{fmtW(w)}</b></span>)}
            </p>
            <p>Ogni timeframe in zona porta il {Math.round(IN_ZONE_BASE * 100)}% del suo peso; il resto è un piccolo bonus che cresce quanto più K è estremo. Tutti e 7 nella stessa zona fanno almeno {Math.round(IN_ZONE_BASE * 100)}, fino a 100. 0 vuol dire nessun timeframe in zona. Un timeframe nella zona opposta toglie punti. Il punteggio non è relativo: il primo dell'elenco non ha per forza 100. Il colore del numero dice la direzione: <em className="t-os">ciano ipervenduto</em>, <em className="t-ob">rosa ipercomprato</em>.</p>
            <p>Da {Math.round(STRONG_SCORE * 100)} in su la lettura diventa forte: <em className="t-os">{STRONG_LABEL.oversold}</em> · {ATTENTION_LABEL.oversold} o <em className="t-ob">{STRONG_LABEL.overbought}</em> · {ATTENTION_LABEL.overbought}.</p>
            <p><b>Nelle Bolle lo stesso punteggio decide la grandezza:</b> più è alto, più la bolla è grande e luminosa.</p>
            <p>L'anello dorato indica una zona di attenzione: K ha appena incrociato D dentro la zona su {listJoin(SIGNAL_TIMEFRAMES)}. Sono letture dell'indicatore, non indicazioni a comprare o vendere.</p>
          </div>
        </div>
      )}

      <p className="map__status">{status || ' '}</p>

      {view === 'bubbles' ? (
        <div className="map__stage">
          <BubbleCanvas items={items} highlight={highlight} onPick={onOpen} onBlank={onClearHighlight} label={`Mappa a bolle di ${items.filter(i => i.visible).length} titoli. Per leggerli uno per uno usa la vista Elenco.`} />
          {!rows.length && <p className="map__empty">Sto leggendo il mercato…</p>}
          {rows.length > 0 && loaded > 0 && !ranked.length && <p className="map__empty">Nessun titolo in {filter === 'oversold' ? 'ipervenduto' : 'ipercomprato'} adesso.</p>}
        </div>
      ) : (
        <ol className="rank">
          {ranked.map((r, i) => (
            <li key={r.id} ref={r.id === highlight ? hlRow : undefined}>
              <button className={`rank__row is-${r.side}` + (r.id === highlight ? ' is-highlight' : '')} onClick={() => onOpen(r.id)} aria-current={r.id === highlight ? 'true' : undefined}>
                <span className="rank__pos">{i + 1}</span>
                <MiniRings rings={r.rings} signal={!!r.signal} />
                <span className="rank__name">
                  {r.label}
                  <small>
                    {r.loaded ? (r.side === 'neutral' ? 'Nessuna zona estrema' : r.score >= STRONG_SCORE ? STRONG_LABEL[r.side] : ZONE_LABEL[r.side]) : 'In lettura'}
                    {r.signal && <em className="rank__sig">{signalLabel(r.signal.tf)}</em>}
                  </small>
                </span>
                <span className="rank__score" aria-label={`Punteggio ${Math.round(r.score * 100)} su 100`}>{Math.round(r.score * 100)}<small aria-hidden="true">/100</small></span>
              </button>
            </li>
          ))}
          {rows.length > 0 && !ranked.length && <li className="hint rank__empty">Nessun titolo in {filter === 'oversold' ? 'ipervenduto' : 'ipercomprato'} adesso.</li>}
          {!rows.length && <li className="hint rank__empty">Sto leggendo il mercato…</li>}
        </ol>
      )}
      {footer}
    </section>
  )
}
