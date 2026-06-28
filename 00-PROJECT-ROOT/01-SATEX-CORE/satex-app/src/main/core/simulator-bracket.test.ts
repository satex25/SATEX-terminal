import { describe, it, expect } from 'vitest'
import { checkBracketHit } from './simulator-bracket'
import type { Position } from '@shared/types'

function makePos(overrides: Partial<Position>): Position {
  return {
    symbol: 'AAPL', quantity: 10, avgPrice: 100,
    unrealizedPnl: 0, realizedPnl: 0, openedAt: Date.now(),
    ...overrides,
  }
}

// ── Long positions ───────────────────────────────────────────────────────────

describe('checkBracketHit – long positions', () => {
  it('returns null when price is between levels', () => {
    const pos = makePos({ quantity: 10, stopLoss: 95, takeProfit: 110 })
    expect(checkBracketHit(pos, 100)).toBeNull()
  })

  it('fires stopLoss when price drops to exactly the level', () => {
    const pos = makePos({ quantity: 10, stopLoss: 95, takeProfit: 110 })
    const hit = checkBracketHit(pos, 95)
    expect(hit).toEqual({ level: 'stopLoss', closeSide: 'sell', price: 95 })
  })

  it('fires stopLoss when price drops below the level', () => {
    const pos = makePos({ quantity: 10, stopLoss: 95, takeProfit: 110 })
    const hit = checkBracketHit(pos, 93)
    expect(hit).toEqual({ level: 'stopLoss', closeSide: 'sell', price: 95 })
  })

  it('fires takeProfit when price rises to exactly the level', () => {
    const pos = makePos({ quantity: 10, stopLoss: 95, takeProfit: 110 })
    const hit = checkBracketHit(pos, 110)
    expect(hit).toEqual({ level: 'takeProfit', closeSide: 'sell', price: 110 })
  })

  it('fires takeProfit when price rises above the level', () => {
    const pos = makePos({ quantity: 10, stopLoss: 95, takeProfit: 110 })
    const hit = checkBracketHit(pos, 115)
    expect(hit).toEqual({ level: 'takeProfit', closeSide: 'sell', price: 110 })
  })

  it('stopLoss takes priority when both levels hit simultaneously', () => {
    // A gap-down that somehow crossed both (degenerate but must not panic)
    const pos = makePos({ quantity: 10, stopLoss: 95, takeProfit: 80 })
    const hit = checkBracketHit(pos, 78)
    expect(hit).toEqual({ level: 'stopLoss', closeSide: 'sell', price: 95 })
  })

  it('returns null when no bracket levels are set', () => {
    const pos = makePos({ quantity: 10 })
    expect(checkBracketHit(pos, 90)).toBeNull()
  })

  it('checks only stopLoss when takeProfit is absent', () => {
    const pos = makePos({ quantity: 10, stopLoss: 95 })
    expect(checkBracketHit(pos, 90)).toEqual({ level: 'stopLoss', closeSide: 'sell', price: 95 })
    expect(checkBracketHit(pos, 105)).toBeNull()
  })

  it('checks only takeProfit when stopLoss is absent', () => {
    const pos = makePos({ quantity: 10, takeProfit: 110 })
    expect(checkBracketHit(pos, 115)).toEqual({ level: 'takeProfit', closeSide: 'sell', price: 110 })
    expect(checkBracketHit(pos, 100)).toBeNull()
  })
})

// ── Short positions ──────────────────────────────────────────────────────────

describe('checkBracketHit – short positions', () => {
  it('returns null when price is between levels', () => {
    // Short entered at 100: SL above (105), TP below (90)
    const pos = makePos({ quantity: -10, stopLoss: 105, takeProfit: 90 })
    expect(checkBracketHit(pos, 100)).toBeNull()
  })

  it('fires stopLoss when price rises to the level', () => {
    const pos = makePos({ quantity: -10, stopLoss: 105, takeProfit: 90 })
    const hit = checkBracketHit(pos, 105)
    expect(hit).toEqual({ level: 'stopLoss', closeSide: 'buy', price: 105 })
  })

  it('fires takeProfit when price drops to the level', () => {
    const pos = makePos({ quantity: -10, stopLoss: 105, takeProfit: 90 })
    const hit = checkBracketHit(pos, 90)
    expect(hit).toEqual({ level: 'takeProfit', closeSide: 'buy', price: 90 })
  })

  it('stopLoss takes priority for shorts when both hit', () => {
    // Extreme gap-up: above both SL and a degenerate TP
    const pos = makePos({ quantity: -10, stopLoss: 105, takeProfit: 110 })
    const hit = checkBracketHit(pos, 112)
    expect(hit).toEqual({ level: 'stopLoss', closeSide: 'buy', price: 105 })
  })
})

// ── Edge cases ───────────────────────────────────────────────────────────────

describe('checkBracketHit – edge cases', () => {
  it('returns null when quantity is zero', () => {
    const pos = makePos({ quantity: 0, stopLoss: 95, takeProfit: 110 })
    expect(checkBracketHit(pos, 90)).toBeNull()
  })
})
