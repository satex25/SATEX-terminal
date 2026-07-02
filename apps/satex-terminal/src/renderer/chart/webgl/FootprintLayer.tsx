/**
 * SATEX — FootprintLayer (CHART-12 wiring).
 *
 * Mounts a WebGLRenderer as an overlay inside the chart canvas wrapper. The
 * current paint callback is an MVP tint pass that proves the GL pipeline +
 * lifecycle works; richer footprint-cell rendering (per-bucket buy/sell
 * volumes from chart-indicators/webgl/footprint.ts) lands as follow-up
 * work — see TODO below.
 *
 * Lifecycle:
 *   - Effect creates one WebGLRenderer instance on mount; .destroy() on unmount.
 *   - WebGLRenderer owns its own canvas, rAF loop, resize sync, and context-
 *     loss handling, so this wrapper is essentially a React lifecycle bridge.
 *
 * Why a component vs. inline in ChartPanel: keeps the GL setup off the main
 * panel and lets a future replacement (full footprint cells, vol heatmap)
 * land here without touching ChartPanel.
 */
import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { WebGLRenderer } from './WebGLRenderer'

interface Props {
  /** Container element the GL canvas should be appended into. */
  containerRef: RefObject<HTMLElement | null>
  /** If false, the renderer tears down and the canvas disappears. */
  enabled: boolean
}

export function FootprintLayer({ containerRef, enabled }: Props) {
  const rendererRef = useRef<WebGLRenderer | null>(null)

  useEffect(() => {
    if (!enabled) return
    const host = containerRef.current
    if (!host) return

    // TODO(CHART-12 follow-up): replace this tint-only paint with per-bucket
    // footprint cells. The renderer side is ready; needs a Trade[] source
    // (already in tradesStore) piped through chart-indicators' footprint.ts
    // aggregation, then drawn as colored quads keyed by price bucket. See
    // docs/superpowers/specs/2026-06-15-chart-interaction-layer-ultraplan.md.
    const renderer = new WebGLRenderer(host, {
      paint: (gl, width, height) => {
        gl.viewport(0, 0, width, height)
        // Translucent neutral tint — confirms the GL canvas is mounted and
        // the rAF loop is firing without overwhelming the chart visually.
        gl.clearColor(0.05, 0.45, 0.95, 0.04)
        gl.clear(gl.COLOR_BUFFER_BIT)
      },
      onContextRestored: () => { /* re-upload GPU buffers here when consumers add them */ },
      zIndex: 13,
    })
    rendererRef.current = renderer

    return () => {
      renderer.destroy()
      rendererRef.current = null
    }
  }, [enabled, containerRef])

  return null
}
