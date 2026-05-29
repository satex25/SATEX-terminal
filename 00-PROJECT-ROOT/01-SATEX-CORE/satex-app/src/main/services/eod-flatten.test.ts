import { describe, expect, it } from 'vitest'
import { EodFlattenService, computeMsToFlatBy, isPastFlatBy, isWeekend } from './eod-flatten'
import type { FlatByConfig } from '@shared/funded/types'

const TOPSTEP: FlatByConfig = { hour: 16, minute: 10, tz: 'America/New_York' }

// 2026-05-29 is a Friday during EDT (UTC-4).
//   2026-05-29 20:10:00Z = 16:10 New_York → exactly at flat-by
//   2026-05-29 19:00:00Z = 15:00 New_York → before flat-by
//   2026-05-29 21:00:00Z = 17:00 New_York → after flat-by
//   2026-05-30 (Saturday), 2026-05-31 (Sunday) — weekend
//   2026-06-01 (Monday) — next trading day

describe('isPastFlatBy', () => {
  it('false when local time is before flat-by hour', () => {
    expect(isPastFlatBy(new Date('2026-05-29T15:00:00Z'), TOPSTEP)).toBe(false)
  })
  it('false when local time is same hour but earlier minute', () => {
    expect(isPastFlatBy(new Date('2026-05-29T20:09:00Z'), TOPSTEP)).toBe(false)
  })
  it('true exactly at flat-by minute', () => {
    expect(isPastFlatBy(new Date('2026-05-29T20:10:00Z'), TOPSTEP)).toBe(true)
  })
  it('true after flat-by', () => {
    expect(isPastFlatBy(new Date('2026-05-29T21:00:00Z'), TOPSTEP)).toBe(true)
  })
})

describe('isWeekend', () => {
  it('Saturday → true', () => {
    expect(isWeekend(new Date('2026-05-30T15:00:00Z'), 'America/New_York')).toBe(true)
  })
  it('Sunday → true', () => {
    expect(isWeekend(new Date('2026-05-31T15:00:00Z'), 'America/New_York')).toBe(true)
  })
  it('Friday → false', () => {
    expect(isWeekend(new Date('2026-05-29T15:00:00Z'), 'America/New_York')).toBe(false)
  })
})

describe('computeMsToFlatBy', () => {
  it('returns positive ms to today\'s flat-by when before cutoff', () => {
    const now = new Date('2026-05-29T19:00:00Z')
    const ms = computeMsToFlatBy(now, TOPSTEP)
    expect(ms).toBeGreaterThan(60 * 60_000)
    expect(ms).toBeLessThan(80 * 60_000)
  })

  it('skips weekends — Fri after cutoff returns Mon at cutoff', () => {
    const now = new Date('2026-05-29T21:00:00Z')
    const ms = computeMsToFlatBy(now, TOPSTEP)
    expect(ms).toBeGreaterThan(60 * 60 * 60_000)
    expect(ms).toBeLessThan(80 * 60 * 60_000)
  })
})

describe('EodFlattenService.tick', () => {
  function build() {
    const calls: string[] = []
    let active = true
    const svc = new EodFlattenService({
      getFlatBy: () => active ? TOPSTEP : null,
      onFlat: (reason) => calls.push(reason),
    })
    return {
      svc, calls,
      deactivate: () => { active = false },
    }
  }

  it('fires when ticked past flat-by', () => {
    const { svc, calls } = build()
    svc.tick(new Date('2026-05-29T20:15:00Z'))
    expect(calls).toHaveLength(1)
    expect(calls[0]).toBe('eod-2026-05-29')
  })

  it('does NOT fire twice in the same day', () => {
    const { svc, calls } = build()
    svc.tick(new Date('2026-05-29T20:15:00Z'))
    svc.tick(new Date('2026-05-29T20:20:00Z'))
    svc.tick(new Date('2026-05-29T22:00:00Z'))
    expect(calls).toHaveLength(1)
  })

  it('does NOT fire before flat-by', () => {
    const { svc, calls } = build()
    svc.tick(new Date('2026-05-29T19:00:00Z'))
    expect(calls).toHaveLength(0)
  })

  it('does NOT fire on weekends', () => {
    const { svc, calls } = build()
    svc.tick(new Date('2026-05-30T20:30:00Z'))
    svc.tick(new Date('2026-05-31T20:30:00Z'))
    expect(calls).toHaveLength(0)
  })

  it('fires again on a new trading day', () => {
    const { svc, calls } = build()
    svc.tick(new Date('2026-05-29T20:15:00Z'))
    svc.tick(new Date('2026-06-01T20:15:00Z'))
    expect(calls).toHaveLength(2)
  })

  it('no-ops when no profile is active', () => {
    const { svc, calls, deactivate } = build()
    deactivate()
    svc.tick(new Date('2026-05-29T20:15:00Z'))
    expect(calls).toHaveLength(0)
  })
})

describe('EodFlattenService.triggerNow', () => {
  it('fires immediately regardless of time', () => {
    const calls: string[] = []
    const svc = new EodFlattenService({
      getFlatBy: () => TOPSTEP,
      onFlat: (r) => calls.push(r),
    })
    svc.triggerNow(new Date('2026-05-29T10:00:00Z'), 'panic-button')
    expect(calls).toEqual(['panic-button'])
  })

  it('marks today as fired so a subsequent tick at cutoff does not double-fire', () => {
    const calls: string[] = []
    const svc = new EodFlattenService({
      getFlatBy: () => TOPSTEP,
      onFlat: (r) => calls.push(r),
    })
    svc.triggerNow(new Date('2026-05-29T10:00:00Z'), 'panic')
    svc.tick(new Date('2026-05-29T20:15:00Z'))
    expect(calls).toEqual(['panic'])
  })
})

describe('EodFlattenService.reset', () => {
  it('clears the "fired today" memory so the next tick can fire again', () => {
    const calls: string[] = []
    const svc = new EodFlattenService({
      getFlatBy: () => TOPSTEP,
      onFlat: (r) => calls.push(r),
    })
    svc.tick(new Date('2026-05-29T20:15:00Z'))
    svc.reset()
    svc.tick(new Date('2026-05-29T20:30:00Z'))
    expect(calls).toHaveLength(2)
  })
})
