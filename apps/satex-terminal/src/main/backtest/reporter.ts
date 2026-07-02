/**
 * SATEX — Backtest reporter.
 * Three output formatters and a JSON persistence helper. Stateless.
 *
 * G-10 Task C.6.
 */
import { writeFile } from 'node:fs/promises'
import type { BacktestReport } from '@shared/backtest/types'

const dollar = (n: number): string => {
  const sign = n < 0 ? '-' : ''
  return `${sign}$${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

const pct = (n: number): string => `${(n * 100).toFixed(2)}%`

const pf = (n: number): string => n === Infinity ? '∞' : n.toFixed(2)

export function msToHuman(ms: number): string {
  if (ms <= 0) return '—'
  const sec = Math.floor(ms / 1000)
  const min = Math.floor(sec / 60)
  const hr = Math.floor(min / 60)
  const day = Math.floor(hr / 24)
  if (day > 0) return `${day}d ${hr % 24}h`
  if (hr > 0) return `${hr}h ${min % 60}m`
  if (min > 0) return `${min}m ${sec % 60}s`
  return `${sec}s`
}

/** One-line summary for terminal output. */
export function formatReportConsole(report: BacktestReport): string {
  const m = report.metrics
  return `[${report.config.strategy}/${report.config.symbol}] ${pct(m.totalReturn)} total · Sharpe ${m.sharpe.toFixed(2)} · MaxDD ${pct(m.maxDrawdown)} · ${m.tradeCount} trades · hit ${(m.hitRate * 100).toFixed(0)}% · PF ${pf(m.profitFactor)}`
}

/** Markdown table report for human review or PR-comment paste-in. */
export function formatReportMd(report: BacktestReport): string {
  const m = report.metrics
  const first = report.equityCurve[0]?.ts ?? 0
  const last = report.equityCurve[report.equityCurve.length - 1]?.ts ?? 0
  const period = first && last
    ? `${new Date(first).toISOString().slice(0, 19)} → ${new Date(last).toISOString().slice(0, 19)}`
    : '—'

  return `# Backtest Report

**Strategy:** ${report.config.strategy}
**Symbol:** ${report.config.symbol}
**Tape:** ${report.config.tape}
**Slippage:** ${report.config.slippageModel}
**Period:** ${period}

## Headline

| Metric | Value |
|---|---|
| Starting equity | ${dollar(report.startingEquity)} |
| Ending equity | ${dollar(report.endingEquity)} |
| Total return | ${pct(m.totalReturn)} |
| Annualized return | ${pct(m.annualizedReturn)} |
| **Sharpe** (annualized) | **${m.sharpe.toFixed(2)}** |
| Sortino (annualized) | ${m.sortino.toFixed(2)} |
| Calmar | ${m.calmar.toFixed(2)} |
| Max drawdown | ${pct(m.maxDrawdown)} (${dollar(m.maxDrawdownDollar)}) |
| Max DD duration | ${msToHuman(m.maxDrawdownDuration)} |

## Trades

| Metric | Value |
|---|---|
| Total trades | ${m.tradeCount} |
| Wins / Losses | ${m.winCount} / ${m.lossCount} |
| Hit rate | ${pct(m.hitRate)} |
| Profit factor | ${pf(m.profitFactor)} |
| Expectancy | ${dollar(m.expectancy)} per trade |
| Avg win | ${dollar(m.avgWinDollar)} |
| Avg loss | ${dollar(m.avgLossDollar)} |
| Largest win | ${dollar(m.largestWinDollar)} |
| Largest loss | ${dollar(m.largestLossDollar)} |
`
}

/** Persist the report as pretty-printed JSON. The full equity curve is
 *  included so downstream tools (Python notebooks, charting) can rebuild
 *  the curve without re-running the backtest. */
export async function persistReportJson(report: BacktestReport, path: string): Promise<void> {
  await writeFile(path, JSON.stringify(report, null, 2), 'utf8')
}
