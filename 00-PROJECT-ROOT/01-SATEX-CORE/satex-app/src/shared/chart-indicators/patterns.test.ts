/**
 * SATEX — pattern detector unit tests (CHART-19)
 * Pure: no DOM, no LWC, no network.
 */
import { describe, it, expect } from 'vitest'
import {
  detectHeadShoulders,
  detectInverseHeadShoulders,
  detectWedges,
  detectFlags,
} from './patterns'
import type { Candle } from '../types'

function c(close: number, time = close * 1000, hi?: number, lo?: number): Candle {
  return { time, open: close, high: hi ?? close + 1, low: lo ?? close - 1, close, volume: 100 }
}

function withHigh(arr: number[]): Candle[] {
  return arr.map((h, i) => ({
    time: i * 60, open: h - 2, high: h, low: h - 4, close: h - 1, volume: 100,
  }))
}

function withLow(arr: number[]): Candle[] {
  return arr.map((l, i) => ({
    time: i * 60, open: l + 2, high: l + 4, low: l, close: l + 1, volume: 100,
  }))
}

describe('detectHeadShoulders', () => {
  it('returns [] for empty input', () => {
    expect(detectHeadShoulders([])).toEqual([])
  })

  it('returns [] for too few candles', () => {
    expect(detectHeadShoulders([c(100), c(110)]).length).toBe(0)
  })

  it('detects classic H&S: two shoulders flanking a taller head', () => {
    const candles = withHigh([
      80, 90, 100, 90, 80,
      90, 100, 120, 100, 90,
      80, 90, 102, 90, 80,
    ])
    const matches = detectHeadShoulders(candles, { swingWindow: 2 })
    expect(matches.length).toBeGreaterThan(0)
    expect(matches[0]?.kind).toBe('head-shoulders')
    expect(matches[0]?.confidence).toBeGreaterThan(0)
    expect(matches[0]?.confidence).toBeLessThanOrEqual(0.85)
  })

  it('confidence is in [0, 0.85]', () => {
    const candles = withHigh([80, 100, 80, 110, 80, 100, 80, 98, 80])
    for (const m of detectHeadShoulders(candles, { swingWindow: 1 })) {
      expect(m.confidence).toBeGreaterThanOrEqual(0)
      expect(m.confidence).toBeLessThanOrEqual(0.85)
    }
  })

  it('label includes "(detector)"', () => {
    const candles = withHigh([80, 100, 80, 120, 80, 102, 80])
    const matches = detectHeadShoulders(candles, { swingWindow: 1 })
    if (matches.length > 0) expect(matches[0]!.label).toContain('detector')
  })

  it('rejects when shoulders differ beyond tolerance', () => {
    const candles = withHigh([80, 100, 80, 120, 80, 80, 80])
    for (const m of detectHeadShoulders(candles, { swingWindow: 1, shoulderTol: 0.05 })) {
      expect(m.confidence).toBeLessThanOrEqual(0.85)
    }
  })
})

describe('detectInverseHeadShoulders', () => {
  it('returns [] for empty input', () => {
    expect(detectInverseHeadShoulders([])).toEqual([])
  })

  it('results have kind inv-head-shoulders and capped confidence', () => {
    const candles = withLow([120, 110, 100, 110, 120, 110, 80, 110, 120, 110, 98, 110, 120])
    for (const m of detectInverseHeadShoulders(candles, { swingWindow: 2 })) {
      expect(m.kind).toBe('inv-head-shoulders')
      expect(m.confidence).toBeLessThanOrEqual(0.85)
    }
  })
})

describe('detectWedges', () => {
  it('returns [] for empty input', () => {
    expect(detectWedges([])).toEqual([])
  })

  it('returns [] for fewer than 10 candles', () => {
    const few = Array.from({ length: 5 }, (_, i) => c(100 + i))
    expect(detectWedges(few)).toHaveLength(0)
  })

  it('results are wedge-rising or wedge-falling with valid confidence', () => {
    const candles: Candle[] = Array.from({ length: 25 }, (_, i) => ({
      time: i * 60, open: 100 + i * 1.5,
      high: 100 + i * 2, low: 100 + i * 2.5, close: 100 + i * 2, volume: 100,
    }))
    for (const m of detectWedges(candles)) {
      expect(['wedge-rising', 'wedge-falling']).toContain(m.kind)
      expect(m.confidence).toBeGreaterThan(0)
      expect(m.confidence).toBeLessThanOrEqual(0.80)
    }
  })
})

describe('detectFlags', () => {
  it('returns [] for empty input', () => {
    expect(detectFlags([])).toEqual([])
  })

  it('results have valid kind and capped confidence', () => {
    const pole = Array.from({ length: 10 }, (_, i) => ({
      time: i * 60, open: 100 + i, high: 101 + i, low: 99 + i, close: 100 + i, volume: 200,
    }))
    const flag = Array.from({ length: 10 }, (_, i) => ({
      time: (10 + i) * 60, open: 109 - i * 0.1, high: 109.5 - i * 0.1,
      low: 108.5 - i * 0.1, close: 109 - i * 0.1, volume: 100,
    }))
    for (const m of detectFlags([...pole, ...flag])) {
      expect(['flag-bull', 'flag-bear']).toContain(m.kind)
      expect(m.confidence).toBeLessThanOrEqual(0.80)
      expect(m.label).toContain('detector')
    }
  })
})
