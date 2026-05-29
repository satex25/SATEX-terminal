/**
 * SATEX — Backtest metrics tests.
 * Deterministic canned inputs; every exported function covered.
 */
import { describe, expect, it } from 'vitest'
import {
  annualizedReturn, barReturns, sharpe, sortino,
  maxDrawdown, maxDrawdownDollar, maxDrawdownDuration, calmar,
  hitRate, profitFactor, expectancy, computeMetrics,
} from './metrics'
import type { EquityPoint } from './types'
import type { ClosedTrade } from '@shared/types'

const MS_DAY = 86_400_000

function curve(points: Array<[number, number]>): EquityPoint[] {
  return points.map(([ts, equity]) => ({ ts, equity }))
}

function trade(pnl: number, overrides?: Partial<ClosedTrade>): ClosedTrade {
  return {
    id: 'x', symbol: 'NVDA', side: 'long', quantity: 1,
    entryPrice: 100, exitPrice: 100 + pnl, pnl, pnlPct: pnl / 100,
    holdMs: 60_000, closedAt: 0,
    triggeredBy: null, source: 'backtest',
    tags: [], conviction: null, regimeAtEntry: null,
    ...overrides,
  }
}

describe('annualizedReturn', () => {
  it('doubles equity over 1 year = 100%', () => {
    expect(annualizedReturn(100, 200, 365.25 * MS_DAY)).toBeCloseTo(1, 4)
  })
  it('flat equity = 0%', () => {
    expect(annualizedReturn(100, 100, 365.25 * MS_DAY)).toBeCloseTo(0, 6)
  })
  it('zero duration = 0', () => {
    expect(annualizedReturn(100, 200, 0)).toBe(0)
  })
  it('non-positive start = 0', () => {
    expect(annualizedReturn(0, 200, MS_DAY)).toBe(0)
    expect(annualizedReturn(-5, 200, MS_DAY)).toBe(0)
  })
})

describe('barReturns', () => {
  it('computes per-bar simple returns', () => {
    const r = barReturns(curve([[0, 100], [1, 110], [2, 121]]))
    expect(r).toHaveLength(2)
    expect(r[0]).toBeCloseTo(0.10, 6)
    expect(r[1]).toBeCloseTo(0.10, 6)
  })
  it('skips bars where prior equity is zero', () => {
    expect(barReturns(curve([[0, 0], [1, 100]]))).toHaveLength(0)
  })
})

describe('sharpe', () => {
  it('returns 0 when stdev is 0 (flat returns)', () => {
    expect(sharpe(curve([[0, 100], [1, 100], [2, 100]]), 252)).toBe(0)
  })
  it('produces a positive value for monotonically rising equity', () => {
    const c = curve([[0, 100], [1, 101], [2, 102], [3, 103]])
    expect(sharpe(c, 252)).toBeGreaterThan(0)
  })
})

describe('sortino', () => {
  it('returns 0 when no negative returns', () => {
    expect(sortino(curve([[0, 100], [1, 110]]), 252)).toBe(0)
  })
  it('produces a finite value for noisy returns', () => {
    const noisy = curve([[0, 100], [1, 95], [2, 105], [3, 90], [4, 110]])
    expect(Number.isFinite(sortino(noisy, 252))).toBe(true)
  })
})

describe('maxDrawdown', () => {
  it('returns 0 on a monotonically rising curve', () => {
    expect(maxDrawdown(curve([[0, 100], [1, 110], [2, 120]]))).toBe(0)
  })
  it('finds the worst peak-to-trough fraction', () => {
    expect(maxDrawdown(curve([[0, 100], [1, 120], [2, 84], [3, 100]]))).toBeCloseTo(0.30, 6)
  })
})

describe('maxDrawdownDollar', () => {
  it('returns the dollar peak-to-trough', () => {
    expect(maxDrawdownDollar(curve([[0, 100], [1, 120], [2, 84]]))).toBeCloseTo(36, 6)
  })
})

describe('maxDrawdownDuration', () => {
  it('returns 0 when no drawdown', () => {
    expect(maxDrawdownDuration(curve([[0, 100], [1, 110], [2, 120]]))).toBe(0)
  })
  it('measures from peak to recovery', () => {
    expect(maxDrawdownDuration(curve([[0, 100], [10, 120], [15, 100], [20, 110], [30, 125]]))).toBe(20)
  })
  it('measures to end-of-curve when no recovery', () => {
    expect(maxDrawdownDuration(curve([[0, 100], [10, 120], [30, 100]]))).toBe(20)
  })
})

describe('calmar', () => {
  it('returns 0 when drawdown is 0', () => {
    expect(calmar(curve([[0, 100], [365.25 * MS_DAY, 110]]))).toBe(0)
  })
  it('computes annualizedReturn / maxDrawdown for a one-year curve', () => {
    const c = curve([[0, 100], [180 * MS_DAY, 200], [270 * MS_DAY, 100], [365.25 * MS_DAY, 110]])
    const expected = 0.10 / 0.50
    expect(calmar(c)).toBeCloseTo(expected, 2)
  })
})

describe('hitRate / profitFactor / expectancy', () => {
  it('hitRate is wins / total', () => {
    expect(hitRate([trade(10), trade(-5), trade(7)])).toBeCloseTo(2 / 3, 6)
  })
  it('hitRate is 0 on empty list', () => {
    expect(hitRate([])).toBe(0)
  })
  it('profitFactor is sum(wins) / |sum(losses)|', () => {
    expect(profitFactor([trade(10), trade(20), trade(-5)])).toBeCloseTo(6, 4)
  })
  it('profitFactor is Infinity when no losses (and wins exist)', () => {
    expect(profitFactor([trade(10), trade(5)])).toBe(Infinity)
  })
  it('profitFactor is 0 with neither wins nor losses', () => {
    expect(profitFactor([])).toBe(0)
  })
  it('expectancy is average $ per trade', () => {
    expect(expectancy([trade(10), trade(-5), trade(7)])).toBeCloseTo(4, 4)
  })
})

describe('computeMetrics', () => {
  it('rolls every metric into one snapshot', () => {
    const c = curve([[0, 100], [1 * MS_DAY, 110], [2 * MS_DAY, 105], [3 * MS_DAY, 120]])
    const trades = [trade(10), trade(-5), trade(15)]
    const m = computeMetrics(c, trades, 252)
    expect(m.tradeCount).toBe(3)
    expect(m.winCount).toBe(2)
    expect(m.lossCount).toBe(1)
    expect(m.hitRate).toBeCloseTo(2 / 3, 6)
    expect(m.totalReturn).toBeCloseTo(0.20, 6)
    expect(m.largestWinDollar).toBe(15)
    expect(m.largestLossDollar).toBe(-5)
    expect(m.avgWinDollar).toBeCloseTo(12.5, 6)
    expect(m.avgLossDollar).toBe(-5)
  })
  it('handles empty inputs gracefully', () => {
    const m = computeMetrics([], [], 252)
    expect(m.tradeCount).toBe(0)
    expect(m.sharpe).toBe(0)
    expect(m.maxDrawdown).toBe(0)
  })
})
