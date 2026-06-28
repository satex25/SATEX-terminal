/**
 * SATEX — Alternative Chart Types (CHART-15)
 *
 * Pure OHLCV -> alt-type transforms for Renko, Line Break, and Kagi charts.
 * All transforms are:
 *  - Deterministic and stateless (given same input, same output).
 *  - Unit-tested with known fixtures.
 *  - Free of side effects, safe in main + renderer.
 *
 * Output `AltCandle` maps to LWC's candlestick series format so the
 * existing series creation path in ChartPanel can render alt types with
 * zero charting-library changes.
 */
import type { Candle } from '../types'

// ── Output type ───────────────────────────────────────────────────────────────

/** A candle in the normalized alt-chart output format.
 *  `time` is copied from the source candle that *opened* this bar. */
export interface AltCandle {
  time:   number
  open:   number
  high:   number
  low:    number
  close:  number
  volume: number
  /** true = bullish (close >= open), false = bearish. */
  bull:   boolean
}

// ── Renko ─────────────────────────────────────────────────────────────────────

export interface RenkoOptions {
  /** Fixed brick size in price units. Must be > 0. */
  brickSize: number
}

/**
 * Convert OHLCV candles to Renko bricks.
 *
 * Algorithm (standard fixed-brick Renko):
 *  - Walk candles oldest-to-newest.
 *  - Each candle's close is compared to the top/bottom of the last brick.
 *  - If close >= top + brickSize  → emit one or more up-bricks.
 *  - If close <= bottom - brickSize → emit one or more down-bricks.
 *  - Multiple bricks from one candle all share that candle's timestamp.
 *
 * Returns [] for empty input or brickSize <= 0.
 */
export function renkoTransform(
  candles: readonly Candle[],
  opts:    RenkoOptions,
): AltCandle[] {
  const { brickSize } = opts
  if (candles.length === 0 || brickSize <= 0) return []

  const result: AltCandle[] = []
  let lastHigh = candles[0]!.close
  let lastLow  = candles[0]!.close

  for (const candle of candles) {
    const { close, time, volume } = candle

    // Up bricks
    while (close >= lastHigh + brickSize) {
      const o = lastHigh
      const c = lastHigh + brickSize
      result.push({ time, open: o, high: c, low: o, close: c, volume, bull: true })
      lastHigh = c
      lastLow  = o
    }

    // Down bricks
    while (close <= lastLow - brickSize) {
      const o = lastLow
      const c = lastLow - brickSize
      result.push({ time, open: o, high: o, low: c, close: c, volume, bull: false })
      lastLow  = c
      lastHigh = o
    }
  }

  return result
}

// ── Line Break ────────────────────────────────────────────────────────────────

export interface LineBreakOptions {
  /** Number of prior lines that must be broken to create a new line. Default 3. */
  lineCount?: number
}

/**
 * Convert OHLCV candles to N-Line Break chart.
 *
 * Algorithm:
 *  - Maintain a window of the last N closing prices.
 *  - A new UP line is created when close > max(last N closes).
 *  - A new DOWN line is created when close < min(last N closes).
 *  - Otherwise, no new line (consolidation).
 *
 * Returns [] for empty input.
 */
export function lineBreakTransform(
  candles: readonly Candle[],
  opts:    LineBreakOptions = {},
): AltCandle[] {
  const n = Math.max(1, opts.lineCount ?? 3)
  if (candles.length === 0) return []

  const result: AltCandle[] = []
  // Seed: start with the first candle as our initial line
  const first = candles[0]!
  result.push({
    time:   first.time,
    open:   first.open,
    high:   Math.max(first.open, first.close),
    low:    Math.min(first.open, first.close),
    close:  first.close,
    volume: first.volume,
    bull:   first.close >= first.open,
  })

  for (let i = 1; i < candles.length; i++) {
    const candle  = candles[i]!
    const window_ = result.slice(-n)
    const closes  = window_.map((l) => l.close)
    const maxC    = Math.max(...closes)
    const minC    = Math.min(...closes)
    const lastLine = result[result.length - 1]!

    if (candle.close > maxC) {
      result.push({
        time:   candle.time,
        open:   lastLine.close,
        high:   candle.close,
        low:    lastLine.close,
        close:  candle.close,
        volume: candle.volume,
        bull:   true,
      })
    } else if (candle.close < minC) {
      result.push({
        time:   candle.time,
        open:   lastLine.close,
        high:   lastLine.close,
        low:    candle.close,
        close:  candle.close,
        volume: candle.volume,
        bull:   false,
      })
    }
    // else: no new line — consolidation
  }

  return result
}

// ── Kagi ──────────────────────────────────────────────────────────────────────

export interface KagiOptions {
  /**
   * Reversal amount — either:
   *   - A positive number: treated as a percentage of the last close (e.g., 0.01 = 1%).
   *   - Negative numbers are rejected (returns []).
   */
  reversalPct?: number
  /**
   * Fixed reversal price amount (takes precedence over reversalPct if both given).
   */
  reversalAmt?: number
}

/**
 * Convert OHLCV candles to a Kagi chart.
 *
 * Algorithm:
 *  - Direction starts as UP.
 *  - Extend the current line as long as price moves in direction.
 *  - Reverse when price moves against direction by >= reversal amount.
 *  - Each reversal emits a new AltCandle.
 *
 * Returns [] for empty input or invalid reversal parameters.
 */
export function kagiTransform(
  candles: readonly Candle[],
  opts:    KagiOptions = {},
): AltCandle[] {
  if (candles.length === 0) return []
  if ((opts.reversalAmt !== undefined && opts.reversalAmt <= 0) ||
      (opts.reversalPct !== undefined && opts.reversalPct <= 0)) return []

  const result: AltCandle[] = []
  let dir:       1 | -1 = 1   // 1 = up, -1 = down
  let lineStart: number  = candles[0]!.close
  let lineStartTime = candles[0]!.time
  let extreme:   number  = candles[0]!.close  // furthest in current dir
  let totalVol:  number  = 0

  for (const candle of candles) {
    const revAmt = opts.reversalAmt ??
      (opts.reversalPct !== undefined ? Math.abs(lineStart) * opts.reversalPct : Math.abs(lineStart) * 0.01)

    totalVol += candle.volume

    if (dir === 1) {
      if (candle.close > extreme) {
        extreme = candle.close
      } else if (candle.close <= extreme - revAmt) {
        // Reversal: emit current up line, switch to down
        result.push({
          time:   lineStartTime,
          open:   lineStart,
          high:   extreme,
          low:    lineStart,
          close:  extreme,
          volume: totalVol,
          bull:   true,
        })
        dir = -1
        lineStart     = extreme
        lineStartTime = candle.time
        extreme       = candle.close
        totalVol      = candle.volume
      }
    } else {
      if (candle.close < extreme) {
        extreme = candle.close
      } else if (candle.close >= extreme + revAmt) {
        // Reversal: emit current down line, switch to up
        result.push({
          time:   lineStartTime,
          open:   lineStart,
          high:   lineStart,
          low:    extreme,
          close:  extreme,
          volume: totalVol,
          bull:   false,
        })
        dir = 1
        lineStart     = extreme
        lineStartTime = candle.time
        extreme       = candle.close
        totalVol      = candle.volume
      }
    }
  }

  // Emit the final unclosed line
  if (result.length > 0 || candles.length > 0) {
    const bull = dir === 1
    result.push({
      time:   lineStartTime,
      open:   lineStart,
      high:   bull ? extreme : lineStart,
      low:    bull ? lineStart : extreme,
      close:  extreme,
      volume: totalVol,
      bull,
    })
  }

  return result
}
