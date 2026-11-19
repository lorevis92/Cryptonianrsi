import Icon from './Icon.jsx'
import Bubble from './Bubble.jsx'
import { TIMEFRAMES, planFor } from '../lib/plans.js'
import { fmtK, ZONE_LABEL, STRONG_LABEL, ATTENTION_LABEL, MOMENTUM_LABEL } from '../lib/format.js'

// Il cuore dell'app: tutti i timeframe sulla stessa scala 0–100.
// Quando i pallini si mettono in colonna nella stessa zona, c'è confluenza.
export default function Confluence({ states, unlocked, params, onLocked, bubble, onBubble, onRisk }) {
  const active = TIMEFRAMES.filter(tf => unlocked.includes(tf))
  const ready = active.filter(tf => states[tf]?.K != null)
  const os = ready.filter(tf => states[tf].zone === 'oversold').length
  const ob = ready.filter(tf => states[tf].zone === 'overbought').length
  const kUp = ready.filter(tf => states[tf].K > states[tf].D).length

  const side = os >= ob ? 'oversold' : 'overbought'
  const count = Math.max(os, ob)
  const ratio = ready.length ? count / ready.length : 0
  const headline = !ready.length ? 'Sto leggendo i timeframe'
    : count === 0 ? 'Nessun timeframe in zona estrema'
    : `su ${active.length} timeframe in ${side === 'oversold' ? 'ipervenduto' : 'ipercomprato'}`
  // Linguaggio descrittivo: cosa sta facendo l'indicatore, mai cosa fare
  const momentum = !ready.length ? '' : kUp * 2 > ready.length ? `${MOMENTUM_LABEL.up} · ` : kUp * 2 < ready.length ? `${MOMENTUM_LABEL.down} · ` : ''
  const sub = !ready.length || count === 0 ? `${momentum}K sopra D in ${kUp} su ${ready.length}`
    : ratio >= 0.6 ? `${STRONG_LABEL[side]} · ${ATTENTION_LABEL[side]}`
    : 'Confluenza parziale'

  // Stesso ordine delle card: 1m in alto, 1d in basso
  const rows = TIMEFRAMES
  return (
    <section className="confluence" aria-label="Confluenza dei timeframe">
      <div className="confluence__head">
        <div className={`confluence__count is-${count ? side : 'neutral'}`}>{ready.length ? count : '–'}</div>
        <div className="confluence__text">
          <p className="confluence__headline">{headline}</p>
          <p className="confluence__sub">{sub}</p>
        </div>
        {bubble && (
          <div className="confluence__bubble">
            <Bubble data={bubble} size={66} onClick={onBubble}
              label={`Bolla di ${bubble.label}: ${bubble.side === 'neutral' ? 'nessuna zona estrema' : ZONE_LABEL[bubble.side].toLowerCase()}, allineamento ${Math.round(bubble.score * 100)} su 100. Torna alla mappa`} />
          </div>
        )}
      </div>

      <div className="ladder" style={{ '--lo': params.lower + '%', '--hi': params.upper + '%' }}>
        <div className="ladder__zones" aria-hidden="true"><span className="z-lo" /><span className="z-hi" /><span className="l-lo" /><span className="l-hi" /></div>
        {rows.map(tf => {
          const on = unlocked.includes(tf)
          const s = states[tf]
          const k = on && s?.K != null ? s.K : null
          return (
            <div key={tf} className={`rung ${on ? '' : 'is-locked'} is-${on && s ? s.zone : 'neutral'}`} style={{ '--i': on && s ? s.intensity : 0 }}>
              <span className="rung__tf">{tf}</span>
              <div className="rung__track">
                {k != null && <span className="rung__dot" style={{ left: k + '%' }} />}
              </div>
              {on
                ? <span className="rung__val">{fmtK(k)}</span>
                : <button className="rung__lock" onClick={onLocked} aria-label={`${tf} disponibile con ${planFor(tf).name}`}><Icon name="lock" size={14} /></button>}
            </div>
          )
        })}
        <div className="ladder__scale" aria-hidden="true">
          <span style={{ left: 0 }}>0</span><span style={{ left: 'var(--lo)' }}>{params.lower}</span><span style={{ left: '50%' }}>50</span><span style={{ left: 'var(--hi)' }}>{params.upper}</span><span style={{ left: '100%' }}>100</span>
        </div>
      </div>
      <div className="confluence__foot">
        <p className="formula">StochRSI = (RSI − min) / (max − min)</p>
        {onRisk && <button className="risk-btn" onClick={onRisk}>Calcola il rischio</button>}
      </div>
    </section>
  )
}
