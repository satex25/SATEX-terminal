/**
 * SATEX boot intro · Frame 1d — SYSTEM PLATE (Swiss technical).
 *
 * Registration marks, drawn rules, character-rise wordmark, right-aligned
 * metadata table and a 7s mount-progress rule — then holds on
 * PRESS ANY KEY TO OPEN SESSION. Exit is a left-to-right hairline wipe.
 * All motion is CSS; the orchestrator feeds the pct/utc text and owns phase.
 *
 * Design source: `Intro Rework.dc.html` §1d.
 */
import type { IntroPhase } from '../../lib/intro-sequence'

const LETTERS = ['S', 'A', 'T', 'E', 'X'] as const

interface SystemPlateFrameProps {
  phase: IntroPhase
  scanlines: boolean
  utc: string
  pct: string
  session: string
  version: string
}

export function SystemPlateFrame({ phase, scanlines, utc, pct, session, version }: SystemPlateFrameProps) {
  return (
    <div className="sxi-frame sxi-pl" role="presentation">
      <span className="sxi-pl-reg sxi-pl-reg--tl">+</span>
      <span className="sxi-pl-reg sxi-pl-reg--tr">+</span>
      <span className="sxi-pl-reg sxi-pl-reg--bl">+</span>
      <span className="sxi-pl-reg sxi-pl-reg--br">+</span>

      <div className="sxi-pl-header">SATEX SYSTEMS — TERMINAL BOOT PLATE</div>

      <span className="sxi-pl-rule-x" />
      <span className="sxi-pl-rule-y" />

      <div className="sxi-pl-word">
        {LETTERS.map((ch, i) => (
          <span key={ch} className="sxi-pl-mask">
            <span className="sxi-pl-ch" style={{ animationDelay: `${2.0 + i * 0.13}s` }}>
              {ch}
            </span>
          </span>
        ))}
      </div>
      <div className="sxi-pl-sub">SMART AUTONOMOUS TRADING EXPERIENCE</div>

      <div className="sxi-pl-meta">
        <div className="sxi-pl-meta-row" style={{ animationDelay: '4s' }}>
          <span className="sxi-pl-meta-k">VERSION&nbsp;&nbsp;</span>
          <span className="sxi-pl-meta-v">{version}</span>
        </div>
        <div className="sxi-pl-meta-row" style={{ animationDelay: '4.25s' }}>
          <span className="sxi-pl-meta-k">CHANNEL&nbsp;&nbsp;</span>
          <span className="sxi-pl-meta-v">BLACK BOX</span>
        </div>
        <div className="sxi-pl-meta-row" style={{ animationDelay: '4.5s' }}>
          <span className="sxi-pl-meta-k">SESSION&nbsp;&nbsp;</span>
          <span className="sxi-pl-meta-v">{session}</span>
        </div>
        <div className="sxi-pl-meta-row" style={{ animationDelay: '4.75s' }}>
          <span className="sxi-pl-meta-k">UTC&nbsp;&nbsp;</span>
          <span className="sxi-pl-meta-v sxi-pl-meta-v--num">{utc}</span>
        </div>
      </div>

      <div className="sxi-pl-progress">
        <div className="sxi-pl-progress-labels">
          <span>MOUNTING SESSION</span>
          <span className="sxi-pl-progress-pct">{pct}</span>
        </div>
        <div className="sxi-pl-progress-track">
          <span className="sxi-pl-progress-fill" />
        </div>
      </div>

      {scanlines && <span className="sxi-scanlines sxi-scanlines--pl" />}

      {phase !== 'boot' && (
        <div className="sxi-enter">
          <div className="sxi-enter-prompt sxi-pl-prompt">PRESS ANY KEY TO OPEN SESSION</div>
          <div className="sxi-enter-legal sxi-pl-legal">Trading involves risk of loss · © 2026 SATEX · 取引端末</div>
        </div>
      )}

      {phase === 'exit' && <span className="sxi-pl-wipe" />}
    </div>
  )
}
