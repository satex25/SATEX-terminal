/**
 * SATEX — Chart snapshot export (CHART-08)
 *
 * Composites the Lightweight Charts canvas, the 2D CanvasOverlay, and
 * (optionally) a WebGL layer into a single offscreen canvas and exports
 * it as a PNG blob.
 *
 * The PNG blob is forwarded to the main process via the
 * `CHART_PNG_EXPORT` IPC channel, which writes it to the user's
 * Downloads folder (or a chosen directory) — the renderer never has
 * direct filesystem access (Electron security model; Constitution §9.2).
 *
 * SVG output (vector): drawings and annotation text only — candles and
 * WebGL density layers are raster-only. The SVG export serialises the
 * drawing model to SVG path elements using the current viewport transform.
 *
 * Cleanup: all intermediate canvases are created and collected in-scope;
 * no persistent state. (PR #6 invariant — nothing outlives the call.)
 *
 * CONSTITUTION §0.1 / §0.4: the screenshot shows exactly what the user
 * sees — no data is added or modified during compositing.
 */
import type { IChartApi } from 'lightweight-charts'
import type { ViewportTransform } from './overlay/ViewportTransform'
import type { Drawing } from './drawing/DrawingModel'
import { ipcRenderer } from 'electron'

// ── IPC channel constant (mirrors IPC.CHART_PNG_EXPORT in ipc-channels.ts) ──
// Imported here directly to avoid a circular dep; the canonical value is in
// ipc-channels.ts. If the channel name changes, update both files.
const CHART_PNG_EXPORT_CHANNEL = 'satex:chart:pngExport'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ChartExportOptions {
  /** The primary LWC chart instance. */
  chart:          IChartApi
  /** The 2D overlay canvas element (from CanvasOverlay). Null if not mounted. */
  overlayCanvas:  HTMLCanvasElement | null
  /** The WebGL canvas element. Null if not mounted. */
  webglCanvas:    HTMLCanvasElement | null
  /** Current viewport transform (for SVG drawing serialisation). */
  transform?:     ViewportTransform
  /** The drawing model (for SVG export). Optional — PNG works without it. */
  drawings?:      Drawing[]
  /** Suggested filename stem (without extension). Default 'satex-chart'. */
  filenameStem?:  string
}

export type ExportFormat = 'png' | 'svg'

// ── PNG export ────────────────────────────────────────────────────────────────

/**
 * Composite all chart layers into a single PNG and send to main for download.
 * Returns true on success, false if compositing failed (e.g., no chart DOM).
 */
export async function exportChartPng(opts: ChartExportOptions): Promise<boolean> {
  const { chart, overlayCanvas, webglCanvas, filenameStem = 'satex-chart' } = opts

  // Attempt to get the LWC screenshot (LWC v5 returns a canvas element).
  // Wrap in IIFE to avoid no-useless-assignment — null init overwritten in
  // the same branch is flagged; IIFE keeps the null guard and early-return clean.
  const lwcDataUrl = (() => {
    try {
      return chart.takeScreenshot().toDataURL('image/png')
    } catch {
      return null
    }
  })()
  if (!lwcDataUrl) return false

  // Load LWC screenshot into an Image element
  const lwcImg = await loadImage(lwcDataUrl)
  const { width, height } = lwcImg

  // Create offscreen composite canvas
  const offscreen = document.createElement('canvas')
  offscreen.width  = width
  offscreen.height = height
  const ctx = offscreen.getContext('2d')
  if (!ctx) return false

  // Layer 1: LWC base chart
  ctx.drawImage(lwcImg, 0, 0)

  // Layer 2: WebGL density layer (rendered before 2D overlay)
  if (webglCanvas) {
    try { ctx.drawImage(webglCanvas, 0, 0, width, height) } catch { /* ignore */ }
  }

  // Layer 3: 2D overlay (drawings, crosshair, annotations)
  if (overlayCanvas) {
    try { ctx.drawImage(overlayCanvas, 0, 0, width, height) } catch { /* ignore */ }
  }

  // Convert to blob
  const blob = await canvasToBlob(offscreen, 'image/png')
  if (!blob) return false

  // Forward to main process for filesystem write
  const arrayBuffer = await blob.arrayBuffer()
  const uint8 = Array.from(new Uint8Array(arrayBuffer))
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const filename = `${filenameStem}-${stamp}.png`

  try {
    await ipcRenderer.invoke(CHART_PNG_EXPORT_CHANNEL, { filename, data: uint8 })
    return true
  } catch {
    return false
  }
}

// ── SVG export ────────────────────────────────────────────────────────────────

/**
 * Serialise only the drawings layer as an SVG string.
 * Candles / WebGL density are raster — they are NOT included in SVG output.
 * The SVG viewBox matches the chart's current CSS pixel dimensions.
 *
 * Drawing field access uses the discriminated union from DrawingModel.ts:
 *   HLineDraw  → .price (number)
 *   LineDraw   → .a, .b (PriceTimeAnchor)
 *   AnnotationDraw → .anchor (PriceTimeAnchor), .text (string)
 */
export function exportDrawingsSvg(
  chart:     IChartApi,
  transform: ViewportTransform,
  drawings:  Drawing[],
): string {
  const el = (chart as unknown as { chartElement: () => HTMLElement }).chartElement?.()
  const w   = el?.clientWidth  ?? 1200
  const h   = el?.clientHeight ?? 600

  const elements: string[] = []

  for (const d of drawings) {
    if (d.kind === 'hline') {
      // HLineDraw: .price is a bare number (no anchors array)
      const y = transform.priceToY(d.price)
      elements.push(
        `<line x1="0" y1="${y.toFixed(2)}" x2="${w}" y2="${y.toFixed(2)}" `
        + `stroke="${d.color ?? '#888'}" stroke-width="1" stroke-dasharray="4 2"/>`,
      )
    } else if (d.kind === 'line') {
      // LineDraw: .a and .b are PriceTimeAnchor (two-anchor trend line)
      const x1 = transform.timeToX(d.a.time),  y1 = transform.priceToY(d.a.price)
      const x2 = transform.timeToX(d.b.time),  y2 = transform.priceToY(d.b.price)
      elements.push(
        `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" `
        + `x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" `
        + `stroke="${d.color ?? '#888'}" stroke-width="${d.lineWidth ?? 1}"/>`,
      )
    } else if (d.kind === 'annotation') {
      // AnnotationDraw: .anchor is a single PriceTimeAnchor, .text is the label
      const x  = transform.timeToX(d.anchor.time)
      const y  = transform.priceToY(d.anchor.price)
      elements.push(
        `<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" `
        + `fill="${d.color ?? '#888'}" font-size="${d.fontSize ?? 12}" font-family="monospace">`
        + escapeXml(d.text)
        + `</text>`,
      )
    }
    // vline, rect, fibonacci: not rendered in SVG export (raster-equivalent only)
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`,
    `  <!-- SATEX drawing export — ${new Date().toISOString()} -->`,
    ...elements.map(e => `  ${e}`),
    `</svg>`,
  ].join('\n')
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload  = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(resolve, mimeType, 1.0))
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
