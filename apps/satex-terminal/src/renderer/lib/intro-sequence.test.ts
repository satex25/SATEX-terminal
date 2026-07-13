/**
 * intro-sequence.ts — unit tests for the 4-frame boot intro state machine.
 *
 * Covers the full transition table (boot → enter → exit → next frame →
 * done), the no-skip rule for 1b–1d boots, the hold-on-enter rule (no
 * auto-replay), key filtering (bare modifiers and chords fall through so
 * the kill chord is never raced), and the tc/pct/clock formatters with
 * their degenerate-input guards.
 */
import { describe, expect, it } from 'vitest'
import {
  INITIAL_INTRO_STATE,
  INTRO_BOOT_MS,
  INTRO_EXIT_MS,
  INTRO_FRAMES,
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
} from './intro-sequence'

const s = (frame: IntroState['frame'], phase: IntroState['phase']): IntroState => ({ frame, phase })

describe('intro-sequence · transition table', () => {
  it('starts on the splash frame in boot', () => {
    expect(INITIAL_INTRO_STATE).toEqual(s('splash', 'boot'))
    expect(INTRO_FRAMES).toEqual(['splash', 'masthead', 'tape', 'plate'])
  })

  it('splash completion (SplashIntro onComplete) advances to masthead boot', () => {
    expect(advanceOnTimer(s('splash', 'boot'))).toEqual(s('masthead', 'boot'))
  })

  it('7s boot timers land on the enter hold for 1b–1d', () => {
    expect(advanceOnTimer(s('masthead', 'boot'))).toEqual(s('masthead', 'enter'))
    expect(advanceOnTimer(s('tape', 'boot'))).toEqual(s('tape', 'enter'))
    expect(advanceOnTimer(s('plate', 'boot'))).toEqual(s('plate', 'enter'))
  })

  it('exit timers chain to the next frame boot; the final exit finishes', () => {
    expect(advanceOnTimer(s('masthead', 'exit'))).toEqual(s('tape', 'boot'))
    expect(advanceOnTimer(s('tape', 'exit'))).toEqual(s('plate', 'boot'))
    expect(advanceOnTimer(s('plate', 'exit'))).toBe('done')
  })

  it('enter is not timer-driven (defensive no-op)', () => {
    expect(advanceOnTimer(s('masthead', 'enter'))).toBeNull()
    expect(advanceOnTimer(s('plate', 'enter'))).toBeNull()
  })

  it('keypress advances only from the enter hold — boots always play fully (no skip)', () => {
    expect(advanceOnKey(s('masthead', 'enter'))).toEqual(s('masthead', 'exit'))
    expect(advanceOnKey(s('tape', 'enter'))).toEqual(s('tape', 'exit'))
    expect(advanceOnKey(s('plate', 'enter'))).toEqual(s('plate', 'exit'))
    expect(advanceOnKey(s('masthead', 'boot'))).toBeNull()
    expect(advanceOnKey(s('tape', 'boot'))).toBeNull()
    expect(advanceOnKey(s('plate', 'boot'))).toBeNull()
    expect(advanceOnKey(s('masthead', 'exit'))).toBeNull()
    // splash owns its own skip inside SplashIntro — never routed here
    expect(advanceOnKey(s('splash', 'boot'))).toBeNull()
  })

  it('the enter hold has no timeout — no auto-replay (mockup: "hold on the enter screen")', () => {
    expect(introTimerMs(s('masthead', 'enter'))).toBeNull()
    expect(introTimerMs(s('tape', 'enter'))).toBeNull()
    expect(introTimerMs(s('plate', 'enter'))).toBeNull()
  })

  it('timer durations match the design spec (7.0s boots; 0.9/0.7/0.8s exits)', () => {
    expect(introTimerMs(s('masthead', 'boot'))).toBe(7000)
    expect(introTimerMs(s('tape', 'boot'))).toBe(7000)
    expect(introTimerMs(s('plate', 'boot'))).toBe(7000)
    expect(introTimerMs(s('masthead', 'exit'))).toBe(900)
    expect(introTimerMs(s('tape', 'exit'))).toBe(700)
    expect(introTimerMs(s('plate', 'exit'))).toBe(800)
    // splash is self-timed by SplashIntro — the orchestrator sets no timer
    expect(introTimerMs(s('splash', 'boot'))).toBeNull()
  })

  it('walks the whole scripted sequence: 3 keypresses, 23.4s of timers after the splash', () => {
    let st: IntroState | 'done' | null = s('splash', 'boot')
    let timered = 0
    let keys = 0
    const seen: string[] = []
    for (let hops = 0; hops < 32 && st !== 'done'; hops++) {
      const cur = st as IntroState
      seen.push(`${cur.frame}:${cur.phase}`)
      if (cur.phase === 'enter') {
        st = advanceOnKey(cur)
        keys++
      } else {
        timered += introTimerMs(cur) ?? 0
        st = advanceOnTimer(cur)
      }
    }
    expect(st).toBe('done')
    expect(keys).toBe(3)
    expect(timered).toBe(3 * 7000 + 900 + 700 + 800) // 23_400ms
    expect(seen).toEqual([
      'splash:boot',
      'masthead:boot', 'masthead:enter', 'masthead:exit',
      'tape:boot', 'tape:enter', 'tape:exit',
      'plate:boot', 'plate:enter', 'plate:exit',
    ])
  })

  it('constants stay in lockstep with the mockup', () => {
    expect(INTRO_BOOT_MS).toEqual({ splash: 3200, masthead: 7000, tape: 7000, plate: 7000 })
    expect(INTRO_EXIT_MS).toEqual({ splash: 0, masthead: 900, tape: 700, plate: 800 })
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

  it('rejects bare modifiers (Shift held while reaching for the chord must not advance)', () => {
    for (const k of ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'NumLock', 'AltGraph']) {
      expect(introAcceptsKey(ev(k))).toBe(false)
    }
  })

  it('rejects chorded presses — ⌘⇧K (kill arm), ⌘K (palette), ⌘1 (workspace) fall through', () => {
    expect(introAcceptsKey(ev('k', { metaKey: true }))).toBe(false)
    expect(introAcceptsKey(ev('k', { ctrlKey: true }))).toBe(false)
    expect(introAcceptsKey(ev('K', { ctrlKey: true }))).toBe(false)
    expect(introAcceptsKey(ev('1', { metaKey: true }))).toBe(false)
    expect(introAcceptsKey(ev('d', { metaKey: true }))).toBe(false)
    expect(introAcceptsKey(ev('a', { altKey: true }))).toBe(false)
  })
})

describe('intro-sequence · formatters', () => {
  it('fmtTimecode renders 25fps VHS timecode', () => {
    expect(fmtTimecode(0)).toBe('00:00:00:00')
    expect(fmtTimecode(39)).toBe('00:00:00:00')
    expect(fmtTimecode(40)).toBe('00:00:00:01')
    expect(fmtTimecode(999)).toBe('00:00:00:24')
    expect(fmtTimecode(1000)).toBe('00:00:01:00')
    expect(fmtTimecode(6960)).toBe('00:00:06:24')
  })

  it('fmtTimecode clamps to the boot window (default 7s) and to zero', () => {
    expect(fmtTimecode(7000)).toBe('00:00:07:00')
    expect(fmtTimecode(999_999)).toBe('00:00:07:00')
    expect(fmtTimecode(-50)).toBe('00:00:00:00')
    // explicit clamp: minutes roll over correctly
    expect(fmtTimecode(61_000, 120_000)).toBe('00:01:01:00')
  })

  it('fmtProgressPct clamps 0–100 and guards degenerate totals (P-040 class)', () => {
    expect(fmtProgressPct(0)).toBe('0%')
    expect(fmtProgressPct(3500)).toBe('50%')
    expect(fmtProgressPct(7000)).toBe('100%')
    expect(fmtProgressPct(9999)).toBe('100%')
    expect(fmtProgressPct(-100)).toBe('0%')
    expect(fmtProgressPct(1000, 0)).toBe('100%')
    expect(fmtProgressPct(1000, -5)).toBe('100%')
  })

  it('fmtUtcClock / fmtUtcDate render zero-padded UTC', () => {
    const d = new Date(Date.UTC(2026, 6, 12, 4, 7, 9)) // 2026-07-12 04:07:09Z
    expect(fmtUtcClock(d)).toBe('04:07:09')
    expect(fmtUtcDate(d)).toBe('2026-07-12')
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
    expect(sessionLabel(23)).toBe('TOKYO')
    // degenerate inputs normalize instead of exploding
    expect(sessionLabel(24)).toBe('TOKYO')
    expect(sessionLabel(-1)).toBe('TOKYO')
    expect(sessionLabel(13.9)).toBe('NEW YORK')
  })
})
