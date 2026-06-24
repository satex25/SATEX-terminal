/**
 * Unit tests for fuseWithRegime, isEmaAligned, isAlignedWithRegime.
 *
 * L1.F — regime-aware ensemble confidence fusion.
 * Pure functions — fully testable without engine or broker dependencies.
 */

import { describe, expect, it } from 'vitest'
import {
  fuseWithRegime, isEmaAligned, isAlignedWithRegime,
  REGIME_TREND_UP, REGIME_TREND_DOWN, REGIME_RANGE, REGIME_CHOP,
} from './ensemble-fuser'
import type { IndicatorSnapshot } from '@shared/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function ind(ema9: number, ema21: number, ema50: number): Pick<IndicatorSnapshot, 'ema9' | 'ema21' | 'ema50'> {
  return { ema9, ema21, ema50 }
}

const UPSTACK   = ind(110, 100, 90)   // ema9 > ema21 > ema50 — bullish stack
const DOWNSTACK = ind(90, 100, 110)   // ema9 < ema21 < ema50 — bearish stack
const PARTIAL   = ind(105, 100, 102)  // broken — ema21 > ema50 but wrong order
const FLAT      = ind(100, 100, 100)

// ── isEmaAligned ─────────────────────────────────────────────────────────────

describe('isEmaAligned', () => {
  it('bullish + full upstack → true', () => {
    expect(isEmaAligned('bullish', UPSTACK)).toBe(true)
  })

  it('bullish + partial stack → false', () => {
    expect(isEmaAligned('bullish', PARTIAL)).toBe(false)
  })

  it('bullish + flat EMAs → false', () => {
    expect(isEmaAligned('bullish', FLAT)).toBe(false)
  })

  it('bearish + full downstack → true', () => {
    expect(isEmaAligned('bearish', DOWNSTACK)).toBe(true)
  })

  it('bearish + partial stack → false', () => {
    expect(isEmaAligned('bearish', PARTIAL)).toBe(false)
  })

  it('neutral + any stack → always false', () => {
    expect(isEmaAligned('neutral', UPSTACK)).toBe(false)
    expect(isEmaAligned('neutral', DOWNSTACK)).toBe(false)
  })
})

// ── isAlignedWithRegime ───────────────────────────────────────────────────────

describe('isAlignedWithRegime', () => {
  it('trend_up + bullish → true (bias matches uptrend)', () => {
    expect(isAlignedWithRegime('bullish', REGIME_TREND_UP, UPSTACK)).toBe(true)
  })

  it('trend_up + bearish → false (bears oppose uptrend)', () => {
    expect(isAlignedWithRegime('bearish', REGIME_TREND_UP, DOWNSTACK)).toBe(false)
  })

  it('trend_down + bearish → true (bias matches downtrend)', () => {
    expect(isAlignedWithRegime('bearish', REGIME_TREND_DOWN, DOWNSTACK)).toBe(true)
  })

  it('trend_down + bullish → false (bulls oppose downtrend)', () => {
    expect(isAlignedWithRegime('bullish', REGIME_TREND_DOWN, UPSTACK)).toBe(false)
  })

  it('range + bullish + downstack (counter-trend EMA) → true (mean-reversion aligned)', () => {
    expect(isAlignedWithRegime('bullish', REGIME_RANGE, DOWNSTACK)).toBe(true)
  })

  it('range + bullish + upstack (trend-following EMA) → false (trend signal in range = fade)', () => {
    expect(isAlignedWithRegime('bullish', REGIME_RANGE, UPSTACK)).toBe(false)
  })

  it('neutral bias → false in any regime', () => {
    expect(isAlignedWithRegime('neutral', REGIME_TREND_UP, UPSTACK)).toBe(false)
    expect(isAlignedWithRegime('neutral', REGIME_RANGE, UPSTACK)).toBe(false)
  })
})

// ── fuseWithRegime — pass-throughs ───────────────────────────────────────────

describe('fuseWithRegime — pass-through cases', () => {
  it('neutral bias returns confidence unchanged', () => {
    expect(fuseWithRegime(0.7, 'neutral', REGIME_TREND_UP, UPSTACK)).toBe(0.7)
  })

  it('null regime returns confidence unchanged', () => {
    expect(fuseWithRegime(0.6, 'bullish', null, UPSTACK)).toBe(0.6)
  })

  it('chop regime returns confidence unchanged (no signal)', () => {
    expect(fuseWithRegime(0.6, 'bullish', REGIME_CHOP, UPSTACK)).toBe(0.6)
  })
})

// ── fuseWithRegime — trend_up ─────────────────────────────────────────────────

describe('fuseWithRegime — trend_up regime', () => {
  it('bullish + upstack (aligned with trend) → ×1.20', () => {
    expect(fuseWithRegime(0.5, 'bullish', REGIME_TREND_UP, UPSTACK)).toBeCloseTo(0.6)
  })

  it('bearish + downstack (opposing uptrend) → ×0.65', () => {
    expect(fuseWithRegime(0.6, 'bearish', REGIME_TREND_UP, DOWNSTACK)).toBeCloseTo(0.39)
  })
})

// ── fuseWithRegime — trend_down ───────────────────────────────────────────────

describe('fuseWithRegime — trend_down regime', () => {
  it('bearish + downstack (aligned with downtrend) → ×1.20', () => {
    expect(fuseWithRegime(0.5, 'bearish', REGIME_TREND_DOWN, DOWNSTACK)).toBeCloseTo(0.6)
  })

  it('bullish + upstack (opposing downtrend) → ×0.65', () => {
    expect(fuseWithRegime(0.6, 'bullish', REGIME_TREND_DOWN, UPSTACK)).toBeCloseTo(0.39)
  })
})

// ── fuseWithRegime — range ────────────────────────────────────────────────────

describe('fuseWithRegime — range regime', () => {
  it('bullish + upstack (trend-following in range) → ×0.75 (fade)', () => {
    expect(fuseWithRegime(0.8, 'bullish', REGIME_RANGE, UPSTACK)).toBeCloseTo(0.6)
  })

  it('bullish + downstack (mean-reversion in range) → ×1.10', () => {
    expect(fuseWithRegime(0.5, 'bullish', REGIME_RANGE, DOWNSTACK)).toBeCloseTo(0.55)
  })
})

// ── fuseWithRegime — clamping ─────────────────────────────────────────────────

describe('fuseWithRegime — output clamping', () => {
  it('result is clamped to 1.0 when multiplied above 1', () => {
    // 0.95 × 1.20 = 1.14 → clamped to 1.0
    expect(fuseWithRegime(0.95, 'bullish', REGIME_TREND_UP, UPSTACK)).toBe(1.0)
  })

  it('zero confidence stays zero regardless of regime', () => {
    expect(fuseWithRegime(0, 'bullish', REGIME_TREND_UP, UPSTACK)).toBe(0)
  })
})
