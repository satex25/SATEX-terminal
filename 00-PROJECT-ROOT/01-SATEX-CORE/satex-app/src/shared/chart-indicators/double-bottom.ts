/**
 * Double Bottom — bullish reversal pattern detection.
 *
 * Mirror of double-top: two swing-LOWS A and B within ≤3% of each other, with
 * a meaningful peak between them (the neckline at the highest high).
 * Confirmed when a subsequent candle closes ABOVE the neckline with volume
 * exceeding 1.5× recent average.
 */
import type { Candle, DoublePattern } from './types'
import { averageVolume, swingLows } from './swing-points'

export interface DoubleBottomOptions {
  tolerance?: number
  minSeparation?: number
  swingWindow?: number
  volumeMultiplier?: number
  volumeLookback?: number
}

export function detectDoubleBottoms(
  candles: Candle[],
  opts: DoubleBottomOptions = {},
): DoublePattern[] {
  const tolerance        = opts.tolerance        ?? 0.03
  const minSeparation    = opts.minSeparation    ?? 5
  const swingWindow      = opts.swingWindow      ?? 3
  const volumeMultiplier = opts.volumeMultiplier ?? 1.5
  const volumeLookback   = opts.volumeLookback   ?? 50

  const lows = swingLows(candles, swingWindow)
  const out: DoublePattern[] = []
  const avgVol = averageVolume(candles, volumeLookback)

  for (let i = 0; i < lows.length - 1; i++) {
    const a = lows[i]!
    for (let j = i + 1; j < lows.length; j++) {
      const b = lows[j]!
      if (b.index - a.index < minSeparation) continue
      const symmetry = Math.abs(b.price - a.price) / a.price
      if (symmetry > tolerance) continue

      // Neckline = highest high between A and B.
      let neckline = Number.NEGATIVE_INFINITY
      for (let k = a.index; k <= b.index; k++) {
        if (candles[k]!.high > neckline) neckline = candles[k]!.high
      }
      if (!Number.isFinite(neckline)) continue

      let breakIndex: number | null = null
      for (let k = b.index + 1; k < candles.length; k++) {
        const c = candles[k]!
        if (c.close > neckline && c.volume > avgVol * volumeMultiplier) {
          breakIndex = k
          break
        }
      }

      out.push({
        kind: 'double-bottom',
        pointA:    { index: a.index, price: a.price, time: a.time },
        pointB:    { index: b.index, price: b.price, time: b.time },
        neckline,
        volumeB:   b.volume,
        avgVolume: avgVol,
        symmetry,
        breakIndex,
      })
      break
    }
  }
  return out
}
