export const fmtK = v => (v == null ? '—' : v < 10 ? v.toFixed(1) : Math.round(v).toString())
export function fmtPrice(v) {
  if (v == null || !Number.isFinite(v)) return '—'
  const d = v >= 1000 ? 2 : v >= 1 ? 3 : v >= 0.01 ? 5 : 8
  return v.toLocaleString('it-CH', { minimumFractionDigits: Math.min(d, 2), maximumFractionDigits: d })
}
export const ZONE_LABEL = { oversold: 'Ipervenduto', overbought: 'Ipercomprato', neutral: 'Neutro' }

// Volume abbreviato all'italiana: 1,2 Mld · 345 Mln · 12,3 Mln · 980 mila
export function fmtVol(v) {
  if (!Number.isFinite(v) || v <= 0) return '—'
  const [n, unit] = v >= 1e9 ? [v / 1e9, 'Mld'] : v >= 1e6 ? [v / 1e6, 'Mln'] : v >= 1e3 ? [v / 1e3, 'mila'] : [v, '']
  const num = n.toLocaleString('it-IT', { maximumFractionDigits: n < 10 ? 1 : 0 })
  return unit ? `${num} ${unit}` : num
}
