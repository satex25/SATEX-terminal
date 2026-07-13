/**
 * SATEX boot intro · Frame 1b — MASTHEAD (film title).
 *
 * Meridian shaft rises, the wordmark tracks out of a blur, subtitle and
 * credits rise in, then the frame holds on PRESS ANY KEY. Exit is a 0.9s
 * dissolve to black. All motion is CSS keyframes (CSP `script-src 'self'`
 * safe); the orchestrator owns the clock and phase.
 *
 * Design source: `Intro Rework.dc.html` §1b.
 */
import type { IntroPhase } from '../../lib/intro-sequence'

const LETTERS = ['S', 'A', 'T', 'E', 'X'] as const

interface MastheadFrameProps {
  phase: IntroPhase
  scanlines: boolean
  utc: string
  session: string
  version: string
}

export function MastheadFrame({ phase, scanlines, utc, session, version }: MastheadFrameProps) {
  return (
    <div className="sxi-frame sxi-mh" role="presentation">
      <span className="sxi-mh-dot" />
      <span className="sxi-mh-shaft" />

      <div className="sxi-mh-center">
        <div className="sxi-mh-word">{LETTERS.join('')}</div>
        <div className="sxi-mh-sub">SMART AUTONOMOUS TRADING EXPERIENCE</div>
        <span className="sxi-mh-rule" />
      </div>

      <div className="sxi-mh-credits">
        <div className="sxi-mh-credit-1">V {version} — CHANNEL BLACK BOX — 取引端末</div>
        <div className="sxi-mh-credit-2">SESSION {session} · FEED ALPACA · {utc} UTC</div>
      </div>

      {scanlines && <span className="sxi-scanlines sxi-scanlines--mh" />}

      {phase !== 'boot' && (
        <div className="sxi-enter">
          <div className="sxi-enter-prompt sxi-mh-prompt">PRESS ANY KEY</div>
          <div className="sxi-enter-legal sxi-mh-legal">
            <div>Simulated and live trading involve risk of loss. Past performance is not indicative of future results.</div>
            <div>© 2026 SATEX · 取引端末 · INTERNAL BUILD — NOT INVESTMENT ADVICE</div>
          </div>
        </div>
      )}

      {phase === 'exit' && <span className="sxi-mh-exit" />}
    </div>
  )
}
