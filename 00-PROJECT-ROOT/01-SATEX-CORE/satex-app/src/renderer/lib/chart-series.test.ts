import { describe, it, expect } from 'vitest'
import { emaSeries, vwapSeries } from './chart-series'
import type { Candle } from '@shared/types'

const bar = (o: number, h: number, l: number, c: number, v: number): Candle => ({ time: 0, open: o, high: h, low: l, close: c, volume: v })

describe('emaSeries', () => {
  it('returns [] for empty input', () => {
    expect(emaSeries([], 9)).toEqual([])
  })
  it('seeds with the first close and matches input length', () => {
    const out = emaSeries([10, 12, 11, 13], 9)
    expect(out).toHaveLength(4)
    expect(out[0]).toBe(10)
  })
  it('period 1 (k=1) tracks the closes exactly', () => {
    expect(emaSeries([10, 20, 30], 1)).toEqual([10, 20, 30])
  })
  it('rises monotonically for a rising series, bounded by the closes', () => {
    const out = emaSeries([10, 20, 30, 40], 3)
    for (let i = 1; i < out.length; i++) expect(out[i]!).toBeGreaterThan(out[i - 1]!)
    expect(out[out.length - 1]!).toBeLessThan(40)
  })
})

describe('vwapSeries', () => {
  it('returns the typical price for a single bar', () => {
    const out = vwapSeries([bar(10, 12, 8, 11, 100)])
    expect(out).toHaveLength(1)
    expect(out[0]!).toBeCloseTo((12 + 8 + 11) / 3, 10)
  })
  it('falls back to typical price when volume is zero (no NaN)', () => {
    const out = vwapSeries([bar(10, 10, 10, 10, 0), bar(20, 20, 20, 20, 0)])
    expect(out).toEqual([10, 20])
  })
  it('volume-weights toward the heavier bar', () => {
    // bar A typical=10 (vol 1), bar B typical=20 (vol 99) → vwap ≈ 19.9
    const out = vwapSeries([bar(10, 10, 10, 10, 1), bar(20, 20, 20, 20, 99)])
    expect(out[1]!).toBeGreaterThan(19)
    expect(out[1]!).toBeLessThan(20)
  })
})
