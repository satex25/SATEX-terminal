/**
 * SATEX — StrategyEnsemble.
 *
 * Routes the decide() call to a child strategy based on the regime
 * classification. When the primary child produces no signal, falls back
 * to a configurable fallback (typically BrainStrategy — always-available).
 *
 * Tier-2 Task E.6.
 */
import type { Strategy, StrategySnapshot } from '../strategy'
import type { StrategySignal } from '@shared/types'

/** Regime key — mirrors RegimeSnapshot.state which is a free-form string.
 *  Callers configure exact-match routes; mapping a richer RegimeSnapshot
 *  to ensemble keys is the production-wiring layer's responsibility.
 *  Internal-only — consumers use inline string literals on EnsembleConfig
 *  entries, so no external import of this alias is needed. */
type RegimeKey = string

interface EnsembleRoute {
  regime: RegimeKey
  strategy: Strategy
}

export interface EnsembleConfig {
  routes: EnsembleRoute[]
  fallback: Strategy
}

export class StrategyEnsemble implements Strategy {
  readonly name = 'ensemble'
  private readonly cfg: EnsembleConfig

  constructor(cfg: EnsembleConfig) {
    this.cfg = cfg
  }

  decide(snap: StrategySnapshot): StrategySignal | null {
    const regime = snap.regime?.state ?? null
    let primary: Strategy | null = null
    if (regime) {
      for (const r of this.cfg.routes) {
        if (r.regime === regime) { primary = r.strategy; break }
      }
    }
    if (primary) {
      const sig = primary.decide(snap)
      if (sig) return sig
    }
    return this.cfg.fallback.decide(snap)
  }
}
