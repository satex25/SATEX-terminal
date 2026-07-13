/**
 * SATEX boot intro · Frame 1c — TAPE HEAD (VHS institutional).
 *
 * Head-switch noise band, live 25fps timecode, scan-line letter resolve,
 * typewriter tape label, one head wobble — then holds on PRESS ANY KEY.
 * Exit is a CRT collapse (top/bottom bars + white slit). All motion is CSS;
 * the orchestrator feeds the timecode text on a 200ms tick and owns phase.
 *
 * Design source: `Intro Rework.dc.html` §1c. The letter/scan animations
 * deliberately reuse the `satex-splash-*` keyframes from SplashIntro so the
 * two plates stay visually related.
 */
import type { IntroPhase } from '../../lib/intro-sequence'

const LETTERS = ['S', 'A', 'T', 'E', 'X'] as const

interface TapeHeadFrameProps {
  phase: IntroPhase
  scanlines: boolean
  tc: string
  date: string
  session: string
  version: string
}

export function TapeHeadFrame({ phase, scanlines, tc, date, session, version }: TapeHeadFrameProps) {
  return (
    <div className="sxi-frame sxi-tp" role="presentation">
      <span className="sxi-tp-noise" />
      <span className="sxi-tp-band" />

      <div className="sxi-tp-tc">TC {tc}</div>
      <div className="sxi-tp-status">
        {phase === 'boot'
          ? <span><span className="sxi-tp-dot">●</span> LOADING TAPE</span>
          : <span className="sxi-tp-ready">● READY</span>}
      </div>
      <div className="sxi-tp-meta sxi-tp-meta--l">SESSION {session} · {date}</div>
      <div className="sxi-tp-meta sxi-tp-meta--r">SATEX v{version} · 取引端末</div>

      <div className="sxi-tp-center">
        <span className="sxi-tp-scan" />
        <div className="sxi-tp-word">
          {LETTERS.map((ch, i) => (
            <span
              key={ch}
              className="sxi-tp-ch"
              style={{ animationDelay: `${1.5 + i * 0.14}s` }}
            >
              {ch}
            </span>
          ))}
        </div>
        <div className="sxi-tp-typeline">
          <div className="sxi-tp-type">SESSION TAPE · {session} · CH 01</div>
        </div>
      </div>

      {scanlines && <span className="sxi-scanlines sxi-scanlines--tp" />}

      {phase !== 'boot' && (
        <div className="sxi-enter">
          <div className="sxi-enter-prompt sxi-tp-prompt">PRESS ANY KEY</div>
          <div className="sxi-enter-legal sxi-tp-legal">
            Simulated and live trading involve risk of loss · Past performance is not indicative of future results · © 2026 SATEX
          </div>
        </div>
      )}

      {phase === 'exit' && (
        <div className="sxi-tp-crt">
          <span className="sxi-tp-crt-bar sxi-tp-crt-bar--top" />
          <span className="sxi-tp-crt-bar sxi-tp-crt-bar--bottom" />
          <span className="sxi-tp-crt-slit" />
        </div>
      )}
    </div>
  )
}
