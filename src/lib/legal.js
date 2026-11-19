// Testi legali in un solo posto: schermata del primo avvio, riga in fondo alle pagine,
// pagina "Note legali" e riga in fondo ai messaggi Telegram.

// Cambia la versione se cambi il testo del primo avvio: tutti dovranno riaccettarlo.
export const DISCLAIMER_VERSION = 1

export const DISCLAIMER = 'Cryptonian RSI è uno strumento di analisi e formazione. Non fornisce consulenza finanziaria né raccomandazioni di investimento. Il trading con leva comporta un alto rischio di perdita del capitale.'

export const DISCLAIMER_SHORT = 'Solo analisi, non consulenza finanziaria.'

export const LEGAL = [
  ['Cos\'è Cryptonian RSI', [
    'Cryptonian RSI è uno strumento di analisi tecnica e di formazione. Mostra lo Stochastic RSI di diversi titoli su più timeframe e lo descrive con etichette come "Eccesso di ribasso", "Eccesso di rialzo" o "Zona di attenzione".',
    'Queste etichette descrivono lo stato dell\'indicatore in quel momento. Non sono segnali di acquisto o di vendita e non dicono se, quando o quanto operare.',
  ]],
  ['Nessuna consulenza finanziaria', [
    'Niente di quanto mostrato nell\'app, nelle notifiche o nei materiali collegati costituisce consulenza finanziaria, consulenza in materia di investimenti, sollecitazione o raccomandazione personalizzata.',
    'Le decisioni di investimento sono solo tue. Prima di operare valuta la tua situazione finanziaria, i tuoi obiettivi e, se serve, rivolgiti a un consulente abilitato.',
  ]],
  ['Rischi del trading', [
    'Il trading di criptovalute, futures e altri strumenti con leva comporta un alto rischio di perdita del capitale e può non essere adatto a tutti. Con la leva le perdite possono superare rapidamente il capitale impiegato nella posizione e portare alla liquidazione.',
    'I risultati passati e le letture dell\'indicatore non garantiscono risultati futuri.',
  ]],
  ['Dati di mercato', [
    'Prezzi e candele provengono dalle API pubbliche di Bitunix e possono essere in ritardo, incompleti o errati. L\'app può non essere disponibile in qualsiasi momento.',
  ]],
  ['Notifiche Telegram', [
    'Le notifiche sono un servizio di comodità: possono arrivare in ritardo, più volte o non arrivare. Non fare affidamento solo su di esse.',
  ]],
  ['Calcolatore del rischio', [
    'Il calcolatore fa un conto aritmetico a partire dai valori che inserisci, dal prezzo attuale e dall\'ATR. È una stima a scopo educativo: non tiene conto di commissioni, funding, slittamento del prezzo, gap, prezzo di liquidazione né delle regole del tuo exchange. Lo stop suggerito a 1,5 × ATR è una convenzione didattica, non un consiglio.',
  ]],
  ['Responsabilità', [
    'Usando l\'app accetti che l\'autore non è responsabile di perdite o danni derivanti dall\'uso delle informazioni mostrate.',
  ]],
]
