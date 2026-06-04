/**
 * SATEX — Strategy Regression Framework.
 *
 * Compares a fresh BacktestReport against a saved baseline. Asserts that:
 *   - tradeCount within ±tradeTolerance
 *   - sharpe stays within ±sharpeTolerance
 *   - maxDrawdown does not exceed baseline by maxDdRegression (drawdown
 *     IMPROVING is fine; WORSENING is the violation)
 *   - hitRate within ±hitRateTolerance
 *
 * The baseline is a previously-saved BacktestReport JSON. Strategy changes
 * that intentionally improve metrics REGENERATE the baseline; unintentional
 * regressions surface as test failures.
 *
 * Tier-2 Task E.10.
 */
import type { BacktestReport } from './types'

export interface RegressionTolerances {
  tradeTolerance: number    // absolute trade-count delta allowed
  sharpeTolerance: number   // absolute Sharpe delta allowed
  maxDdRegression: number   // max additional drawdown allowed (0.02 = 2pt)
  hitRateTolerance: number  // absolute hit-rate delta allowed (0.05 = 5%)
}

export const DEFAULT_TOLERANCES: RegressionTolerances = {
  tradeTolerance: 2,
  sharpeTolerance: 0.5,
  maxDdRegression: 0.02,
  hitRateTolerance: 0.05,
}

export interface RegressionResult {
  ok: boolean
  violations: string[]
}

export function compareReports(
  baseline: BacktestReport,
  current: BacktestReport,
  tol: RegressionTolerances = DEFAULT_TOLERANCES,
): RegressionResult {
  const violations: string[] = []
  const dTrades = current.metrics.tradeCount - baseline.metrics.tradeCount
  if (Math.abs(dTrades) > tol.tradeTolerance) {
    violations.push(`trade count drifted by ${dTrades} (tol=${tol.tradeTolerance})`)
  }
  const dSharpe = current.metrics.sharpe - baseline.metrics.sharpe
  if (Math.abs(dSharpe) > tol.sharpeTolerance) {
    violations.push(`Sharpe drifted by ${dSharpe.toFixed(2)} (tol=${tol.sharpeTolerance})`)
  }
  const dMaxDd = current.metrics.maxDrawdown - baseline.metrics.maxDrawdown
  if (dMaxDd > tol.maxDdRegression) {
    violations.push(`maxDrawdown WORSENED by ${dMaxDd.toFixed(4)} (tol=${tol.maxDdRegression})`)
  }
  const dHit = current.metrics.hitRate - baseline.metrics.hitRate
  if (Math.abs(dHit) > tol.hitRateTolerance) {
    violations.push(`hitRate drifted by ${dHit.toFixed(3)} (tol=${tol.hitRateTolerance})`)
  }
  return { ok: violations.length === 0, violations }
}
