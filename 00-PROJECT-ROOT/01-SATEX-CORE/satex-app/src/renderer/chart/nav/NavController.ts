/**
 * SATEX — NavController (CHART-01 · CHART-02 · CHART-07)
 *
 * Drives all chart navigation through LWC v5's scale APIs:
 *   CHART-01  Vertical parallax — price-axis pan with momentum + rubber-band
 *   CHART-02  Horizontal timeframe drag — grab-and-slide visible window
 *   CHART-07  Cursor-centered zoom — wheel → widen/narrow logical range
 *
 * Implemented as a plain class (not a React hook) so it can be instantiated
 * once on chart mount and torn down cleanly on unmount without React deps.
 * All pointer event handlers are registered on the container element; all
 * navigation goes through LWC's programmatic API — no synthetic scrolling.
 *
 * Cleanup: call .destroy() on unmount. Removes all listeners, cancels rAFs,
 * and stops the momentum loop.
 */
import type { IChartApi } from 'lightweight-charts'
import { decayVelocity, rubberBand, clamp, computeZoom } from '../overlay/ViewportTransform'

// ── Config ────────────────────────────────────────────────────────────────────

const NAV_CONFIG = {
  /** Momentum decay factor per frame (0.92 = ~14 frames to 1%). */
  momentumDecay:      0.92,
  /** Rubber-band resistance near data bounds [0,1]. */
  rubberBandResist:   0.3,
  /** Minimum visible bars (hard zoom-in clamp). */
  minBars:            50,
  /** Maximum visible bars (hard zoom-out clamp). */
  maxBars:            5000,
  /** Zoom sensitivity: fraction of bars changed per wheel tick unit. */
  zoomSpeed:          0.001,
  /** Dead zone in px before horizontal drag engages (prevents accidental drags). */
  dragDeadzonePx:     4,
  /** Dead zone in px before vertical pan engages. */
  panDeadzonePx:      4,
  /** Price range pan speed multiplier (fraction of price range per px). */
  priceRangePxFactor: 0.004,
}

// ── Types ─────────────────────────────────────────────────────────────────────

type DragState = {
  active:      boolean
  mode:        'none' | 'horizontal' | 'vertical'
  startX:      number
  startY:      number
  lastX:       number
  lastY:       number
  /** Velocity for momentum in the horizontal direction (bars/frame). */
  velX:        number
  /** Velocity for momentum in the vertical direction (price units/frame). */
  velY:        number
  /** Visible logical range at drag start — used to compute delta. */
  startRange:  { from: number; to: number } | null
  /** Price range at drag start for vertical pan. */
  startPrices: { min: number; max: number } | null
}

// ── NavController ─────────────────────────────────────────────────────────────

export class NavController {
  private readonly chart:     IChartApi
  private readonly container: HTMLElement
  private drag:               DragState
  private rafId:              number = 0
  private destroyed:          boolean = false

  constructor(chart: IChartApi, container: HTMLElement) {
    this.chart     = chart
    this.container = container
    this.drag      = {
      active: false, mode: 'none',
      startX: 0, startY: 0, lastX: 0, lastY: 0,
      velX: 0, velY: 0,
      startRange: null, startPrices: null,
    }

    this.onWheel      = this.onWheel.bind(this)
    this.onPointerDown = this.onPointerDown.bind(this)
    this.onPointerMove = this.onPointerMove.bind(this)
    this.onPointerUp   = this.onPointerUp.bind(this)

    container.addEventListener('wheel', this.onWheel, { passive: false })
    container.addEventListener('pointerdown', this.onPointerDown)
    container.addEventListener('pointermove', this.onPointerMove)
    container.addEventListener('pointerup',   this.onPointerUp)
    container.addEventListener('pointercancel', this.onPointerUp)
    container.addEventListener('pointerleave',  this.onPointerUp)
  }

  // ── CHART-07: Cursor-centered zoom ────────────────────────────────────────

