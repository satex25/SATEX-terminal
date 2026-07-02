/**
 * SATEX — single-pass min/max over a numeric series.
 *
 * Why not `Math.min(...values)` / `Math.max(...values)`? Spreading an array as
 * call arguments throws `RangeError: Maximum call stack size exceeded` once the
 * array passes the engine's argument cap (~65k–125k in V8). Several SATEX series
 * are unbounded — PnL snapshots accumulate at one entry/minute with no LIMIT
 * (`listPnlSnapshots`), so an always-on session crosses the cap in ~45 days and
 * the equity-curve panels would crash. Same invariant as the vol-heatmap /
 * QuadPaneChart single-pass loops (PROBLEM-LEDGER P-027 / P-041).
 *
 * Returns the identity extent `{ min: Infinity, max: -Infinity }` for an empty
 * array — callers guard on `length` before using it for layout.
 */
export interface Extent {
  min: number
  max: number
}

export function seriesExtent(values: readonly number[]): Extent {
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!
    if (v < min) min = v
    if (v > max) max = v
  }
  return { min, max }
}
