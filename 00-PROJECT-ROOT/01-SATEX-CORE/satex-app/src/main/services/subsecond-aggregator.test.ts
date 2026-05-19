/**
 * SATEX — Sub-second crypto candle aggregator tests (A1, v0.4.4).
 *
 * Pins the per-(symbol, bucketMs) OHLC math, the roll-then-seal contract on
 * the bucket boundary, the kind/asset-class filters, and the retention trim
 * invariant. Pure logic — no electron, no SQLite. The PersistenceShim is
 * a fake that captures inserts in an array so assertions read like a tape.
 *
 * The aggregator is a hot-path component for v0.5 scalping plays — any
 * regression here corrupts the chart timeline silently. Tests are deliberately
 * exhaustive on the edge cases: out-of-order ticks, NaN/zero size, multi-symbol
 * isolation, and the dual-bucket (250 + 500) interleaving.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { SubSecondCandleAggregator, type SubSecondCandle, type PersistenceShim, type PreferredBucket } from './subsecond-aggregator'
import type { AlpacaTick } from './alpaca'

/** Fake persistence — captures every insert + trim call. Per-test reset. */
class FakePersistence implements PersistenceShim {
  inserts: SubSecondCandle[] = []
  trims:   Array<{ symbol: string; bucketMs: number; keep: number }> = []
  /** Set to true to make insert throw — exercises the aggregator's swallow path. */
  failNext = false
  insert(c: SubSecondCandle): void {
    if (this.failNext) { this.failNext = false; throw new Error('disk full (test)') }
    this.inserts.push({ ...c })
  }
  trim(symbol: string, bucketMs: number, keep: number): number {
    this.trims.push({ symbol, bucketMs, keep })
    return 0
  }
}

/** Build a crypto trade tick. Defaults: BTC, kind='t', size=1, ts=ms. */
function tradeTick(o: Partial<AlpacaTick> & { ts: number; price: number }): AlpacaTick {
  return {
    symbol:    o.symbol    ?? 'BTC',
    price:     o.price,
    size:      o.size      ?? 1,
    bid:       o.bid       ?? 0,
    ask:       o.ask       ?? 0,
    timestamp: o.ts,
    kind:      o.kind      ?? 't',
  }
}

let fake: FakePersistence
let agg: SubSecondCandleAggregator
let emitted: SubSecondCandle[]

beforeEach(() => {
  fake = new FakePersistence()
  emitted = []
  agg = new SubSecondCandleAggregator({
    persistence: fake,
    onEmit: (c) => emitted.push({ ...c }),
    buckets: [250, 500],
    maxCandles: 1000,
  })
})

describe('SubSecondCandleAggregator — bucket math', () => {
  it('first crypto trade opens a fresh bucket with open=high=low=close', () => {
    agg.ingestTick(tradeTick({ ts: 1_000_000_000, price: 100 }))
    const state = agg._snapshotState()
    const b250 = state.get('BTC')!.get(250)!
    expect(b250.openMs).toBe(1_000_000_000) // ts already on a 250ms boundary
    expect(b250.open).toBe(100)
    expect(b250.high).toBe(100)
    expect(b250.low).toBe(100)
    expect(b250.close).toBe(100)
    expect(b250.volume).toBe(1)
  })

  it('same-bucket ticks ratchet high/low and accumulate volume; close = latest', () => {
    agg.ingestTick(tradeTick({ ts: 1_000_000_000, price: 100, size: 2 }))
    agg.ingestTick(tradeTick({ ts: 1_000_000_050, price: 102, size: 3 })) // same 250ms bucket
    agg.ingestTick(tradeTick({ ts: 1_000_000_100, price:  98, size: 1 })) // same 250ms bucket
    agg.ingestTick(tradeTick({ ts: 1_000_000_200, price: 101, size: 1 })) // same 250ms bucket
    const b250 = agg._snapshotState().get('BTC')!.get(250)!
    expect(b250.open).toBe(100)
    expect(b250.high).toBe(102)
    expect(b250.low).toBe(98)
    expect(b250.close).toBe(101)
    expect(b250.volume).toBe(7)
    // Nothing sealed yet — bucket is still in-flight.
    expect(fake.inserts).toHaveLength(0)
  })

  it('next-bucket tick seals the prior bucket and opens a new one', () => {
    agg.ingestTick(tradeTick({ ts: 1_000_000_000, price: 100, size: 2 }))
    agg.ingestTick(tradeTick({ ts: 1_000_000_125, price: 105, size: 3 }))
    // 1_000_000_250 lands in the NEXT 250ms bucket.
    agg.ingestTick(tradeTick({ ts: 1_000_000_250, price: 106, size: 1 }))

    // The 250ms bucket sealed; the 500ms bucket is still in-flight.
    const inserts250 = fake.inserts.filter(c => c.bucketMs === 250)
    expect(inserts250).toHaveLength(1)
    expect(inserts250[0]).toMatchObject({
      symbol: 'BTC', bucketMs: 250, openMs: 1_000_000_000,
      open: 100, high: 105, low: 100, close: 105, volume: 5,
    })
    // New in-flight bucket has the third tick.
    const b250 = agg._snapshotState().get('BTC')!.get(250)!
    expect(b250.openMs).toBe(1_000_000_250)
    expect(b250.open).toBe(106)
  })

  it('emits via onEmit on every seal', () => {
    agg.ingestTick(tradeTick({ ts: 1_000_000_000, price: 100 }))
    agg.ingestTick(tradeTick({ ts: 1_000_000_300, price: 105 })) // rolls 250 (1 emit)
    agg.ingestTick(tradeTick({ ts: 1_000_000_550, price: 108 })) // rolls 250 again + 500 once
    // Three seal events: 250@1_000_000_000, 250@1_000_000_250, 500@1_000_000_000.
    expect(emitted).toHaveLength(3)
    expect(emitted.filter(c => c.bucketMs === 250)).toHaveLength(2)
    expect(emitted.filter(c => c.bucketMs === 500)).toHaveLength(1)
  })
})

