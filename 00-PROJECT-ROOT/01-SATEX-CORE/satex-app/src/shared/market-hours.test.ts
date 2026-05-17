import { describe, it, expect } from 'vitest'
import {
  isUsEquityMarketOpen,
  mostRecentClosedSessionDate,
  mostRecentFridayDate,
  previousTradingDate,
} from './market-hours'

// All Date constructors below use UTC ISO strings. Offsets:
//   EDT (Mar-Nov, e.g. May) = UTC-4
//   EST (Nov-Mar, e.g. Jan) = UTC-5

describe('isUsEquityMarketOpen', () => {
  it('open at 09:30 ET on a weekday (lower bound, inclusive)', () => {
    expect(isUsEquityMarketOpen(new Date('2026-05-15T13:30:00Z'))).toBe(true)  // Fri 09:30 EDT
  })

  it('closed at 09:29 ET on a weekday (one minute before bell)', () => {
    expect(isUsEquityMarketOpen(new Date('2026-05-15T13:29:00Z'))).toBe(false) // Fri 09:29 EDT
  })

  it('open at 15:59 ET on a weekday (upper bound, exclusive on 16:00)', () => {
    expect(isUsEquityMarketOpen(new Date('2026-05-15T19:59:00Z'))).toBe(true)  // Fri 15:59 EDT
  })

  it('closed at 16:00 ET on a weekday (upper bound, exclusive)', () => {
    expect(isUsEquityMarketOpen(new Date('2026-05-15T20:00:00Z'))).toBe(false) // Fri 16:00 EDT
  })

  it('closed on Saturday at noon ET', () => {
    expect(isUsEquityMarketOpen(new Date('2026-05-16T16:00:00Z'))).toBe(false) // Sat 12:00 EDT
  })

  it('closed on Sunday at noon ET', () => {
    expect(isUsEquityMarketOpen(new Date('2026-05-17T16:00:00Z'))).toBe(false) // Sun 12:00 EDT
  })

  it('open at noon ET on a weekday during EST (winter, UTC-5)', () => {
    expect(isUsEquityMarketOpen(new Date('2026-01-15T17:00:00Z'))).toBe(true)  // Thu 12:00 EST
  })
})

describe('mostRecentClosedSessionDate', () => {
  it('Sunday noon ET → previous Friday', () => {
    expect(mostRecentClosedSessionDate(new Date('2026-05-17T16:00:00Z'))).toBe('2026-05-15')
  })

  it('Saturday noon ET → previous Friday', () => {
    expect(mostRecentClosedSessionDate(new Date('2026-05-16T16:00:00Z'))).toBe('2026-05-15')
  })

  it('Weekday before market open → previous trading day', () => {
    // Fri 08:00 EDT — today is a weekday but RTH has not closed yet
    expect(mostRecentClosedSessionDate(new Date('2026-05-15T12:00:00Z'))).toBe('2026-05-14')
  })

  it('Weekday during RTH → previous trading day', () => {
    // Fri 12:00 EDT — today is still trading, don't reference it
    expect(mostRecentClosedSessionDate(new Date('2026-05-15T16:00:00Z'))).toBe('2026-05-14')
  })

  it('Weekday after close → today', () => {
    // Fri 17:00 EDT — RTH closed, so today IS the most recent closed session
    expect(mostRecentClosedSessionDate(new Date('2026-05-15T21:00:00Z'))).toBe('2026-05-15')
  })

  it('Monday before open → previous Friday', () => {
    // Mon 08:00 EDT 2026-05-18 → most recent closed session = Fri 2026-05-15
    expect(mostRecentClosedSessionDate(new Date('2026-05-18T12:00:00Z'))).toBe('2026-05-15')
  })

  it('Winter (EST) — Thursday after close → today', () => {
    // Thu 17:00 EST 2026-01-15
    expect(mostRecentClosedSessionDate(new Date('2026-01-15T22:00:00Z'))).toBe('2026-01-15')
  })

  it('Winter (EST) — Sunday noon → previous Friday', () => {
    // Sun 12:00 EST 2026-01-18 → Fri 2026-01-16
    expect(mostRecentClosedSessionDate(new Date('2026-01-18T17:00:00Z'))).toBe('2026-01-16')
  })
})

describe('previousTradingDate', () => {
  it('Monday → previous Friday', () => {
    // Mon 2026-05-18 10:00 EDT → Fri 2026-05-15
    expect(previousTradingDate(new Date('2026-05-18T14:00:00Z'))).toBe('2026-05-15')
  })

  it('Tuesday → previous Monday', () => {
    expect(previousTradingDate(new Date('2026-05-19T14:00:00Z'))).toBe('2026-05-18')
  })

  it('Sunday → previous Friday', () => {
    expect(previousTradingDate(new Date('2026-05-17T14:00:00Z'))).toBe('2026-05-15')
  })

  it('Saturday → previous Friday', () => {
    expect(previousTradingDate(new Date('2026-05-16T14:00:00Z'))).toBe('2026-05-15')
  })

  it('Friday during RTH → previous Thursday', () => {
    expect(previousTradingDate(new Date('2026-05-15T14:00:00Z'))).toBe('2026-05-14')
  })
})

describe('mostRecentFridayDate', () => {
  it('Sunday → that Friday (2 days ago)', () => {
    expect(mostRecentFridayDate(new Date('2026-05-17T14:00:00Z'))).toBe('2026-05-15')
  })

  it('Monday → previous Friday', () => {
    expect(mostRecentFridayDate(new Date('2026-05-18T14:00:00Z'))).toBe('2026-05-15')
  })

  it('Wednesday → previous Friday (5 days ago)', () => {
    expect(mostRecentFridayDate(new Date('2026-05-20T14:00:00Z'))).toBe('2026-05-15')
  })

  it('Friday during RTH → previous Friday (7 days ago)', () => {
    // Today is a Friday but we want the PREVIOUS Friday strictly before.
    expect(mostRecentFridayDate(new Date('2026-05-15T14:00:00Z'))).toBe('2026-05-08')
  })
})
