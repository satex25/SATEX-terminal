/**
 * Unit tests for the core pure indicator math in `indicators.ts` — the
 * stateless, deterministic functions that feed every IndicatorSnapshot:
 * Brain decision features, the regime service's ATR input, and the chart
 * read-outs. Despite sitting on the live-decision input path it had zero
 * direct coverage. Exported surface: `rsi`, `atr`, `computeSnapshot`. The
 * internal helpers (ema, sma, vwap, trendStrength, rollingVolatility) are
 * not exported, so they are pinned through `computeSnapshot`.
 *
 * Every reference value below is hand-derived and was independently
 * recomputed against a verbatim copy of the functions before being pinned.
 */
import { describe, expect, it } from 'vitest'
import { rsi, atr, computeSnapshot } from './indicators'

type Ohlcv = { high: number; low: number; close: number; volume: number }

/** Flat OHLCV bar at `close`, overridable. */
const bar = (close: number, over: Partial<Ohlcv> = {}): Ohlcv => ({
  high: close,
  low: close,
  close,
  volume: 1000,
  ...over,
})

// ── RSI ────────────────────────────────────────────────────────────────────

describe('rsi', () => {
  it('returns neutral 50 when fewer than period+1 closes are supplied', () => {
    expect(rsi([1, 2, 3], 14)).toBe(50)
    expect(rsi([1, 2, 3])).toBe(50) // default period 14
  })

  it('returns 100 when there are no losses in the window (avgLoss === 0)', () => {
    expect(rsi([1, 2, 3, 4, 5, 6], 5)).toBe(100)
  })

  it('treats a dead-flat window as 100, since a zero diff counts as a gain', () => {
    // Documents a deliberate quirk: `diff >= 0` routes zero change to gains,
    // so a flat window has avgLoss 0 → RSI 100 (not 50). Pinned so a future
    // refactor to strict `> 0` is a conscious, reviewed choice.
    expect(rsi([10, 10, 10], 2)).toBe(100)
  })

  it('returns 50 for a balanced one-up-one-down window', () => {
    expect(rsi([10, 11, 10, 11], 2)).toBe(50)
  })

  it('computes RSI from the average-gain / average-loss ratio', () => {
    // window=2 over [10,13,12]: +3 gain, -1 loss → RS = 3 → 100 - 100/4 = 75
    expect(rsi([10, 13, 12], 2)).toBe(75)
  })
})

// ── ATR ────────────────────────────────────────────────────────────────────

describe('atr', () => {
  it('returns 0 with fewer than 2 candles', () => {
    expect(atr([], 14)).toBe(0)
    expect(atr([{ high: 10, low: 8, close: 9 }], 14)).toBe(0)
  })

  it('averages the true range across candles', () => {
    const candles = [
      { high: 10, low: 8, close: 9 },
      { high: 12, low: 9, close: 11 },
      { high: 13, low: 10, close: 12 },
    ]
    // TR1 = max(12-9, |12-9|, |9-9|) = 3 ; TR2 = max(13-10, |13-11|, |10-11|) = 3
    expect(atr(candles, 14)).toBe(3)
  })

  it('uses the gap (|high-prevClose|) when it dominates the intrabar range', () => {
    const candles = [
      { high: 10, low: 9, close: 9.5 },
      { high: 11, low: 10.8, close: 10.9 }, // bar range 0.2, but gap to 9.5 → 1.5
    ]
    expect(atr(candles, 14)).toBe(1.5)
  })
})

// ── computeSnapshot (also pins the internal ema/sma/vwap/trend/vol helpers) ──

describe('computeSnapshot', () => {
  it('returns safe defaults for empty input', () => {
    expect(computeSnapshot('X', [])).toEqual({
      symbol: 'X',
      vwap: 0,
      ema9: 0,
      ema21: 0,
      ema50: 0,
      rsi14: 50,
      atr14: 0,
      trendStrength: 0,
      volatility: 0,
    })
  })

  it('collapses every EMA and VWAP to the price on a constant series', () => {
    const flat = Array.from({ length: 20 }, () => bar(5))
    const s = computeSnapshot('FLAT', flat)
    expect(s.vwap).toBe(5)
    expect(s.ema9).toBe(5)
    expect(s.ema21).toBe(5)
    expect(s.ema50).toBe(5)
    expect(s.rsi14).toBe(100) // flat → avgLoss 0
    expect(s.atr14).toBe(0)
    expect(s.trendStrength).toBe(0)
    expect(s.volatility).toBe(0)
  })

  it('pins every derived field against a hand-computed two-bar series', () => {
    const s = computeSnapshot('RICH', [
      bar(10, { volume: 100 }),
      bar(20, { volume: 300 }),
    ])
    expect(s.vwap).toBeCloseTo(17.5, 10) // (10*100 + 20*300) / 400
    expect(s.ema9).toBeCloseTo(12, 10) // 20*0.2 + 10*0.8
    expect(s.ema21).toBeCloseTo(10.909090909090908, 9)
    expect(s.ema50).toBeCloseTo(10.392156862745098, 9)
    expect(s.rsi14).toBe(50) // < 15 closes → neutral
    expect(s.atr14).toBe(10) // single TR = |20 - 10|
    expect(s.trendStrength).toBe(0) // < 21 closes → 0
    expect(s.volatility).toBeCloseTo(33.33333333333333, 9) // stddev 5 / mean 15 * 100
  })

  it('returns vwap 0 when total volume is 0 (no divide-by-zero)', () => {
    const s = computeSnapshot('ZV', [bar(10, { volume: 0 }), bar(20, { volume: 0 })])
    expect(s.vwap).toBe(0)
  })

  it('keeps trendStrength in [0,1] and saturates a steep ramp to 1', () => {
    const ramp = Array.from({ length: 26 }, (_, i) => bar(i))
    const s = computeSnapshot('UP', ramp)
    expect(s.trendStrength).toBeGreaterThanOrEqual(0)
    expect(s.trendStrength).toBeLessThanOrEqual(1)
    expect(s.trendStrength).toBe(1) // the *200 amplifier saturates on a strong trend
    expect(s.volatility).toBeCloseTo(37.201814821518695, 6)
  })

  it('exercises the trendStrength computation path, not just the length guard', () => {
    // length 25 (>= period+1) but constant → recent EMA == older EMA → exactly 0
    const flat = Array.from({ length: 25 }, () => bar(5))
    expect(computeSnapshot('F25', flat).trendStrength).toBe(0)
    // a gentle drift lands strictly inside (0,1) — the un-clamped branch
    const gentle = Array.from({ length: 25 }, (_, i) => bar(1000 + i * 0.01))
    const ts = computeSnapshot('G', gentle).trendStrength
    expect(ts).toBeGreaterThan(0)
    expect(ts).toBeLessThan(1)
    expect(ts).toBeCloseTo(0.00888192126731521, 9)
  })
})
