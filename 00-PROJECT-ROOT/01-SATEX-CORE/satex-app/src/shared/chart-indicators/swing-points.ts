/**
 * Swing-point detection — shared primitive for Double Top / Double Bottom
 * pattern recognition and Fibonacci anchor selection.
 *
 * A swing-high at index i: candles[i].high > candles[j].high for all j in
 * (i−window, i+window). Symmetric definition for swing-low using .low.
 * Endpoints (closer than `window` to either edge) are not swings — they can't
 * be verified.
 */
import type { Candle } from './types'

export interface SwingPoint {
  index: number
  price: number
  time: number
  /** Volume at the swing bar — useful for pattern volume confirmation. */
  volume: number
}

export function swingHighs(candles: Candle[], window = 3): SwingPoint[] {
  const out: SwingPoint[] = []
  const n = candles.length
  for (let i = window; i < n - window; i++) {
    const h = candles[i]!.high
    let isHigh = true
    for (let j = i - window; j <= i + window; j++) {
      if (j === i) continue
      if (candles[j]!.high >= h) { isHigh = false; break }
    }
    if (isHigh) out.push({ index: i, price: h, time: candles[i]!.time, volume: candles[i]!.volume })
  }
  return out
}

export function swingLows(candles: Candle[], window = 3): SwingPoint[] {
  const out: SwingPoint[] = []
  const n = candles.length
  for (let i = window; i < n - window; i++) {
    const l = candles[i]!.low
    let isLow = true
    for (let j = i - window; j <= i + window; j++) {
      if (j === i) continue
      if (candles[j]!.low <= l) { isLow = false; break }
    }
    if (isLow) out.push({ index: i, price: l, time: candles[i]!.time, volume: candles[i]!.volume })
  }
  return out
}

/** Average volume over the most recent `lookback` candles. Used to confirm
 *  pattern breakouts (spec calls for >1.5× avg on confirmation). */
export function averageVolume(candles: Candle[], lookback = 50): number {
  const n = candles.length
  if (n === 0) return 0
  const start = Math.max(0, n - lookback)
  let sum = 0
  let count = 0
  for (let i = start; i < n; i++) {
    sum += candles[i]!.volume
    count++
  }
  return count === 0 ? 0 : sum / count
}