describe('SubSecondCandleAggregator — filters', () => {
  it('ignores quote frames (kind === "q")', () => {
    agg.ingestTick(tradeTick({ ts: 1_000_000_000, price: 100, kind: 'q' }))
    expect(agg._snapshotState().size).toBe(0)
    expect(fake.inserts).toHaveLength(0)
  })

  it('ignores non-crypto symbols (NVDA, ES, SPY)', () => {
    agg.ingestTick(tradeTick({ ts: 1_000_000_000, price: 200, symbol: 'NVDA' }))
    agg.ingestTick(tradeTick({ ts: 1_000_000_000, price: 5800, symbol: 'ES' }))
    agg.ingestTick(tradeTick({ ts: 1_000_000_000, price: 600, symbol: 'SPY' }))
    expect(agg._snapshotState().size).toBe(0)
  })

  it('ignores ticks with non-finite price or timestamp', () => {
    agg.ingestTick(tradeTick({ ts: 1_000_000_000, price: NaN }))
    agg.ingestTick(tradeTick({ ts: NaN, price: 100 }))
    agg.ingestTick(tradeTick({ ts: 1_000_000_000, price: Infinity }))
    expect(agg._snapshotState().size).toBe(0)
  })

  it('clamps non-finite or non-positive size to 0 (no volume poisoning)', () => {
    agg.ingestTick(tradeTick({ ts: 1_000_000_000, price: 100, size: NaN }))
    agg.ingestTick(tradeTick({ ts: 1_000_000_100, price: 102, size: -5 }))
    agg.ingestTick(tradeTick({ ts: 1_000_000_200, price: 101, size: 3 }))
    const b250 = agg._snapshotState().get('BTC')!.get(250)!
    expect(b250.volume).toBe(3) // only the legitimate one counted
    expect(b250.open).toBe(100)
    expect(b250.high).toBe(102)
    expect(b250.low).toBe(100)
    expect(b250.close).toBe(101)
  })

  it('drops out-of-order ticks landing in an already-passed bucket', () => {
    agg.ingestTick(tradeTick({ ts: 1_000_000_000, price: 100 }))
    agg.ingestTick(tradeTick({ ts: 1_000_000_300, price: 105 })) // seals prior 250 bucket
    // NTP-step backward — tick arrives with a ts in the already-sealed bucket.
    agg.ingestTick(tradeTick({ ts: 1_000_000_100, price: 999 }))
    // The sealed 250 row still says close=100 (unchanged).
    const inserts250 = fake.inserts.filter(c => c.bucketMs === 250)
    expect(inserts250).toHaveLength(1)
    expect(inserts250[0]!.close).toBe(100)
    // In-flight bucket at 1_000_000_250 is unaffected.
    const b250 = agg._snapshotState().get('BTC')!.get(250)!
    expect(b250.openMs).toBe(1_000_000_250)
    expect(b250.high).toBe(105) // not 999 — the stale tick is dropped
  })
})

