import { useEffect, useRef, useState } from 'react'
import { createChart, CandlestickSeries, LineSeries, CrosshairMode, LineStyle } from 'lightweight-charts'

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

// Gesti del grafico: spenti finché il grafico non viene attivato con un tocco o un clic.
const gestures = on => ({
  handleScroll: { mouseWheel: on, pressedMouseMove: on, horzTouchDrag: on, vertTouchDrag: false },
  handleScale: { mouseWheel: on, pinch: on, axisPressedMouseMove: on, axisDoubleClickReset: on },
})

// Un solo grafico con due riquadri: stessa scala del tempo e un solo mirino,
// quindi ogni candela sta esattamente sopra il suo valore di K e D.
export default function Chart({ bars, k, d, upper, lower, tall }) {
  const box = useRef(), host = useRef(), api = useRef({})
  const [active, setActive] = useState(false)

  useEffect(() => {
    const chart = createChart(host.current, { ...options, ...gestures(false) })
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: '#19E6D0', downColor: '#FF4F7B', borderVisible: false,
      wickUpColor: 'rgba(25,230,208,0.7)', wickDownColor: 'rgba(255,79,123,0.7)',
    }, 0)
    const fixed = () => ({ priceRange: { minValue: 0, maxValue: 100 } })
    const dLine = chart.addSeries(LineSeries, { color: '#EBD39A', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, autoscaleInfoProvider: fixed, crosshairMarkerVisible: false }, 1)
    const kLine = chart.addSeries(LineSeries, { color: '#19E6D0', lineWidth: 2, priceLineVisible: false, autoscaleInfoProvider: fixed }, 1)
    api.current = { chart, candles, kLine, dLine, lines: [], fitted: false }
    return () => { chart.remove(); api.current = {} }
  }, [])

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
    if (!a.fitted) {
      const n = bars.length
      a.chart.timeScale().setVisibleLogicalRange({ from: n - 90, to: n + 2 })
      a.fitted = true
    }
  }, [bars, k, d])

  // Attivo / inattivo
  useEffect(() => {
    const a = api.current
    if (!a.chart) return
    a.chart.applyOptions(gestures(active))
    if (!active) { a.chart.clearCrosshairPosition(); return }

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
  }, [active])

  return (
    <div ref={box} className={'chart' + (tall ? ' chart--tall' : '') + (active ? ' is-active' : '')}>
      <div ref={host} className="chart__host" />
      {!active && (
        <button type="button" className="chart__veil" onClick={() => setActive(true)} aria-label="Attiva il grafico per spostarlo e ingrandirlo" />
      )}
    </div>
  )
}
