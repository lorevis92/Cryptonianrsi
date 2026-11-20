import { run } from '../_scan.js'
import { redis, pipeline, hasStore, memKey, parse } from '../_store.js'
import { hasBot, esc } from '../_telegram.js'
import { enqueue, drain } from '../_tgqueue.js'
import { db, hasSupabase, selectAll } from '../_supabase.js'
import { check, cleanRule } from '../../src/alerts/rules.js'
import { DEFAULTS } from '../../src/lib/stochrsi.js'
import { STRONG_LABEL, ATTENTION_LABEL } from '../../src/lib/format.js'
import { DISCLAIMER_SHORT } from '../../src/lib/legal.js'
import { MAIN_TREND_TF, combined, trendOf } from '../../src/lib/trend.js'
import { PLANS } from '../../src/lib/plans.js'

// Controllo delle notifiche, una volta al minuto.
// Lo chiama il cron di Vercel (vercel.json, ogni minuto) con l'intestazione Authorization: Bearer <CRON_SECRET>,
// che Vercel aggiunge da solo se la variabile CRON_SECRET esiste. Va bene anche ?key=<CRON_SECRET> per una prova a mano.
// Utenti e titoli seguiti arrivano da Supabase (solo chi ha collegato Telegram e ha un piano con gli avvisi);
// la memoria anti-spam e la coda dei messaggi stanno su Upstash. Da Bitunix si leggono solo i titoli seguiti.

const LOCK_S = 58          // due controlli non si sovrappongono mai (niente messaggi doppi)
const BUDGET_MS = 50e3     // dopo, i messaggi rimasti partono al giro successivo
const ALERT_PLANS = PLANS.filter(p => p.alerts).map(p => p.id)

const fmt = k => (k < 10 ? k.toFixed(1) : String(Math.round(k))).replace('.', ',')
const clock = () => new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' }).format(new Date())

function message({ s, kind, side, values, rule, link, trend }) {
  const name = s.replace(/USDT$/, '')
  const os = side === 'oversold'
  // Linguaggio descrittivo, mai operativo (niente "compra", "vendi", "entra")
  const head = kind === 'zone'
    ? `${os ? '🟢' : '🔴'} <b>${esc(name)}</b> · ${STRONG_LABEL[side]}`
    : `🟡 <b>${esc(name)}</b> · vicino all'${STRONG_LABEL[side].toLowerCase()}`
  const what = kind === 'zone' ? ATTENTION_LABEL[side] : `In avvicinamento alla ${ATTENTION_LABEL[side].toLowerCase().replace(/long|short/, m => m[0].toUpperCase() + m.slice(1))}`
  const vals = rule.tfs.map(tf => `${tf} <b>${fmt(values[tf])}</b>`).join(' · ')
  // Contesto EMA 200 sul trend principale: stessa lettura combinata del dettaglio
  const mix = combined(side, trend)
  const ctx = mix ? `\n${mix.tone === 'caution' ? '⚠️' : trendOf(trend).glyph} ${mix.text} <i>(EMA 200 ${MAIN_TREND_TF})</i>`
    : trend === 0 ? `\nTrend ${MAIN_TREND_TF}: dati insufficienti` : ''
  return `${head}\n${what} · ${vals}${ctx}\n${clock()} · <a href="${link}">Vedi ${esc(name)} nell'app</a>\n<i>${DISCLAIMER_SHORT}</i>`
}

