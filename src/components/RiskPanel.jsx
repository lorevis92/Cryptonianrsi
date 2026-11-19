import { useEffect, useMemo, useState } from 'react'
import { useCandles } from '../lib/useCandles.js'
import { atr, positionSize, ATR_LENGTH, STOP_ATR, RISK_DEFAULT, RISK_HINT, LEVERAGE_WARN } from '../lib/risk.js'
import { TIMEFRAMES } from '../lib/plans.js'
import { fmtPrice } from '../lib/format.js'
import { load, save } from '../lib/storage.js'

const SIDES = [['long', 'Long'], ['short', 'Short']]
const parse = v => { const n = Number(String(v).replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : NaN }
const comma = n => String(n).replace('.', ',')
const money = n => n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pct = n => (n * 100).toLocaleString('it-IT', { maximumFractionDigits: n < 0.01 ? 2 : 1 }) + '%'
const qty = n => n.toLocaleString('it-IT', { maximumSignificantDigits: 4, maximumFractionDigits: n >= 1 ? 3 : 8 })
// Prezzo da mettere nel campo: stessi decimali di fmtPrice, senza separatore delle migliaia
const priceInput = v => v.toLocaleString('it-IT', { useGrouping: false, maximumFractionDigits: v >= 1000 ? 2 : v >= 1 ? 3 : v >= 0.01 ? 5 : 8 })

// Mini-calcolatore di rischio nel dettaglio del titolo. Fa solo aritmetica sui valori inseriti.
export default function RiskPanel({ symbol }) {
  const [saved] = useState(() => load('risk', {}))
  const [capital, setCapital] = useState(saved.capital ?? '')
  const [risk, setRisk] = useState(saved.risk ?? comma(RISK_DEFAULT))
  const [side, setSide] = useState('long')
  const [tf, setTf] = useState('1h')
  const [stopIn, setStopIn] = useState(null) // null = stop suggerito
  useEffect(() => save('risk', { capital, risk }), [capital, risk])
  useEffect(() => setStopIn(null), [side, tf, symbol])

  const { bars, error } = useCandles(symbol, tf, true)
  const price = bars?.length ? bars[bars.length - 1].c : null
  const a = useMemo(() => (bars ? atr(bars) : null), [bars])
  const suggested = price && a ? (side === 'long' ? price - STOP_ATR * a : price + STOP_ATR * a) : null
  const stop = stopIn == null ? suggested : parse(stopIn)

  const cap = parse(capital), r = parse(risk)
  const out = price && stop ? positionSize({ capital: cap, riskPct: r, price, stop, side }) : null
  const name = symbol.replace(/USDT$/, '')

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
        <label className="risk__tf"><span className="hint">ATR</span>
          <select value={tf} onChange={e => setTf(e.target.value)} aria-label="Timeframe dell'ATR">
            {TIMEFRAMES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
      </div>

      <dl className="risk__facts">
        <div><dt>Prezzo {name}</dt><dd>{fmtPrice(price)}</dd></div>
        <div><dt>ATR {ATR_LENGTH} · {tf}</dt><dd>{a ? fmtPrice(a) : '—'}</dd></div>
      </dl>
      {error && !bars && <p className="hint">Non riesco a leggere il prezzo. Riprovo tra poco.</p>}

      <label className="num"><span>Stop {stopIn == null ? `(${comma(STOP_ATR)} × ATR dal prezzo)` : '(modificato)'}</span>
        <input type="text" inputMode="decimal" value={stopIn ?? (suggested ? priceInput(suggested) : '')} onChange={e => setStopIn(e.target.value)} />
      </label>
      {stopIn != null && suggested && <button className="legal-link risk__reset" onClick={() => setStopIn(null)}>Torna a {comma(STOP_ATR)} × ATR</button>}

      {out?.error ? <p className="hint risk__warn">{out.error}</p> : out ? (
        <dl className="risk__out">
          <div><dt>Distanza dello stop</dt><dd>{fmtPrice(out.dist)} <small>{pct(out.distPct)}</small></dd></div>
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

      <p className="risk__lesson">Rischiare poco per trade ti permette di sbagliare più volte senza compromettere il conto.</p>
      <p className="hint">Stima educativa: non include commissioni, funding, slittamento né prezzo di liquidazione.</p>
    </div>
  )
}
