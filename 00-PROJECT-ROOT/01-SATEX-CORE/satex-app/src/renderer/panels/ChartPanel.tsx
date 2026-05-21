/**
 * SATEX — Chart Panel (Lightweight Charts v5 candle chart)
 * Renders OHLCV candles, live price line, indicator overlays.
 * Server emits 1-second base candles; client aggregates to user's selected timeframe.
 *
 * Phase 11 — chart-indicator integration. The 6 indicators (EMA / RSI /
 * Double Top / Double Bottom / Fibonacci / Pivot Points) are driven by
 * useIndicatorStore. Compute lives in shared/chart-indicators (pure,
 * tested). EMA color is conditioned on dominant HMM regime, matching the
 * spec mapping: COMPRESSION=green, EXPANSION=cyan ("TREND"), MEAN-REVERT=
 * orange, CAPITULATION=red ("PANIC").
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMarketStore, selectCandles } from '../stores/marketStore'
import { useAccountStore } from '../stores/accountStore'
import { useIndicatorStore } from '../stores/indicatorStore'
import { useRegimeStore } from '../stores/regimeStore'
import { useDepthStore } from '../stores/depthStore'
import { useFeedStore } from '../stores/feedStore'
import { isSyntheticFeed, SIM_BADGE_TOOLTIP } from '../lib/feed-status'
import { emaColorForPeriod } from '../lib/ema-theme'
import { DeltaStrip } from '../components/DeltaStrip'
import {
  emaSeries as computeEmaSeries,
  rsiSeries as computeRsiSeries,
  detectDoubleTops,
  detectDoubleBottoms,
  computeFibonacci,
  FIB_RATIOS,
  type Candle as IndCandle,
} from '@shared/chart-indicators'
import {
  findUniverseEntry, CHART_TIMEFRAMES, CHART_TIMEFRAME_SECONDS, CHART_TIMEFRAME_MS,
  HISTORICAL_BARS_FALLBACK_SYMBOLS, UNIVERSE, isSubsecondTimeframe,
  type ChartTimeframe,
} from '@shared/constants'
import type { Candle, ReplayStatus, SubSecondCandle } from '@shared/types'
import { useSubsecondStore } from '../stores/subsecondStore'
import { useThemeStore } from '../stores/themeStore'
import {
  isUsEquityMarketOpen,
  mostRecentClosedSessionDate,
  mostRecentFridayDate,
  previousTradingDate,
} from '@shared/market-hours'
import { fmt } from '../lib/format'

// ── Historical-day picker helpers ────────────────────────────────────────────

/** YYYY-MM-DD in local time — what <input type="date"> expects. */
function isoDateLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function todayIsoLocal(): string { return isoDateLocal(new Date()) }

/** Most recent weekday, in local time. Default chart date — Alpaca has bars. */
function defaultHistoricalDate(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1)
  return isoDateLocal(d)
}

/** Symbols eligible for the historical-bars endpoint (equity + index ETFs). */
const HISTORICAL_ELIGIBLE = new Set(
  UNIVERSE.filter(u => u.assetClass === 'equity' || u.assetClass === 'index').map(u => u.symbol)
)

/** Pull YYYY-MM-DD out of a `hist_YYYY-MM-DD_<tf>_<hash>` session id. */
function dateFromHistSessionId(id: string | null | undefined): string | null {
  if (!id || !id.startsWith('hist_')) return null
  const m = /^hist_(\d{4}-\d{2}-\d{2})_/.exec(id)
  return m?.[1] ?? null
}

// ── Indicator-overlay helpers ─────────────────────────────────────────────────


/** Fibonacci level palette — gold/silver/bronze trio per spec, with the
 *  two outer levels rendered in neutral grey so the eye lands on 61.8 / 50 / 38.2. */
const FIB_COLORS: Record<number, string> = {
  0.236: 'rgba(160,160,168,0.55)',
  0.382: '#cd7f32', // bronze
  0.500: '#c0c0c0', // silver
  0.618: '#c9a04a', // gold (matches --bb-gold)
  0.786: 'rgba(160,160,168,0.55)',
}

/** Convert a hex color to rgba(...) with the given alpha. Returns the input
 *  unchanged for non-hex strings (so an `rgba(...)` color can pass through). */
