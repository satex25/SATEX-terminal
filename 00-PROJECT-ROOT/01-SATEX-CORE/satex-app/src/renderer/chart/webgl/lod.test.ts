/**
 * SATEX — LOD bucketing unit tests (CHART-10)
 * Pure: no DOM, no WebGL.
 */
import { describe, it, expect } from 'vitest'
import { frustumCull, lodBucket, lodPipeline } from './lod'
import type { Candle } from '@shared/types'

function c(time: number, price = 100): Candle {
  return { time, open: price, high: price + 1, low: price - 1, close: price, volume: 10 }
}

const CANDLES = Array.from({ length: 10 }, (_, i) => c(1000 + i * 60))

describe('frustumCull', () => {
  it('returns [] for empty input', () => {
    expect(frustumCull([], 0, 1000)).toEqual([])
  })

  it('returns all candles when all are in range', () => {
    expect(frustumCull(CANDLES, 1000, 1540).length).toBe(10)
  })

  it('culls candles outside time range (with 5% padding)', () => {
    const culled = frustumCull(CANDLES, 1000, 1120)
    expect(culled.length).toBeGreaterThanOrEqual(3)
    expect(culled.length).toBeLessThan(10)
  })

  it('returns [] when range is entirely outside candles', () => {
    expect(frustumCull(CANDLES, 5000, 6000).length).toBe(0)
  })

  it('preserves oldest-first order', () => {
    const culled = frustumCull(CANDLES, 1000, 1540)
    for (let i = 1; i < culled.length; i++) {
      expect(culled[i]!.time).toBeGreaterThan(culled[i - 1]!.time)
    }
  })
})

describe('lodBucket', () => {
  it('returns [] for empty input', () => {
    expect(lodBucket([], 100)).toEqual([])
  })

  it('returns [] for maxBuckets=0', () => {
    expect(lodBucket(CANDLES, 0)).toEqual([])
  })

  it('returns input reference unchanged when len <= maxBuckets', () => {
    expect(lodBucket(CANDLES, 10)).toBe(CANDLES)
  })

  it('returns input reference unchanged when len < maxBuckets', () => {
    expect(lodBucket(CANDLES, 100)).toBe(CANDLES)
  })

  it('buckets to exactly maxBuckets when enough candles', () => {
    expect(lodBucket(CANDLES, 5).length).toBe(5)
  })

  it('OHLCV aggregation: H=max, L=min, V=sum, O=first, C=last', () => {
    const c1: Candle = { time: 1000, open: 100, high: 110, low: 90, close: 105, volume: 100 }
    const c2: Candle = { time: 1060, open: 105, high: 120, low: 95, close: 108, volume: 200 }
    const result = lodBucket([c1, c2], 1)
    expect(result).toHaveLength(1)
    expect(result[0]?.open).toBe(100)
    expect(result[0]?.close).toBe(108)
    expect(result[0]?.high).toBe(120)
    expect(result[0]?.low).toBe(90)
    expect(result[0]?.volume).toBe(300)
  })

  it('bucket time = first candle time in bucket', () => {
    expect(lodBucket(CANDLES, 2)[0]?.time).toBe(CANDLES[0]!.time)
  })
})

describe('lodPipeline', () => {
  it('culls then buckets in one call', () => {
    const result = lodPipeline(CANDLES, 1000, 1120, 2)
    expect(result.length).toBeGreaterThan(0)
    expect(result.length).toBeLessThanOrEqual(2)
  })
})
