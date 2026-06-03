/**
 * SATEX — BrainStrategy.
 * Thin adapter wrapping the existing Brain decision engine to fit the
 * Strategy interface. The Brain itself is untouched — this keeps online
 * learning, persisted weights, and the Ernie LLM rationale path available
 * to live trading while letting backtests drive the same decision function.
 *
 * G-10 Task C.4.
 */
import { Brain } from '../services/brain'
import type { Strategy, StrategySnapshot } from './strategy'
import type { StrategySignal } from '@shared/types'

export interface BrainStrategyConfig {
  /** Local-brain confidence floor — anything below skips the bar. */
  threshold: number
  /** ATR multiplier for stop-loss distance. */
  atrStopMult: number
  /** ATR multiplier for take-profit distance. */
  atrTpMult: number
}

const DEFAULT_CONFIG: BrainStrategyConfig = {
  threshold: 0.55,
  atrStopMult: 2.0,
  atrTpMult: 6.0,
}

export class BrainStrategy implements Strategy {
  readonly name = 'brain'
  private readonly config: BrainStrategyConfig

  constructor(private readonly brain: Brain, config?: Partial<BrainStrategyConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  decide(snap: StrategySnapshot): StrategySignal | null {
    if (snap.indicators.atr14 <= 0) return null
    const decision = this.brain.decisionFromLocal(snap.quote, snap.indicators)
    if (decision.bias === 'neutral' || decision.confidence < this.config.threshold) return null

    const dir = decision.bias === 'bullish' ? 1 : -1
    const atrStop = snap.indicators.atr14 * this.config.atrStopMult
    const atrTarget = snap.indicators.atr14 * this.config.atrTpMult

    return {
      setup: 'brain',
      symbol: snap.symbol,
      action: decision.bias === 'bullish' ? 'buy' : 'sell',
      confidence: decision.confidence,
      stopLossHint: snap.quote.last - dir * atrStop,
      takeProfitHint: snap.quote.last + dir * atrTarget,
      atrHint: snap.indicators.atr14,
      createdAt: snap.ts,
    }
  }
}
