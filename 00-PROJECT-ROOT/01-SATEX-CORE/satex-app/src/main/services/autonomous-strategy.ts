/**
 * SATEX — Autonomous strategy ensemble wiring.
 *
 * Tier-2 follow-up — composes the production StrategyEnsemble from the
 * Phase E strategies (Momentum / MeanReversion / Breakout) with
 * BrainStrategy as the always-available fallback. Also extracts the
 * regime routing key from the RegimeService's composite state label.
 *
 * RegimeSnapshot.state shape: "EXPANSION · NY LIQUIDITY". The first token
 * (the HMM-state label) is the ensemble routing key; the session suffix
 * is dropped before the snapshot is passed to the ensemble.
 */
import type { Brain } from './brain'
import { BrainStrategy } from '../backtest/brain-strategy'
import { MomentumStrategy } from '../backtest/strategies/momentum'
import { MeanReversionStrategy } from '../backtest/strategies/mean-reversion'
import { BreakoutStrategy } from '../backtest/strategies/breakout'
import { StrategyEnsemble } from '../backtest/strategies/ensemble'
import type { RegimeSnapshot } from '@shared/types'

/** Extract the routing key from a "STATE · SESSION LIQUIDITY" regime
 *  label. Returns null when no regime is present. */
export function extractRegimeKey(regime: RegimeSnapshot | null | undefined): string | null {
  if (!regime) return null
  const sep = regime.state.indexOf(' · ')
  return sep >= 0 ? regime.state.slice(0, sep) : regime.state
}

/** Construct the production strategy ensemble. The brain instance is
 *  injected so SGD learning + persisted weights are shared with the
 *  AIInsightsPanel decision path. */
export function buildAutonomousEnsemble(brain: Brain): StrategyEnsemble {
  return new StrategyEnsemble({
    routes: [
      { regime: 'EXPANSION',    strategy: new MomentumStrategy()      },
      { regime: 'MEAN-REVERT',  strategy: new MeanReversionStrategy() },
      { regime: 'COMPRESSION',  strategy: new BreakoutStrategy()      },
      { regime: 'CAPITULATION', strategy: new BreakoutStrategy()      },
    ],
    fallback: new BrainStrategy(brain),
  })
}
