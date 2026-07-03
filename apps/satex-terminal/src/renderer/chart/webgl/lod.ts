/**
 * SATEX — WebGL LOD (Level-of-Detail) bucketing (CHART-10)
 *
 * When zoomed out to thousands of bars but the chart is only ~1200px wide,
 * rendering every candle wastes GPU bandwidth. This module:
 *   1. Frustum-culls candles to the visible time range (± 5% padding).
 *   2. Merges them into at most `maxBuckets` bins via proper OHLCV aggregation.
 *
 * Proper OHLCV aggregation (never distorts data):
 *   open  = first candle's open in the bucket
 *   high  = max of all highs
 *   low   = min of all lows
 *   close = last candle's close
 *   volume = sum
 *   time  = first candle's time
 *
 * Pure — no side effects, safe in main + renderer + WebGL worker.
 */
import type { Candle } from '@shared/types'

// ── Frustum cull ──────────────────────────────────────────────────────────────

/** Visible time padding factor (5%). Prevents visual pop-in on pan/zoom. */
const FRUSTUM_PAD = 0.05

/**
 * Return the subset of `candles` within the visible time range ± 5% padding.
 * `candles` must be sorted oldest-first (standard data-feed order).
 * Binary-searches for the left bound, then slices.
 */
export function frustumCull(
  candles: readonly Candle[],
  fromTime: number,
  toTime:   number,
): readonly Candle[] {
  if (candles.length === 0) return candles
  const pad = (toTime - fromTime) * FRUSTUM_PAD
  const lo  = fromTime - pad
  const hi  = toTime   + pad

  // Binary search for first candle with time >= lo
  let left = 0
  let right = candles.length
  while (left < right) {
    const mid = (left + right) >>> 1
    if (candles[mid]!.time < lo) left = mid + 1
    else right = mid
  }

  // Slice from left to first candle beyond hi
  const start = left
  let end = start
  while (end < candles.length && candles[end]!.time <= hi) end++

  return candles.slice(start, end)
}

// ── LOD bucketing ─────────────────────────────────────────────────────────────

/**
 * Merge `candles` into at most `maxBuckets` aggregated candles using proper
 * OHLCV aggregation (open of first, max H, min L, close of last, sum V).
 *
 * If `candles.length <= maxBuckets`, returns the input array unchanged (no
 * unnecessary copy).
 */
export function lodBucket(
  candles:    readonly Candle[],
  maxBuckets: number,
): readonly Candle[] {
  const n = candles.length
  if (n === 0 || maxBuckets <= 0) return []
  if (n <= maxBuckets) return candles   // already sparse enough

  const result: Candle[] = []
  const step = n / maxBuckets

  for (let b = 0; b < maxBuckets; b++) {
    const startIdx = Math.floor(b * step)
    const endIdx   = Math.min(Math.floor((b + 1) * step), n)
    if (startIdx >= endIdx) continue

    const first = candles[startIdx]!
    let high   = first.high
    let low    = first.low
    let volume = 0

    for (let i = startIdx; i < endIdx; i++) {
      const c = candles[i]!
      if (c.high   > high)   high   = c.high
      if (c.low    < low)    low    = c.low
      volume += c.volume
    }

    const last = candles[endIdx - 1]!
    result.push({
      time:   first.time,
      open:   first.open,
      high,
      low,
      close:  last.close,
      volume,
    })
  }

  return result
}

// ── Combined pipeline ─────────────────────────────────────────────────────────

/**
 * Cull to visible range then bucket to `maxBuckets`.
 * This is the single call-site for the WebGL render pipeline.
 */
export function lodPipeline(
  candles:    readonly Candle[],
  fromTime:   number,
  toTime:     number,
  maxBuckets: number,
): readonly Candle[] {
  const culled = frustumCull(candles, fromTime, toTime)
  return lodBucket(culled, maxBuckets)
}