  private onWheel(e: WheelEvent): void {
    if (this.destroyed) return
    e.preventDefault()

    const ts    = this.chart.timeScale()
    const range = ts.getVisibleLogicalRange()
    if (!range) return

    const currentBars = range.to - range.from
    const cursorFrac  = clamp(e.offsetX / this.container.clientWidth, 0, 1)

    const { newBars, anchorOffset } = computeZoom(
      currentBars,
      e.deltaY,
      cursorFrac,
      NAV_CONFIG.minBars,
      NAV_CONFIG.maxBars,
    )

    const newFrom = range.from + anchorOffset
    ts.setVisibleLogicalRange({ from: newFrom, to: newFrom + newBars })
  }

  // ── CHART-01 + CHART-02: Drag (vertical parallax / horizontal drag) ───────

  private onPointerDown(e: PointerEvent): void {
    if (this.destroyed) return
    if (e.button !== 0) return  // left button only

    // Cancel any in-flight momentum
    cancelAnimationFrame(this.rafId)

    this.container.setPointerCapture(e.pointerId)
    const ts    = this.chart.timeScale()
    const ps    = this.chart.priceScale('right')
    const range = ts.getVisibleLogicalRange()

    // Snapshot the price range for vertical pan start via LWC v5 getVisibleRange.
    const visRange = ps.getVisibleRange()
    const minPrice = visRange?.from ?? null
    const maxPrice = visRange?.to ?? null

    this.drag = {
      active:      true,
      mode:        'none',
      startX:      e.clientX,
      startY:      e.clientY,
      lastX:       e.clientX,
      lastY:       e.clientY,
      velX:        0,
      velY:        0,
      startRange:  range ? { from: range.from, to: range.to } : null,
      startPrices: (minPrice != null && maxPrice != null)
        ? { min: minPrice, max: maxPrice }
        : null,
    }
  }

  private onPointerMove(e: PointerEvent): void {
    if (this.destroyed || !this.drag.active) return

    const dx = e.clientX - this.drag.startX
    const dy = e.clientY - this.drag.startY

    // Determine drag mode on first significant movement
    if (this.drag.mode === 'none') {
      if (Math.abs(dx) > NAV_CONFIG.dragDeadzonePx) {
        this.drag.mode = 'horizontal'
        // Disable LWC's internal scroll so we control it
        this.chart.applyOptions({ handleScroll: false })
      } else if (Math.abs(dy) > NAV_CONFIG.panDeadzonePx) {
        this.drag.mode = 'vertical'
        // Switch price scale to manual mode for pan
        this.chart.applyOptions({
          rightPriceScale: { autoScale: false },
        })
      }
    }

    if (this.drag.mode === 'horizontal') {
      this.applyHorizontalDrag(dx)
    } else if (this.drag.mode === 'vertical') {
      this.applyVerticalPan(dy)
    }

    // Track velocity for momentum
    this.drag.velX = e.clientX - this.drag.lastX
    this.drag.velY = e.clientY - this.drag.lastY
    this.drag.lastX = e.clientX
    this.drag.lastY = e.clientY
  }

  private onPointerUp(e: PointerEvent): void {
    if (this.destroyed || !this.drag.active) return

    try { this.container.releasePointerCapture(e.pointerId) } catch { /* already released */ }

    const mode = this.drag.mode
    const velX = this.drag.velX
    const velY = this.drag.velY
    this.drag.active = false

    // Re-enable LWC's internal scroll handler after horizontal drag
    if (mode === 'horizontal') {
      this.chart.applyOptions({ handleScroll: true })
    }

    // Launch momentum loop if velocity is significant
    if (Math.abs(velX) > 0.5 && mode === 'horizontal') {
      this.startMomentum(velX, 0)
    } else if (Math.abs(velY) > 0.5 && mode === 'vertical') {
      this.startMomentum(0, velY)
    }
  }

  // ── Horizontal drag logic (CHART-02) ──────────────────────────────────────

