import { describe, expect, it } from 'vitest'
import { computePayoutMetrics, EMPTY_PAYOUT_METRICS, type DailyPnlEntry } from './payout-metrics'
import { TOPSTEP_50K_XFA } from './topstep-50k-xfa'

function entry(date: string, pnl: number, tradeCount = 1): DailyPnlEntry {
  return { date, realizedPnl: pnl, tradeCount, updatedAt: 0 }
}

describe('computePayoutMetrics', () => {
  it('returns zeroed metrics for empty ledger', () => {
    const m = computePayoutMetrics([], TOPSTEP_50K_XFA)
    expect(m.totalProfit).toBe(0)
    expect(m.consistencyRatio).toBe(0)
    expect(m.profitTargetReached).toBe(false)
    expect(m.tradingDaysCount).toBe(0)
  })

  it('sums only profitable days into totalProfit', () => {
    const m = computePayoutMetrics([
      entry('2026-05-27', 500),
      entry('2026-05-28', -200),  // loss excluded
      entry('2026-05-29', 700),
    ], TOPSTEP_50K_XFA)
    expect(m.totalProfit).toBe(1200)
    expect(m.largestProfitableDay).toBe(700)
  })

  it('consistencyRatio = largestDay / totalProfit', () => {
    const m = computePayoutMetrics([
      entry('2026-05-27', 500),
      entry('2026-05-28', 1500),
    ], TOPSTEP_50K_XFA)
    expect(m.consistencyRatio).toBeCloseTo(1500 / 2000, 4)
  })

  it('consistencyOk always true when profile.consistencyMaxDayFraction == 0 (XFA Combine)', () => {
    const m = computePayoutMetrics([entry('2026-05-27', 5000)], TOPSTEP_50K_XFA)
    expect(m.consistencyOk).toBe(true)
  })

  it('consistencyOk false when ratio exceeds threshold (simulated funded profile)', () => {
    const fundedLike = { ...TOPSTEP_50K_XFA, consistencyMaxDayFraction: 0.5 }
    const m = computePayoutMetrics([
      entry('2026-05-27', 500),
      entry('2026-05-28', 1500),
    ], fundedLike)
    expect(m.consistencyOk).toBe(false) // 0.75 > 0.5
  })

  it('profitTargetProgress in [0,1]; profitTargetReached at boundary', () => {
    const m = computePayoutMetrics([entry('2026-05-29', 3000)], TOPSTEP_50K_XFA)
    expect(m.profitTargetProgress).toBe(1)
    expect(m.profitTargetReached).toBe(true)
  })

  it('profitTargetProgress partial', () => {
    const m = computePayoutMetrics([entry('2026-05-29', 1500)], TOPSTEP_50K_XFA)
    expect(m.profitTargetProgress).toBe(0.5)
    expect(m.profitTargetReached).toBe(false)
  })

  it('counts trading days as entries with tradeCount > 0', () => {
    const m = computePayoutMetrics([
      entry('2026-05-27', 100, 1),
      entry('2026-05-28', 0,   0), // not a trading day
      entry('2026-05-29', 200, 3),
    ], TOPSTEP_50K_XFA)
    expect(m.tradingDaysCount).toBe(2)
  })

  it('minDaysSatisfied always true for Topstep XFA (minTradingDays=0)', () => {
    const m = computePayoutMetrics([], TOPSTEP_50K_XFA)
    expect(m.minDaysSatisfied).toBe(true)
  })

  it('minDaysSatisfied false when below threshold (simulated profile)', () => {
    const stricter = { ...TOPSTEP_50K_XFA, minTradingDays: 5 }
    const m = computePayoutMetrics([
      entry('2026-05-27', 100), entry('2026-05-28', 100),
    ], stricter)
    expect(m.minDaysSatisfied).toBe(false)
  })

  it('exports EMPTY_PAYOUT_METRICS constant', () => {
    expect(EMPTY_PAYOUT_METRICS.totalProfit).toBe(0)
  })
})
