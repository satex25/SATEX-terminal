/**
 * SATEX — RailSlot (fully-collapsible side-rail wrapper).
 *
 * Operator ask, 2026-07-02 (Intel-workspace ultraplan, Phase D polish): every
 * side module — Watchlist, Depth, Regime, Exec, News, Risk, Logs, Health —
 * collapses *fully* the same way the chart-header toggle does, standardizing
 * the interaction `FundedAccountPanel.tsx` already ships (`fa-collapse-btn`,
 * `▸`/`▾` glyphs). "Fully" means the pane hides completely and its grid track
 * shrinks to a thin re-open handle — the actual track-size math lives in
 * `lib/rail-layout.ts`; this component only renders the two visual states and
 * never touches layout math itself.
 *
 * Wraps existing panels from the OUTSIDE — none of Watchlist/DepthBook/
 * Regime/ExecTicket/News/RiskGate/SystemLogs/Health's own source changes.
 * Purely presentational: no listener, no timer, no ResizeObserver — nothing
 * for the PR #6 leak class to catch here. View state only; routes no order.
 */
import type { ReactNode } from 'react'

interface RailSlotProps {
  title: string
  /** 'col' = this rail collapses horizontally (a column shrinks to a vertical
   *  handle strip). 'row' = collapses vertically (a row shrinks to a
   *  horizontal handle bar). */
  orientation: 'col' | 'row'
  collapsed: boolean
  onToggle: () => void
  children: ReactNode
}

export function RailSlot({ title, orientation, collapsed, onToggle, children }: RailSlotProps) {
  if (collapsed) {
    return (
      <button
        type="button"
        className={`bb-rail-handle bb-rail-handle--${orientation}`}
        onClick={onToggle}
        aria-label={`Expand ${title}`}
        title={`Expand ${title}`}
      >
        <span className="bb-rail-handle-glyph" aria-hidden="true">
          {orientation === 'col' ? '‹' : '▴'}
        </span>
        <span className="bb-rail-handle-label">{title}</span>
      </button>
    )
  }

  return (
    <div className={`bb-rail-slot bb-rail-slot--${orientation}`}>
      <button
        type="button"
        className="bb-rail-collapse-btn"
        onClick={onToggle}
        aria-label={`Collapse ${title}`}
        title={`Collapse ${title}`}
      >
        {orientation === 'col' ? '›' : '▾'}
      </button>
      <div className="bb-rail-slot-body">{children}</div>
    </div>
  )
}
