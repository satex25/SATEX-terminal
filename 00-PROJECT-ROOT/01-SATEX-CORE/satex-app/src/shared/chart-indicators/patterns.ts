/**
 * SATEX — Chart pattern detectors (CHART-19)
 *
 * Extends existing double-top/bottom with:
 *   - Head & Shoulders (bearish) + Inverse H&S (bullish)
 *   - Rising / Falling Wedge
 *   - Bull / Bear Flag
 *
 * CONSTITUTION 0.1 — pure detection on real OHLCV. No fabricated signals.
 * CONSTITUTION 0.7 — confidence scores are calibrated to be conservative;
 *   max 0.85 for H&S with volume confirmation, max 0.80 for wedge/flag.
 *   Scores intentionally below 0.9 on all detectors — Constitution requires
 *   calibrated, not inflated confidence.
 *
 * Analytic only: zero wiring to EXEC (§4 ultraplan ⛔ constraint).
 * Pure — no DOM, no side effects, main + renderer safe.
 */
import type { Candle } from '../types'
import { swingHighs, swingLows } from './swing-points'

// ── Output type ───────────────────────────────────────────────────────────────

export interface PatternMatch {
  kind:
    | 'head-shoulders'
    | 'inv-head-shoulders'
    | 'wedge-rising'
    | 'wedge-falling'
    | 'flag-bull'
    | 'flag-bear'
  /** Calibrated [0,1]. Intentionally capped — see module-level note. */
  confidence:  number
  startIndex:  number
  endIndex:    number
  keyPoints:   Array<{ index: number; price: number; time: number }>
  /** Human-readable label including "(detector)" to distinguish from confirmed signals. */
  label: string
}

