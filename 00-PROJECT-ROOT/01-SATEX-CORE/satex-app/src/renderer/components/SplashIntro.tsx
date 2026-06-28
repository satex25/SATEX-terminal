/**
 * SATEX — Cold-boot intro (film-style name reveal, no logo).
 *
 * A fullscreen plate shown once per launch: the "SATEX" wordmark resolves
 * letter-by-letter out of a scanline sweep, draws an accent rule, then the
 * whole plate dissolves to reveal the terminal. ~3.2s (within the 2–5s brief).
 *
 * Constraints honored:
 *   - CSP `script-src 'self'` — pure CSS animation, no inline/injected script.
 *   - Auto-themes off the `--bb-*` / `--font-mono` design tokens (all 4 themes).
 *   - `prefers-reduced-motion` → fast, glitch-free fade.
 *   - Click or any key skips early.
 *   - Self-cleans its timers; fires `onComplete` exactly once.
 */
import { useEffect, useRef, useState } from 'react'

const LETTERS = ['S', 'A', 'T', 'E', 'X'] as const
const FULL_MS = 3200
const REDUCED_MS = 900
const LEAVE_LEAD_MS = 600

export function SplashIntro({ onComplete }: { onComplete: () => void }) {
  const [leaving, setLeaving] = useState(false)
  const doneRef = useRef(false)

  useEffect(() => {
    const reduce =
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    const total = reduce ? REDUCED_MS : FULL_MS

    const finish = (): void => {
      if (doneRef.current) return
      doneRef.current = true
      onComplete()
    }
    const leave = (): void => setLeaving(true)

    const tLeave = window.setTimeout(leave, Math.max(0, total - LEAVE_LEAD_MS))
    const tDone = window.setTimeout(finish, total)

    // Skip on any key — start the leave dissolve, then finish.
    const onKey = (): void => {
      window.clearTimeout(tLeave)
      window.clearTimeout(tDone)
      leave()
      window.setTimeout(finish, 280)
    }
    window.addEventListener('keydown', onKey, { once: true })

    return () => {
      window.clearTimeout(tLeave)
      window.clearTimeout(tDone)
      window.removeEventListener('keydown', onKey)
    }
  }, [onComplete])

  const skip = (): void => {
    setLeaving(true)
    window.setTimeout(() => {
      if (doneRef.current) return
      doneRef.current = true
      onComplete()
    }, 280)
  }

  return (
    <div
      className={`satex-splash${leaving ? ' satex-splash--leaving' : ''}`}
      role="presentation"
      aria-hidden="true"
      onClick={skip}
    >
      <span className="satex-splash__scan" />
      <div className="satex-splash__word">
        {LETTERS.map((ch, i) => (
          <span
            key={ch}
            className="satex-splash__ch"
            style={{ animationDelay: `${0.25 + i * 0.12}s` }}
          >
            {ch}
          </span>
        ))}
        <span className="satex-splash__rule" />
      </div>
    </div>
  )
}
