import { useEffect, useRef, useState } from 'react'
import { createChart, CandlestickSeries, LineSeries, CrosshairMode, LineStyle } from 'lightweight-charts'
import { priceDecimals } from '../lib/format.js'

const TZ = -new Date().getTimezoneOffset() * 60
const toTime = t => Math.floor(t / 1000) + TZ

// Proporzioni dei due riquadri: candele sopra, Stochastic RSI sotto.
const RATIO = { normal: [5, 3], tall: [9, 4] }

const options = {
  autoSize: true,
  layout: {
    background: { type: 'solid', color: 'transparent' }, textColor: '#6E7380',
    fontFamily: 'Instrument Sans, sans-serif', fontSize: 11, attributionLogo: false,
    panes: { separatorColor: '#1D1B16', separatorHoverColor: 'rgba(200,169,106,0.12)', enableResize: false },
  },
  grid: { vertLines: { visible: false }, horzLines: { color: 'rgba(200,169,106,0.06)' } },
  rightPriceScale: { borderVisible: false, minimumWidth: 58 },
  timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
  crosshair: {
    mode: CrosshairMode.Normal,
    vertLine: { color: 'rgba(200,169,106,0.35)', labelBackgroundColor: '#2A2418' },
    horzLine: { color: 'rgba(200,169,106,0.35)', labelBackgroundColor: '#2A2418' },
  },
}

