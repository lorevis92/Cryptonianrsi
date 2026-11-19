// ─────────────────────────────────────────────────────────────────────────────
// EMA 200: il "semaforo di contesto" accanto allo Stochastic RSI.
// È l'unico file da toccare: lo usano l'app, la fotografia sul server e le notifiche Telegram.
// ─────────────────────────────────────────────────────────────────────────────

export const EMA_LENGTH = 200

// Trend principale del titolo (badge in mappa ed elenco, messaggio combinato, Telegram).
// Per passare al giornaliero: '1d'.
export const MAIN_TREND_TF = '4h'

// Candele scaricate la prima volta per stabilizzare l'EMA (3 richieste da 200).
// Con 600 candele il peso del valore di partenza scende sotto il 2%.
export const EMA_HISTORY = 600

// ─────────────────────────────────────────────────────────────────────────────

// Valore della riga che arriva dal server: 1 = prezzo sopra EMA 200, -1 = sotto, 0 = dati insufficienti
export const TREND = {
  1: { id: 'up', glyph: '▲', label: 'Trend rialzista', short: 'Rialzista', rel: 'sopra' },
  [-1]: { id: 'down', glyph: '▼', label: 'Trend ribassista', short: 'Ribassista', rel: 'sotto' },
  0: { id: 'none', glyph: '–', label: 'Dati insufficienti', short: 'Dati insufficienti', rel: null },
}
export const trendOf = t => TREND[t === 1 || t === -1 ? t : 0]
export const trendExplain = (t, tf = MAIN_TREND_TF) => {
  const x = trendOf(t)
  return x.rel ? `Prezzo ${x.rel} EMA ${EMA_LENGTH} sul ${tf}` : `Storico insufficiente per l'EMA ${EMA_LENGTH} sul ${tf}`
}

// Zona dello Stoch RSI + trend principale → lettura combinata, sempre descrittiva.
// tone: 'aligned' (zona e trend concordi), 'caution' (giallo), 'strong'
export function combined(side, t) {
  if (side !== 'oversold' && side !== 'overbought') return null
  if (t !== 1 && t !== -1) return null
  if (side === 'oversold') return t === 1
    ? { tone: 'aligned', text: 'Ipervenduto in trend rialzista' }
    : { tone: 'caution', text: 'Ipervenduto, ma trend ribassista · rischio alto' }
  return t === -1
    ? { tone: 'aligned', text: 'Ipercomprato in trend ribassista' }
    : { tone: 'strong', text: 'Forte spinta rialzista · ipercomprato' }
}

// EMA sulle chiusure. seed = { t, v }: valore già calcolato alla chiusura della candela t,
// così ogni aggiornamento riparte da lì invece di riscaricare lo storico.
// Restituisce { value (con la candela in corso), seed (ultima candela chiusa) } o null se lo storico non basta.
export function ema(bars, seed = null, n = EMA_LENGTH) {
  const a = 2 / (n + 1)
  const last = bars.length - 1
  let v, from
  const i = seed ? bars.findIndex(b => b.t === seed.t) : -1
  if (i >= 0) { v = seed.v; from = i + 1 }
  else {
    if (bars.length < n + 1) return null
    v = 0
    for (let j = 0; j < n; j++) v += bars[j].c
    v /= n
    from = n
  }
  for (let j = from; j < last; j++) v += a * (bars[j].c - v)
  const closed = last >= 1 ? { t: bars[last - 1].t, v } : seed
  return { value: v + a * (bars[last].c - v), seed: closed }
}
