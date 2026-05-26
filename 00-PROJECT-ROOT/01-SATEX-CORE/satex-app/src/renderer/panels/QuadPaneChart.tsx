/**
 * SATEX — Quad pane chart (2026-05-25).
 *
 * One isolated lightweight-charts candlestick pane for a single symbol, with
 * EMA/VWAP overlays, an H/L/VOL/RSI header, independent pan/zoom navigation
 * (native drag + wheel — each pane on its own timeline), theme-reactive candles
 * (matches the single ChartPanel via the shared candlestickColors mapper), and
 * a clean "awaiting data" empty state — NEVER a fabricated seed price.
 *
 * Data isolation: the pane's only source is its own symbol's candle array
 * (`selectCandles(symbol)`), so no cross-symbol bleed. Keyed by symbol in the
 * parent, so a swap remounts a fresh chart.
 */
import { useEffect, useMemo, useRef } from 'react'
import { useMarketStore, selectCandles } from '../stores/marketStore'
import { useChartOpts } from '../hooks/useChartOpts'
import { useThemeStore } from '../stores/themeStore'
import { candlestickColors } from '../lib/quad-chart-theme'
import { applyOpacity } from '../lib/color'
import { emaSeries, vwapSeries } from '../lib/chart-series'
import { rsi } from '@shared/indicators'
import { findUniverseEntry } from '@shared/constants'
import { planLastSessionBackfill } from '../lib/chart-backfill'
import { isUsEquityMarketOpen, mostRecentClosedSessionDate } from '@shared/market-hours'

const readCssVar = (name: string): string =>
  typeof document !== 'undefined'
    ? getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    : ''

function exchangeFor(symbol: string): string {
  if (symbol === 'NVDA' || symbol === 'AAPL' || symbol === 'MSFT') return 'NASDAQ'
  if (symbol === 'SPY' || symbol === 'IWM') return 'NYSE'
  if (symbol === 'ES' || symbol === 'NQ' || symbol === 'GC' || symbol === 'CL') return 'CME'
  if (symbol === 'BTC' || symbol === 'ETH' || symbol === 'SOL') return 'CBSE'
  return 'EQTY'
}

/** Period-keyed EMA color from the active theme tokens (full opacity, distinct
 *  per period — same model emaColorForPeriod uses for Mono/Bluyel). */
const emaTokenColor = (period: number): string =>
  (period <= 9 ? readCssVar('--bb-ema9') : readCssVar('--bb-ema21')) ||
  (period <= 9 ? '#f5c46a' : '#b48cff')

interface QuadPaneChartProps {
  symbol: string
  /** EMA periods to plot — already sorted + capped by the parent. */
  emaPeriods: readonly number[]
}

