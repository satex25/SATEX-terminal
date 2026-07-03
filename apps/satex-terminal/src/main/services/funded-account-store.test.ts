import { describe, expect, it } from 'vitest'
import { FundedAccountStore, type FundedAccountStored } from './funded-account-store'

function buildStore(initial: string | null = null) {
  const fs: { last: string | null } = { last: initial }
  const path = '/tmp/funded-test.json'
  const store = new FundedAccountStore({
    readFile: () => fs.last,
    writeFile: (_p, d) => { fs.last = d },
    resolvePath: () => path,
  })
  return { store, fs }
}

describe('FundedAccountStore.load', () => {
  it('returns empty when file is missing', () => {
    const { store } = buildStore(null)
    const s = store.load()
    expect(s.activeProfileId).toBeNull()
    expect(s.ledger).toEqual([])
  })

  it('each empty-state read returns its OWN ledger/dailyPnl arrays (no shared-reference aliasing)', () => {
    // Same lesson as P-061 (indicator-settings.ts): a shallow spread of a
    // module-level EMPTY constant would alias the SAME array into every
    // caller, so mutating one caller's result could corrupt every other
    // holder of the "empty" state. Covers all three freshEmpty() call sites:
    // no-file, corrupt-JSON, and read-throws.
    const { store: noFile } = buildStore(null)
    const { store: corrupt } = buildStore('{not json at all')
    const a = noFile.load()
    const b = noFile.load()
    const c = corrupt.load()
    expect(a.ledger).not.toBe(b.ledger)
    expect(a.dailyPnl).not.toBe(b.dailyPnl)
    expect(a.ledger).not.toBe(c.ledger)
    a.ledger.push({ date: '2026-01-01', equity: 1, recordedAt: 0 })
    expect(b.ledger).toEqual([])
    expect(c.ledger).toEqual([])
  })

  it('round-trips a saved state', () => {
    const { store } = buildStore()
    const written: FundedAccountStored = {
      activeProfileId: 'topstep-50k-xfa',
      lastEodFiredDate: null,
      ledger: [{ date: '2026-05-29', equity: 50_500, recordedAt: 0 }],
      updatedAt: 0,
    }
    store.save(written)
    const back = store.load()
    expect(back.activeProfileId).toBe('topstep-50k-xfa')
    expect(back.ledger).toHaveLength(1)
    expect(back.ledger[0]!.equity).toBe(50_500)
  })

  it('returns empty on corrupted JSON', () => {
    const { store } = buildStore('{not json at all')
    const s = store.load()
    expect(s.activeProfileId).toBeNull()
    expect(s.ledger).toEqual([])
  })

  it('drops malformed ledger entries during sanitize', () => {
    const { store, fs } = buildStore()
    fs.last = JSON.stringify({
      activeProfileId: 'topstep-50k-xfa',
      ledger: [
        { date: '2026-05-29', equity: 50_500, recordedAt: 0 }, // good
        { date: 'not-a-date', equity: 50_000, recordedAt: 0 }, // bad date
        { date: '2026-05-30', equity: -100,    recordedAt: 0 }, // negative
        { date: '2026-05-31', equity: NaN,     recordedAt: 0 }, // NaN
        { date: '2026-06-01' },                                 // missing fields
      ],
      updatedAt: 0,
    })
    const back = store.load()
    expect(back.ledger).toHaveLength(1)
    expect(back.ledger[0]!.date).toBe('2026-05-29')
  })

  it('drops a non-string activeProfileId', () => {
    const { store, fs } = buildStore()
    fs.last = JSON.stringify({ activeProfileId: 42, ledger: [], updatedAt: 0 })
    expect(store.load().activeProfileId).toBeNull()
  })
})

describe('FundedAccountStore.save', () => {
  it('writes pretty JSON', () => {
    const { store, fs } = buildStore()
    store.save({ activeProfileId: 'x', lastEodFiredDate: null, ledger: [], updatedAt: 0 })
    expect(fs.last).toContain('  ')
    expect(fs.last).toContain('"activeProfileId": "x"')
  })

  it('stamps updatedAt on every save', () => {
    const { store, fs } = buildStore()
    store.save({ activeProfileId: 'x', lastEodFiredDate: null, ledger: [], updatedAt: 0 })
    const parsed = JSON.parse(fs.last!)
    expect(parsed.updatedAt).toBeGreaterThan(0)
  })
})

// ─── T7: lastEodFiredDate persistence (P0-C) ────────────────────────────────
describe('FundedAccountStore — lastEodFiredDate (P0-C)', () => {
  it('T7a: saves and loads lastEodFiredDate', () => {
    const { store } = buildStore()
    store.save({ activeProfileId: null, lastEodFiredDate: '2026-05-29', ledger: [], updatedAt: 0 })
    expect(store.load().lastEodFiredDate).toBe('2026-05-29')
  })

  it('T7b: null lastEodFiredDate round-trips correctly', () => {
    const { store } = buildStore()
    store.save({ activeProfileId: null, lastEodFiredDate: null, ledger: [], updatedAt: 0 })
    expect(store.load().lastEodFiredDate).toBeNull()
  })

  it('T7c: sanitize drops invalid date strings', () => {
    const { store, fs } = buildStore()
    fs.last = JSON.stringify({ activeProfileId: null, lastEodFiredDate: 'not-a-date', ledger: [], updatedAt: 0 })
    expect(store.load().lastEodFiredDate).toBeNull()
  })

  it('T7d: missing lastEodFiredDate in legacy JSON returns null', () => {
    const { store, fs } = buildStore()
    fs.last = JSON.stringify({ activeProfileId: null, ledger: [], updatedAt: 0 })
    expect(store.load().lastEodFiredDate).toBeNull()
  })
})
