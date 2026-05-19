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
  /** Sprint 2 — fired AFTER a successful setPreferredBucket. trading-engine
   *  wires this to SubsecondPrefsService.setOne() so the pref is persisted to
   *  disk. The aggregator does not depend on persistence success — if the
   *  callback throws the in-memory pref is still updated (the next renderer
   *  read sees the new value; only the disk durability is lost). */
  onPreferenceChanged?: (symbol: string, ms: PreferredBucket) => void
}

const DEFAULT_BUCKETS  = [250, 500] as const
const DEFAULT_MAX_CANDLES = 1000

/** Sprint 2 — buckets a user can pick as the per-symbol default. Tighter than
 *  the maintained set (which could grow to include 100ms later) so the
 *  preference can't drift out-of-bounds via an old persisted value. */
export type PreferredBucket = 250 | 500
const DEFAULT_PREFERRED_BUCKET: PreferredBucket = 250

export class SubSecondCandleAggregator {
  private state = new Map<string, Map<number, BucketState>>()
  /** A1 Sprint 2 — per-symbol preferred display bucket. Does NOT affect which
   *  buckets the aggregator MAINTAINS (both 250 + 500 stay live for every
   *  crypto symbol). The renderer reads this to pick the initial chart
   *  timeframe when a crypto symbol gets focus. Living on the engine side
   *  (not in renderer state) so the preference survives a renderer reload. */
  private preferredBucketBySymbol = new Map<string, PreferredBucket>()
  private readonly buckets:     readonly number[]
  private readonly maxCandles:  number
  private readonly persistence: PersistenceShim
  private readonly onEmit?:     (c: SubSecondCandle) => void
  private readonly onPreferenceChanged?: (symbol: string, ms: PreferredBucket) => void

  constructor(deps: AggregatorDeps) {
    this.persistence = deps.persistence
    this.onEmit      = deps.onEmit
    this.buckets     = deps.buckets    ?? DEFAULT_BUCKETS
    this.maxCandles  = deps.maxCandles ?? DEFAULT_MAX_CANDLES
    this.onPreferenceChanged = deps.onPreferenceChanged
  }

  /** Sprint 2 — set the user's preferred default bucket for `symbol`. Pure
   *  preference; the aggregator still maintains both 250ms and 500ms buckets
   *  internally so a tf-switch costs nothing. Rejects non-crypto symbols
   *  (returns current pref unchanged — equity/index/future have no sub-second
   *  feed so the pref would never be consulted). Fires onPreferenceChanged
   *  on accept so the trading-engine can persist write-through. */
  setPreferredBucket(symbol: string, ms: PreferredBucket): PreferredBucket {
    const entry = findUniverseEntry(symbol)
    if (entry?.assetClass !== 'crypto') {
      // Idempotent for the caller — return what's currently stored (which is
      // the default, since non-crypto symbols never get an entry).
      return this.getPreferredBucket(symbol)
    }
    this.preferredBucketBySymbol.set(symbol, ms)
    try { this.onPreferenceChanged?.(symbol, ms) }
    catch { /* persistence failure must not break the in-memory update */ }
    return ms
  }

  /** Sprint 2 — read the user's preferred default bucket for `symbol`. Returns
   *  the default (250) when no preference has been set. */
  getPreferredBucket(symbol: string): PreferredBucket {
    return this.preferredBucketBySymbol.get(symbol) ?? DEFAULT_PREFERRED_BUCKET
  }

  /** Sprint 2 — bulk hydrate prefs at engine boot from disk-loaded state.
   *  Drops non-crypto entries defensively in case the on-disk file was
   *  hand-edited with stale symbols. Idempotent — overwrites whatever was
   *  in memory. Does NOT fire onPreferenceChanged (the source of truth is
   *  already disk, no write-back needed). */
  hydratePreferredBuckets(prefs: Readonly<Record<string, PreferredBucket>>): void {
    this.preferredBucketBySymbol.clear()
    for (const [symbol, ms] of Object.entries(prefs)) {
      const entry = findUniverseEntry(symbol)
      if (entry?.assetClass !== 'crypto') continue
      if (ms !== 250 && ms !== 500) continue
      this.preferredBucketBySymbol.set(symbol, ms)
    }
  }

  /** Sprint 2 — snapshot of all current prefs as a plain object. Used by the
   *  trading-engine to answer SUBSECOND_PREFS_GET. Returns a fresh object so
   *  the caller can JSON-stringify without worrying about internal mutation. */
  getAllPreferredBuckets(): Record<string, PreferredBucket> {
    const out: Record<string, PreferredBucket> = {}
    for (const [symbol, ms] of this.preferredBucketBySymbol) out[symbol] = ms
    return out
  }

  /** Sprint 2 — preferred resolution in milliseconds for downstream consumers
   *  (tactics, pattern-learner, replay) that want to know "what's the user's
   *  active candle stride for this symbol". Returns 1000 (1s) for any non-
   *  crypto symbol so the existing 1-second consumers keep their contract. */
  getCandleResolutionMs(symbol: string): number {
    const entry = findUniverseEntry(symbol)
    if (entry?.assetClass !== 'crypto') return 1000
    return this.getPreferredBucket(symbol)
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
