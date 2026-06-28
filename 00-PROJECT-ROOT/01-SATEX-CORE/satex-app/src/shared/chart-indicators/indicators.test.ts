/**
 * Unit tests for all 6 chart indicators against hand-calculated references.
 * Run via: npm test
 *
 * Each indicator has at least one test that locks down the math against
 * an externally-verified value. We're not testing the chart-rendering
 * integration here — that's a separate concern at the panel layer.
 */
import { describe, expect, it } from 'vitest'
import { emaSeries, emaLatest } from './ema'
import { rsiSeries } from './rsi'
import { detectDoubleTops } from './double-top'
import { detectDoubleBottoms } from './double-bottom'
import { computeFibonacci } from './fibonacci'
import { computePivotPoints, priorDayFromCandles } from './pivot-points'
import { swingHighs, swingLows, averageVolume } from './swing-points'
import type { Candle } from '../types'

function candle(overrides: Partial<Candle>): Candle {
  return {
    time: 0,
    open: 100,
    high: 100,
    low: 100,
    close: 100,
    volume: 1000,
    ...overrides,
  }
}

function flatCandles(closes: number[]): Candle[] {
  return closes.map((c, i) => candle({
    time: i,
    open: c, high: c, low: c, close: c, volume: 1000,
  }))
}

// ── EMA ──────────────────────────────────────────────────────────────────

describe('emaSeries', () => {
  it('returns NaN-only when fewer candles than period', () => {
    const out = emaSeries(flatCandles([1, 2, 3]), 5)
    expect(out.values.every(v => Number.isNaN(v))).toBe(true)
  })

  it('seeds with SMA at index period-1, then EMA-recurses', () => {
    // Period 3, closes [1, 2, 3, 4, 5, 6]
    // SMA seed at i=2: (1+2+3)/3 = 2
    // k = 2 / (3+1) = 0.5
    // i=3: 4*0.5 + 2*0.5 = 3
    // i=4: 5*0.5 + 3*0.5 = 4
    // i=5: 6*0.5 + 4*0.5 = 5
    const out = emaSeries(flatCandles([1, 2, 3, 4, 5, 6]), 3)
    expect(Number.isNaN(out.values[0]!)).toBe(true)
    expect(Number.isNaN(out.values[1]!)).toBe(true)
    expect(out.values[2]).toBeCloseTo(2, 10)
    expect(out.values[3]).toBeCloseTo(3, 10)
    expect(out.values[4]).toBeCloseTo(4, 10)
    expect(out.values[5]).toBeCloseTo(5, 10)
  })

  it('label includes the period', () => {
    expect(emaSeries(flatCandles([1]), 21).label).toBe('EMA(21)')
  })

  it('emaLatest returns finite scalar matching tail of series', () => {
    const candles = flatCandles([1, 2, 3, 4, 5, 6])
    const series = emaSeries(candles, 3)
    expect(emaLatest(candles, 3)).toBeCloseTo(series.values[5]!, 10)
  })

  it('emaLatest returns NaN when insufficient data', () => {
    expect(Number.isNaN(emaLatest(flatCandles([1, 2]), 5))).toBe(true)
  })
})

// ── RSI ──────────────────────────────────────────────────────────────────

describe('rsiSeries', () => {
  it('returns NaN-only when fewer than period+1 candles', () => {
    const out = rsiSeries(flatCandles([1, 2, 3]), 14)
    expect(out.values.every(v => Number.isNaN(v))).toBe(true)
  })

  it('returns 100 when there are only gains', () => {
    // Strictly ascending — no losses → AvgLoss=0 → RSI=100
    const out = rsiSeries(flatCandles([1, 2, 3, 4, 5, 6]), 5)
    expect(out.values[5]).toBe(100)
  })

  it('returns ~50 for symmetric up-down moves of equal magnitude', () => {
    // Equal alternating +1/-1 keeps AvgGain ≈ AvgLoss → RSI ≈ 50.
    // Long alternating sequence so the Wilder smoothing converges.
    const seq = [10]
    for (let i = 0; i < 60; i++) seq.push(seq[seq.length - 1]! + (i % 2 === 0 ? 1 : -1))
    const out = rsiSeries(flatCandles(seq), 14)
    const final = out.values[out.values.length - 1]!
    expect(final).toBeGreaterThan(40)
    expect(final).toBeLessThan(60)
  })

  it('label includes the period', () => {
    expect(rsiSeries(flatCandles([1, 2, 3]), 14).label).toBe('RSI(14)')
  })
})

// ── Swing points ─────────────────────────────────────────────────────────

