/**
 * SATEX — Strategy interface.
 * The minimum contract a tradeable strategy must implement to be evaluated
 * by BacktestRunner. Decisions are stateless from the runner's perspective —
 * the strategy may hold internal state (Brain weights, regime memory) but
 * `decide` is called bar-by-bar with a fresh StrategySnapshot.
 *
 * G-10 Task C.3.
 */
import type { IndicatorSnapshot, Quote, StrategySignal } from '@shared/types'

export interface StrategySnapshot {
  /** Epoch ms of the bar this decision corresponds to. */
  ts: number
  symbol: string
  quote: Quote
  indicators: IndicatorSnapshot
}

export interface Strategy {
  /** Stable identifier for reports (matches BacktestConfig.strategy). */
  readonly name: string
  /** Decide whether to enter a new position at this bar. Return null to
   *  skip; the runner handles brackets and position lifecycle. */
  decide(snap: StrategySnapshot): StrategySignal | null
}
