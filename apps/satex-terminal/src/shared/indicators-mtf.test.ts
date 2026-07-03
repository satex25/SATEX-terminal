import { describe, expect, it } from 'vitest'
import { bucketCandles, computeMultiTimeframe, TIMEFRAME_MINUTES } from './indicators-mtf'
import type { Candle } from './types'

function bar(t: number, c: number, h = c + 0.5, l = c - 0.5, v = 1000): Candle {
  return { time: t, open: c, high: h, low: l, close: c, volume: v }
}

describe('bucketCandles', () => {
  it('returns input unchanged for 1-min target', () => {
    const xs = [bar(0, 100), bar(60, 101)]
    expect(bucketCandles(xs, 1)).toEqual(xs)
  })

  it('groups 5 contiguous 1-min bars into one 5-min bar', () => {
    const xs = [bar(0, 100), bar(60, 101), bar(120, 102), bar(180, 103), bar(240, 104)]
    const out = bucketCandles(xs, 5)
    expect(out).toHaveLength(1)
    expect(out[0]!.open).toBe(100)
    expect(out[0]!.close).toBe(104)
    expect(out[0]!.high).toBe(104.5)
    expect(out[0]!.low).toBe(99.5)
    expect(out[0]!.volume).toBe(5000)
  })

  it('aligns buckets to clock boundaries (5-min slots start at multiples of 300s)', () => {
    const xs = [bar(60, 100), bar(120, 101), bar(240, 102), bar(300, 103), bar(360, 104)]
    const out = bucketCandles(xs, 5)
    expect(out).toHaveLength(2)
    expect(out[0]!.time).toBe(0)
    expect(out[1]!.time).toBe(300)
    expect(out[0]!.close).toBe(102)
    expect(out[1]!.close).toBe(104)
  })

  it('handles empty input', () => {
    expect(bucketCandles([], 5)).toEqual([])
  })
})

describe('computeMultiTimeframe', () => {
  it('produces a snapshot for every requested timeframe', () => {
    const xs = Array.from({ length: 200 }, (_, i) => bar(i * 60, 100 + Math.sin(i / 10)))
    const mtf = computeMultiTimeframe('NVDA', xs, ['1m', '5m', '15m', '1h'])
    expect(Object.keys(mtf.byTimeframe)).toEqual(['1m', '5m', '15m', '1h'])
    for (const tf of ['1m', '5m', '15m', '1h'] as const) {
      expect(mtf.byTimeframe[tf].symbol).toBe('NVDA')
      expect(typeof mtf.byTimeframe[tf].ema9).toBe('number')
    }
  })

  it('1h timeframe has fewer effective bars (so EMAs differ from 1m)', () => {
    const xs = Array.from({ length: 200 }, (_, i) => bar(i * 60, 100 + i * 0.1))
    const mtf = computeMultiTimeframe('NVDA', xs)
    expect(mtf.byTimeframe['1m'].ema9).not.toBe(mtf.byTimeframe['1h'].ema9)
  })

  it('exports TIMEFRAME_MINUTES mapping', () => {
    expect(TIMEFRAME_MINUTES['5m']).toBe(5)
    expect(TIMEFRAME_MINUTES['1h']).toBe(60)
  })

  it('ts reflects the last candle in the input series', () => {
    const xs = [bar(0, 100), bar(60, 101), bar(120, 102)]
    const mtf = computeMultiTimeframe('NVDA', xs)
    expect(mtf.ts).toBe(120 * 1000)
  })

  it('ts is 0 when input is empty', () => {
    const mtf = computeMultiTimeframe('NVDA', [])
    expect(mtf.ts).toBe(0)
  })
})
