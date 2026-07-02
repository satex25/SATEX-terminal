/**
 * SATEX — Backtest metrics.
 * Pure functions. No state, no I/O. Annualized metrics take periodsPerYear
 * as a parameter (252 for daily, 252*6.5*60 = 98280 for 1-min equity bars).
 *
 * G-10 Task C.2 from docs/superpowers/plans/2026-05-29-forward-test-foundation.md.
 */
import type { ClosedTrade } from '@shared/types'
import type { EquityPoint, BacktestMetrics } from './types'

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000

/** Compound annual return given start/end equity and duration in ms. */
export function annualizedReturn(startEquity: number, endEquity: number, durationMs: number): number {
  if (durationMs <= 0 || startEquity <= 0 || endEquity <= 0) return 0
  const years = durationMs / MS_PER_YEAR
  if (years <= 0) return 0
  return Math.pow(endEquity / startEquity, 1 / years) - 1
}

/** Per-bar simple returns derived from an equity curve. Length = curve.length - 1.
 *  Bars where the prior equity was non-positive are dropped to avoid div-by-zero. */
export function barReturns(curve: EquityPoint[]): number[] {
  const out: number[] = []
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1]!.equity
    const b = curve[i]!.equity
    if (a > 0) out.push((b - a) / a)
  }
  return out
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0
  let s = 0
  for (const x of xs) s += x
  return s / xs.length
}

function stdev(xs: number[]): number {
  if (xs.length < 2) return 0
  const m = mean(xs)
  let v = 0
  for (const x of xs) v += (x - m) ** 2
  return Math.sqrt(v / (xs.length - 1))
}

/** Annualized Sharpe ratio. rf = 0. */
export function sharpe(curve: EquityPoint[], periodsPerYear: number): number {
  const rets = barReturns(curve)
  const sd = stdev(rets)
  if (sd === 0) return 0
  return mean(rets) / sd * Math.sqrt(periodsPerYear)
}

/** Annualized Sortino — downside deviation (squared negative returns,
 *  divided by N not N-1, no demeaning) per Sortino 1991. */
export function sortino(curve: EquityPoint[], periodsPerYear: number): number {
  const rets = barReturns(curve)
  if (rets.length === 0) return 0
  const downside = rets.filter(r => r < 0)
  if (downside.length === 0) return 0
  let s = 0
  for (const r of downside) s += r * r
  const dd = Math.sqrt(s / downside.length)
  if (dd === 0) return 0
  return mean(rets) / dd * Math.sqrt(periodsPerYear)
}

/** Largest peak-to-trough drawdown as a fractional value (0.15 = 15%). */
export function maxDrawdown(curve: EquityPoint[]): number {
  if (curve.length === 0) return 0
  let peak = curve[0]!.equity
  let maxDD = 0
  for (const p of curve) {
    if (p.equity > peak) peak = p.equity
    if (peak > 0) {
      const dd = (peak - p.equity) / peak
      if (dd > maxDD) maxDD = dd
    }
  }
  return maxDD
}

/** Dollar value of the largest peak-to-trough drawdown. */
export function maxDrawdownDollar(curve: EquityPoint[]): number {
  if (curve.length === 0) return 0
  let peak = curve[0]!.equity
  let maxDD = 0
  for (const p of curve) {
    if (p.equity > peak) peak = p.equity
    const dd = peak - p.equity
    if (dd > maxDD) maxDD = dd
  }
  return maxDD
}

/** Longest duration (ms) the equity stays below a prior peak, terminating
 *  on recovery to that peak OR on end-of-curve. */
export function maxDrawdownDuration(curve: EquityPoint[]): number {
  if (curve.length === 0) return 0
  let peakValue = curve[0]!.equity
  let peakTs = curve[0]!.ts
  let inDrawdown = false
  let drawdownStart = peakTs
  let maxDuration = 0
  for (const p of curve) {
    if (p.equity >= peakValue) {
      if (inDrawdown) {
        const dur = p.ts - drawdownStart
        if (dur > maxDuration) maxDuration = dur
        inDrawdown = false
      }
      peakValue = p.equity
      peakTs = p.ts
    } else if (!inDrawdown) {
      inDrawdown = true
      drawdownStart = peakTs
    }
  }
  if (inDrawdown) {
    const dur = curve[curve.length - 1]!.ts - drawdownStart
    if (dur > maxDuration) maxDuration = dur
  }
  return maxDuration
}

/** Calmar ratio = annualized return / max drawdown. */
export function calmar(curve: EquityPoint[]): number {
  if (curve.length < 2) return 0
  const dd = maxDrawdown(curve)
  if (dd === 0) return 0
  const dur = curve[curve.length - 1]!.ts - curve[0]!.ts
  const ann = annualizedReturn(curve[0]!.equity, curve[curve.length - 1]!.equity, dur)
  return ann / dd
}

/** Fraction of trades with pnl > 0. */
export function hitRate(trades: ClosedTrade[]): number {
  if (trades.length === 0) return 0
  let wins = 0
  for (const t of trades) if (t.pnl > 0) wins++
  return wins / trades.length
}

/** Sum winning $PnL / |sum losing $PnL|. Infinity when no losses and any wins. */
export function profitFactor(trades: ClosedTrade[]): number {
  let wins = 0, losses = 0
  for (const t of trades) {
    if (t.pnl > 0) wins += t.pnl
    else if (t.pnl < 0) losses += -t.pnl
  }
  if (losses === 0) return wins > 0 ? Infinity : 0
  return wins / losses
}

/** Average $PnL per trade. */
export function expectancy(trades: ClosedTrade[]): number {
  if (trades.length === 0) return 0
  let s = 0
  for (const t of trades) s += t.pnl
  return s / trades.length
}

/** Pull every metric into one snapshot. The single call backtest runners use. */
export function computeMetrics(
  curve: EquityPoint[],
  trades: ClosedTrade[],
  periodsPerYear: number,
): BacktestMetrics {
  const start = curve[0]?.equity ?? 0
  const end = curve[curve.length - 1]?.equity ?? start
  const dur = curve.length > 0 ? curve[curve.length - 1]!.ts - curve[0]!.ts : 0

  let winCount = 0, lossCount = 0
  let winSum = 0, lossSum = 0
  let largestWin = 0, largestLoss = 0
  for (const t of trades) {
    if (t.pnl > 0) {
      winCount++
      winSum += t.pnl
      if (t.pnl > largestWin) largestWin = t.pnl
    } else if (t.pnl < 0) {
      lossCount++
      lossSum += t.pnl
      if (t.pnl < largestLoss) largestLoss = t.pnl
    }
  }

  return {
    totalReturn: start > 0 ? (end - start) / start : 0,
    annualizedReturn: annualizedReturn(start, end, dur),
    sharpe: sharpe(curve, periodsPerYear),
    sortino: sortino(curve, periodsPerYear),
    calmar: calmar(curve),
    maxDrawdown: maxDrawdown(curve),
    maxDrawdownDollar: maxDrawdownDollar(curve),
    maxDrawdownDuration: maxDrawdownDuration(curve),
    hitRate: hitRate(trades),
    profitFactor: profitFactor(trades),
    expectancy: expectancy(trades),
    tradeCount: trades.length,
    winCount,
    lossCount,
    avgWinDollar: winCount > 0 ? winSum / winCount : 0,
    avgLossDollar: lossCount > 0 ? lossSum / lossCount : 0,
    largestWinDollar: largestWin,
    largestLossDollar: largestLoss,
  }
}
