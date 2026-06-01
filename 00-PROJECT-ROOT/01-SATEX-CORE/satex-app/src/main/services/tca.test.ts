import { describe, expect, it } from 'vitest'
import { analyzeTca } from './tca'
import type { ClosedTrade } from '@shared/types'

function trade(over: Partial<ClosedTrade>): ClosedTrade {
  return {
    id: 'x', symbol: 'NVDA', side: 'long', quantity: 100,
    entryPrice: 100, exitPrice: 102, pnl: 200, pnlPct: 0.02,
    holdMs: 60_000, closedAt: Date.UTC(2026, 4, 29, 14, 0),
    triggeredBy: null, source: 'backtest',
    tags: [], conviction: null, regimeAtEntry: null,
    entrySlippageBps: 3,
    ...over,
  }
}

describe('analyzeTca', () => {
  it('returns zero-shaped bucket for empty input', () => {
    const r = analyzeTca([])
    expect(r.overall.trades).toBe(0)
    expect(r.overall.avgBps).toBe(0)
    expect(r.excluded).toBe(0)
  })

  it('computes avg/median/worst/best across mixed trades', () => {
    const r = analyzeTca([
      trade({ entrySlippageBps: 5 }),
      trade({ entrySlippageBps: 3 }),
      trade({ entrySlippageBps: 1 }),
      trade({ entrySlippageBps: 7 }),
    ])
    expect(r.overall.trades).toBe(4)
    expect(r.overall.avgBps).toBe(4)
    expect(r.overall.medianBps).toBe(4)
    expect(r.overall.worstBps).toBe(7)
    expect(r.overall.bestBps).toBe(1)
  })

  it('groups by symbol', () => {
    const r = analyzeTca([
      trade({ symbol: 'NVDA', entrySlippageBps: 3 }),
      trade({ symbol: 'AAPL', entrySlippageBps: 5 }),
    ])
    expect(r.bySymbol.NVDA!.trades).toBe(1)
    expect(r.bySymbol.AAPL!.trades).toBe(1)
    expect(r.bySymbol.AAPL!.avgBps).toBe(5)
  })

  it('groups by UTC hour of closedAt', () => {
    const r = analyzeTca([
      trade({ closedAt: Date.UTC(2026, 4, 29, 14, 0),  entrySlippageBps: 3 }),
      trade({ closedAt: Date.UTC(2026, 4, 29, 14, 30), entrySlippageBps: 5 }),
      trade({ closedAt: Date.UTC(2026, 4, 29, 20, 0),  entrySlippageBps: 2 }),
    ])
    expect(r.byHourUtc[14]!.trades).toBe(2)
    expect(r.byHourUtc[20]!.trades).toBe(1)
  })

  it('splits long vs short', () => {
    const r = analyzeTca([
      trade({ side: 'long',  entrySlippageBps: 3 }),
      trade({ side: 'long',  entrySlippageBps: 4 }),
      trade({ side: 'short', entrySlippageBps: 5 }),
    ])
    expect(r.byDirection.long.trades).toBe(2)
    expect(r.byDirection.short.trades).toBe(1)
  })

  it('counts excluded (no entrySlippageBps) without breaking buckets', () => {
    const r = analyzeTca([
      trade({ entrySlippageBps: 3 }),
      trade({ entrySlippageBps: null }),
    ])
    expect(r.excluded).toBe(1)
    expect(r.overall.trades).toBe(1)
  })

  it('sums totalDollarCost from entry_notional × bps', () => {
    // entry 100 × 100 = $10k notional, 5 bps = $5 cost
    const r = analyzeTca([trade({ entryPrice: 100, quantity: 100, entrySlippageBps: 5 })])
    expect(r.overall.totalDollarCost).toBeCloseTo(5, 4)
  })
})