export function QuadPaneChart({ symbol, emaPeriods }: QuadPaneChartProps) {
  const candles   = useMarketStore(selectCandles(symbol))
  const quoteLast = useMarketStore(s => s.quotes.get(symbol)?.last)
  const theme     = useThemeStore(s => s.theme)
  const [opts]    = useChartOpts()

  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef  = useRef<unknown>(null)
  const candleRef = useRef<unknown>(null)
  const emaMapRef = useRef<Map<number, unknown>>(new Map())
  const vwapRef   = useRef<unknown>(null)
  const lwcRef    = useRef<unknown>(null)
  const fittedRef = useRef(false)

  const entry  = findUniverseEntry(symbol)
  const dp     = entry?.dp ?? 2
  const hasData = candles.length > 0

  // Header stats — memoized so a 30k-bar series isn't reduced every render.
  // Reduce loop (not Math.max(...spread)) to avoid stack overflow on big arrays.
  const closes = useMemo(() => candles.map(c => c.close), [candles])
  const rsi14  = useMemo(() => (closes.length ? rsi(closes, 14) : 50), [closes])
  const stats  = useMemo(() => {
    let h = -Infinity, l = Infinity, v = 0
    for (const c of candles) { if (c.high > h) h = c.high; if (c.low < l) l = c.low; v += c.volume }
    return { hi: candles.length ? h : 0, lo: candles.length ? l : 0, vol: v }
  }, [candles])
  const last  = hasData ? candles[candles.length - 1]! : null
  const first = hasData ? candles[0]! : null
  const chg   = last && first ? last.close - first.close : 0
  const pct   = first && first.close !== 0 ? (chg / first.close) * 100 : 0

  // ── create chart (once per mount; symbol is fixed via parent key) ───────────
  useEffect(() => {
    let cancelled = false
    let ro: ResizeObserver | null = null
    const emaMapAtMount = emaMapRef.current
    void (async () => {
      try {
        const lwc = await import('lightweight-charts')
        const { createChart, CrosshairMode, CandlestickSeries } = lwc
        if (cancelled || !containerRef.current) return
        const chart = createChart(containerRef.current, {
          width:  containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
          layout: {
            background: { color: 'transparent' },
            textColor:  'rgba(232,230,224,0.55)',
            fontFamily: "'Iosevka', 'JetBrains Mono', ui-monospace, monospace",
            fontSize:   9,
          },
          grid: opts.chartGrid === 'off'
            ? { vertLines: { visible: false }, horzLines: { visible: false } }
            : { vertLines: { color: 'rgba(35,33,40,0.5)', style: 1 }, horzLines: { color: 'rgba(35,33,40,0.5)', style: 1 } },
          crosshair: { mode: CrosshairMode.Normal },
          rightPriceScale: { borderColor: 'rgba(47,44,52,0.7)', scaleMargins: { top: 0.12, bottom: 0.12 } },
          timeScale: { borderColor: 'rgba(47,44,52,0.7)', timeVisible: true, secondsVisible: true, rightOffset: 4, barSpacing: 6 },
          handleScroll: true,   // independent per-pane drag-pan
          handleScale:  true,   // independent per-pane wheel/pinch zoom
        })
        const series = chart.addSeries(CandlestickSeries, {
          ...candlestickColors(readCssVar),
          priceLineVisible: true,
          lastValueVisible: true,
        })
        chartRef.current  = chart
        candleRef.current = series
        lwcRef.current    = lwc
        ro = new ResizeObserver(() => {
          if (!containerRef.current) return
          ;(chart as { resize: (w: number, h: number) => void })
            .resize(containerRef.current.clientWidth, containerRef.current.clientHeight)
        })
        ro.observe(containerRef.current)
      } catch (e) {
        console.error('[quad-pane] lightweight-charts init failed:', e)
      }
    })()
    return () => {
      cancelled = true
      ro?.disconnect()  // stop observing before dispose — was leaked (lived only in the init closure)
      if (chartRef.current) {
        try { (chartRef.current as { remove: () => void }).remove() } catch { /* ignore */ }
      }
      chartRef.current  = null
      candleRef.current = null
      vwapRef.current   = null
      lwcRef.current    = null
      emaMapAtMount.clear()
      fittedRef.current = false
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── bulk setData on bar-count change; fitContent once on first data ─────────
  useEffect(() => {
    const s = candleRef.current as { setData: (d: unknown) => void } | null
    if (!s || candles.length === 0) return
    try {
      s.setData(candles.map(c => ({ time: c.time as unknown, open: c.open, high: c.high, low: c.low, close: c.close })))
      if (!fittedRef.current && chartRef.current) {
        ;(chartRef.current as { timeScale: () => { fitContent: () => void } }).timeScale().fitContent()
        fittedRef.current = true
      }
    } catch { /* stale ref between mount and first paint */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles.length])

  // ── in-flight ratchet — paint the live price onto the last bar ──────────────
  useEffect(() => {
    const s = candleRef.current as { update: (d: unknown) => void } | null
    if (!s || candles.length === 0 || quoteLast == null) return
    try {
      const bar = candles[candles.length - 1]!
      s.update({ time: bar.time as unknown, open: bar.open, high: Math.max(bar.high, quoteLast), low: Math.min(bar.low, quoteLast), close: quoteLast })
    } catch { /* ignore */ }
  }, [quoteLast, candles])

  // ── theme-reactive candle colors ────────────────────────────────────────────
  useEffect(() => {
    const s = candleRef.current as { applyOptions: (o: unknown) => void } | null
    if (!s) return
    try { s.applyOptions(candlestickColors(readCssVar)) } catch { /* ignore */ }
  }, [theme])

  // ── EMA overlays — add/remove/refresh line series to match the period set ───
  useEffect(() => {
    const chart = chartRef.current as { addSeries: (t: unknown, o: unknown) => unknown; removeSeries: (s: unknown) => void } | null
    const lwc = lwcRef.current as { LineSeries: unknown } | null
    if (!chart || !lwc) return
    const map = emaMapRef.current
    const periods = (opts.showEMA9 || opts.showEMA21) ? emaPeriods : []
    for (const [p, s] of map) {
      if (!periods.includes(p)) { try { chart.removeSeries(s) } catch { /* ignore */ } map.delete(p) }
    }
    if (candles.length === 0) return
    for (const p of periods) {
      let s = map.get(p) as { setData: (d: unknown) => void; applyOptions: (o: unknown) => void } | undefined
      if (!s) {
        s = chart.addSeries(lwc.LineSeries, { color: emaTokenColor(p), lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }) as typeof s
        map.set(p, s!)
      } else {
        s.applyOptions({ color: emaTokenColor(p) })
      }
      const series = emaSeries(closes, p)
      s!.setData(series.map((v, i) => ({ time: candles[i]!.time as unknown, value: v })))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles.length, emaPeriods, opts.showEMA9, opts.showEMA21, theme])

  // ── VWAP overlay ────────────────────────────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current as { addSeries: (t: unknown, o: unknown) => unknown; removeSeries: (s: unknown) => void } | null
    const lwc = lwcRef.current as { LineSeries: unknown } | null
    if (!chart || !lwc) return
    if (!opts.showVWAP || candles.length === 0) {
      if (vwapRef.current) { try { chart.removeSeries(vwapRef.current) } catch { /* ignore */ } vwapRef.current = null }
      return
    }
    const accent = readCssVar('--bb-accent') || '#00c8ff'
    let s = vwapRef.current as { setData: (d: unknown) => void; applyOptions: (o: unknown) => void } | null
    if (!s) {
      s = chart.addSeries(lwc.LineSeries, { color: applyOpacity(accent, 0.5), lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }) as typeof s
      vwapRef.current = s
    } else {
      s.applyOptions({ color: applyOpacity(accent, 0.5) })
    }
    const series = vwapSeries(candles)
    s!.setData(series.map((v, i) => ({ time: candles[i]!.time as unknown, value: v })))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles.length, opts.showVWAP, theme])

  // ── Off-hours backfill — fill an empty pane with real bars from Alpaca:
  //    equity/index → the last completed NY session (1Min, RTH window);
  //    crypto      → the rolling last 24h (24/7 markets have no "session").
  //    Futures fall back to the live stream / "awaiting data" (no Alpaca feed).
  //    Replay-free via getHistoricalBars; main dispatches per asset class.
  //    One attempt per mount, applied only if the pane is STILL empty when
  //    bars arrive so a concurrent live tick / engine reseed is never
  //    clobbered. Quad is hidden while a replay is active, so inReplay is
  //    always false here.
  const backfilledRef = useRef(false)
  useEffect(() => {
    if (backfilledRef.current || candles.length > 0) return
    backfilledRef.current = true
    let cancelled = false
    void (async () => {
      try {
        const result = await planLastSessionBackfill({
          symbol,
          assetClass: entry?.assetClass,
          inReplay: false,
          isMarketOpen: isUsEquityMarketOpen,
          mostRecentClosedSessionDate,
          getCredentialsMasked: async () => window.satex?.getCredentialsMasked(),
          fetchBars: async (req) => (await window.satex?.getHistoricalBars(req)) ?? { ok: false },
        })
        if (cancelled || result.action !== 'backfilled') return
        if ((useMarketStore.getState().candles.get(symbol)?.length ?? 0) === 0) {
          useMarketStore.getState().bulkReplaceCandles(symbol, result.bars)
        }
      } catch (e) {
        // Defense-in-depth: the planner's internal awaits (getCredentialsMasked,
        // fetchBars) catch Alpaca-side failures and return ok:false, so this
        // path typically never fires. Only an unrelated rejection (main process
        // unresponsive, preload bridge missing) would land here. Pane stays in
        // the empty state — never crash the renderer. Mirrors ChartPanel's
        // surrounding try/catch in its auto-backfill effect.
        console.warn('[quad-pane] auto-backfill failed:', e)
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="bb-quad-pane">
      <div className="bb-quad-pane-head">
        <span className="bb-qp-sym">{symbol}</span>
        <span className="bb-qp-exch">{exchangeFor(symbol)} · 1s</span>
        <span className="bb-qp-stats">
          <b>H</b> {hasData ? stats.hi.toFixed(dp) : '—'}
          <b> L</b> {hasData ? stats.lo.toFixed(dp) : '—'}
          <b> VOL</b> {(stats.vol / 1e6).toFixed(1)}M
          <b> RSI</b> <span className={rsi14 > 70 ? 'neg' : rsi14 < 30 ? 'pos' : ''}>{rsi14.toFixed(0)}</span>
        </span>
        <span className="bb-qp-spacer" />
        {last && (
          <span className={`bb-qp-last ${chg >= 0 ? 'pos' : 'neg'}`}>
            {last.close.toFixed(dp)} <span className="bb-qp-chg">{chg >= 0 ? '+' : ''}{chg.toFixed(dp)} · {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%</span>
          </span>
        )}
      </div>
      <div className="bb-quad-pane-canvas" ref={containerRef}>
        {!hasData && <div className="bb-quad-pane-empty">— awaiting {symbol} data —</div>}
      </div>
    </div>
  )
}
