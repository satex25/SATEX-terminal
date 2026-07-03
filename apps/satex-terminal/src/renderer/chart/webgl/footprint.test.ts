/**
 * SATEX — footprint.ts unit tests (CHART-11)
 */
import { describe, it, expect } from 'vitest'
import {
  bucketPrice,
  buildFootprint,
  maxCellVolume,
  frustumCullFootprints,
} from './footprint'
import type { Candle } from '@shared/types'
import type { Trade } from '@shared/types'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeCandle(time: number, o = 100, h = 105, l = 95, c = 102, v = 1000): Candle {
  return { time, open: o, high: h, low: l, close: c, volume: v }
}

function makeTrade(
  tsMs: number,
  price: number,
  size: number,
  side: 'buy' | 'sell',
  provenance: 'real' | 'inferred' = 'real',
): Trade {
  return { symbol: 'TEST', ts: tsMs, price, size, side, provenance }
}

// ── bucketPrice ───────────────────────────────────────────────────────────────

describe('bucketPrice', () => {
  it('returns lower bound for exact bucket boundary', () => {
    expect(bucketPrice(100.25, 0.25)).toBeCloseTo(100.25)
  })

  it('rounds DOWN to lower bucket for fractional price', () => {
    expect(bucketPrice(100.37, 0.25)).toBeCloseTo(100.25)
  })

  it('handles prices below integer boundary', () => {
    expect(bucketPrice(99.99, 0.25)).toBeCloseTo(99.75)
  })

  it('whole-dollar bucket size', () => {
    expect(bucketPrice(103.7, 1)).toBeCloseTo(103)
  })
})

// ── buildFootprint ────────────────────────────────────────────────────────────

describe('buildFootprint', () => {
  it('returns empty array for empty candles input', () => {
    expect(buildFootprint([], [])).toEqual([])
  })

  it('returns candle with empty cells when no trades present', () => {
    const candles = [makeCandle(1_000_000)]
    const result  = buildFootprint(candles, [])
    expect(result).toHaveLength(1)
    expect(result[0]!.cells).toHaveLength(0)
    expect(result[0]!.totalVolume).toBe(0)
  })

  it('aggregates buy and sell trades into correct buckets', () => {
    // Candle opens at t=1_000_000 s, lasts 60 s
    const t0 = 1_000_000
    const candles = [makeCandle(t0)]
    const trades: Trade[] = [
      makeTrade((t0 + 10) * 1000, 100.10, 5, 'buy'),   // bucket 100.00
      makeTrade((t0 + 20) * 1000, 100.20, 3, 'sell'),  // bucket 100.00
      makeTrade((t0 + 30) * 1000, 100.30, 7, 'buy'),   // bucket 100.25
    ]
    const [fp] = buildFootprint(candles, trades, 0.25)!
    expect(fp!.cells).toHaveLength(2)

    const cell100 = fp!.cells.find(c => Math.abs(c.price - 100.0) < 0.001)!
    expect(cell100.buyVol).toBe(5)
    expect(cell100.sellVol).toBe(3)
    expect(cell100.delta).toBe(2)

    const cell10025 = fp!.cells.find(c => Math.abs(c.price - 100.25) < 0.001)!
    expect(cell10025.buyVol).toBe(7)
    expect(cell10025.sellVol).toBe(0)
  })

  it('correctly totals volume and delta', () => {
    const t0 = 2_000_000
    const candles = [makeCandle(t0)]
    const trades: Trade[] = [
      makeTrade((t0 + 5) * 1000,  100.0, 10, 'buy'),
      makeTrade((t0 + 15) * 1000, 100.0,  4, 'sell'),
    ]
    const [fp] = buildFootprint(candles, trades, 0.25)!
    expect(fp!.totalVolume).toBe(14)
    expect(fp!.totalDelta).toBe(6)   // 10 - 4
  })

  it('identifies POC as price level with highest total volume', () => {
    const t0 = 3_000_000
    const candles = [makeCandle(t0)]
    const trades: Trade[] = [
      makeTrade((t0 + 5) * 1000,  100.0,  2, 'buy'),
      makeTrade((t0 + 10) * 1000, 101.0, 10, 'buy'),  // highest vol → POC
      makeTrade((t0 + 15) * 1000, 101.0,  5, 'sell'),
    ]
    const [fp] = buildFootprint(candles, trades, 1.0)!
    // bucket 101 has 10+5=15, bucket 100 has 2 → POC = 101
    expect(fp!.poc).toBeCloseTo(101)
  })

  it('assigns provenance = mixed when both real and inferred present', () => {
    const t0 = 4_000_000
    const candles = [makeCandle(t0)]
    const trades: Trade[] = [
      makeTrade((t0 + 5) * 1000,  100.0, 1, 'buy', 'real'),
      makeTrade((t0 + 10) * 1000, 100.0, 1, 'buy', 'inferred'),
    ]
    const [fp] = buildFootprint(candles, trades, 0.25)!
    expect(fp!.cells[0]!.provenance).toBe('mixed')
  })

  it('correctly spans multiple candles', () => {
    const t0 = 5_000_000
    // Two 60-second candles
    const candles = [makeCandle(t0), makeCandle(t0 + 60)]
    const trades: Trade[] = [
      makeTrade((t0 + 10)  * 1000, 100.0, 5, 'buy'),   // candle 0
      makeTrade((t0 + 70)  * 1000, 101.0, 3, 'sell'),  // candle 1
    ]
    const fps = buildFootprint(candles, trades, 1.0)
    expect(fps).toHaveLength(2)
    expect(fps[0]!.totalVolume).toBe(5)
    expect(fps[1]!.totalVolume).toBe(3)
  })

  it('throws for invalid bucketSize', () => {
    expect(() => buildFootprint([makeCandle(0)], [], 0)).toThrow('bucketSize')
    expect(() => buildFootprint([makeCandle(0)], [], -1)).toThrow('bucketSize')
  })

  it('cells are sorted ascending by price', () => {
    const t0 = 6_000_000
    const candles = [makeCandle(t0)]
    const trades: Trade[] = [
      makeTrade((t0 + 5) * 1000,  102.0, 1, 'buy'),
      makeTrade((t0 + 10) * 1000, 100.0, 1, 'buy'),
      makeTrade((t0 + 15) * 1000, 101.0, 1, 'buy'),
    ]
    const [fp] = buildFootprint(candles, trades, 1.0)!
    const prices = fp!.cells.map(c => c.price)
    expect(prices).toEqual([...prices].sort((a, b) => a - b))
  })
})

