/**
 * SATEX — format.ts unit tests.
 *
 * Pins the centralized number formatters every panel renders through. The
 * `k()` compact formatter previously returned `String(v)` raw for sub-1000
 * values, leaking IEEE-754 noise (0.1 + 0.2 → "0.30000000000000004") into the
 * volume / size / notional surfaces (ChartPanel, MarketsOverviewPanel,
 * TimeSalesPanel). It now rounds to 3 significant figures like the K/M/B
 * branches. These cases lock that behavior plus the degenerate (null / NaN /
 * Infinity) and sign paths for all six helpers.
 */
import { describe, it, expect } from 'vitest'
import { fmt } from './format'

const DASH = '—' // em dash returned for non-finite input
const MINUS = '−' // Unicode minus used by money() for negatives

describe('fmt.px', () => {
  it('formats with grouping and fixed decimals', () => {
    expect(fmt.px(1234.567, 2)).toBe('1,234.57')
    expect(fmt.px(0)).toBe('0.00')
  })
  it('returns the dash for non-finite input', () => {
    expect(fmt.px(null)).toBe(DASH)
    expect(fmt.px(undefined)).toBe(DASH)
    expect(fmt.px(NaN)).toBe(DASH)
    expect(fmt.px(Infinity)).toBe(DASH)
  })
})

describe('fmt.pct', () => {
  it('prefixes a + only for non-negative values', () => {
    expect(fmt.pct(1.5)).toBe('+1.50%')
    expect(fmt.pct(-2.25)).toBe('-2.25%')
    expect(fmt.pct(0)).toBe('+0.00%')
  })
  it('returns the dash for non-finite input', () => {
    expect(fmt.pct(null)).toBe(DASH)
    expect(fmt.pct(NaN)).toBe(DASH)
  })
})

describe('fmt.signed', () => {
  it('always shows an explicit sign', () => {
    expect(fmt.signed(5)).toBe('+5.00')
    expect(fmt.signed(-5)).toBe('-5.00')
    expect(fmt.signed(0)).toBe('+0.00')
  })
  it('returns the dash for non-finite input', () => {
    expect(fmt.signed(undefined)).toBe(DASH)
    expect(fmt.signed(-Infinity)).toBe(DASH)
  })
})

describe('fmt.money', () => {
  it('uses + for gains and a Unicode minus for losses', () => {
    expect(fmt.money(1500)).toBe('+$1,500')
    expect(fmt.money(-1500)).toBe(MINUS + '$1,500')
    expect(fmt.money(0)).toBe('+$0')
    expect(fmt.money(1234.56, 2)).toBe('+$1,234.56')
  })
  it('returns the dash for non-finite input', () => {
    expect(fmt.money(null)).toBe(DASH)
    expect(fmt.money(NaN)).toBe(DASH)
  })
})

describe('fmt.usd', () => {
  it('prefixes a dollar sign', () => {
    expect(fmt.usd(1500)).toBe('$1,500')
    expect(fmt.usd(-1500)).toBe('$-1,500')
  })
  it('returns the dash for non-finite input', () => {
    expect(fmt.usd(null)).toBe(DASH)
    expect(fmt.usd(Infinity)).toBe(DASH)
  })
})

describe('fmt.k', () => {
  it('compacts thousands / millions / billions', () => {
    expect(fmt.k(1500)).toBe('1.5K')
    expect(fmt.k(1_234_567)).toBe('1.23M')
    expect(fmt.k(2.5e9)).toBe('2.50B')
    expect(fmt.k(-1500)).toBe('-1.5K')
  })
  it('passes integers below 1000 through unchanged', () => {
    expect(fmt.k(950)).toBe('950')
    expect(fmt.k(999)).toBe('999')
    expect(fmt.k(0)).toBe('0')
  })
  it('rounds sub-1000 floats to 3 significant figures (no IEEE-754 noise)', () => {
    // The defect this test guards: String(0.1 + 0.2) === "0.30000000000000004".
    expect(fmt.k(0.1 + 0.2)).toBe('0.3')
    expect(fmt.k(-(0.1 + 0.2))).toBe('-0.3')
    expect(fmt.k(847.3829)).toBe('847')
    expect(fmt.k(12.999999)).toBe('13')
  })
  it('preserves precision for small fractional (crypto) sizes', () => {
    expect(fmt.k(0.25)).toBe('0.25')
    expect(fmt.k(2.5)).toBe('2.5')
    expect(fmt.k(0.001234)).toBe('0.00123')
  })
  it('returns the dash for non-finite input', () => {
    expect(fmt.k(null)).toBe(DASH)
    expect(fmt.k(undefined)).toBe(DASH)
    expect(fmt.k(NaN)).toBe(DASH)
    expect(fmt.k(Infinity)).toBe(DASH)
  })
})
