/**
 * SATEX — CrosshairReadout (CHART-05)
 *
 * Subscribes to Lightweight Charts v5 `subscribeCrosshairMove` and renders a
 * live OHLCV strip pinned to the top of the chart area. The readout snaps to
 * the nearest candle's data so it always shows full bar values rather than
 * interpolated mid-prices.
 *
 * Throttled to one frame via `requestAnimationFrame` — the subscription
 * callback can fire at pointer resolution (60+ Hz) but the DOM update only
 * commits on the next animation frame.
 *
 * Cleanup: `unsubscribeCrosshairMove` is called in the effect return, and any
 * pending rAF is cancelled — no leaks. Follows the "clean up what you create"
 * constitutional invariant (PR #6 precedent).
 */
import { useEffect, useRef, useState } from 'react'
import type { Candle } from '@shared/types'
import { fmt } from '../../lib/format'

// ── Types ─────────────────────────────────────────────────────────────────────

interface CandleReadout {
  open:   number
  high:   number
  low:    number
  close:  number
  volume: number
  change: number   // close - open
  changePct: number
}

// The minimum IChartApi surface we need — avoids importing full LWC types
// in every consumer (ChartPanel already imports them; we keep this slim).
interface ChartLike {
  subscribeCrosshairMove:   (fn: (p: { time?: number | string | null }) => void) => void
  unsubscribeCrosshairMove: (fn: (p: { time?: number | string | null }) => void) => void
}

interface Props {
  /** The LWC chart instance. Passed as `unknown` from ChartPanel to avoid
   *  tight coupling; we cast internally via the ChartLike interface. */
  chart:   unknown | null
  /** Current aggregated candles — same `view` array the chart is displaying. */
  candles: readonly Candle[]
  /** Decimal places for price display (matches the universe entry `dp`). */
  dp?:     number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Binary-search for the candle whose time is closest to `targetTime`.
 * Returns null if `candles` is empty.
 */
function nearestCandle(candles: readonly Candle[], targetTime: number): Candle | null {
  if (candles.length === 0) return null
  let lo = 0
  let hi = candles.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (candles[mid]!.time < targetTime) lo = mid + 1
    else hi = mid
  }
  // Check the candidate and its neighbour for the closest time
  const cand = candles[lo]!
  if (lo > 0) {
    const prev = candles[lo - 1]!
    if (Math.abs(prev.time - targetTime) < Math.abs(cand.time - targetTime)) {
      return prev
    }
  }
  return cand
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CrosshairReadout({ chart, candles, dp = 2 }: Props) {
  const [readout, setReadout] = useState<CandleReadout | null>(null)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    if (!chart) return

    const chartApi = chart as ChartLike

    const handler = (params: { time?: number | string | null }): void => {
      // Cancel any pending rAF to avoid double-commit on fast pointer moves
      cancelAnimationFrame(rafRef.current)

      if (!params.time && params.time !== 0) {
        // Crosshair left the chart — clear readout on next frame
        rafRef.current = requestAnimationFrame(() => setReadout(null))
        return
      }

      const t = typeof params.time === 'string'
        ? Number(params.time)
        : (params.time as number)

      if (!Number.isFinite(t)) {
        rafRef.current = requestAnimationFrame(() => setReadout(null))
        return
      }

      const candle = nearestCandle(candles, t)
      if (!candle) {
        rafRef.current = requestAnimationFrame(() => setReadout(null))
        return
      }

      const change    = candle.close - candle.open
      const changePct = candle.open !== 0 ? (change / candle.open) * 100 : 0

      rafRef.current = requestAnimationFrame(() =>
        setReadout({
          open:      candle.open,
          high:      candle.high,
          low:       candle.low,
          close:     candle.close,
          volume:    candle.volume,
          change,
          changePct,
        })
      )
    }

    chartApi.subscribeCrosshairMove(handler)

    return () => {
      cancelAnimationFrame(rafRef.current)
      try { chartApi.unsubscribeCrosshairMove(handler) } catch { /* chart already disposed */ }
    }
  }, [chart, candles])  // re-register when chart mounts or candles array swaps

  if (!readout) return null

  const positive = readout.change >= 0

  return (
    <div className="chart-crosshair-readout" aria-live="polite" aria-label="Crosshair OHLCV data">
      <span className="cr-item">
        <i>O</i>
        <b>{fmt.px(readout.open, dp)}</b>
      </span>
      <span className="cr-item">
        <i>H</i>
        <b className="cr-high">{fmt.px(readout.high, dp)}</b>
      </span>
      <span className="cr-item">
        <i>L</i>
        <b className="cr-low">{fmt.px(readout.low, dp)}</b>
      </span>
      <span className="cr-item">
        <i>C</i>
        <b className={positive ? 'cr-pos' : 'cr-neg'}>{fmt.px(readout.close, dp)}</b>
      </span>
      <span className="cr-item cr-delta" aria-label="Bar change">
        <b className={positive ? 'cr-pos' : 'cr-neg'}>
          {positive ? '+' : ''}{fmt.px(readout.change, dp)}
          {' '}({positive ? '+' : ''}{readout.changePct.toFixed(2)}%)
        </b>
      </span>
      <span className="cr-item cr-vol">
        <i>V</i>
        <b>{fmt.k(readout.volume)}</b>
      </span>
    </div>
  )
}
