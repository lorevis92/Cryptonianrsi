// Archivio delle notifiche: Upstash Redis (livello gratuito), via API REST, senza librerie.
// Su Vercel: Storage / Marketplace > Upstash for Redis > collega al progetto.
// Le variabili arrivano da sole (KV_REST_API_URL e KV_REST_API_TOKEN, oppure UPSTASH_REDIS_REST_*).
// In locale, senza variabili, usa una memoria temporanea per provare.

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
const LOCAL = !URL_ && !process.env.VERCEL

export const hasStore = () => !!(URL_ && TOKEN) || LOCAL

// Memoria temporanea per lo sviluppo locale (stessi comandi usati dall'app)
const mem = new Map()
const exp = new Map()
function local([cmd, ...a]) {
  const now = Date.now()
  for (const [k, t] of exp) if (t < now) { mem.delete(k); exp.delete(k) }
  const set = k => (mem.get(k) instanceof Set ? mem.get(k) : (mem.set(k, new Set()), mem.get(k)))
  switch (cmd.toUpperCase()) {
    case 'GET': return mem.has(a[0]) ? mem.get(a[0]) : null
    case 'MGET': return a.map(k => (mem.has(k) ? mem.get(k) : null))
    case 'SET': {
      if (a.includes('NX') && mem.has(a[0])) return null
      mem.set(a[0], String(a[1]))
      const i = a.indexOf('EX')
      if (i > 0) exp.set(a[0], now + Number(a[i + 1]) * 1000); else exp.delete(a[0])
      return 'OK'
    }
    case 'DEL': return a.reduce((n, k) => n + (mem.delete(k) ? 1 : 0), 0)
    case 'SADD': { const s = set(a[0]); a.slice(1).forEach(v => s.add(v)); return 1 }
    case 'SREM': { const s = set(a[0]); a.slice(1).forEach(v => s.delete(v)); return 1 }
    case 'SMEMBERS': return [...set(a[0])]
    default: throw new Error('Comando non previsto: ' + cmd)
  }
}

async function call(path, body) {
  const r = await fetch(URL_ + path, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}` }, body: JSON.stringify(body) })
  const j = await r.json()
  if (!r.ok || j.error) throw new Error('Archivio: ' + (j.error || r.status))
  return j
}

// redis('GET', 'chiave')
export async function redis(...cmd) {
  if (!hasStore()) throw new Error('Archivio non configurato')
  if (LOCAL) return local(cmd)
  return (await call('', cmd)).result
}

// Più comandi in una sola richiesta: pipeline([['GET','a'], ['SET','b','1']])
export async function pipeline(cmds) {
  if (!cmds.length) return []
  if (!hasStore()) throw new Error('Archivio non configurato')
  if (LOCAL) return cmds.map(local)
  const out = await call('/pipeline', cmds)
  return out.map(x => { if (x.error) throw new Error('Archivio: ' + x.error); return x.result })
}

// Utente (u:<id>): { chat, name, symbols: [{ s, near }], rule, at }
// Memoria anti-spam (m:<id>): { SYM: { oversold: { z, n }, overbought: { z, n } } }, la scrive solo il controllo
export const userKey = id => 'u:' + id
export const memKey = id => 'm:' + id
export const parse = v => { try { return v ? JSON.parse(v) : null } catch { return null } }
