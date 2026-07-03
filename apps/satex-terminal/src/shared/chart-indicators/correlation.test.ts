/**
 * SATEX — correlation math unit tests (CHART-17)
 * Pure: no DOM, no network.
 */
import { describe, it, expect } from 'vitest'
import {
  pearsonCorrelation,
  rollingCorrelation,
  alignSeries,
  correlationMatrix,
} from './correlation'

describe('pearsonCorrelation', () => {
  it('returns 0 for empty arrays', () => {
    expect(pearsonCorrelation([], [])).toBe(0)
  })

  it('returns 0 for single element', () => {
    expect(pearsonCorrelation([1], [2])).toBe(0)
  })

  it('returns 1.0 for perfectly correlated series', () => {
    expect(pearsonCorrelation([1, 2, 3, 4, 5], [2, 4, 6, 8, 10])).toBeCloseTo(1.0, 10)
  })

  it('returns -1.0 for perfectly anti-correlated series', () => {
    expect(pearsonCorrelation([1, 2, 3, 4, 5], [5, 4, 3, 2, 1])).toBeCloseTo(-1.0, 10)
  })

  it('returns 0 for constant vs linear (zero variance)', () => {
    expect(pearsonCorrelation([5, 5, 5, 5, 5], [1, 2, 3, 4, 5])).toBe(0)
  })

  it('result is in [-1, 1]', () => {
    const r = pearsonCorrelation([1, 3, 2, 5, 4], [2, 1, 4, 3, 5])
    expect(r).toBeGreaterThanOrEqual(-1)
    expect(r).toBeLessThanOrEqual(1)
  })

  it('is symmetric: corr(a,b) === corr(b,a)', () => {
    const a = [1, 3, 2, 5, 4], b = [2, 4, 1, 3, 5]
    expect(pearsonCorrelation(a, b)).toBeCloseTo(pearsonCorrelation(b, a), 12)
  })
})

describe('rollingCorrelation', () => {
  it('returns same length as input', () => {
    const a = [1, 2, 3, 4, 5]
    expect(rollingCorrelation(a, a, 3)).toHaveLength(5)
  })

  it('first window-1 values are 0 (warm-up)', () => {
    const a = [1, 2, 3, 4, 5, 6, 7, 8]
    const r = rollingCorrelation(a, a, 4)
    expect(r.slice(0, 3).every((v) => v === 0)).toBe(true)
  })

  it('perfectly correlated rolling window gives 1.0', () => {
    const a = [1, 2, 3, 4, 5, 6, 7, 8]
    const r = rollingCorrelation(a, a.map((v) => v * 2), 4)
    expect(r[r.length - 1]).toBeCloseTo(1.0, 10)
  })

  it('returns zeros for window < 2', () => {
    const a = [1, 2, 3]
    expect(rollingCorrelation(a, a, 1).every((v) => v === 0)).toBe(true)
  })
})

describe('alignSeries', () => {
  it('returns {} for empty map', () => {
    expect(alignSeries({})).toEqual({})
  })

  it('aligns to shared timestamps only', () => {
    const map = {
      AAPL: [{ time: 1000, close: 100 }, { time: 2000, close: 110 }, { time: 3000, close: 120 }],
      MSFT: [{ time: 1000, close: 200 }, { time: 3000, close: 220 }],
    }
    const aligned = alignSeries(map)
    expect(aligned['AAPL']).toHaveLength(2)
    expect(aligned['MSFT']).toHaveLength(2)
    expect(aligned['AAPL']![0]).toBe(100)
    expect(aligned['AAPL']![1]).toBe(120)
    expect(aligned['MSFT']![0]).toBe(200)
  })

  it('returns all points when timestamps match exactly', () => {
    const map = {
      A: [{ time: 1, close: 10 }, { time: 2, close: 20 }],
      B: [{ time: 1, close: 30 }, { time: 2, close: 40 }],
    }
    const aligned = alignSeries(map)
    expect(aligned['A']).toHaveLength(2)
    expect(aligned['B']).toHaveLength(2)
  })
})

describe('correlationMatrix', () => {
  it('diagonal is always 1.0', () => {
    const aligned = {
      AAPL: [1, 2, 3, 4, 5, 6, 7, 8],
      MSFT: [2, 4, 3, 5, 4, 6, 5, 7],
    }
    const mat = correlationMatrix(aligned, 5)
    expect(mat['AAPL']!['AAPL']).toBe(1.0)
    expect(mat['MSFT']!['MSFT']).toBe(1.0)
  })

  it('is symmetric', () => {
    const aligned = { AAPL: [1, 2, 3, 4, 5, 6, 7, 8], MSFT: [2, 4, 3, 5, 4, 6, 5, 7] }
    const mat = correlationMatrix(aligned, 5)
    expect(mat['AAPL']!['MSFT']).toBeCloseTo(mat['MSFT']!['AAPL']!, 12)
  })

  it('perfectly correlated pair gives ≈1.0', () => {
    const aligned = { A: [1, 2, 3, 4, 5, 6, 7, 8], B: [2, 4, 6, 8, 10, 12, 14, 16] }
    expect(correlationMatrix(aligned, 8)['A']!['B']).toBeCloseTo(1.0, 8)
  })

  it('anti-correlated pair gives ≈-1.0', () => {
    const aligned = { A: [1, 2, 3, 4, 5, 6, 7, 8], B: [8, 7, 6, 5, 4, 3, 2, 1] }
    expect(correlationMatrix(aligned, 8)['A']!['B']).toBeCloseTo(-1.0, 8)
  })
})
