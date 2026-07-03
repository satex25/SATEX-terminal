/**
 * SATEX — DrawingLayer (CHART-03 · CHART-04 · CHART-09)
 *
 * React component that renders chart drawings (lines, h/v-lines, rectangles,
 * Fibonacci levels, and text annotations) onto the CanvasOverlay.
 *
 * Rendering model:
 *  - Drawings are stored in price/time space in drawingStore.
 *  - Each frame: derive pixel coordinates from ViewportTransform (never cached).
 *  - Draw onto the canvas handle exposed by CanvasOverlay via forwardRef.
 *  - Frustum cull via `drawingInView` before spending any draw calls.
 *
 * Cleanup (PR #6 precedent):
 *  - useEffect returns a cleanup that cancels the pending rAF.
 *  - No ResizeObserver here — CanvasOverlay owns that lifecycle.
 *
 * CHART-04 annotations: text is rendered with canvas fillText; position
 * re-derived from the anchor on every frame (survives pan/zoom).
 *
 * Canvas rendering helpers (renderDrawing, drawLine, colour constants) live in
 * drawing-renderer.ts — extracted so this file exports only the component
 * (react-refresh/only-export-components; P-023).
 */
import { useEffect, useRef }    from 'react'
import { useDrawingStore, selectDrawings } from './drawingStore'
import { drawingInView }         from './DrawingModel'
import { renderDrawing }         from './drawing-renderer'
import type { ViewportTransform } from '../overlay/ViewportTransform'

// ── Types ─────────────────────────────────────────────────────────────────────────────────

interface Props {
  /** LWC-derived viewport transform for the current frame. */
  transform: ViewportTransform | null
  /** Active symbol — determines which drawings to render. */
  symbol:    string
  /** Canvas element from CanvasOverlay (via ref). */
  canvas:    HTMLCanvasElement | null
  /** Theme color for selected-drawing highlight. */
  accentColor?: string
}

// ── Default colors ────────────────────────────────────────────────────────────────────────

const SELECTED_COLOR = '#e94b3c'   // --bb-ambient

// ── Component ───────────────────────────────────────────────────────────────────────────────

export function DrawingLayer({ transform, symbol, canvas, accentColor = SELECTED_COLOR }: Props) {
  const drawings = useDrawingStore(selectDrawings(symbol))
  const rafRef   = useRef<number>(0)

  useEffect(() => {
    if (!canvas || !transform) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr       = window.devicePixelRatio || 1
    const fromTime  = transform.xToTime(0)
    const toTime    = transform.xToTime(transform.rect.width)
    const maxPrice  = transform.yToPrice(0)
    const minPrice  = transform.yToPrice(transform.rect.height)

    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      for (const drawing of drawings) {
        if (!drawingInView(drawing, fromTime, toTime, minPrice, maxPrice)) continue
        renderDrawing(ctx, drawing, transform, dpr, accentColor)
      }
    })

    return () => { cancelAnimationFrame(rafRef.current) }
  }, [drawings, transform, canvas, accentColor])

  return null
}
