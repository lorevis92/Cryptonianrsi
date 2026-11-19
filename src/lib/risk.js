// Calcolatore del rischio: costanti e conti, in un solo posto.

export const ATR_LENGTH = 14
export const STOP_ATR = 1.5        // stop suggerito: 1,5 × ATR dal prezzo
export const RISK_DEFAULT = 1      // % del capitale rischiata per trade
export const RISK_HINT = [0.5, 2]  // intervallo suggerito
export const LEVERAGE_WARN = 5     // oltre questa leva compare l'avviso

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
