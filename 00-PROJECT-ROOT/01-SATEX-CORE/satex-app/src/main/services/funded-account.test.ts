import { describe, expect, it } from 'vitest'
import { FundedAccountService } from './funded-account'
import { FundedAccountStore, type FundedAccountStored } from './funded-account-store'

function inMemoryStore(initial?: FundedAccountStored) {
  const state: { value: FundedAccountStored | null } = { value: initial ?? null }
  const store = new FundedAccountStore({
    readFile: () => state.value ? JSON.stringify(state.value) : null,
    writeFile: (_p, d) => { state.value = JSON.parse(d) as FundedAccountStored },
    resolvePath: () => '/tmp/funded.json',
  })
  return { store, state }
}

function buildService(opts?: { initial?: FundedAccountStored }) {
  const flattens: string[] = []
  const { store, state } = inMemoryStore(opts?.initial)
  const svc = new FundedAccountService({
    onFlatten: (r) => flattens.push(r),
    getEquity: () => 50_000,
    store,
  })
  return { svc, flattens, state }
}

describe('FundedAccountService — activation', () => {
  it('starts with no active profile', () => {
    const { svc } = buildService()
    expect(svc.getProfile()).toBeNull()
  })

  it('activates the Topstep $50K XFA preset by id', () => {
    const { svc } = buildService()
    expect(svc.setProfile('topstep-50k-xfa').ok).toBe(true)
    expect(svc.getProfile()?.id).toBe('topstep-50k-xfa')
  })

  it('rejects unknown profile ids', () => {
    const { svc } = buildService()
    const r = svc.setProfile('nonsense')
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('unknown')
  })

  it('deactivates on setProfile(null), resetting HWM + EOD memory', () => {
    const { svc } = buildService()
    svc.setProfile('topstep-50k-xfa')
    svc.recordEod(51_500, new Date('2026-05-29T20:10:00Z'))
    svc.setProfile(null)
    expect(svc.getProfile()).toBeNull()
    svc.setProfile('topstep-50k-xfa')
    const snap = svc.snapshot(50_000, new Date('2026-05-29T20:10:00Z'))
    expect(snap.highestEodBalance).toBe(0)
  })
})

describe('FundedAccountService — hydration', () => {
  it('restores active profile + ledger from store', () => {
    const { svc } = buildService({
      initial: {
        activeProfileId: 'topstep-50k-xfa',
        lastEodFiredDate: null,
        ledger: [
          { date: '2026-05-27', equity: 50_400, recordedAt: 0 },
          { date: '2026-05-28', equity: 50_900, recordedAt: 0 },
        ],
        updatedAt: 0,
      },
    })
    svc.hydrate()
    expect(svc.getProfile()?.id).toBe('topstep-50k-xfa')
    const snap = svc.snapshot(50_700, new Date('2026-05-29T15:00:00Z'))
    expect(snap.highestEodBalance).toBe(50_900)
  })

  it('survives a stored profile id that no longer exists', () => {
    const { svc } = buildService({
      initial: { activeProfileId: 'retired-profile-id', lastEodFiredDate: null, ledger: [], updatedAt: 0 },
    })
    svc.hydrate()
    expect(svc.getProfile()).toBeNull()
  })
})

describe('FundedAccountService — persistence', () => {
  it('persists activation', () => {
    const { svc, state } = buildService()
    svc.setProfile('topstep-50k-xfa')
    expect(state.value?.activeProfileId).toBe('topstep-50k-xfa')
  })

  it('persists every recordEod', () => {
    const { svc, state } = buildService()
    svc.setProfile('topstep-50k-xfa')
    svc.recordEod(51_000, new Date('2026-05-29T20:10:00Z'))
    expect(state.value?.ledger).toHaveLength(1)
    expect(state.value?.ledger[0]!.equity).toBe(51_000)
  })
})

describe('FundedAccountService — MLL breach + snapshot', () => {
  it('isMllBreached false when equity is above MLL', () => {
    const { svc } = buildService()
    svc.setProfile('topstep-50k-xfa')
    expect(svc.isMllBreached(49_000)).toBe(false)
  })

  it('isMllBreached true when equity drops below MLL', () => {
    const { svc } = buildService()
    svc.setProfile('topstep-50k-xfa')
    expect(svc.isMllBreached(47_999)).toBe(true)
  })

  it('snapshot reflects locked MLL once HWM crosses threshold', () => {
    const { svc } = buildService()
    svc.setProfile('topstep-50k-xfa')
    svc.recordEod(51_500, new Date('2026-05-29T20:10:00Z'))
    const snap = svc.snapshot(51_500, new Date('2026-05-29T20:15:00Z'))
    expect(snap.mllLocked).toBe(true)
    expect(snap.currentMll).toBe(50_000)
    expect(snap.mllBuffer).toBe(1_500)
  })

  it('snapshot includes today date key in profile tz', () => {
    const { svc } = buildService()
    svc.setProfile('topstep-50k-xfa')
    const snap = svc.snapshot(50_000, new Date('2026-05-29T20:15:00Z'))
    expect(snap.today).toBe('2026-05-29')
  })

  it('snapshot returns inert shape when no profile is active', () => {
    const { svc } = buildService()
    const snap = svc.snapshot(50_000, new Date('2026-05-29T15:00:00Z'))
    expect(snap.active).toBe(false)
    expect(snap.profile).toBeNull()
  })
})

describe('FundedAccountService — EOD wiring', () => {
  it('tick at cutoff fires the wired onFlatten callback', () => {
    const { svc, flattens } = buildService()
    svc.setProfile('topstep-50k-xfa')
    svc.tick(new Date('2026-05-29T20:15:00Z'))
    expect(flattens).toHaveLength(1)
    expect(flattens[0]).toBe('eod-2026-05-29')
  })

  it('triggerFlatten fires immediately with the supplied reason', () => {
    const { svc, flattens } = buildService()
    svc.setProfile('topstep-50k-xfa')
    svc.triggerFlatten(new Date('2026-05-29T10:00:00Z'), 'panic')
    expect(flattens).toEqual(['panic'])
  })

  it('no flatten when no profile is active', () => {
    const { svc, flattens } = buildService()
    svc.tick(new Date('2026-05-29T20:15:00Z'))
    expect(flattens).toHaveLength(0)
  })
})

// ─── P0-C / Bug-1 regression + P1-B coverage ───────────────────────────────
describe('FundedAccountService — broadcast() and tick() listener coverage', () => {
  it('T1: broadcast() passes non-zero mllBuffer to listener after setProfile (B1 regression)', () => {
    const { svc } = buildService()
    const snaps: import('@shared/funded/types').FundedAccountSnapshot[] = []
    svc.onUpdate(s => snaps.push(s))
    svc.setProfile('topstep-50k-xfa') // triggers broadcast
    expect(snaps.length).toBeGreaterThan(0)
    const last = snaps[snaps.length - 1]!
    // getEquity returns 50_000, MLL at new account = 48_000, buffer = 2_000
    expect(last.active).toBe(true)
    expect(last.mllBuffer).toBeGreaterThan(0)
  })

  it('T2: tick() calls broadcast() so listener receives updated msToFlatBy (P1-B)', () => {
    const { svc } = buildService()
    svc.setProfile('topstep-50k-xfa')
    const snaps: import('@shared/funded/types').FundedAccountSnapshot[] = []
    svc.onUpdate(s => snaps.push(s))
    const before = snaps.length
    svc.tick(new Date('2026-05-29T15:00:00Z')) // before cutoff — no flatten
    expect(snaps.length).toBe(before + 1)
  })
})
