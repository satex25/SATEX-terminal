/**
 * SATEX — Chart Panel (Lightweight Charts v5 candle chart)
 * Renders OHLCV candles, live price line, indicator overlays.
 * Header uses the reference's .chart-toolbar / .chart-shell class library.
 */
import { useEffect, useRef, useState } from 'react'
import { useMarketStore, selectCandles } from '../stores/marketStore'
import { useAccountStore } from '../stores/accountStore'
import { findUniverseEntry } from '@shared/constants'
import { fmt } from '../lib/format'

const TIMEFRAMES = ['1m', '5m', '15m', '1H', '4H', '1D'] as const
const TYPES      = ['Candles', 'Line', 'Area'] as const

export function ChartPanel() {
  const symbol   = useMarketStore(s => s.symbol)
  const quote    = useMarketStore(s => s.quotes.get(symbol))
  const candles  = useMarketStore(selectCandles(symbol))
  const indicators = useAccountStore(s => s.indicators.get(symbol))
  const entry    = findUniverseEntry(symbol)
  const dp       = entry?.dp ?? 2

  const [tf,   setTf]   = useState<typeof TIMEFRAMES[number]>('5m')
  const [type, setType] = useState<typeof TYPES[number]>('Candles')

  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef     = useRef<unknown>(null)
  const seriesRef    = useRef<unknown>(null)
  const ema9Ref      = useRef<unknown>(null)
  const ema21Ref     = useRef<unknown>(null)

  // Init chart once per mount
  useEffect(() => {
    if (!containerRef.current) return
    let cancelled = false

    void (async () => {
      try {
        const { createChart, CrosshairMode, CandlestickSeries, LineSeries } = await import('lightweight-charts')
        if (cancelled || !containerRef.current) return

        const chart = createChart(containerRef.current, {
          width:  containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
          layout: {
            background: { color: 'transparent' },
            textColor:  'rgba(232,230,224,0.62)',
            fontFamily: "'Iosevka', 'JetBrains Mono', ui-monospace, monospace",
            fontSize:   10,
          },
          grid: {
            vertLines: { color: 'rgba(35,33,40,0.6)', style: 1 },
            horzLines: { color: 'rgba(35,33,40,0.6)', style: 1 },
          },
          crosshair: { mode: CrosshairMode.Normal },
          rightPriceScale: {
            borderColor: 'rgba(47,44,52,0.85)',
            scaleMargins: { top: 0.08, bottom: 0.08 },
          },
          timeScale: {
            borderColor: 'rgba(47,44,52,0.85)',
            timeVisible:    true,
            secondsVisible: false,
          },
          handleScroll: true,
          handleScale:  true,
        })

        const series = chart.addSeries(CandlestickSeries, {
          upColor:          '#22c55e', downColor:       '#ef4444',
          borderUpColor:    '#22c55e', borderDownColor: '#ef4444',
          wickUpColor:      '#4ade80', wickDownColor:   '#f87171',
          priceLineVisible: true,
          lastValueVisible: true,
        })

        const ema9 = chart.addSeries(LineSeries, {
          color: 'rgba(233,75,60,0.9)', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, title: 'EMA9',
        })
        const ema21 = chart.addSeries(LineSeries, {
          color: 'rgba(245,158,11,0.85)', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, title: 'EMA21',
        })

        chartRef.current  = chart
        seriesRef.current = series
        ema9Ref.current   = ema9
        ema21Ref.current  = ema21

        const ro = new ResizeObserver(() => {
          if (!containerRef.current) return
          (chart as { resize: (w: number, h: number) => void })
            .resize(containerRef.current.clientWidth, containerRef.current.clientHeight)
        })
        ro.observe(containerRef.current)
      } catch (e) {
        console.error('[chart] lightweight-charts init failed:', e)
      }
    })()

    return () => {
      cancelled = true
      if (chartRef.current) {
        try { (chartRef.current as { remove: () => void }).remove() } catch { /* ignore */ }
        chartRef.current = null; seriesRef.current = null
        ema9Ref.current  = null; ema21Ref.current = null
      }
    }
  }, [])

  // Bulk reset candles when symbol or array length changes
  useEffect(() => {
    if (!seriesRef.current || candles.length === 0) return
    try {
      const s = seriesRef.current as { setData: (d: unknown) => void }
      s.setData(candles.map(c => ({
        time: c.time as unknown,
        open: c.open, high: c.high, low: c.low, close: c.close,
      })))
    } catch { /* stale ref */ }
  }, [symbol, candles.length])

  // Live update — in-flight candle
  useEffect(() => {
    if (!seriesRef.current || candles.length === 0) return
    try {
      const last = candles[candles.length - 1]!
      const s = seriesRef.current as { update: (d: unknown) => void }
      s.update({ time: last.time as unknown, open: last.open, high: last.high, low: last.low, close: last.close })
    } catch { /* ignore */ }
  }, [quote?.last])

  const up = (quote?.changePct ?? 0) >= 0

  const hi = candles.length ? Math.max(...candles.map(c => c.high)) : undefined
  const lo = candles.length ? Math.min(...candles.map(c => c.low))  : undefined
  const vol = candles.reduce((a, c) => a + c.volume, 0)

  return (
    <div className="chart-shell">
      <div className="chart-toolbar">
        <div className="chart-symbol">
          <span className="sym">{symbol}</span>
          {entry && <span className="name">{entry.name}</span>}
        </div>
        {quote && (
          <div className="chart-price">
            <span className="price">{fmt.px(quote.last, dp)}</span>
            <span className={`delta ${up ? 'delta-up' : 'delta-dn'}`}>
              {fmt.signed(quote.change, dp)} ({fmt.pct(quote.changePct)})
            </span>
          </div>
        )}
        <div className="chart-stats">
          <div className="chart-stat"><div className="lbl">H</div><div className="val delta-up">{fmt.px(hi, dp)}</div></div>
          <div className="chart-stat"><div className="lbl">L</div><div className="val delta-dn">{fmt.px(lo, dp)}</div></div>
          <div className="chart-stat"><div className="lbl">V</div><div className="val">{fmt.k(vol)}</div></div>
          {indicators && (
            <>
              <div className="chart-stat">
                <div className="lbl">RSI</div>
                <div className="val" style={{
                  color: indicators.rsi14 > 70 ? 'var(--bear-glow)'
                       : indicators.rsi14 < 30 ? 'var(--bull-glow)'
                       : 'var(--ink-0)'
                }}>{indicators.rsi14.toFixed(1)}</div>
              </div>
              <div className="chart-stat">
                <div className="lbl">ATR</div>
                <div className="val" style={{ color: 'var(--warn-glow)' }}>{indicators.atr14.toFixed(2)}</div>
              </div>
            </>
          )}
        </div>
        <div className="chart-tools">
          <div className="seg accent">
            {TIMEFRAMES.map(t => (
              <button key={t} type="button" className={tf === t ? 'on' : ''} onClick={() => setTf(t)}>{t}</button>
            ))}
          </div>
          <div className="seg">
            {TYPES.map(t => (
              <button key={t} type="button" className={type === t ? 'on' : ''} onClick={() => setType(t)}>{t}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="chart-canvas-wrap">
        <div ref={containerRef} className="chart-canvas" />
        <div className="chart-watermark">SATEX</div>
        <div className="chart-overlay">
          <div className="row"><span className="swatch" style={{ background: 'rgba(233,75,60,0.9)' }} />EMA 9</div>
          <div className="row"><span className="swatch" style={{ background: 'rgba(245,158,11,0.85)' }} />EMA 21</div>
        </div>
        {quote && (
          <div className="chart-readout">
            <span><i>BID</i><b>{fmt.px(quote.bid, dp)}</b></span>
            <span><i>ASK</i><b>{fmt.px(quote.ask, dp)}</b></span>
            <span><i>VWAP</i><b>{fmt.px(quote.vwap, dp)}</b></span>
          </div>
        )}
      </div>
    </div>
  )
}
