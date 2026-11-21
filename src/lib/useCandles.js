import { useCallback, useEffect, useRef, useState } from 'react'
import { REFRESH } from './plans.js'
import { EMA_LENGTH } from './trend.js'

// Scarica le candele di un timeframe e le aggiorna da solo.
// Si ferma quando la pagina non è in vista o il timeframe è bloccato dal piano.
// loadOlder(): scorrendo il grafico a sinistra arrivano le candele più vecchie (300 alla volta),
// che restano anche quando arrivano gli aggiornamenti delle candele recenti.
const OLDER_BATCH = 300
const EMA_BACK_MAX = 1500 // oltre, l'EMA calcolata all'indietro perderebbe precisione: lì la linea si ferma

// EMA delle candele più vecchie, all'indietro dal primo valore noto (stessa formula del server, invertita)
function emaBack(older, nextBar, nextEma, stepsSoFar) {
  const a = 2 / (EMA_LENGTH + 1)
  const out = new Array(older.length).fill(null)
  if (nextEma == null) return out
  let v = nextEma, c = nextBar.c
  for (let i = older.length - 1; i >= 0; i--) {
    if (stepsSoFar + (older.length - i) > EMA_BACK_MAX) break
    v = (v - a * c) / (1 - a)
    out[i] = v
    c = older[i].c
  }
  return out
}

export function useCandles(symbol, tf, enabled) {
  const [state, setState] = useState({ bars: null, error: null, loading: enabled })
  const timer = useRef()
  const older = useRef({ bars: [], ema: [], done: false, busy: false })

  useEffect(() => {
    older.current = { bars: [], ema: [], done: false, busy: false }
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
        if (alive) {
          // Le candele più vecchie già caricate restano davanti a quelle nuove
          const o = older.current, first = j.bars[0]?.t
          const keep = first == null ? 0 : o.bars.findIndex(b => b.t >= first)
          const n = keep < 0 ? o.bars.length : keep
          const bars = [...o.bars.slice(0, n), ...j.bars]
          const ema = j.ema ? [...o.ema.slice(0, n), ...j.ema] : null
          setState({ bars, ema, precision: Number.isInteger(j.precision) ? j.precision : null, error: null, loading: false })
        }
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

  const loadOlder = useCallback(async () => {
    const o = older.current
    const cur = state.bars
    if (o.done || o.busy || !cur?.length) return
    o.busy = true
    try {
      const r = await fetch(`/api/klines?symbol=${symbol}&interval=${tf}&limit=${OLDER_BATCH}&end=${cur[0].t}`)
      const j = await r.json()
      const add = (j.bars || []).filter(b => b.t < cur[0].t)
      if (!add.length) { o.done = true; return }
      const steps = o.bars.length
      const addEma = emaBack(add, cur[0], state.ema?.[0] ?? null, steps)
      o.bars = [...add, ...o.bars]
      o.ema = [...addEma, ...o.ema]
      setState(s => (s.bars === cur ? { ...s, bars: [...add, ...cur], ema: s.ema ? [...addEma, ...s.ema] : null } : s))
    } catch { /* riprovo al prossimo scorrimento */ } finally { o.busy = false }
  }, [symbol, tf, state.bars, state.ema])

  return { ...state, loadOlder }
}
