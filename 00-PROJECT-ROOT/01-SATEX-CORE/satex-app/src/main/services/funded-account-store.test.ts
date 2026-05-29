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

  it('round-trips a saved state', () => {
    const { store } = buildStore()
    const written: FundedAccountStored = {
      activeProfileId: 'topstep-50k-xfa',
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
    store.save({ activeProfileId: 'x', ledger: [], updatedAt: 0 })
    expect(fs.last).toContain('  ')
    expect(fs.last).toContain('"activeProfileId": "x"')
  })

  it('stamps updatedAt on every save', () => {
    const { store, fs } = buildStore()
    store.save({ activeProfileId: 'x', ledger: [], updatedAt: 0 })
    const parsed = JSON.parse(fs.last!)
    expect(parsed.updatedAt).toBeGreaterThan(0)
  })
})
