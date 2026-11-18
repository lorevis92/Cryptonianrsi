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
- `src/lib/stochrsi.js` calcolo dell'indicatore e lettura dello stato (zona, intensità, incrocio K/D). `readTail` legge lo stato dalla sola coda di K e D.
- `api/scan.js` scansione di un timeframe per la mappa (`/api/scan?tf=1h`): i ~50 titoli più scambiati su Bitunix nelle 24 ore, una richiesta da 200 candele per titolo, risponde solo la coda di K e D. Con `&symbols=` i preferiti fuori dai primi 50. Cache Vercel da 20 s (1m) a 30 min (1d).
- `src/lib/alignment.js` UNICO file con pesi e regole della mappa (pesi per timeframe, spessore anelli, penalità zona opposta, timeframe del segnale d'entrata). Qui si adattano le indicazioni del mentore.
- `src/lib/useScan.js` scarica i 7 timeframe in parallelo e li tiene in memoria; `useSymbolTails` dà al dettaglio i timeframe bloccati dalla stessa scansione. `BubbleMap.jsx` (pagina), `BubbleCanvas.jsx` (canvas + d3-force), `MiniRings.jsx` (anelli in SVG per elenco e legenda).
- `src/lib/bubbleDraw.js` UNICO disegno della bolla, usato dalla mappa e da `Bubble.jsx` (la bolla del titolo nel dettaglio, accanto al numero di confluenza). Se cambi lo stile della bolla, cambialo qui.
- `src/lib/plans.js` timeframe, frequenze di aggiornamento e piani (Gratuito 1m+3m, Pro fino a 15m, Cryptonian tutti).
- `src/alerts/` PREDISPOSTO: `rules.js` (algoritmo, oggi vuoto), `channels.js` (push, Telegram, WhatsApp), `index.js` (spento con ENABLED=false). Lato server `api/alerts/send.js` risponde 501.

## Pagine
- Pagina iniziale: mappa a bolle, visibile su tutti i piani. Ogni bolla è un titolo, 7 anelli concentrici (1d esterno e più spesso, 1m al centro), ciano/rosa per zona, pieno quanto K è estremo, filo sottile se neutro. Grandezza = punteggio di allineamento. Anello dorato = segnale d'entrata (incrocio K/D in zona su 1h, 4h o 1d). Interruttore Bolle / Elenco, filtro Tutti / Ipervenduto / Ipercomprato, legenda apribile.
- Toccando una bolla o una riga si apre il dettaglio del titolo (confluenza e card, con i blocchi del piano). Si torna alla mappa con l'icona a bolle nella barra in alto, con Indietro o toccando la bolla del titolo accanto al numero di confluenza (in quel caso il titolo resta evidenziato nella mappa con un anello avorio).

## Design (non cambiarlo senza richiesta)
Concept: strumento di precisione. Scala graduata incisa in oro, le uniche cose al neon sono le linee e i segnali.
- Colori: ossidiana #06070B, grafite #0E1016, oro #C8A96A, oro luce #EBD39A, ciano #19E6D0 (ipervenduto/long), rosa #FF4F7B (ipercomprato/short), avorio #EDEAE2, grigio #8A8F9C. Sono in `src/styles.css` come variabili.
- Font: Bodoni Moda per numeri, titoli e la formula; Instrument Sans per l'interfaccia. Niente monospace, niente maiuscolo spaziato, niente frecce "→" nei pulsanti.
- Alone delle card e delle righe: ciano o rosa, intensità proporzionale a quanto K è estremo (variabile CSS `--i`). Niente alone in zona neutra.
- Movimento nel dettaglio: una sola animazione automatica (i pallini della scala che arrivano al loro valore) più l'impulso dorato sull'incrocio K/D in zona.
- Movimento nella mappa: entrata animata una sola volta per sessione, poi le bolle galleggiano piano e si spingono tra loro; grandezza e colori cambiano lentamente; l'anello dorato del segnale pulsa una volta quando compare.
- Ingrandire un grafico: da telefono sale dal basso a tutto schermo (timeframe, K, D, chiudi); da computer la card si allarga a tutta la riga con View Transitions (altrimenti FLIP).
- I grafici sono inattivi finché non li tocchi: il dito e la rotella scorrono la pagina. Attivi = leggera scala e bordo dorato più acceso.
- Rispetta sempre `prefers-reduced-motion`: niente deriva, niente impulsi, valori subito al loro posto.
- Il selettore del piano sta nel menu, non sempre in vista. I timeframe bloccati si vedono sbiaditi con il lucchetto.
- Prima il telefono; da 980px in su colonna di confluenza fissa a sinistra e card a griglia a destra.
