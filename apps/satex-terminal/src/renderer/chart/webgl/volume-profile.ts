/**
 * SATEX — Volume Profile / TPO aggregation (CHART-13)
 *
 * Computes a horizontal volume histogram from candle OHLCV data + optional
 * trade prints. Produces Time-at-Price (TPO) bins and marks the Point of
 * Control (POC) and Value Area (VA ± 70%).
 *
 * Design:
 *   - Pure function — candles in → profile out. No side effects, no DOM.
 *   - Uses REAL OHLCV data only (Constitution §0.1 — no fabrication).
 *   - Volume is distributed evenly across the candle's high–low range into
 *     price bins. When trade prints are available, the real trade volume per
 *     price level takes priority and the OHLCV distribution is suppressed.
 *   - Bin count defaults to 48 (matching industry standard "Market Profile"
 *     letter-per-30-min convention for daily data).
 *
 * Output is suitable for rendering as a right-aligned horizontal bar chart
 * on the WebGL sublayer, with the POC highlighted and VA region shaded.
 *
 * Pure — no side effects, safe in main + renderer.
 */
import type { Candle } from '@shared/types'
import type { Trade } from '@shared/types'

// ── Public types ──────────────────────────────────────────────────────────────

/**
 * A single price bin in the volume profile.
 */
export interface ProfileBin {
  /** Lower bound of this price bin. */
  priceFrom: number
  /** Upper bound of this price bin. */
  priceTo:   number
  /** Centre price (used for chart rendering). */
  price:     number
  /** Total volume attributed to this bin. */
  volume:    number
  /** Whether this bin is the Point of Control (highest volume). */
  isPOC:     boolean
  /** Whether this bin falls within the Value Area (±70% of total volume). */
  isVA:      boolean
}

/**
 * Full volume profile for a session or time range.
 */
export interface VolumeProfile {
  bins:         ProfileBin[]
  /** POC price level (centre of the highest-volume bin). */
  poc:          number
  /** Value Area High — upper bound of the 70% VA. */
  vah:          number
  /** Value Area Low — lower bound of the 70% VA. */
  val:          number
  /** Total volume summed across all bins. */
  totalVolume:  number
  /** Price range covered: [rangeL, rangeH]. */
  rangeL:       number
  rangeH:       number
  /** Number of bins. */
  binCount:     number
}

// ── Core computation ──────────────────────────────────────────────────────────

/**
 * Build a volume profile from a candle array (+ optional trade prints).
 *
 * @param candles    Source candles (any timeframe, any count).
 * @param trades     Optional real trade prints for precision volume placement.
 * @param binCount   Number of price bins (default 48).
 * @param rangePad   Fractional padding above/below high/low (default 0.02 = 2%).
 */
export function buildVolumeProfile(
  candles:   Candle[],
  trades:    Trade[]  = [],
  binCount:  number   = 48,
  rangePad:  number   = 0.02,
): VolumeProfile | null {
  if (candles.length === 0) return null
  if (binCount < 2) throw new RangeError(`binCount must be ≥ 2, got ${binCount}`)

  // ── Determine price range ─────────────────────────────────────────────────
  let rangeH = -Infinity, rangeL = Infinity
  for (const c of candles) {
    if (c.high  > rangeH) rangeH = c.high
    if (c.low   < rangeL) rangeL = c.low
  }
  const pad   = (rangeH - rangeL) * rangePad
  rangeH += pad
  rangeL -= pad
  const span  = rangeH - rangeL
  if (span <= 0) return null
  const binSize = span / binCount

  // ── Initialise bins ───────────────────────────────────────────────────────
  const volumes: Float64Array = new Float64Array(binCount)

  // ── Distribute OHLCV volume evenly across the candle's H–L range ─────────
  for (const c of candles) {
    const loIdx = Math.max(0, Math.floor((c.low  - rangeL) / binSize))
    const hiIdx = Math.min(binCount - 1, Math.floor((c.high - rangeL) / binSize))
    const spread = hiIdx - loIdx + 1
    const volPerBin = c.volume / spread
    for (let i = loIdx; i <= hiIdx; i++) {
      volumes[i] += volPerBin
    }
  }

  // ── Overlay real trade prints (takes precedence when present) ─────────────
  if (trades.length > 0) {
    // Reset bins that have real data, then add trade volume per bin.
    // We only override bins that actually receive a trade print.
    const tradeBins = new Float64Array(binCount)
    const hasTrade  = new Uint8Array(binCount)
    for (const trade of trades) {
      const idx = Math.min(
        binCount - 1,
        Math.max(0, Math.floor((trade.price - rangeL) / binSize)),
      )
      tradeBins[idx] += trade.size
      hasTrade[idx]   = 1
    }
    for (let i = 0; i < binCount; i++) {
      if (hasTrade[i]) volumes[i] = tradeBins[i]!
    }
  }

  // ── Find POC and total volume ─────────────────────────────────────────────
  let totalVolume = 0, maxVol = 0, pocIdx = 0
  for (let i = 0; i < binCount; i++) {
    totalVolume += volumes[i]!
    if (volumes[i]! > maxVol) { maxVol = volumes[i]!; pocIdx = i }
  }

  // ── Value Area: start at POC, expand outward until ≥ 70% of total ────────
  const vaTarget = totalVolume * 0.7
  let vaLo = pocIdx, vaHi = pocIdx, vaVol = volumes[pocIdx]!

  while (vaVol < vaTarget && (vaLo > 0 || vaHi < binCount - 1)) {
    const stepDown = vaLo > 0         ? (volumes[vaLo - 1] ?? 0) : 0
    const stepUp   = vaHi < binCount - 1 ? (volumes[vaHi + 1] ?? 0) : 0
    if (stepDown >= stepUp && vaLo > 0) {
      vaLo--; vaVol += volumes[vaLo]!
    } else if (vaHi < binCount - 1) {
      vaHi++; vaVol += volumes[vaHi]!
    } else {
      break
    }
  }

  const poc = rangeL + (pocIdx + 0.5) * binSize
  const val = rangeL + vaLo  * binSize
  const vah = rangeL + (vaHi + 1) * binSize

  // ── Build output bins ─────────────────────────────────────────────────────
  const bins: ProfileBin[] = Array.from({ length: binCount }, (_, i) => ({
    priceFrom: rangeL + i       * binSize,
    priceTo:   rangeL + (i + 1) * binSize,
    price:     rangeL + (i + 0.5) * binSize,
    volume:    volumes[i]!,
    isPOC:     i === pocIdx,
    isVA:      i >= vaLo && i <= vaHi,
  }))

  return { bins, poc, vah, val, totalVolume, rangeL, rangeH, binCount }
}

/**
 * Returns the bin (0-indexed) for a given price. Useful for highlight
 * rendering — find which bin the cursor's price belongs to.
 * Returns -1 if the price is outside the profile range.
 */
export function priceToProfileBin(profile: VolumeProfile, price: number): number {
  if (price < profile.rangeL || price > profile.rangeH) return -1
  const binSize = (profile.rangeH - profile.rangeL) / profile.binCount
  return Math.min(profile.binCount - 1, Math.floor((price - profile.rangeL) / binSize))
}

/**
 * Normalises bin volumes to [0, 1] relative to the POC volume.
 * Use for bar-width scaling in the WebGL renderer.
 */
export function normaliseProfile(profile: VolumeProfile): number[] {
  const poc = profile.bins.find(b => b.isPOC)
  const pocVol = poc?.volume ?? 1
  return profile.bins.map(b => (pocVol > 0 ? b.volume / pocVol : 0))
}
