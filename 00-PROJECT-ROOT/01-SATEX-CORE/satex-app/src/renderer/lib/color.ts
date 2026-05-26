/**
 * SATEX — small color helpers (extracted from ChartPanel 2026-05-25 so the
 * Quad panes share one implementation with the single chart).
 */

/** Convert a hex color to rgba(...) with the given alpha. Returns the input
 *  unchanged for non-hex strings (so an `rgba(...)` color can pass through). */
export function applyOpacity(color: string, alpha: number): string {
  if (!color.startsWith('#')) return color
  const h = color.length === 4
    ? color.slice(1).split('').map(c => c + c).join('')
    : color.slice(1)
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha.toFixed(2)})`
}