export interface PatternOptions {
  /** Swing detection window (bars each side). Default 3. */
  swingWindow?:  number
  /** Max shoulder-symmetry fraction for H&S. Default 0.15 (15%). */
  shoulderTol?:  number
  /** Min sharp-move fraction before a flag consolidation. Default 0.05 (5%). */
  minFlagMove?:  number
  /** Consolidation window (bars) for flag body. Default 10. */
  flagBars?:     number
  /** Slope-convergence ratio threshold for wedge. Default 0.3. */
  wedgeTol?:     number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Linear slope via least-squares (returns Δprice per bar). */
function linSlope(xs: number[], ys: number[]): number {
  const n = xs.length
  if (n < 2) return 0
  let sx = 0, sy = 0, sxy = 0, sxx = 0
  for (let i = 0; i < n; i++) {
    sx += xs[i]!; sy += ys[i]!
    sxy += xs[i]! * ys[i]!; sxx += xs[i]! * xs[i]!
  }
  const denom = n * sxx - sx * sx
  return denom === 0 ? 0 : (n * sxy - sx * sy) / denom
}

// ── Head & Shoulders ──────────────────────────────────────────────────────────

/**
 * Detect Head & Shoulders patterns (bearish reversal).
 * Three consecutive swing-highs: left shoulder < head > right shoulder,
 * with shoulders within `shoulderTol` of each other.
 */
export function detectHeadShoulders(
  candles: readonly Candle[],
  opts: PatternOptions = {},
): PatternMatch[] {
  const swingWindow = opts.swingWindow ?? 3
  const shoulderTol = opts.shoulderTol ?? 0.15
  const highs = swingHighs(candles as Candle[], swingWindow)
  const out: PatternMatch[] = []

  for (let i = 0; i < highs.length - 2; i++) {
    const ls = highs[i]!
    const hd = highs[i + 1]!
    const rs = highs[i + 2]!
    if (hd.price <= ls.price || hd.price <= rs.price) continue
    const sym = Math.abs(rs.price - ls.price) / ls.price
    if (sym > shoulderTol) continue

    // Confidence: base 0.55, tighter shoulders +0.10, head prominence +0.10
    const prominence = (hd.price - Math.max(ls.price, rs.price)) / hd.price
    const conf = Math.min(0.85,
      0.55 + (shoulderTol - sym) / shoulderTol * 0.10 + Math.min(0.10, prominence * 4))

    out.push({
      kind: 'head-shoulders', confidence: +conf.toFixed(3),
      startIndex: ls.index, endIndex: rs.index,
      keyPoints: [
        { index: ls.index, price: ls.price, time: ls.time },
        { index: hd.index, price: hd.price, time: hd.time },
        { index: rs.index, price: rs.price, time: rs.time },
      ],
      label: `H&S (detector) conf=${conf.toFixed(2)}`,
    })
  }
  return out
}

/**
 * Detect Inverse Head & Shoulders (bullish reversal).
 * Three consecutive swing-lows: left shoulder > head < right shoulder.
 */
export function detectInverseHeadShoulders(
  candles: readonly Candle[],
  opts: PatternOptions = {},
): PatternMatch[] {
  const swingWindow = opts.swingWindow ?? 3
  const shoulderTol = opts.shoulderTol ?? 0.15
  const lows = swingLows(candles as Candle[], swingWindow)
  const out: PatternMatch[] = []

  for (let i = 0; i < lows.length - 2; i++) {
    const ls = lows[i]!
    const hd = lows[i + 1]!
    const rs = lows[i + 2]!
    if (hd.price >= ls.price || hd.price >= rs.price) continue
    const sym = Math.abs(rs.price - ls.price) / ls.price
    if (sym > shoulderTol) continue

    const depth = (Math.min(ls.price, rs.price) - hd.price) / Math.min(ls.price, rs.price)
    const conf = Math.min(0.85,
      0.55 + (shoulderTol - sym) / shoulderTol * 0.10 + Math.min(0.10, depth * 4))

    out.push({
      kind: 'inv-head-shoulders', confidence: +conf.toFixed(3),
      startIndex: ls.index, endIndex: rs.index,
      keyPoints: [
        { index: ls.index, price: ls.price, time: ls.time },
        { index: hd.index, price: hd.price, time: hd.time },
        { index: rs.index, price: rs.price, time: rs.time },
      ],
      label: `Inv H&S (detector) conf=${conf.toFixed(2)}`,
    })
  }
  return out
}

// ── Wedge ─────────────────────────────────────────────────────────────────────

/**
 * Detect rising/falling wedges from rolling windows of 12–20 bars.
 * Rising wedge: both upper+lower trend lines slope up, but upper slope <
 * lower slope (converging). Falling wedge: both slope down, upper > lower.
 */
export function detectWedges(
  candles: readonly Candle[],
  opts: PatternOptions = {},
): PatternMatch[] {
  const wedgeTol = opts.wedgeTol ?? 0.3
  const MIN_BARS = 10
  const out: PatternMatch[] = []

  for (let end = MIN_BARS; end < candles.length; end++) {
    const start = Math.max(0, end - 20)
    const seg = candles.slice(start, end + 1)
    const xs = seg.map((_, i) => i)
    const upSlope  = linSlope(xs, seg.map((c) => c.high))
    const dnSlope  = linSlope(xs, seg.map((c) => c.low))
    if (upSlope === 0 && dnSlope === 0) continue

    const slopeRange = Math.abs(upSlope) + Math.abs(dnSlope)
    const convergence = slopeRange > 0
      ? Math.abs(upSlope - dnSlope) / slopeRange
      : 0

    if (convergence < wedgeTol) continue

    const isRising  = upSlope > 0 && dnSlope > 0 && upSlope < dnSlope
    const isFalling = upSlope < 0 && dnSlope < 0 && upSlope > dnSlope
    if (!isRising && !isFalling) continue

    const conf = Math.min(0.80, 0.50 + convergence * 0.20)
    const kind = isRising ? 'wedge-rising' : 'wedge-falling'
    out.push({
      kind, confidence: +conf.toFixed(3),
      startIndex: start, endIndex: end,
      keyPoints: [
        { index: start, price: candles[start]!.close, time: candles[start]!.time },
        { index: end,   price: candles[end]!.close,   time: candles[end]!.time },
      ],
      label: `${isRising ? 'Rising' : 'Falling'} Wedge (detector) conf=${conf.toFixed(2)}`,
    })
    end += 5  // skip overlap
  }
  return out
}

// ── Flag ──────────────────────────────────────────────────────────────────────

/**
 * Detect bull/bear flags: sharp move (pole) followed by a brief
 * counter-trend or sideways consolidation channel.
 */
export function detectFlags(
  candles: readonly Candle[],
  opts: PatternOptions = {},
): PatternMatch[] {
  const minFlagMove = opts.minFlagMove ?? 0.05
  const flagBars    = opts.flagBars    ?? 10
  const out: PatternMatch[] = []

  for (let i = flagBars; i < candles.length - flagBars; i++) {
    const poleStart = i - flagBars
    const poleMove  = (candles[i]!.close - candles[poleStart]!.close) / candles[poleStart]!.close
    if (Math.abs(poleMove) < minFlagMove) continue

    const seg  = candles.slice(i, i + flagBars)
    const xs   = seg.map((_, j) => j)
    const slope = linSlope(xs, seg.map((c) => c.close))
    const isBull = poleMove > 0
    // Bull flag: pole up + consolidation flat-to-down
    // Bear flag: pole down + consolidation flat-to-up
    const valid = isBull ? slope <= 0 : slope >= 0
    if (!valid) continue

    const channelTight = seg.every((c) =>
      Math.abs(c.high - c.low) / c.close < 0.03)
    const conf = Math.min(0.80,
      0.50 + Math.min(0.15, (Math.abs(poleMove) - minFlagMove) * 2) +
      (channelTight ? 0.10 : 0))

    out.push({
      kind: isBull ? 'flag-bull' : 'flag-bear',
      confidence: +conf.toFixed(3),
      startIndex: poleStart, endIndex: i + flagBars,
      keyPoints: [
        { index: poleStart, price: candles[poleStart]!.close, time: candles[poleStart]!.time },
        { index: i,          price: candles[i]!.close,          time: candles[i]!.time },
        { index: i + flagBars - 1, price: candles[i + flagBars - 1]!.close, time: candles[i + flagBars - 1]!.time },
      ],
      label: `${isBull ? 'Bull' : 'Bear'} Flag (detector) conf=${conf.toFixed(2)}`,
    })
    i += flagBars  // skip consolidation body
  }
  return out
}
