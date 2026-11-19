export const fmtK = v => (v == null ? '—' : v < 10 ? v.toFixed(1) : Math.round(v).toString())
// Decimali del prezzo: quelli del tick size di Bitunix se li conosciamo, altrimenti in base al prezzo
// (almeno 4 cifre significative: 63000 → 2, 73,5 → 3, 1,23 → 4, 0,0037543 → 7).
export function priceDecimals(v, precision = null) {
  if (Number.isInteger(precision) && precision >= 0) return Math.min(precision, 12)
  if (!Number.isFinite(v) || v === 0) return 2
  return Math.min(12, Math.max(2, 4 - Math.floor(Math.log10(Math.abs(v)))))
}
export function fmtPrice(v, precision = null) {
  if (v == null || !Number.isFinite(v)) return '—'
  const d = priceDecimals(v, precision)
  return v.toLocaleString('it-CH', { minimumFractionDigits: d, maximumFractionDigits: d })
}
export const ZONE_LABEL = { oversold: 'Ipervenduto', overbought: 'Ipercomprato', neutral: 'Neutro' }

// Linguaggio descrittivo, mai operativo: niente "compra", "vendi", "entra".
// Zona forte (molti timeframe allineati, o la regola delle notifiche soddisfatta):
export const STRONG_LABEL = { oversold: 'Eccesso di ribasso', overbought: 'Eccesso di rialzo' }
export const ATTENTION_LABEL = { oversold: 'Zona di attenzione Long', overbought: 'Zona di attenzione Short' }
export const MOMENTUM_LABEL = { up: 'Momentum rialzista', down: 'Momentum ribassista' }
// Anello dorato (K incrocia D dentro la zona su 1h, 4h o 1d)
export const signalLabel = tf => `Zona di attenzione ${tf}`

// Volume abbreviato all'italiana: 1,2 Mld · 345 Mln · 12,3 Mln · 980 mila
export function fmtVol(v) {
  if (!Number.isFinite(v) || v <= 0) return '—'
  const [n, unit] = v >= 1e9 ? [v / 1e9, 'Mld'] : v >= 1e6 ? [v / 1e6, 'Mln'] : v >= 1e3 ? [v / 1e3, 'mila'] : [v, '']
  const num = n.toLocaleString('it-IT', { maximumFractionDigits: n < 10 ? 1 : 0 })
  return unit ? `${num} ${unit}` : num
}
