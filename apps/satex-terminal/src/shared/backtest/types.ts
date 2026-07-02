/**
 * SATEX — Backtest types.
 * Pure type declarations shared by the metrics library, runner, and reporter.
 * Lives in shared/ so the CLI script and any future renderer-side report
 * viewer can import without crossing process boundaries.
 *
 * G-10 from docs/audits/2026-05-28-evidence-audit.md.
 */
import type { ClosedTrade } from '@shared/types'

export interface EquityPoint {
  /** Epoch ms. */
  ts: number
  /** Mark-to-market account equity at this point. */
  equity: number
}

export interface BacktestConfig {
  /** Strategy identifier — 'brain' for v1; ensemble names later. */
  strategy: string
  symbol: string
  /** Free-form tape identifier — session-id, file path, or label. */
  tape: string
  startingEquity: number
  /** Slippage model name — matches SlippageModel.name field. */
  slippageModel: string
  slippageParams?: Record<string, unknown>
  /** Fraction of equity per trade. Default 0.05 (5%). */
  notionalPct?: number
}

export interface BacktestMetrics {
  totalReturn: number
  annualizedReturn: number
  /** Annualized Sharpe — risk-free rate assumed 0. */
  sharpe: number
  /** Annualized Sortino — uses downside deviation (Sortino 1991 form). */
  sortino: number
  /** annualizedReturn / maxDrawdown. */
  calmar: number
  /** Fractional, e.g. 0.15 = 15% peak-to-trough drop. */
  maxDrawdown: number
  /** Same drawdown expressed as a dollar amount. */
  maxDrawdownDollar: number
  /** ms from the equity peak preceding the worst drawdown to recovery
   *  (or end-of-curve if no recovery happened). */
  maxDrawdownDuration: number
  hitRate: number
  /** Sum of winning $PnL / |sum of losing $PnL|. Infinity when no losses. */
  profitFactor: number
  /** Average $PnL per trade (signed). */
  expectancy: number
  tradeCount: number
  winCount: number
  lossCount: number
  avgWinDollar: number
  avgLossDollar: number
  largestWinDollar: number
  largestLossDollar: number
}

export interface BacktestReport {
  config: BacktestConfig
  /** Wall-clock ms when the run started. */
  startedAt: number
  endedAt: number
  startingEquity: number
  endingEquity: number
  equityCurve: EquityPoint[]
  trades: ClosedTrade[]
  metrics: BacktestMetrics
}
