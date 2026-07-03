/**
 * SATEX — MeanReversionStrategy.
 *
 * Long when:  5m RSI < 30 (oversold) AND last < 1h VWAP - atr14 × threshold AND
 *             15m trendStrength < threshold (sideways).
 * Short:      5m RSI > 70 AND last > 1h VWAP + atr14 × threshold AND 15m flat.
 *
 * Target: the 1h VWAP. Stop sized at atr14 × stopMult OUTSIDE the entry
 * (continuation of the move = exit).
 *
 * Tier-2 Task E.4.
 */
import type { Strategy, StrategySnapshot } from '../strategy'
import type { StrategySignal } from '@shared/types'

export interface MeanReversionConfig {
  trendStrengthMax: number
  rsiOversold: number
  rsiOverbought: number
  atrStopMult: number
  /** Min distance (in ATRs) below/above VWAP required to enter. */
  vwapAtrThreshold: number
  confidence: number
}

const DEFAULT_CONFIG: MeanReversionConfig = {
  trendStrengthMax: 0.30,
  rsiOversold: 30,
  rsiOverbought: 70,
  atrStopMult: 1.5,
  vwapAtrThreshold: 1.0,
  confidence: 0.55,
}

export class MeanReversionStrategy implements Strategy {
  readonly name = 'mean-reversion'
  private readonly cfg: MeanReversionConfig
  constructor(config?: Partial<MeanReversionConfig>) {
    this.cfg = { ...DEFAULT_CONFIG, ...config }
  }

  decide(snap: StrategySnapshot): StrategySignal | null {
    const ind = snap.indicators
    const atr = ind.atr14
    if (atr <= 0) return null

    const mtf = snap.multiTimeframe
    if (!mtf) return null
    const tf5  = mtf.byTimeframe['5m']
    const tf15 = mtf.byTimeframe['15m']
    const tf1h = mtf.byTimeframe['1h']
    if (!tf5 || !tf15 || !tf1h) return null

    // Only fire in sideways regimes.
    if (tf15.trendStrength >= this.cfg.trendStrengthMax) return null

    const last = snap.quote.last
    const vwap1h = tf1h.vwap
    const vwapDistance = (last - vwap1h) / atr // signed, in ATR units

    let side: 'buy' | 'sell' | null = null
    if (tf5.rsi14 < this.cfg.rsiOversold && vwapDistance < -this.cfg.vwapAtrThreshold) {
      side = 'buy'
    } else if (tf5.rsi14 > this.cfg.rsiOverbought && vwapDistance > this.cfg.vwapAtrThreshold) {
      side = 'sell'
    }
    if (!side) return null

    const dir = side === 'buy' ? 1 : -1
    const stopLossHint = last - dir * atr * this.cfg.atrStopMult
    const takeProfitHint = vwap1h

    return {
      setup: 'mean-reversion',
      symbol: snap.symbol,
      action: side,
      confidence: this.cfg.confidence,
      stopLossHint,
      takeProfitHint,
      atrHint: atr,
      createdAt: snap.ts,
    }
  }
}
