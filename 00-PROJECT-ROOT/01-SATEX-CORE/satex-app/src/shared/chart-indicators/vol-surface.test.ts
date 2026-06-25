/**
 * SATEX — realized vol surface unit tests (CHART-16)
 * Pure: no DOM, no network.
 */
import { describe, it, expect } from 'vitest'
import {
  logReturnStdev,
  annualize,
  computeVolSurface,
  VOL_LOOKBACKS,
} from './vol-surface'
import type { Candle } from '../types'

function c(close: number, i: number): Candle {
  return { time: i * 60, open: close, high: close + 1, low: close - 1, close, volume: 100 }
}

const FLAT  = Array.from({ length: 120 }, (_, i) => c(100, i))
const NOISY = Array.from({ length: 120 }, (_, i) => c(100 + (i % 2 === 0 ? 5 : -5), i))

describe('logReturnStdev', () => {
  it('returns 0 for insufficient data (endIdx < window)', () => {
    expect(logReturnStdev(FLAT, 3, 10)).toBe(0)
  })

  it('flat price gives near-zero stdev', () => {
    expect(logReturnStdev(FLAT, 50, 20)).toBeLessThan(0.0001)
  })

  it('noisy price gives higher stdev than flat', () => {
    expect(logReturnStdev(NOISY, 50, 20)).toBeGreaterThan(logReturnStdev(FLAT, 50, 20))
  })

  it('returns non-negative', () => {
    expect(logReturnStdev(NOISY, 50, 20)).toBeGreaterThanOrEqual(0)
  })
})

describe('annualize', () => {
  it('returns 0 for stdev=0', () => {
    expect(annualize(0, 252)).toBe(0)
  })

  it('scales by sqrt(periodsPerYear)', () => {
    const s = 0.01
    expect(annualize(s, 252)).toBeCloseTo(s * Math.sqrt(252), 10)
  })

  it('returns 0 for periodsPerYear=0', () => {
    expect(annualize(0.01, 0)).toBe(0)
  })
})

describe('computeVolSurface', () => {
  it('returns empty surface for empty candles', () => {
    const s = computeVolSurface([], 252)
    expect(s.points).toHaveLength(0)
    expect(s.ivNote).toBe('no-iv-source')
  })

  it('returns one point per VOL_LOOKBACKS entry', () => {
    expect(computeVolSurface(FLAT, 252).points).toHaveLength(VOL_LOOKBACKS.length)
  })

  it('all source fields are "realized-ohlcv"', () => {
    expect(computeVolSurface(NOISY, 252).points.every((p) => p.source === 'realized-ohlcv')).toBe(true)
  })

  it('ivNote is always "no-iv-source"', () => {
    expect(computeVolSurface(FLAT, 252).ivNote).toBe('no-iv-source')
  })

  it('noisy candles produce higher realized vol than flat', () => {
    const flatVol  = computeVolSurface(FLAT,  252).points.find((p) => p.lookback === 50)!.realizedVol
    const noisyVol = computeVolSurface(NOISY, 252).points.find((p) => p.lookback === 50)!.realizedVol
    expect(noisyVol).toBeGreaterThan(flatVol)
  })

  it('all realized vols are non-negative', () => {
    expect(computeVolSurface(NOISY, 252).points.every((p) => p.realizedVol >= 0)).toBe(true)
  })
})
