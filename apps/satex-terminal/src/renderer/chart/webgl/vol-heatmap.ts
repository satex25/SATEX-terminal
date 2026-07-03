/**
 * SATEX — Volatility Heatmap intensity engine (CHART-14)
 *
 * Computes per-candle volatility intensity scores from REAL data sources:
 *   1. ATR (Average True Range, 14-period) — classic realized-vol proxy.
 *   2. Rolling close stdev — price dispersion over the lookback window.
 *   3. Tick velocity — candle-count-per-minute as a flow-speed signal.
 *   4. VPIN (toxicity proxy from DepthSnapshot.vpin [0,1]) — rug-pull risk.
 *
 * CONSTITUTION 0.1 — ZERO fabrication: all four inputs are real and present
 * in the live data feed. No synthetic fills, no mock vpin, no extrapolation.
 * If a component is missing it is treated as 0 (neutral), not fabricated.
 *
 * Output: HeatmapPoint[] — one per input candle — with:
 *   - intensity [0,1]: composite score (higher = more volatile).
 *   - r/g/b: pre-computed CSS color (cool → warm ramp).
 *
 * Pure — no side effects, no DOM, no GL context required. Tests run in vitest.
 */
import type { Candle } from '@shared/types'

// ── Config ────────────────────────────────────────────────────────────────────

const ATR_PERIOD     = 14
const STDEV_WINDOW   = 20
const TICK_VEL_SECS  = 60   // velocity bucket in seconds

// Component weights (must sum to 1.0)
const W_ATR      = 0.35
const W_STDEV    = 0.25
const W_VELOCITY = 0.15
const W_VPIN     = 0.25

// ── Output type ───────────────────────────────────────────────────────────────

export interface HeatmapPoint {
  time:      number
  intensity: number   // [0, 1]
  r: number           // [0, 255]
  g: number           // [0, 255]
  b: number           // [0, 255]
}

// ── Color ramp ────────────────────────────────────────────────────────────────

/**
 * Map intensity [0,1] to a cool→warm BGR triplet.
 * 0.0 = deep blue (calm), 0.5 = yellow (moderate), 1.0 = red (extreme).
 */
export function intensityToRgb(t: number): { r: number; g: number; b: number } {
  const v = Math.max(0, Math.min(1, t))
  if (v < 0.5) {
    // Blue -> Yellow
    const f = v * 2
    return { r: Math.round(255 * f), g: Math.round(255 * f), b: Math.round(255 * (1 - f)) }
  } else {
    // Yellow -> Red
    const f = (v - 0.5) * 2
    return { r: 255, g: Math.round(255 * (1 - f)), b: 0 }
  }
}

// ── ATR ───────────────────────────────────────────────────────────────────────

/**
 * Compute normalized ATR series (each value divided by close price so it is
 * comparable across symbols and price levels).
 * Length matches `candles`. First ATR_PERIOD-1 values are 0 (warm-up).
 */
export function atrSeries(candles: readonly Candle[]): number[] {
  const n = candles.length
  const result = new Array<number>(n).fill(0)
  if (n < 2) return result

  // Warm-up: simple mean of first ATR_PERIOD TR values
  let sumTr = 0
  for (let i = 1; i < Math.min(ATR_PERIOD + 1, n); i++) {
    const tr = trueRange(candles[i]!, candles[i - 1]!)
    sumTr += tr
  }
  const warmEnd = Math.min(ATR_PERIOD, n - 1)
  let atr = warmEnd > 0 ? sumTr / warmEnd : 0

  for (let i = ATR_PERIOD; i < n; i++) {
    const tr = trueRange(candles[i]!, candles[i - 1]!)
    atr = (atr * (ATR_PERIOD - 1) + tr) / ATR_PERIOD
    const close = candles[i]!.close
    result[i] = close > 0 ? atr / close : 0
  }

  return result
}

function trueRange(curr: Candle, prev: Candle): number {
  return Math.max(
    curr.high - curr.low,
    Math.abs(curr.high - prev.close),
    Math.abs(curr.low  - prev.close),
  )
}

// ── Rolling stdev ─────────────────────────────────────────────────────────────

