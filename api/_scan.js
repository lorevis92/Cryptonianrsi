import { klines, klinesBack, topSymbols } from './_bitunix.js'
import { stochRsi, DEFAULTS } from '../src/lib/stochrsi.js'
import { ema, EMA_LENGTH, EMA_HISTORY } from '../src/lib/trend.js'
import { redis, hasStore } from './_store.js'

// Scansione di un timeframe: per ogni titolo una sola richiesta a Bitunix (200 candele)
// e solo la coda di K e D nel risultato, più il trend rispetto all'EMA 200 (t: 1 sopra, -1 sotto, 0 dati insufficienti).
// La usano /api/scan, /api/snapshot e il controllo delle notifiche.

export const TFS = ['1m', '3m', '5m', '15m', '1h', '4h', '1d']
// Ogni quanto si ricalcola un timeframe (secondi): i timeframe lenti cambiano poco,
// così ogni aggiornamento della fotografia rifà solo quelli scaduti.
export const TTL = { '1m': 60, '3m': 90, '5m': 120, '15m': 240, '1h': 480, '4h': 900, '1d': 1800 }
const TOP = 50
const TAIL = 4
const CONCURRENCY = 4 // insieme al limite di _bitunix.js resta sotto le 8 richieste/secondo

const round = v => (v == null ? null : Math.round(v * 10) / 10)

export function readParams(q = {}) {
  const p = { ...DEFAULTS }
  for (const key of ['rsi', 'stoch', 'k', 'd']) {
    const n = Number(q[key])
    if (Number.isInteger(n) && n >= 1 && n <= 100) p[key] = n
  }
  return p
}

async function pool(items, n, fn) {
  const out = []
  let next = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i]).catch(() => null)
    }
  }))
  return out
}

// --- EMA 200 ---
// La prima volta servono EMA_HISTORY candele (3 richieste); poi si conserva il valore all'ultima candela chiusa
// ("seme") e lo si porta avanti con le 200 candele che la scansione scarica comunque: nessuna richiesta in più.
// I semi restano in memoria e, se l'archivio Upstash è collegato, anche lì (ema:<tf>), così un'istanza
// nuova di Vercel non riscarica lo storico.
const seeds = {} // seeds[tf] = Map(symbol -> { t, v } | { short: ora })
const seedSync = {} // seedSync[tf] = { loaded, savedAt, job }
const SHORT_RETRY = 6 * 3600e3 // titolo con poco storico: riprovo dopo 6 ore
const SAVE_EVERY = 10 * 60e3

async function seedsFor(tf) {
  const st = (seedSync[tf] ||= { loaded: false, savedAt: Date.now(), job: null })
  if (!st.loaded) {
    st.job ||= (async () => {
      const m = (seeds[tf] ||= new Map())
      if (hasStore()) {
        try {
          const saved = JSON.parse((await redis('GET', 'ema:' + tf)) || '{}')
          for (const [sym, v] of Object.entries(saved)) if (!m.has(sym)) m.set(sym, v)
        } catch { /* archivio non raggiungibile: si riparte dallo storico */ }
      }
      st.loaded = true
    })()
    await st.job
  }
  return seeds[tf]
}

function saveSeeds(tf) {
  const st = seedSync[tf]
  if (!hasStore() || !st || Date.now() - st.savedAt < SAVE_EVERY) return
  st.savedAt = Date.now()
  redis('SET', 'ema:' + tf, JSON.stringify(Object.fromEntries(seeds[tf]))).catch(() => null)
}

async function trendOf(s, tf, bars, m) {
  const last = bars[bars.length - 1]
  let seed = m.get(s)
  if (seed?.short && Date.now() - seed.short < SHORT_RETRY) return 0
  let r = seed && !seed.short ? ema(bars, seed) : null
  if (!r || !bars.some(b => b.t === seed?.t)) {
    // Seme assente o troppo vecchio: storico lungo (se le 200 candele non sono già tutto lo storico)
    const hist = bars.length < 200 ? bars : await klinesBack(s, tf, EMA_HISTORY).catch(() => bars)
    r = ema(hist.length >= bars.length ? hist : bars)
  }
  if (!r) { m.set(s, { short: Date.now() }); return 0 }
  m.set(s, r.seed)
  return last.c > r.value ? 1 : last.c < r.value ? -1 : 0
}

export async function run(tf, symbols, p) {
  const list = symbols || await topSymbols(TOP)
  const m = await seedsFor(tf)
  const rows = await pool(list, CONCURRENCY, async s => {
    const bars = await klines(s, tf, 200)
    if (bars.length < p.rsi + p.stoch + p.k + p.d) return null
    const { k, d } = stochRsi(bars, p)
    const t = bars.length > EMA_LENGTH || bars.length === 200 ? await trendOf(s, tf, bars, m).catch(() => 0) : 0
    return { s, k: k.slice(-TAIL).map(round), d: d.slice(-TAIL).map(round), c: bars[bars.length - 1].c, t }
  })
  saveSeeds(tf)
  return { tf, at: Date.now(), symbols: list, rows: rows.filter(Boolean) }
}

// Cache in memoria per istanza: richieste uguali nello stesso momento ne fanno una sola a Bitunix,
// e un risultato resta valido per TTL[tf] secondi.
const memo = new Map()

export function scan(tf, symbols = null, p = DEFAULTS) {
  const key = JSON.stringify([tf, symbols, p.rsi, p.stoch, p.k, p.d])
  const hit = memo.get(key)
  if (hit && Date.now() - hit.at < TTL[tf] * 1000) return hit.job
  if (memo.size > 80) memo.clear()
  const job = run(tf, symbols, p)
  // Finché il nuovo calcolo non è pronto, chi chiede riceve ancora il precedente (se c'è).
  const entry = { at: Date.now(), job, done: null }
  memo.set(key, entry)
  job.then(d => { entry.done = d }, () => { if (memo.get(key) === entry) memo.delete(key) })
  return hit?.done ? Promise.race([job, Promise.resolve(hit.done)]) : job
}
