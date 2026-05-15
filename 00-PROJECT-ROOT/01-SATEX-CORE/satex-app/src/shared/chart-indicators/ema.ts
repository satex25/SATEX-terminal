/**
 * EMA series — full per-candle Exponential Moving Average.
 *
 * Formula: EMA_t = α · Price_t + (1−α) · EMA_{t−1}, where α = 2 / (N + 1).
 * Standard seed: SMA of first N closes; warm-up positions are NaN.
 *
 * Distinct from `shared/indicators.ts#ema` which returns only the latest
 * scalar — that one is used by the brain feature snapshot. Chart overlays
 * need the full series.
 */
import type { Candle, SeriesOutput } from './types'

export function emaSeries(candles: Candle[], period: number): SeriesOutput {
  const n = candles.length
  const values: number[] = new Array(n).fill(Number.NaN)

  if (period <= 0 || n === 0) return { label: `EMA(${period})`, values }

  // Need at least `period` candles for the SMA seed.
  if (n < period) return { label: `EMA(${period})`, values }

  const k = 2 / (period + 1)

  // SMA seed at index period-1.
  let sum = 0
  for (let i = 0; i < period; i++) sum += candles[i]!.close
  let ema = sum / period
  values[period - 1] = ema

  // Recurse forward.
  for (let i = period; i < n; i++) {
    ema = candles[i]!.close * k + ema * (1 - k)
    values[i] = ema
  }

  return { label: `EMA(${period})`, values }
}

/** Convenience: latest finite EMA value, or NaN if not enough data. */
export function emaLatest(candles: Candle[], period: number): number {
  const series = emaSeries(candles, period)
  for (let i = series.values.length - 1; i >= 0; i--) {
    const v = series.values[i]
    if (v !== undefined && Number.isFinite(v)) return v
  }
  return Number.NaN
}
