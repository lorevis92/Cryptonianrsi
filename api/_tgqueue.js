import { redis, pipeline } from './_store.js'
import { send } from './_telegram.js'

// Coda dei messaggi Telegram, inviati a scaglioni.
// Limiti di Telegram: circa 30 messaggi al secondo in tutto e 1 al secondo nella stessa chat.
// Se molti utenti seguono lo stesso titolo e scatta un avviso, i messaggi entrano in coda (Upstash, lista "tgq")
// e partono a ritmo controllato; quello che non fa in tempo parte al controllo del minuto dopo.

const KEY = 'tgq'
const PER_SECOND = 25          // sotto il limite globale di Telegram
const SAME_CHAT_MS = 1100      // tra due messaggi alla stessa chat
const MAX_AGE_MS = 10 * 60e3   // un avviso più vecchio di 10 minuti non serve più
const MAX_TRIES = 3

// item: { chat, text, uid, at }
export async function enqueue(items) {
  const cmds = []
  for (let i = 0; i < items.length; i += 200) cmds.push(['RPUSH', KEY, ...items.slice(i, i + 200).map(x => JSON.stringify({ ...x, at: x.at || Date.now(), tries: 0 }))])
  await pipeline(cmds)
}

// Invia finché c'è tempo (deadline in ms). Restituisce { sent, dropped, left, blocked: [{ uid, chat }] }
export async function drain(deadline) {
  const out = { sent: 0, dropped: 0, left: 0, blocked: [] }
  const lastByChat = new Map()
  const retry = []
  let windowStart = Date.now(), inWindow = 0
  const sleep = ms => new Promise(r => setTimeout(r, ms))

  while (Date.now() < deadline - 1500) {
    const raw = await redis('LPOP', KEY, PER_SECOND)
    if (!raw?.length) break
    const batch = raw.map(x => { try { return JSON.parse(x) } catch { return null } }).filter(Boolean)
    const sentAtStart = out.sent
    for (let i = 0; i < batch.length; i++) {
      const m = batch[i]
      if (Date.now() - m.at > MAX_AGE_MS) { out.dropped++; continue }
      // Ritmo globale: al massimo PER_SECOND messaggi per secondo
      if (inWindow >= PER_SECOND) {
        const wait = 1000 - (Date.now() - windowStart)
        if (wait > 0) await sleep(wait)
        windowStart = Date.now(); inWindow = 0
      }
      // Stessa chat: aspetto il suo turno senza bloccare gli altri (va in fondo alla coda)
      const last = lastByChat.get(m.chat) || 0
      if (Date.now() - last < SAME_CHAT_MS) { retry.push(m); continue }
      try {
        await send(m.chat, m.text)
        out.sent++; inWindow++
        lastByChat.set(m.chat, Date.now())
      } catch (e) {
        if (e.code === 429) {
          // Troppi messaggi: rimetto in testa questo e il resto del gruppo e mi fermo per questo giro
          await redis('LPUSH', KEY, ...[m, ...batch.slice(i + 1)].reverse().map(x => JSON.stringify(x)))
          out.left = await redis('LLEN', KEY)
          if (retry.length) await redis('RPUSH', KEY, ...retry.map(x => JSON.stringify(x)))
          return out
        }
        if (e.code === 403 || e.code === 400) { out.blocked.push({ uid: m.uid, chat: m.chat }); continue } // bot bloccato o chat cancellata
        if (++m.tries < MAX_TRIES) retry.push(m); else out.dropped++
      }
    }
    // I messaggi rimandati (stessa chat) tornano in fondo alla coda e ripartono in questo stesso giro
    if (retry.length) {
      await redis('RPUSH', KEY, ...retry.splice(0).map(x => JSON.stringify(x)))
      // solo messaggi in attesa del turno della loro chat: aspetto un attimo invece di girare a vuoto
      if (out.sent === sentAtStart) await sleep(SAME_CHAT_MS / 2)
    }
  }
  out.left = await redis('LLEN', KEY)
  return out
}
