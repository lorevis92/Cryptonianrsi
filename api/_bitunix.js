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

export async function klinesBack(symbol, interval, total) {
  let out = [], end
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
    .map(p => ({ symbol: p.symbol, base: p.base || p.baseCoin || p.symbol.replace(/USDT$/, '') }))
}

// I titoli più scambiati nelle ultime 24 ore (volume in USDT). Una sola richiesta, tenuta 10 minuti.
let top = { at: 0, list: [] }
export async function topSymbols(n = 50) {
  if (Date.now() - top.at < 10 * 60e3 && top.list.length) return top.list.slice(0, n)
  const data = await getJson('/api/v1/futures/market/tickers')
  const list = (Array.isArray(data) ? data : [])
    .filter(t => /^[A-Z0-9]+USDT$/.test(t.symbol) && Number(t.quoteVol) > 0)
    .sort((a, b) => Number(b.quoteVol) - Number(a.quoteVol))
    .map(t => t.symbol)
  top = { at: Date.now(), list }
  return list.slice(0, n)
}