// Gesti del grafico.
// - Assi come su TradingView (opzioni della libreria): col mouse sempre attivi; col dito solo dopo aver toccato il grafico per attivarlo. Trascinare l'asse dei prezzi allunga o comprime
//   in verticale, l'asse del tempo in orizzontale, col mouse e col dito; doppio clic o doppio tocco torna alla scala automatica.
//   Il doppio clic/tocco sull'asse del tempo lo gestiamo noi (torna alle ultime 90 candele): quello della libreria
//   verrebbe applicato al fotogramma dopo e lo sovrascriverebbe.
//   Nota: la libreria tratta il trascinamento verticale del dito sull'asse dei prezzi come scorrimento della pagina
//   se vertTouchDrag è spento, e quello orizzontale sull'asse del tempo se horzTouchDrag è spento: per questo restano accesi.
// - Finché il grafico non è attivo il velo copre l'area delle candele (col dito anche gli assi): lì il dito e la rotella scorrono la pagina.
//   Rotella e pizzico funzionano solo con il grafico attivo.
const gestures = on => ({
  handleScroll: { mouseWheel: on, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
  handleScale: { mouseWheel: on, pinch: on, axisPressedMouseMove: { time: true, price: true }, axisDoubleClickReset: { time: false, price: true } }, // tempo: reset nostro (90 candele), vedi onDbl/onTouchEnd
})
const FINE_POINTER = () => typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches
const VISIBLE_BARS = 90 // candele visibili con la scala automatica del tempo
const DOUBLE_TAP = 320

// Un solo grafico con due riquadri: stessa scala del tempo e un solo mirino,
// quindi ogni candela sta esattamente sopra il suo valore di K e D.
// fill: occupa tutta l'altezza del contenitore (grafico a tutto schermo).
// alwaysActive: niente tocco per attivarlo, perché lì non c'è una pagina da scorrere.
export default function Chart({ bars, k, d, upper, lower, tall, ema = null, precision = null, fill = false, alwaysActive = false, allBars = false }) {
  const box = useRef(), host = useRef(), edge = useRef(), veil = useRef(), api = useRef({})
  const [touched, setActive] = useState(false)
  const active = alwaysActive || touched
  const [custom, setCustom] = useState({ price: false, time: false }) // scala cambiata dall'utente: compare "Auto"

  useEffect(() => {
    const chart = createChart(host.current, { ...options, ...gestures(false) })
    // EMA 200 aggiunta prima delle candele: resta dietro e non le copre
    const emaLine = chart.addSeries(LineSeries, {
      color: 'rgba(235,211,154,0.7)', lineWidth: 1, priceLineVisible: false, lastValueVisible: true,
      crosshairMarkerVisible: false, title: '',
      autoscaleInfoProvider: () => null, // la scala automatica segue solo le candele
    }, 0)
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: '#19E6D0', downColor: '#FF4F7B', borderVisible: false,
      wickUpColor: 'rgba(25,230,208,0.7)', wickDownColor: 'rgba(255,79,123,0.7)',
    }, 0)
    const fixed = () => ({ priceRange: { minValue: 0, maxValue: 100 } })
    const dLine = chart.addSeries(LineSeries, { color: '#EBD39A', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, autoscaleInfoProvider: fixed, crosshairMarkerVisible: false }, 1)
    const kLine = chart.addSeries(LineSeries, { color: '#19E6D0', lineWidth: 2, priceLineVisible: false, autoscaleInfoProvider: fixed }, 1)
    const a = (api.current = { chart, candles, emaLine, kLine, dLine, lines: [], fitted: false, n: 0, userAt: 0 })

    // Sul telefono il dito sull'asse dei prezzi non deve scorrere la pagina (touch-action: none);
    // sull'asse del tempo il gesto orizzontale è della scala, quello verticale resta della pagina (pan-y).
    const axisTouch = () => {
      const rows = [...(chart.chartElement().querySelector('table')?.rows || [])]
      rows.forEach((tr, i) => {
        const last = i === rows.length - 1
        const cells = [...tr.cells]
        if (last) cells.forEach(td => { td.style.touchAction = 'pan-y' })
        else if (cells.length > 1) cells[cells.length - 1].style.touchAction = 'none'
      })
    }
    axisTouch()

    // Scala automatica del tempo: le ultime VISIBLE_BARS candele
    // (settimanale: tutto lo storico, fino al 2017 per BTC; gli altri le ultime VISIBLE_BARS candele)
    a.fitTime = () => { if (a.n) chart.timeScale().setVisibleLogicalRange({ from: a.allBars ? 0 : a.n - VISIBLE_BARS, to: a.n + 2 }) }
    // La scala dei prezzi è "manuale" quando la libreria ha spento l'autoScale (asse trascinato)
    const priceCustom = () => [0, 1].some(i => chart.priceScale('right', i).options().autoScale === false)
    const sync = () => setCustom(c => {
      const price = priceCustom()
      return c.price === price ? c : { ...c, price }
    })
    // EMA fuori dall'area visibile (la scala segue solo le candele): resta la sua etichetta,
    // ferma in alto o in basso sull'asse dei prezzi, con il triangolo verso dove sta la linea.
    let raf = 0
    a.placeEdge = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        // Il velo copre solo l'area delle candele: gli assi restano liberi
        // Col mouse il velo copre solo l'area delle candele: gli assi restano sempre attivi.
        // Col dito copre tutto il grafico, assi compresi: finché non lo tocchi, il dito scorre la pagina.
        if (veil.current && FINE_POINTER()) {
          veil.current.style.right = `${6 + chart.priceScale('right', 0).width()}px`
          veil.current.style.bottom = `${chart.timeScale().height()}px`
        }
        const tag = edge.current
        if (!tag) return
        const v = a.emaLast
        const h = chart.panes()[0]?.getHeight() || 0
        const y = v == null ? null : emaLine.priceToCoordinate(v)
        const top = candles.coordinateToPrice(0)
        if (v == null || !h || (y != null && y >= 0 && y <= h) || top == null) { tag.hidden = true; return }
        const above = y != null ? y < 0 : v > top
        tag.hidden = false
        tag.textContent = `${above ? '▲' : '▼'} ${a.fmtEma ? a.fmtEma(v) : v}`
        tag.style.top = above ? '2px' : `${h - 20}px`
        tag.style.width = `${chart.priceScale('right', 0).width()}px`
        tag.title = `EMA 200 ${above ? 'sopra' : 'sotto'} l'area visibile`
      })
    }

    // Il tempo è cambiato dall'utente se l'intervallo si sposta durante un suo gesto
    // (non quando arriva una candela nuova o la card cambia misura).
    const onRange = () => { a.placeEdge(); if (Date.now() - a.userAt < 400) setCustom(c => (c.time ? c : { ...c, time: true })) }
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRange)
    chart.timeScale().subscribeSizeChange(a.placeEdge)
    const ro = new ResizeObserver(() => { axisTouch(); a.placeEdge() })
    ro.observe(host.current)

    const el = host.current
    const mark = () => { a.userAt = Date.now(); a.placeEdge() }
    const onDown = () => { a.down = true; mark() }
    const onMove = () => { if (a.down) mark() }
    const onUp = () => { if (!a.down) return; a.down = false; mark(); setTimeout(sync, 0) }
    // Doppio clic / doppio tocco sull'asse del tempo: torna alle ultime VISIBLE_BARS candele
    // (la libreria rimette la sua spaziatura; per l'asse dei prezzi basta la sua).
    const onTimeAxis = y => y > el.getBoundingClientRect().height - chart.timeScale().height()
    // Dopo che la libreria ha chiuso il suo gesto (lo applica al fotogramma successivo), altrimenti lo sovrascrive
    // (rimpicciolito al massimo la libreria corregge ancora dopo: per questo lo riapplico una seconda volta)
    const resetTimeAt = y => {
      if (!onTimeAxis(y)) return
      const fit = () => { a.fitTime(); setCustom(c => ({ ...c, time: false })) }
      setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(fit)), 30)
      setTimeout(fit, 220)
    }
    const onDbl = e => { resetTimeAt(e.clientY - el.getBoundingClientRect().top); setTimeout(sync, 0) }
    let lastTap = 0
    const onTouchEnd = e => {
      const t = e.changedTouches[0]
      if (Date.now() - lastTap < DOUBLE_TAP && t) resetTimeAt(t.clientY - el.getBoundingClientRect().top)
      lastTap = Date.now()
      setTimeout(sync, 0)
    }
    el.addEventListener('pointerdown', onDown, true)
    el.addEventListener('pointermove', onMove, true)
    window.addEventListener('pointerup', onUp, true)
    el.addEventListener('wheel', mark, { capture: true, passive: true })
    el.addEventListener('dblclick', onDbl, true)
    el.addEventListener('touchend', onTouchEnd, true)
    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange)
      chart.timeScale().unsubscribeSizeChange(a.placeEdge)
      ro.disconnect()
      cancelAnimationFrame(raf)
      el.removeEventListener('pointerdown', onDown, true)
      el.removeEventListener('pointermove', onMove, true)
      window.removeEventListener('pointerup', onUp, true)
      el.removeEventListener('wheel', mark, { capture: true })
      el.removeEventListener('dblclick', onDbl, true)
      el.removeEventListener('touchend', onTouchEnd, true)
      chart.remove()
      api.current = {}
    }
  }, [])

  // Bottone "Auto": scala automatica su prezzi (entrambi i riquadri) e tempo
  const resetScale = () => {
    const a = api.current
    if (!a.chart) return
    for (const i of [0, 1]) a.chart.priceScale('right', i).applyOptions({ autoScale: true })
    a.fitTime()
    a.placeEdge()
    setCustom({ price: false, time: false })
  }

  // Altezza dei riquadri
  useEffect(() => {
    const panes = api.current.chart?.panes()
    if (!panes || panes.length < 2) return
    const [a, b] = RATIO[tall ? 'tall' : 'normal']
    panes[0].setStretchFactor(a)
    panes[1].setStretchFactor(b)
  }, [tall])

  // Linee di ipercomprato e ipervenduto
  useEffect(() => {
    const a = api.current
    if (!a.kLine) return
    a.lines.forEach(l => a.kLine.removePriceLine(l))
    a.lines = [upper, lower].map(price => a.kLine.createPriceLine({
      price, color: 'rgba(200,169,106,0.55)', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: '',
    }))
  }, [upper, lower])

  // Dati: K e D usano gli stessi tempi delle candele (spazio vuoto dove il valore non c'è ancora)
  useEffect(() => {
    const a = api.current
    if (!a.candles || !bars?.length) return
    a.candles.setData(bars.map(b => ({ time: toTime(b.t), open: b.o, high: b.h, low: b.l, close: b.c })))
    const line = arr => bars.map((b, i) => (arr?.[i] == null ? { time: toTime(b.t) } : { time: toTime(b.t), value: arr[i] }))
    a.kLine.setData(line(k))
    a.dLine.setData(line(d))
    // EMA 200 dal server (stessi valori del semaforo); niente linea se lo storico non basta
    const hasEma = ema?.length === bars.length
    a.emaLine.setData(hasEma ? line(ema) : [])
    a.emaLast = hasEma ? ema[ema.length - 1] : null
    a.n = bars.length
    a.allBars = allBars
    if (!a.fitted) {
      a.fitTime()
      a.fitted = true
    }
    a.placeEdge()
  }, [bars, k, d, ema])

  // Decimali del prezzo (tick size del simbolo su Bitunix, o in base al prezzo)
  const last = bars?.length ? bars[bars.length - 1].c : null
  const dec = priceDecimals(last, precision)
  useEffect(() => {
    const a = api.current
    if (!a.candles) return
    const priceFormat = { type: 'price', precision: dec, minMove: Number((10 ** -dec).toFixed(dec)) }
    a.candles.applyOptions({ priceFormat })
    a.emaLine.applyOptions({ priceFormat })
    a.fmtEma = v => v.toFixed(dec)
    a.placeEdge()
  }, [dec])

  // Attivo / inattivo
  useEffect(() => {
    const a = api.current
    if (!a.chart) return
    a.chart.applyOptions(gestures(active))
    if (!active) { a.chart.clearCrosshairPosition(); return }
    if (alwaysActive) return

    const y0 = window.scrollY
    const outside = e => { if (!box.current?.contains(e.target)) setActive(false) }
    const scrolled = () => { if (Math.abs(window.scrollY - y0) > 40) setActive(false) }
    const esc = e => { if (e.key === 'Escape') setActive(false) }
    document.addEventListener('pointerdown', outside, true)
    window.addEventListener('scroll', scrolled, { passive: true })
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', outside, true)
      window.removeEventListener('scroll', scrolled)
      document.removeEventListener('keydown', esc)
    }
  }, [active, alwaysActive])

  return (
    <div ref={box} className={'chart' + (tall ? ' chart--tall' : '') + (fill ? ' chart--fill' : '') + (active && !alwaysActive ? ' is-active' : '')}>
      <div ref={host} className="chart__host" />
      <span ref={edge} className="chart__edge" hidden />
      {!active && (
        <button ref={el => { veil.current = el; if (el) api.current.placeEdge?.() }} type="button" className="chart__veil" onClick={() => setActive(true)} aria-label="Attiva il grafico per spostarlo e ingrandirlo" />
      )}
      {(custom.price || custom.time) && (
        <button type="button" className="chart__auto" onClick={resetScale} aria-label="Torna alla scala automatica">Auto</button>
      )}
    </div>
  )
}
