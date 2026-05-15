/**
 * SATEX — Status Pill (Phase 10 · Black Box)
 *
 * Compact dot + label + value used in the TopBar status cluster
 * (AUTO / INTEL / LAT) and elsewhere.
 */
import type { ReactNode } from 'react'

interface Props {
  dot:       string                     // CSS color or var()
  label:     string
  value:     ReactNode
  title?:    string
  onClick?:  () => void
  pulse?:    boolean
}

export function StatPill({ dot, label, value, title, onClick, pulse }: Props) {
  return (
    <span
      className={`bb-stat-pill ${onClick ? 'bb-clickable' : ''} ${pulse ? 'bb-pulse' : ''}`}
      title={title}
      role={onClick ? 'button' : undefined}
      onClick={onClick}
    >
      <span className="bb-stat-dot" style={{ background: dot }} />
      <span className="bb-stat-label">{label}</span>
      <span className="bb-stat-value">{value}</span>
    </span>
  )
}