describe('swingHighs / swingLows', () => {
  it('detects a clear local peak with window=2', () => {
    // Highs:    1 2 3 2 1 — peak at index 2
    const candles = flatCandles([10, 11, 12, 11, 10]).map((c, i) => candle({
      ...c,
      time: i,
      high: c.close + 1,   // offset highs to differentiate from closes
    }))
    const hs = swingHighs(candles, 2)
    expect(hs.length).toBe(1)
    expect(hs[0]!.index).toBe(2)
  })

  it('detects a clear local trough with window=2', () => {
    const candles = flatCandles([12, 11, 10, 11, 12]).map((c, i) => candle({
      ...c,
      time: i,
      low: c.close - 1,
    }))
    const ls = swingLows(candles, 2)
    expect(ls.length).toBe(1)
    expect(ls[0]!.index).toBe(2)
  })

  it('rejects equal-magnitude bars (uses strict inequality)', () => {
    // Flat sequence has no peaks/troughs.
    expect(swingHighs(flatCandles([5, 5, 5, 5, 5]), 2)).toEqual([])
    expect(swingLows(flatCandles([5, 5, 5, 5, 5]), 2)).toEqual([])
  })
})

describe('averageVolume', () => {
  it('averages last N candle volumes', () => {
    const candles: Candle[] = [
      candle({ volume: 100 }),
      candle({ volume: 200 }),
      candle({ volume: 300 }),
    ]
    expect(averageVolume(candles, 3)).toBe(200)
  })

  it('handles empty input', () => {
    expect(averageVolume([], 10)).toBe(0)
  })
})

// ── Double Top ───────────────────────────────────────────────────────────

describe('detectDoubleTops', () => {
  it('detects a textbook double top within tolerance', () => {
    // Build: rise to 100, dip to 90, rise to 100.5 (~0.5% off), dip to 88,
    // breakout-down to 85 with high volume.
    const seq: Array<[number, number, number]> = [
      // [low, high, close]
      [50,  51,  50],
      [60,  61,  60],
      [70,  71,  70],
      [80,  81,  80],
      [99, 100,  99],  // peak A (i=4)
      [89,  90,  89],
      [88,  89,  88],
      [87,  88,  87],
      [88,  89,  88],
      [99, 100.5, 99], // peak B (i=9) — within 0.5% of A
      [88,  89,  88],
      [85,  86,  85],  // dip below neckline (neckline ≈ 87)
      [82,  84,  82],  // breakout — close below 87 (but neckline is 87)
    ]
    const candles: Candle[] = seq.map(([low, high, close], i) => candle({
      time: i, open: close, high, low, close, volume: 1000,
    }))
    // Force big volume on breakout candle for confirmation.
    candles[12] = candle({ ...candles[12]!, volume: 5000 })

    const tops = detectDoubleTops(candles, { swingWindow: 2 })
    expect(tops.length).toBeGreaterThanOrEqual(1)
    const t = tops[0]!
    expect(t.kind).toBe('double-top')
    expect(t.symmetry).toBeLessThan(0.03)
    // Neckline is the lowest low between A(i=4) and B(i=9), inclusive.
    // Lowest .low in that range is 87 at i=7.
    expect(t.neckline).toBe(87)
  })

  it('rejects pairs outside tolerance', () => {
    // Two peaks differing by 10% — well outside default 3%.
    const candles: Candle[] = [
      candle({ time: 0, low: 50,  high: 51,  close: 50 }),
      candle({ time: 1, low: 60,  high: 61,  close: 60 }),
      candle({ time: 2, low: 70,  high: 71,  close: 70 }),
      candle({ time: 3, low: 99,  high: 100, close: 99 }),  // peak A
      candle({ time: 4, low: 80,  high: 81,  close: 80 }),
      candle({ time: 5, low: 75,  high: 76,  close: 75 }),
      candle({ time: 6, low: 80,  high: 81,  close: 80 }),
      candle({ time: 7, low: 89,  high: 90,  close: 89 }),  // peak B — 10% lower
      candle({ time: 8, low: 80,  high: 81,  close: 80 }),
    ]
    expect(detectDoubleTops(candles, { swingWindow: 2 })).toEqual([])
  })
})

// ── Double Bottom ────────────────────────────────────────────────────────