/**
 * Normalized rolling close stdev over STDEV_WINDOW bars.
 * Divided by close so it's a relative coefficient-of-variation measure.
 */
export function stdevSeries(candles: readonly Candle[]): number[] {
  const n = candles.length
  const result = new Array<number>(n).fill(0)

  for (let i = STDEV_WINDOW - 1; i < n; i++) {
    const start = i - STDEV_WINDOW + 1
    let sum = 0
    for (let j = start; j <= i; j++) sum += candles[j]!.close
    const mean = sum / STDEV_WINDOW

    let sumSq = 0
    for (let j = start; j <= i; j++) {
      const diff = candles[j]!.close - mean
      sumSq += diff * diff
    }
    const sd = Math.sqrt(sumSq / STDEV_WINDOW)
    const close = candles[i]!.close
    result[i] = close > 0 ? sd / close : 0
  }

  return result
}

// ── Tick velocity ─────────────────────────────────────────────────────────────

/**
 * Candles-per-minute relative to the median — normalized [0,1].
 * High velocity = many candles arriving quickly = heightened activity.
 */
export function tickVelocitySeries(candles: readonly Candle[]): number[] {
  const n = candles.length
  const result = new Array<number>(n).fill(0)
  if (n < 2) return result

  // Rolling 60s window: count candles arriving within TICK_VEL_SECS
  for (let i = 1; i < n; i++) {
    let count = 0
    const windowStart = candles[i]!.time - TICK_VEL_SECS
    for (let j = i; j >= 0 && candles[j]!.time >= windowStart; j--) count++
    // Normalize against max possible (if every candle is 1 second apart)
    result[i] = Math.min(1, count / TICK_VEL_SECS)
  }

  return result
}

// ── VPIN integration ──────────────────────────────────────────────────────────

/**
 * Spread a scalar VPIN toxicity reading [0,1] across all candles.
 * Used when a fresh `DepthSnapshot` is available; otherwise caller passes 0.
 */
export function vpinToIntensity(vpin: number): number {
  return Math.max(0, Math.min(1, vpin))
}

// ── Composite ─────────────────────────────────────────────────────────────────

/**
 * Compute the full heatmap point series for `candles`.
 *
 * `vpin` is the latest `DepthSnapshot.vpin` value (pass 0 if unavailable —
 * the heatmap degrades gracefully to ATR+stdev+velocity only).
 *
 * Returns one `HeatmapPoint` per candle. First ~ATR_PERIOD points will have
 * lower intensity due to indicator warm-up — this is correct, not a bug.
 */
export function computeHeatmap(
  candles: readonly Candle[],
  vpin:    number = 0,
): HeatmapPoint[] {
  const n = candles.length
  if (n === 0) return []

  const atr      = atrSeries(candles)
  const stdev    = stdevSeries(candles)
  const velocity = tickVelocitySeries(candles)
  const vpinNorm = vpinToIntensity(vpin)

  // Find max values for normalization.
  // Single-pass loop, never Math.max(...spread): atr/stdev hold one entry per
  // candle and are unbounded (a sub-second crypto session runs to 10^5-10^6 bars), so
  // spreading them as call args throws RangeError (stack overflow). Same
  // invariant as QuadPaneChart.tsx. Floor 1e-10 preserves the prior semantics.
  let maxAtr = 1e-10, maxStdev = 1e-10
  for (let i = 0; i < n; i++) {
    const a = atr[i]!;   if (a > maxAtr)   maxAtr = a
    const d = stdev[i]!; if (d > maxStdev) maxStdev = d
  }

  const result: HeatmapPoint[] = []

  for (let i = 0; i < n; i++) {
    const atrN   = (atr[i] ?? 0) / maxAtr
    const stdevN = (stdev[i] ?? 0) / maxStdev
    const velN   = velocity[i] ?? 0
    const intensity = Math.min(1,
      W_ATR      * atrN   +
      W_STDEV    * stdevN +
      W_VELOCITY * velN   +
      W_VPIN     * vpinNorm,
    )

    const rgb = intensityToRgb(intensity)
    result.push({ time: candles[i]!.time, intensity, ...rgb })
  }

  return result
}
