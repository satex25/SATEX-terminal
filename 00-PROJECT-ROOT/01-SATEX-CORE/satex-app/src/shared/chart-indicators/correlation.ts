/**
 * SATEX — Correlation heatmap math (CHART-17)
 *
 * CONFIRM-MSYNC outcome: getBars is available per symbol via Alpaca REST
 * (same call-site used by chart-backfill.ts). Synchronized multi-symbol
 * history is obtained by pulling aligned timestamps server-side via the
 * existing backfill channel. If timestamps diverge, `alignSeries()` resamples
 * to the intersection — real data, honest alignment (no extrapolation).
 *
 * Exports:
 *   - pearsonCorrelation(a, b) — single-window scalar
 *   - rollingCorrelation(a, b, window) — length-matched series
 *   - alignSeries(map) — shared-timestamp intersection
 *   - correlationMatrix(aligned, window) — NxN grid for heatmap
 *
 * Pure — no DOM, no side effects. Update cadence: ~5 s (caller responsibility).
 */

// ── Pearson correlation ────────────────────────────────────────────────────────

/**
 * Pearson correlation coefficient of two equal-length number arrays.
 * Returns 0 for degenerate inputs (< 2 points, zero variance in either series).
 */
export function pearsonCorrelation(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length)
  if (n < 2) return 0

  let sumA = 0, sumB = 0
  for (let i = 0; i < n; i++) { sumA += a[i]!; sumB += b[i]! }
  const meanA = sumA / n
  const meanB = sumB / n

  let cov = 0, varA = 0, varB = 0
  for (let i = 0; i < n; i++) {
    const da = a[i]! - meanA
    const db = b[i]! - meanB
    cov  += da * db
    varA += da * da
    varB += db * db
  }

  const denom = Math.sqrt(varA * varB)
  return denom < 1e-12 ? 0 : cov / denom
}

// ── Rolling correlation ────────────────────────────────────────────────────────

/**
 * Rolling Pearson correlation over a sliding window.
 * Returns a length-matched array; first `window-1` values are 0 (warm-up).
 */
export function rollingCorrelation(
  a:      readonly number[],
  b:      readonly number[],
  window: number,
): number[] {
  const n = Math.min(a.length, b.length)
  const result = new Array<number>(n).fill(0)
  if (window < 2 || n < window) return result

  for (let i = window - 1; i < n; i++) {
    const sliceA = a.slice(i - window + 1, i + 1)
    const sliceB = b.slice(i - window + 1, i + 1)
    result[i] = pearsonCorrelation(sliceA, sliceB)
  }
  return result
}

// ── Series alignment ──────────────────────────────────────────────────────────

/**
 * Given a map of symbol -> OHLCV candles (may have gaps), produce a map
 * of symbol -> close-price series aligned to the shared timestamp intersection.
 *
 * Uses closes only (returns are computed from closes). Candles with no match
 * in other series are dropped. The resulting arrays are all the same length.
 */
export function alignSeries(
  seriesMap: Record<string, ReadonlyArray<{ time: number; close: number }>>,
): Record<string, number[]> {
  const symbols = Object.keys(seriesMap)
  if (symbols.length === 0) return {}

  // Collect shared timestamps (intersection across all series)
  const timeSets = symbols.map(
    (sym) => new Set(seriesMap[sym]!.map((c) => c.time)),
  )
  // Start with the first set, intersect with all others
  let shared = timeSets[0]!
  for (let i = 1; i < timeSets.length; i++) {
    const next = new Set<number>()
    for (const t of shared) {
      if (timeSets[i]!.has(t)) next.add(t)
    }
    shared = next
  }

  const sortedTimes = Array.from(shared).sort((a, b) => a - b)
  const result: Record<string, number[]> = {}

  for (const sym of symbols) {
    const indexByTime = new Map(seriesMap[sym]!.map((c) => [c.time, c.close]))
    result[sym] = sortedTimes.map((t) => indexByTime.get(t) ?? NaN)
  }
  return result
}

// ── Correlation matrix ────────────────────────────────────────────────────────

/**
 * Compute an NxN rolling-correlation matrix for a watchlist.
 *
 * `aligned` must come from `alignSeries()` (all arrays same length).
 * Returns the LAST value of the rolling correlation window for each pair —
 * i.e., the most recent correlation over `window` bars.
 *
 * Matrix is symmetric: corr[symA][symB] === corr[symB][symA].
 * Diagonal is 1.0 by definition.
 */
export function correlationMatrix(
  aligned: Record<string, number[]>,
  window:  number,
): Record<string, Record<string, number>> {
  const symbols = Object.keys(aligned)
  const result: Record<string, Record<string, number>> = {}

  for (const sym of symbols) {
    result[sym] = {}
    result[sym]![sym] = 1.0
  }

  for (let i = 0; i < symbols.length; i++) {
    for (let j = i + 1; j < symbols.length; j++) {
      const symA = symbols[i]!
      const symB = symbols[j]!
      const rolling = rollingCorrelation(aligned[symA]!, aligned[symB]!, window)
      const latest = rolling[rolling.length - 1] ?? 0
      result[symA]![symB] = latest
      result[symB]![symA] = latest
    }
  }
  return result
}
