import { run } from '../_scan.js'
import { redis, pipeline, hasStore, userKey, memKey, parse } from '../_store.js'
import { hasBot, send, esc } from '../_telegram.js'
import { check, DEFAULT_RULE } from '../../src/alerts/rules.js'
import { DEFAULTS } from '../../src/lib/stochrsi.js'

// Controllo delle notifiche, una volta al minuto.
// Lo chiama cron-job.org (gratis, ogni minuto) con l'intestazione  Authorization: Bearer <CRON_SECRET>
// oppure con ?key=<CRON_SECRET>. Legge da Bitunix solo i titoli seguiti da almeno un utente collegato,
// e solo i timeframe che servono alle loro regole (di solito 3m e 5m), con la candela in corso.

const LOCK_S = 55 // due controlli non si sovrappongono mai (niente messaggi doppi)

const fmt = k => (k < 10 ? k.toFixed(1) : String(Math.round(k))).replace('.', ',')
const clock = () => new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' }).format(new Date())

function message({ s, kind, side, values, rule, link }) {
  const name = s.replace(/USDT$/, '')
  const os = side === 'oversold'
  const head = kind === 'zone'
    ? `${os ? '🟢' : '🔴'} <b>${esc(name)}</b> · ${os ? 'Ipervenduto' : 'Ipercomprato'}`
    : `🟡 <b>${esc(name)}</b> · si avvicina all'${os ? 'ipervenduto' : 'ipercomprato'}`
  const vals = rule.tfs.map(tf => `${tf} <b>${fmt(values[tf])}</b>`).join(' · ')
  return `${head}\n${vals}\n${clock()} · <a href="${link}">Apri ${esc(name)} nell'app</a>`
}

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers?.authorization === `Bearer ${secret}` || req.query?.key === secret
  if (!secret || !auth) return res.status(403).json({ error: 'Chiave mancante' })
  if (!hasStore() || !hasBot()) return res.status(503).json({ error: 'Notifiche non configurate' })
  const t0 = Date.now()

  if (!(await redis('SET', 'lock:check', String(t0), 'NX', 'EX', LOCK_S))) return res.status(200).json({ skipped: 'controllo già in corso' })
  try {
    const ids = await redis('SMEMBERS', 'users') || []
    // Utenti (u:<id>) e memoria anti-spam (m:<id>) in una sola lettura. La memoria sta a parte
    // così il controllo non sovrascrive mai le scelte fatte nell'app nello stesso momento.
    const got = ids.length ? (await redis('MGET', ...ids.map(userKey), ...ids.map(memKey))).map(parse) : []
    const users = got.slice(0, ids.length)
    const mems = got.slice(ids.length)

    // Titoli e timeframe da leggere: l'unione di quelli di tutti gli utenti collegati
    const need = {}
    users.forEach(u => {
      if (!u?.chat) return
      const rule = u.rule || DEFAULT_RULE
      for (const { s } of u.symbols || []) for (const tf of rule.tfs) (need[tf] ||= new Set()).add(s)
    })
    const values = {} // values[s][tf] = K
    await Promise.all(Object.entries(need).map(async ([tf, set]) => {
      const out = await run(tf, [...set], DEFAULTS).catch(() => null)
      for (const r of out?.rows || []) (values[r.s] ||= {})[tf] = r.k[r.k.length - 1]
    }))

    const host = process.env.APP_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || req.headers?.['x-forwarded-host'] || req.headers?.host
    const base = /^https?:\/\//.test(host) ? host : `https://${host}`
    const writes = []
    let sent = 0
    await Promise.all(users.map(async (u, i) => {
      if (!u?.chat) return
      const rule = u.rule || DEFAULT_RULE
      const mem = {}
      let changed = false
      for (const { s, near } of u.symbols || []) {
        if (!values[s]) continue
        const old = mems[i]?.[s] || null
        const r = check(values[s], rule, near, old)
        mem[s] = r.mem
        if (JSON.stringify(r.mem) !== JSON.stringify(old)) changed = true
        for (const ev of r.events) {
          try {
            await send(u.chat, message({ s, ...ev, values: values[s], rule, link: `${base}/?s=${encodeURIComponent(s)}` }))
            sent++
          } catch (e) {
            // L'utente ha bloccato il bot o cancellato la chat: lo scollego
            if (e.code === 403 || e.code === 400) {
              writes.push(['SREM', 'users', ids[i]], ['DEL', 'chat:' + u.chat], ['SET', userKey(ids[i]), JSON.stringify({ ...u, chat: null, name: null })])
              u.chat = null
              break
            }
          }
        }
        if (!u.chat) break
      }
      for (const s of Object.keys(mems[i] || {})) if (!(s in mem) && (u.symbols || []).some(x => x.s === s)) mem[s] = mems[i][s] // titoli senza dati in questo giro
      if (changed) writes.push(['SET', memKey(ids[i]), JSON.stringify(mem)])
    }))
    await pipeline(writes)
    return res.status(200).json({ users: users.filter(u => u?.chat).length, symbols: Object.keys(values).length, sent, ms: Date.now() - t0 })
  } catch (e) {
    return res.status(502).json({ error: e.message })
  } finally {
    await redis('DEL', 'lock:check').catch(() => null)
  }
}
