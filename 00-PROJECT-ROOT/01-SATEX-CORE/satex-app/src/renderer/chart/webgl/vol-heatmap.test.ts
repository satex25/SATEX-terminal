/**
 * SATEX — vol heatmap unit tests (CHART-14)
 * Pure: no DOM, no WebGL.
 */
import { describe, it, expect } from 'vitest'
import {
  intensityToRgb,
  atrSeries,
  stdevSeries,
  computeHeatmap,
} from './vol-heatmap'
import type { Candle } from '@shared/types'

function c(close: number, i: number): Candle {
  return { time: i * 60, open: close * 0.99, high: close * 1.01, low: close * 0.98, close, volume: 100 }
}

const FLAT  = Array.from({ length: 30 }, (_, i) => c(100, i))
const NOISY = Array.from({ length: 30 }, (_, i) => c(100 + (i % 2 === 0 ? 5 : -5), i))

describe('intensityToRgb', () => {
  it('intensity 0 → blue (r=0, b=255)', () => {
    const { r, b } = intensityToRgb(0)
    expect(r).toBe(0)
    expect(b).toBe(255)
  })

  it('intensity 1 → red (r=255, b=0)', () => {
    const { r, b } = intensityToRgb(1)
    expect(r).toBe(255)
    expect(b).toBe(0)
  })

  it('intensity 0.5 → yellow (r=255, g=255, b=0)', () => {
    const { r, g, b } = intensityToRgb(0.5)
    expect(r).toBe(255)
    expect(g).toBe(255)
    expect(b).toBe(0)
  })

  it('clamps values below 0', () => {
    expect(intensityToRgb(-1).b).toBe(255)
  })

  it('clamps values above 1', () => {
    expect(intensityToRgb(2).r).toBe(255)
  })

  it('all rgb values are integers in [0,255]', () => {
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const { r, g, b } = intensityToRgb(t)
      for (const v of [r, g, b]) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(255)
        expect(Number.isInteger(v)).toBe(true)
      }
    }
  })
})

describe('atrSeries', () => {
  it('returns same length as input', () => {
    expect(atrSeries(FLAT)).toHaveLength(FLAT.length)
  })

  it('returns [] for empty input', () => {
    expect(atrSeries([])).toEqual([])
  })

  it('values after warm-up are non-negative', () => {
    expect(atrSeries(NOISY).every((v) => v >= 0)).toBe(true)
  })

  it('flat price has lower ATR than noisy', () => {
    const avgFlat  = atrSeries(FLAT).reduce((a, b) => a + b, 0)
    const avgNoisy = atrSeries(NOISY).reduce((a, b) => a + b, 0)
    expect(avgFlat).toBeLessThan(avgNoisy)
  })
})

describe('stdevSeries', () => {
  it('returns same length as input', () => {
    expect(stdevSeries(FLAT)).toHaveLength(FLAT.length)
  })

  it('flat price has near-zero stdev', () => {
    expect(stdevSeries(FLAT).every((v) => v < 0.001)).toBe(true)
  })
})

describe('computeHeatmap', () => {
  it('returns [] for empty input', () => {
    expect(computeHeatmap([])).toEqual([])
  })

  it('returns same length as input', () => {
    expect(computeHeatmap(FLAT)).toHaveLength(FLAT.length)
  })

  it('all intensities in [0,1]', () => {
    expect(computeHeatmap(NOISY, 0.5).every((p) => p.intensity >= 0 && p.intensity <= 1)).toBe(true)
  })

  it('higher vpin raises mean intensity', () => {
    const mLow  = computeHeatmap(FLAT, 0.0).reduce((s, p) => s + p.intensity, 0)
    const mHigh = computeHeatmap(FLAT, 1.0).reduce((s, p) => s + p.intensity, 0)
    expect(mHigh).toBeGreaterThan(mLow)
  })

  it('noisy > flat in mean intensity', () => {
    const mFlat  = computeHeatmap(FLAT).reduce((s, p) => s + p.intensity, 0)
    const mNoisy = computeHeatmap(NOISY).reduce((s, p) => s + p.intensity, 0)
    expect(mNoisy).toBeGreaterThan(mFlat)
  })

  it('time field matches input candle times', () => {
    computeHeatmap(FLAT).forEach((p, i) => expect(p.time).toBe(FLAT[i]!.time))
  })
})
