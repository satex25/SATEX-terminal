import { describe, expect, it } from 'vitest'
import { isInBlackout } from './blackout-window'
import type { MacroEvent } from '@shared/types'

const now = Date.parse('2026-05-29T12:30:00Z')

function evt(offsetSec: number, impact: 'high' | 'med' | 'low' = 'high', id = 'e'): MacroEvent {
  return {
    id, label: id, cons: '—', actual: '—', impact,
    tsUtc: new Date(now + offsetSec * 1000).toISOString(),
  }
}

describe('isInBlackout', () => {
  it('returns false when no events are in the window', () => {
    const r = isInBlackout(now, [evt(300)], ['high'], 60_000)
    expect(r.inBlackout).toBe(false)
    expect(r.triggeringEvent).toBeNull()
  })

  it('returns true when a high-impact event is in the future window', () => {
    const r = isInBlackout(now, [evt(30)], ['high'], 60_000)
    expect(r.inBlackout).toBe(true)
    expect(r.triggeringEvent?.id).toBe('e')
    expect(r.msToEvent).toBe(30_000)
  })

  it('returns true when a high-impact event was within the past window', () => {
    const r = isInBlackout(now, [evt(-30)], ['high'], 60_000)
    expect(r.inBlackout).toBe(true)
    expect(r.msToEvent).toBe(-30_000)
  })

  it('filters by impact — med events do not trigger a high-only blackout', () => {
    const r = isInBlackout(now, [evt(10, 'med'), evt(20, 'med')], ['high'], 60_000)
    expect(r.inBlackout).toBe(false)
  })

  it('picks the closest event when multiple are inside the window', () => {
    const r = isInBlackout(now, [evt(50, 'high', 'far'), evt(10, 'high', 'near')], ['high'], 60_000)
    expect(r.triggeringEvent?.id).toBe('near')
  })

  it('treats events exactly at the window boundary as INSIDE', () => {
    const r = isInBlackout(now, [evt(60)], ['high'], 60_000)
    expect(r.inBlackout).toBe(true)
  })

  it('treats events just outside the window as OUTSIDE', () => {
    const r = isInBlackout(now, [evt(61)], ['high'], 60_000)
    expect(r.inBlackout).toBe(false)
  })

  it('returns false when the impacts array is empty (blackout disabled)', () => {
    const r = isInBlackout(now, [evt(0)], [], 60_000)
    expect(r.inBlackout).toBe(false)
  })

  it('returns false when windowMs is 0', () => {
    const r = isInBlackout(now, [evt(0)], ['high'], 0)
    expect(r.inBlackout).toBe(false)
  })

  it('multi-impact triggers on any matching impact', () => {
    const high = evt(10, 'high', 'h')
    const med = evt(20, 'med', 'm')
    const r = isInBlackout(now, [high, med], ['high', 'med'], 60_000)
    expect(r.inBlackout).toBe(true)
    expect(r.triggeringEvent?.id).toBe('h')
  })

  it('skips events with malformed tsUtc', () => {
    const malformed: MacroEvent = {
      id: 'bad', label: '', cons: '—', actual: '—', impact: 'high', tsUtc: 'not-a-date',
    }
    const r = isInBlackout(now, [malformed], ['high'], 60_000)
    expect(r.inBlackout).toBe(false)
  })
})