describe('SubSecondCandleAggregator — multi-symbol + multi-bucket independence', () => {
  it('maintains isolated state for BTC and ETH', () => {
    agg.ingestTick(tradeTick({ ts: 1_000_000_000, price: 100, symbol: 'BTC' }))
    agg.ingestTick(tradeTick({ ts: 1_000_000_000, price: 3000, symbol: 'ETH' }))
    const state = agg._snapshotState()
    expect(state.get('BTC')!.get(250)!.open).toBe(100)
    expect(state.get('ETH')!.get(250)!.open).toBe(3000)
  })

  it('250 and 500 buckets advance independently against the same tick stream', () => {
    // Two ticks 300ms apart. 250 bucket rolls; 500 bucket does not.
    agg.ingestTick(tradeTick({ ts: 1_000_000_000, price: 100 }))
    agg.ingestTick(tradeTick({ ts: 1_000_000_300, price: 105 }))
    const b250 = agg._snapshotState().get('BTC')!.get(250)!
    const b500 = agg._snapshotState().get('BTC')!.get(500)!
    expect(b250.openMs).toBe(1_000_000_250) // rolled into the new 250 bucket
    expect(b250.open).toBe(105)
    expect(b500.openMs).toBe(1_000_000_000) // 500 bucket still in flight
    expect(b500.high).toBe(105) // but absorbed both ticks
  })
})

describe('SubSecondCandleAggregator — retention', () => {
  it('calls persistence.trim after every seal with the configured maxCandles', () => {
    agg.ingestTick(tradeTick({ ts: 1_000_000_000, price: 100 }))
    agg.ingestTick(tradeTick({ ts: 1_000_000_300, price: 105 }))
    // One 250 seal happened — exactly one trim call for that pair.
    const trims = fake.trims.filter(t => t.bucketMs === 250)
    expect(trims).toEqual([{ symbol: 'BTC', bucketMs: 250, keep: 1000 }])
  })

  it('honors a custom maxCandles override', () => {
    const fake2 = new FakePersistence()
    const agg2 = new SubSecondCandleAggregator({ persistence: fake2, maxCandles: 100 })
    agg2.ingestTick(tradeTick({ ts: 1_000_000_000, price: 100 }))
    agg2.ingestTick(tradeTick({ ts: 1_000_000_300, price: 105 }))
    expect(fake2.trims[0]!.keep).toBe(100)
  })
})

describe('SubSecondCandleAggregator — forceSealAll', () => {
  it('persists every in-flight bucket and clears state', () => {
    agg.ingestTick(tradeTick({ ts: 1_000_000_000, price: 100, symbol: 'BTC' }))
    agg.ingestTick(tradeTick({ ts: 1_000_000_000, price: 3000, symbol: 'ETH' }))
    expect(fake.inserts).toHaveLength(0)
    agg.forceSealAll()
    // 4 seals: BTC@250, BTC@500, ETH@250, ETH@500.
    expect(fake.inserts).toHaveLength(4)
    expect(agg._snapshotState().size).toBe(0)
  })

  it('is idempotent — second call on an empty aggregator does nothing', () => {
    agg.forceSealAll()
    agg.forceSealAll()
    expect(fake.inserts).toHaveLength(0)
    expect(emitted).toHaveLength(0)
  })
})

describe('SubSecondCandleAggregator — failure resilience', () => {
  it('swallows a persistence.insert throw and still emits to the renderer', () => {
    fake.failNext = true
    agg.ingestTick(tradeTick({ ts: 1_000_000_000, price: 100 }))
    agg.ingestTick(tradeTick({ ts: 1_000_000_300, price: 105 })) // triggers the failing seal
    // Insert threw; trim was NOT called (because the throw short-circuited);
    // but the renderer still got the bar so the chart shows a live shape.
    expect(fake.inserts).toHaveLength(0)
    expect(fake.trims.filter(t => t.bucketMs === 250)).toHaveLength(0)
    expect(emitted.filter(c => c.bucketMs === 250)).toHaveLength(1)
  })

  it('a throwing onEmit does not break the live tick path', () => {
    const agg3 = new SubSecondCandleAggregator({
      persistence: fake,
      onEmit: () => { throw new Error('renderer push failed (test)') },
    })
    agg3.ingestTick(tradeTick({ ts: 1_000_000_000, price: 100 }))
    expect(() => agg3.ingestTick(tradeTick({ ts: 1_000_000_300, price: 105 }))).not.toThrow()
  })
})

