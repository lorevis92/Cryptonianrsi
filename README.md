# Cryptonian RSI

Lo Stochastic RSI di ogni mercato Bitunix su 7 timeframe insieme, per vedere a colpo d'occhio quando si allineano.

## Avvio in locale
```
npm install
npm run dev
```
Apri l'indirizzo che compare (di solito http://localhost:5173). Le candele arrivano da Bitunix tramite `/api`, anche in locale.

## Pubblicazione
1. Crea il repository su GitHub e fai il primo push.
2. Su Vercel importa il repository: preset Vite, nessuna variabile d'ambiente necessaria.

## Cosa c'è
- Colonna di confluenza: tutti i timeframe sulla stessa scala 0–100, con il conteggio di quanti sono in ipervenduto o ipercomprato.
- Una card per timeframe con candele, K e D, soglie 80/20, alone proporzionale e impulso sugli incroci in zona. Si può ingrandire.
- Ricerca su tutte le coppie Bitunix (cripto, oro, azioni, indici).
- Piani nel menu: Gratuito (1m, 3m), Pro (fino a 15m), Cryptonian (tutti, con avvisi). Nel prototipo si cambiano liberamente.
- Impostazioni dell'indicatore modificabili, con ripristino dei valori classici.
- Avvisi predisposti (notifica, Telegram, WhatsApp) in `src/alerts/` e `api/alerts/send.js`.
