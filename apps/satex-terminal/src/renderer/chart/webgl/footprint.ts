/**
 * SATEX — Footprint chart cell aggregation (CHART-11)
 *
 * Aggregates trade prints into per-candle bid/ask volume cells for rendering
 * on the WebGL sublayer. Each cell covers one price "tick" (configurable
 * bucket size) within a candle's range.
 *
 * Data sources (REAL — no fabrication, Constitution §0.1):
 *   - `onTrades`: real trade prints with size + aggressor side.
 *     Side provenance: 'real' = SIP entitlement (live), 'inferred' = sim/IEX.
 *     CONFIRM-SIP outcome: live per-trade side lands when SIP entitlement is
 *     active. Sim infers from tick direction. Both are handled identically
 *     here — the provenance field is preserved for UI dimming downstream.
 *   - `DepthSnapshot.bids/asks`: order-book levels for price-bucket alignment.
 *
 * Output: `FootprintCandle[]` — one per source candle — containing an array
 * of price cells, each with buyVol + sellVol. Pure — no side effects.
 *
 * CLEANUP NOTE: callers that subscribe to `onTrades` must unsubscribe on
 * unmount (PR #6 invariant). This module only handles the aggregation math.
 */
import type { Candle } from '@shared/types'
import type { Trade } from '@shared/types'

// ── Public types ──────────────────────────────────────────────────────────────

/**
 * One price-level cell within a footprint candle.
 * `price` is the LOWER bound of this bucket (e.g., 100.00 covers 100.00–100.25).
 */
export interface FootprintCell {
  /** Lower bound of this price bucket (in price units). */
  price:   number
  /** Cumulative aggressor-buy volume at this level. */
  buyVol:  number
  /** Cumulative aggressor-sell volume at this level. */
  sellVol: number
  /** Delta = buyVol - sellVol. Positive = net buying pressure. */
  delta:   number
  /** Whether side data is real (SIP) or inferred. Dims inferred cells in UI. */
  provenance: 'real' | 'inferred' | 'mixed'
}

/**
 * A candle's full footprint: cells covering the candle's price range,
 * plus summary stats for rendering efficiency.
 */
export interface FootprintCandle {
  /** The source candle's open time (unix seconds — matches LWC bar .time). */
  time:         number
  /** Tick-bucket size in price units (same as `bucketSize` param). */
  bucketSize:   number
  /** All non-zero price cells, sorted ascending by price. */
  cells:        FootprintCell[]
  /** Total volume traded this candle (sum of all cell volumes). */
  totalVolume:  number
  /** Cumulative delta for the candle (net aggressor pressure). */
  totalDelta:   number
  /** POC — price level with highest total (buy+sell) volume. */
  poc:          number
}

// ── Core aggregation ──────────────────────────────────────────────────────────

/**
 * Bucket a price value to its lower bound given the bucket size.
 * Example: bucketPrice(100.37, 0.25) = 100.25
 */
export function bucketPrice(price: number, bucketSize: number): number {
  return Math.floor(price / bucketSize) * bucketSize
}

/**
 * Aggregate a stream of trades into per-candle footprint cells.
 *
 * @param candles   Source candle array (sorted by time ascending).
 * @param trades    Trade prints (must be for the same symbol; unsorted OK).
 * @param bucketSize Price-bucket granularity in price units. Default = tick size.
 *
 * @returns FootprintCandle[] aligned to the candle array. Candles with no
 *          matching trades get an empty `cells` array (not fabricated).
 */
export function buildFootprint(
  candles:    Candle[],
  trades:     Trade[],
  bucketSize: number = 0.25,
): FootprintCandle[] {
  if (candles.length === 0) return []
  if (bucketSize <= 0) throw new RangeError(`bucketSize must be > 0, got ${bucketSize}`)

  // ── Index trades by candle ────────────────────────────────────────────────
  // Each candle covers [time, time + candleDurationMs). We assign each trade
  // to the candle whose open-time is closest without going over.
  const candleDurationMs = candles.length >= 2
    ? (candles[1]!.time - candles[0]!.time) * 1000
    : 60_000 // fallback: 1-minute candle

  // Map from candle index → (bucketPrice → cell accumulator)
  const cellMaps: Map<number, { buy: number; sell: number; provenances: Set<string> }>[] =
    candles.map(() => new Map())

  for (const trade of trades) {
    // Find candle index by binary search
    const tradeTimeS = trade.ts / 1000
    let lo = 0, hi = candles.length - 1, ci = -1
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1
      const c = candles[mid]!
      if (c.time <= tradeTimeS && tradeTimeS < c.time + candleDurationMs / 1000) {
        ci = mid; break
      } else if (c.time > tradeTimeS) {
        hi = mid - 1
      } else {
        lo = mid + 1
      }
    }
    // Fallback: assign to last candle that started before the trade
    if (ci === -1) {
      for (let i = candles.length - 1; i >= 0; i--) {
        if (candles[i]!.time <= tradeTimeS) { ci = i; break }
      }
    }
    if (ci === -1) continue // trade is before the first candle

    const bucket = bucketPrice(trade.price, bucketSize)
    const map = cellMaps[ci]!
    let acc = map.get(bucket)
    if (!acc) { acc = { buy: 0, sell: 0, provenances: new Set() }; map.set(bucket, acc) }

    if (trade.side === 'buy') acc.buy += trade.size
    else acc.sell += trade.size
    acc.provenances.add(trade.provenance)
  }

  // ── Build output ─────────────────────────────────────────────────────────
  return candles.map((candle, i) => {
    const map = cellMaps[i]!
    if (map.size === 0) {
      return {
        time:        candle.time,
        bucketSize,
        cells:       [],
        totalVolume: 0,
        totalDelta:  0,
        poc:         candle.close,
      }
    }

    let maxVol = 0, poc = candle.close
    let totalVolume = 0, totalDelta = 0

    const cells: FootprintCell[] = Array.from(map.entries())
      .sort(([a], [b]) => a - b)
      .map(([price, acc]) => {
        const { buy, sell, provenances } = acc
        const cellVol = buy + sell
        const delta   = buy - sell
        totalVolume  += cellVol
        totalDelta   += delta
        if (cellVol > maxVol) { maxVol = cellVol; poc = price }
        const prov: FootprintCell['provenance'] =
          provenances.size > 1 ? 'mixed'
          : provenances.has('real') ? 'real' : 'inferred'
        return { price, buyVol: buy, sellVol: sell, delta, provenance: prov }
      })

    return { time: candle.time, bucketSize, cells, totalVolume, totalDelta, poc }
  })
}

/**
 * Compute the maximum total cell volume across all footprint candles.
 * Used to normalize cell heights for WebGL rendering.
 */
export function maxCellVolume(footprints: FootprintCandle[]): number {
  let max = 0
  for (const fp of footprints) {
    for (const cell of fp.cells) {
      const v = cell.buyVol + cell.sellVol
      if (v > max) max = v
    }
  }
  return max
}

/**
 * Filter footprint candles to a visible time range (frustum cull).
 * Adds ±5% padding on each side (matching the LOD bucketing convention).
 */
export function frustumCullFootprints(
  footprints:  FootprintCandle[],
  startTimeS:  number,
  endTimeS:    number,
): FootprintCandle[] {
  const pad = (endTimeS - startTimeS) * 0.05
  const lo  = startTimeS - pad
  const hi  = endTimeS   + pad
  return footprints.filter(fp => fp.time >= lo && fp.time <= hi)
}
