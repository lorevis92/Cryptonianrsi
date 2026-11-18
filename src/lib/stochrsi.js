// Stochastic RSI: RSI di Wilder, poi stocastico sull'RSI, poi media di K e di D.
// Restituisce array allineati alle candele (null finché non ci sono abbastanza dati).

export const DEFAULTS = { rsi: 14, stoch: 14, k: 3, d: 3, upper: 80, lower: 20 }

function rsiWilder(closes, n) {
  const out = new Array(closes.length).fill(null)
  if (closes.length <= n) return out
  let gain = 0, loss = 0
  for (let i = 1; i <= n; i++) {
    const ch = closes[i] - closes[i - 1]
    if (ch >= 0) gain += ch; else loss -= ch
  }
  gain /= n; loss /= n
  out[n] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss)
  for (let i = n + 1; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1]
    gain = (gain * (n - 1) + Math.max(ch, 0)) / n
    loss = (loss * (n - 1) + Math.max(-ch, 0)) / n
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss)
  }
  return out
}

function sma(arr, n) {
  const out = new Array(arr.length).fill(null)
  for (let i = 0; i < arr.length; i++) {
    if (i < n - 1) continue
    let s = 0, ok = true
    for (let j = i - n + 1; j <= i; j++) { if (arr[j] == null) { ok = false; break } s += arr[j] }
    if (ok) out[i] = s / n
  }
  return out
}

export function stochRsi(bars, p = DEFAULTS) {
  const closes = bars.map(b => b.c)
  const rsi = rsiWilder(closes, p.rsi)
  const raw = new Array(closes.length).fill(null)
  for (let i = 0; i < rsi.length; i++) {
    if (i < p.rsi + p.stoch - 1) continue
    let lo = Infinity, hi = -Infinity
    for (let j = i - p.stoch + 1; j <= i; j++) { lo = Math.min(lo, rsi[j]); hi = Math.max(hi, rsi[j]) }
    raw[i] = hi === lo ? (raw[i - 1] ?? 50) : ((rsi[i] - lo) / (hi - lo)) * 100
  }
  const k = sma(raw, p.k)
  const d = sma(k, p.d)
  return { k, d }
}

// Lettura dello stato attuale di un timeframe.
export function readState(bars, p = DEFAULTS) {
  if (!bars?.length) return null
  const { k, d } = stochRsi(bars, p)
  return { k, d, ...readTail(k, d, p) }
}

// Stato letto dalle ultime righe di K e D (bastano 4 valori).
// La usa anche la mappa a bolle, che dal server riceve solo la coda delle serie.
export function readTail(k, d, p = DEFAULTS) {
  const i = k.length - 1
  const K = k[i], D = d[i]
  if (K == null || D == null) return { K: null, D: null, zone: 'neutral', intensity: 0, cross: null }
  const zone = K <= p.lower ? 'oversold' : K >= p.upper ? 'overbought' : 'neutral'
  const intensity = zone === 'oversold' ? (p.lower - K) / p.lower
    : zone === 'overbought' ? (K - p.upper) / (100 - p.upper) : 0
  // Incrocio K/D nelle ultime 3 candele
  let cross = null
  for (let j = i; j > i - 3 && j > 0; j--) {
    if (k[j] == null || d[j] == null || k[j - 1] == null || d[j - 1] == null) break
    if (k[j - 1] <= d[j - 1] && k[j] > d[j]) { cross = { dir: 'up', ago: i - j, inZone: k[j] <= p.lower + 5 }; break }
    if (k[j - 1] >= d[j - 1] && k[j] < d[j]) { cross = { dir: 'down', ago: i - j, inZone: k[j] >= p.upper - 5 }; break }
  }
  return { K, D, zone, intensity: Math.min(1, Math.max(0, intensity)), cross }
}
