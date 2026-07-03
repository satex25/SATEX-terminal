/**
 * SATEX — Panel Head (Phase 10 · Black Box)
 *
 * Uniform header for every Black Box panel. Eyebrow-style spaced caps title
 * on the left, muted meta on the right (often a status badge or context tag).
 */
import type { ReactNode } from 'react'

interface Props {
  title: string
  right?: ReactNode
  /** Renders a pulsing green dot before the title — use when the panel has a live data feed. */
  live?: boolean
}

export function PanelHead({ title, right, live }: Props) {
  return (
    <div className="bb-panel-head">
      {live && <span className="bb-panel-live-dot" />}
      <span className="bb-panel-title">{title}</span>
      <span className="bb-panel-meta">{right}</span>
    </div>
  )
}
