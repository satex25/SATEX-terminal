/**
 * SATEX — WebGLRenderer base (CHART-10)
 *
 * A thin WebGL2 wrapper that owns:
 *   - One WebGL2 canvas, positioned as an absolutely-placed overlay.
 *   - One rAF loop calling the `paint` callback on each frame.
 *   - Context-loss detection and graceful degradation to a 2D fallback.
 *   - Clean teardown on `.destroy()` (PR #6 invariant — clean up what you create).
 *
 * Consumers sub-class or compose this. The minimal contract:
 *   1. Construct with the container element.
 *   2. Provide a `paint(gl, width, height)` callback that does the GL draw.
 *   3. Call `.destroy()` on unmount.
 *
 * Context loss: WebGL contexts can be lost (GPU reset, driver crash). The
 * handler re-creates the context and calls `onContextRestored()` so
 * consumers can re-upload buffers/textures. On context loss the canvas
 * goes transparent (graceful blank) until restored.
 */

export type PaintFn = (
  gl: WebGL2RenderingContext,
  width:  number,
  height: number,
) => void

export interface WebGLRendererOptions {
  /** Called every animation frame with a live GL context. */
  paint:              PaintFn
  /** Called after a context-loss event is recovered. Re-upload buffers here. */
  onContextRestored?: () => void
  /** zIndex for the overlay canvas. Default 15 (below crosshair at 20). */
  zIndex?: number
}

export class WebGLRenderer {
  private canvas:     HTMLCanvasElement
  private gl:         WebGL2RenderingContext | null = null
  private rafId:      number = 0
  private destroyed:  boolean = false
  private readonly opts: WebGLRendererOptions

  constructor(container: HTMLElement, opts: WebGLRendererOptions) {
    this.opts = opts

    // Create and position the overlay canvas
    this.canvas = document.createElement('canvas')
    const s = this.canvas.style
    s.position = 'absolute'
    s.inset     = '0'
    s.zIndex    = String(opts.zIndex ?? 15)
    s.pointerEvents = 'none'
    container.appendChild(this.canvas)

    // Context-loss handlers
    this.canvas.addEventListener('webglcontextlost', this.onContextLost, false)
    this.canvas.addEventListener('webglcontextrestored', this.onContextRestored, false)

    this.initGL()
    this.startLoop()
  }

  // ── GL init ───────────────────────────────────────────────────────────────

  private initGL(): void {
    const gl = this.canvas.getContext('webgl2', {
      antialias:   false,  // perf over AA for density overlays
      depth:       false,
      stencil:     false,
      alpha:       true,
      premultipliedAlpha: false,
    })
    this.gl = gl
  }

  // ── rAF loop ──────────────────────────────────────────────────────────────

  private startLoop(): void {
    const tick = (): void => {
      if (this.destroyed) return
      this.frame()
      this.rafId = requestAnimationFrame(tick)
    }
    this.rafId = requestAnimationFrame(tick)
  }

  private frame(): void {
    const gl = this.gl
    if (!gl) return

    const canvas = this.canvas
    const parent = canvas.parentElement
    if (!parent) return

    const w = parent.clientWidth
    const h = parent.clientHeight
    const dpr = window.devicePixelRatio || 1
    const pw  = Math.round(w * dpr)
    const ph  = Math.round(h * dpr)

    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width  = pw
      canvas.height = ph
    }

    gl.viewport(0, 0, pw, ph)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)

    try {
      this.opts.paint(gl, pw, ph)
    } catch {
      // Paint errors must not crash the rAF loop
    }
  }

  // ── Context loss / restore ────────────────────────────────────────────────

  private readonly onContextLost = (e: Event): void => {
    e.preventDefault()
    this.gl = null
    cancelAnimationFrame(this.rafId)
  }

  private readonly onContextRestored = (): void => {
    if (this.destroyed) return
    this.initGL()
    this.opts.onContextRestored?.()
    this.startLoop()
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /** Force an immediate re-render outside the rAF loop (e.g., on data update). */
  invalidate(): void {
    if (!this.destroyed) this.frame()
  }

  /** Return the underlying canvas (for compositing / export). */
  getCanvas(): HTMLCanvasElement { return this.canvas }

  /** Call on React unmount. Idempotent. */
  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    cancelAnimationFrame(this.rafId)
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost)
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored)
    // Signal context loss (frees GPU memory)
    const ext = this.gl?.getExtension('WEBGL_lose_context')
    ext?.loseContext()
    this.gl = null
    this.canvas.remove()
  }
}
