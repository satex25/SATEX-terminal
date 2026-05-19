/**
 * SATEX — Sub-second crypto candle aggregator (A1, v0.4.4)
 *
 * Reads from the same `AlpacaClient.onTick` stream LiveMarket consumes and
 * rolls per-trade (`kind === 't'`) frames into 250 ms and 500 ms OHLC buckets.
 * Crypto-only — `findUniverseEntry(symbol).assetClass === 'crypto'` is the
 * canonical filter (matches the A1 design doc's data-source analysis: IEX
 * equities are capped at 1-second snapshots and have no derivable sub-second
 * path without paid Alpaca SIP entitlement).
 *
 * Lifecycle:
 *   • ingestTick(tick)         — called per WS frame from trading-engine
 *   • internal buckets         — Map<symbol, Map<bucketMs, BucketState>>
 *   • bucket close             — next-bucket tick rolls the in-flight bucket
 *                                into persistence (insert) + emit callback
 *                                (push to renderer) + retention trim
 *   • forceSealAll()           — called at engine shutdown / suspend so the
 *                                most-recent partial bucket is persisted
 *
 * Pure logic — no Electron deps. Tests inject a fake persistence shim.
 *
 * Why per-tick seal-on-roll (not setInterval): the design doc's BATCH_MS coalesce
 * is achieved naturally because crypto trade frames arrive at ~50-200ms
 * intervals — the bucket close decision triggers exactly when a tick lands
 * outside the in-flight bucket. No timer needed; no work happens when the
 * stream is quiet.
 */
import { findUniverseEntry } from '@shared/constants'
import type { SubSecondCandle } from '@shared/types'
import type { AlpacaTick } from './alpaca'

// Re-export so callers that already imported the type from this module keep
// working — the canonical definition now lives in @shared/types.
export type { SubSecondCandle }

/** Inflight bucket state — mutated on each same-bucket tick. Sealed and dropped
 *  when the next-bucket tick arrives. Internal only — the persisted/emitted
 *  shape is @shared/types#SubSecondCandle. */
interface BucketState {
  openMs: number
  open:   number
  high:   number
  low:    number
  close:  number
  volume: number
}

export interface PersistenceShim {
  insert: (c: SubSecondCandle) => void
  /** Returns rows-deleted count. Aggregator doesn't currently use the return
   *  value but tests assert against it. */
  trim:   (symbol: string, bucketMs: number, keep: number) => number
}

export interface AggregatorDeps {
  persistence: PersistenceShim
  /** Optional push callback — trading-engine wires this to the renderer push
   *  channel so the chart can react to new bars as they seal. */
  onEmit?:     (c: SubSecondCandle) => void
  /** Bucket sizes to maintain, in ms. Defaults to [250, 500] per the A1 design.
   *  Pinned per-symbol changes are not supported in Sprint 1 — every crypto
   *  symbol gets both bucket sizes. */
  buckets?:    readonly number[]
  /** Retention cap per (symbol, bucketMs). At 250ms that's ~4 min of history;
   *  at 500ms ~8 min. Older rows are trimmed application-side after each
   *  insert. */
  maxCandles?: number
}

const DEFAULT_BUCKETS  = [250, 500] as const
const DEFAULT_MAX_CANDLES = 1000

export class SubSecondAggregator {
  private state = new Map<string, Map<number, BucketState>>()
  private readonly buckets:     readonly number[]
  private readonly maxCandles:  number
  private readonly persistence: PersistenceShim
  private readonly onEmit?:     (c: SubSecondCandle) => void

  constructor(deps: AggregatorDeps) {
    this.persistence = deps.persistence
    this.onEmit      = deps.onEmit
    this.buckets     = deps.buckets    ?? DEFAULT_BUCKETS
    this.maxCandles  = deps.maxCandles ?? DEFAULT_MAX_CANDLES
  }

