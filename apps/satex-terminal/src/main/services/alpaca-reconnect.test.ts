import { describe, it, expect } from 'vitest'
import { computeReconnectDelay, ALPACA_RECONNECT } from './alpaca-reconnect'

/** Round to int — backoff math uses floats, asserts care about the shape. */
const ms = (v: number): number => Math.round(v)

describe('computeReconnectDelay — Alpaca WS reconnect backoff with 406 cooldown', () => {
  it('returns MIN_BACKOFF_MS on the first attempt with no cooldown', () => {
    const d = computeReconnectDelay({ attempts: 0, cooldownUntilMs: 0, nowMs: 1_000_000 })
    expect(ms(d)).toBe(ALPACA_RECONNECT.MIN_BACKOFF_MS)
  })

  it('doubles each attempt up to the MAX cap', () => {
    const base = ALPACA_RECONNECT.MIN_BACKOFF_MS
    expect(ms(computeReconnectDelay({ attempts: 0, cooldownUntilMs: 0, nowMs: 0 }))).toBe(base)
    expect(ms(computeReconnectDelay({ attempts: 1, cooldownUntilMs: 0, nowMs: 0 }))).toBe(base * 2)
    expect(ms(computeReconnectDelay({ attempts: 2, cooldownUntilMs: 0, nowMs: 0 }))).toBe(base * 4)
    expect(ms(computeReconnectDelay({ attempts: 3, cooldownUntilMs: 0, nowMs: 0 }))).toBe(base * 8)
    expect(ms(computeReconnectDelay({ attempts: 4, cooldownUntilMs: 0, nowMs: 0 }))).toBe(base * 16)
    // After this, capped:
    expect(ms(computeReconnectDelay({ attempts: 6, cooldownUntilMs: 0, nowMs: 0 }))).toBe(ALPACA_RECONNECT.MAX_BACKOFF_MS)
    expect(ms(computeReconnectDelay({ attempts: 99, cooldownUntilMs: 0, nowMs: 0 }))).toBe(ALPACA_RECONNECT.MAX_BACKOFF_MS)
  })

  it('honors an active 406 cooldown when it exceeds the backoff', () => {
    // Attempt 0 → 1s backoff; cooldown 30s in the future → cooldown wins.
    const d = computeReconnectDelay({ attempts: 0, cooldownUntilMs: 30_000, nowMs: 0 })
    expect(ms(d)).toBe(30_000)
  })

  it('honors the backoff when it exceeds a near-expired cooldown', () => {
    // Attempt 10 → capped 30s backoff; cooldown only 2s in the future → backoff wins.
    const d = computeReconnectDelay({ attempts: 10, cooldownUntilMs: 2_000, nowMs: 0 })
    expect(ms(d)).toBe(ALPACA_RECONNECT.MAX_BACKOFF_MS)
  })

  it('ignores a cooldown that has already passed', () => {
    // cooldownUntilMs is in the PAST relative to nowMs → cooldown remaining is 0.
    const d = computeReconnectDelay({ attempts: 0, cooldownUntilMs: 500, nowMs: 10_000 })
    expect(ms(d)).toBe(ALPACA_RECONNECT.MIN_BACKOFF_MS)
  })

  it('clamps negative attempts to 0 (defensive — never overflow Math.pow)', () => {
    const d = computeReconnectDelay({ attempts: -5, cooldownUntilMs: 0, nowMs: 0 })
    expect(ms(d)).toBe(ALPACA_RECONNECT.MIN_BACKOFF_MS)
  })

  it('CONNECTION_LIMIT_COOLDOWN_MS matches the 60s contract documented in alpaca.ts', () => {
    // The equity WS hard-codes 60_000 today; the helper exports this value for
    // crypto/account WS to share. If we ever change one, the test forces a sync.
    expect(ALPACA_RECONNECT.CONNECTION_LIMIT_COOLDOWN_MS).toBe(60_000)
  })
})
