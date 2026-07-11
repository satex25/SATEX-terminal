/**
 * SATEX — Reporter tests.
 * Structural assertions only — exact-string matches would be brittle.
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  formatReportConsole, formatReportMd, msToHuman, persistReportJson,
} from './reporter'
import type { BacktestReport } from '@shared/backtest/types'

function sampleReport(over?: Partial<BacktestReport>): BacktestReport {
  return {
    config: {
      strategy: 'brain', symbol: 'NVDA', tape: 'in-mem',
      startingEquity: 100_000, slippageModel: 'zero', notionalPct: 0.05,
    },
    startedAt: 1_700_000_000_000,
    endedAt:   1_700_000_001_000,
    startingEquity: 100_000,
    endingEquity:   112_500,
    equityCurve: [
      { ts: 1_700_000_000_000, equity: 100_000 },
      { ts: 1_700_086_400_000, equity: 112_500 },
    ],
    trades: [],
    metrics: {
      totalReturn: 0.125, annualizedReturn: 0.45,
      sharpe: 1.8, sortino: 2.1, calmar: 3.0,
      maxDrawdown: 0.05, maxDrawdownDollar: 5000, maxDrawdownDuration: 60 * 60_000,
      hitRate: 0.55, profitFactor: 1.8, expectancy: 12.5,
      tradeCount: 10, winCount: 6, lossCount: 4,
      avgWinDollar: 50, avgLossDollar: -25,
      largestWinDollar: 200, largestLossDollar: -75,
    },
    ...over,
  }
}

describe('msToHuman', () => {
  it('returns dash for 0 or negative', () => {
    expect(msToHuman(0)).toBe('—')
    expect(msToHuman(-1)).toBe('—')
  })
  it('formats seconds', () => {
    expect(msToHuman(45_000)).toBe('45s')
  })
  it('formats minutes + seconds', () => {
    expect(msToHuman(3 * 60_000 + 5_000)).toBe('3m 5s')
  })
  it('formats hours + minutes', () => {
    expect(msToHuman(2 * 3_600_000 + 15 * 60_000)).toBe('2h 15m')
  })
  it('formats days + hours', () => {
    expect(msToHuman(3 * 86_400_000 + 4 * 3_600_000)).toBe('3d 4h')
  })
})

describe('formatReportConsole', () => {
  it('produces a single line containing strategy/symbol and headline metrics', () => {
    const out = formatReportConsole(sampleReport())
    expect(out.split('\n')).toHaveLength(1)
    expect(out).toContain('[brain/NVDA]')
    expect(out).toContain('12.50%')
    expect(out).toContain('Sharpe 1.80')
    expect(out).toContain('MaxDD 5.00%')
    expect(out).toContain('10 trades')
  })
  it('renders profit factor as infinity glyph when PF is Infinity', () => {
    const r = sampleReport()
    r.metrics.profitFactor = Infinity
    expect(formatReportConsole(r)).toContain('PF ∞')
  })
})

describe('formatReportMd', () => {
  it('contains the required section headings', () => {
    const md = formatReportMd(sampleReport())
    expect(md).toContain('# Backtest Report')
    expect(md).toContain('## Headline')
    expect(md).toContain('## Trades')
  })
  it('formats Sharpe in bold', () => {
    expect(formatReportMd(sampleReport())).toContain('**1.80**')
  })
  it('includes the strategy / symbol / slippage names', () => {
    const md = formatReportMd(sampleReport())
    expect(md).toContain('**Strategy:** brain')
    expect(md).toContain('**Symbol:** NVDA')
    expect(md).toContain('**Slippage:** zero')
  })
  it('handles infinity profit factor', () => {
    const r = sampleReport()
    r.metrics.profitFactor = Infinity
    expect(formatReportMd(r)).toContain('| Profit factor | ∞ |')
  })
  it('renders honest n/a significance rows for a degenerate (2-point) curve — never NaN (P-096)', () => {
    const md = formatReportMd(sampleReport())   // 2 points -> 1 return -> n < 2
    expect(md).toContain('| PSR — P(true Sharpe > 0), per-obs | n/a |')
    expect(md).toContain('| Min track record @ 95% | n/a |')
    expect(md).not.toContain('NaN')
  })
  it('renders %-PSR and a finite minTRL for a real rising curve (P-096)', () => {
    const t0 = 1_700_000_000_000
    const equityCurve = Array.from({ length: 40 }, (_, i) => ({
      ts: t0 + i * 60_000,
      equity: 100_000 + i * 40 + (i % 3) * 25,   // rising with wiggle -> SR > 0
    }))
    const md = formatReportMd(sampleReport({ equityCurve }))
    expect(md).toMatch(/\| PSR — P\(true Sharpe > 0\), per-obs \| \d+\.\d{2}% \|/u)
    expect(md).toMatch(/\| Min track record @ 95% \| \d+ obs \|/)
  })
})

describe('persistReportJson', () => {
  let dir: string
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'satex-reporter-')) })
  afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

  it('writes a parseable JSON file that round-trips the report', async () => {
    const path = join(dir, 'r.json')
    const report = sampleReport()
    await persistReportJson(report, path)
    const back = JSON.parse(await readFile(path, 'utf8')) as BacktestReport
    expect(back.config.symbol).toBe('NVDA')
    expect(back.metrics.sharpe).toBe(1.8)
    expect(back.equityCurve).toHaveLength(2)
  })
})
