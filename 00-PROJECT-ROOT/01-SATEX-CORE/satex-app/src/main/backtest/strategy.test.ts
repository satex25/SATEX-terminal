/**
 * SATEX — StrategySnapshot shape tests.
 * Locks in the backwards-compatible extension from Tier-2 E.2 — every
 * optional field is, in fact, optional.
 */
import { describe, expect, it } from 'vitest'
import type { Strategy, StrategySnapshot } from './strategy'

describe('StrategySnapshot — backwards-compatible shape (E.2)', () => {
  it('accepts the minimum (ts/symbol/quote/indicators) without optional fields', () => {
    const snap: StrategySnapshot = {
      ts: 0, symbol: 'NVDA',
      quote: { symbol: 'NVDA', name: 'NVIDIA', assetClass: 'equity',
        last: 100, bid: 99.99, ask: 100.01, prevClose: 100,
        changePct: 0, change: 0, volume: 0, vwap: 100,
        sparkline: [], timestamp: 0 },
      indicators: { symbol: 'NVDA', vwap: 100, ema9: 100, ema21: 100,
        ema50: 100, rsi14: 50, atr14: 1, trendStrength: 0, volatility: 0 },
    }
    expect(snap.multiTimeframe).toBeUndefined()
    expect(snap.regime).toBeUndefined()
    expect(snap.depth).toBeUndefined()
  })

  it('accepts a minimal Strategy implementation', () => {
    class Noop implements Strategy {
      readonly name = 'noop'
      decide(): null { return null }
    }
    expect(new Noop().name).toBe('noop')
  })
})
