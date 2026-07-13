import { describe, it, expect } from 'vitest'
import { rankTopByDsr, verdictCounts, fmtDsr } from './self-eval-edge'
import type { SelfEvalReport, SelfEvalReportRow } from '@shared/types'

function row(over: Partial<SelfEvalReportRow> = {}): SelfEvalReportRow {
  return {
    strategy: 'brain', symbol: 'NVDA', tradeCount: 12, hitRate: 0.5,
    sharpe: 0.1, maxDrawdown: 0.05, psr: 0.9, dsr: 0.8, minTRL: 200,
    verdict: 'noise', ...over,
  }
}

function report(rows: SelfEvalReportRow[]): SelfEvalReport {
  return { generatedAt: 1_760_000_000_000, trials: rows.length, rows }
}

describe('rankTopByDsr', () => {
  it('orders by DSR descending and takes the top n', () => {
    const rep = report([
      row({ symbol: 'A', dsr: 0.10 }), row({ symbol: 'B', dsr: 0.99 }),
      row({ symbol: 'C', dsr: 0.50 }), row({ symbol: 'D', dsr: 0.75 }),
    ])
    expect(rankTopByDsr(rep).map(r => r.symbol)).toEqual(['B', 'D', 'C'])
  })

  it('null DSR sorts last, never first (unknown is not an edge)', () => {
    const rep = report([
      row({ symbol: 'A', dsr: null }), row({ symbol: 'B', dsr: 0.05 }), row({ symbol: 'C', dsr: 0.6 }),
    ])
    expect(rankTopByDsr(rep).map(r => r.symbol)).toEqual(['C', 'B', 'A'])
  })

  it('tie-breaks DSR ties by PSR desc, then Sharpe desc', () => {
    const rep = report([
      row({ symbol: 'A', dsr: 0.9, psr: 0.91, sharpe: 0.1 }),
      row({ symbol: 'B', dsr: 0.9, psr: 0.95, sharpe: 0.1 }),
      row({ symbol: 'C', dsr: 0.9, psr: 0.91, sharpe: 0.3 }),
    ])
    expect(rankTopByDsr(rep).map(r => r.symbol)).toEqual(['B', 'C', 'A'])
  })

  it('all-null DSR falls back to PSR then Sharpe ordering', () => {
    const rep = report([
      row({ symbol: 'A', dsr: null, psr: null, sharpe: 0.2 }),
      row({ symbol: 'B', dsr: null, psr: 0.9, sharpe: 0.1 }),
      row({ symbol: 'C', dsr: null, psr: null, sharpe: 0.5 }),
    ])
    expect(rankTopByDsr(rep).map(r => r.symbol)).toEqual(['B', 'C', 'A'])
  })

  it('returns fewer than n rows when the report is small', () => {
    expect(rankTopByDsr(report([row()]))).toHaveLength(1)
  })

  it('empty and null reports return [] without throwing', () => {
    expect(rankTopByDsr(null)).toEqual([])
    expect(rankTopByDsr(report([]))).toEqual([])
    expect(rankTopByDsr(report([row()]), 0)).toEqual([])
  })

  it('does not mutate the caller-owned rows array', () => {
    const rep = report([row({ symbol: 'A', dsr: 0.1 }), row({ symbol: 'B', dsr: 0.9 })])
    rankTopByDsr(rep)
    expect(rep.rows.map(r => r.symbol)).toEqual(['A', 'B'])
  })
})

describe('verdictCounts', () => {
  it('tallies each verdict class', () => {
    const rep = report([
      row({ verdict: 'real' }), row({ verdict: 'real' }),
      row({ verdict: 'selection-risk' }), row({ verdict: 'noise' }),
    ])
    expect(verdictCounts(rep)).toEqual({ real: 2, selectionRisk: 1, noise: 1 })
  })

  it('null report counts as all zeros', () => {
    expect(verdictCounts(null)).toEqual({ real: 0, selectionRisk: 0, noise: 0 })
  })
})

describe('fmtDsr', () => {
  it('formats as one-decimal percent', () => {
    expect(fmtDsr(0.9721)).toBe('97.2%')
    expect(fmtDsr(1)).toBe('100.0%')
    expect(fmtDsr(0)).toBe('0.0%')
  })

  it('null / non-finite render n/a — never a fabricated number', () => {
    expect(fmtDsr(null)).toBe('n/a')
    expect(fmtDsr(Number.NaN)).toBe('n/a')
  })
})
