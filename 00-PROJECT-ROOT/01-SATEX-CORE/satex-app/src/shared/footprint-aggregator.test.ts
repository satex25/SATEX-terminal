/**
 * SATEX — FootprintAggregator unit tests (P0-1 · 2026-05-15).
 *
 * Locks down the bid/ask split math + bucket sum invariant per
 * modern-terminal-survey.md §2 acceptance criterion:
 *   "Bid/ask split accuracy: 100% bucket sum match over 2000 trades."
 */
import { describe, expect, it } from 'vitest'
import { FootprintAggregator } from './footprint-aggregator'
import type { Trade } from './types'

function tradeAt(symbol: string, ts: number, price: number, size: number, side: 'buy' | 'sell'): Trade {
  return { symbol, ts, price, size, side, provenance: 'inferred' }
}

describe('FootprintAggregator', () => {
  it('groups trades into 1-second candles by trade ts', () => {
    const agg = new FootprintAggregator({ tickSize: 0.01, candleSec: 1 })
    // Three trades — first two in the same second, third in the next.
    agg.ingest(tradeAt('NVDA', 5_000, 100.00, 10, 'buy'))   // candleTime = 5
    agg.ingest(tradeAt('NVDA', 5_500, 100.00, 20, 'buy'))   // candleTime = 5
    agg.ingest(tradeAt('NVDA', 6_010, 100.01, 30, 'sell'))  // candleTime = 6

    const candles = agg.recent('NVDA')
    expect(candles).toHaveLength(2)
    expect(candles[0]!.candleTime).toBe(5)
    expect(candles[0]!.totalAsk).toBe(30)  // both buys
    expect(candles[0]!.totalBid).toBe(0)
    expect(candles[0]!.delta).toBe(30)
    expect(candles[1]!.candleTime).toBe(6)
    expect(candles[1]!.totalBid).toBe(30)
    expect(candles[1]!.delta).toBe(-30)
  })

  it('splits volume by aggressor side at each price level', () => {
    const agg = new FootprintAggregator({ tickSize: 0.01, candleSec: 1 })
    agg.ingest(tradeAt('NVDA', 10_000, 100.00, 50, 'buy'))
    agg.ingest(tradeAt('NVDA', 10_100, 100.00, 30, 'sell'))
    agg.ingest(tradeAt('NVDA', 10_200, 100.01, 70, 'buy'))

    const c = agg.recent('NVDA')[0]!
    const b100 = c.buckets.get(100.00)!
    const b101 = c.buckets.get(100.01)!
    expect(b100.askVolume).toBe(50)
    expect(b100.bidVolume).toBe(30)
    expect(b101.askVolume).toBe(70)
    expect(b101.bidVolume).toBe(0)
    expect(c.totalAsk).toBe(120)
    expect(c.totalBid).toBe(30)
    expect(c.delta).toBe(90)
  })

  it('discretizes price to tickSize when bucketing', () => {
    const agg = new FootprintAggregator({ tickSize: 0.05, candleSec: 1 })
    // 100.013 and 100.026 should both round to 100.00 at tickSize 0.05
    // (Math.round(100.013/0.05)*0.05 = round(2000.26)*0.05 = 2000*0.05 = 100.00,
    //  Math.round(100.026/0.05)*0.05 = round(2000.52)*0.05 = 2001*0.05 = 100.05).
    agg.ingest(tradeAt('NVDA', 20_000, 100.013, 10, 'buy'))
    agg.ingest(tradeAt('NVDA', 20_500, 100.026, 20, 'buy'))

    const c = agg.recent('NVDA')[0]!
    expect(c.buckets.size).toBe(2)
    expect([...c.buckets.keys()].sort()).toEqual([100.00, 100.05])
  })

  it('preserves per-symbol isolation', () => {
    const agg = new FootprintAggregator()
    agg.ingest(tradeAt('NVDA', 1_000, 100, 10, 'buy'))
    agg.ingest(tradeAt('SPY',  1_000, 600, 20, 'sell'))

    const nvda = agg.recent('NVDA')
    const spy  = agg.recent('SPY')
    expect(nvda).toHaveLength(1)
    expect(spy).toHaveLength(1)
    expect(nvda[0]!.delta).toBe(10)
    expect(spy[0]!.delta).toBe(-20)
  })

  it('caps history at historyLimit (oldest dropped)', () => {
    const agg = new FootprintAggregator({ candleSec: 1, historyLimit: 3 })
    for (let s = 0; s < 10; s++) {
      agg.ingest(tradeAt('NVDA', s * 1000, 100, 1, 'buy'))
    }
    const candles = agg.recent('NVDA')
    expect(candles).toHaveLength(3)
    // Most-recent 3 candles correspond to seconds 7, 8, 9
    expect(candles.map(c => c.candleTime)).toEqual([7, 8, 9])
  })

  it('handles out-of-order ts insertion', () => {
    const agg = new FootprintAggregator({ candleSec: 1 })
    agg.ingest(tradeAt('NVDA', 5_000, 100, 10, 'buy'))   // ct=5
    agg.ingest(tradeAt('NVDA', 7_000, 100, 10, 'buy'))   // ct=7
    agg.ingest(tradeAt('NVDA', 6_000, 100, 10, 'sell'))  // ct=6 (out-of-order)

    const candles = agg.recent('NVDA')
    expect(candles.map(c => c.candleTime)).toEqual([5, 6, 7])
    expect(candles[1]!.delta).toBe(-10)
  })

  it('flags hasRealProvenance when any SIP trade lands', () => {
    const agg = new FootprintAggregator()
    agg.ingest({ symbol: 'NVDA', ts: 1_000, price: 100, size: 10, side: 'buy', provenance: 'inferred' })
    let c = agg.recent('NVDA')[0]!
    expect(c.hasRealProvenance).toBe(false)
    agg.ingest({ symbol: 'NVDA', ts: 1_100, price: 100, size: 10, side: 'buy', provenance: 'real' })
    c = agg.recent('NVDA')[0]!
    expect(c.hasRealProvenance).toBe(true)
  })

  it('ignores zero / negative / non-finite size', () => {
    const agg = new FootprintAggregator()
    agg.ingest(tradeAt('NVDA', 0, 100, 0,   'buy'))
    agg.ingest(tradeAt('NVDA', 0, 100, -5,  'buy'))
    agg.ingest(tradeAt('NVDA', 0, 100, NaN, 'buy'))
    expect(agg.recent('NVDA')).toHaveLength(0)
  })

  it('100% bucket-sum invariant over 2000 random trades', () => {
    // Survey-mandated acceptance test. Sum of every bucket's bid+ask volume
    // across all candles MUST equal the sum of all ingested trade sizes —
    // no double-counting, no drops.
    const agg = new FootprintAggregator({ tickSize: 0.01, candleSec: 1, historyLimit: 5000 })
    let totalIn = 0
    let rng = 0x12345
    const rand = () => { rng = (rng * 1664525 + 1013904223) & 0x7fffffff; return rng / 0x7fffffff }
    for (let i = 0; i < 2000; i++) {
      const ts    = Math.floor(rand() * 200_000)
      const price = 100 + Math.floor(rand() * 1000) * 0.01
      const size  = 1 + Math.floor(rand() * 100)
      const side  = rand() > 0.5 ? 'buy' : 'sell'
      agg.ingest(tradeAt('NVDA', ts, price, size, side))
      totalIn += size
    }

    let totalBucketed = 0
    for (const c of agg.recent('NVDA', 5000)) {
      for (const b of c.buckets.values()) {
        totalBucketed += b.bidVolume + b.askVolume
      }
      // Per-candle consistency: bucket sums == totalBid + totalAsk
      let candleBuckets = 0
      for (const b of c.buckets.values()) candleBuckets += b.bidVolume + b.askVolume
      expect(candleBuckets).toBe(c.totalBid + c.totalAsk)
      expect(c.delta).toBe(c.totalAsk - c.totalBid)
    }
    expect(totalBucketed).toBe(totalIn)
  })

  it('clear() wipes a single symbol', () => {
    const agg = new FootprintAggregator()
    agg.ingest(tradeAt('NVDA', 0, 100, 10, 'buy'))
    agg.ingest(tradeAt('SPY',  0, 600, 20, 'buy'))
    agg.clear('NVDA')
    expect(agg.recent('NVDA')).toHaveLength(0)
    expect(agg.recent('SPY')).toHaveLength(1)
  })
})
