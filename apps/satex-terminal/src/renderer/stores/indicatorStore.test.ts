/**
 * SATEX — Chart-indicator toggle store characterization coverage.
 *
 * Pins the measured behavior of the renderer's indicator settings store
 * (renderer-store coverage vein, continuing P-116's marketStore pattern).
 * Characterization tests: they assert MEASURED current behavior, not a spec,
 * so a silent regression of a guard turns a test red.
 *
 * Load-bearing pins:
 *   1. setEnabled runtime guards — unknown id and no-op-equal both bail
 *      WITHOUT a state write and WITHOUT a persist IPC call.
 *   2. Numeric clamps — setRsiPeriod [2,200], setFibLookback [5,1000],
 *      rounded, no-op when the clamp lands on the current value.
 *   3. NaN/Infinity rejection (P-118 regression pin, P-039/P-040 degenerate-
 *      input class) — non-finite input is a no-op, never a state poison.
 *      Mirrors main-side IndicatorSettingsService clampInt (Number.isFinite).
 *   4. Immutability — every change builds a fresh settings object; the
 *      previous snapshot and DEFAULT_INDICATOR_SETTINGS are never mutated
 *      (the P-061/P-074 shared-default class, protected side).
 *   5. persist() is fire-and-forget through window.satex with a .catch wall —
 *      rejections warn, they never throw into the action.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_INDICATOR_SETTINGS,
  type IndicatorId,
  type IndicatorSettings,
} from '@shared/chart-indicators'
import { useIndicatorStore } from './indicatorStore'

const DEFAULT_SNAPSHOT = structuredClone(DEFAULT_INDICATOR_SETTINGS)

let setSettingsMock: ReturnType<typeof vi.fn>
let getSettingsMock: ReturnType<typeof vi.fn>

function tick(): Promise<void> {
  return new Promise(r => setTimeout(r, 0))
}

beforeEach(() => {
  setSettingsMock = vi.fn(() => Promise.resolve())
  getSettingsMock = vi.fn(() => Promise.resolve(undefined))
  vi.stubGlobal('window', {
    satex: { indicators: { setSettings: setSettingsMock, getSettings: getSettingsMock } },
  })
  useIndicatorStore.setState(useIndicatorStore.getInitialState(), true)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('indicatorStore — initial state', () => {
  it('deep-equals the shared defaults with hydrated=false', () => {
    const s = useIndicatorStore.getState()
    expect(s.settings).toEqual(DEFAULT_INDICATOR_SETTINGS)
    expect(s.hydrated).toBe(false)
  })

  it('holds a fresh copy of the defaults, not the module constant itself', () => {
    const s = useIndicatorStore.getState()
    expect(s.settings).not.toBe(DEFAULT_INDICATOR_SETTINGS)
    expect(s.settings.enabled).not.toBe(DEFAULT_INDICATOR_SETTINGS.enabled)
  })
})

describe('indicatorStore — setEnabled', () => {
  it('ignores an unknown indicator id: no state write, no persist', () => {
    const before = useIndicatorStore.getState().settings
    useIndicatorStore.getState().setEnabled('bogus' as IndicatorId, true)
    expect(useIndicatorStore.getState().settings).toBe(before)
    expect(setSettingsMock).not.toHaveBeenCalled()
  })

  it('is a no-op when the flag already holds the requested value', () => {
    const before = useIndicatorStore.getState().settings
    useIndicatorStore.getState().setEnabled('ema', true) // already true by default
    expect(useIndicatorStore.getState().settings).toBe(before)
    expect(setSettingsMock).not.toHaveBeenCalled()
  })

  it('flips the flag into a fresh settings object and persists it exactly once', () => {
    useIndicatorStore.getState().setEnabled('rsi', true)
    const after = useIndicatorStore.getState().settings
    expect(after.enabled.rsi).toBe(true)
    expect(setSettingsMock).toHaveBeenCalledTimes(1)
    expect(setSettingsMock.mock.calls[0]![0]).toBe(after)
  })

  it('never mutates the previous settings snapshot', () => {
    const before = useIndicatorStore.getState().settings
    useIndicatorStore.getState().setEnabled('rsi', true)
    expect(before.enabled.rsi).toBe(false)
    expect(useIndicatorStore.getState().settings).not.toBe(before)
  })

  it('never mutates DEFAULT_INDICATOR_SETTINGS (P-061/P-074 protection)', () => {
    useIndicatorStore.getState().setEnabled('fibonacci', true)
    expect(DEFAULT_INDICATOR_SETTINGS.enabled['fibonacci']).toBe(false)
  })
})

describe('indicatorStore — toggleEmaPeriod', () => {
  it('removes a period that is present', () => {
    useIndicatorStore.getState().toggleEmaPeriod(9)
    expect(useIndicatorStore.getState().settings.emaPeriods).toEqual([21])
  })

  it('adds an absent period keeping ascending numeric order', () => {
    useIndicatorStore.getState().toggleEmaPeriod(200)
    useIndicatorStore.getState().toggleEmaPeriod(50)
    expect(useIndicatorStore.getState().settings.emaPeriods).toEqual([9, 21, 50, 200])
  })

  it('has no no-op case: a round-trip toggle restores state but persists twice', () => {
    useIndicatorStore.getState().toggleEmaPeriod(9)
    useIndicatorStore.getState().toggleEmaPeriod(9)
    expect(useIndicatorStore.getState().settings.emaPeriods).toEqual([9, 21])
    expect(setSettingsMock).toHaveBeenCalledTimes(2)
  })

  it('builds a fresh periods array and never mutates the shared default array', () => {
    const before = useIndicatorStore.getState().settings.emaPeriods
    useIndicatorStore.getState().toggleEmaPeriod(50)
    expect(useIndicatorStore.getState().settings.emaPeriods).not.toBe(before)
    expect(DEFAULT_INDICATOR_SETTINGS.emaPeriods).toEqual([9, 21])
  })
})

describe('indicatorStore — setRsiPeriod', () => {
  it('clamps below the floor to 2', () => {
    useIndicatorStore.getState().setRsiPeriod(0)
    expect(useIndicatorStore.getState().settings.rsiPeriod).toBe(2)
  })

  it('clamps above the ceiling to 200 and rounds fractional input', () => {
    useIndicatorStore.getState().setRsiPeriod(999)
    expect(useIndicatorStore.getState().settings.rsiPeriod).toBe(200)
    useIndicatorStore.getState().setRsiPeriod(14.6)
    expect(useIndicatorStore.getState().settings.rsiPeriod).toBe(15)
  })

  it('is a no-op (no write, no persist) when the clamp lands on the current value', () => {
    const before = useIndicatorStore.getState().settings
    useIndicatorStore.getState().setRsiPeriod(14.2) // rounds to current default 14
    expect(useIndicatorStore.getState().settings).toBe(before)
    expect(setSettingsMock).not.toHaveBeenCalled()
  })

  it('rejects NaN outright — no state poison, no persist (P-118 regression pin)', () => {
    const before = useIndicatorStore.getState().settings
    useIndicatorStore.getState().setRsiPeriod(NaN)
    expect(useIndicatorStore.getState().settings).toBe(before)
    expect(useIndicatorStore.getState().settings.rsiPeriod).toBe(14)
    expect(setSettingsMock).not.toHaveBeenCalled()
  })

  it('rejects ±Infinity the same way (Number.isFinite wall, mirrors clampInt)', () => {
    const before = useIndicatorStore.getState().settings
    useIndicatorStore.getState().setRsiPeriod(Infinity)
    useIndicatorStore.getState().setRsiPeriod(-Infinity)
    expect(useIndicatorStore.getState().settings).toBe(before)
    expect(setSettingsMock).not.toHaveBeenCalled()
  })
})

describe('indicatorStore — setFibLookback', () => {
  it('clamps into [5, 1000] and rounds', () => {
    useIndicatorStore.getState().setFibLookback(2)
    expect(useIndicatorStore.getState().settings.fibLookback).toBe(5)
    useIndicatorStore.getState().setFibLookback(5000)
    expect(useIndicatorStore.getState().settings.fibLookback).toBe(1000)
    useIndicatorStore.getState().setFibLookback(49.7)
    expect(useIndicatorStore.getState().settings.fibLookback).toBe(50)
  })

  it('is a no-op when the clamp lands on the current value', () => {
    const before = useIndicatorStore.getState().settings
    useIndicatorStore.getState().setFibLookback(50.3) // rounds to current default 50
    expect(useIndicatorStore.getState().settings).toBe(before)
    expect(setSettingsMock).not.toHaveBeenCalled()
  })

  it('rejects NaN and ±Infinity — no state poison, no persist (P-118 regression pin)', () => {
    const before = useIndicatorStore.getState().settings
    useIndicatorStore.getState().setFibLookback(NaN)
    useIndicatorStore.getState().setFibLookback(Infinity)
    expect(useIndicatorStore.getState().settings).toBe(before)
    expect(useIndicatorStore.getState().settings.fibLookback).toBe(50)
    expect(setSettingsMock).not.toHaveBeenCalled()
  })
})

describe('indicatorStore — setLegendVisible', () => {
  it('is a no-op when the value already matches', () => {
    const before = useIndicatorStore.getState().settings
    useIndicatorStore.getState().setLegendVisible(true) // default is true
    expect(useIndicatorStore.getState().settings).toBe(before)
    expect(setSettingsMock).not.toHaveBeenCalled()
  })

  it('flips the flag and persists once', () => {
    useIndicatorStore.getState().setLegendVisible(false)
    expect(useIndicatorStore.getState().settings.legendVisible).toBe(false)
    expect(setSettingsMock).toHaveBeenCalledTimes(1)
  })
})

describe('indicatorStore — setSettings', () => {
  it('replaces settings wholesale (no renderer-side validation) and persists the exact object', () => {
    // The renderer store trusts its input; main-side sanitize() is the wall
    // before anything reaches disk (indicator-settings.ts).
    const next: IndicatorSettings = {
      ...structuredClone(DEFAULT_INDICATOR_SETTINGS),
      rsiPeriod: 21,
    }
    useIndicatorStore.getState().setSettings(next)
    expect(useIndicatorStore.getState().settings).toBe(next)
    expect(setSettingsMock).toHaveBeenCalledTimes(1)
    expect(setSettingsMock.mock.calls[0]![0]).toBe(next)
  })
})

describe('indicatorStore — hydrate', () => {
  it('adopts the on-disk settings object and marks hydrated', async () => {
    const disk: IndicatorSettings = {
      ...structuredClone(DEFAULT_INDICATOR_SETTINGS),
      rsiPeriod: 21,
    }
    getSettingsMock.mockImplementation(() => Promise.resolve(disk))
    await useIndicatorStore.getState().hydrate()
    expect(useIndicatorStore.getState().settings).toBe(disk)
    expect(useIndicatorStore.getState().hydrated).toBe(true)
  })

  it('keeps defaults but still marks hydrated when disk returns nothing', async () => {
    await useIndicatorStore.getState().hydrate() // mock resolves undefined
    expect(useIndicatorStore.getState().settings).toEqual(DEFAULT_INDICATOR_SETTINGS)
    expect(useIndicatorStore.getState().hydrated).toBe(true)
  })

  it('marks hydrated and keeps defaults when the IPC read rejects', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    getSettingsMock.mockImplementation(() => Promise.reject(new Error('io')))
    await useIndicatorStore.getState().hydrate()
    expect(useIndicatorStore.getState().hydrated).toBe(true)
    expect(useIndicatorStore.getState().settings).toEqual(DEFAULT_INDICATOR_SETTINGS)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('resolves cleanly when the preload bridge is absent entirely', async () => {
    vi.stubGlobal('window', {}) // no satex at all — optional-chaining pin
    await useIndicatorStore.getState().hydrate()
    expect(useIndicatorStore.getState().hydrated).toBe(true)
  })
})

describe('indicatorStore — flush + persist failure walls', () => {
  it('flush() sends the current settings object through the IPC once', async () => {
    await useIndicatorStore.getState().flush()
    expect(setSettingsMock).toHaveBeenCalledTimes(1)
    expect(setSettingsMock.mock.calls[0]![0]).toBe(useIndicatorStore.getState().settings)
  })

  it('flush() swallows IPC rejection with a warning, never throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    setSettingsMock.mockImplementation(() => Promise.reject(new Error('io')))
    await expect(useIndicatorStore.getState().flush()).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('setter persist() rejection is caught by its .catch wall (fire-and-forget)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    setSettingsMock.mockImplementation(() => Promise.reject(new Error('boom')))
    useIndicatorStore.getState().setEnabled('rsi', true)
    await tick()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(useIndicatorStore.getState().settings.enabled.rsi).toBe(true)
  })
})

describe('indicatorStore — shared-defaults integrity (P-061/P-074 class, protected side)', () => {
  it('DEFAULT_INDICATOR_SETTINGS survives the whole action surface untouched', () => {
    const st = useIndicatorStore.getState()
    st.setEnabled('pivot-points', true)
    st.toggleEmaPeriod(50)
    st.setRsiPeriod(30)
    st.setFibLookback(100)
    st.setLegendVisible(false)
    expect(DEFAULT_INDICATOR_SETTINGS).toEqual(DEFAULT_SNAPSHOT)
  })
})
