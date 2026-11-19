import { useEffect, useMemo, useState } from 'react'
import { useCandles } from '../lib/useCandles.js'
import { atr, positionSize, takeProfit, takeProfitAt, ATR_LENGTH, STOP_ATR, RISK_DEFAULT, RISK_HINT, LEVERAGE_WARN, RISK_TFS, RR_DEFAULT, RR_CHOICES } from '../lib/risk.js'
import { fmtPrice, priceDecimals } from '../lib/format.js'
import { load, save } from '../lib/storage.js'

const SIDES = [['long', 'Long'], ['short', 'Short']]
const parse = v => { const n = Number(String(v).replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : NaN }
const comma = n => String(n).replace('.', ',')
const rrText = n => `${comma(Math.round(n * 10) / 10)}:1`
const money = n => n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pct = n => (n * 100).toLocaleString('it-IT', { maximumFractionDigits: n < 0.01 ? 2 : 1 }) + '%'
const qty = n => n.toLocaleString('it-IT', { maximumSignificantDigits: 4, maximumFractionDigits: n >= 1 ? 3 : 8 })
// Prezzo da mettere nel campo: stessi decimali di fmtPrice, senza separatore delle migliaia
const priceInput = (v, p) => v.toLocaleString('it-IT', { useGrouping: false, maximumFractionDigits: priceDecimals(v, p) })

// Mini-calcolatore di rischio nel dettaglio del titolo. Fa solo aritmetica sui valori inseriti.
export default function RiskPanel({ symbol }) {
  const [saved] = useState(() => load('risk', {}))
  const [capital, setCapital] = useState(saved.capital ?? '')
  const [risk, setRisk] = useState(saved.risk ?? comma(RISK_DEFAULT))
  const [side, setSide] = useState('long')
  const [tf, setTf] = useState('1h')
  const [stopIn, setStopIn] = useState(null) // null = stop suggerito
  const [rr, setRr] = useState(RR_DEFAULT)
  const [tpIn, setTpIn] = useState(null) // null = take profit a rr volte la distanza dello stop
  const [why, setWhy] = useState(false) // spiegazione al tocco (ATR)
  useEffect(() => save('risk', { capital, risk }), [capital, risk])
  useEffect(() => { setStopIn(null); setTpIn(null) }, [side, tf, symbol])

  const { bars, precision, error } = useCandles(symbol, tf, true)
  const price = bars?.length ? bars[bars.length - 1].c : null
  const a = useMemo(() => (bars ? atr(bars) : null), [bars])
  const suggested = price && a ? (side === 'long' ? price - STOP_ATR * a : price + STOP_ATR * a) : null
  const stop = stopIn == null ? suggested : parse(stopIn)

  const cap = parse(capital), r = parse(risk)
  const out = price && stop ? positionSize({ capital: cap, riskPct: r, price, stop, side }) : null
  const name = symbol.replace(/USDT$/, '')

  // Take profit: a rr volte la distanza dello stop, oppure scritto a mano
  const stopOk = price && stop > 0 && (side === 'long' ? stop < price : stop > price)
  const tpSuggested = stopOk ? takeProfitAt({ price, stop, side, rr }) : null
  const tp = tpIn == null ? tpSuggested : parse(tpIn)
  const tpOut = out && !out.error && tp != null ? takeProfit({ price, tp, side, size: out.size, dist: out.dist }) : null
  const pickRr = v => { setRr(v); setTpIn(null) }

  return (
    <div className="risk">
      <div className="indicator__grid">
        <label className="num"><span>Capitale (USDT)</span>
          <input type="text" inputMode="decimal" placeholder="1000" value={capital} onChange={e => setCapital(e.target.value)} />
        </label>
        <label className="num"><span>Rischio per trade (%)</span>
          <input type="text" inputMode="decimal" value={risk} onChange={e => setRisk(e.target.value)} />
        </label>
      </div>
      <p className={'hint' + (r > RISK_HINT[1] ? ' risk__warn' : '')}>
        {r > RISK_HINT[1] ? `Sopra il ${comma(RISK_HINT[1])}% il rischio per trade è alto.` : `Di solito si sta tra lo ${comma(RISK_HINT[0])}% e il ${comma(RISK_HINT[1])}%.`}
      </p>

      <div className="risk__row">
        <div className="seg" role="group" aria-label="Direzione">
          {SIDES.map(([id, label]) => (
            <button key={id} className={`seg__btn is-${id === 'long' ? 'oversold' : 'overbought'}` + (side === id ? ' is-on' : '')} aria-pressed={side === id} onClick={() => setSide(id)}>{label}</button>
          ))}
        </div>
        <label className="risk__tf"><span className="hint">Timeframe</span>
          <select value={tf} onChange={e => setTf(e.target.value)} aria-label="Timeframe della volatilità">
            {RISK_TFS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
      </div>
      <p className="hint risk__why" onClick={() => setWhy(v => !v)} title={`Stop a ${comma(STOP_ATR)} × ATR ${ATR_LENGTH} (Average True Range): l'escursione media di una candela su questo timeframe.`}>
        Lo stop si adatta a quanto si muove il prezzo su questo timeframe.
        {why && <span className="risk__whytext"> È {comma(STOP_ATR)} × l'ATR {ATR_LENGTH} (Average True Range), cioè l'escursione media di una candela.</span>}
      </p>

      <dl className="risk__facts">
        <div><dt>Prezzo {name}</dt><dd>{fmtPrice(price, precision)}</dd></div>
        <div><dt>Volatilità media · {tf}</dt><dd>{a ? fmtPrice(a, precision) : '—'}</dd></div>
      </dl>
      {error && !bars && <p className="hint">Non riesco a leggere il prezzo. Riprovo tra poco.</p>}

      <label className="num"><span>Stop {stopIn == null ? `(${comma(STOP_ATR)} × volatilità media dal prezzo)` : '(modificato)'}</span>
        <input type="text" inputMode="decimal" value={stopIn ?? (suggested ? priceInput(suggested, precision) : '')} onChange={e => setStopIn(e.target.value)} />
      </label>
      {stopIn != null && suggested && <button className="legal-link risk__reset" onClick={() => setStopIn(null)}>Torna allo stop suggerito</button>}

      {out?.error ? <p className="hint risk__warn">{out.error}</p> : out ? (
        <dl className="risk__out">
          <div><dt>Distanza dello stop</dt><dd>{fmtPrice(out.dist, precision)} <small>{pct(out.distPct)}</small></dd></div>
          <div><dt>Perdita massima</dt><dd className="t-ob">{money(out.loss)} <small>USDT</small></dd></div>
          <div><dt>Dimensione della posizione</dt><dd>{qty(out.size)} <small>{name}</small></dd></div>
          <div><dt>Valore nozionale</dt><dd>{money(out.notional)} <small>USDT</small></dd></div>
          {out.leverage > 1 && (
            <div className={out.leverage > LEVERAGE_WARN ? 'is-warn' : ''}>
              <dt>Leva minima necessaria</dt><dd>{comma(out.leverage.toFixed(1))}x</dd>
            </div>
          )}
        </dl>
      ) : null}
      {out?.leverage > LEVERAGE_WARN && <p className="hint risk__warn">Oltre {LEVERAGE_WARN}x basta un piccolo movimento contrario per perdite rapide o la liquidazione.</p>}

      <div className="risk__row">
        <span className="risk__label">Take profit</span>
        <div className="seg" role="group" aria-label="Rapporto rendimento/rischio">
          {RR_CHOICES.map(v => (
            <button key={v} className={'seg__btn' + (tpIn == null && rr === v ? ' is-on' : '')} aria-pressed={tpIn == null && rr === v} onClick={() => pickRr(v)}>{rrText(v)}</button>
          ))}
        </div>
      </div>
      <label className="num"><span>Take profit {tpIn == null ? `(${rrText(rr)}: ${comma(rr)} × la distanza dello stop)` : '(modificato)'}</span>
        <input type="text" inputMode="decimal" value={tpIn ?? (tpSuggested ? priceInput(tpSuggested, precision) : '')} onChange={e => setTpIn(e.target.value)} />
      </label>
      {(tpIn != null || rr !== RR_DEFAULT) && tpSuggested && <button className="legal-link risk__reset" onClick={() => pickRr(RR_DEFAULT)}>Torna a {rrText(RR_DEFAULT)}</button>}

      {tpOut?.error ? <p className="hint risk__warn">{tpOut.error}</p> : tpOut ? (
        <dl className="risk__out">
          <div><dt>Prezzo del take profit</dt><dd>{fmtPrice(tp, precision)}</dd></div>
          <div><dt>Distanza del take profit</dt><dd>{fmtPrice(tpOut.tpDist, precision)} <small>{pct(tpOut.tpPct)}</small></dd></div>
          <div><dt>Guadagno potenziale</dt><dd className="t-os">{money(tpOut.gain)} <small>USDT</small></dd></div>
          <div className={tpOut.rr < 1 ? 'is-warn' : ''}><dt>Rendimento / rischio</dt><dd>{rrText(tpOut.rr)}</dd></div>
        </dl>
      ) : null}
      {tpOut && !tpOut.error && tpOut.rr < 1 && <p className="hint risk__warn">Il guadagno potenziale è minore del rischio.</p>}

      <p className="risk__lesson">Rischiare poco per trade ti permette di sbagliare più volte senza compromettere il conto.</p>
      <p className="hint">Stima educativa: non include commissioni, funding, slittamento né prezzo di liquidazione.</p>
    </div>
  )
}
