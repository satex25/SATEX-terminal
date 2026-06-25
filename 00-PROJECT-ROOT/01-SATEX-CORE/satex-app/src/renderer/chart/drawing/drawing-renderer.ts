/**
 * SATEX — drawing-renderer (CHART-03 · CHART-04)
 *
 * Pure canvas rendering helpers for chart drawings.
 * Extracted from DrawingLayer.tsx so that file exports only the React
 * component (satisfies react-refresh/only-export-components; P-023).
 */
import { fibLevels } from './DrawingModel'
import type { Drawing, FibDraw } from './DrawingModel'
import type { ViewportTransform } from '../overlay/ViewportTransform'

// ── Default colors ────────────────────────────────────────────────────────────

const DEFAULT_COLOR     = '#e0e0e0'
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
        const y        = priceToY(level.price)
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
