export const fmtK = v => (v == null ? '—' : v < 10 ? v.toFixed(1) : Math.round(v).toString())
export function fmtPrice(v) {
  if (v == null || !Number.isFinite(v)) return '—'
  const d = v >= 1000 ? 2 : v >= 1 ? 3 : v >= 0.01 ? 5 : 8
  return v.toLocaleString('it-CH', { minimumFractionDigits: Math.min(d, 2), maximumFractionDigits: d })
}
export const ZONE_LABEL = { oversold: 'Ipervenduto', overbought: 'Ipercomprato', neutral: 'Neutro' }
