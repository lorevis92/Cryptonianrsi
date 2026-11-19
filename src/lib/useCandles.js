import { useEffect, useRef, useState } from 'react'
import { REFRESH } from './plans.js'

// Scarica le candele di un timeframe e le aggiorna da solo.
// Si ferma quando la pagina non è in vista o il timeframe è bloccato dal piano.
export function useCandles(symbol, tf, enabled) {
  const [state, setState] = useState({ bars: null, error: null, loading: enabled })
  const timer = useRef()

  useEffect(() => {
    if (!enabled) { setState({ bars: null, error: null, loading: false }); return }
    let alive = true
    setState(s => ({ ...s, bars: null, loading: true, error: null }))

    async function tick() {
      clearTimeout(timer.current)
      if (document.hidden) return
      try {
        const r = await fetch(`/api/klines?symbol=${symbol}&interval=${tf}&limit=300`)
        const j = await r.json()
        if (!r.ok) throw new Error(j.error || 'Dati non disponibili')
        if (alive) setState({ bars: j.bars, ema: j.ema || null, precision: Number.isInteger(j.precision) ? j.precision : null, error: null, loading: false })
      } catch (e) {
        if (alive) setState(s => ({ ...s, error: e.message, loading: false }))
      }
      if (alive) timer.current = setTimeout(tick, REFRESH[tf])
    }
    const onVis = () => { if (!document.hidden) tick() }
    document.addEventListener('visibilitychange', onVis)
    tick()
    return () => { alive = false; clearTimeout(timer.current); document.removeEventListener('visibilitychange', onVis) }
  }, [symbol, tf, enabled])

  return state
}