// ─── A1 Sprint 2 — per-symbol preferred bucket API ─────────────────────────
describe('SubSecondCandleAggregator — preferred bucket (Sprint 2)', () => {
  it('defaults to 250ms when no pref has been set for a crypto symbol', () => {
    expect(agg.getPreferredBucket('BTC')).toBe(250)
    expect(agg.getPreferredBucket('ETH')).toBe(250)
  })

  it('setPreferredBucket on a crypto symbol persists in-memory and is read back', () => {
    expect(agg.setPreferredBucket('BTC', 500)).toBe(500)
    expect(agg.getPreferredBucket('BTC')).toBe(500)
    // Other symbols untouched.
    expect(agg.getPreferredBucket('ETH')).toBe(250)
  })

  it('setPreferredBucket fires onPreferenceChanged on accept', () => {
    const changes: Array<{ symbol: string; ms: PreferredBucket }> = []
    const agg2 = new SubSecondCandleAggregator({
      persistence: fake,
      onPreferenceChanged: (symbol, ms) => { changes.push({ symbol, ms }) },
    })
    agg2.setPreferredBucket('BTC', 500)
    agg2.setPreferredBucket('ETH', 250)
    expect(changes).toEqual([
      { symbol: 'BTC', ms: 500 },
      { symbol: 'ETH', ms: 250 },
    ])
  })

  it('setPreferredBucket SILENTLY rejects non-crypto symbols (no fire, no mutate)', () => {
    const changes: Array<{ symbol: string; ms: PreferredBucket }> = []
    const agg2 = new SubSecondCandleAggregator({
      persistence: fake,
      onPreferenceChanged: (symbol, ms) => { changes.push({ symbol, ms }) },
    })
    // NVDA / ES / SPY are all non-crypto (NVDA = equity, ES = future, SPY = equity).
    expect(agg2.setPreferredBucket('NVDA', 500)).toBe(250) // returns current (default)
    expect(agg2.setPreferredBucket('ES',   500)).toBe(250)
    expect(agg2.setPreferredBucket('SPY',  500)).toBe(250)
    expect(changes).toHaveLength(0) // listener never fired
    // Nothing in the internal map either — verified via getAllPreferredBuckets.
    expect(agg2.getAllPreferredBuckets()).toEqual({})
  })

  it('a throwing onPreferenceChanged does NOT prevent the in-memory update', () => {
    const agg2 = new SubSecondCandleAggregator({
      persistence: fake,
      onPreferenceChanged: () => { throw new Error('disk full (test)') },
    })
    expect(() => agg2.setPreferredBucket('BTC', 500)).not.toThrow()
    // The setter swallows persistence failures — in-memory is the source of
    // truth for the live aggregator; disk durability is best-effort.
    expect(agg2.getPreferredBucket('BTC')).toBe(500)
  })

  it('hydratePreferredBuckets restores Map and drops non-crypto / out-of-range', () => {
    agg.hydratePreferredBuckets({
      BTC: 500,
      ETH: 250,
      NVDA: 250 as PreferredBucket, // non-crypto — must be dropped
      ES:   500 as PreferredBucket, // non-crypto — must be dropped
      // @ts-expect-error — testing runtime drop of an invalid value
      DOGE: 100, // value not in {250, 500} — must be dropped
    })
    expect(agg.getAllPreferredBuckets()).toEqual({ BTC: 500, ETH: 250 })
  })

  it('hydratePreferredBuckets is idempotent — calling twice gives the same state', () => {
    agg.hydratePreferredBuckets({ BTC: 500 })
    agg.hydratePreferredBuckets({ BTC: 500 })
    expect(agg.getAllPreferredBuckets()).toEqual({ BTC: 500 })
  })

  it('hydratePreferredBuckets REPLACES (not merges) — second call wins', () => {
    agg.setPreferredBucket('BTC', 500)
    agg.setPreferredBucket('ETH', 500)
    agg.hydratePreferredBuckets({ BTC: 250 })
    // ETH dropped — the new map didn't include it.
    expect(agg.getAllPreferredBuckets()).toEqual({ BTC: 250 })
  })

  it('getCandleResolutionMs returns 1000 for any non-crypto symbol', () => {
    // No pref set anywhere — non-crypto MUST be 1000 by contract so the
    // existing 1-second pipeline consumers keep working.
    expect(agg.getCandleResolutionMs('NVDA')).toBe(1000)
    expect(agg.getCandleResolutionMs('ES')).toBe(1000)
    expect(agg.getCandleResolutionMs('SPY')).toBe(1000)
  })

  it('getCandleResolutionMs returns the pref for crypto symbols (or 250 default)', () => {
    expect(agg.getCandleResolutionMs('BTC')).toBe(250) // default
    agg.setPreferredBucket('BTC', 500)
    expect(agg.getCandleResolutionMs('BTC')).toBe(500)
    // Pref doesn't leak into non-crypto resolution.
    expect(agg.getCandleResolutionMs('NVDA')).toBe(1000)
  })

  it('getAllPreferredBuckets returns a fresh object — mutation does NOT poison internal state', () => {
    agg.setPreferredBucket('BTC', 500)
    const snap = agg.getAllPreferredBuckets()
    snap['BTC'] = 250 // mutate snapshot
    snap['EVIL'] = 999 as PreferredBucket // add bogus key
    // Internal state unchanged — engine's setter is the only mutation path.
    expect(agg.getAllPreferredBuckets()).toEqual({ BTC: 500 })
  })
})
