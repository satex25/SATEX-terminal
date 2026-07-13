/**
 * SATEX boot intro · Phase 1 — STANDBY GATE.
 *
 * Framed plate that holds until the operator presses a key (or clicks):
 * double hairline border, OPTIONS button, live UTC/date, channel/session/
 * feed corners, centered wordmark + rule + subtitle, a JS-breathing
 * "PRESS ANY KEY TO CONTINUE", and the risk line. When `arming` is true a
 * 0.5s black veil fades in over the plate (design gvArm).
 *
 * Design source: `SATEX Intro.dc.html` §Phase 1. All motion is CSS
 * keyframes (CSP `script-src 'self'` safe) except the breathing opacity,
 * which the orchestrator drives via props.
 */
import type { MouseEvent } from 'react'

interface StandbyGateFrameProps {
  arming: boolean
  utc: string
  dateStr: string
  session: string
  breathOpacity: number
  breathFadeMs: number
  onArm: () => void
  /** Renders the OPTIONS button when provided (opens Settings in-app). */
  onOptions?: () => void
}

export function StandbyGateFrame({
  arming,
  utc,
  dateStr,
  session,
  breathOpacity,
  breathFadeMs,
  onArm,
  onOptions,
}: StandbyGateFrameProps) {
  const handleOptions = (e: MouseEvent<HTMLButtonElement>): void => {
    e.stopPropagation() // the whole gate is click-to-arm; OPTIONS is not
    onOptions?.()
  }

  return (
    <div className="sxg-frame sxg-gate" role="presentation" onClick={onArm}>
      <span className="sxg-gate-border sxg-gate-border--outer" />
      <span className="sxg-gate-border sxg-gate-border--inner" />

      <span className="sxg-gate-topline" />
      <div className="sxg-gate-bottomline">
        <span className="sxg-gate-bottomline-rule" />
        <span className="sxg-gate-bottomline-label">SATEX · 取引端末</span>
        <span className="sxg-gate-bottomline-rule" />
      </div>

      {onOptions && (
        <div className="sxg-gate-options">
          <button type="button" className="sxg-options-btn" title="Options" onClick={handleOptions}>
            <span className="sxg-options-icon"><span /><span /><span /></span>
            <span className="sxg-options-text">OPTIONS</span>
          </button>
        </div>
      )}

      <div className="sxg-gate-meta sxg-gate-meta--tr">{dateStr}<br />{utc} UTC</div>
      <div className="sxg-gate-meta sxg-gate-meta--bl">CHANNEL&nbsp;&nbsp;BLACK BOX<br />SESSION&nbsp;&nbsp;{session}</div>
      <div className="sxg-gate-meta sxg-gate-meta--br">FEED&nbsp;&nbsp;ALPACA</div>

      <div className="sxg-gate-center">
        <div className="sxg-gate-word">SATEX</div>
        <span className="sxg-gate-rule" />
        <div className="sxg-gate-sub">SMART AUTONOMOUS TRADING EXPERIENCE</div>
        <div className="sxg-gate-prompt">
          <span style={{ opacity: breathOpacity, transition: `opacity ${breathFadeMs}ms ease-in-out` }}>
            PRESS ANY KEY TO CONTINUE
          </span>
        </div>
        <div className="sxg-gate-legal">
          Simulated and live trading involve risk of loss · Past performance is not indicative of future results · © 2026 SATEX
        </div>
      </div>

      {arming && <span className="sxg-gate-arm" />}
    </div>
  )
}
