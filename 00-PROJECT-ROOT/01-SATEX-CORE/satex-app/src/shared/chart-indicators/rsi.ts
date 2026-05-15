/**
 * RSI series — full per-candle Relative Strength Index using Wilder smoothing.
 *
 * Formula:
 *   gain_i = max(close_i − close_{i−1}, 0)
 *   loss_i = max(close_{i−1} − close_i, 0)
 *   AvgGain_period = SMA of first `period` gains
 *   AvgLoss_period = SMA of first `period` losses
 *   AvgGain_t = (AvgGain_{t−1} × (period−1) + gain_t) / period   (Wilder)
 *   AvgLoss_t = (AvgLoss_{t−1} × (period−1) + loss_t) / period
 *   RS = AvgGain / AvgLoss
 *   RSI = 100 − 100 / (1 + RS)   (when AvgLoss > 0, else 100)
 *
 * Warm-up positions are NaN (need at least `period + 1` candles).
 */
import type { Candle, SeriesOutput } from './types'

export function rsiSeries(candles: Candle[], period = 14): SeriesOutput {
  const n = candles.length
  const values: number[] = new Array(n).fill(Number.NaN)
  if (n < period + 1 || period <= 0) return { label: `RSI(${period})`, values }

  // Seed: SMA of first `period` gains and losses (using closes 0..period).
  let sumGain = 0
  let sumLoss = 0
  for (let i = 1; i <= period; i++) {
    const diff = candles[i]!.close - candles[i - 1]!.close
    if (diff >= 0) sumGain += diff
    else sumLoss += -diff
  }
  let avgGain = sumGain / period
  let avgLoss = sumLoss / period
  values[period] = rsiFromAvgs(avgGain, avgLoss)

  // Wilder smoothing forward.
  for (let i = period + 1; i < n; i++) {
    const diff = candles[i]!.close - candles[i - 1]!.close
    const gain = diff >= 0 ? diff : 0
    const loss = diff < 0 ? -diff : 0
    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period
    values[i] = rsiFromAvgs(avgGain, avgLoss)
  }
  return { label: `RSI(${period})`, values }
}

function rsiFromAvgs(avgGain: number, avgLoss: number): number {
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100
  const rs = avgGain / avgLoss
  return 100 - 100 / (1 + rs)
}
