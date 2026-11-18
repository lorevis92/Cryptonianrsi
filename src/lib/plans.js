// Timeframe dal più piccolo al più grande e piani di abbonamento.
// I piani salgono a scalare: ogni piano include i timeframe del precedente.
// Prototipo: nessun pagamento, si cambia piano liberamente dal menu.

export const TIMEFRAMES = ['1m', '3m', '5m', '15m', '1h', '4h', '1d']

export const TF_LABEL = { '1m': '1 minuto', '3m': '3 minuti', '5m': '5 minuti', '15m': '15 minuti', '1h': '1 ora', '4h': '4 ore', '1d': '1 giorno' }

// Ogni quanto si aggiorna ogni timeframe (millisecondi)
export const REFRESH = { '1m': 15e3, '3m': 30e3, '5m': 30e3, '15m': 60e3, '1h': 120e3, '4h': 300e3, '1d': 600e3 }

export const PLANS = [
  { id: 'free', name: 'Gratuito', price: '0', timeframes: ['1m', '3m'], note: 'Per conoscere il metodo' },
  { id: 'pro', name: 'Pro', price: 'In arrivo', timeframes: ['1m', '3m', '5m', '15m'], note: 'Intraday completo' },
  { id: 'cryptonian', name: 'Cryptonian', price: 'In arrivo', timeframes: TIMEFRAMES, note: 'Tutta la confluenza, avvisi inclusi', alerts: true },
]

export const planById = id => PLANS.find(p => p.id === id) || PLANS[0]

// Primo piano che sblocca un timeframe
export const planFor = tf => PLANS.find(p => p.timeframes.includes(tf))