  /** Ingests one tick from the AlpacaClient stream. Filters trade-only crypto
   *  frames and updates / rolls the appropriate buckets. Idempotent for any
   *  non-trade or non-crypto frame (early return — no state change). */
  ingestTick(tick: AlpacaTick): void {
    // Trade-only — quote frames carry no executed volume; mixing them into
    // sub-second buckets would re-poison the v0.4.2 B2 fix's invariant.
    if (tick.kind !== 't') return
    // Finite-number guard — the v0.4.3 D6 NaN-injection defense at the WS
    // boundary already runs, but defense-in-depth here costs nothing and
    // protects against any future code path that bypasses num()/ts()/sym().
    if (!Number.isFinite(tick.price) || !Number.isFinite(tick.timestamp)) return
    // Size of 0 (or negative, defensively) is dropped — a "trade" with no
    // volume isn't a trade for OHLC purposes. The price still updates the
    // close via the LiveMarket path; we just don't poison the sub-second
    // volume column.
    const size = Number.isFinite(tick.size) && tick.size > 0 ? tick.size : 0
    // Crypto-only — universal asset-class lookup matches LiveMarket /
    // feed-status logic so a symbol that's added to UNIVERSE as crypto in
    // the future automatically participates without code changes here.
    const entry = findUniverseEntry(tick.symbol)
    if (entry?.assetClass !== 'crypto') return

    for (const bucketMs of this.buckets) {
      this.ingestOne(tick.symbol, bucketMs, tick.timestamp, tick.price, size)
    }
  }

  private ingestOne(
    symbol: string, bucketMs: number, ts: number, price: number, size: number,
  ): void {
    const openMs = Math.floor(ts / bucketMs) * bucketMs

    let perSymbol = this.state.get(symbol)
    if (!perSymbol) {
      perSymbol = new Map()
      this.state.set(symbol, perSymbol)
    }
    const current = perSymbol.get(bucketMs)

    if (!current) {
      // First tick for this (symbol, bucketMs) since boot — open a fresh bucket.
      perSymbol.set(bucketMs, {
        openMs, open: price, high: price, low: price, close: price, volume: size,
      })
      return
    }

    if (openMs > current.openMs) {
      // Rolled into a new bucket — seal the prior one (persist + emit + trim),
      // then start a fresh bucket from this tick.
      this.sealBucket(symbol, bucketMs, current)
      perSymbol.set(bucketMs, {
        openMs, open: price, high: price, low: price, close: price, volume: size,
      })
      return
    }

    if (openMs < current.openMs) {
      // Out-of-order tick — NTP step backward or a late-arriving WS frame.
      // We don't backfill historical buckets from a single late tick; the
      // prior bucket is already sealed and authoritative.
      return
    }

    // Same bucket — ratchet OHLC in place.
    if (price > current.high) current.high = price
    if (price < current.low)  current.low  = price
    current.close   = price
    current.volume += size
  }

  /** Persist + emit + trim the supplied bucket. Used by both the natural
   *  roll path (ingestOne) and the explicit forceSealAll path. */
  private sealBucket(symbol: string, bucketMs: number, b: BucketState): void {
    const row: SubSecondCandle = {
      symbol, bucketMs, openMs: b.openMs,
      open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume,
    }
    try {
      this.persistence.insert(row)
      this.persistence.trim(symbol, bucketMs, this.maxCandles)
    } catch {
      // Persistence failures must not kill the live tick path. The bucket is
      // lost from durable storage but the renderer emission still happens
      // (best-effort) so the chart at least reflects the live shape.
    }
    try { this.onEmit?.(row) } catch { /* renderer push must never crash engine */ }
  }

  /** Seal every in-flight bucket and drop internal state. Called at engine
   *  shutdown / powerMonitor suspend / market-source swap (live↔replay).
   *  Idempotent — calling on an empty aggregator is a no-op. */
  forceSealAll(): void {
    for (const [symbol, perSymbol] of this.state) {
      for (const [bucketMs, b] of perSymbol) {
        this.sealBucket(symbol, bucketMs, b)
      }
      perSymbol.clear()
    }
    this.state.clear()
  }

  /** Test-only — expose internal state for assertions. Not part of the
   *  production API surface. */
  _snapshotState(): ReadonlyMap<string, ReadonlyMap<number, Readonly<BucketState>>> {
    return this.state
  }
}
