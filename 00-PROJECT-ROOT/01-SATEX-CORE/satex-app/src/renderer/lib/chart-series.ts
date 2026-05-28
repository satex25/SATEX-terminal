/**
 * SATEX — per-bar indicator series for chart overlays (2026-05-25).
 *
 * `@shared/indicators` returns scalar snapshots (the latest EMA / VWAP / RSI);
 * plotting an overlay needs the value at every bar. These pure helpers produce
 * the full series and are unit-tested without mounting a chart. Extracted from
 * the old hand-drawn QuadChartPanel so QuadPaneChart can reuse them verbatim.
 */
import type { Candle } from '@shared/types'

/** Exponential moving average at every bar. `out[i]` is the EMA through bar i.
 *  Seeds with the first close (standard for a from-scratch EMA). */
export function emaSeries(closes: readonly number[], period: number): number[] {
  if (closes.length === 0) return []
  const k = 2 / (period + 1)
  let prev = closes[0]!
  const out: number[] = [prev]
  for (let i = 1; i < closes.length; i++) {
    prev = closes[i]! * k + prev * (1 - k)
    out.push(prev)
  }
  return out
}

/** Cumulative (session) VWAP at every bar. Falls back to the typical price
 *  when cumulative volume is zero so an all-zero-volume series never NaNs. */
export function vwapSeries(candles: readonly Candle[]): number[] {
  let pv = 0, vv = 0
  return candles.map(c => {
    const typ = (c.high + c.low + c.close) / 3
    pv += typ * c.volume
    vv += c.volume
    return vv === 0 ? typ : pv / vv
  })
}

/** Returns candles with STRICTLY ASCENDING, UNIQUE `time` — what
 *  lightweight-charts `setData` requires. A same-time candle collapses to the
 *  latest (last-wins); a candle whose time goes backwards is dropped as stale.
 *
 *  The market store never sorts/dedupes its candle array (live append and bulk
 *  backfill both trust their source), so a single duplicate-second or
 *  out-of-order bar — e.g. an off-hours-backfill/live overlap — would otherwise
 *  throw "data must be asc ordered by time" and crash the pane. ChartPanel is
 *  immune because it bucket-aggregates before plotting; the Quad panes render
 *  raw 1s candles, so they sanitize here. */
export function toAscendingUniqueCandles(candles: readonly Candle[]): Candle[] {
  const out: Candle[] = []
  for (const c of candles) {
    const last = out[out.length - 1]
    if (!last || c.time > last.time) out.push(c)
    else if (c.time === last.time) out[out.length - 1] = c // same second -> latest wins
    // else c.time < last.time -> stale / out-of-order -> drop
  }
  return out
}
