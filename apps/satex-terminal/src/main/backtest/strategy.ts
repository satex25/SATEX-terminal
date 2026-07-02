/**
 * SATEX — Strategy interface.
 * The minimum contract a tradeable strategy must implement to be evaluated
 * by BacktestRunner. Decisions are stateless from the runner's perspective —
 * the strategy may hold internal state (Brain weights, regime memory) but
 * `decide` is called bar-by-bar with a fresh StrategySnapshot.
 *
 * G-10 Task C.3 (base) · Tier-2 Task E.2 (richer-context fields).
 */
import type {
  DepthSnapshot, IndicatorSnapshot, Quote, RegimeSnapshot, StrategySignal,
} from '@shared/types'
import type { MultiTimeframeSnapshot } from '@shared/indicators-mtf'

export interface StrategySnapshot {
  /** Epoch ms of the bar this decision corresponds to. */
  ts: number
  symbol: string
  quote: Quote
  indicators: IndicatorSnapshot
  // ── Tier-2 (E.2) — optional richer context, populated by the runner
  //    when the corresponding flag is set on BacktestRunInput. Strategies
  //    that don't need a field simply ignore it. ────────────────────────
  /** Same instant, multiple timeframes (1m/5m/15m/1h). Opt-in via
   *  BacktestRunInput.withMultiTimeframe. */
  multiTimeframe?: MultiTimeframeSnapshot
  /** Current regime classification snapshot. The free-form `state` string
   *  is the routing key for StrategyEnsemble. */
  regime?: RegimeSnapshot
  /** Level-2 depth snapshot, when available. Drives microstructure-aware
   *  decisions. */
  depth?: DepthSnapshot
}

export interface Strategy {
  /** Stable identifier for reports (matches BacktestConfig.strategy). */
  readonly name: string
  /** Decide whether to enter a new position at this bar. Return null to
   *  skip; the runner handles brackets and position lifecycle. */
  decide(snap: StrategySnapshot): StrategySignal | null
}
