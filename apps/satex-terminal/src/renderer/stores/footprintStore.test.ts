/**
 * SATEX — Footprint store characterization coverage.
 *
 * Pins the store-level reducer behavior around the single shared
 * FootprintAggregator: an empty / null batch is a no-op, a batch is ONE version
 * bump (not per-trade), ingested trades reach the aggregator, and reset() clears
 * every candle while bumping version. Characterization tests: they assert
 * MEASURED current behavior, so a refactor that changes the version-bump cadence
 * (e.g. bumping per-trade) or drops the empty-batch guard turns red.
 *
 * The `useFootprintCandles` hook selector (needs renderHook + jsdom) is DEFERRED
 * to a follow-up — its load-bearing ingest/reset/version machinery is the
 * node-testable part and is pinned here via getState().
 */
import { beforeEach, describe, expect, it } from 'vitest'
import type { Trade } from '@shared/types'
import { useFootprintStore } from './footprintStore'

function trade(symbol: string, price: number, size = 1, side: Trade['side'] = 'buy'): Trade {
  return { symbol, ts: 1_700_000_000_000, price, size, side, provenance: 'inferred' }
}

beforeEach(() => {
  // getInitialState() restores version:0 but returns the SAME shared aggregator
  // instance — clear its candles too so trades don't leak between tests.
  useFootprintStore.setState(useFootprintStore.getInitialState(), true)
  useFootprintStore.getState().agg.clearAll()
})

describe('footprintStore — ingest guards', () => {
  it('ingest([]) is a no-op (version unchanged, aggregator untouched)', () => {
    const v0 = useFootprintStore.getState().version
    useFootprintStore.getState().ingest([])
    expect(useFootprintStore.getState().version).toBe(v0)
    expect(useFootprintStore.getState().agg.recent('AAPL')).toEqual([])
  })

  it('ingest(null) is a no-op (defends the !trades guard)', () => {
    const v0 = useFootprintStore.getState().version
    useFootprintStore.getState().ingest(null as unknown as Trade[])
    expect(useFootprintStore.getState().version).toBe(v0)
  })
})

describe('footprintStore — ingest', () => {
  it('a single-trade batch bumps version by exactly 1 and reaches the aggregator', () => {
    const v0 = useFootprintStore.getState().version
    useFootprintStore.getState().ingest([trade('AAPL', 100)])
    expect(useFootprintStore.getState().version).toBe(v0 + 1)
    const candles = useFootprintStore.getState().agg.recent('AAPL')
    expect(candles.length).toBe(1)
    expect(candles[0]?.totalAsk).toBe(1) // one aggressive 'buy' size-1 print → ask side
  })

  it('a 3-trade batch is ONE version bump (batch, not per-trade)', () => {
    const v0 = useFootprintStore.getState().version
    useFootprintStore.getState().ingest([
      trade('AAPL', 100), trade('AAPL', 100.01), trade('AAPL', 100.02),
    ])
    expect(useFootprintStore.getState().version).toBe(v0 + 1)
  })

  it('accumulates across separate ingest calls (shared aggregator, one bump each)', () => {
    const ingest = useFootprintStore.getState().ingest
    ingest([trade('AAPL', 100)])
    ingest([trade('AAPL', 100)])
    // same symbol + candleTime + price level → one bucket, summed size.
    const candles = useFootprintStore.getState().agg.recent('AAPL')
    expect(candles.length).toBe(1)
    expect(candles[0]?.totalAsk).toBe(2)
    expect(useFootprintStore.getState().version).toBe(2)
  })
})

describe('footprintStore — reset', () => {
  it('reset() bumps version and clears every candle', () => {
    useFootprintStore.getState().ingest([trade('AAPL', 100)])
    const vAfterIngest = useFootprintStore.getState().version
    useFootprintStore.getState().reset()
    expect(useFootprintStore.getState().version).toBe(vAfterIngest + 1)
    expect(useFootprintStore.getState().agg.recent('AAPL')).toEqual([])
  })
})
