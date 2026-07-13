/**
 * SATEX — Cold-boot intro: STANDBY GATE → BOOT CEREMONY.
 *
 *   standby — framed gate plate, breathing PRESS ANY KEY (holds forever)
 *   arming  — 0.5s fade to black on keypress/click
 *   boot    — 8.2s ceremonial reveal with integrated dissolve
 *   done    — overlay unmounts; the already-warm terminal is revealed
 *
 * Pure renderer overlay — the terminal renders and warms up underneath the
 * whole time; completion is just `onComplete()` up to App. No IPC, no
 * main-process coupling. Transition logic lives headless in
 * lib/intro-sequence.ts; the design stage is a fixed 1920×1080 plate scaled
 * to fit the window (design behavior, works at any size).
 *
 * Constraints honored:
 *   - CSP `script-src 'self'` — motion is CSS keyframes; the breathing
 *     prompt is a JS-driven opacity/transition pair (style attr only).
 *   - Kill chord stays reachable (P-044 lineage): the keydown listener
 *     ignores bare modifiers and chords, and never calls preventDefault /
 *     stopPropagation — App's global shortcuts receive every event.
 *   - `prefers-reduced-motion` → the gate renders at end-state (CSS) and
 *     the ceremony collapses to a 0.9s fade (INTRO_BOOT_REDUCED_MS).
 *   - Every timer/interval/listener cleans up in its own effect scope
 *     (PR #6 / P-041/P-043/P-046 leak class).
 *   - Fires `onComplete` exactly once.
 *
 * Design source of truth: `SATEX Intro.dc.html` + the operator's
 * 2026-07-13 recording (frame-verified).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { StandbyGateFrame } from './StandbyGateFrame'
import { BootCeremonyFrame } from './BootCeremonyFrame'
import {
  BREATH_INITIAL_DELAY_MS,
  INITIAL_INTRO_STATE,
  advanceOnKey,
  advanceOnTimer,
  breathCycleMs,
  fmtUtcClock,
  fmtUtcDate,
  introAcceptsKey,
  introTimerMs,
  sessionLabel,
  type IntroState,
} from '../../lib/intro-sequence'

/** Live clock cadence (design ticks utc/date every 500ms). */
const CLOCK_TICK_MS = 500
const STAGE_W = 1920
const STAGE_H = 1080

interface BootIntroSequenceProps {
  onComplete: () => void
  /** Opens Settings from the gate's OPTIONS button (button hidden if absent). */
  onOptions?: () => void
  /**
   * True while an App overlay (Settings via OPTIONS, palette, tweaks) is
   * open above the gate — suspends PRESS-ANY-KEY so typing into that
   * overlay can never arm the boot.
   */
  holdKeys?: boolean
  /** Version stamp on the ceremony credits. Source: package.json `version`. */
  version?: string
}

export function BootIntroSequence({ onComplete, onOptions, holdKeys = false, version = '0.5.0' }: BootIntroSequenceProps) {
  const [state, setState] = useState<IntroState>(INITIAL_INTRO_STATE)
  const [utc, setUtc] = useState(() => fmtUtcClock(new Date()))
  const [dateStr, setDateStr] = useState(() => fmtUtcDate(new Date()))
  const [session, setSession] = useState(() => sessionLabel(new Date().getUTCHours()))
  const [scale, setScale] = useState(() =>
    Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H)
  )
  const [breath, setBreath] = useState({ opacity: 0, fadeMs: 1300 })

  const doneRef = useRef(false)
  const reduceRef = useRef<boolean>(
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  )

  // App passes `onComplete` as an inline arrow, so its identity changes on
  // every App re-render. Route it through a ref so `apply` stays stable —
  // otherwise the phase-timer effect below would tear down and RESTART the
  // 8.2s ceremony timer on every App render (in Electron the engine
  // re-renders App constantly, so the intro would never finish).
  const onCompleteRef = useRef(onComplete)
  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  const apply = useCallback((next: IntroState | 'done' | null): void => {
    if (next === null) return
    if (next === 'done') {
      if (doneRef.current) return
      doneRef.current = true
      onCompleteRef.current()
      return
    }
    setState(next)
  }, [])

  // Phase timers: arming 0.5s → boot; boot 8.2s → done. Standby holds.
  useEffect(() => {
    const ms = introTimerMs(state, reduceRef.current)
    if (ms === null) return
    const t = window.setTimeout(() => apply(advanceOnTimer(state)), ms)
    return () => window.clearTimeout(t)
  }, [state, apply])

  // Live UTC clock / date / session line.
  useEffect(() => {
    const tick = (): void => {
      const now = new Date()
      setUtc(fmtUtcClock(now))
      setDateStr(fmtUtcDate(now))
      setSession(sessionLabel(now.getUTCHours()))
    }
    tick()
    const id = window.setInterval(tick, CLOCK_TICK_MS)
    return () => window.clearInterval(id)
  }, [])

  // Scale the fixed 1920×1080 design stage to fit the window.
  useEffect(() => {
    const onResize = (): void =>
      setScale(Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // PRESS ANY KEY — arms the gate. Plain keys only; chords and bare
  // modifiers fall through untouched (kill chord ⌘⇧K included), and we
  // never preventDefault/stopPropagation.
  useEffect(() => {
    if (state.phase !== 'standby' || holdKeys) return
    const onKey = (e: KeyboardEvent): void => {
      if (!introAcceptsKey(e)) return
      apply(advanceOnKey(state))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state, apply, holdKeys])

  // Breathing prompt: dark for 1.5s, steady 2.6s cycles for ~6s, then an
  // unhurried randomized 3.2–5.4s drift (design: "unhurried, alive").
  useEffect(() => {
    if (state.phase !== 'standby') return
    const start = Date.now()
    let high = false
    let t: number | undefined
    const step = (): void => {
      const half = breathCycleMs(Date.now() - start, Math.random()) / 2
      high = !high
      setBreath({ opacity: high ? 1 : 0.35, fadeMs: half })
      t = window.setTimeout(step, half)
    }
    t = window.setTimeout(step, BREATH_INITIAL_DELAY_MS)
    return () => window.clearTimeout(t)
  }, [state.phase])

  return (
    <div className="sxg" role="presentation">
      <div
        className="sxg-stage"
        style={{ transform: `translate(-50%, -50%) scale(${scale})` }}
      >
        {state.phase !== 'boot' && (
          <StandbyGateFrame
            arming={state.phase === 'arming'}
            utc={utc}
            dateStr={dateStr}
            session={session}
            breathOpacity={breath.opacity}
            breathFadeMs={breath.fadeMs}
            onArm={() => apply(advanceOnKey(state))}
            onOptions={onOptions}
          />
        )}
        {state.phase === 'boot' && (
          <BootCeremonyFrame utc={utc} session={session} version={version} />
        )}
      </div>
    </div>
  )
}
