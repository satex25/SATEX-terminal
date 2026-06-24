/**
 * SATEX — Funded-account payout metrics (pure).
 *
 * Computes consistency / profit-target / min-trading-days / phase from a
 * DailyPnlEntry[] + the active profile. All advisory — no order blocks.
 *
 * Tier-1 Phase D-2 Task F.2.
 */
import type { FundedAccountProfile } from './types'

export interface DailyPnlEntry {
  date: string
  realizedPnl: number
  tradeCount: number
  updatedAt: number
}

export interface PayoutMetrics {
  /** Sum of all realized daily PnL on profitable days. */
  totalProfit: number
  /** Largest single profitable day. */
  largestProfitableDay: number
  /** largestProfitableDay / totalProfit (0 when no profit yet). */
  consistencyRatio: number
  /** True if the consistency rule is satisfied at payout time. Always true
   *  when consistencyMaxDayFraction is 0 (no enforcement, e.g. XFA Combine). */
  consistencyOk: boolean
  /** Progress toward profitTarget as a fraction in [0,1]. */
  profitTargetProgress: number
  /** True if totalProfit >= profitTarget. */
  profitTargetReached: boolean
  /** Count of distinct trading days with at least one closed trade. */
  tradingDaysCount: number
  /** True if tradingDaysCount >= minTradingDays. */
  minDaysSatisfied: boolean
  /** Evaluation phase ('combine' | 'funded' | 'activated'). */
  phase: string
  /** Daily P&L history for display + future analysis. */
  dailyHistory: DailyPnlEntry[]
}

export function computePayoutMetrics(
  entries: DailyPnlEntry[],
  profile: FundedAccountProfile,
): PayoutMetrics {
  let totalProfit = 0
  let largestDay = 0
  let tradingDays = 0
  for (const e of entries) {
    if (e.tradeCount > 0) tradingDays += 1
    if (e.realizedPnl > 0) {
      totalProfit += e.realizedPnl
      if (e.realizedPnl > largestDay) largestDay = e.realizedPnl
    }
  }
  const consistencyRatio = totalProfit > 0 ? largestDay / totalProfit : 0
  const consistencyOk = profile.consistencyMaxDayFraction === 0
    || consistencyRatio <= profile.consistencyMaxDayFraction
  const profitTargetProgress = profile.profitTarget > 0
    ? Math.min(1, Math.max(0, totalProfit) / profile.profitTarget)
    : 0
  return {
    totalProfit,
    largestProfitableDay: largestDay,
    consistencyRatio,
    consistencyOk,
    profitTargetProgress,
    profitTargetReached: totalProfit >= profile.profitTarget,
    tradingDaysCount: tradingDays,
    minDaysSatisfied: tradingDays >= profile.minTradingDays,
    phase: profile.phase,
    dailyHistory: [...entries],
  }
}

export const EMPTY_PAYOUT_METRICS: PayoutMetrics = {
  totalProfit: 0,
  largestProfitableDay: 0,
  consistencyRatio: 0,
  consistencyOk: true,
  profitTargetProgress: 0,
  profitTargetReached: false,
  tradingDaysCount: 0,
  minDaysSatisfied: true,
  phase: 'combine',
  dailyHistory: [],
}
