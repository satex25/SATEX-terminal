/**
 * SATEX — CanvasOverlay (§3.1 chart-interaction-layer)
 *
 * Absolutely-positioned <canvas> element that sits on top of the Lightweight
 * Charts canvas. It is DPR-aware, resize-synced via ResizeObserver, and fully
 * cleans up its context + observer + rAF handle on unmount (Constitution
 * invariant: "clean up what you create" — PR #6 precedent).
 *
 * Usage:
 *   <div className="chart-host" ref={containerRef} style={{ position: 'relative' }}>
 *     {chartElement}
 *     <CanvasOverlay
 *       containerRef={containerRef}
 *       onDraw={(ctx, w, h, dpr) => { /* draw here *\/ }}
 *     />
 *   </div>
 *
 * The `onDraw` callback fires every animation frame. It receives a cleared
 * canvas context, the CSS width/height, and the device pixel ratio so callers
 * can do DPR-aware drawing without managing the canvas internals.
 *
 * `triggerRedraw` is a ref to an imperative redraw function — call it from
 * event handlers that need an immediate repaint without waiting for rAF.
 */
import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import type { RefObject } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

export type DrawCallback = (
  ctx:    CanvasRenderingContext2D,
  width:  number,
  height: number,
  dpr:    number,
) => void

export interface CanvasOverlayHandle {
  /** Request an immediate redraw (useful from pointer event handlers). */
  redraw: () => void
  /** The underlying <canvas> element. */
  canvas: HTMLCanvasElement | null
}

interface Props {
  /** Ref to the container element the overlay should fill. */
  containerRef: RefObject<HTMLElement | null>
  /** Called every animation frame with a cleared canvas context. */
  onDraw:       DrawCallback
  /** z-index for the overlay canvas (default: 10). */
  zIndex?:      number
  /** If false, the overlay renders nothing (useful for conditional features). */
  enabled?:     boolean
  /** Pointer-events mode ('none' = passthrough, 'auto' = capture). Default 'none'. */
  pointerEvents?: 'none' | 'auto'
}

// ── Component ─────────────────────────────────────────────────────────────────

export const CanvasOverlay = forwardRef<CanvasOverlayHandle, Props>(function CanvasOverlay(
  {
    containerRef,
    onDraw,
    zIndex = 10,
    enabled = true,
    pointerEvents = 'none',
  },
  ref,
) {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const rafRef     = useRef<number>(0)
  const drawRef    = useRef<DrawCallback>(onDraw)

  // Keep drawRef current so the rAF loop always calls the latest onDraw without
  // re-registering the loop on every render (stable closure pattern).
  useEffect(() => { drawRef.current = onDraw }, [onDraw])

  useImperativeHandle(ref, () => ({
    redraw: () => {
      if (!canvasRef.current || !enabled) return
      const canvas = canvasRef.current
      const ctx    = canvas.getContext('2d')
      if (!ctx) return
      const dpr = window.devicePixelRatio || 1
      const w   = canvas.clientWidth
      const h   = canvas.clientHeight
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.save()
      ctx.scale(dpr, dpr)
      drawRef.current(ctx, w, h, dpr)
      ctx.restore()
    },
    canvas: canvasRef.current,
  }), [enabled])

  useEffect(() => {
    if (!enabled) return

    const canvas    = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let dpr = window.devicePixelRatio || 1

    // ── Sizing ─────────────────────────────────────────────────────────────
    function syncSize() {
      if (!canvas || !container) return
      const dpr2 = window.devicePixelRatio || 1
      if (dpr2 !== dpr) dpr = dpr2
      const w = container.clientWidth
      const h = container.clientHeight
      canvas.width  = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      canvas.style.width  = `${w}px`
      canvas.style.height = `${h}px`
    }

    syncSize()

    const observer = new ResizeObserver(() => { syncSize() })
    observer.observe(container)

    // ── rAF loop ───────────────────────────────────────────────────────────
    function frame() {
      if (!canvas || !ctx) return
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.save()
      ctx.scale(dpr, dpr)
      drawRef.current(ctx, w, h, dpr)
      ctx.restore()
      rafRef.current = requestAnimationFrame(frame)
    }

    rafRef.current = requestAnimationFrame(frame)

    return () => {
      // Clean up — PR #6 invariant: disconnect observer, cancel rAF.
      observer.disconnect()
      cancelAnimationFrame(rafRef.current)
    }
  }, [containerRef, enabled])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position:      'absolute',
        top:           0,
        left:          0,
        pointerEvents,
        zIndex,
      }}
      aria-hidden="true"
    />
  )
})

CanvasOverlay.displayName = 'CanvasOverlay'