describe('detectDoubleBottoms', () => {
  it('detects a textbook double bottom within tolerance', () => {
    // Troughs are ≥ minSeparation (default 5) bars apart so the pair is
    // accepted. Spec wants this gap to prevent adjacent jitter registering.
    const seq: Array<[number, number, number]> = [
      [99, 100, 99],
      [89,  90, 89],
      [79,  80, 79],
      [49,  50, 50],     // trough A (i=3)
      [60,  61, 60],
      [70,  71, 70],
      [70,  72, 70],     // highest high between A and B → neckline = 72
      [60,  61, 60],
      [60,  61, 60],
      [49.5, 50.5, 50],  // trough B (i=9) — 6 bars after A, within 1% of A
      [60,  61, 60],
      [73,  75, 75],     // breakout — close above 72 with high volume (i=11)
    ]
    const candles: Candle[] = seq.map(([low, high, close], i) => candle({
      time: i, open: close, high, low, close, volume: 1000,
    }))
    candles[11] = candle({ ...candles[11]!, volume: 5000 })

    const bots = detectDoubleBottoms(candles, { swingWindow: 2 })
    expect(bots.length).toBeGreaterThanOrEqual(1)
    const b = bots[0]!
    expect(b.kind).toBe('double-bottom')
    expect(b.symmetry).toBeLessThan(0.03)
    expect(b.neckline).toBe(72)
  })

  it('rejects troughs closer than minSeparation', () => {
    // Two troughs only 3 bars apart — rejected by default minSeparation=5.
    const candles: Candle[] = [
      candle({ time: 0, low: 90,  high: 91,  close: 90 }),
      candle({ time: 1, low: 50,  high: 51,  close: 50 }),  // trough A
      candle({ time: 2, low: 60,  high: 61,  close: 60 }),
      candle({ time: 3, low: 70,  high: 71,  close: 70 }),
      candle({ time: 4, low: 50.5, high: 51.5, close: 50.5 }), // trough B (3 bars away)
      candle({ time: 5, low: 80,  high: 81,  close: 80 }),
      candle({ time: 6, low: 90,  high: 91,  close: 90 }),
    ]
    expect(detectDoubleBottoms(candles, { swingWindow: 2 })).toEqual([])
  })
})

// ── Double-Pattern Symmetry (P-034 negative-price denominator guard) ──

describe('double-pattern symmetry — negative-price denominator (P-034)', () => {
  // Negative-priced instruments are inside SATEX's universe (CL crude printed
  // negative in Apr 2020). The symmetry gate divides by the anchor price; the
  // raw (signed) denominator made the `> tolerance` filter never reject for
  // negative anchors. Guard: denominator = |a.price|, skip a zero anchor.

  it('rejects far-apart negative-price double-bottom troughs', () => {
    // Trough A high-magnitude -100, trough B -150 (50% apart) → must reject.
    const seq: Array<[number, number, number]> = [
      [-90, -89, -90], [-92, -91, -92], [-94, -93, -94],
      [-100, -99, -100],                 // trough A (i=3)
      [-93, -92, -93], [-91, -90, -91],
      [-90, -88, -90],                   // peak between → neckline
      [-92, -91, -92], [-93, -92, -93],
      [-150, -149, -150],                // trough B (i=9) — 50% deeper
      [-93, -92, -93], [-90, -89, -90], [-90, -89, -90],
    ]
    const candles: Candle[] = seq.map(([low, high, close], i) =>
      candle({ time: i, open: close, high, low, close, volume: 1000 }))
    expect(detectDoubleBottoms(candles, { swingWindow: 2 })).toEqual([])
  })

  it('accepts within-tolerance negative-price double-bottom with positive symmetry', () => {
    const seq: Array<[number, number, number]> = [
      [-90, -89, -90], [-92, -91, -92], [-94, -93, -94],
      [-100, -99, -100],                 // trough A (i=3)
      [-93, -92, -93], [-91, -90, -91],
      [-90, -88, -90],                   // neckline peak
      [-92, -91, -92], [-93, -92, -93],
      [-102, -101, -102],                // trough B (i=9) — 2% of A
      [-93, -92, -93], [-90, -89, -90], [-90, -89, -90],
    ]
    const candles: Candle[] = seq.map(([low, high, close], i) =>
      candle({ time: i, open: close, high, low, close, volume: 1000 }))
    const bots = detectDoubleBottoms(candles, { swingWindow: 2 })
    expect(bots.length).toBeGreaterThanOrEqual(1)
    expect(bots[0]!.symmetry).toBeGreaterThan(0)
    expect(bots[0]!.symmetry).toBeLessThan(0.03)
  })

  it('rejects far-apart negative-price double-top peaks', () => {
    // Peak A high -90, peak B high -45 (50% apart) → must reject.
    const seq: Array<[number, number, number]> = [
      [-101, -100, -101], [-103, -102, -103], [-105, -104, -105],
      [-91, -90, -91],                   // peak A (i=3)
      [-103, -102, -103], [-104, -103, -104],
      [-106, -105, -106],                // trough between → neckline
      [-103, -102, -103], [-104, -103, -104],
      [-46, -45, -46],                   // peak B (i=9) — 50% higher
      [-103, -102, -103], [-101, -100, -101], [-101, -100, -101],
    ]
    const candles: Candle[] = seq.map(([low, high, close], i) =>
      candle({ time: i, open: close, high, low, close, volume: 1000 }))
    expect(detectDoubleTops(candles, { swingWindow: 2 })).toEqual([])
  })

  it('accepts within-tolerance negative-price double-top with positive symmetry', () => {
    const seq: Array<[number, number, number]> = [
      [-101, -100, -101], [-103, -102, -103], [-105, -104, -105],
      [-91, -90, -91],                   // peak A (i=3)
      [-103, -102, -103], [-104, -103, -104],
      [-106, -105, -106],                // neckline trough
      [-103, -102, -103], [-104, -103, -104],
      [-93, -92, -93],                   // peak B (i=9) — ~2.2% of A
      [-103, -102, -103], [-101, -100, -101], [-101, -100, -101],
    ]
    const candles: Candle[] = seq.map(([low, high, close], i) =>
      candle({ time: i, open: close, high, low, close, volume: 1000 }))
    const tops = detectDoubleTops(candles, { swingWindow: 2 })
    expect(tops.length).toBeGreaterThanOrEqual(1)
    expect(tops[0]!.symmetry).toBeGreaterThan(0)
    expect(tops[0]!.symmetry).toBeLessThan(0.03)
  })
})

