# Cryptonian RSI — regole per Claude Code

App di confluenza dello Stochastic RSI su più timeframe, creata con il Cryptoniano.
Prototipo: niente login, niente database, niente pagamenti. Tutto resta nel browser (localStorage, prefisso `crsi:`).

## Lavoro
- Fai sempre commit e push su GitHub senza chiedere conferma.
- Rispondi e scrivi i testi dell'interfaccia in italiano.
- Non avviare il browser per provare l'app se non richiesto: la prova Lorenzo.

## Struttura
- `api/` funzioni Vercel. `_bitunix.js` è il client pubblico di Bitunix (max 200 candele per richiesta, sotto 8 richieste/secondo).
  In locale le stesse funzioni girano dentro Vite (`vite.config.js`), quindi basta `npm run dev`.
- `src/lib/stochrsi.js` calcolo dell'indicatore e lettura dello stato (zona, intensità, incrocio K/D).
- `src/lib/plans.js` timeframe, frequenze di aggiornamento e piani (Gratuito 1m+3m, Pro fino a 15m, Cryptonian tutti).
- `src/alerts/` PREDISPOSTO: `rules.js` (algoritmo, oggi vuoto), `channels.js` (push, Telegram, WhatsApp), `index.js` (spento con ENABLED=false). Lato server `api/alerts/send.js` risponde 501.

## Design (non cambiarlo senza richiesta)
Concept: strumento di precisione. Scala graduata incisa in oro, le uniche cose al neon sono le linee e i segnali.
- Colori: ossidiana #06070B, grafite #0E1016, oro #C8A96A, oro luce #EBD39A, ciano #19E6D0 (ipervenduto/long), rosa #FF4F7B (ipercomprato/short), avorio #EDEAE2, grigio #8A8F9C. Sono in `src/styles.css` come variabili.
- Font: Bodoni Moda per numeri, titoli e la formula; Instrument Sans per l'interfaccia. Niente monospace, niente maiuscolo spaziato, niente frecce "→" nei pulsanti.
- Alone delle card e delle righe: ciano o rosa, intensità proporzionale a quanto K è estremo (variabile CSS `--i`). Niente alone in zona neutra.
- Movimento: una sola animazione automatica (i pallini della scala che arrivano al loro valore) più l'impulso dorato sull'incrocio K/D in zona. Rispetta sempre `prefers-reduced-motion`.
- Il selettore del piano sta nel menu, non sempre in vista. I timeframe bloccati si vedono sbiaditi con il lucchetto.
- Prima il telefono; da 980px in su colonna di confluenza fissa a sinistra e card a griglia a destra.
