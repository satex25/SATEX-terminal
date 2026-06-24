/**
 * SATEX — MacroCalendarService tests.
 * Pre-existing service had no tests — covered just enough here to lock the
 * new checkBlackout method's wiring + the snapshot contract.
 */
import { describe, expect, it } from 'vitest'
import { MacroCalendarService } from './macro-calendar'

describe('MacroCalendarService.checkBlackout', () => {
  it('forwards to the pure isInBlackout — empty impacts → never in blackout', () => {
    const svc = new MacroCalendarService()
    const r = svc.checkBlackout(Date.now(), [], 60_000)
    expect(r.inBlackout).toBe(false)
  })

  it('returns a structured BlackoutResult shape (matches blackout-window API)', () => {
    const svc = new MacroCalendarService()
    const r = svc.checkBlackout(Date.now(), ['high'], 60_000)
    expect(r).toHaveProperty('inBlackout')
    expect(r).toHaveProperty('triggeringEvent')
    expect(r).toHaveProperty('msToEvent')
  })

  it('get() returns a populated snapshot after construction', () => {
    const svc = new MacroCalendarService()
    const snap = svc.get()
    expect(snap.events.length).toBeGreaterThan(0)
    expect(snap.horizonHours).toBeGreaterThan(0)
  })
})
