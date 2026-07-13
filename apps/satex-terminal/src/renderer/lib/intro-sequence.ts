/**
 * SATEX — Cold-boot intro state machine (headless).
 *
 * The operator-approved boot flow (design source of truth:
 * `SATEX Intro.dc.html` / `SATEX Intro (standalone).html`, verified
 * frame-by-frame against the operator's 2026-07-13 recording):
 *
 *   standby — the STANDBY GATE: framed plate, live UTC/date, breathing
 *             "PRESS ANY KEY TO CONTINUE". Holds indefinitely.
 *   arming  — 0.5s fade to black after the keypress/click.
 *   boot    — 8.2s ceremonial reveal (letters resolve → sweep → rule →
 *             subtitle → credits) ending in an integrated dissolve (the
 *             design's gvBootOut holds 0%→90.2%, then fades/scales out).
 *   done    — the overlay unmounts; the already-warm terminal is revealed.
 *
 * One keypress total; the ceremony has no skip. Kept headless (no DOM, no
 * React) so the transition table and formatters are unit-testable under the
 * node vitest environment — the `rail-layout.ts` pattern.
 */

export type IntroPhase = 'standby' | 'arming' | 'boot'

export interface IntroState {
  phase: IntroPhase
}

/** Gate → black fade duration (design ARM_MS). */
export const INTRO_ARM_MS = 500
/** Ceremony duration incl. its integrated ~0.8s dissolve (design BOOT_MS). */
export const INTRO_BOOT_MS = 8200
/** Reduced-motion ceremony: a short fade instead of the 8.2s reveal. */
export const INTRO_BOOT_REDUCED_MS = 900

export const INITIAL_INTRO_STATE: IntroState = { phase: 'standby' }

/**
 * How long the orchestrator waits in `state` before `advanceOnTimer`, or
 * null when the state is not timer-driven (standby holds for a key/click).
 */
export function introTimerMs(state: IntroState, reducedMotion = false): number | null {
  if (state.phase === 'arming') return INTRO_ARM_MS
  if (state.phase === 'boot') return reducedMotion ? INTRO_BOOT_REDUCED_MS : INTRO_BOOT_MS
  return null
}

/** Timer elapsed: arming → boot; boot → done. Standby is not timer-driven. */
export function advanceOnTimer(state: IntroState): IntroState | 'done' | null {
  if (state.phase === 'arming') return { phase: 'boot' }
  if (state.phase === 'boot') return 'done'
  return null
}

/**
 * A plain key (or click) arms the gate. Nothing else: the arming fade and
 * the ceremony deliberately cannot be skipped or re-triggered.
 */
export function advanceOnKey(state: IntroState): IntroState | null {
  if (state.phase === 'standby') return { phase: 'arming' }
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

/* ── breathing prompt cadence (design: startBreath) ─────────────────────────
   Steady 2.6s cycles for the first ~6s, then a gently randomized, slower
   rhythm (3.2–5.4s cycles) — "unhurried, alive". The randomness is injected
   so the curve is unit-testable. */

/** Prompt stays dark until the standby copy has faded in. */
export const BREATH_INITIAL_DELAY_MS = 1500
/** After this much time on the gate, the cadence drifts slower. */
export const BREATH_SETTLE_MS = 6000
/** Steady early cadence. */
export const BREATH_STEADY_CYCLE_MS = 2600

/**
 * Full breath cycle length for a given time-on-gate. `rand` ∈ [0,1] (pass
 * Math.random() at the call-site; clamped here so degenerate inputs can't
 * produce a negative or runaway cycle — P-040 class).
 */
export function breathCycleMs(elapsedOnGateMs: number, rand: number): number {
  if (elapsedOnGateMs <= BREATH_SETTLE_MS) return BREATH_STEADY_CYCLE_MS
  const r = Math.min(1, Math.max(0, rand))
  return 3200 + r * 2200
}

/* ── formatters ───────────────────────────────────────────────────────────── */

/** `HH:MM:SS` UTC wall clock for the gate/ceremony metadata lines. */
export function fmtUtcClock(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`
}

/** `YYYY-MM-DD` UTC date for the gate's top-right corner. */
export function fmtUtcDate(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`
}

/**
 * Session label derived from the UTC hour — honest about which major cash
 * session the clock actually sits in rather than hardcoding the mockup's
 * "NEW YORK" (Directive 0.1: never present invented state as real).
 *
 *   22:00–07:00 UTC → TOKYO · 07:00–13:00 → LONDON · 13:00–22:00 → NEW YORK
 */
export function sessionLabel(utcHour: number): 'TOKYO' | 'LONDON' | 'NEW YORK' {
  const h = ((Math.floor(utcHour) % 24) + 24) % 24
  if (h >= 22 || h < 7) return 'TOKYO'
  if (h < 13) return 'LONDON'
  return 'NEW YORK'
}
