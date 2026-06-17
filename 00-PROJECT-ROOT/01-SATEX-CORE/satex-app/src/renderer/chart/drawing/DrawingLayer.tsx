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
 */
import { useEffect, useRef } from 'react'
import { useDrawingStore }  from './drawingStore'
import { fibLevels, drawingInView } from './DrawingModel'
import type { Drawing, FibDraw } from './DrawingModel'
import type { ViewportTransform } from '../overlay/ViewportTransform'

// ── Types ─────────────────────────────────────────────────────────────────────

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

// ── Default colors ────────────────────────────────────────────────────────────

const DEFAULT_COLOR     = '#e0e0e0'
const SELECTED_COLOR    = '#e94b3c'   // --bb-ambient
const FIB_COLORS: Record<string, string> = {
  '0.0%':   '#888888',
  '23.6%':  '#4caf50',
  '38.2%':  '#8bc34a',
  '50.0%':  '#ffeb3b',
  '61.8%':  '#ff9800',
  '78.6%':  '#f44336',
  '100.0%': '#888888',
}

// ── Draw helpers ──────────────────────────────────────────────────────────────

function drawLine(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number,
  x2: number, y2: number,
  dpr: number,
) {
  ctx.beginPath()
  ctx.moveTo(x1 * dpr, y1 * dpr)
  ctx.lineTo(x2 * dpr, y2 * dpr)
  ctx.stroke()
}

export function renderDrawing(
  ctx:       CanvasRenderingContext2D,
  drawing:   Drawing,
  transform: ViewportTransform,
  dpr:       number,
  accent:    string,
): void {
  const { timeToX, priceToY, rect } = transform
  const { width, height } = rect
  const color = drawing.selected
    ? accent
    : (drawing.color ?? DEFAULT_COLOR)

  ctx.save()
  ctx.strokeStyle = color
  ctx.fillStyle   = color
  ctx.lineWidth   = (drawing.lineWidth ?? 1) * dpr
  ctx.font        = `${12 * dpr}px 'JetBrains Mono', monospace`

  switch (drawing.kind) {
    case 'line': {
      const x1 = timeToX(drawing.a.time)
      const y1 = priceToY(drawing.a.price)
      const x2 = timeToX(drawing.b.time)
      const y2 = priceToY(drawing.b.price)
      if (drawing.extend) {
        // Extend line to canvas edges
        const slope = (y2 - y1) / ((x2 - x1) || 1)
        const yAt0  = y1 - slope * x1
        const yAtW  = yAt0 + slope * width
        drawLine(ctx, 0, yAt0, width, yAtW, dpr)
      } else {
        drawLine(ctx, x1, y1, x2, y2, dpr)
      }
      break
    }

    case 'hline': {
      const y = priceToY(drawing.price)
      drawLine(ctx, 0, y, width, y, dpr)
      if (drawing.label) {
        ctx.fillText(drawing.label, 4 * dpr, (y - 3) * dpr)
      }
      break
    }

    case 'vline': {
      const x = timeToX(drawing.time)
      drawLine(ctx, x, 0, x, height, dpr)
      if (drawing.label) {
        ctx.fillText(drawing.label, (x + 3) * dpr, 14 * dpr)
      }
      break
    }

    case 'rect': {
      const x1 = timeToX(drawing.topLeft.time)
      const y1 = priceToY(drawing.topLeft.price)
      const x2 = timeToX(drawing.bottomRight.time)
      const y2 = priceToY(drawing.bottomRight.price)
      const rectW = (x2 - x1) * dpr
      const rectH = (y2 - y1) * dpr
      ctx.globalAlpha = drawing.fillOpacity
      ctx.fillRect(x1 * dpr, y1 * dpr, rectW, rectH)
      ctx.globalAlpha = 1
      ctx.strokeRect(x1 * dpr, y1 * dpr, rectW, rectH)
      break
    }

    case 'fibonacci': {
      const fib = drawing as FibDraw
      const x1  = timeToX(fib.high.time)
      const x2  = timeToX(fib.low.time)
      const leftX  = Math.min(x1, x2)
      const rightX = Math.max(x1, x2)
      for (const level of fibLevels(fib)) {
        const y   = priceToY(level.price)
        const fibColor = FIB_COLORS[level.label] ?? DEFAULT_COLOR
        ctx.strokeStyle = drawing.selected ? accent : fibColor
        ctx.fillStyle   = drawing.selected ? accent : fibColor
        drawLine(ctx, leftX, y, rightX, y, dpr)
        ctx.fillText(
          `${level.label}  ${level.price.toFixed(2)}`,
          (rightX + 4) * dpr,
          y * dpr,
        )
      }
      break
    }

    case 'annotation': {
      const x  = timeToX(drawing.anchor.time)
      const y  = priceToY(drawing.anchor.price)
      const fs = (drawing.fontSize ?? 12) * dpr
      ctx.font = `${fs}px 'JetBrains Mono', monospace`
      // Dot at anchor
      ctx.beginPath()
      ctx.arc(x * dpr, y * dpr, 3 * dpr, 0, Math.PI * 2)
      ctx.fill()
      // Text label
      ctx.fillText(drawing.text, (x + 6) * dpr, (y - 4) * dpr)
      break
    }
  }

  ctx.restore()
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DrawingLayer({ transform, symbol, canvas, accentColor = SELECTED_COLOR }: Props) {
  const drawings = useDrawingStore((s) => s.drawings[symbol] ?? [])
  const rafRef   = useRef<number>(0)

  useEffect(() => {
    if (!canvas || !transform) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const fromTime = transform.xToTime(0)
    const toTime   = transform.xToTime(transform.rect.width)
    const maxPrice = transform.yToPrice(0)
    const minPrice = transform.yToPrice(transform.rect.height)

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
