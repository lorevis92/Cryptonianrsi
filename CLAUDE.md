# Cryptonian RSI — regole per Claude Code

App di confluenza dello Stochastic RSI su più timeframe, creata con il Cryptoniano.
Prototipo: niente login, niente database, niente pagamenti. Tutto resta nel browser (localStorage, prefisso `crsi:`).

## Lavoro
- Fai sempre commit e push su GitHub senza chiedere conferma.
- Rispondi e scrivi i testi dell'interfaccia in italiano.
- Non avviare il browser per provare l'app se non richiesto: la prova Lorenzo.
- Linguaggio SOLO descrittivo, mai operativo: niente "Compra", "Vendi", "Entra", "Entrata" (app, Legenda, Telegram). Etichette in `src/lib/format.js`: "Eccesso di ribasso/rialzo", "Zona di attenzione Long/Short", "Zona di attenzione 1h", "Momentum rialzista/ribassista".

## Struttura
- `api/` funzioni Vercel. `_bitunix.js` è il client pubblico di Bitunix (max 200 candele per richiesta, sotto 8 richieste/secondo).
  In locale le stesse funzioni girano dentro Vite (`vite.config.js`), quindi basta `npm run dev`.
- `src/lib/stochrsi.js` calcolo dell'indicatore e lettura dello stato (zona, intensità, incrocio K/D). `readTail` legge lo stato dalla sola coda di K e D.
- `api/_scan.js` scansione di un timeframe (i ~50 titoli più scambiati, una richiesta da 200 candele per titolo, solo la coda di K e D) con cache in memoria per timeframe: 1m ogni minuto, 1d ogni 30 minuti.
- `api/snapshot.js` FOTOGRAFIA UNICA della mappa (7 timeframe × ~50 titoli, ~25 KB). CDN Vercel `s-maxage=60, stale-while-revalidate=86400`: risponde sempre subito, si rinnova in sottofondo. Prima costruzione a freddo ~45 s.
- `api/scan.js` scansione su richiesta (`?tf=1h&symbols=...`): preferiti fuori dai primi 50, timeframe bloccati nel dettaglio, parametri dell'indicatore personalizzati.
- `.github/workflows/snapshot.yml` richiama `/api/snapshot` ogni 5 minuti per tenerla calda (attivo solo se la variabile del repository `SNAPSHOT_URL` è impostata). Vercel Hobby permette cron solo giornalieri, per questo è su GitHub.
- `src/lib/alignment.js` UNICO file con pesi e regole della mappa (pesi per timeframe, spessore anelli, penalità zona opposta, timeframe del segnale d'entrata). Qui si adattano le indicazioni del mentore.
- `src/lib/useScan.js` con i parametri classici scarica la fotografia e ne salva una copia sul dispositivo (`crsi:snapshot`): all'apertura la mappa è subito piena, poi si aggiorna ogni minuto con "Aggiornato X min fa"; con parametri personalizzati scarica i 7 timeframe da `/api/scan`; `useSymbolTails` dà al dettaglio i timeframe bloccati dalla stessa scansione. `BubbleMap.jsx` (pagina), `BubbleCanvas.jsx` (canvas + d3-force), `MiniRings.jsx` (anelli in SVG per elenco e legenda).
- `src/lib/bubbleDraw.js` UNICO disegno della bolla, usato dalla mappa e da `Bubble.jsx` (la bolla del titolo nel dettaglio, accanto al numero di confluenza). Se cambi lo stile della bolla, cambialo qui.
- `src/lib/trend.js` UNICO file dell'EMA 200 ("semaforo di contesto"): lunghezza, `MAIN_TREND_TF` (4h, metti '1d' per il giornaliero), storico iniziale (600 candele), etichette ▲/▼ e la lettura combinata con lo Stoch RSI (4 casi). Calcolo sul server in `api/_scan.js`: ogni riga ha `t` (1 sopra, -1 sotto, 0 dati insufficienti); il valore dell'EMA all'ultima candela chiusa ("seme") resta in memoria e su Upstash (`ema:<tf>`), così si riscarica lo storico solo la prima volta. Colori: gli stessi dello Stoch RSI, ciano rialzista e rosa ribassista (stesso colore = zona e trend concordano), sempre come pillola con la parola; `--caution` (ocra) per la lettura di cautela; la linea EMA nel grafico resta oro chiaro. `TrendBadge.jsx` badge e `TrendMark`: il trend si scrive sempre a parole ("Trend rialzista" / forma breve "Rialzista"), il triangolo solo insieme alla parola. Nei grafici delle card la linea oro chiaro è l'EMA 200: `/api/klines` la manda (`ema`) estendendo lo stesso seme del semaforo a tutte le candele (`emaSeries`), niente linea se lo storico non basta. La scala automatica segue solo le candele: se l'EMA è fuori vista resta la sua etichetta sul bordo dell'asse (`chart__edge`).
- Decimali del prezzo: `quotePrecision` di Bitunix (tick size), mandato da `/api/klines` come `precision`; `priceDecimals`/`fmtPrice(v, precision)` in `src/lib/format.js` (senza precisione: in base al prezzo, almeno 4 cifre significative). Usali per ogni prezzo mostrato e nel `priceFormat` dei grafici.
- `src/lib/risk.js` + `RiskPanel.jsx` calcolatore del rischio nel dettaglio ("Calcola il rischio"): ATR 14 del timeframe scelto (1h), stop 1,5 × ATR modificabile, perdita massima, dimensione, nozionale, leva minima (avviso oltre 5x). Take profit a multiplo del rischio (2:1 di partenza, 1,5/2/3 o a mano). Nell'interfaccia si dice "Timeframe" e "volatilità media", ATR solo nella spiegazione al tocco. Capitale e % salvati in `crsi:risk`.
- `src/lib/legal.js` tutti i testi legali (avvertenza del primo avvio con versione, riga breve, pagina Note legali, riga in fondo ai messaggi Telegram); `Legal.jsx` i componenti. Accettazione in `crsi:disclaimer`.
- `src/lib/plans.js` timeframe, frequenze di aggiornamento e piani (Gratuito 1m+3m, Pro fino a 15m, Cryptonian tutti).
- NOTIFICHE TELEGRAM (solo piano con `alerts: true`, oggi Cryptonian). `src/alerts/rules.js` UNICO file delle regole (preimpostata 3m+5m sotto 20 / sopra 80, avvicinamento 30/70, margine anti-spam, limiti), usato da app e server.
  - `api/notify.js` API della pagina Notifiche (dispositivo identificato da `crsi:notifyId` nell'intestazione `x-crsi-id`): stato, link personale `t.me/<bot>?start=<codice>` (15 min), scollega, salva titoli e regola.
  - `api/telegram.js` webhook del bot (`/start <codice>` collega, `/stop` scollega). Attivazione una tantum: `/api/telegram?setup=<CRON_SECRET>`.
  - `api/alerts/check.js` controllo ogni minuto, chiamato da cron-job.org con `Authorization: Bearer <CRON_SECRET>`: legge da Bitunix solo i titoli seguiti, un messaggio per ingresso in zona, lucchetto contro i controlli doppi.
  - `api/_store.js` Upstash Redis via REST (`KV_REST_API_URL`/`KV_REST_API_TOKEN` o `UPSTASH_REDIS_REST_*`); in locale senza variabili usa la memoria. Chiavi: `u:<id>` utente, `m:<id>` memoria anti-spam, `users`, `chat:<chatId>`, `link:<codice>`.
  - Variabili su Vercel: `TELEGRAM_BOT_TOKEN`, `CRON_SECRET` (+ quelle di Upstash, automatiche). Facoltativa `APP_URL` per i link nei messaggi.
  - Il link `/?s=BTCUSDT` apre direttamente il dettaglio del titolo.

## Pagine
- Pagina iniziale: mappa a bolle, visibile su tutti i piani. Ogni bolla è un titolo, 7 anelli concentrici (1d esterno e più spesso, 1m al centro), ciano/rosa per zona, pieno quanto K è estremo, filo sottile se neutro. Grandezza = punteggio di allineamento. Anello dorato = "Zona di attenzione" (incrocio K/D in zona su 1h, 4h o 1d). Interruttore Bolle / Elenco, filtro Tutti / Ipervenduto / Ipercomprato, legenda apribile.
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
- Il selettore del piano e la pagina Notifiche stanno nel menu, non sempre in vista. I timeframe bloccati si vedono sbiaditi con il lucchetto.
- Prima il telefono; da 980px in su colonna di confluenza fissa a sinistra e card a griglia a destra.