function applyOpacity(color: string, alpha: number): string {
  if (!color.startsWith('#')) return color
  const h = color.length === 4
    ? color.slice(1).split('').map(c => c + c).join('')
    : color.slice(1)
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha.toFixed(2)})`
}

/**
 * Reads a CSS custom property from the live document root. Required for
 * passing theme tokens into Lightweight Charts canvas rendering — canvas
 * elements don't inherit CSS variables; they must be read explicitly. The
 * `data-theme` attribute on <html> is set by App.tsx's theme effect before
 * the first chart paint, so the value is always current-theme-correct.
 */
function readCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}


function aggregate(candles: readonly Candle[], bucketSec: number): Candle[] {
  if (bucketSec <= 1 || candles.length === 0) return candles.slice()
  const out: Candle[] = []
  let cur: Candle | null = null
  let curStart = 0
  for (const c of candles) {
    const bucket = Math.floor(c.time / bucketSec) * bucketSec
    if (!cur || bucket !== curStart) {
      if (cur) out.push(cur)
      cur = { time: bucket, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume }
      curStart = bucket
    } else {
      cur.high = Math.max(cur.high, c.high)
      cur.low  = Math.min(cur.low, c.low)
      cur.close = c.close
      cur.volume += c.volume
    }
  }
  if (cur) out.push(cur)
  return out
}

export function ChartPanel() {
  const symbol   = useMarketStore(s => s.symbol)
  const quote    = useMarketStore(s => s.quotes.get(symbol))
  const candles  = useMarketStore(selectCandles(symbol))
  const indicators = useAccountStore(s => s.indicators.get(symbol))
  const indSettings = useIndicatorStore(s => s.settings)
  const regimeSnap  = useRegimeStore(s => s.snapshot)
  // C13 / F2 — VPIN-driven flow-toxicity overlay. Subscribe to the depth
  // snapshot for the focused symbol (depth-feed.ts publishes one snapshot at
  // a time tied to subscribeDepth(symbol)). The overlay only renders when
  // vpin crosses the threshold so the chart isn't constantly tinted.
  const depthSnap   = useDepthStore(s => s.snapshot)
  const vpinValue   = depthSnap && depthSnap.symbol === symbol ? depthSnap.vpin : null
  // v0.4.3 SIM-badge propagation — chart header tells the same SIM-vs-LIVE
  // story as the WatchlistPanel row. isSyntheticFeed() is the canonical
  // per-asset-class decision (futures→futures feed, crypto→crypto, equity/index→equity).
  const feed        = useFeedStore(s => s.status)
  const isSynthetic = isSyntheticFeed(symbol, feed)
  // VPIN threshold. 0.85 (was 0.8) — the simulator's depth EMA can drift
  // into the 0.8-0.85 range during sustained book imbalance without
  // representing real toxic flow, so the higher floor cuts false positives
  // in dev/sim mode while still firing for genuine ≥0.85 signal on live
  // feeds where the proxy maps more directly to informed-trade probability.
  const VPIN_THRESHOLD = 0.85
  const vpinHot     = vpinValue !== null && vpinValue >= VPIN_THRESHOLD
  const entry    = findUniverseEntry(symbol)
  const dp       = entry?.dp ?? 2

  // Dominant HMM state drives EMA color when "ema" is enabled. Falls back to
  // neutral when no regime snapshot has arrived yet (engine cold-start) or
  // when the HMM is degenerate. Recomputed only when the snapshot changes.
  const dominantRegime = useMemo(() => {
    const arr = regimeSnap?.hmm
    if (!arr || arr.length === 0) return null
    let best = arr[0]!
    for (let i = 1; i < arr.length; i++) if (arr[i]!.p > best.p) best = arr[i]!
    return best.name
  }, [regimeSnap])
  // v0.6 Phase 3 — theme drives EMA color in alt themes (Mono/Bluyel).
  // Classic still uses regime via emaColorForPeriod's branch.
  const theme = useThemeStore(s => s.theme)

  // Prior-day H/L/C powers Pivot Points. Refetched on symbol change AND on
  // pivot-points enable so toggling without changing symbols still works.
  const [priorHlc, setPriorHlc] = useState<{ high: number; low: number; close: number; date: string } | null>(null)

  // Insufficient-data notes — collected during indicator reconciliation and
  // surfaced via the .chart-ind-warn watermark. Per-indicator granularity.
  const [warnings, setWarnings] = useState<string[]>([])

  const [tf, setTf] = useState<ChartTimeframe>('5s')
  const bucketSec = CHART_TIMEFRAME_SECONDS[tf]
  // A1 (v0.4.4) — sub-second mode is crypto-only. `showSub` gates every
  // sub-second-specific branch: hydration fetch, view builder, in-flight
  // disable. If the user picks 250ms then swaps to a non-crypto symbol the
  // auto-fallback effect below resets tf to '1s' so the chart never sits in
  // an invalid state.
  const isCryptoSymbol = entry?.assetClass === 'crypto'
  const showSub = isSubsecondTimeframe(tf) && isCryptoSymbol
  const subBucketMs = (CHART_TIMEFRAME_MS[tf] ?? 0) as 250 | 500
  // Subscribe to the per-(symbol, bucketMs) ring; selector returns the same
  // array reference until appendBar mutates the slot so the view useMemo
  // below doesn't churn on unrelated symbols.
  const subBars = useSubsecondStore(s =>
    showSub ? (s.series.get(`${symbol}:${subBucketMs}`) ?? null) : null
  )

  // Auto-fallback when the focused symbol becomes non-crypto with a
  // sub-second timeframe selected — keeps the chart in a coherent mode.
  useEffect(() => {
    if (isSubsecondTimeframe(tf) && !isCryptoSymbol) setTf('1s')
  }, [tf, isCryptoSymbol])

  // A1 Sprint 2 — auto-snap to the user's preferred bucket when a crypto
  // symbol gets focus. Symbol-change-driven (via prevSymbolRef): re-renders
  // with the same symbol don't re-fire, so a manual tf click during the
  // session is never clobbered. Initial mount counts as a "change" from the
  // ref's null sentinel, so the snap also fires on app open with a crypto
  // symbol pre-focused. Non-crypto and no-pref are both no-ops — we never
  // surprise the user with a tf they didn't explicitly request via Settings.
  const prevSymbolRef = useRef<string | null>(null)
  useEffect(() => {
    if (symbol === prevSymbolRef.current) return
    prevSymbolRef.current = symbol
    if (!isCryptoSymbol) return
    const pref = useSubsecondStore.getState().getPref(symbol)
    if (pref === 250) setTf('250ms')
    else if (pref === 500) setTf('500ms')
  }, [symbol, isCryptoSymbol])

  // Hydrate the sub-second store from persistence on (symbol, tf) entry into
  // sub-second mode. 600 bars ≈ 2.5 min @ 250ms / 5 min @ 500ms — enough for
  // the chart to render a full timeline immediately while live SUBSECOND_CANDLES_
  // UPDATE pushes catch up. Cancelled flag protects against late resolution
  // landing after the user already switched away.
  useEffect(() => {
    if (!showSub) return
    let cancelled = false
    void window.satex?.getSubsecondCandles?.(symbol, subBucketMs, 600).then((bars: SubSecondCandle[]) => {
      if (cancelled || !bars || bars.length === 0) return
      useSubsecondStore.getState().hydrate(symbol, subBucketMs, bars)
    }).catch(() => { /* hydration is best-effort — live pushes will fill in */ })
    return () => { cancelled = true }
  }, [showSub, symbol, subBucketMs])

  // ── Historical-day replay state ────────────────────────────────────────────
  const [histDate,  setHistDate]  = useState<string>(defaultHistoricalDate())
  const [histBusy,  setHistBusy]  = useState(false)
  const [histErr,   setHistErr]   = useState<string | null>(null)
  /** Soft informational banner. Separate from histErr so the no-creds nudge
   *  isn't styled as a red error and doesn't auto-dismiss after 6s. */
  const [histInfo,  setHistInfo]  = useState<string | null>(null)
  const [replayStatus, setReplayStatus] = useState<ReplayStatus | null>(null)

  // Subscribe to replay status — drives "in replay?" UI branching.
  useEffect(() => {
    let cancelled = false
    void window.satex?.replay?.getStatus()
      .then(s => { if (!cancelled) setReplayStatus(s) })
      .catch(() => {})
    const unsub = window.satex?.replay?.onStatus(s => { if (!cancelled) setReplayStatus(s) })
    return () => { cancelled = true; unsub?.() }
  }, [])

  const inReplay        = replayStatus?.mode === 'playing' || replayStatus?.mode === 'paused'
  const replaySessionId = inReplay ? replayStatus?.sessionId ?? null : null
  const replayDate      = dateFromHistSessionId(replaySessionId)
  const replayMode      = replayStatus?.mode ?? null
  const replayCursor    = replayStatus?.cursorTs ?? null

  // Auto-dismiss error after 6s so the toolbar doesn't stay polluted.
  useEffect(() => {
    if (!histErr) return
    const t = setTimeout(() => setHistErr(null), 6_000)
    return () => clearTimeout(t)
  }, [histErr])

  // ── Auto-load most recent NY session on first mount (2026-05-17) ──────────
  // User request: when the app opens outside RTH, the chart should default to
  // the most recent COMPLETED NY trading session instead of staying on
  // (potentially fake) live data. Guards:
  //   • Fires at most ONCE per panel mount (autoLoadedRef latch).
  //   • Skips if the user is already in a replay session — don't clobber.
  //   • Skips during US equity RTH — live data is what the user wants then.
  //   • Skips if there are no Alpaca credentials — the historical-bars
  //     endpoint would just return the same "No Alpaca credentials" error
  //     the user already saw in their 2026-05-17 02:52 recording. We log
  //     and latch instead so the failed import doesn't repeat every render.
  // Once latched, the user can still manually use the date picker / load
  // button; this effect just provides a sensible default on cold start.
  const autoLoadedRef = useRef(false)
  useEffect(() => {
    if (autoLoadedRef.current) return
    if (replayStatus === null) return           // wait for first status
    if (inReplay) { autoLoadedRef.current = true; return }
    if (isUsEquityMarketOpen()) { autoLoadedRef.current = true; return }
    let cancelled = false
    void (async () => {
      try {
        const creds = await window.satex?.getCredentialsMasked()
        if (cancelled) return
        const hasCreds = !!(creds && (creds.paperConfigured || creds.liveConfigured))
        if (!hasCreds) {
          console.info('[chart] auto-load skipped — no Alpaca credentials')
          autoLoadedRef.current = true
          // Soft, dismissable nudge so the user understands why the chart is
          // sitting on simulator data instead of a real session. We only show
          // this once per session — a dismiss latches in sessionStorage so the
          // banner doesn't follow the user around between workspace tabs.
          try {
            if (!sessionStorage.getItem('satex.chart.no-creds-dismissed')) {
              setHistInfo('Outside US market hours · simulated data only. Add Alpaca keys in Settings → Data Source to auto-load the last NY session.')
            }
          } catch { /* sessionStorage unavailable — show anyway */
            setHistInfo('Outside US market hours · simulated data only. Add Alpaca keys in Settings → Data Source to auto-load the last NY session.')
          }
          return
        }
        // Latch BEFORE the await so a re-render during loadHistoricalDayForDate
        // doesn't queue a second auto-load.
        autoLoadedRef.current = true
        const date = mostRecentClosedSessionDate()
        setHistDate(date)
        await loadHistoricalDayForDate(date)
      } catch (e) {
        console.warn('[chart] auto-load failed:', e)
      }
    })()
    return () => { cancelled = true }
    // `loadHistoricalDayForDate` intentionally omitted from deps — it
    // recreates every render (closes over local state setters), and the
    // autoLoadedRef latch guarantees we only fire once anyway. Adding it
    // would loop. Same reasoning applies to `setHistDate`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inReplay, replayStatus])

  /**
   * Load a previous calendar day into the chart via Phase 9.1 historical
   * replay. Pipeline:
   *
   *   1. Build symbol set — current chart symbol first, then watchlist + fallback,
   *      filtered to equity/index (the only classes Alpaca bars cover), capped at 16.
   *   2. importHistorical — Alpaca bars → synthetic tape under `hist_<date>_…`.
   *   3. If a replay is already active, stop it first so the engine cleanly
   *      swaps sources.
   *   4. start(replay) at speed=1, pause immediately, seek to tapeEnd. The
   *      seek warms up the chart with the full day's bars synchronously, so
   *      the user sees the whole session as soon as loading finishes.
   *
   * Side effect: while replay is active, live order submission is blocked
   * (existing TradingEngine guardrail). User clicks "Return to Live" to resume.
   */
  async function loadHistoricalDay(): Promise<void> {
    return loadHistoricalDayForDate(histDate)
  }

  /** Body of `loadHistoricalDay` parameterized by the target date. Extracted
   *  2026-05-17 so the auto-load-on-mount effect (below) can request a
   *  specific date without round-tripping through state and waiting for a
   *  re-render. */
  async function loadHistoricalDayForDate(date: string): Promise<void> {
    if (histBusy) return
    setHistBusy(true); setHistErr(null)
    try {
      const watchSyms = Array.from(useMarketStore.getState().quotes.keys())
      const candidates = [symbol, ...watchSyms, ...HISTORICAL_BARS_FALLBACK_SYMBOLS]
      const symbols: string[] = []
      const seen = new Set<string>()
      for (const s of candidates) {
        const up = s.toUpperCase()
        if (seen.has(up) || !HISTORICAL_ELIGIBLE.has(up)) continue
        seen.add(up); symbols.push(up)
        if (symbols.length >= 16) break
      }
      if (symbols.length === 0) {
        setHistErr(`${symbol} has no historical bars (equity/index ETFs only).`)
        return
      }

      const importRes = await window.satex?.replay?.importHistorical({
        date, symbols, timeframe: '1Min',
      })
      if (!importRes?.ok || !importRes.sessionId) {
        setHistErr(importRes?.reason ?? 'Import failed')
        return
      }

      // Hot-swap: stop any active replay so we don't pile sources on each other.
      if (inReplay) {
        await window.satex?.replay?.stop()
      }

      const startRes = await window.satex?.replay?.start({
        sessionId: importRes.sessionId, speed: 1,
      })
      if (!startRes?.ok) {
        setHistErr(startRes?.reason ?? 'Replay start failed')
        return
      }

      await window.satex?.replay?.pause()
      // Seek to end so warmup re-emits the whole day into the chart synchronously.
      const st = await window.satex?.replay?.getStatus()
      if (st?.tapeEndTs && st?.tapeStartTs) {
        // Clear candle store BEFORE the seek so the upcoming warmup emit
        // builds the chart fresh instead of being appended to whatever
        // stragglers the initial start-warmup pushed (typically just the
        // first tape row near tapeStart). useIPC's mode-transition reset
        // fires on idle→playing but not on subsequent seeks.
        useMarketStore.getState().resetCandles()
        // Stop 1 ms shy of tapeEnd to avoid tripping the auto-pause-at-end path.
        await window.satex?.replay?.seek(Math.max(st.tapeStartTs, st.tapeEndTs - 1))
      }
    } catch (e) {
      setHistErr(String(e))
    } finally {
      setHistBusy(false)
    }
  }

  async function exitReplay(): Promise<void> {
    setHistErr(null)
    try { await window.satex?.replay?.stop() } catch (e) { setHistErr(String(e)) }
  }

  // Aggregate raw 1s candles into the user's selected timeframe. Sub-second
  // mode bypasses the renderer aggregator — bars come fully-sealed from the
  // engine's SubSecondAggregator via the store, so we just map the
  // SubSecondCandle (openMs in ms) onto the Candle shape lightweight-charts
  // expects (time as a fractional unix-seconds UTCTimestamp).
  const view = useMemo<Candle[]>(() => {
    if (showSub) {
      const bars = subBars ?? []
      return bars.map(b => ({
        time:   b.openMs / 1000,
        open:   b.open,
        high:   b.high,
        low:    b.low,
        close:  b.close,
        volume: b.volume,
      }))
    }
    return aggregate(candles, bucketSec)
  }, [showSub, subBars, candles, bucketSec])

  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef     = useRef<unknown>(null)
  const seriesRef    = useRef<unknown>(null)
  /** Cached lightweight-charts module — kept for indicator reconciliation
   *  effects to add/remove series without re-importing. */
  const lwcModRef    = useRef<unknown>(null)
  /** EMA series keyed by period — lets us add/remove individual periods
   *  in response to indicator-store changes without nuking the whole chart. */
  const emaSeriesMap = useRef<Map<number, unknown>>(new Map())
  /** RSI series lives in pane index 1 (sub-pane). Created on demand,
   *  destroyed when the indicator is toggled off. */
  const rsiSeriesRef       = useRef<unknown>(null)
  const rsiOverboughtRef   = useRef<unknown>(null)
  const rsiOversoldRef     = useRef<unknown>(null)
  /** Horizontal price lines for Fibonacci (5 levels) and Pivot Points
   *  (PP + R1..R3 + S1..S3 = 7 lines). Tracked so we can clear+redraw on
   *  setting changes without leaking handles. */
  const fibLineRefs        = useRef<unknown[]>([])
  const pivotLineRefs      = useRef<unknown[]>([])
  /** Pattern-marker handle (lightweight-charts v5 createSeriesMarkers). */
  const markersHandleRef   = useRef<unknown>(null)

  /** Per-indicator memoization. Each chunk in the reconciliation effect
   *  stores its last-applied signature (view.length + relevant settings)
   *  plus the notes/markers it produced. On the next reconciliation cycle,
   *  if a chunk's signature matches its cached entry, the expensive
   *  computation AND the chart-series update are skipped — only the cached
   *  notes/markers are replayed into the shared outputs.
   *
   *  Drops the steady-state cost of "user toggled one indicator" from
   *  recomputing all six down to recomputing only the one that changed.
   *  Cleared automatically on chart re-init (the cleanup in the init
   *  effect drops every ref → no stale series handles to chase). */
  type IndicatorCache = { sig: string; notes: readonly string[] }
  type PatternMarker = { time: unknown; position: string; color: string; shape: string; text: string }
  type PatternCache  = IndicatorCache & { markers: readonly PatternMarker[] }
  const indicatorCacheRef = useRef<{
    ema?:      IndicatorCache
    rsi?:      IndicatorCache
    fib?:      IndicatorCache
    pivots?:   IndicatorCache
    patterns?: PatternCache
  }>({})

  // Init chart once per mount. Indicator series are added by the
  // reconciliation effect below — this effect only creates the chart and
  // the main candlestick series.
  useEffect(() => {
    if (!containerRef.current) return
    let cancelled = false
    // Capture the ref'd Map at effect entry so cleanup operates on the same
    // instance even if some future code path reassigns emaSeriesMap.current.
    const emaMapAtMount = emaSeriesMap.current

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
            secondsVisible: true,
            rightOffset: 6,
            barSpacing: 8,
          },
          handleScroll: true,
          handleScale:  true,
        })

        // v0.6 Phase 3 — initial candle colors at the actual SATEX --bb-pos /
        // --bb-neg values (the pre-fix #22c55e / #ef4444 were Tailwind green-500
        // and red-500, off-palette even in Classic). The theme-reactive effect
        // below re-applies these via readCssVar on every theme switch, so the
        // hardcoded values here only matter for the first paint before the
        // effect runs once.
        const series = chart.addSeries(CandlestickSeries, {
          upColor:          '#21c97a', downColor:       '#ff4655',
          borderUpColor:    '#21c97a', borderDownColor: '#ff4655',
          wickUpColor:      applyOpacity('#21c97a', 0.6),
          wickDownColor:    applyOpacity('#ff4655', 0.6),
          priceLineVisible: true,
          lastValueVisible: true,
        })

        chartRef.current  = chart
        seriesRef.current = series
        lwcModRef.current = lwc

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
        chartRef.current     = null
        seriesRef.current    = null
        lwcModRef.current    = null
        emaMapAtMount.clear()
        rsiSeriesRef.current     = null
        rsiOverboughtRef.current = null
        rsiOversoldRef.current   = null
        fibLineRefs.current      = []
        pivotLineRefs.current    = []
        markersHandleRef.current = null
      }
    }
  }, [])

  // v0.6 Phase 3 — candle colors track the active theme. Re-reads --bb-pos /
  // --bb-neg from CSS on every theme change and pushes through the existing
  // CandlestickSeries. Wick colors derive at 60% opacity so they read as
  // lighter accents over the dark bg, matching the pre-Phase-3 visual
  // (which used hardcoded Tailwind 400-shades for the same effect).
  useEffect(() => {
    if (!seriesRef.current) return
    const pos = readCssVar('--bb-pos') || '#21c97a'
    const neg = readCssVar('--bb-neg') || '#ff4655'
    try {
      ;(seriesRef.current as { applyOptions: (o: unknown) => void }).applyOptions({
        upColor:         pos, downColor:       neg,
        borderUpColor:   pos, borderDownColor: neg,
        wickUpColor:     applyOpacity(pos, 0.6),
        wickDownColor:   applyOpacity(neg, 0.6),
      })
    } catch { /* series not yet mounted — first paint handles it */ }
  }, [theme])

  // v0.6 Phase 3 — RSI series color tracks --bb-accent. Same pattern as the
  // candle effect above. Idempotent if the RSI series isn't created yet
  // (chunkRsi adds it lazily on first RSI-enabled render).
  useEffect(() => {
    const rsi = rsiSeriesRef.current as { applyOptions: (o: unknown) => void } | null
    if (!rsi) return
    const accent = readCssVar('--bb-accent') || '#00c8ff'
    try { rsi.applyOptions({ color: applyOpacity(accent, 0.88) }) }
    catch { /* RSI series stale — next chunkRsi will reseed */ }
  }, [theme])

  // Bulk reset when symbol, timeframe, or aggregated length changes.
  // Deliberately depends on `view.length` rather than full `view` — the
  // live-update effect below ratchets the in-flight bar via `view`/`quote.last`
  // on every tick, so this bulk-reset path only needs to fire on actual
  // bar-count changes (symbol switch, timeframe change, new bar appended).
  // Re-firing on every view reference change would redundantly replace data
  // already covered by the live-update path. Full-view re-set on every
  // emit also breaks lightweight-charts' setData/update separation contract.
  useEffect(() => {
    if (!seriesRef.current || view.length === 0) return
    try {
      const s = seriesRef.current as { setData: (d: unknown) => void }
      s.setData(view.map(c => ({
        time: c.time as unknown,
        open: c.open, high: c.high, low: c.low, close: c.close,
      })))
    } catch { /* stale ref */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, tf, view.length])

  // Live update — in-flight candle. S1-1: dep is `quote?.last` + `view` only.
  // Previously included `quote?.timestamp`, which ticks 20Hz even when the
  // price is flat — that caused this effect to re-fire on every quote regardless
  // of whether the chart needed to repaint, driving boot-time frame stalls
  // up to 125ms.
  //
  // Deps subset deliberately excludes the full `quote` object: lint wants
  // `quote` so that any field change re-fires, but the effect ONLY reads
  // `quote.last`. Including full `quote` would re-fire on every 20Hz tick
  // of any other field (timestamp, bid, ask, volume, sparkline) — the exact
  // perf regression the S1-1 fix targeted.
  //
  // 2026-05-16 fix: paint the in-flight bar using `quote.last` (the live
  // simulator/Alpaca price) instead of `last.close` (which is the bucket's
  // OPENING price — the candle source only re-emits a candle event on the
  // 1-second roll boundary, so view[last] stays a doji until then). High and
  // low ratchet against quote.last so the wick grows correctly within the bar.
  // Without this, every chart showed a doji-then-jump pattern that read as
  // "flat lines" to the user.
  useEffect(() => {
    if (!seriesRef.current || view.length === 0 || !quote) return
    // A1 (v0.4.4) — sub-second mode skips the in-flight ratchet. The engine's
    // SubSecondAggregator emits fully-sealed bars on each bucket roll, so
    // ratcheting the last bar from quote.last (which is the LiveMarket-fused
    // mid, not the trade-only price the aggregator uses) would corrupt the
    // sealed OHLC values the moment a new bar lands.
    if (showSub) return
    try {
      const last = view[view.length - 1]!
      const liveClose = quote.last
      const liveHigh  = Math.max(last.high, liveClose)
      const liveLow   = Math.min(last.low,  liveClose)
      const s = seriesRef.current as { update: (d: unknown) => void }
      s.update({
        time: last.time as unknown,
        open: last.open,
        high: liveHigh,
        low:  liveLow,
        close: liveClose,
      })
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote?.last, view, showSub])

  // ── Prior-day H/L/C fetch for Pivot Points ──────────────────────────────────
  // Refetches whenever the symbol changes or the user toggles pivots on, since
  // the user may have flipped between symbols while the indicator was off.
  // Clears the cache when the indicator is off so the legend doesn't keep
  // stale data.
  const pivotsOn = indSettings.enabled['pivot-points']
  useEffect(() => {
    if (!pivotsOn) {
      setPriorHlc(null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const hlc = await window.satex?.indicators?.getPriorDayHlc(symbol)
        if (!cancelled) setPriorHlc(hlc ?? null)
      } catch (e) {
        console.warn('[chart] prior-day HLC fetch failed:', e)
        if (!cancelled) setPriorHlc(null)
      }
    })()
    return () => { cancelled = true }
  }, [symbol, pivotsOn])

  // ── Indicator reconciliation ────────────────────────────────────────────────
  // Single source of truth: read indicatorStore + regime + candles, sync the
  // chart to match. Add missing series, remove unwanted, refresh data, update
  // colors.
  //
  // 2026-05-16 perf — five layered optimizations addressing the 100 ms+
  // frame stalls this work caused every ~1 s in extended sessions:
  //
  //   1. Idle-callback scheduling — `window.requestIdleCallback` defers heavy
  //      math past the current frame commit so the next paint isn't blocked.
  //      500 ms timeout backstop prevents indefinite starvation.
  //   2. Chunked execution — each indicator (EMA, RSI, Fibonacci, Pivot
  //      Points, patterns, finalize) runs as its OWN idle callback. The
  //      browser gets input/paint/IPC turns between chunks; no single
  //      chunk monopolizes the main thread. Cascading scheduler in
  //      `runNext` advances one step per callback.
  //   3. Per-indicator memoization — each chunk has a signature key
  //      (view.length + relevant settings + regime/HLC where applicable).
  //      On sig hit, the chunk replays cached notes/markers without
  //      recomputing or re-touching chart series. Toggling RSI no longer
  //      recomputes EMA or rescans patterns; only the chunk whose inputs
  //      changed pays compute cost.
  //   4. Pattern detection capped to last PATTERN_WINDOW (200) bars — the
  //      O(K × (K+N)) double-top/bottom scan would otherwise grow
  //      unboundedly with view length. Sliding window keeps worst-case
  //      stable. Indices remap (+ sliceStart) back to view-space so older
  //      candles still receive their annotation positions.
  //   5. Dep array on `view.length` (not `view`) — intra-bar mutations from
  //      CANDLES_UPDATE isNew=false bump the view memo's ref but not its
  //      length; indicators only care about closed-candle boundaries.
  //      The deliberate `view.length` dep is a documented perf invariant.
  //      Full `view` would re-fire this reconciliation every tick (~20Hz),
  //      the exact stall the 5-layer perf rewrite targeted.
  useEffect(() => {
    let cancelled = false
    let pendingHandle: number | null = null

    const chart = chartRef.current as {
      addSeries: (typ: unknown, opts: unknown, paneIndex?: number) => unknown
      removeSeries: (s: unknown) => void
      panes: () => Array<{ setHeight: (h: number) => void }>
    } | null
    const lwc = lwcModRef.current as {
      LineSeries: unknown
      createSeriesMarkers?: (s: unknown, m: unknown[]) => unknown
    } | null
    const main = seriesRef.current as {
      createPriceLine: (opts: unknown) => unknown
      removePriceLine: (l: unknown) => void
      setMarkers?: (m: unknown[]) => void
    } | null
    if (!chart || !lwc || !main) return
    if (view.length === 0) return

    const indCandles = view as unknown as IndCandle[]
    const PATTERN_WINDOW = 200

    // Shared mutable outputs aggregated across chunks. Each chunk appends
    // its notes; chunkPatterns also appends marker objects. chunkFinalize
    // reads both at the end and applies them to the chart + warning UI.
    const notes: string[] = []
    const patternMarkers: PatternMarker[] = []
    const cache = indicatorCacheRef.current

    // ── Chunk 1: EMA series ────────────────────────────────────────────────
    // Series add/remove (cheap) always runs so toggle response is instant.
    // Only the per-period setData (expensive) is gated by signature.
    const chunkEma = (): void => {
      const wantPeriods: number[] = indSettings.enabled.ema ? [...indSettings.emaPeriods] : []
      const currentPeriods = Array.from(emaSeriesMap.current.keys())
      for (const p of currentPeriods) {
        if (!wantPeriods.includes(p)) {
          try { chart.removeSeries(emaSeriesMap.current.get(p)) } catch { /* ignore */ }
          emaSeriesMap.current.delete(p)
        }
      }
      // Cache signature includes regime AND theme so a switch in either busts
      // the cache and re-applies colors. (Pre-Phase-3 this used `${emaColor}`
      // which combined regime via the helper; theme is a new axis now.)
      const sig = `${view.length}|${[...wantPeriods].sort((a, b) => a - b).join(',')}|${dominantRegime ?? 'null'}|${theme}`
      if (cache.ema?.sig === sig) {
        notes.push(...cache.ema.notes)
        return
      }
      const localNotes: string[] = []
      for (const period of wantPeriods) {
        // v0.6 Phase 3 — per-period color is theme-aware: regime+opacity in
        // Classic, period token at full opacity in Mono/Bluyel.
        const { color: baseColor, opacity } = emaColorForPeriod(period, dominantRegime, theme, readCssVar)
        const lineColor = applyOpacity(baseColor, opacity)
        let s = emaSeriesMap.current.get(period) as {
          applyOptions: (o: unknown) => void
          setData: (d: unknown) => void
        } | undefined
        if (!s) {
          s = chart.addSeries(lwc.LineSeries, {
            color: lineColor, lineWidth: 1.4,
            priceLineVisible: false, lastValueVisible: false,
            title: `EMA${period}`,
          }) as typeof s
          emaSeriesMap.current.set(period, s!)
        }
        if (view.length < period) {
          localNotes.push(`EMA${period} needs ${period} bars (have ${view.length})`)
          try { s!.setData([]) } catch { /* ignore */ }
          continue
        }
        const series = computeEmaSeries(indCandles, period)
        const data: Array<{ time: unknown; value: number }> = []
        for (let i = 0; i < series.values.length; i++) {
          const v = series.values[i]!
          if (Number.isFinite(v)) data.push({ time: view[i]!.time as unknown, value: v })
        }
        try {
          s!.applyOptions({ color: lineColor, title: `EMA${period}` })
          s!.setData(data)
        } catch { /* ignore */ }
      }
      cache.ema = { sig, notes: localNotes }
      notes.push(...localNotes)
    }

    // ── Chunk 2: RSI sub-pane ──────────────────────────────────────────────
    const chunkRsi = (): void => {
      if (!indSettings.enabled.rsi) {
        if (rsiSeriesRef.current) {
          try { chart.removeSeries(rsiSeriesRef.current) } catch { /* ignore */ }
          rsiSeriesRef.current     = null
          rsiOverboughtRef.current = null
          rsiOversoldRef.current   = null
        }
        cache.rsi = { sig: 'off', notes: [] }
        return
      }
      const period = indSettings.rsiPeriod
      const sig = `${view.length}|${period}`
      if (cache.rsi?.sig === sig) {
        notes.push(...cache.rsi.notes)
        return
      }
      const localNotes: string[] = []
      if (view.length < period + 1) {
        localNotes.push(`RSI${period} needs ${period + 1} bars (have ${view.length})`)
        if (rsiSeriesRef.current) {
          try { (rsiSeriesRef.current as { setData: (d: unknown) => void }).setData([]) } catch { /* ignore */ }
        }
      } else {
        if (!rsiSeriesRef.current) {
          // v0.6 Phase 3 — initial RSI color reads --bb-accent so the very
          // first paint matches the active theme. The [theme] effect above
          // re-applies on subsequent switches.
          const rsi = chart.addSeries(lwc.LineSeries, {
            color: applyOpacity(readCssVar('--bb-accent') || '#00c8ff', 0.88),
            lineWidth: 1.2,
            priceLineVisible: false, lastValueVisible: true,
            title: `RSI${period}`,
          }, 1) as {
            createPriceLine: (o: unknown) => unknown
            applyOptions: (o: unknown) => void
            setData: (d: unknown) => void
          }
          rsiSeriesRef.current     = rsi
          rsiOverboughtRef.current = rsi.createPriceLine({
            price: 70, color: 'rgba(255,70,85,0.55)', lineWidth: 1,
            lineStyle: 2, axisLabelVisible: true, title: '70',
          })
          rsiOversoldRef.current = rsi.createPriceLine({
            price: 30, color: 'rgba(33,201,122,0.55)', lineWidth: 1,
            lineStyle: 2, axisLabelVisible: true, title: '30',
          })
          try {
            const panes = chart.panes()
            if (panes[1]) panes[1].setHeight(110)
          } catch { /* ignore */ }
        }
        const series = computeRsiSeries(indCandles, period)
        const data: Array<{ time: unknown; value: number }> = []
        for (let i = 0; i < series.values.length; i++) {
          const v = series.values[i]!
          if (Number.isFinite(v)) data.push({ time: view[i]!.time as unknown, value: v })
        }
        try {
          const rsi = rsiSeriesRef.current as {
            applyOptions: (o: unknown) => void
            setData: (d: unknown) => void
          }
          rsi.applyOptions({ title: `RSI${period}` })
          rsi.setData(data)
        } catch { /* ignore */ }
      }
      cache.rsi = { sig, notes: localNotes }
      notes.push(...localNotes)
    }

    // ── Chunk 3: Fibonacci horizontal lines ────────────────────────────────
    // Tear down + redraw ONLY on cache miss. On hit, the existing price
    // lines stay on the chart and we just replay cached notes.
    const chunkFib = (): void => {
      if (!indSettings.enabled.fibonacci) {
        for (const l of fibLineRefs.current) {
          try { main.removePriceLine(l) } catch { /* ignore */ }
        }
        fibLineRefs.current = []
        cache.fib = { sig: 'off', notes: [] }
        return
      }
      const lookback = indSettings.fibLookback
      const sig = `${view.length}|${lookback}`
      if (cache.fib?.sig === sig) {
        notes.push(...cache.fib.notes)
        return
      }
      for (const l of fibLineRefs.current) {
        try { main.removePriceLine(l) } catch { /* ignore */ }
      }
      fibLineRefs.current = []
      const localNotes: string[] = []
      if (view.length < lookback) {
        localNotes.push(`Fibonacci needs ${lookback} bars (have ${view.length})`)
      } else {
        const fib = computeFibonacci(indCandles, { lookback })
        for (let i = 0; i < fib.levels.length; i++) {
          const lvl = fib.levels[i]!
          const ratio = FIB_RATIOS[i] ?? 0
          const color = FIB_COLORS[ratio] ?? 'rgba(160,160,168,0.55)'
          const line = main.createPriceLine({
            price: lvl.price, color,
            lineWidth: ratio === 0.618 ? 2 : 1,
            lineStyle: 0,
            axisLabelVisible: true,
            title: `FIB ${(ratio * 100).toFixed(1)}`,
          })
          fibLineRefs.current.push(line)
        }
      }
      cache.fib = { sig, notes: localNotes }
      notes.push(...localNotes)
    }

    // ── Chunk 4: Pivot Points (PP + R1-R3 + S1-S3) ─────────────────────────
    const chunkPivots = (): void => {
      if (!indSettings.enabled['pivot-points']) {
        for (const l of pivotLineRefs.current) {
          try { main.removePriceLine(l) } catch { /* ignore */ }
        }
        pivotLineRefs.current = []
        cache.pivots = { sig: 'off', notes: [] }
        return
      }
      // Pivots derive purely from priorHlc + (chart-has-data) — view.length
      // doesn't materially change the lines, but we encode "has data" so a
      // brand-new chart redraws on first arrival.
      const sig = `${priorHlc?.date ?? 'awaiting'}|${view.length > 0 ? 'ready' : 'empty'}`
      if (cache.pivots?.sig === sig) {
        notes.push(...cache.pivots.notes)
        return
      }
      for (const l of pivotLineRefs.current) {
        try { main.removePriceLine(l) } catch { /* ignore */ }
      }
      pivotLineRefs.current = []
      const localNotes: string[] = []
      if (!priorHlc) {
        localNotes.push('Pivot Points awaiting prior-day H/L/C')
      } else {
        const H = priorHlc.high, L = priorHlc.low, C = priorHlc.close
        const pp = (H + L + C) / 3
        const R1 = 2 * pp - L, S1 = 2 * pp - H
        const R2 = pp + (H - L), S2 = pp - (H - L)
        const R3 = H + 2 * (pp - L), S3 = L - 2 * (H - pp)
        const levels: Array<{ price: number; title: string; color: string; width: number }> = [
          { price: R3, title: 'R3', color: 'rgba(255,70,85,0.42)', width: 1 },
          { price: R2, title: 'R2', color: 'rgba(255,70,85,0.62)', width: 1 },
          { price: R1, title: 'R1', color: 'rgba(255,70,85,0.82)', width: 1 },
          { price: pp, title: 'PP', color: 'rgba(0,200,255,0.95)', width: 2 },
          { price: S1, title: 'S1', color: 'rgba(33,201,122,0.82)', width: 1 },
          { price: S2, title: 'S2', color: 'rgba(33,201,122,0.62)', width: 1 },
          { price: S3, title: 'S3', color: 'rgba(33,201,122,0.42)', width: 1 },
        ]
        for (const lvl of levels) {
          const line = main.createPriceLine({
            price: lvl.price, color: lvl.color,
            lineWidth: lvl.width, lineStyle: 2,
            axisLabelVisible: true, title: lvl.title,
          })
          pivotLineRefs.current.push(line)
        }
      }
      cache.pivots = { sig, notes: localNotes }
      notes.push(...localNotes)
    }

    // ── Chunk 5: Double Top / Double Bottom markers ────────────────────────
    // Pattern detection runs on a sliding window of the last PATTERN_WINDOW
    // bars (was: full view, which scaled unboundedly with session length).
    // Indices returned by the detector are window-relative; we add
    // sliceStart to map them back into view-space before marker placement.
    const chunkPatterns = (): void => {
      const dtEnabled = indSettings.enabled['double-top']
      const dbEnabled = indSettings.enabled['double-bottom']
      const sig = `${view.length}|${dtEnabled ? 'dt' : ''}|${dbEnabled ? 'db' : ''}`
      if (cache.patterns?.sig === sig) {
        notes.push(...cache.patterns.notes)
        patternMarkers.push(...cache.patterns.markers)
        return
      }
      const localNotes: string[] = []
      const localMarkers: PatternMarker[] = []
      if (dtEnabled || dbEnabled) {
        if (view.length < 20) {
          if (dtEnabled) localNotes.push('Double Top needs ≥20 bars')
          if (dbEnabled) localNotes.push('Double Bottom needs ≥20 bars')
        } else {
          const sliceStart = Math.max(0, indCandles.length - PATTERN_WINDOW)
          const patternView = sliceStart === 0 ? indCandles : indCandles.slice(sliceStart)
          if (dtEnabled) {
            const tops = detectDoubleTops(patternView)
            for (const t of tops) {
              const confirmed = t.breakIndex != null
              const viewIdx = t.pointB.index + sliceStart
              if (viewIdx >= view.length) continue
              localMarkers.push({
                time: view[viewIdx]!.time as unknown,
                position: 'aboveBar',
                color: confirmed ? '#ff4655' : 'rgba(255,70,85,0.55)',
                shape: confirmed ? 'arrowDown' : 'circle',
                text:  confirmed ? `2T ${t.pointB.price.toFixed(2)} ✓` : `2T ${t.pointB.price.toFixed(2)}`,
              })
            }
          }
          if (dbEnabled) {
            const bots = detectDoubleBottoms(patternView)
            for (const b of bots) {
              const confirmed = b.breakIndex != null
              const viewIdx = b.pointB.index + sliceStart
              if (viewIdx >= view.length) continue
              localMarkers.push({
                time: view[viewIdx]!.time as unknown,
                position: 'belowBar',
                color: confirmed ? '#21c97a' : 'rgba(33,201,122,0.55)',
                shape: confirmed ? 'arrowUp' : 'circle',
                text:  confirmed ? `2B ${b.pointB.price.toFixed(2)} ✓` : `2B ${b.pointB.price.toFixed(2)}`,
              })
            }
          }
        }
      }
      cache.patterns = { sig, notes: localNotes, markers: localMarkers }
      notes.push(...localNotes)
      patternMarkers.push(...localMarkers)
    }

    // ── Chunk 6: finalize — apply markers + publish warnings ───────────────
    const chunkFinalize = (): void => {
      // Lightweight-charts v5 moved markers to a separate helper;
      // createSeriesMarkers(series, markers) returns a handle whose
      // .setMarkers(next) updates in place. The v4 path is series.setMarkers.
      try {
        if (lwc.createSeriesMarkers) {
          if (markersHandleRef.current) {
            (markersHandleRef.current as { setMarkers: (m: unknown[]) => void }).setMarkers(patternMarkers)
          } else if (patternMarkers.length > 0) {
            markersHandleRef.current = lwc.createSeriesMarkers(main, patternMarkers)
          }
        } else if (typeof main.setMarkers === 'function') {
          main.setMarkers(patternMarkers)
        }
      } catch (e) {
        console.warn('[chart] pattern marker render failed:', e)
      }
      setWarnings(notes)
    }

    // ── Cascading idle-callback scheduler ──────────────────────────────────
    const chunks: ReadonlyArray<() => void> = [
      chunkEma, chunkRsi, chunkFib, chunkPivots, chunkPatterns, chunkFinalize,
    ]
    let idx = 0
    const runNext = (): void => {
      if (cancelled) return
      if (idx >= chunks.length) { pendingHandle = null; return }
      try { chunks[idx]!() }
      catch (e) { console.error('[chart] reconcile chunk crashed:', e) }
      idx++
      if (idx < chunks.length) {
        pendingHandle = window.requestIdleCallback(runNext, { timeout: 500 })
      } else {
        pendingHandle = null
      }
    }
    pendingHandle = window.requestIdleCallback(runNext, { timeout: 500 })

    return () => {
      cancelled = true
      if (pendingHandle != null) window.cancelIdleCallback(pendingHandle)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.length, indSettings, dominantRegime, theme, priorHlc])

  const up = (quote?.changePct ?? 0) >= 0

  const hi = view.length ? Math.max(...view.map(c => c.high)) : undefined
  const lo = view.length ? Math.min(...view.map(c => c.low))  : undefined
  const vol = view.reduce((a, c) => a + c.volume, 0)

  return (
    <div className="chart-shell">
      <div className="chart-toolbar">
        <div className="chart-symbol">
          <span className="sym">{symbol}</span>
          {isSynthetic && (
            <span className="bb-sim-badge" title={SIM_BADGE_TOOLTIP}>SIM</span>
          )}
          {showSub && (
            // A1 Sprint 2 — sub-second mode marker (design doc §4.3). Renders
            // exactly when the active timeframe is sub-second AND the symbol is
            // crypto (both conditions baked into showSub). Tells the analyst at
            // a glance that this chart is reading from the SubSecondAggregator
            // ring, not the rolled-up 1-second pipeline. Tooltip explains why.
            <span
              className="bb-sub-badge"
              title={`Sub-second mode — bars seal every ${subBucketMs} ms. Crypto-only feed; the aggregator maintains 250 ms and 500 ms buckets in parallel so switching between them is free.`}
            >
              SUB · {subBucketMs} ms
            </span>
          )}
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
            {CHART_TIMEFRAMES.map(t => {
              // A1 — sub-second is crypto-only because IEX equities are capped at
              // 1-second snapshots (paid Alpaca SIP would unlock; out of scope
              // for v0.4.4). Buttons render but are disabled with a tooltip on
              // non-crypto symbols so the constraint is discoverable.
              const subDisabled = isSubsecondTimeframe(t) && !isCryptoSymbol
              return (
                <button
                  key={t}
                  type="button"
                  className={tf === t ? 'on' : ''}
                  disabled={subDisabled}
                  title={subDisabled ? 'Sub-second timeframes are crypto-only (BTC/ETH). Equity feeds (IEX) cap at 1-second snapshots.' : undefined}
                  onClick={() => { if (!subDisabled) setTf(t) }}
                >
                  {t}
                </button>
              )
            })}
          </div>

          <div className="chart-histday" role="group" aria-label="Historical day replay">
            {inReplay ? (
              <>
                <span
                  className={`chart-histday-pill ${replayMode === 'paused' ? 'paused' : 'playing'}`}
                  title={replayCursor ? `Cursor: ${new Date(replayCursor).toLocaleString()}` : undefined}
                >
                  <span className="dot" />
                  REPLAY · {replayDate ?? (replaySessionId?.slice(0, 12) ?? '—')}
                  {replayMode && <em>{replayMode}</em>}
                </span>
                <button
                  type="button"
                  className="chart-histday-btn danger"
                  onClick={() => void exitReplay()}
                  title="Stop replay and return to live data"
                >
                  ■ Return to Live
                </button>
              </>
            ) : (
              <>
                <input
                  type="date"
                  className="chart-histday-date"
                  value={histDate}
                  max={todayIsoLocal()}
                  disabled={histBusy}
                  onChange={e => setHistDate(e.target.value)}
                  aria-label="Historical date"
                  title="Pick a US-market session day"
                />
                <button
                  type="button"
                  className="chart-histday-btn"
                  onClick={() => void loadHistoricalDay()}
                  disabled={histBusy}
                  title="Fetch Alpaca bars for the chosen day and load into the chart"
                >
                  {histBusy ? '⟳ Loading…' : '⤓ Load Day'}
                </button>
                {/* One-click quick picks. Both call the same import pipeline
                    as the main "Load Day" button — they just pre-fill the
                    date based on the calendar position relative to now. */}
                <button
                  type="button"
                  className="chart-histday-btn chart-histday-quick"
                  onClick={() => {
                    const d = previousTradingDate()
                    setHistDate(d)
                    void loadHistoricalDayForDate(d)
                  }}
                  disabled={histBusy}
                  title="Load the previous trading day's full session"
                >
                  Yesterday
                </button>
                <button
                  type="button"
                  className="chart-histday-btn chart-histday-quick"
                  onClick={() => {
                    const d = mostRecentFridayDate()
                    setHistDate(d)
                    void loadHistoricalDayForDate(d)
                  }}
                  disabled={histBusy}
                  title="Load the most recent Friday's full session"
                >
                  Last Fri
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {histErr && (
        <div className="chart-histday-err" role="alert">
          <span>{histErr}</span>
          <button type="button" onClick={() => setHistErr(null)} aria-label="Dismiss error">×</button>
        </div>
      )}

      {histInfo && !histErr && (
        <div className="chart-histday-info" role="status">
          <span>{histInfo}</span>
          <button
            type="button"
            onClick={() => {
              setHistInfo(null)
              try { sessionStorage.setItem('satex.chart.no-creds-dismissed', '1') } catch { /* ignore */ }
            }}
            aria-label="Dismiss notice"
          >×</button>
        </div>
      )}

      {/* P0-1 — DeltaStrip directly above the chart shows net order-flow
          delta per 1-second candle in real time. The aggregator is fed via
          IPC trades-tick; FootprintAggregator handles the bid/ask split. */}
      <DeltaStrip symbol={symbol} height={28} label={`Δ · ${symbol}`} />

      <div className="chart-canvas-wrap">
        <div ref={containerRef} className="chart-canvas" />
        {inReplay && (
          <div className={`chart-replay-badge ${replayMode === 'paused' ? 'paused' : 'playing'}`} aria-hidden>
            <span className="lbl">HISTORICAL REPLAY</span>
            <span className="val">{replayDate ?? '—'}</span>
            {replayCursor && (
              <span className="cur">
                {new Date(replayCursor).toLocaleTimeString('en-US', { hour12: false })}
              </span>
            )}
          </div>
        )}
        <div className="chart-watermark">SATEX</div>

        {/* C13 / F2 — VPIN flow-toxicity overlay. Rendered only when the
            depth-feed's VPIN proxy crosses the threshold (default 0.8) so the
            chart stays clean during normal liquidity. Pointer-events:none so
            the overlay never intercepts crosshair / drag actions. */}
        {vpinHot && (
          <>
            <div className="chart-vpin-wash" aria-hidden />
            <div className="chart-vpin-badge" title="Volume-Synchronized Probability of Informed Trading — high values indicate toxic flow">
              ⚠ VPIN {vpinValue!.toFixed(2)} · TOXIC FLOW
            </div>
          </>
        )}

        {/* Indicator legend (Phase 11) — driven by useIndicatorStore. Hidden
            when no overlay is enabled so the chart canvas isn't cluttered. */}
        {(indSettings.enabled.ema
          || indSettings.enabled.rsi
          || indSettings.enabled.fibonacci
          || indSettings.enabled['pivot-points']
          || indSettings.enabled['double-top']
          || indSettings.enabled['double-bottom']) && (
          <div className="chart-ind-legend">
            {indSettings.enabled.ema && indSettings.emaPeriods.map(p => {
              // v0.6 Phase 3 — swatch + label both follow the active theme.
              // Classic appends the dominant regime; Mono/Bluyel hide that
              // suffix because EMA color is period-keyed, not regime-keyed
              // (the regime signal lives in the Regime Dashboard there).
              const { color: baseColor, opacity } = emaColorForPeriod(p, dominantRegime, theme, readCssVar)
              const swatchColor = applyOpacity(baseColor, opacity)
              const regimeSuffix = theme === 'classic' && dominantRegime ? ` · ${dominantRegime}` : ''
              return (
                <div className="row" key={`ema-${p}`}>
                  <span className="swatch" aria-hidden="true" style={{ background: swatchColor }} />
                  EMA {p}{regimeSuffix}
                </div>
              )
            })}
            {indSettings.enabled.rsi && (
              <div className="row">
                <span className="swatch" aria-hidden="true" style={{ background: applyOpacity(readCssVar('--bb-accent') || '#00c8ff', 0.88) }} />
                RSI {indSettings.rsiPeriod}
              </div>
            )}
            {indSettings.enabled.fibonacci && (
              <div className="row">
                <span className="swatch" aria-hidden="true" style={{ background: '#c9a04a' }} />
                FIB · {indSettings.fibLookback}b
              </div>
            )}
            {indSettings.enabled['pivot-points'] && (
              <div className="row">
                <span className="swatch" aria-hidden="true" style={{ background: 'rgba(0,200,255,0.95)' }} />
                PP {priorHlc ? `· ${priorHlc.date}` : '· awaiting'}
              </div>
            )}
            {indSettings.enabled['double-top'] && (
              <div className="row">
                <span className="swatch" aria-hidden="true" style={{ background: '#ff4655' }} />
                2T pattern
              </div>
            )}
            {indSettings.enabled['double-bottom'] && (
              <div className="row">
                <span className="swatch" aria-hidden="true" style={{ background: '#21c97a' }} />
                2B pattern
              </div>
            )}
          </div>
        )}

        {warnings.length > 0 && (
          <div className="chart-ind-warn">
            {warnings.map((w, i) => <div key={i}>{w}</div>)}
          </div>
        )}
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
