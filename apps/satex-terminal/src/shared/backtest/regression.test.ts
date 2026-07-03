import { describe, expect, it } from 'vitest'
import { compareReports, DEFAULT_TOLERANCES } from './regression'
import type { BacktestReport, BacktestMetrics } from './types'

function metrics(over?: Partial<BacktestMetrics>): BacktestMetrics {
  return {
    totalReturn: 0.10, annualizedReturn: 0.20,
    sharpe: 1.5, sortino: 2.0, calmar: 2.5,
    maxDrawdown: 0.08, maxDrawdownDollar: 800, maxDrawdownDuration: 86_400_000,
    hitRate: 0.55, profitFactor: 1.8, expectancy: 25,
    tradeCount: 50, winCount: 28, lossCount: 22,
    avgWinDollar: 100, avgLossDollar: -50,
    largestWinDollar: 400, largestLossDollar: -150,
    ...over,
  }
}

function report(m: BacktestMetrics): BacktestReport {
  return {
    config: { strategy: 'test', symbol: 'NVDA', tape: 'x',
      startingEquity: 100_000, slippageModel: 'zero' },
    startedAt: 0, endedAt: 0,
    startingEquity: 100_000, endingEquity: 110_000,
    equityCurve: [], trades: [], metrics: m,
  }
}

describe('compareReports', () => {
  it('passes when current matches baseline', () => {
    const r = compareReports(report(metrics()), report(metrics()))
    expect(r.ok).toBe(true)
    expect(r.violations).toEqual([])
  })

  it('flags trade-count drift', () => {
    const r = compareReports(report(metrics()), report(metrics({ tradeCount: 60 })))
    expect(r.ok).toBe(false)
    expect(r.violations[0]).toContain('trade count')
  })

  it('flags Sharpe drift in either direction', () => {
    const up   = compareReports(report(metrics()), report(metrics({ sharpe: 2.5 })))
    const down = compareReports(report(metrics()), report(metrics({ sharpe: 0.5 })))
    expect(up.violations[0]).toContain('Sharpe')
    expect(down.violations[0]).toContain('Sharpe')
  })

  it('flags maxDrawdown WORSENING but tolerates IMPROVEMENT', () => {
    const worse  = compareReports(report(metrics()), report(metrics({ maxDrawdown: 0.20 })))
    const better = compareReports(report(metrics()), report(metrics({ maxDrawdown: 0.04 })))
    expect(worse.ok).toBe(false)
    expect(better.ok).toBe(true)
  })

  it('flags hit-rate drift in either direction', () => {
    const r = compareReports(report(metrics()), report(metrics({ hitRate: 0.40 })))
    expect(r.ok).toBe(false)
  })

  it('exports DEFAULT_TOLERANCES', () => {
    expect(DEFAULT_TOLERANCES.tradeTolerance).toBe(2)
  })

  it('returns multiple violations when several metrics drift at once', () => {
    const r = compareReports(report(metrics()), report(metrics({
      tradeCount: 70, sharpe: 0.3, maxDrawdown: 0.25, hitRate: 0.30,
    })))
    expect(r.ok).toBe(false)
    expect(r.violations.length).toBeGreaterThanOrEqual(4)
  })
})
