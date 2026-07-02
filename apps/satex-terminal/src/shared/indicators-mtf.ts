/**
 * SATEX — Multi-Timeframe Indicator Snapshots.
 *
 * Buckets a 1-minute candle history into N-minute windows and runs the
 * existing computeSnapshot on each. Used by Tier-2 strategies to inspect
 * the same instant on multiple horizons without each strategy duplicating
 * aggregation logic.
 *
 * Tier-2 Task E.1.
 */
import type { Candle, IndicatorSnapshot } from '@shared/types'
import { computeSnapshot } from './indicators'

export type Timeframe = '1m' | '5m' | '15m' | '1h'

export const TIMEFRAME_MINUTES: Record<Timeframe, number> = {
  '1m':  1,
  '5m':  5,
  '15m': 15,
  '1h':  60,
}

export interface MultiTimeframeSnapshot {
  symbol: string
  ts: number
  byTimeframe: Record<Timeframe, IndicatorSnapshot>
}

/** Aggregate 1-min candles into N-min buckets, aligned to clock boundaries
 *  in unix-seconds space (a 5-min bucket covers [t0..t0+300) for any t0 that
 *  is a multiple of 300). Each bucket's open is the first bar's open, close
 *  is the last bar's close, high/low are extremes, volume sums. */
export function bucketCandles(oneMinCandles: Candle[], periodMin: number): Candle[] {
  if (periodMin <= 1 || oneMinCandles.length === 0) return oneMinCandles
  const periodSec = periodMin * 60
  const out: Candle[] = []
  let current: Candle | null = null
  let bucketStart = 0
  for (const c of oneMinCandles) {
    const cBucketStart = Math.floor(c.time / periodSec) * periodSec
    if (current === null || cBucketStart !== bucketStart) {
      if (current) out.push(current)
      bucketStart = cBucketStart
      current = {
        time: cBucketStart,
        open: c.open, high: c.high, low: c.low, close: c.close,
        volume: c.volume,
      }
    } else {
      current.high = Math.max(current.high, c.high)
      current.low  = Math.min(current.low,  c.low)
      current.close = c.close
      current.volume += c.volume
    }
  }
  if (current) out.push(current)
  return out
}

/** Compute IndicatorSnapshots at all requested timeframes for the same
 *  symbol. Caller controls timeframe set so a strategy that only needs
 *  5m+15m doesn't pay for 1h computation. */
export function computeMultiTimeframe(
  symbol: string,
  oneMinCandles: Candle[],
  timeframes: Timeframe[] = ['1m', '5m', '15m', '1h'],
): MultiTimeframeSnapshot {
  const byTimeframe = {} as Record<Timeframe, IndicatorSnapshot>
  for (const tf of timeframes) {
    const bucketed = bucketCandles(oneMinCandles, TIMEFRAME_MINUTES[tf])
    byTimeframe[tf] = computeSnapshot(symbol, bucketed)
  }
  const lastCandle = oneMinCandles[oneMinCandles.length - 1]
  return {
    symbol,
    ts: lastCandle ? lastCandle.time * 1000 : 0,
    byTimeframe,
  }
}
