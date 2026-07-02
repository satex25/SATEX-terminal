import { describe, expect, it } from 'vitest'
import { VolatilityTargetSizing } from './vol-target'
import type { Quote, StrategySignal } from '@shared/types'

function quote(last = 100): Quote {
  return { symbol: 'NVDA', name: 'N', assetClass: 'equity',
    last, bid: last - 0.01, ask: last + 0.01,
    prevClose: last, changePct: 0, change: 0, volume: 0,
    vwap: last, sparkline: [], timestamp: 0 }
}

function sig(confidence = 0.6, atr = 2): StrategySignal {
  return { setup: 't', symbol: 'NVDA', action: 'buy',
    confidence, stopLossHint: 98, takeProfitHint: 104,
    atrHint: atr, createdAt: 0 }
}

describe('VolatilityTargetSizing', () => {
  it('returns 0 when ATR is 0', () => {
    const s = new VolatilityTargetSizing()
    expect(s.size({ signal: sig(0.6, 0), quote: quote(), equity: 100_000 }).notional).toBe(0)
  })

  it('returns 0 when equity is 0', () => {
    const s = new VolatilityTargetSizing()
    expect(s.size({ signal: sig(0.6, 2), quote: quote(), equity: 0 }).notional).toBe(0)
  })

  it('scales DOWN with higher vol (high ATR symbol gets smaller size)', () => {
    const s = new VolatilityTargetSizing()
    const low  = s.size({ signal: sig(0.6, 1), quote: quote(), equity: 100_000 })
    const high = s.size({ signal: sig(0.6, 5), quote: quote(), equity: 100_000 })
    expect(high.notional).toBeLessThan(low.notional)
  })

  it('scales DOWN with lower confidence', () => {
    const s = new VolatilityTargetSizing()
    const lo = s.size({ signal: sig(0.3, 2), quote: quote(), equity: 100_000 })
    const hi = s.size({ signal: sig(0.9, 2), quote: quote(), equity: 100_000 })
    expect(hi.notional).toBeGreaterThan(lo.notional)
  })

  it('caps at maxFraction of equity', () => {
    const s = new VolatilityTargetSizing({ maxFraction: 0.05 })
    const r = s.size({ signal: sig(1.0, 0.1), quote: quote(), equity: 100_000 })
    expect(r.notional).toBeLessThanOrEqual(100_000 * 0.05 + 100)
  })

  it('floors at minNotional', () => {
    const s = new VolatilityTargetSizing({ minNotional: 1000 })
    const r = s.size({ signal: sig(0.1, 50), quote: quote(), equity: 100_000 })
    expect(r.notional).toBeGreaterThanOrEqual(1000 - 100)
  })

  it('quantity is always >= 1 when notional is sized', () => {
    const s = new VolatilityTargetSizing()
    const r = s.size({ signal: sig(0.6, 2), quote: quote(100_000), equity: 100_000 })
    expect(r.quantity).toBeGreaterThanOrEqual(1)
  })

  it('reports name = "vol-target"', () => {
    expect(new VolatilityTargetSizing().name).toBe('vol-target')
  })
})
