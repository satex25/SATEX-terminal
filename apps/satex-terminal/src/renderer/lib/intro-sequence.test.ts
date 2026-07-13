/**
 * intro-sequence.ts — unit tests for the standby-gate → boot-ceremony intro.
 *
 * Covers the transition table (standby holds → key arms → 0.5s → 8.2s
 * ceremony → done), the no-skip rule for arming/boot, key filtering (bare
 * modifiers and chords fall through so the kill chord is never raced), the
 * breathing-prompt cadence curve, and the UTC/session formatters with
 * degenerate-input guards.
 */
import { describe, expect, it } from 'vitest'
import {
  BREATH_INITIAL_DELAY_MS,
  BREATH_SETTLE_MS,
  BREATH_STEADY_CYCLE_MS,
  INITIAL_INTRO_STATE,
  INTRO_ARM_MS,
  INTRO_BOOT_MS,
  INTRO_BOOT_REDUCED_MS,
  advanceOnKey,
  advanceOnTimer,
  breathCycleMs,
  fmtUtcClock,
  fmtUtcDate,
  introAcceptsKey,
  introTimerMs,
  sessionLabel,
  type IntroState,
} from './intro-sequence'

const s = (phase: IntroState['phase']): IntroState => ({ phase })

describe('intro-sequence · transition table', () => {
  it('starts on the standby gate', () => {
    expect(INITIAL_INTRO_STATE).toEqual(s('standby'))
  })

  it('standby holds indefinitely — not timer-driven', () => {
    expect(introTimerMs(s('standby'))).toBeNull()
    expect(advanceOnTimer(s('standby'))).toBeNull()
  })

  it('a key arms the gate; keys do nothing during arming/boot (no skip)', () => {
    expect(advanceOnKey(s('standby'))).toEqual(s('arming'))
    expect(advanceOnKey(s('arming'))).toBeNull()
    expect(advanceOnKey(s('boot'))).toBeNull()
  })

  it('arming runs 0.5s then boots; the ceremony runs 8.2s then finishes', () => {
    expect(introTimerMs(s('arming'))).toBe(500)
    expect(advanceOnTimer(s('arming'))).toEqual(s('boot'))
    expect(introTimerMs(s('boot'))).toBe(8200)
    expect(advanceOnTimer(s('boot'))).toBe('done')
  })

  it('reduced motion shortens only the ceremony', () => {
    expect(introTimerMs(s('boot'), true)).toBe(INTRO_BOOT_REDUCED_MS)
    expect(introTimerMs(s('arming'), true)).toBe(INTRO_ARM_MS)
    expect(introTimerMs(s('standby'), true)).toBeNull()
  })

  it('constants stay in lockstep with the design (ARM 500 / BOOT 8200)', () => {
    expect(INTRO_ARM_MS).toBe(500)
    expect(INTRO_BOOT_MS).toBe(8200)
  })

  it('walks the whole flow: exactly one keypress, 8.7s of timers', () => {
    let st: IntroState | 'done' | null = INITIAL_INTRO_STATE
    let keys = 0
    let timered = 0
    const seen: string[] = []
    for (let hops = 0; hops < 8 && st !== 'done'; hops++) {
      const cur = st as IntroState
      seen.push(cur.phase)
      const ms = introTimerMs(cur)
      if (ms === null) {
        st = advanceOnKey(cur)
        keys++
      } else {
        timered += ms
        st = advanceOnTimer(cur)
      }
    }
    expect(st).toBe('done')
    expect(keys).toBe(1)
    expect(timered).toBe(500 + 8200)
    expect(seen).toEqual(['standby', 'arming', 'boot'])
  })
})

describe('intro-sequence · key filtering (kill-chord safety)', () => {
  const ev = (key: string, mods: Partial<Pick<KeyboardEvent, 'metaKey' | 'ctrlKey' | 'altKey'>> = {}) => ({
    key,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    ...mods,
  })

  it('accepts plain keys', () => {
    expect(introAcceptsKey(ev('a'))).toBe(true)
    expect(introAcceptsKey(ev('Enter'))).toBe(true)
    expect(introAcceptsKey(ev(' '))).toBe(true)
    expect(introAcceptsKey(ev('Escape'))).toBe(true)
    expect(introAcceptsKey(ev('5'))).toBe(true)
  })

  it('rejects bare modifiers', () => {
    for (const k of ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'NumLock', 'AltGraph']) {
      expect(introAcceptsKey(ev(k))).toBe(false)
    }
  })

  it('rejects chorded presses — ⌘⇧K (kill arm), ⌘K (palette), ⌘1 (workspace) fall through', () => {
    expect(introAcceptsKey(ev('k', { metaKey: true }))).toBe(false)
    expect(introAcceptsKey(ev('k', { ctrlKey: true }))).toBe(false)
    expect(introAcceptsKey(ev('K', { ctrlKey: true }))).toBe(false)
    expect(introAcceptsKey(ev('1', { metaKey: true }))).toBe(false)
    expect(introAcceptsKey(ev('a', { altKey: true }))).toBe(false)
  })
})

describe('intro-sequence · breathing cadence', () => {
  it('holds a steady 2.6s cycle for the first ~6s on the gate', () => {
    expect(breathCycleMs(0, 0.5)).toBe(BREATH_STEADY_CYCLE_MS)
    expect(breathCycleMs(2600, 0)).toBe(2600)
    expect(breathCycleMs(BREATH_SETTLE_MS, 1)).toBe(2600)
  })

  it('drifts to a 3.2–5.4s randomized cycle after settling', () => {
    expect(breathCycleMs(6001, 0)).toBe(3200)
    expect(breathCycleMs(6001, 1)).toBe(5400)
    expect(breathCycleMs(60_000, 0.5)).toBe(4300)
  })

  it('clamps degenerate rand inputs instead of exploding (P-040 class)', () => {
    expect(breathCycleMs(10_000, -5)).toBe(3200)
    expect(breathCycleMs(10_000, 99)).toBe(5400)
  })

  it('initial delay matches the design (prompt dark until the copy fades in)', () => {
    expect(BREATH_INITIAL_DELAY_MS).toBe(1500)
  })
})

describe('intro-sequence · formatters', () => {
  it('fmtUtcClock / fmtUtcDate render zero-padded UTC', () => {
    const d = new Date(Date.UTC(2026, 6, 13, 6, 8, 41)) // matches the operator recording
    expect(fmtUtcClock(d)).toBe('06:08:41')
    expect(fmtUtcDate(d)).toBe('2026-07-13')
    const nye = new Date(Date.UTC(2025, 11, 31, 23, 59, 59))
    expect(fmtUtcClock(nye)).toBe('23:59:59')
    expect(fmtUtcDate(nye)).toBe('2025-12-31')
  })

  it('sessionLabel buckets the UTC hour into the live cash session', () => {
    expect(sessionLabel(0)).toBe('TOKYO')
    expect(sessionLabel(6)).toBe('TOKYO')
    expect(sessionLabel(7)).toBe('LONDON')
    expect(sessionLabel(12)).toBe('LONDON')
    expect(sessionLabel(13)).toBe('NEW YORK')
    expect(sessionLabel(21)).toBe('NEW YORK')
    expect(sessionLabel(22)).toBe('TOKYO')
    expect(sessionLabel(24)).toBe('TOKYO')
    expect(sessionLabel(-1)).toBe('TOKYO')
    expect(sessionLabel(13.9)).toBe('NEW YORK')
  })
})
