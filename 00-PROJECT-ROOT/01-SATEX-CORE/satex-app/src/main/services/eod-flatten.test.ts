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

// ─── P0-C: hydrate + restart-past-cutoff coverage ──────────────────────────
describe('EodFlattenService.hydrate — P0-C restart-past-cutoff', () => {
  it('T3: hydrate(lastFiredDate) prevents re-flatten on restart past cutoff', () => {
    const calls: string[] = []
    const svc = new EodFlattenService({
      getFlatBy: () => TOPSTEP,
      onFlat: (r) => calls.push(r),
    })
    // Simulate a pre-restart state: flatten already fired for 2026-05-29
    svc.hydrate('2026-05-29')
    // Restart tick at 20:30 (past cutoff, same day) — must NOT re-fire
    svc.tick(new Date('2026-05-29T20:30:00Z'))
    expect(calls).toHaveLength(0)
  })

  it('T3b: hydrate with null still fires on the next cutoff', () => {
    const calls: string[] = []
    const svc = new EodFlattenService({
      getFlatBy: () => TOPSTEP,
      onFlat: (r) => calls.push(r),
    })
    svc.hydrate(null)
    svc.tick(new Date('2026-05-29T20:15:00Z'))
    expect(calls).toHaveLength(1)
  })

  it('T3c: setLastFiredDate callback is invoked when flatten fires', () => {
    const persisted: string[] = []
    const svc = new EodFlattenService({
      getFlatBy: () => TOPSTEP,
      onFlat: () => {},
      setLastFiredDate: (d) => persisted.push(d),
    })
    svc.tick(new Date('2026-05-29T20:15:00Z'))
    expect(persisted).toEqual(['2026-05-29'])
  })
})

// ─── P2-C: computeMsToFlatBy non-mod-5 cutoff accuracy ─────────────────────
describe('computeMsToFlatBy — T4 non-mod-5 cutoff', () => {
  it('T4: returns ms to a non-round cutoff (16:13) within 5-min probe tolerance', () => {
    const custom: FlatByConfig = { hour: 16, minute: 13, tz: 'America/New_York' }
    // 2026-05-29T18:00:00Z = 14:00 ET — 2h 13m before cutoff
    const now = new Date('2026-05-29T18:00:00Z')
    const ms = computeMsToFlatBy(now, custom)
    // Should find a probe in the [16:13, 16:18) window → ~133 min away
    expect(ms).toBeGreaterThan(120 * 60_000)  // at least 2h out
    expect(ms).toBeLessThan(145 * 60_000)     // within 5-min probe tolerance
  })
})
