import { describe, it, expect } from 'vitest'
import { emaSeries, vwapSeries, toAscendingUniqueCandles } from './chart-series'
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

describe('toAscendingUniqueCandles', () => {
  const at = (time: number, close: number): Candle => ({ time, open: close, high: close, low: close, close, volume: 1 })

  it('returns [] for empty input', () => {
    expect(toAscendingUniqueCandles([])).toEqual([])
  })

  it('collapses a duplicate-time candle, keeping the latest (the lightweight-charts crash repro)', () => {
    // Two candles at the same second is exactly what threw
    // "Assertion failed: data must be asc ordered by time" in QuadPaneChart.setData.
    const out = toAscendingUniqueCandles([at(1, 100), at(1, 105), at(2, 110)])
    expect(out.map(c => c.time)).toEqual([1, 2])
    expect(out[0]!.close).toBe(105) // last-wins on the duplicate second
  })

  it('drops an out-of-order (decreasing-time) candle', () => {
    const out = toAscendingUniqueCandles([at(1, 100), at(3, 130), at(2, 120)])
    expect(out.map(c => c.time)).toEqual([1, 3])
  })

  it('leaves already ascending-unique candles unchanged', () => {
    const input = [at(1, 100), at(2, 110), at(3, 120)]
    expect(toAscendingUniqueCandles(input)).toEqual(input)
  })

  it('always yields strictly ascending times for messy input', () => {
    const out = toAscendingUniqueCandles([at(5, 1), at(5, 2), at(3, 3), at(6, 4), at(6, 5)])
    for (let i = 1; i < out.length; i++) expect(out[i]!.time).toBeGreaterThan(out[i - 1]!.time)
  })
})