const cleanSymbols = list => (Array.isArray(list) ? list : [])
  .filter(x => typeof x?.s === 'string' && /^[A-Z0-9]{2,24}$/.test(x.s)).slice(0, 20).map(x => ({ s: x.s, near: !!x.near }))

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers?.authorization === `Bearer ${secret}` || req.query?.key === secret
  if (!secret || !auth) return res.status(403).json({ error: 'Chiave mancante' })
  if (!hasStore() || !hasBot() || !hasSupabase()) return res.status(503).json({ error: 'Notifiche non configurate' })
  const t0 = Date.now()

  if (!(await redis('SET', 'lock:check', String(t0), 'NX', 'EX', LOCK_S))) return res.status(200).json({ skipped: 'controllo già in corso' })
  try {
    // Prima i messaggi rimasti dal giro precedente
    const before = await drain(t0 + 8e3)

    // Utenti collegati a Telegram con un piano che include gli avvisi
    const subs = await selectAll(() => db().from('alert_subscriptions')
      .select('user_id, telegram_chat_id, rule, symbols, profiles!inner(plan)')
      .not('telegram_chat_id', 'is', null)
      .in('profiles.plan', ALERT_PLANS)
      .order('user_id'))
    const users = subs.map(x => ({ id: x.user_id, chat: x.telegram_chat_id, rule: cleanRule(x.rule), symbols: cleanSymbols(x.symbols) }))
      .filter(u => u.symbols.length)

    // Memoria anti-spam di tutti in poche letture
    const mems = []
    for (let i = 0; i < users.length; i += 500) {
      const got = await redis('MGET', ...users.slice(i, i + 500).map(u => memKey(u.id)))
      mems.push(...got.map(parse))
    }

    // Titoli e timeframe da leggere: l'unione di quelli di tutti gli utenti
    const need = {}
    for (const u of users) for (const { s } of u.symbols) for (const tf of [...u.rule.tfs, MAIN_TREND_TF]) (need[tf] ||= new Set()).add(s)
    const values = {} // values[s][tf] = K
    const trend = {}  // trend[s] = 1 / -1 / 0 sul timeframe principale
    await Promise.all(Object.entries(need).map(async ([tf, set]) => {
      const out = await run(tf, [...set], DEFAULTS).catch(() => null)
      for (const r of out?.rows || []) {
        (values[r.s] ||= {})[tf] = r.k[r.k.length - 1]
        if (tf === MAIN_TREND_TF) trend[r.s] = r.t
      }
    }))

    const host = process.env.APP_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || req.headers?.['x-forwarded-host'] || req.headers?.host
    const base = /^https?:\/\//.test(host) ? host : `https://${host}`
    const writes = [], queue = []
    users.forEach((u, i) => {
      const mem = { ...(mems[i] || {}) }
      let changed = false
      for (const { s, near } of u.symbols) {
        if (!values[s]) continue
        const old = mems[i]?.[s] || null
        const r = check(values[s], u.rule, near, old)
        if (JSON.stringify(r.mem) !== JSON.stringify(old)) { mem[s] = r.mem; changed = true }
        for (const ev of r.events) queue.push({ chat: u.chat, uid: u.id, text: message({ s, ...ev, values: values[s], rule: u.rule, trend: trend[s], link: `${base}/?s=${encodeURIComponent(s)}` }) })
      }
      for (const s of Object.keys(mem)) if (!u.symbols.some(x => x.s === s)) { delete mem[s]; changed = true } // titoli non più seguiti
      if (changed) writes.push(['SET', memKey(u.id), JSON.stringify(mem), 'EX', 30 * 86400])
    })
    await pipeline(writes)

    // Coda a scaglioni: quello che non parte entro il tempo, parte al giro dopo
    await enqueue(queue)
    const after = await drain(t0 + BUDGET_MS)

    // Chi ha bloccato il bot o cancellato la chat: scollego
    const blocked = [...before.blocked, ...after.blocked]
    for (const b of blocked) await db().from('alert_subscriptions').update({ telegram_chat_id: null, telegram_name: null }).eq('user_id', b.uid).eq('telegram_chat_id', b.chat)

    return res.status(200).json({
      users: users.length, symbols: Object.keys(values).length, queued: queue.length,
      sent: before.sent + after.sent, left: after.left, dropped: before.dropped + after.dropped, unlinked: blocked.length, ms: Date.now() - t0,
    })
  } catch (e) {
    return res.status(502).json({ error: e.message })
  } finally {
    await redis('DEL', 'lock:check').catch(() => null)
  }
}
