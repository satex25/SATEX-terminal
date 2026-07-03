/**
 * SATEX — ViewportTransform (§3.1 chart-interaction-layer)
 *
 * Pure coordinate-math module. Derives x/y ↔ price/time transforms from
 * Lightweight Charts v5's scale APIs. Called every frame from the overlay
 * render loop — never cached stale (Constitution 0.4/0.5).
 *
 * All maths here are pure functions with no side effects. All are unit-tested
 * in ViewportTransform.test.ts.
 */
import type { IChartApi } from 'lightweight-charts'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ViewportRect {
  /** Left pixel offset of the chart area (right of y-axis labels). */
  left: number
  /** Top pixel offset of the chart area. */
  top: number
  /** Width of the plot area in CSS pixels. */
  width: number
  /** Height of the plot area in CSS pixels. */
  height: number
}

export interface ViewportTransform {
  /** Convert a price value to a CSS-pixel y coordinate. */
  priceToY:  (price: number) => number
  /** Convert a CSS-pixel y coordinate to a price value. */
  yToPrice:  (y: number) => number
  /** Convert a UTC timestamp (seconds) to a CSS-pixel x coordinate.
   *  Returns NaN if the time is outside the visible range. */
  timeToX:   (utcSec: number) => number
  /** Convert a CSS-pixel x coordinate to the nearest candle time (UTC secs). */
  xToTime:   (x: number) => number
  /** The viewport rectangle (chart plot area in screen space). */
  rect:      ViewportRect
  /** True if the price scale is in log mode. */
  isLog:     boolean
}

// ── Core derivation ───────────────────────────────────────────────────────────

/**
 * Derive a fresh ViewportTransform from the chart API's current state.
 *
 * Must be called every frame — the LWC scale APIs snapshot the current state
 * without any internal caching. Calling it once and reusing the result across
 * pans/zooms produces stale coordinates.
 *
 * Returns null if the chart isn't ready (no series, layout not computed, or
 * the price/time scales don't expose coordinates yet).
 */
export function deriveTransform(chart: IChartApi, container: HTMLElement): ViewportTransform | null {
  try {
    const ts  = chart.timeScale()
    const ps  = chart.priceScale('right')

    const logicalRange = ts.getVisibleLogicalRange()
    if (!logicalRange) return null

    // LWC v5 exposes `coordinateForTime` / `timeForCoordinate` on the time
    // scale directly. The price scale exposes `priceToCoordinate` and
    // `coordinateToPrice`.
    const coordinateForTime = (t: number) => ts.timeToCoordinate(t as unknown as import('lightweight-charts').Time)
    const timeForCoordinate = (x: number) => ts.coordinateToTime(x)

    // Derive chart plot rect from the container + bar spacing approximation.
    // LWC doesn't expose the inner plot rect directly, but we can approximate
    // it from the chart element minus the scrollbar and price-axis widths.
    // The price-axis width is available via the options accessor.
    const opts  = chart.options()
    const paWidth = (opts.rightPriceScale?.visible !== false) ? 65 : 0
    const tsHeight = (opts.timeScale?.visible !== false) ? 26 : 0

    const containerRect = container.getBoundingClientRect()
    const rect: ViewportRect = {
      left:   containerRect.left,
      top:    containerRect.top,
      width:  containerRect.width - paWidth,
      height: containerRect.height - tsHeight,
    }

    const isLog = (opts.rightPriceScale as { mode?: number } | undefined)?.mode === 1 /* LogarithmicPriceScaleMode */

    // LWC v5: IPriceScaleApi does not expose priceToCoordinate/coordinateToPrice.
    // Derive price↔y from the visible price range + linear/log interpolation.
    const priceRange = ps.getVisibleRange()
    if (!priceRange) return null
    const pFrom = priceRange.from  // lower price bound (chart bottom)
    const pTo   = priceRange.to    // upper price bound (chart top)
    const pSpan = pTo - pFrom

    return {
      priceToY: (price: number): number => {
        if (pSpan === 0) return NaN
        if (isLog) {
          if (price <= 0 || pFrom <= 0 || pTo <= 0) return NaN
          const lp = Math.log(price), lFrom = Math.log(pFrom), lTo = Math.log(pTo)
          const lSpan = lTo - lFrom
          return lSpan === 0 ? NaN : rect.height * (lTo - lp) / lSpan
        }
        return rect.height * (pTo - price) / pSpan
      },
      yToPrice: (y: number): number => {
        if (rect.height === 0 || pSpan === 0) return NaN
        if (isLog) {
          if (pFrom <= 0 || pTo <= 0) return NaN
          const lFrom = Math.log(pFrom), lTo = Math.log(pTo), lSpan = lTo - lFrom
          return Math.exp(lTo - (y / rect.height) * lSpan)
        }
        return pTo - (y / rect.height) * pSpan
      },
      timeToX: (utcSec: number): number => {
        const coord = coordinateForTime(utcSec)
        return coord ?? NaN
      },
      xToTime: (x: number): number => {
        const t = timeForCoordinate(x)
        if (t == null) return NaN
        return Number(t)
      },
      rect,
      isLog,
    }
  } catch {
    return null
  }
}

// ── Pure math helpers (all unit-tested) ──────────────────────────────────────

/**
 * Linear interpolate between two values.
 * @pure
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * Apply exponential momentum decay to a velocity value.
 * Used by CHART-01 parallax pan for smooth deceleration.
 * @pure
 */
export function decayVelocity(v: number, factor: number): number {
  return Math.abs(v) < 0.01 ? 0 : v * factor
}

/**
 * Rubber-band resistance: clamp movement toward a limit with diminishing return.
 * Used for price-axis pan when close to data bounds.
 * @pure
 * @param delta - The intended movement
 * @param resistance - Resistance factor in [0,1]; 0 = no movement, 1 = full
 */
export function rubberBand(delta: number, resistance: number): number {
  return delta * resistance
}

/**
 * Clamp a value between [min, max].
 * @pure
 */
export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

/**
 * Compute the number of logical bars visible given a pixel width and bar width.
 * Used for minimum/maximum zoom clamps in CHART-07.
 * @pure
 */
export function visibleBarsFromWidth(pixelWidth: number, barWidthPx: number): number {
  if (barWidthPx <= 0) return 0
  return Math.floor(pixelWidth / barWidthPx)
}

/**
 * Map a zoom delta (positive = zoom in, negative = zoom out) to a new bar count,
 * anchored at the cursor's fractional position across the visible range.
 *
 * @param currentBars - Current visible bar count
 * @param deltaY      - Raw wheel deltaY (negative = zoom in, positive = out)
 * @param cursorFrac  - Cursor position as fraction of chart width [0,1]
 * @param minBars     - Minimum allowable visible bars (hard zoom limit)
 * @param maxBars     - Maximum allowable visible bars (full dataset)
 * @returns [newBars, anchorOffset] where anchorOffset is the bar offset for
 *          setVisibleLogicalRange to keep the cursor point stationary.
 * @pure
 */
export function computeZoom(
  currentBars: number,
  deltaY: number,
  cursorFrac: number,
  minBars: number,
  maxBars: number,
): { newBars: number; anchorOffset: number } {
  const ZOOM_SPEED = 0.001
  const factor     = 1 + deltaY * ZOOM_SPEED
  const newBars    = clamp(Math.round(currentBars * factor), minBars, maxBars)
  // Keep cursor stationary: shift the logical range start by the bars-lost on
  // the left side of the cursor.
  const anchorOffset = (currentBars - newBars) * cursorFrac
  return { newBars, anchorOffset }
}
