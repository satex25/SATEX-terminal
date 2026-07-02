import { describe, it, expect } from 'vitest'
import type { ClosedTrade } from '@shared/types'
import { computeJournalAggregates } from './journalStore'

/**
 * Regression net for `computeJournalAggregates` — the pure display-aggregation
 * function behind the trading-journal panel (win rate, conviction buckets,
 * per-regime P&L, mean entry slippage, best/worst tag). It is read on every
 * session yet shipped with zero co-located coverage; these tests pin its
 * current contract so a future refactor can't silently regress the operator's
 * journal stats (the P-042 zero-coverage-close pattern — new file only, no
 * source edit). Found via the work-layer code-audit coverage-gap sweep (P-047).
 */

function trade(over: Partial<ClosedTrade> = {}): ClosedTrade {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    symbol: 'NVDA',
    side: 'long',
    quantity: 1,
    entryPrice: 100,
    exitPrice: 101,
    pnl: 0,
    pnlPct: 0,
    holdMs: 1000,
    closedAt: 0,
    triggeredBy: null,
    source: 'ticket',
    tags: [],
    conviction: null,
    regimeAtEntry: null,
    ...over,
  }
}

describe('computeJournalAggregates — empty / degenerate', () => {
  it('returns a fully-zeroed aggregate for no trades', () => {
    const a = computeJournalAggregates([])
    expect(a.count).toBe(0)
    expect(a.wins).toBe(0)
    expect(a.losses).toBe(0)
    expect(a.winRate).toBe(0)
    expect(a.totalPnl).toBe(0)
    expect(a.highConvPnl).toBe(0)
    expect(a.lowConvPnl).toBe(0)
    expect(a.bestTag).toBeNull()
    expect(a.worstTag).toBeNull()
    expect(a.avgEntrySlipBps).toBeNull()
    expect(a.byRegime).toEqual([])
  })

  it('does not produce NaN when every trade is breakeven (pnl === 0)', () => {
    const a = computeJournalAggregates([trade({ pnl: 0 }), trade({ pnl: 0 })])
    expect(a.count).toBe(2)
    expect(a.wins).toBe(0)
    expect(a.losses).toBe(0)
    // wins / (wins + losses || 1) === 0 / 1 — guarded against divide-by-zero.
    expect(a.winRate).toBe(0)
    expect(Number.isNaN(a.winRate)).toBe(false)
  })
})

describe('computeJournalAggregates — win/loss accounting', () => {
  it('counts wins/losses and excludes breakevens from the win-rate denominator', () => {
    const a = computeJournalAggregates([
      trade({ pnl: 100 }),
      trade({ pnl: 50 }),
      trade({ pnl: -40 }),
      trade({ pnl: 0 }), // breakeven — not a win, not a loss
    ])
    expect(a.count).toBe(4)
    expect(a.wins).toBe(2)
    expect(a.losses).toBe(1)
    expect(a.totalPnl).toBe(110)
    // 2 / (2 + 1) — the breakeven is excluded from both sides.
    expect(a.winRate).toBeCloseTo(2 / 3, 10)
  })

  it('reports a 1.0 win rate when there are wins and only breakevens otherwise', () => {
    const a = computeJournalAggregates([trade({ pnl: 10 }), trade({ pnl: 0 })])
    expect(a.winRate).toBe(1)
  })
})

describe('computeJournalAggregates — conviction buckets', () => {
  it('buckets pnl into high (>=7) and low (<=4), ignoring the middle and nulls', () => {
    const a = computeJournalAggregates([
      trade({ pnl: 100, conviction: 9 }),  // high
      trade({ pnl: -30, conviction: 2 }),  // low
      trade({ pnl: 20, conviction: 5 }),   // neither (5 is between 4 and 7)
      trade({ pnl: 5, conviction: null }), // ignored
    ])
    expect(a.highConvPnl).toBe(100)
    expect(a.lowConvPnl).toBe(-30)
  })
})

describe('computeJournalAggregates — slippage', () => {
  it('averages only finite slippage values; null when none captured', () => {
    const a = computeJournalAggregates([
      trade({ entrySlippageBps: 2 }),
      trade({ entrySlippageBps: 4 }),
      trade({ entrySlippageBps: null }),
      trade({}), // undefined
    ])
    expect(a.avgEntrySlipBps).toBeCloseTo(3, 10)
  })

  it('returns null avgEntrySlipBps when no trade has a captured value', () => {
    const a = computeJournalAggregates([trade({}), trade({ entrySlippageBps: null })])
    expect(a.avgEntrySlipBps).toBeNull()
  })
})

describe('computeJournalAggregates — per-regime breakdown', () => {
  it('buckets by regime, maps null to UNKNOWN, and sorts by totalPnl desc', () => {
    const a = computeJournalAggregates([
      trade({ regimeAtEntry: 'EXPANSION', pnl: 200 }),
      trade({ regimeAtEntry: 'COMPRESSION', pnl: -100 }),
      trade({ regimeAtEntry: null, pnl: 50 }),
    ])
    expect(a.byRegime.map(r => r.regime)).toEqual(['EXPANSION', 'UNKNOWN', 'COMPRESSION'])
    expect(a.byRegime[0]).toMatchObject({ regime: 'EXPANSION', count: 1, totalPnl: 200, winRate: 1 })
    const compression = a.byRegime.find(r => r.regime === 'COMPRESSION')!
    expect(compression).toMatchObject({ count: 1, totalPnl: -100, winRate: 0 })
  })

  it('computes per-regime win rate excluding breakevens', () => {
    const a = computeJournalAggregates([
      trade({ regimeAtEntry: 'EXPANSION', pnl: 10 }),
      trade({ regimeAtEntry: 'EXPANSION', pnl: -5 }),
      trade({ regimeAtEntry: 'EXPANSION', pnl: 0 }), // breakeven excluded from denom
    ])
    const exp = a.byRegime.find(r => r.regime === 'EXPANSION')!
    expect(exp.count).toBe(3)
    expect(exp.winRate).toBeCloseTo(1 / 2, 10)
  })
})

describe('computeJournalAggregates — best/worst tag', () => {
  it('accumulates pnl per tag and picks best/worst', () => {
    const a = computeJournalAggregates([
      trade({ tags: ['momentum'], pnl: 100 }),
      trade({ tags: ['reversal'], pnl: -50 }),
    ])
    expect(a.bestTag).toEqual({ tag: 'momentum', pnl: 100 })
    expect(a.worstTag).toEqual({ tag: 'reversal', pnl: -50 })
  })

  it('adds a trade pnl to every tag it carries', () => {
    const a = computeJournalAggregates([
      trade({ tags: ['a', 'b'], pnl: 100 }),
      trade({ tags: ['b'], pnl: 100 }),
    ])
    // 'b' appears on both trades -> 200; 'a' only on the first -> 100.
    expect(a.bestTag).toEqual({ tag: 'b', pnl: 200 })
    expect(a.worstTag).toEqual({ tag: 'a', pnl: 100 })
  })

  it('suppresses worstTag when only one distinct tag exists (best === worst)', () => {
    const a = computeJournalAggregates([
      trade({ tags: ['solo'], pnl: 30 }),
      trade({ tags: ['solo'], pnl: -10 }),
    ])
    expect(a.bestTag).toEqual({ tag: 'solo', pnl: 20 })
    expect(a.worstTag).toBeNull()
  })
})
