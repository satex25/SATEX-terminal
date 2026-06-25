/**
 * SATEX — DrawingModel (CHART-03 · CHART-04 · CHART-09)
 *
 * Pure types and math for the chart drawing engine.
 * All anchors are stored in PRICE/TIME space — never pixel coordinates.
 * This guarantees drawings stay geometrically correct across pan, zoom,
 * and resize without any recalculation of anchors.
 *
 * Fibonacci level computation reuses the existing `computeFibonacci`
 * helper in `@shared/chart-indicators` so there is one canonical
 * implementation of Fib math.
 */

// ── Primitive anchor types ────────────────────────────────────────────────────

/** A single price+time coordinate in data-space (not pixels). */
export interface PriceTimeAnchor {
  /** Unix timestamp in seconds (matches LWC bar .time). */
  time:  number
  /** Price value on the right price axis. */
  price: number
}

// ── Drawing kinds ─────────────────────────────────────────────────────────────

/** All drawing types the engine supports. */
export type DrawingKind =
  | 'line'         // trend line: two price/time anchors
  | 'hline'        // horizontal line: one price, infinite time
  | 'vline'        // vertical line: one time, infinite price
  | 'rect'         // rectangle: top-left + bottom-right anchors
  | 'fibonacci'    // fib retracement: high + low anchors, levels derived
  | 'annotation'   // text note: one anchor + text content

/** Active tool in the toolbar (CHART-03). */
export type DrawingTool =
  | 'select'
  | 'line'
  | 'hline'
  | 'vline'
  | 'rect'
  | 'fibonacci'
  | 'annotation'

// ── Drawing discriminated union ───────────────────────────────────────────────

interface DrawingBase {
  id:        string
  kind:      DrawingKind
  symbol:    string
  color?:    string
  lineWidth?: number
  selected:  boolean
  locked:    boolean
}

export interface LineDraw extends DrawingBase {
  kind:   'line'
  a:      PriceTimeAnchor
  b:      PriceTimeAnchor
  /** Extend line to left/right edges. */
  extend: boolean
}

export interface HLineDraw extends DrawingBase {
  kind:  'hline'
  price: number
  label?: string
}

export interface VLineDraw extends DrawingBase {
  kind: 'vline'
  time: number
  label?: string
}

export interface RectDraw extends DrawingBase {
  kind:        'rect'
  topLeft:     PriceTimeAnchor
  bottomRight: PriceTimeAnchor
  fillOpacity: number  // 0–1
}

export interface FibDraw extends DrawingBase {
  kind: 'fibonacci'
  /** The high anchor (always >= low anchor price). */
  high: PriceTimeAnchor
  /** The low anchor. */
  low:  PriceTimeAnchor
}

export interface AnnotationDraw extends DrawingBase {
  kind:    'annotation'
  anchor:  PriceTimeAnchor
  text:    string
  /** Font size in px (default 12). */
  fontSize?: number
}

export type Drawing =
  | LineDraw
  | HLineDraw
  | VLineDraw
  | RectDraw
  | FibDraw
  | AnnotationDraw

// ── Fibonacci level computation ───────────────────────────────────────────────

/** Standard Fibonacci retracement ratios. */
export const FIB_RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const

export interface FibLevel {
  ratio: number
  price: number
  label: string
}

/**
 * Derive the Fibonacci price levels for a `FibDraw`.
 * Returns levels sorted by price ascending.
 * Pure — no side effects.
 */
export function fibLevels(draw: FibDraw): FibLevel[] {
  const hi = Math.max(draw.high.price, draw.low.price)
  const lo = Math.min(draw.high.price, draw.low.price)
  const range = hi - lo
  if (range <= 0) return []
  return FIB_RATIOS.map((r) => ({
    ratio: r,
    price: lo + range * r,
    label: `${(r * 100).toFixed(1)}%`,
  })).sort((a, b) => a.price - b.price)
}

// ── Utilities ─────────────────────────────────────────────────────────────────

/** Generate a lightweight sequential ID for drawings (renderer-only, not
 *  persisted as a stable UUID). Sufficient for undo/redo key uniqueness. */
let _seq = 0
export function nextDrawingId(): string {
  return `d${Date.now()}_${++_seq}`
}

/**
 * Return `true` if the anchor's price is between [min, max] and its time
 * is between [fromTime, toTime]. Used to cull drawings outside the viewport.
 */
export function anchorInView(
  anchor: PriceTimeAnchor,
  fromTime: number, toTime: number,
  minPrice: number, maxPrice: number,
): boolean {
  return (
    anchor.time  >= fromTime && anchor.time  <= toTime &&
    anchor.price >= minPrice && anchor.price <= maxPrice
  )
}

/**
 * Returns true if `drawing` has any anchor visible in the given viewport.
 * HLine and VLine are always considered visible (they span the full axis).
 */
export function drawingInView(
  drawing: Drawing,
  fromTime: number, toTime: number,
  minPrice: number, maxPrice: number,
): boolean {
  switch (drawing.kind) {
    case 'hline':  return true   // spans full time axis
    case 'vline':  return drawing.time >= fromTime && drawing.time <= toTime
    case 'line':   return (
      anchorInView(drawing.a, fromTime, toTime, minPrice, maxPrice) ||
      anchorInView(drawing.b, fromTime, toTime, minPrice, maxPrice)
    )
    case 'rect':   return (
      anchorInView(drawing.topLeft,     fromTime, toTime, minPrice, maxPrice) ||
      anchorInView(drawing.bottomRight, fromTime, toTime, minPrice, maxPrice)
    )
    case 'fibonacci': return (
      anchorInView(drawing.high, fromTime, toTime, minPrice, maxPrice) ||
      anchorInView(drawing.low,  fromTime, toTime, minPrice, maxPrice)
    )
    case 'annotation': return anchorInView(drawing.anchor, fromTime, toTime, minPrice, maxPrice)
  }
}
