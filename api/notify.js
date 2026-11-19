import { randomBytes } from 'node:crypto'
import { redis, pipeline, hasStore, userKey, memKey, parse } from './_store.js'
import { hasBot, botName, send } from './_telegram.js'
import { cleanRule, DEFAULT_RULE, MAX_SYMBOLS } from '../src/alerts/rules.js'

// API della pagina Notifiche. Niente login nel prototipo: il dispositivo ha un codice segreto
// (crsi:notifyId) che manda nell'intestazione x-crsi-id.
//   GET                                     stato: collegato?, titoli seguiti, regola
//   POST { action: 'link' }                 link personale al bot (t.me/<bot>?start=<codice>, vale 15 minuti)
//   POST { action: 'unlink' }               scollega Telegram
//   POST { action: 'save', symbols, rule }  titoli seguiti e regola
const LINK_TTL = 15 * 60

const blank = () => ({ chat: null, name: null, symbols: [], rule: DEFAULT_RULE, at: Date.now() })
const view = (u, bot) => ({ configured: true, bot, linked: !!u.chat, name: u.name || null, symbols: u.symbols || [], rule: u.rule || DEFAULT_RULE })

function cleanSymbols(list) {
  const out = [], seen = new Set()
  for (const x of Array.isArray(list) ? list : []) {
    const s = String(x?.s || '').toUpperCase()
    if (!/^[A-Z0-9]{2,24}$/.test(s) || seen.has(s)) continue
    seen.add(s)
    out.push({ s, near: !!x.near })
    if (out.length >= MAX_SYMBOLS) break
  }
  return out
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  const id = String(req.headers?.['x-crsi-id'] || '')
  if (!/^[a-f0-9]{32}$/.test(id)) return res.status(400).json({ error: 'Codice del dispositivo mancante' })
  if (!hasStore() || !hasBot()) return res.status(200).json({ configured: false })
  try {
    const key = userKey(id)
    const u = parse(await redis('GET', key)) || blank()
    const bot = await botName().catch(() => null)
    const record = () => JSON.stringify({ ...u, at: Date.now() })

    if (req.method === 'GET') return res.status(200).json(view(u, bot))
    if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non previsto' })

    const { action } = req.body || {}
    if (action === 'link') {
      if (!bot) throw new Error('Il bot Telegram non risponde')
      const code = randomBytes(16).toString('base64url')
      await pipeline([['SET', 'link:' + code, id, 'EX', LINK_TTL], ['SET', key, record()]])
      return res.status(200).json({ url: `https://t.me/${bot}?start=${code}`, expires: Date.now() + LINK_TTL * 1000 })
    }
    if (action === 'unlink') {
      const chat = u.chat
      if (chat) {
        u.chat = null
        u.name = null
        await pipeline([['SREM', 'users', id], ['DEL', 'chat:' + chat], ['SET', key, record()]])
        await send(chat, 'Telegram scollegato da Cryptonian RSI. Non riceverai più avvisi qui.').catch(() => null)
      }
      return res.status(200).json(view(u, bot))
    }
    if (action === 'save') {
      const rule = cleanRule(req.body.rule)
      const reset = JSON.stringify(rule) !== JSON.stringify(u.rule || DEFAULT_RULE) // regola nuova: si riparte da zero, senza avvisi a vuoto
      u.rule = rule
      u.symbols = cleanSymbols(req.body.symbols)
      await pipeline([['SET', key, record()], ...(reset ? [['DEL', memKey(id)]] : [])])
      return res.status(200).json(view(u, bot))
    }
    return res.status(400).json({ error: 'Azione non prevista' })
  } catch (e) {
    return res.status(502).json({ error: e.message })
  }
}