  private applyHorizontalDrag(totalDxPx: number): void {
    const { startRange } = this.drag
    if (!startRange) return

    const ts    = this.chart.timeScale()
    const range = ts.getVisibleLogicalRange()
    if (!range) return

    const barWidth = this.container.clientWidth / (startRange.to - startRange.from)
    if (barWidth <= 0) return

    const deltaBars = totalDxPx / barWidth
    const newFrom   = startRange.from - deltaBars
    const newTo     = startRange.to   - deltaBars

    ts.setVisibleLogicalRange({ from: newFrom, to: newTo })
  }

  // ── Vertical pan logic (CHART-01) ─────────────────────────────────────────

  private applyVerticalPan(totalDyPx: number): void {
    const { startPrices } = this.drag
    if (!startPrices) return

    const { min, max } = startPrices
    const priceRange = max - min
    if (Math.abs(priceRange) < 1e-10) return

    const pricePerPx = priceRange * NAV_CONFIG.priceRangePxFactor
    const deltaPriceRaw = totalDyPx * pricePerPx
    // Apply rubber-band when pushing against approximate data bounds
    const ps       = this.chart.priceScale('right')
    const visRange = ps.getVisibleRange()
    const curMin   = visRange?.from ?? null
    const curMax   = visRange?.to ?? null

    // Simple rubber-band: if we'd go below floor or above ceiling, dampen
    let deltaPrice = deltaPriceRaw
    if (curMin != null && curMin - deltaPrice < min * 0.5) {
      deltaPrice = rubberBand(deltaPrice, NAV_CONFIG.rubberBandResist)
    }
    if (curMax != null && curMax - deltaPrice > max * 2) {
      deltaPrice = rubberBand(deltaPrice, NAV_CONFIG.rubberBandResist)
    }

    const newMin = startPrices.min + deltaPrice
    const newMax = startPrices.max + deltaPrice
    this.chart.applyOptions({
      rightPriceScale: { autoScale: false },
    })
    const rightPs = this.chart.priceScale('right')
    rightPs.applyOptions({ autoScale: false })
    rightPs.setVisibleRange({ from: newMin, to: newMax })
  }

  // ── Momentum loop (shared by horizontal + vertical) ───────────────────────

  private startMomentum(vx: number, vy: number): void {
    if (this.destroyed) return

    let velX = vx
    let velY = vy
    const ts = this.chart.timeScale()

    const tick = (): void => {
      if (this.destroyed) return
      velX = decayVelocity(velX, NAV_CONFIG.momentumDecay)
      velY = decayVelocity(velY, NAV_CONFIG.momentumDecay)

      if (velX === 0 && velY === 0) return

      if (velX !== 0) {
        const range = ts.getVisibleLogicalRange()
        if (!range) return
        const barWidth = this.container.clientWidth / (range.to - range.from)
        const deltaBars = velX / barWidth
        ts.setVisibleLogicalRange({
          from: range.from - deltaBars,
          to:   range.to   - deltaBars,
        })
      }

      if (velY !== 0) {
        const ps       = this.chart.priceScale('right')
        const visRange = ps.getVisibleRange()
        const min      = visRange?.from ?? null
        const max      = visRange?.to ?? null
        if (min == null || max == null) return
        const priceRange = max - min
        const deltaPrice = velY * priceRange * NAV_CONFIG.priceRangePxFactor
        ps.setVisibleRange({ from: min + deltaPrice, to: max + deltaPrice })
      }

      this.rafId = requestAnimationFrame(tick)
    }

    this.rafId = requestAnimationFrame(tick)
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    cancelAnimationFrame(this.rafId)
    this.container.removeEventListener('wheel', this.onWheel)
    this.container.removeEventListener('pointerdown', this.onPointerDown)
    this.container.removeEventListener('pointermove', this.onPointerMove)
    this.container.removeEventListener('pointerup',   this.onPointerUp)
    this.container.removeEventListener('pointercancel', this.onPointerUp)
    this.container.removeEventListener('pointerleave',  this.onPointerUp)
    // Restore defaults
    try {
      this.chart.applyOptions({ handleScroll: true })
      this.chart.applyOptions({ rightPriceScale: { autoScale: true } })
    } catch { /* chart may already be disposed */ }
  }
}
