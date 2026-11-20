import { redis, pipeline, hasStore, userKey, memKey, parse } from './_store.js'
import { hasBot, send } from './_telegram.js'
import { db, hasSupabase, userFrom } from './_supabase.js'
import { cleanRule } from '../src/alerts/rules.js'
import { PLANS } from '../src/lib/plans.js'

// Operazioni dell'account che l'utente non può fare da sé con la RLS (le fa il server, solo per sé stesso):
//   POST { action: 'plan', plan }          cambia piano (prototipo: libero, senza pagamento)
//   POST { action: 'migrate', deviceId, plan }  porta sull'account il vecchio collegamento Telegram del dispositivo
//   POST { action: 'email', email }        cambia email subito, senza conferma via email (scelta del progetto)
//   POST { action: 'delete' }              elimina account, dati, foto e stato degli avvisi
// Autenticazione: Authorization: Bearer <token di accesso Supabase>.

// Prototipo: finché non ci sono i pagamenti, chiunque può scegliere il piano.
// Con i pagamenti: metti false e cambia il piano solo dal webhook del pagamento.
export const PLAN_SELF_SERVICE = true

const PLAN_IDS = PLANS.map(p => p.id)
const rank = id => PLAN_IDS.indexOf(id)

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non previsto' })
  if (!hasSupabase()) return res.status(503).json({ error: 'Account non configurati' })
  try {
    const user = await userFrom(req)
    if (!user) return res.status(401).json({ error: 'Sessione scaduta: accedi di nuovo' })
    const uid = user.id
    const { action } = req.body || {}

    if (action === 'plan') {
      const plan = req.body.plan
      if (!PLAN_SELF_SERVICE) return res.status(403).json({ error: 'Il piano si cambia con il pagamento' })
      if (!PLAN_IDS.includes(plan)) return res.status(400).json({ error: 'Piano non valido' })
      const { error } = await db().from('profiles').update({ plan }).eq('id', uid)
      if (error) throw new Error(error.message)
      return res.status(200).json({ plan })
    }

    if (action === 'migrate') {
      const out = { telegram: false, plan: null }
      // Piano scelto sul dispositivo (prototipo): lo tengo se è più alto di quello dell'account
      const local = req.body.plan
      if (PLAN_SELF_SERVICE && PLAN_IDS.includes(local)) {
        const { data } = await db().from('profiles').select('plan').eq('id', uid).single()
        if (data && rank(local) > rank(data.plan)) { await db().from('profiles').update({ plan: local }).eq('id', uid); out.plan = local }
      }
      // Vecchio collegamento Telegram legato al dispositivo (prima degli account), su Upstash.
      // Il codice del dispositivo è segreto: solo chi lo ha (quel browser) può trasferirlo.
      const deviceId = String(req.body.deviceId || '')
      if (hasStore() && /^[a-f0-9]{32}$/.test(deviceId)) {
        const old = parse(await redis('GET', userKey(deviceId)))
        if (old) {
          const { data: sub } = await db().from('alert_subscriptions').select('telegram_chat_id, symbols').eq('user_id', uid).single()
          const patch = {}
          if (old.chat && !sub?.telegram_chat_id) {
            await db().from('alert_subscriptions').update({ telegram_chat_id: null, telegram_name: null }).eq('telegram_chat_id', old.chat).neq('user_id', uid)
            Object.assign(patch, { telegram_chat_id: old.chat, telegram_name: old.name || null })
            out.telegram = true
          }
          if (!(Array.isArray(sub?.symbols) && sub.symbols.length) && Array.isArray(old.symbols) && old.symbols.length) {
            patch.symbols = old.symbols.filter(x => /^[A-Z0-9]{2,24}$/.test(String(x?.s))).slice(0, 20).map(x => ({ s: String(x.s), near: !!x.near }))
            patch.rule = cleanRule(old.rule)
          }
          if (Object.keys(patch).length) {
            const { error } = await db().from('alert_subscriptions').update(patch).eq('user_id', uid)
            if (error) throw new Error(error.message)
          }
          // Memoria anti-spam: la porto sull'account, così non arrivano avvisi doppi
          const mem = await redis('GET', memKey(deviceId))
          await pipeline([
            ...(mem ? [['SET', memKey(uid), mem, 'EX', 30 * 86400]] : []),
            ['DEL', userKey(deviceId), memKey(deviceId)], ['SREM', 'users', deviceId],
            ...(old.chat ? [['DEL', 'chat:' + old.chat]] : []),
          ])
          if (out.telegram && hasBot()) await send(old.chat, '<b>Collegamento trasferito sul tuo account Cryptonian RSI.</b> Gli avvisi continuano qui.').catch(() => null)
        }
      }
      return res.status(200).json(out)
    }

    if (action === 'email') {
      const email = String(req.body.email || '').trim().toLowerCase()
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return res.status(400).json({ error: "Controlla l'indirizzo email." })
      if (email === (user.email || '').toLowerCase()) return res.status(200).json({ email })
      const { error } = await db().auth.admin.updateUserById(uid, {
        email, email_confirm: true,
        user_metadata: { ...(user.user_metadata || {}), email_checked_at: new Date().toISOString() },
      })
      if (error) {
        if (error.code === 'email_exists' || /already|registered|exists/i.test(error.message)) return res.status(409).json({ error: 'Questa email è già usata da un altro account.' })
        throw new Error(error.message)
      }
      return res.status(200).json({ email })
    }

    if (action === 'delete') {
      // 1) foto profilo (tutta la cartella dell'utente)
      const files = await db().storage.from('avatars').list(uid, { limit: 100 })
      if (files.data?.length) await db().storage.from('avatars').remove(files.data.map(f => `${uid}/${f.name}`))
      // 2) Telegram: avviso e stato veloce degli avvisi
      const { data: sub } = await db().from('alert_subscriptions').select('telegram_chat_id').eq('user_id', uid).maybeSingle()
      if (sub?.telegram_chat_id && hasBot()) await send(sub.telegram_chat_id, 'Account Cryptonian RSI eliminato. Non riceverai più avvisi.').catch(() => null)
      if (hasStore()) await redis('DEL', memKey(uid)).catch(() => null)
      // 3) l'utente: profilo, impostazioni e notifiche spariscono a cascata (on delete cascade)
      const { error } = await db().auth.admin.deleteUser(uid)
      if (error) throw new Error(error.message)
      return res.status(200).json({ deleted: true })
    }

    return res.status(400).json({ error: 'Azione non prevista' })
  } catch (e) {
    return res.status(502).json({ error: e.message })
  }
}
