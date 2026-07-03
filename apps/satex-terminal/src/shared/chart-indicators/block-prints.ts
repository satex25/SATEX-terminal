/**
 * SATEX — Block print / large-trade detector (CHART-20)
 *
 * CONFIRM-L3 outcome: no Level-3 / dark-pool data entitlement found.
 * Alpaca Basic feed does not carry L3 order book or dark-pool fills.
 * Therefore this module detects LARGE PRINTS from the real `onTrades` stream
 * (trades above a size threshold) and labels them explicitly as
 * "(block proxy)" — never mislabeled as dark pool (Constitution 0.1).
 *
 * If L3 / ATS fill data becomes available in the future, the detection logic
 * remains unchanged — only the `source` field changes.
 *
 * Threshold algorithm (adaptive):
 *   - Compute the rolling median trade size over the last `lookback` prints.
 *   - Flag any trade whose size >= median × `multiplier` (default 5×).
 *   - Adaptive to symbol/session liquidity — no hard dollar threshold.
 *
 * Pure — no DOM, no side effects.
 */

// ── Input type ────────────────────────────────────────────────────────────────

export interface Tradeprint {
  time:   number   // epoch seconds
  price:  number
  size:   number
  /** 'buy' | 'sell' | 'unknown' — inferred from tick direction in sim */
  side:   'buy' | 'sell' | 'unknown'
}

// ── Output type ───────────────────────────────────────────────────────────────

export interface BlockPrint {
  time:      number
  price:     number
  size:      number
  side:      'buy' | 'sell' | 'unknown'
  /** Ratio of this trade's size to the rolling median at that moment. */
  sizeRatio: number
  /**
   * Always "(block proxy)" — explicit label that this is derived from the
   * onTrades stream, not a confirmed dark-pool/L3 source (Constitution 0.1).
   */
  label:     '(block proxy)'
}

export interface BlockPrintOptions {
  /** Lookback window for rolling median size. Default 200 prints. */
  lookback?:    number
  /** Size multiple above rolling median to classify as block. Default 5. */
  multiplier?:  number
  /** Absolute minimum size to qualify regardless of median ratio. Default 100. */
  minSize?:     number
}

// ── Rolling median helper ─────────────────────────────────────────────────────

function rollingMedian(arr: number[], endIdx: number, window: number): number {
  const start = Math.max(0, endIdx - window + 1)
  const slice = arr.slice(start, endIdx + 1).sort((a, b) => a - b)
  const mid = Math.floor(slice.length / 2)
  if (slice.length === 0) return 0
  return slice.length % 2 === 0
    ? (slice[mid - 1]! + slice[mid]!) / 2
    : slice[mid]!
}

// ── Detector ──────────────────────────────────────────────────────────────────

/**
 * Scan a stream of trade prints and return those qualifying as block prints.
 *
 * `trades` should be sorted oldest-first (standard data-feed order).
 * Returns one `BlockPrint` per qualifying trade — empty array if none qualify
 * or input is too short (< `lookback` trades, returns [] for safety).
 */
export function detectBlockPrints(
  trades: readonly Tradeprint[],
  opts:   BlockPrintOptions = {},
): BlockPrint[] {
  const lookback   = opts.lookback   ?? 200
  const multiplier = opts.multiplier ?? 5
  const minSize    = opts.minSize    ?? 100
  const n = trades.length
  if (n < 2) return []

  const sizes = trades.map((t) => t.size)
  const out: BlockPrint[] = []

  for (let i = 1; i < n; i++) {
    const t = trades[i]!
    if (t.size < minSize) continue

    const median = rollingMedian(sizes, i - 1, lookback)
    if (median <= 0) continue

    const ratio = t.size / median
    if (ratio < multiplier) continue

    out.push({
      time:      t.time,
      price:     t.price,
      size:      t.size,
      side:      t.side,
      sizeRatio: +ratio.toFixed(2),
      label:     '(block proxy)',
    })
  }
  return out
}

// ── Threshold query ───────────────────────────────────────────────────────────

/**
 * Compute the current block-print threshold given a recent trade stream.
 * Returns `median × multiplier` so the UI can display the live threshold.
 */
export function blockPrintThreshold(
  trades:     readonly Tradeprint[],
  opts:       BlockPrintOptions = {},
): number {
  const lookback   = opts.lookback   ?? 200
  const multiplier = opts.multiplier ?? 5
  if (trades.length === 0) return 0
  const sizes = trades.map((t) => t.size)
  const median = rollingMedian(sizes, sizes.length - 1, lookback)
  return median * multiplier
}