// ── maxCellVolume ─────────────────────────────────────────────────────────────

describe('maxCellVolume', () => {
  it('returns 0 for empty input', () => {
    expect(maxCellVolume([])).toBe(0)
  })

  it('returns max total cell volume across all footprints', () => {
    const t0 = 7_000_000
    const candles = [makeCandle(t0)]
    const trades: Trade[] = [
      makeTrade((t0 + 5) * 1000, 100.0, 8, 'buy'),
      makeTrade((t0 + 10) * 1000, 101.0, 2, 'sell'),
    ]
    const fps = buildFootprint(candles, trades, 1.0)
    expect(maxCellVolume(fps)).toBe(8)  // cell at 100.0 has vol=8
  })
})

// ── frustumCullFootprints ─────────────────────────────────────────────────────

describe('frustumCullFootprints', () => {
  const fps = [
    { time: 100, bucketSize: 1, cells: [], totalVolume: 0, totalDelta: 0, poc: 0 },
    { time: 200, bucketSize: 1, cells: [], totalVolume: 0, totalDelta: 0, poc: 0 },
    { time: 300, bucketSize: 1, cells: [], totalVolume: 0, totalDelta: 0, poc: 0 },
    { time: 400, bucketSize: 1, cells: [], totalVolume: 0, totalDelta: 0, poc: 0 },
  ]

  it('returns all candles within padded range', () => {
    // Range 150..350, ±5% of 200 = ±10; so effective 140..360
    const result = frustumCullFootprints(fps, 150, 350)
    const times  = result.map(f => f.time)
    expect(times).toContain(200)
    expect(times).toContain(300)
  })

  it('excludes candles far outside range', () => {
    const result = frustumCullFootprints(fps, 250, 350)
    const times  = result.map(f => f.time)
    expect(times).not.toContain(100)
  })
})
