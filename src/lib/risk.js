// Calcolatore del rischio: costanti e conti, in un solo posto.

export const ATR_LENGTH = 14
export const STOP_ATR = 1.5        // stop suggerito: 1,5 × ATR dal prezzo
export const RISK_DEFAULT = 1      // % del capitale rischiata per trade
export const RISK_HINT = [0.5, 2]  // intervallo suggerito
export const LEVERAGE_WARN = 5     // oltre questa leva compare l'avviso
export const RISK_TFS = ['1m', '3m', '5m', '15m', '1h', '4h', '1d'] // timeframe tra cui scegliere la volatilità
export const RR_DEFAULT = 2        // take profit di partenza: distanza doppia rispetto allo stop (2:1)
export const RR_CHOICES = [1.5, 2, 3]

// Average True Range di Wilder sulle candele { h, l, c }
export function atr(bars, n = ATR_LENGTH) {
  if (!bars || bars.length <= n) return null
  const tr = []
  for (let i = 1; i < bars.length; i++) {
    const { h, l } = bars[i], pc = bars[i - 1].c
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)))
  }
  let v = tr.slice(0, n).reduce((a, b) => a + b, 0) / n
  for (let i = n; i < tr.length; i++) v = (v * (n - 1) + tr[i]) / n
  return v
}

// Take profit a un multiplo della distanza dello stop: sopra il prezzo per un Long, sotto per uno Short
export const takeProfitAt = ({ price, stop, side, rr }) => {
  const dist = Math.abs(price - stop)
  return side === 'long' ? price + rr * dist : price - rr * dist
}

// Risultato del take profit: distanza, guadagno potenziale e rapporto rendimento/rischio effettivo
export function takeProfit({ price, tp, side, size, dist }) {
  if (!(tp > 0)) return { error: 'Inserisci un prezzo di take profit valido.' }
  if (side === 'long' && tp <= price) return { error: 'Per un Long il take profit va sopra il prezzo attuale.' }
  if (side === 'short' && tp >= price) return { error: 'Per uno Short il take profit va sotto il prezzo attuale.' }
  const tpDist = Math.abs(tp - price)
  return { tpDist, tpPct: tpDist / price, gain: size * tpDist, rr: tpDist / dist }
}

// Dimensione della posizione perché, se scatta lo stop, si perda solo la quota scelta del capitale.
export function positionSize({ capital, riskPct, price, stop, side }) {
  if (!(capital > 0)) return { error: 'Inserisci il capitale.' }
  if (!(riskPct > 0) || riskPct > 100) return { error: 'Inserisci una percentuale di rischio tra 0 e 100.' }
  if (!(stop > 0)) return { error: 'Inserisci un prezzo di stop valido.' }
  if (side === 'long' && stop >= price) return { error: 'Per un Long lo stop va sotto il prezzo attuale.' }
  if (side === 'short' && stop <= price) return { error: 'Per uno Short lo stop va sopra il prezzo attuale.' }
  const dist = Math.abs(price - stop)
  const distPct = dist / price
  const loss = capital * riskPct / 100
  const size = loss / dist
  const notional = size * price
  const leverage = Math.ceil((notional / capital) * 10) / 10
  return { dist, distPct, loss, size, notional, leverage }
}
