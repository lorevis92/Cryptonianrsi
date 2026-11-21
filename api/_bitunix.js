// Client pubblico Bitunix Futures (solo dati di mercato, nessuna chiave).
// Stessa logica collaudata in Wisi Trade: max 200 candele per richiesta, paginazione all'indietro.

const BASE = 'https://fapi.bitunix.com'

// Limite Bitunix ~10 richieste/secondo: restiamo sotto le 8 per istanza.
let last = 0
async function throttle() {
  const gap = 125
  const now = performance.now()
  const wait = Math.max(0, last + gap - now)
  last = now + wait
  if (wait) await new Promise(r => setTimeout(r, wait))
}

async function getJson(path, retry = 2) {
  await throttle()
  const res = await fetch(BASE + path, { headers: { accept: 'application/json' } })
  // Troppe richieste: aspetto un attimo e riprovo, invece di far fallire tutta la scansione.
  if (res.status === 429 && retry > 0) {
    await new Promise(r => setTimeout(r, 1200))
    return getJson(path, retry - 1)
  }
  if (!res.ok) throw new Error(`Bitunix ${res.status}`)
  const json = await res.json()
  if (json && typeof json === 'object' && 'code' in json && Number(json.code) !== 0) {
    throw new Error(`Bitunix: ${json.msg || json.code}`)
  }
  const data = json?.data ?? json
  return Array.isArray(data?.list) ? data.list : data
}

const toBar = k => ({
  t: Number(k.time ?? k.t ?? k.ts),
  o: +k.open, h: +k.high, l: +k.low, c: +k.close,
  v: +(k.baseVol ?? k.quoteVol ?? 0),
})

// interval: 1m 3m 5m 15m 30m 1h 2h 4h 6h 8h 12h 1d 3d 1w 1M
export async function klines(symbol, interval, limit = 200, { endTime } = {}) {
  const q = new URLSearchParams({ symbol, interval, limit: String(Math.min(200, limit)), type: 'LAST_PRICE' })
  if (endTime) q.set('endTime', String(endTime))
  const data = await getJson(`/api/v1/futures/market/kline?${q}`)
  return (Array.isArray(data) ? data : []).map(toBar).filter(b => Number.isFinite(b.t)).sort((a, b) => a.t - b.t)
}

// total candele fino alla più recente, oppure fino a endTime (escluso) se indicato: serve a caricare lo storico più vecchio
export async function klinesBack(symbol, interval, total, endTime = null) {
  let out = [], end = endTime || undefined
  while (out.length < total) {
    const page = await klines(symbol, interval, 200, end ? { endTime: end } : {})
    const fresh = page.filter(b => !out.length || b.t < out[0].t)
    if (!fresh.length) break
    out = [...fresh, ...out]
    end = fresh[0].t - 1
    if (page.length < 200) break
  }
  return out.slice(-total)
}

export async function tradingPairs() {
  const data = await getJson('/api/v1/futures/market/trading_pairs')
  return (Array.isArray(data) ? data : [])
    .filter(p => !p.symbolStatus || p.symbolStatus === 'OPEN')
    .map(p => ({ symbol: p.symbol, base: p.base || p.baseCoin || p.symbol.replace(/USDT$/, ''), pp: Number.isInteger(+p.quotePrecision) ? +p.quotePrecision : null }))
}

// Decimali del prezzo di un simbolo (quotePrecision di Bitunix = tick size). Elenco tenuto 1 ora per istanza.
let precs = { at: 0, map: new Map(), job: null }
export async function pricePrecision(symbol) {
  if (Date.now() - precs.at > 3600e3 || !precs.map.size) {
    precs.job ||= tradingPairs().then(list => { precs = { at: Date.now(), map: new Map(list.map(p => [p.symbol, p.pp])), job: null } })
      .catch(() => { precs.job = null })
    await precs.job
  }
  return precs.map.get(symbol) ?? null
}

// Volume delle ultime 24 ore (in USDT) per ogni coppia, dai ticker. Una richiesta, tenuta 1 minuto per istanza.
let vols = { at: 0, map: new Map(), job: null }
export async function volumes() {
  if (Date.now() - vols.at < 60e3 && vols.map.size) return vols.map
  if (!vols.job) {
    vols.job = getJson('/api/v1/futures/market/tickers').then(data => {
      const map = new Map()
      for (const t of Array.isArray(data) ? data : []) {
        const v = Number(t.quoteVol)
        if (t.symbol && Number.isFinite(v)) map.set(t.symbol, v)
      }
      vols = { at: Date.now(), map, job: null }
      return map
    }).catch(e => { vols.job = null; throw e })
  }
  return vols.job
}

// I titoli più scambiati nelle ultime 24 ore (volume in USDT).
export async function topSymbols(n = 50) {
  const map = await volumes()
  return [...map].filter(([s, v]) => /^[A-Z0-9]+USDT$/.test(s) && v > 0)
    .sort((a, b) => b[1] - a[1]).slice(0, n).map(([s]) => s)
}
