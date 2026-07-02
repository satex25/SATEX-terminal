/**
 * Fibonacci Retracement — levels between the highest high and lowest low
 * in a fixed-lookback window. Uses fixed lookback (not adaptive) per the
 * spec's mitigation: "use fixed lookback (e.g., last 50 bars) for swing
 * detection, not adaptive."
 *
 * Standard ratios: 23.6%, 38.2%, 50.0%, 61.8%, 78.6%.
 * Direction matters: if the most recent extreme is the high, we're in a
 * pullback (retracement from the high down) — levels measured downward from
 * the high. If the most recent extreme is the low, it's a rally — levels
 * measured upward from the low.
 */
import type { Candle, LevelsOutput, PriceLevel } from './types'
import { FIB_RATIOS } from './types'

export interface FibonacciOptions {
  /** Number of bars to scan for the high/low anchor pair. Default 50. */
  lookback?: number
}

export function computeFibonacci(
  candles: Candle[],
  opts: FibonacciOptions = {},
): LevelsOutput {
  const lookback = opts.lookback ?? 50
  const n = candles.length
  if (n === 0) return { computedFromIndex: 0, levels: [] }

  const start = Math.max(0, n - lookback)

  let highIdx = start
  let lowIdx = start
  for (let i = start; i < n; i++) {
    if (candles[i]!.high > candles[highIdx]!.high) highIdx = i
    if (candles[i]!.low  < candles[lowIdx]!.low)   lowIdx  = i
  }

  const high = candles[highIdx]!.high
  const low  = candles[lowIdx]!.low
  const range = high - low
  if (range <= 0) return { computedFromIndex: start, levels: [] }

  // Direction: if high came after low → uptrend, fibs are retracements down
  // from high. Else downtrend, fibs are retracements up from low.
  const uptrend = highIdx > lowIdx
  const levels: PriceLevel[] = []
  for (const ratio of FIB_RATIOS) {
    const price = uptrend
      ? high - range * ratio   // retracing down from high
      : low  + range * ratio   // retracing up from low
    levels.push({
      label: `Fib ${(ratio * 100).toFixed(1)}%`,
      price,
      role: 'fib',
    })
  }

  return { computedFromIndex: start, levels }
}
