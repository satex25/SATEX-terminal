/**
 * SATEX — Timezone store tests (v0.6 · selectable local clock).
 *
 * Pins the selectable local-clock zone store: the TRADING_TIMEZONES catalog the
 * Settings picker renders from, the zoneCode lookup, the setTimezone guards
 * (valid switch, unknown id ignored, redundant set skipped), localStorage
 * persistence, and the boot-time read of a persisted preference (default
 * Chicago/CT, restore valid, reject corrupt, survive a throwing localStorage).
 *
 * Harness note (mirrors themeStore.test.ts): vitest runs in the default node
 * env — no jsdom — so `window` is absent. The store guards every localStorage
 * access in try/catch, so the default path works headless; persistence and boot
 * paths stub `window` explicitly. readPersistedZone() runs at module load, so
 * boot cases re-import the module fresh after stubbing window.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { TRADING_TIMEZONES, useTimezoneStore, zoneCode, type TimezoneId } from './timezoneStore'

beforeEach(() => {
  useTimezoneStore.setState({ timezone: 'America/Chicago' })
})

describe('useTimezoneStore — TRADING_TIMEZONES catalog', () => {
  it('ships exactly ten trading zones', () => {
    expect(TRADING_TIMEZONES).toHaveLength(10)
  })

  it('gives every zone an IANA id, code, label and market for the picker', () => {
    for (const z of TRADING_TIMEZONES) {
      expect(z.id).toMatch(/^[A-Za-z]+\/[A-Za-z_]+$/)
      expect(z.code.length).toBeGreaterThan(0)
      expect(z.label.length).toBeGreaterThan(0)
      expect(z.market.length).toBeGreaterThan(0)
    }
  })

  it('uses only IANA ids the runtime ICU can resolve (no Europe/Frankfurt link)', () => {
    for (const z of TRADING_TIMEZONES) {
      expect(() => new Intl.DateTimeFormat('en-US', { timeZone: z.id })).not.toThrow()
    }
  })

  it('has unique ids and unique codes', () => {
    expect(new Set(TRADING_TIMEZONES.map((z) => z.id)).size).toBe(10)
    expect(new Set(TRADING_TIMEZONES.map((z) => z.code)).size).toBe(10)
  })

  it('boots Chicago/CT by default (preserves the historical CST clock)', () => {
    expect(useTimezoneStore.getState().timezone).toBe('America/Chicago')
  })
})

describe('zoneCode', () => {
  it('resolves a catalog id to its code', () => {
    expect(zoneCode('America/New_York')).toBe('NY')
    expect(zoneCode('Asia/Tokyo')).toBe('TYO')
  })

  it('falls back to a derived code for an unknown id (never empty)', () => {
    expect(zoneCode('Antarctica/Troll').length).toBeGreaterThan(0)
  })
})

describe('useTimezoneStore — setTimezone guards', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('switches to a valid zone', () => {
    useTimezoneStore.getState().setTimezone('Asia/Tokyo')
    expect(useTimezoneStore.getState().timezone).toBe('Asia/Tokyo')
  })

  it('ignores an unknown zone id (state unchanged, no crash)', () => {
    useTimezoneStore.getState().setTimezone('Mars/Olympus' as TimezoneId)
    expect(useTimezoneStore.getState().timezone).toBe('America/Chicago')
  })

  it('is a no-op when re-selecting the already-active zone (no redundant persist)', () => {
    useTimezoneStore.setState({ timezone: 'Europe/London' })
    const setItem = vi.fn()
    vi.stubGlobal('window', { localStorage: { getItem: vi.fn(), setItem } })

    useTimezoneStore.getState().setTimezone('Europe/London')

    expect(setItem).not.toHaveBeenCalled()
    expect(useTimezoneStore.getState().timezone).toBe('Europe/London')
  })
})

describe('useTimezoneStore — persistence', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('writes the selected zone to localStorage under satex.timezone', () => {
    const setItem = vi.fn()
    vi.stubGlobal('window', { localStorage: { getItem: vi.fn(), setItem } })

    useTimezoneStore.getState().setTimezone('Asia/Tokyo')

    expect(setItem).toHaveBeenCalledWith('satex.timezone', 'Asia/Tokyo')
  })

  it('best-effort persistence: a throwing localStorage does not break the state update', () => {
    vi.stubGlobal('window', {
      localStorage: { getItem: vi.fn(), setItem: () => { throw new Error('quota exceeded') } },
    })

    expect(() => useTimezoneStore.getState().setTimezone('Asia/Tokyo')).not.toThrow()
    expect(useTimezoneStore.getState().timezone).toBe('Asia/Tokyo')
  })
})

describe('useTimezoneStore — boot read of persisted preference', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  async function bootWith(getItem: () => string | null): Promise<TimezoneId> {
    vi.stubGlobal('window', { localStorage: { getItem, setItem: vi.fn() } })
    vi.resetModules()
    const fresh = await import('./timezoneStore')
    return fresh.useTimezoneStore.getState().timezone
  }

  it('boots Chicago when nothing is stored', async () => {
    expect(await bootWith(() => null)).toBe('America/Chicago')
  })

  it('restores a valid stored preference', async () => {
    expect(await bootWith(() => 'Asia/Tokyo')).toBe('Asia/Tokyo')
  })

  it('rejects a corrupt stored value and falls back to Chicago', async () => {
    expect(await bootWith(() => 'Narnia/Cair_Paravel')).toBe('America/Chicago')
  })

  it('survives a localStorage that throws on read (sandboxed renderer)', async () => {
    expect(await bootWith(() => { throw new Error('access denied') })).toBe('America/Chicago')
  })
})
