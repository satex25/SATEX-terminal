/**
 * SATEX — Cold-boot intro sequence state machine (headless).
 *
 * Pure logic for the 4-frame branded boot intro:
 *
 *   splash (1a — the existing SplashIntro, self-timed ~3.2s, skippable)
 *   → masthead (1b — 7.0s film-title boot → hold on PRESS ANY KEY → 0.9s dissolve)
 *   → tape     (1c — 7.0s VHS boot → hold → 0.7s CRT collapse)
 *   → plate    (1d — 7.0s Swiss-plate boot → hold → 0.8s hairline wipe)
 *   → done (the terminal has been rendering underneath the whole time —
 *           the overlay simply unmounts).
 *
 * Design source of truth: `Intro Rework.dc.html` (repo root). Frames 1b–1d
 * play their full 7.0s boot with no skip, then hold on the enter screen
 * until a plain keypress. There is deliberately no auto-replay: the
 * mockup's `autoReplay` prop is demo-canvas scaffolding ("run the full
 * 7.0s boot — no skip — then hold on the enter screen"), not product
 * behavior.
 *
 * Kept headless (no DOM, no React) so the transition table and formatters
 * are unit-testable under the node vitest environment — the same pattern
 * as `lib/rail-layout.ts`.
 */

type IntroFrame = 'splash' | 'masthead' | 'tape' | 'plate'
export type IntroPhase = 'boot' | 'enter' | 'exit'

export interface IntroState {
  frame: IntroFrame
  phase: IntroPhase
}

/** Frame order of the boot sequence. */
export const INTRO_FRAMES: readonly IntroFrame[] = ['splash', 'masthead', 'tape', 'plate'] as const

/**
 * Boot-phase duration per frame (ms). `splash` is informational only —
 * SplashIntro manages its own clock (3.2s full / 0.9s reduced-motion) and
 * reports completion via callback.
 */
export const INTRO_BOOT_MS: Readonly<Record<IntroFrame, number>> = {
  splash: 3200,
  masthead: 7000,
  tape: 7000,
  plate: 7000,
}

/** Exit-animation duration per frame (ms). `splash` exits inside SplashIntro. */
export const INTRO_EXIT_MS: Readonly<Record<IntroFrame, number>> = {
  splash: 0,
  masthead: 900, // dissolve to black
  tape: 700,     // CRT collapse (bars 0.34s, slit 0.7s)
  plate: 800,    // hairline wipe
}

export const INITIAL_INTRO_STATE: IntroState = { frame: 'splash', phase: 'boot' }

function nextFrame(frame: IntroFrame): IntroFrame | null {
  const i = INTRO_FRAMES.indexOf(frame)
  return i >= 0 && i + 1 < INTRO_FRAMES.length ? INTRO_FRAMES[i + 1]! : null
}

/**
 * How long the orchestrator should wait in `state` before calling
 * `advanceOnTimer`, or null when the state is not timer-driven:
 *   - splash boot/exit: SplashIntro's own `onComplete` drives the advance
 *   - enter: holds indefinitely for a keypress
 */
export function introTimerMs(state: IntroState): number | null {
  if (state.frame === 'splash') return null
  if (state.phase === 'boot') return INTRO_BOOT_MS[state.frame]
  if (state.phase === 'exit') return INTRO_EXIT_MS[state.frame]
  return null // 'enter' holds for a key
}

/**
 * Timer elapsed (or, for the splash frame, SplashIntro completed): advance.
 * Returns the next state, `'done'` when the sequence has finished, or null
 * when the state is not timer-driven (defensive no-op).
 */
export function advanceOnTimer(state: IntroState): IntroState | 'done' | null {
  if (state.phase === 'boot') {
    if (state.frame === 'splash') {
      const nf = nextFrame('splash')
      return nf ? { frame: nf, phase: 'boot' } : 'done'
    }
    return { frame: state.frame, phase: 'enter' }
  }
  if (state.phase === 'exit') {
    const nf = nextFrame(state.frame)
    return nf ? { frame: nf, phase: 'boot' } : 'done'
  }
  return null
}

/**
 * Keypress: only meaningful on the enter hold. The boot phase always plays
 * fully — "no skip" for 1b–1d is the operator's design call. The splash
 * frame handles its own skip internally, so it never routes through here.
 */
export function advanceOnKey(state: IntroState): IntroState | null {
  if (state.frame === 'splash') return null
  if (state.phase === 'enter') return { frame: state.frame, phase: 'exit' }
  return null
}

/**
 * "PRESS ANY KEY" accepts any *plain* key. Bare modifiers and chorded
 * presses (⌘K palette, ⌘⇧K kill-switch arm, …) must fall through to the
 * app's global shortcut handlers untouched — the intro overlay never
 * swallows or races the kill chord (P-044 lineage: the chord stays
 * reachable from every UI state, the intro included).
 */
const MODIFIER_KEYS = new Set([
  'shift', 'control', 'alt', 'meta', 'os', 'altgraph', 'capslock',
  'numlock', 'scrolllock', 'fn', 'fnlock', 'hyper', 'super',
  'symbol', 'symbollock',
])

export function introAcceptsKey(
  ev: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey'>
): boolean {
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return false
  return !MODIFIER_KEYS.has(ev.key.toLowerCase())
}

/** 25fps VHS timecode for frame 1c: `00:MM:SS:FF`, clamped to the boot window. */
export function fmtTimecode(elapsedMs: number, clampMs: number = INTRO_BOOT_MS.tape): string {
  const ms = Math.max(0, Math.min(elapsedMs, clampMs))
  const p = (n: number): string => String(n).padStart(2, '0')
  const s = Math.floor(ms / 1000)
  const f = Math.floor((ms % 1000) / 40) // 25 fps → 40ms per tape frame
  return `00:${p(Math.floor(s / 60))}:${p(s % 60)}:${p(f)}`
}

/** Mount progress for frame 1d: `0%` … `100%`, clamped both ways. */
export function fmtProgressPct(elapsedMs: number, totalMs: number = INTRO_BOOT_MS.plate): string {
  if (totalMs <= 0) return '100%' // degenerate-input guard (P-040 class)
  const pct = Math.min(100, Math.max(0, Math.round((elapsedMs / totalMs) * 100)))
  return `${pct}%`
}

/** `HH:MM:SS` UTC wall clock for the masthead/plate metadata lines. */
export function fmtUtcClock(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`
}

/** `YYYY-MM-DD` UTC date for the tape footer. */
export function fmtUtcDate(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`
}

/**
 * Session label derived from the UTC hour — honest about which major cash
 * session the clock actually sits in rather than hardcoding the mockup's
 * "LONDON" (Directive 0.1: never present invented state as real).
 *
 *   22:00–07:00 UTC → TOKYO · 07:00–13:00 → LONDON · 13:00–22:00 → NEW YORK
 */
export function sessionLabel(utcHour: number): 'TOKYO' | 'LONDON' | 'NEW YORK' {
  const h = ((Math.floor(utcHour) % 24) + 24) % 24
  if (h >= 22 || h < 7) return 'TOKYO'
  if (h < 13) return 'LONDON'
  return 'NEW YORK'
}
