/**
 * SATEX — EquityHWMService tests.
 * Pins the trailing-then-locked semantic of the Topstep MLL computation.
 */
import { describe, expect, it } from 'vitest'
import { EquityHWMService, tradingDayKey } from './equity-hwm'
import { TOPSTEP_50K_XFA } from '@shared/funded/topstep-50k-xfa'
import type { EquityHwmLedgerEntry } from '@shared/funded/types'

function buildService(): { svc: EquityHWMService; persisted: EquityHwmLedgerEntry[][] } {
  const persisted: EquityHwmLedgerEntry[][] = []
  const svc = new EquityHWMService({
    getProfile: () => TOPSTEP_50K_XFA,
    persist: (l) => { persisted.push(l) },
  })
  return { svc, persisted }
}

describe('tradingDayKey', () => {
  it('formats as YYYY-MM-DD in the given tz', () => {
    const d = new Date('2026-05-29T14:00:00Z')
    expect(tradingDayKey(d, 'America/New_York')).toBe('2026-05-29')
  })

  it('rolls the day at midnight in the target tz, not UTC', () => {
    const d = new Date('2026-05-30T03:00:00Z')
    expect(tradingDayKey(d, 'America/New_York')).toBe('2026-05-29')
  })
})

describe('EquityHWMService — trailing phase (highestEod < lock threshold)', () => {
  it('starts with initialBalance - trailingMaxDrawdown = $48,000', () => {
    const { svc } = buildService()
    expect(svc.computeMll(TOPSTEP_50K_XFA)).toBe(48_000)
    expect(svc.isLocked(TOPSTEP_50K_XFA)).toBe(false)
  })

  it('trails as the HWM climbs but stays below the lock threshold', () => {
    const { svc } = buildService()
    svc.recordEod(50_500, new Date('2026-05-29T20:10:00Z'))
    expect(svc.getHighestEodBalance()).toBe(50_500)
    expect(svc.computeMll(TOPSTEP_50K_XFA)).toBe(48_500)
    expect(svc.isLocked(TOPSTEP_50K_XFA)).toBe(false)
  })

  it('uses max(initial, hwm) so a single-day dip below initial does not regress MLL', () => {
    const { svc } = buildService()
    svc.recordEod(49_500, new Date('2026-05-29T20:10:00Z'))
    expect(svc.computeMll(TOPSTEP_50K_XFA)).toBe(48_000)
  })
})

describe('EquityHWMService — locked phase (highestEod >= lock threshold)', () => {
  it('locks once HWM crosses initialBalance + dailyLossLimit = $51,000', () => {
    const { svc } = buildService()
    svc.recordEod(51_000, new Date('2026-05-29T20:10:00Z'))
    expect(svc.isLocked(TOPSTEP_50K_XFA)).toBe(true)
    expect(svc.computeMll(TOPSTEP_50K_XFA)).toBe(50_000)
  })

  it('keeps MLL static at initialBalance even as HWM climbs higher', () => {
    const { svc } = buildService()
    svc.recordEod(51_000, new Date('2026-05-29T20:10:00Z'))
    svc.recordEod(55_000, new Date('2026-05-30T20:10:00Z'))
    svc.recordEod(80_000, new Date('2026-06-15T20:10:00Z'))
    expect(svc.computeMll(TOPSTEP_50K_XFA)).toBe(50_000)
  })

  it('stays locked even if a later EOD dips back below the threshold', () => {
    const { svc } = buildService()
    svc.recordEod(51_500, new Date('2026-05-29T20:10:00Z'))
    expect(svc.isLocked(TOPSTEP_50K_XFA)).toBe(true)
    svc.recordEod(50_500, new Date('2026-05-30T20:10:00Z'))
    expect(svc.isLocked(TOPSTEP_50K_XFA)).toBe(true)
    expect(svc.computeMll(TOPSTEP_50K_XFA)).toBe(50_000)
  })
})

describe('EquityHWMService — ledger persistence', () => {
  it('persists after every recordEod', () => {
    const { svc, persisted } = buildService()
    svc.recordEod(50_500, new Date('2026-05-29T20:10:00Z'))
    svc.recordEod(51_000, new Date('2026-05-30T20:10:00Z'))
    expect(persisted).toHaveLength(2)
    expect(persisted[1]).toHaveLength(2)
  })

  it('overwrites a same-day entry rather than appending', () => {
    const { svc } = buildService()
    svc.recordEod(50_500, new Date('2026-05-29T20:10:00Z'))
    svc.recordEod(50_700, new Date('2026-05-29T20:30:00Z'))
    expect(svc.getLedger()).toHaveLength(1)
    expect(svc.getLedger()[0]!.equity).toBe(50_700)
  })

  it('rejects non-positive / non-finite equity', () => {
    const { svc } = buildService()
    svc.recordEod(0,        new Date('2026-05-29T20:10:00Z'))
    svc.recordEod(-100,     new Date('2026-05-29T20:10:00Z'))
    svc.recordEod(NaN,      new Date('2026-05-29T20:10:00Z'))
    svc.recordEod(Infinity, new Date('2026-05-29T20:10:00Z'))
    expect(svc.getLedger()).toHaveLength(0)
  })
})

describe('EquityHWMService — hydration', () => {
  it('rebuilds HWM from a persisted ledger', () => {
    const { svc } = buildService()
    svc.hydrate([
      { date: '2026-05-27', equity: 50_200, recordedAt: 0 },
      { date: '2026-05-28', equity: 50_800, recordedAt: 0 },
      { date: '2026-05-29', equity: 50_400, recordedAt: 0 },
    ])
    expect(svc.getHighestEodBalance()).toBe(50_800)
  })

  it('sorts the ledger by date even if hydrate is fed out of order', () => {
    const { svc } = buildService()
    svc.hydrate([
      { date: '2026-05-29', equity: 50_400, recordedAt: 0 },
      { date: '2026-05-27', equity: 50_200, recordedAt: 0 },
      { date: '2026-05-28', equity: 50_800, recordedAt: 0 },
    ])
    const dates = svc.getLedger().map(e => e.date)
    expect(dates).toEqual(['2026-05-27', '2026-05-28', '2026-05-29'])
  })
})

describe('EquityHWMService — reset', () => {
  it('clears state to baseline', () => {
    const { svc } = buildService()
    svc.recordEod(52_000, new Date('2026-05-29T20:10:00Z'))
    svc.reset()
    expect(svc.getHighestEodBalance()).toBe(0)
    expect(svc.getLedger()).toHaveLength(0)
    expect(svc.computeMll(TOPSTEP_50K_XFA)).toBe(48_000)
  })
})

describe('EquityHWMService — no active profile', () => {
  it('recordEod is a no-op when getProfile() returns null', () => {
    const persisted: EquityHwmLedgerEntry[][] = []
    const svc = new EquityHWMService({
      getProfile: () => null,
      persist: (l) => { persisted.push(l) },
    })
    svc.recordEod(50_000, new Date('2026-05-29T20:10:00Z'))
    expect(svc.getLedger()).toHaveLength(0)
    expect(persisted).toHaveLength(0)
  })
})
