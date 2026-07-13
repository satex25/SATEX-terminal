/**
 * SATEX — Cold-boot intro rework: 4-frame branded boot sequence.
 *
 *   1a SplashIntro (existing component, ~3.2s, skippable)
 *   1b Masthead    (7.0s film title  → hold on PRESS ANY KEY → dissolve)
 *   1c Tape Head   (7.0s VHS plate   → hold → CRT collapse)
 *   1d System Plate(7.0s Swiss plate → hold → hairline wipe)
 *
 * Pure renderer overlay — the terminal renders and warms up underneath the
 * whole time (same mount strategy as the old single-frame splash), so
 * completion is just `onComplete()` up to App; no IPC, no main-process
 * coupling. All transition logic lives headless in lib/intro-sequence.ts.
 *
 * Constraints honored:
 *   - CSP `script-src 'self'` — all motion is CSS keyframes.
 *   - Kill chord stays reachable (P-044 lineage): the keydown listener
 *     ignores bare modifiers and chorded presses, and never calls
 *     preventDefault/stopPropagation, so App's global shortcuts (⌘⇧K arm,
 *     ⌘K palette, …) receive every event untouched.
 *   - `prefers-reduced-motion` → only frame 1a's fast fade plays; 1b–1d
 *     are skipped entirely (no 21s of mandatory plates for reduced-motion
 *     users).
 *   - Every timer/interval/listener is cleaned in its own effect scope
 *     (the repo's recidivist leak class — PR #6, P-041/P-043/P-046).
 *   - Fires `onComplete` exactly once.
 *
 * Design source of truth: `Intro Rework.dc.html` (repo root).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { SplashIntro } from '../SplashIntro'
import { MastheadFrame } from './MastheadFrame'
import { TapeHeadFrame } from './TapeHeadFrame'
import { SystemPlateFrame } from './SystemPlateFrame'
import {
  INITIAL_INTRO_STATE,
  INTRO_BOOT_MS,
  advanceOnKey,
  advanceOnTimer,
  fmtProgressPct,
  fmtTimecode,
  fmtUtcClock,
  fmtUtcDate,
  introAcceptsKey,
  introTimerMs,
  sessionLabel,
  type IntroState,
} from '../../lib/intro-sequence'

/** Text-update cadence for the live UTC clock / timecode / percent readouts. */
const TICK_MS = 200

interface BootIntroSequenceProps {
  onComplete: () => void
  /** Scanline texture on frames 1b–1d. Defaults on (future Settings toggle). */
  scanlines?: boolean
  /** Version stamp on the plates. Source of truth: package.json `version`. */
  version?: string
}

export function BootIntroSequence({
  onComplete,
  scanlines = true,
  version = '0.5.0',
}: BootIntroSequenceProps) {
  const [state, setState] = useState<IntroState>(INITIAL_INTRO_STATE)
  const [utc, setUtc] = useState(() => fmtUtcClock(new Date()))
  const [date, setDate] = useState(() => fmtUtcDate(new Date()))
  const [session, setSession] = useState(() => sessionLabel(new Date().getUTCHours()))
  const [tc, setTc] = useState('00:00:00:00')
  const [pct, setPct] = useState('0%')

  const doneRef = useRef(false)
  const frameStartRef = useRef(Date.now())
  const reduceRef = useRef<boolean>(
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  )

  const apply = useCallback(
    (next: IntroState | 'done' | null): void => {
      if (next === null) return
      if (next === 'done') {
        if (doneRef.current) return
        doneRef.current = true
        onComplete()
        return
      }
      setState(next)
    },
    [onComplete]
  )

  // Frame stopwatch — restarts whenever a new frame mounts. Drives the 1c
  // timecode and 1d percent readouts.
  useEffect(() => {
    frameStartRef.current = Date.now()
  }, [state.frame])

  // Timer-driven transitions: boot → enter, exit → next frame. `enter`
  // returns null (holds indefinitely for a key); the splash frame is driven
  // by SplashIntro's own onComplete instead.
  useEffect(() => {
    const ms = introTimerMs(state)
    if (ms === null) return
    const t = window.setTimeout(() => apply(advanceOnTimer(state)), ms)
    return () => window.clearTimeout(t)
  }, [state, apply])

  // Live text readouts (200ms cadence, mockup parity). tc/pct only advance
  // during their frame's boot phase — the timecode freezes on READY.
  useEffect(() => {
    if (state.frame === 'splash') return
    const tick = (): void => {
      const now = new Date()
      setUtc(fmtUtcClock(now))
      setDate(fmtUtcDate(now))
      setSession(sessionLabel(now.getUTCHours()))
      if (state.phase === 'boot') {
        const elapsed = Date.now() - frameStartRef.current
        if (state.frame === 'tape') setTc(fmtTimecode(elapsed))
        if (state.frame === 'plate') setPct(fmtProgressPct(elapsed))
      }
    }
    tick()
    const id = window.setInterval(tick, TICK_MS)
    return () => window.clearInterval(id)
  }, [state])

  // Snap readouts to their terminal values when a boot completes, so the
  // hold screen never shows a 99% / one-tick-short timecode.
  useEffect(() => {
    if (state.phase === 'boot') return
    if (state.frame === 'tape') setTc(fmtTimecode(INTRO_BOOT_MS.tape))
    if (state.frame === 'plate') setPct('100%')
  }, [state])

  // PRESS ANY KEY — plain keys only, and only on the enter hold ("no skip"
  // during boot is the operator's design call). Deliberately no
  // preventDefault/stopPropagation: App's global handlers (kill chord ⌘⇧K
  // included) must keep receiving every event.
  useEffect(() => {
    if (state.frame === 'splash') return // SplashIntro owns its own skip key
    const onKey = (e: KeyboardEvent): void => {
      if (!introAcceptsKey(e)) return
      apply(advanceOnKey(state))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state, apply])

  const onSplashComplete = useCallback((): void => {
    // Reduced motion: SplashIntro already played its fast, glitch-free fade
    // (its own contract) — skip the three 7s plates and hand over now.
    if (reduceRef.current) {
      apply('done')
      return
    }
    apply(advanceOnTimer(INITIAL_INTRO_STATE))
  }, [apply])

  return (
    <div className="sxi" role="presentation" aria-hidden="true">
      {state.frame === 'splash' && <SplashIntro onComplete={onSplashComplete} />}
      {state.frame === 'masthead' && (
        <MastheadFrame phase={state.phase} scanlines={scanlines} utc={utc} session={session} version={version} />
      )}
      {state.frame === 'tape' && (
        <TapeHeadFrame phase={state.phase} scanlines={scanlines} tc={tc} date={date} session={session} version={version} />
      )}
      {state.frame === 'plate' && (
        <SystemPlateFrame phase={state.phase} scanlines={scanlines} utc={utc} pct={pct} session={session} version={version} />
      )}
    </div>
  )
}
