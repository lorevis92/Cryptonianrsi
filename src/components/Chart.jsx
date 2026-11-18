import { useEffect, useRef } from 'react'
import { createChart, CrosshairMode, LineStyle } from 'lightweight-charts'

const TZ = -new Date().getTimezoneOffset() * 60
const toTime = t => Math.floor(t / 1000) + TZ

const base = {
  autoSize: true,
  layout: { background: { type: 'solid', color: 'transparent' }, textColor: '#6E7380', fontFamily: 'Instrument Sans, sans-serif', fontSize: 11, attributionLogo: false },
  grid: { vertLines: { visible: false }, horzLines: { color: 'rgba(200,169,106,0.06)' } },
  rightPriceScale: { borderVisible: false, minimumWidth: 58 },
  crosshair: { mode: CrosshairMode.Normal, vertLine: { color: 'rgba(200,169,106,0.35)', labelBackgroundColor: '#2A2418' }, horzLine: { color: 'rgba(200,169,106,0.35)', labelBackgroundColor: '#2A2418' } },
}

// Candele sopra, Stochastic RSI sotto, con lo scorrimento sincronizzato.
export default function Chart({ bars, k, d, upper, lower, tall }) {
  const top = useRef(), bottom = useRef(), api = useRef({})

  useEffect(() => {
    const c1 = createChart(top.current, { ...base, timeScale: { visible: false, borderVisible: false } })
    const c2 = createChart(bottom.current, { ...base, timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false } })
    const candles = c1.addCandlestickSeries({
      upColor: '#19E6D0', downColor: '#FF4F7B', borderVisible: false,
      wickUpColor: 'rgba(25,230,208,0.7)', wickDownColor: 'rgba(255,79,123,0.7)',
    })
    const fixed = () => ({ priceRange: { minValue: 0, maxValue: 100 } })
    const dLine = c2.addLineSeries({ color: '#EBD39A', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, autoscaleInfoProvider: fixed, crosshairMarkerVisible: false })
    const kLine = c2.addLineSeries({ color: '#19E6D0', lineWidth: 2, priceLineVisible: false, autoscaleInfoProvider: fixed })

    let syncing = false
    const link = (a, b) => a.timeScale().subscribeVisibleLogicalRangeChange(r => {
      if (syncing || !r) return
      syncing = true; b.timeScale().setVisibleLogicalRange(r); syncing = false
    })
    link(c1, c2); link(c2, c1)

    api.current = { c1, c2, candles, kLine, dLine, lines: [], fitted: false }
    return () => { c1.remove(); c2.remove() }
  }, [])

  useEffect(() => {
    const a = api.current
    if (!a.kLine) return
    a.lines.forEach(l => a.kLine.removePriceLine(l))
    a.lines = [upper, lower].map(price => a.kLine.createPriceLine({
      price, color: 'rgba(200,169,106,0.55)', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: '',
    }))
  }, [upper, lower])

  useEffect(() => {
    const a = api.current
    if (!a.candles || !bars?.length) return
    a.candles.setData(bars.map(b => ({ time: toTime(b.t), open: b.o, high: b.h, low: b.l, close: b.c })))
    const line = arr => bars.map((b, i) => (arr[i] == null ? null : { time: toTime(b.t), value: arr[i] })).filter(Boolean)
    a.kLine.setData(line(k))
    a.dLine.setData(line(d))
    if (!a.fitted) {
      const n = bars.length
      a.c2.timeScale().setVisibleLogicalRange({ from: n - 90, to: n + 2 })
      a.fitted = true
    }
  }, [bars, k, d])

  return (
    <div className={'chart' + (tall ? ' chart--tall' : '')}>
      <div ref={top} className="chart__price" />
      <div ref={bottom} className="chart__osc" />
    </div>
  )
}
