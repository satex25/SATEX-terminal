/**
 * SATEX — Footprint Aggregator (P0-1 · 2026-05-15).
 *
 * Pure module. Buckets per-symbol Trade events into per-candle FootprintCandles
 * with bid/ask volume split at each price level. Lives in `shared/` so both
 * main and renderer can consume — today the renderer drives aggregation via
 * the `footprintStore`; the engine fan-outs raw Trade events via IPC.
 *
 * Math:
 *   - candleTime = floor(trade.ts / 1000 / candleSec) * candleSec  // epoch seconds
 *   - priceLevel = round(price / tickSize) * tickSize             // discretized
 *   - bucket.askVolume += size on 'buy' (aggressive buy = ask-lift)
 *   - bucket.bidVolume += size on 'sell' (aggressive sell = bid-hit)
 *   - delta = totalAsk − totalBid                                  // green if +
 *
 * Memory:
 *   - keeps the most recent `historyLimit` candles per symbol (default 200).
 *   - per-candle buckets stored as Map<priceLevel, FootprintBucket>; sparse
 *     so memory grows with realized price range, not full visible range.
 *
 * Validation: indicators.test.ts runs 2000 synthetic trades through this and
 * asserts the aggregated bucket sums match raw input — see the survey doc's
 * "Bid/ask split accuracy: 100% bucket sum match" requirement.
 */
import type { Trade } from './types'

export interface FootprintBucket {
  /** Price level (discretized to tickSize). */
  priceLevel: number
  /** Volume traded at the BID (aggressor was 'sell'). */
  bidVolume: number
  /** Volume traded at the ASK (aggressor was 'buy'). */
  askVolume: number
}

export interface FootprintCandle {
  /** Candle bucket start, epoch seconds. */
  candleTime: number
  /** Price-level → bucket. Sparse — only levels with prints are present. */
  buckets: Map<number, FootprintBucket>
  /** Sum of bidVolume across all buckets in this candle. */
  totalBid: number
  /** Sum of askVolume across all buckets. */
  totalAsk: number
  /** Net delta = totalAsk − totalBid. Positive = aggressive buying. */
  delta: number
  /** True if any 'real' (SIP) trade landed in this candle. Drives a
   *  high-confidence styling vs the inferred (simulator / IEX) path. */
  hasRealProvenance: boolean
}

export interface FootprintAggregatorOptions {
  /** Minimum price increment for level bucketing. Default 0.01. */
  tickSize?: number
  /** Candle bucket size in seconds. Default 1 (matches SIMULATOR_CANDLE_INTERVAL_SEC). */
  candleSec?: number
  /** Per-symbol candle ring cap. Default 200. */
  historyLimit?: number
}

export class FootprintAggregator {
  private readonly tickSize: number
  private readonly candleSec: number
  private readonly historyLimit: number
  /** Inverse of tickSize, multiplied by trade.price then rounded to give the
   *  integer step count from zero. Used to keep Map keys IEEE-754 stable —
   *  storing the keys as integer step counts avoids the 100.013 / 0.05 →
   *  100.00000000000001 float drift that would balloon `buckets.size`. */
  private readonly tickInv: number
  private readonly tickDecimals: number
  /** Per-symbol ordered list of candles. Newest last. */
  private candles = new Map<string, FootprintCandle[]>()

  constructor(opts: FootprintAggregatorOptions = {}) {
    this.tickSize     = opts.tickSize     ?? 0.01
    this.candleSec    = opts.candleSec    ?? 1
    this.historyLimit = opts.historyLimit ?? 200
    this.tickInv      = 1 / this.tickSize
    // Decimals = max(0, ceil(-log10(tickSize))). Used to canonicalize the
    // bucket key with toFixed so external `Map.get(100.05)` lookups work.
    this.tickDecimals = this.tickSize >= 1 ? 0 : Math.max(0, Math.ceil(-Math.log10(this.tickSize)))
  }

  /** Round trade.price into a canonical price-level key. Returns a clean
   *  Number that's stable across re-computations (toFixed → Number erases
   *  float drift). Exposed for tests; ingest() uses it internally. */
  toPriceLevel(price: number): number {
    return Number((Math.round(price * this.tickInv) / this.tickInv).toFixed(this.tickDecimals))
  }

