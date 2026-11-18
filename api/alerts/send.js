// PREDISPOSTO — invio avvisi su Telegram e WhatsApp.
// Quando sarà pronto l'algoritmo degli avvisi:
//  - Telegram: variabile TELEGRAM_BOT_TOKEN, POST https://api.telegram.org/bot<token>/sendMessage { chat_id, text }
//  - WhatsApp: WhatsApp Cloud API (Meta) con WHATSAPP_TOKEN e WHATSAPP_PHONE_ID, messaggi template
// Il client chiama questo endpoint con { channel: 'telegram' | 'whatsapp', to, text }.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Usa POST' })
    return
  }
  res.status(501).json({ error: 'Invio avvisi non ancora attivo', channel: req.body?.channel ?? null })
}
