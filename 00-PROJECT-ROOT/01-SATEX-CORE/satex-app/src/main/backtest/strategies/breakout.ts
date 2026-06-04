/**
 * SATEX — BreakoutStrategy.
 *
 * Concept: take a stateful ATR-derived range as the breakout pivot. If
 * current bar's range expands above the prior bar's range AND price prints
 * above prior pivot high (long) or below prior pivot low (short), AND 1h
 * trendStrength + EMA direction confirm, enter in the direction.
 *
 * v1 uses atr14 as a proxy for "prior 15m bar range" since the snapshot
 * doesn't carry raw H/L for the prior aggregated bar. A v2 will extend
 * MultiTimeframeSnapshot with explicit prior-bar H/L.
 *
 * Bracket: stop = entry ± ATR × stopMult, TP = entry ± ATR × tpMult.
 *
 * Tier-2 Task E.5.
 */
import type { Strategy, StrategySnapshot } from '../strategy'
import type { StrategySignal } from '@shared/types'

export interface BreakoutConfig {
  rangeExpansionMin: number
  trendStrengthMin: number
  atrStopMult: number
  atrTpMult: number
  confidence: number
}

const DEFAULT_CONFIG: BreakoutConfig = {
  rangeExpansionMin: 1.20,
  trendStrengthMin: 0.40,
  atrStopMult: 1.5,
  atrTpMult: 3.0,
  confidence: 0.60,
}

export class BreakoutStrategy implements Strategy {
  readonly name = 'breakout'
  private readonly cfg: BreakoutConfig
  private priorRange: { high: number; low: number; range: number } | null = null

  constructor(config?: Partial<BreakoutConfig>) {
    this.cfg = { ...DEFAULT_CONFIG, ...config }
  }

  decide(snap: StrategySnapshot): StrategySignal | null {
    const ind = snap.indicators
    const atr = ind.atr14
    if (atr <= 0) return null

    const mtf = snap.multiTimeframe
    if (!mtf) return null
    const tf1h = mtf.byTimeframe['1h']
    if (!tf1h) return null

    const proxyRange = atr * 2
    if (!this.priorRange) {
      this.priorRange = {
        high: snap.quote.last + proxyRange / 2,
        low:  snap.quote.last - proxyRange / 2,
        range: proxyRange,
      }
      return null
    }

    const expansion = proxyRange / Math.max(0.01, this.priorRange.range)
    const prior = this.priorRange
    if (expansion < this.cfg.rangeExpansionMin) {
      this.priorRange = { high: snap.quote.last + proxyRange / 2,
                          low:  snap.quote.last - proxyRange / 2, range: proxyRange }
      return null
    }
    if (tf1h.trendStrength < this.cfg.trendStrengthMin) {
      this.priorRange = { high: snap.quote.last + proxyRange / 2,
                          low:  snap.quote.last - proxyRange / 2, range: proxyRange }
      return null
    }

    const last = snap.quote.last
    const aboveHigh = last > prior.high
    const belowLow  = last < prior.low
    const bullish1h = tf1h.ema9 >= tf1h.ema50
    const bearish1h = tf1h.ema9 <  tf1h.ema50

    let side: 'buy' | 'sell' | null = null
    if (aboveHigh && bullish1h) side = 'buy'
    else if (belowLow && bearish1h) side = 'sell'

    this.priorRange = { high: last + proxyRange / 2, low: last - proxyRange / 2, range: proxyRange }

    if (!side) return null

    const dir = side === 'buy' ? 1 : -1
    return {
      setup: 'breakout',
      symbol: snap.symbol,
      action: side,
      confidence: this.cfg.confidence,
      stopLossHint:   last - dir * atr * this.cfg.atrStopMult,
      takeProfitHint: last + dir * atr * this.cfg.atrTpMult,
      atrHint: atr,
      createdAt: snap.ts,
    }
  }

  /** Test-only reset hook so a fresh strategy instance doesn't carry state. */
  reset(): void { this.priorRange = null }
}
