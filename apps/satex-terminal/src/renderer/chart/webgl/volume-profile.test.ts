/**
 * SATEX — volume-profile.ts unit tests (CHART-13)
 */
import { describe, it, expect } from 'vitest'
import { buildVolumeProfile, priceToProfileBin, normaliseProfile } from './volume-profile'
import type { Candle } from '@shared/types'
import type { Trade } from '@shared/types'

function makeCandle(
  time:   number,
  o = 100, h = 110, l = 90, c = 105, v = 1000,
): Candle {
  return { time, open: o, high: h, low: l, close: c, volume: v }
}

function makeTrade(price: number, size: number): Trade {
  return { symbol: 'TEST', ts: Date.now(), price, size, side: 'buy', provenance: 'real' }
}

// ── buildVolumeProfile ────────────────────────────────────────────────────────

describe('buildVolumeProfile', () => {
  it('returns null for empty candle array', () => {
    expect(buildVolumeProfile([])).toBeNull()
  })

  it('throws for binCount < 2', () => {
    expect(() => buildVolumeProfile([makeCandle(0)], [], 1)).toThrow('binCount')
  })

  it('produces correct bin count', () => {
    const p = buildVolumeProfile([makeCandle(0)], [], 12)!
    expect(p.bins).toHaveLength(12)
    expect(p.binCount).toBe(12)
  })

  it('totalVolume equals sum of candle volumes (no trades)', () => {
    const candles = [makeCandle(0, 100, 110, 90, 100, 500), makeCandle(60, 100, 110, 90, 100, 300)]
    const p = buildVolumeProfile(candles, [], 10)!
    expect(p.totalVolume).toBeCloseTo(800)
  })

  it('POC is the bin with highest volume', () => {
    // Single candle — all volume goes into a tight range
    const p = buildVolumeProfile([makeCandle(0, 100, 101, 99, 100, 1000)], [], 10)!
    const poc = p.bins.find(b => b.isPOC)!
    expect(poc.volume).toBe(Math.max(...p.bins.map(b => b.volume)))
  })

  it('POC price matches profile.poc', () => {
    const p = buildVolumeProfile([makeCandle(0)], [], 20)!
    const pocBin = p.bins.find(b => b.isPOC)!
    expect(p.poc).toBeCloseTo(pocBin.price, 3)
  })

  it('Value Area covers ≥70% of total volume', () => {
    const p = buildVolumeProfile([makeCandle(0, 100, 120, 80, 100, 10_000)], [], 20)!
    const vaVol = p.bins.filter(b => b.isVA).reduce((s, b) => s + b.volume, 0)
    expect(vaVol / p.totalVolume).toBeGreaterThanOrEqual(0.7 - 1e-9)
  })

  it('VAH ≥ VAL', () => {
    const p = buildVolumeProfile([makeCandle(0)], [], 20)!
    expect(p.vah).toBeGreaterThanOrEqual(p.val)
  })

  it('VAH ≤ rangeH and VAL ≥ rangeL', () => {
    const p = buildVolumeProfile([makeCandle(0)], [], 20)!
    expect(p.vah).toBeLessThanOrEqual(p.rangeH + 1e-9)
    expect(p.val).toBeGreaterThanOrEqual(p.rangeL - 1e-9)
  })

  it('trade prints override OHLCV volume for their bins', () => {
    const candle = makeCandle(0, 100, 110, 90, 100, 100)
    // Place a massive trade at 105 — that bin should dominate
    const trades: Trade[] = [makeTrade(105, 99_999)]
    const p = buildVolumeProfile([candle], trades, 10)!
    // The bin containing price 105 should have high volume
    const bigBin = p.bins.reduce((a, b) => a.volume > b.volume ? a : b)
    expect(bigBin.price).toBeGreaterThanOrEqual(100)
    expect(bigBin.price).toBeLessThanOrEqual(110)
    expect(bigBin.volume).toBeGreaterThan(1000) // far more than OHLCV
  })

  it('range includes all candle highs and lows', () => {
    const candles = [
      makeCandle(0,   100, 150, 80, 100, 1000),
      makeCandle(60,  100, 200, 50, 100, 1000),
    ]
    const p = buildVolumeProfile(candles, [], 20)!
    expect(p.rangeH).toBeGreaterThanOrEqual(200)
    expect(p.rangeL).toBeLessThanOrEqual(50)
  })
})

// ── priceToProfileBin ─────────────────────────────────────────────────────────

describe('priceToProfileBin', () => {
  const p = buildVolumeProfile([makeCandle(0, 100, 200, 100, 150, 1000)], [], 10)!

  it('returns -1 for price below range', () => {
    expect(priceToProfileBin(p, 0)).toBe(-1)
  })

  it('returns -1 for price above range', () => {
    expect(priceToProfileBin(p, 9999)).toBe(-1)
  })

  it('returns 0 for price at rangeL', () => {
    expect(priceToProfileBin(p, p.rangeL)).toBe(0)
  })

  it('returns binCount-1 for price near rangeH', () => {
    expect(priceToProfileBin(p, p.rangeH - 0.01)).toBe(p.binCount - 1)
  })
})

// ── normaliseProfile ──────────────────────────────────────────────────────────

describe('normaliseProfile', () => {
  it('POC bin normalises to 1.0', () => {
    const p = buildVolumeProfile([makeCandle(0)], [], 10)!
    const norms = normaliseProfile(p)
    const pocIdx = p.bins.findIndex(b => b.isPOC)
    expect(norms[pocIdx]).toBeCloseTo(1.0)
  })

  it('all values are in [0, 1]', () => {
    const p = buildVolumeProfile([makeCandle(0)], [], 10)!
    const norms = normaliseProfile(p)
    for (const n of norms) {
      expect(n).toBeGreaterThanOrEqual(0)
      expect(n).toBeLessThanOrEqual(1 + 1e-9)
    }
  })
})
