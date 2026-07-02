/**
 * SATEX — Order-flow tape (CHART-12)
 *
 * Vertical Time & Sales panel mounted beside the chart. Streams prints from
 * the `onTrades` / TRADES_TICK channel; colors each by aggressor side:
 *   green  = buy (ask-lifted)
 *   red    = sell (bid-hit)
 *   gray   = unknown (inferred side not available — sim free-feed)
 *
 * Design decisions:
 *   - Max 500 prints in memory (ring-buffer drop-oldest). No infinite growth.
 *   - Speed throttle: renders at most once per animation frame via useRef flag.
 *   - Pure renderer component — no order execution path, no IPC writes.
 *     Analytic surface only (§4 ultraplan ⛔ invariant).
 *   - Teardown: clearInterval + rAF cancel on unmount (PR #6 discipline).
 *   - SIM badge: reads `isSyntheticFeed` from canonical gate (not inline logic).
 */
import React, { useEffect, useRef, useCallback, memo } from 'react'
import type { Trade } from '@shared/types'

// ── Config ────────────────────────────────────────────────────────────────────

const MAX_PRINTS = 500

// ── Props ─────────────────────────────────────────────────────────────────────

export interface OrderFlowTapeProps {
  /** Live trade stream — caller pushes new Trade[] on each TRADES_TICK. */
  trades:          readonly Trade[]
  /** Accent color for the panel border. Comes from themeStore. */
  accentColor?:    string
  /** Height of the tape panel in px. Default 100% of container. */
  height?:         number | string
  /** Width in px. Default 180. */
  width?:          number
  /** Whether the data source is simulated (canonical gate — do NOT re-derive). */
  isSyntheticFeed: boolean
}

// ── Color helpers ─────────────────────────────────────────────────────────────

function sideColor(side: Trade['side'] | undefined, isDim: boolean): string {
  const base = side === 'buy' ? '#22c55e' : side === 'sell' ? '#ef4444' : '#6b7280'
  return isDim ? base + '99' : base  // dim inferred prints (lower confidence)
}

// ── Component ─────────────────────────────────────────────────────────────────

export const OrderFlowTape = memo(function OrderFlowTape({
  trades,
  accentColor  = '#3b82f6',
  height       = '100%',
  width        = 180,
  isSyntheticFeed,
}: OrderFlowTapeProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const printBufRef  = useRef<Trade[]>([])
  const rafRef       = useRef<number>(0)
  const dirtyRef     = useRef(false)

  // Sync the internal ring-buffer with the incoming trades prop
  useEffect(() => {
    const buf = printBufRef.current
    const incoming = trades as Trade[]

    for (const t of incoming) {
      buf.push(t)
    }
    // Ring-buffer: drop oldest if over limit
    if (buf.length > MAX_PRINTS) {
      buf.splice(0, buf.length - MAX_PRINTS)
    }
    dirtyRef.current = true
  }, [trades])

  // rAF-throttled DOM render — one write per frame max
  const flush = useCallback(() => {
    if (!dirtyRef.current) return
    dirtyRef.current = false

    const container = containerRef.current
    if (!container) return

    const buf = printBufRef.current
    const rows = buf
      .slice()
      .reverse()
      .map((t) => {
        const isDim = t.provenance === 'inferred'
        const color = sideColor(t.side, isDim)
        const ts = new Date(t.ts).toLocaleTimeString('en-US', { hour12: false })
        return (
          `<div style="display:flex;justify-content:space-between;padding:1px 6px;` +
          `font-size:11px;color:${color};font-family:monospace;line-height:1.4">` +
          `<span>${ts}</span>` +
          `<span>${t.price.toFixed(2)}</span>` +
          `<span>${t.size}</span>` +
          `</div>`
        )
      })
      .join('')

    container.innerHTML = rows
  }, [])

  // rAF loop
  useEffect(() => {
    let cancelled = false
    const tick = () => {
      if (cancelled) return
      flush()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      cancelled = true
      cancelAnimationFrame(rafRef.current)
    }
  }, [flush])

  const borderStyle = `1px solid ${accentColor}33`

  return (
    <div
      style={{
        width,
        height,
        borderLeft: borderStyle,
        background: '#0a0a0f',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative',
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '3px 6px',
          borderBottom: borderStyle,
          fontSize: 10,
          color: '#6b7280',
          fontFamily: 'monospace',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        <span>Flow Tape</span>
        {isSyntheticFeed && (
          <span
            style={{
              background: '#facc15',
              color: '#000',
              fontSize: 9,
              padding: '0 4px',
              borderRadius: 2,
              fontWeight: 700,
            }}
          >
            SIM
          </span>
        )}
        <span style={{ marginLeft: 'auto' }}>{printBufRef.current.length}</span>
      </div>

      {/* Column labels */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '1px 6px',
          fontSize: 9,
          color: '#374151',
          fontFamily: 'monospace',
          borderBottom: `1px solid #1f2937`,
        }}
      >
        <span>Time</span>
        <span>Price</span>
        <span>Size</span>
      </div>

      {/* Scrollable print list (DOM-managed for perf) */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      />
    </div>
  )
})