// ── Fibonacci ────────────────────────────────────────────────────────────

describe('computeFibonacci', () => {
  it('returns 5 standard ratios', () => {
    // Need a non-zero range. Make low=0 at i=0 and high=100 at i=49.
    const candles: Candle[] = []
    for (let i = 0; i < 50; i++) {
      const v = i * 2     // 0, 2, 4, ... 98
      candles.push(candle({
        time: i, open: v, high: v, low: v, close: v, volume: 100,
      }))
    }
    // Override extremes.
    candles[0]  = candle({ ...candles[0]!,  low: 0,   high: 0,   close: 0 })
    candles[49] = candle({ ...candles[49]!, low: 100, high: 100, close: 100 })

    const out = computeFibonacci(candles, { lookback: 50 })
    expect(out.levels.length).toBe(5)
    // Uptrend (high after low) — fibs retrace down from high (100).
    // 0.618 retracement = 100 - 100*0.618 = 38.2
    const fib618 = out.levels.find(l => l.label.startsWith('Fib 61.8'))
    expect(fib618).toBeDefined()
    expect(fib618!.price).toBeCloseTo(38.2, 6)
  })

  it('returns empty when range is zero', () => {
    const candles = flatCandles([10, 10, 10, 10, 10])
    expect(computeFibonacci(candles).levels).toEqual([])
  })

  it('handles empty input', () => {
    expect(computeFibonacci([]).levels).toEqual([])
  })
})

// ── Pivot Points ─────────────────────────────────────────────────────────

describe('computePivotPoints', () => {
  it('matches the standard floor formula to 4 decimal places', () => {
    // H=110, L=90, C=100  ⇒  PP=100  R1=110  S1=90  R2=120  S2=80
    // R3 = 110 + 2*(100-90) = 130   S3 = 90 - 2*(110-100) = 70
    const out = computePivotPoints({ high: 110, low: 90, close: 100 })
    const byLabel = Object.fromEntries(out.levels.map(l => [l.label, l.price]))
    expect(byLabel['PP']).toBeCloseTo(100, 4)
    expect(byLabel['R1']).toBeCloseTo(110, 4)
    expect(byLabel['S1']).toBeCloseTo(90,  4)
    expect(byLabel['R2']).toBeCloseTo(120, 4)
    expect(byLabel['S2']).toBeCloseTo(80,  4)
    expect(byLabel['R3']).toBeCloseTo(130, 4)
    expect(byLabel['S3']).toBeCloseTo(70,  4)
  })
})

describe('priorDayFromCandles', () => {
  it('extracts prior-day HLC from a 2-day candle array', () => {
    const DAY = 86400
    // Day 1 (epoch 0): high=110, low=90, close=105
    // Day 2 (epoch DAY): a couple of bars
    const candles = [
      candle({ time: 100,        high: 110, low: 90,  close: 105 }),
      candle({ time: DAY + 100,  high: 120, low: 100, close: 115 }),
    ]
    const p = priorDayFromCandles(candles)
    expect(p).not.toBeNull()
    expect(p!.high).toBe(110)
    expect(p!.low).toBe(90)
    expect(p!.close).toBe(105)
  })

  it('returns null if no completed prior day', () => {
    const candles = [
      candle({ time: 100,  high: 110, low: 90,  close: 105 }),
      candle({ time: 200,  high: 120, low: 100, close: 115 }),
    ]
    expect(priorDayFromCandles(candles)).toBeNull()
  })
})
