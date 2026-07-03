/**
 * ensemble-fuser.ts — L1.F Regime-aware ensemble confidence fusion
 *
 * Pure module: no side-effects, no I/O, fully unit-testable.
 *
 * Sits between brain.decide() and calibration.calibrate() in getAiDecision().
 * Scales brain confidence by a regime × alignment multiplier before calibration
 * so the calibrator receives an already regime-adjusted signal.
 *
 * Multiplier table:
 *
 *   Regime      | isAlignedWithRegime  | Multiplier | Rationale
 *   ------------|----------------------|------------|-----------------------------
 *   trend_up    | true (bullish)       | × 1.20     | Trend-following — amplify
 *   trend_up    | false (bearish)      | × 0.65     | Counter-trend — penalise
 *   trend_down  | true (bearish)       | × 1.20     | Trend-following — amplify
 *   trend_down  | false (bullish)      | × 0.65     | Counter-trend — penalise
 *   range       | true (mean-rev EMA)  | × 1.10     | Counter-trend EMA = mean-rev
 *   range       | false (trend EMA)    | × 0.75     | Trend signal in range = fade
 *   chop/unknown| any                  | pass-through| No regime edge — no change
 *
 * Alignment semantics are REGIME-RELATIVE:
 *   - trend_up   → aligned means bias === 'bullish' (with the trend)
 *   - trend_down → aligned means bias === 'bearish' (with the trend)
 *   - range      → aligned means EMA stack OPPOSES bias (counter-trend = mean-rev)
 *
 * Output is clamped to [0, 1].
 */

import type { IndicatorSnapshot, MarketRegime } from '@shared/types'

// ── Regime constants (satisfies MarketRegime catches typos at compile time) ──

export const REGIME_TREND_UP   = 'trend_up'   satisfies MarketRegime
export const REGIME_TREND_DOWN = 'trend_down' satisfies MarketRegime
export const REGIME_RANGE      = 'range'      satisfies MarketRegime
export const REGIME_CHOP       = 'chop'       satisfies MarketRegime

// ── Multiplier table ──────────────────────────────────────────────────────────

/** Per-regime { aligned, opposed } multipliers. Missing key = pass-through. */
const MULT: Partial<Record<MarketRegime, { aligned: number; opposed: number }>> = {
  [REGIME_TREND_UP]:   { aligned: 1.20, opposed: 0.65 },
  [REGIME_TREND_DOWN]: { aligned: 1.20, opposed: 0.65 },
  [REGIME_RANGE]:      { aligned: 1.10, opposed: 0.75 },  // mean-rev = aligned → lift; trend-follow in range = fade
  // REGIME_CHOP and 'unknown' intentionally absent — pass-through
}

// ── isEmaAligned ──────────────────────────────────────────────────────────────

/**
 * Returns true when the EMA stack direction matches the stated bias.
 *
 * "Aligned" means the short-term momentum indicator agrees with the
 * brain's directional call:
 *   bullish → ema9 > ema21 > ema50 (full uptrend stack)
 *   bearish → ema9 < ema21 < ema50 (full downtrend stack)
 *
 * A partial stack (e.g. ema9 > ema21 but ema21 < ema50) returns false —
 * we require full confirmation, not just the nearest cross.
 *
 * Used internally by fuseWithRegime to detect mean-reversion signals in
 * the 'range' regime (where counter-trend EMA moves ARE the signal).
 * Exported for unit testing.
 */
export function isEmaAligned(
  bias: 'bullish' | 'bearish' | 'neutral',
  ind: Pick<IndicatorSnapshot, 'ema9' | 'ema21' | 'ema50'>,
): boolean {
  if (bias === 'neutral') return false
  if (bias === 'bullish') return ind.ema9 > ind.ema21 && ind.ema21 > ind.ema50
  return ind.ema9 < ind.ema21 && ind.ema21 < ind.ema50
}

// ── isAlignedWithRegime ───────────────────────────────────────────────────────

/**
 * Returns true when the brain's bias is ALIGNED WITH THE REGIME DIRECTION.
 *
 * Regime alignment is regime-specific:
 *   trend_up   — bullish bias aligns with the trend direction.
 *   trend_down — bearish bias aligns with the trend direction.
 *   range      — the EMA stack OPPOSING the bias signals mean-reversion
 *                (counter-trend entry IS the correct play in a range).
 *
 * Exported for unit testing.
 */
export function isAlignedWithRegime(
  bias: 'bullish' | 'bearish' | 'neutral',
  regime: MarketRegime,
  ind: Pick<IndicatorSnapshot, 'ema9' | 'ema21' | 'ema50'>,
): boolean {
  if (bias === 'neutral') return false
  if (regime === REGIME_TREND_UP)   return bias === 'bullish'       // trade with uptrend
  if (regime === REGIME_TREND_DOWN) return bias === 'bearish'       // trade with downtrend
  if (regime === REGIME_RANGE)      return !isEmaAligned(bias, ind) // counter-trend = mean-rev
  return false  // chop / unknown — no regime signal
}

// ── fuseWithRegime ────────────────────────────────────────────────────────────

/**
 * Scale `confidence` by a regime × alignment multiplier.
 *
 * Pass-throughs (return confidence unchanged):
 *   - bias === 'neutral'       (no directional call to adjust)
 *   - regime === null          (observer not running)
 *   - regime not in MULT table (chop / unknown — no edge)
 *
 * Output is clamped to [0, 1].
 */
export function fuseWithRegime(
  confidence: number,
  bias: 'bullish' | 'bearish' | 'neutral',
  regime: MarketRegime | null,
  ind: Pick<IndicatorSnapshot, 'ema9' | 'ema21' | 'ema50'>,
): number {
  if (bias === 'neutral') return confidence
  if (!regime) return confidence

  const cell = MULT[regime as MarketRegime]
  if (!cell) return confidence  // chop / unknown regime — pass-through

  const aligned = isAlignedWithRegime(bias, regime, ind)
  const mult = aligned ? cell.aligned : cell.opposed
  return Math.min(1, Math.max(0, confidence * mult))
}
