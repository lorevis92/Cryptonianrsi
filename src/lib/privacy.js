// Testo della pagina "Privacy" (nel menu). Da far rivedere a un legale prima del lancio pubblico.

export const PRIVACY_UPDATED = '20 novembre 2026'

export const PRIVACY = [
  ['In breve', [
    'Raccogliamo solo i dati che servono a farti usare l\'app: il tuo account, le tue impostazioni e, se le attivi, le notifiche Telegram. Non vendiamo dati, non usiamo pubblicità né strumenti di tracciamento.',
  ]],
  ['Senza account', [
    'Puoi usare la mappa, l\'elenco e il dettaglio dei titoli senza registrarti. In questo caso preferiti e impostazioni restano solo nel tuo browser (memoria locale del dispositivo) e non arrivano a noi.',
  ]],
  ['Con l\'account', [
    'Account: email e, se accedi con Google, nome e identificativo forniti da Google. Se ti registri con email e password, la password è conservata da Supabase solo in forma cifrata irreversibile (hash): nessuno, nemmeno noi, può leggerla.',
    'Profilo: il nome che scegli e, se la carichi, la foto profilo (ridotta e compressa sul tuo telefono prima dell\'invio). La foto è privata: la vedi solo tu.',
    'Impostazioni: piano, titoli preferiti, impostazioni del calcolatore del rischio e dell\'indicatore, per ritrovarle su tutti i tuoi dispositivi.',
    'Notifiche: titoli seguiti, regola degli avvisi e, se colleghi Telegram, l\'identificativo della chat e il nome utente Telegram, per mandarti gli avvisi. Per evitare messaggi doppi conserviamo per 30 giorni l\'ultimo stato degli avvisi di ciascun titolo.',
  ]],
  ['A cosa servono', [
    'Solo a fornirti il servizio: farti accedere, salvare le tue scelte e inviarti gli avvisi che hai chiesto. Il trattamento si basa sul contratto di servizio che accetti usando l\'app.',
  ]],
  ['Dove stanno e chi li tratta', [
    'Account, impostazioni e foto: Supabase, server nell\'Unione europea (Francoforte). App e funzioni: Vercel. Stato veloce degli avvisi: Upstash. Messaggi: Telegram. Email di accesso: il servizio di invio email configurato (per esempio Resend). Accesso con Google: Google.',
    'I dati di mercato arrivano da Bitunix (e, per lo storico lungo delle crypto, da Binance o Bybit) e non contengono informazioni su di te. Il server li scarica senza inviare nulla che ti riguardi.',
    "Se apri \"Storico completo\" su un'azione o una materia prima, il grafico è caricato direttamente da TradingView, che riceve i dati tecnici della connessione (come l'indirizzo IP) e può usare cookie secondo la sua informativa sulla privacy.",
  ]],
  ['Sicurezza', [
    'Ogni utente può leggere e modificare solo i propri dati: lo garantiscono le regole del database (Row Level Security). Le chiavi di amministrazione restano sul server e non sono mai nell\'app.',
  ]],
  ['Come cancellarli', [
    'Area personale → Elimina account: cancelliamo subito account, profilo, foto, impostazioni, titoli seguiti, collegamento Telegram e stato degli avvisi. I messaggi già ricevuti su Telegram restano nella tua chat: puoi cancellarli da Telegram.',
    'Per scollegare solo Telegram: pagina Notifiche → Scollega, oppure scrivi /stop al bot.',
    'Senza account: basta cancellare i dati del sito dal browser.',
  ]],
  ['I tuoi diritti', [
    'Puoi chiedere accesso, correzione, cancellazione o una copia dei tuoi dati, e opporti al trattamento. Puoi anche rivolgerti al Garante per la protezione dei dati personali.',
  ]],
]
