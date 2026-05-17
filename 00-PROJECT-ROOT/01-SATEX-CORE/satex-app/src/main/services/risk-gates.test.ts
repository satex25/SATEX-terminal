/**
 * SATEX — RiskGatesService unit tests.
 *
 * Locks down adversarial finding C4 (2026-05-16): correlation must align
 * candle series by timestamp before computing rho, and must skip pairs
 * with fewer than 20 overlapping bars.
 */
import { describe, expect, it } from 'vitest'
import { alignCloses, correlation } from './risk-gates'
import type { Candle } from '../../shared/types'

function candle(time: number, close: number): Candle {
  return { time, open: close, high: close, low: close, close, volume: 0 }
}

describe('alignCloses — timestamp matching', () => {
  it('returns the full series when both sides match', () => {
    const a = [candle(1, 10), candle(2, 11), candle(3, 12)]
    const b = [candle(1, 20), candle(2, 21), candle(3, 22)]
    const out = alignCloses(a, b)
    expect(out.a).toEqual([10, 11, 12])
    expect(out.b).toEqual([20, 21, 22])
  })

  it('drops unmatched timestamps on either side', () => {
    const a = [candle(1, 10), candle(2, 11), candle(3, 12), candle(4, 13)]
    const b = [candle(2, 21), candle(3, 22), candle(5, 24)]
    const out = alignCloses(a, b)
    expect(out.a).toEqual([11, 12])
    expect(out.b).toEqual([21, 22])
  })

  it('returns empty arrays when there is no overlap', () => {
    const a = [candle(1, 10), candle(2, 11)]
    const b = [candle(10, 20), candle(11, 21)]
    const out = alignCloses(a, b)
    expect(out.a).toEqual([])
    expect(out.b).toEqual([])
  })

  it('preserves order of series A when reassembling', () => {
    // A has [3, 1, 2] (out-of-order timestamps); alignment should reflect A's order.
    const a = [candle(3, 30), candle(1, 10), candle(2, 20)]
    const b = [candle(1, 1), candle(2, 2), candle(3, 3)]
    const out = alignCloses(a, b)
    expect(out.a).toEqual([30, 10, 20])
    expect(out.b).toEqual([3, 1, 2])
  })

  it('handles duplicate timestamps in B by using the latest value', () => {
    // Map semantics: later set wins.
    const a = [candle(1, 10), candle(2, 11)]
    const b = [candle(1, 100), candle(2, 110), candle(1, 999)]
    const out = alignCloses(a, b)
    expect(out.a).toEqual([10, 11])
    expect(out.b).toEqual([999, 110])
  })
})

describe('correlation — overlap floor and math sanity', () => {
  it('returns 0 when fewer than 20 paired bars (was 5)', () => {
    // 19 bars in identical lockstep would mathematically be rho=1, but
    // the overlap floor (MIN_CORR_OVERLAP = 20) means we report 0 to avoid
    // false-confidence from a thin sample.
    const a = Array.from({ length: 19 }, (_, i) => i + 1)
    const b = Array.from({ length: 19 }, (_, i) => (i + 1) * 2)
    expect(correlation(a, b)).toBe(0)
  })

  it('returns ~1.0 for perfect positive correlation over ≥20 bars', () => {
    const n = 30
    const a = Array.from({ length: n }, (_, i) => i + 1)
    const b = Array.from({ length: n }, (_, i) => (i + 1) * 3 + 7)
    expect(correlation(a, b)).toBeCloseTo(1, 5)
  })

  it('returns ~-1.0 for perfect negative correlation', () => {
    const n = 30
    const a = Array.from({ length: n }, (_, i) => i + 1)
    const b = Array.from({ length: n }, (_, i) => -(i + 1))
    expect(correlation(a, b)).toBeCloseTo(-1, 5)
  })

  it('returns 0 when one series is constant (zero variance)', () => {
    const n = 30
    const a = Array.from({ length: n }, (_, i) => i + 1)
    const b = Array(n).fill(50)
    expect(correlation(a, b)).toBe(0)
  })

  it('downstream: mismatched-length series fed through alignCloses + correlation produces a valid rho or 0', () => {
    // Adversarial scenario: symbol A has 60 bars, symbol B has 30 bars,
    // bars 31..60 of A have no counterpart in B. Pre-fix, raw index
    // correlation would compare bars [0..29] of A vs [0..29] of B even
    // though those are at the same array index but different real-world
    // timestamps. Post-fix, alignment by `time` drops the unmatched bars.
    const longSeries: Candle[] = Array.from({ length: 60 }, (_, i) => candle(i, 100 + i))
    const shortSeries: Candle[] = Array.from({ length: 30 }, (_, i) => candle(i + 30, 200 + i))
    // Overlap is bars [30..59] of A with bars [0..29] of B → 30 aligned bars.
    const aligned = alignCloses(longSeries, shortSeries)
    expect(aligned.a).toHaveLength(30)
    expect(aligned.b).toHaveLength(30)
    const rho = correlation(aligned.a, aligned.b)
    expect(rho).toBeGreaterThan(0.99) // both linear-increasing
  })
})