  /** Ingest a single trade event. Idempotent against tickSize/candleSec
   *  rounding — calling twice with the same trade double-counts (caller is
   *  responsible for not feeding dupes). */
  ingest(trade: Trade): void {
    if (!Number.isFinite(trade.price) || !Number.isFinite(trade.size) || trade.size <= 0) return
    const candleTime = Math.floor(trade.ts / 1000 / this.candleSec) * this.candleSec
    const priceLevel = this.toPriceLevel(trade.price)

    let bySymbol = this.candles.get(trade.symbol)
    if (!bySymbol) { bySymbol = []; this.candles.set(trade.symbol, bySymbol) }

    // Most-recent candle. If candleTime is older than the latest, we still
    // accept (out-of-order arrivals from replay/jitter) — find or insert.
    let target = bySymbol.length > 0 ? bySymbol[bySymbol.length - 1]! : null
    if (!target || candleTime !== target.candleTime) {
      // Insert new candle, maintaining ascending order by candleTime. The
      // common path is append; the rarer out-of-order path scans.
      target = this.findOrCreateCandle(bySymbol, candleTime)
    }

    let bucket = target.buckets.get(priceLevel)
    if (!bucket) {
      bucket = { priceLevel, bidVolume: 0, askVolume: 0 }
      target.buckets.set(priceLevel, bucket)
    }
    if (trade.side === 'buy') {
      bucket.askVolume += trade.size
      target.totalAsk += trade.size
    } else {
      bucket.bidVolume += trade.size
      target.totalBid += trade.size
    }
    target.delta = target.totalAsk - target.totalBid
    if (trade.provenance === 'real') target.hasRealProvenance = true
  }

  /** Returns the most-recent N candles for a symbol, oldest-first. */
  recent(symbol: string, limit = 200): FootprintCandle[] {
    const arr = this.candles.get(symbol)
    if (!arr) return []
    return arr.slice(Math.max(0, arr.length - limit))
  }

  /** Returns the specific candle matching candleTime, or null. */
  forCandle(symbol: string, candleTime: number): FootprintCandle | null {
    const arr = this.candles.get(symbol)
    if (!arr) return null
    // Newest-first linear scan — historyLimit is small (≤200), trivial cost.
    for (let i = arr.length - 1; i >= 0; i--) {
      const c = arr[i]!
      if (c.candleTime === candleTime) return c
      if (c.candleTime < candleTime) return null
    }
    return null
  }

  /** Clear all candles for a symbol (e.g. on replay swap or symbol change). */
  clear(symbol: string): void { this.candles.delete(symbol) }

  /** Clear all symbols. */
  clearAll(): void { this.candles.clear() }

  // ── internal ─────────────────────────────────────────────────────────────

  private findOrCreateCandle(arr: FootprintCandle[], candleTime: number): FootprintCandle {
    // Fast-path append when candleTime is at or beyond the latest.
    const latest = arr.length > 0 ? arr[arr.length - 1]! : null
    if (!latest || candleTime > latest.candleTime) {
      const fresh: FootprintCandle = {
        candleTime, buckets: new Map(),
        totalBid: 0, totalAsk: 0, delta: 0,
        hasRealProvenance: false,
      }
      arr.push(fresh)
      if (arr.length > this.historyLimit) arr.splice(0, arr.length - this.historyLimit)
      return fresh
    }
    // Out-of-order — linear scan back for a match.
    for (let i = arr.length - 1; i >= 0; i--) {
      const c = arr[i]!
      if (c.candleTime === candleTime) return c
      if (c.candleTime < candleTime) {
        // Insert at i+1.
        const fresh: FootprintCandle = {
          candleTime, buckets: new Map(),
          totalBid: 0, totalAsk: 0, delta: 0,
          hasRealProvenance: false,
        }
        arr.splice(i + 1, 0, fresh)
        if (arr.length > this.historyLimit) arr.splice(0, arr.length - this.historyLimit)
        return fresh
      }
    }
    // candleTime older than the entire ring — drop on the floor.
    const fresh: FootprintCandle = {
      candleTime, buckets: new Map(),
      totalBid: 0, totalAsk: 0, delta: 0,
      hasRealProvenance: false,
    }
    arr.unshift(fresh)
    if (arr.length > this.historyLimit) arr.splice(0, arr.length - this.historyLimit)
    return fresh
  }
}
