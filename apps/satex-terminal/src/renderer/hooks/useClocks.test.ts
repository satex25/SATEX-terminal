/**
 * SATEX — useClocks / formatInZone tests.
 *
 * Pins the DST-correct local-clock formatter that replaced the old naive UTC−6
 * CST: a fixed instant renders at the right wall-clock in several trading
 * zones, and an unresolvable zone falls back to UTC wall-clock rather than
 * throwing (defends the minimal-ICU runtimes some CI nodes ship). The React
 * hook itself is a thin setInterval wrapper — the interesting logic is the pure
 * helper, tested here without jsdom.
 */
import { describe, it, expect } from 'vitest'
import { formatInZone } from './useClocks'

// 2026-07-16T10:31:40Z — a summer instant, so DST-observing zones are shifted.
const T = new Date('2026-07-16T10:31:40Z')

describe('formatInZone', () => {
  it('formats UTC wall-clock', () => {
    expect(formatInZone(T, 'UTC')).toBe('10:31:40')
  })

  it('applies US Eastern daylight offset (UTC−4 in July)', () => {
    expect(formatInZone(T, 'America/New_York')).toBe('06:31:40')
  })

  it('applies US Central daylight offset (UTC−5 in July)', () => {
    expect(formatInZone(T, 'America/Chicago')).toBe('05:31:40')
  })

  it('applies Tokyo offset (UTC+9, no DST)', () => {
    expect(formatInZone(T, 'Asia/Tokyo')).toBe('19:31:40')
  })

  it('falls back to UTC wall-clock for an unresolvable zone (no throw)', () => {
    expect(formatInZone(T, 'Totally/Bogus')).toBe('10:31:40')
  })

  it('always returns a HH:MM:SS string', () => {
    expect(formatInZone(T, 'Australia/Sydney')).toMatch(/^\d{2}:\d{2}:\d{2}$/)
  })
})
