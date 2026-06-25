/**
 * SATEX — Realized volatility surface (CHART-16)
 *
 * CONFIRM-OPT outcome: no options/IV data source found in the feed
 * (live-market.ts has no greeks/chain endpoint; Alpaca Basic does not carry
 * options IV). Therefore this module builds a REALIZED-volatility surface from
 * OHLCV data only, per the ultraplan §3.10 fallback contract.
 *
 * Axes:
 *   X = lookback window (bars): one of [5, 10, 20, 50, 100]
 *   Y = timeframe factor (applied by the caller to scale to actual time)
 *   Z = annualized realized volatility (%)
 *
 * Algorithm: rolling log-return standard deviation, annualized.
 *   σ(n) = stdev of log(close[i]/close[i-1]) over last n bars
 *   annualized = σ(n) × sqrt(periodsPerYear)
 *
 * Zero fabrication: if IV becomes available in the future, replace `logReturnStdev`
 * with IV inputs — the surface shape remains forward-compatible.
 *
 * Pure — no DOM, no side effects.
 */
import type { Candle } from '../types'

// ── Config ────────────────────────────────────────────────────────────────────

/** Lookback windows (bars) for the surface X-axis. */
export const VOL_LOOKBACKS = [5, 10, 20, 50, 100] as const
export type VolLookback = (typeof VOL_LOOKBACKS)[number]

// ── Output types ──────────────────────────────────────────────────────────────

export interface VolSurfacePoint {
  lookback:          VolLookback
  /** Annualized realized vol as a decimal (0.20 = 20%). */
  realizedVol:       number
  /** Source: always "realized-ohlcv" until IV feed added. */
  source:            'realized-ohlcv'
}

export interface RealizedVolSurface {
  /** Timestamp of the most recent candle used. */
  asOf:   number
  points: VolSurfacePoint[]
  /** Explicit no-IV note — UI must display "(realized, no IV feed)". */
  ivNote: 'no-iv-source'
}

// ── Math ──────────────────────────────────────────────────────────────────────

/**
 * Rolling standard deviation of log-returns over `window` bars ending at
 * index `endIdx`. Returns 0 for insufficient data.
 */
export function logReturnStdev(
  candles: readonly Candle[],
  endIdx:  number,
  window:  number,
): number {
  if (window < 2 || endIdx < window) return 0
  const start = endIdx - window + 1
  const returns: number[] = []
  for (let i = start; i <= endIdx; i++) {
    const prev = candles[i - 1]?.close
    const curr = candles[i]?.close
    if (!prev || !curr || prev <= 0) continue
    returns.push(Math.log(curr / prev))
  }
  const n = returns.length
  if (n < 2) return 0

  const mean = returns.reduce((s, v) => s + v, 0) / n
  const variance = returns.reduce((s, v) => s + (v - mean) ** 2, 0) / n
  return Math.sqrt(variance)
}

/**
 * Annualize a per-bar stdev given the number of bars per year for this
 * timeframe (e.g. 252 for daily, 252*6.5*60 for 1m).
 */
export function annualize(stdev: number, periodsPerYear: number): number {
  return stdev * Math.sqrt(Math.max(0, periodsPerYear))
}

// ── Surface builder ───────────────────────────────────────────────────────────

/**
 * Compute a realized-vol surface slice for the most recent candle.
 *
 * `periodsPerYear` — caller provides based on the chart timeframe:
 *   Daily (1D): 252   Hourly (1H): 252×6.5  1-minute: 252×6.5×60
 */
export function computeVolSurface(
  candles:         readonly Candle[],
  periodsPerYear:  number,
): RealizedVolSurface {
  const n = candles.length
  if (n === 0) return { asOf: 0, points: [], ivNote: 'no-iv-source' }

  const endIdx = n - 1
  const asOf   = candles[endIdx]!.time

  const points: VolSurfacePoint[] = VOL_LOOKBACKS.map((lookback) => {
    const stdev = logReturnStdev(candles, endIdx, lookback)
    const rv    = annualize(stdev, periodsPerYear)
    return { lookback, realizedVol: rv, source: 'realized-ohlcv' as const }
  })

  return { asOf, points, ivNote: 'no-iv-source' }
}

/**
 * Return an array of `RealizedVolSurface` slices — one per candle — so the
 * UI can animate the surface evolving over time.
 *
 * Skips the first `max(VOL_LOOKBACKS)` candles (warm-up).
 */
export function computeVolSurfaceHistory(
  candles:        readonly Candle[],
  periodsPerYear: number,
): RealizedVolSurface[] {
  const warmup = VOL_LOOKBACKS[VOL_LOOKBACKS.length - 1] ?? 100
  const result: RealizedVolSurface[] = []

  for (let i = warmup; i < candles.length; i++) {
    const slice = candles.slice(0, i + 1)
    result.push(computeVolSurface(slice, periodsPerYear))
  }
  return result
}
