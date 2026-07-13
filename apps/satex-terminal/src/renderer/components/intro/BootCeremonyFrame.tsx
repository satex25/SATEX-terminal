/**
 * SATEX boot intro · Phase 2 — BOOT CEREMONY (8.2s, no skip).
 *
 * 188px letters resolve out of a blur (staggered 0.7–1.74s), a light sweep
 * crosses the wordmark at 3.1s (gradient clipped to a text overlay), the
 * rule draws at 3.5s, subtitle rises at 4.1s, credits at 5.0/5.4s — and the
 * whole frame plays the design's gvBootOut: steady until 90.2%, then an
 * integrated ~0.8s fade/scale dissolve straight into the terminal.
 *
 * Design source: `SATEX Intro.dc.html` §Phase 2. Pure CSS motion; the
 * orchestrator owns the 8.2s clock and unmounts the overlay at its end.
 */
const LETTERS = ['S', 'A', 'T', 'E', 'X'] as const
const LETTER_DELAYS_S = [0.7, 0.96, 1.22, 1.48, 1.74] as const

interface BootCeremonyFrameProps {
  utc: string
  session: string
  version: string
}

export function BootCeremonyFrame({ utc, session, version }: BootCeremonyFrameProps) {
  return (
    <div className="sxg-frame sxg-boot" role="presentation">
      <div className="sxg-boot-center">
        <div className="sxg-boot-wordwrap">
          <div className="sxg-boot-word">
            {LETTERS.map((ch, i) => (
              <span key={ch} className="sxg-boot-ch" style={{ animationDelay: `${LETTER_DELAYS_S[i] ?? 0}s` }}>
                {ch}
              </span>
            ))}
          </div>
          <div className="sxg-boot-sweep" aria-hidden="true">
            {LETTERS.map(ch => <span key={ch}>{ch}</span>)}
          </div>
        </div>
        <span className="sxg-boot-rule" />
        <div className="sxg-boot-sub">SMART AUTONOMOUS TRADING EXPERIENCE</div>
      </div>

      <div className="sxg-boot-credits">
        <div className="sxg-boot-credit-1">VERSION {version} — CHANNEL BLACK BOX — 取引端末</div>
        <div className="sxg-boot-credit-2">SESSION {session} · FEED ALPACA · {utc} UTC</div>
      </div>
    </div>
  )
}
