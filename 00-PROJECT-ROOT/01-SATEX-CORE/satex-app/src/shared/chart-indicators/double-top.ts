/**
 * Double Top — bearish reversal pattern detection.
 *
 * Definition: two swing-highs A and B within ≤3% of each other (default
 * tolerance 0.03), with a meaningful trough between them (the neckline).
 * Pattern is "confirmed" when a subsequent candle closes below the neckline
 * AND its volume exceeds 1.5× recent average.
 *
 * Implementation: pure detection — scans swing highs, returns all qualifying
 * pairs along with the index where the neckline was broken (if any).
 * Caller decides what to do with the pattern (draw, alert, score conviction).
 */
import type { Candle, DoublePattern } from './types'
import { averageVolume, swingHighs } from './swing-points'

export interface DoubleTopOptions {
  /** Maximum |priceA − priceB| / priceA. Spec: 1–3% (default 0.03). */
  tolerance?: number
  /** Bars between A and B at minimum. Prevents adjacent peaks from registering. */
  minSeparation?: number
  /** Swing-detection window size. */
  swingWindow?: number
  /** Volume confirmation multiplier on breakout. Spec: >1.5×. */
  volumeMultiplier?: number
  /** Lookback for average volume baseline. */
  volumeLookback?: number
}

export function detectDoubleTops(
  candles: Candle[],
  opts: DoubleTopOptions = {},
): DoublePattern[] {
  const tolerance        = opts.tolerance        ?? 0.03
  const minSeparation    = opts.minSeparation    ?? 5
  const swingWindow      = opts.swingWindow      ?? 3
  const volumeMultiplier = opts.volumeMultiplier ?? 1.5
  const volumeLookback   = opts.volumeLookback   ?? 50

  const highs = swingHighs(candles, swingWindow)
  const out: DoublePattern[] = []
  const avgVol = averageVolume(candles, volumeLookback)

  for (let i = 0; i < highs.length - 1; i++) {
    const a = highs[i]!
    for (let j = i + 1; j < highs.length; j++) {
      const b = highs[j]!
      if (b.index - a.index < minSeparation) continue
      const denom = Math.abs(a.price)
      if (denom === 0) continue
      const symmetry = Math.abs(b.price - a.price) / denom
      if (symmetry > tolerance) continue

      // Neckline = lowest low between A and B.
      let neckline = Number.POSITIVE_INFINITY
      for (let k = a.index; k <= b.index; k++) {
        if (candles[k]!.low < neckline) neckline = candles[k]!.low
      }
      if (!Number.isFinite(neckline)) continue

      // Check for confirmed neckline break: any candle AFTER B closing below
      // neckline with volume > volumeMultiplier × avgVol.
      let breakIndex: number | null = null
      for (let k = b.index + 1; k < candles.length; k++) {
        const c = candles[k]!
        if (c.close < neckline && c.volume > avgVol * volumeMultiplier) {
          breakIndex = k
          break
        }
      }

      out.push({
        kind: 'double-top',
        pointA:    { index: a.index, price: a.price, time: a.time },
        pointB:    { index: b.index, price: b.price, time: b.time },
        neckline,
        volumeB:   b.volume,
        avgVolume: avgVol,
        symmetry,
        breakIndex,
      })

      // First B that pairs with A is the strongest candidate — stop searching
      // later B's for this A so we don't flood the output with permutations.
      break
    }
  }
  return out
}
