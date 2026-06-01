/**
 * SATEX — MomentumStrategy.
 *
 * Long when:  ema9 > ema21 > ema50 on 1m AND quote.last > 1h vwap AND
 *             5m RSI in (50, 70) AND 15m trendStrength >= threshold.
 * Short mirror: ema9 < ema21 < ema50 AND last < 1h vwap AND
 *               5m RSI in (30, 50) AND 15m trendStrength >= threshold.
 *
 * Bracket: stop = atr14 × stopMult; take-profit = atr14 × tpMult.
 *
 * Tier-2 Task E.3.
 */
import type { Strategy, StrategySnapshot } from '../strategy'
import type { StrategySignal } from '@shared/types'

export interface MomentumConfig {
  trendStrengthMin: number
  rsiBullLo: number
  rsiBullHi: number
  rsiBearLo: number
  rsiBearHi: number
  atrStopMult: number
  atrTpMult: number
  confidence: number
}

const DEFAULT_CONFIG: MomentumConfig = {
  trendStrengthMin: 0.35,
  rsiBullLo: 50, rsiBullHi: 70,
  rsiBearLo: 30, rsiBearHi: 50,
  atrStopMult: 2.0,
  atrTpMult: 4.0,
  confidence: 0.65,
}

export class MomentumStrategy implements Strategy {
  readonly name = 'momentum'
  private readonly cfg: MomentumConfig
  constructor(config?: Partial<MomentumConfig>) {
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

    if (tf15.trendStrength < this.cfg.trendStrengthMin) return null

    const last = snap.quote.last
    const bullStack = ind.ema9 > ind.ema21 && ind.ema21 > ind.ema50
    const bearStack = ind.ema9 < ind.ema21 && ind.ema21 < ind.ema50
    const aboveVwap1h = last > tf1h.vwap
    const belowVwap1h = last < tf1h.vwap
    const rsi5Bull = tf5.rsi14 > this.cfg.rsiBullLo && tf5.rsi14 < this.cfg.rsiBullHi
    const rsi5Bear = tf5.rsi14 > this.cfg.rsiBearLo && tf5.rsi14 < this.cfg.rsiBearHi

    let side: 'buy' | 'sell' | null = null
    if (bullStack && aboveVwap1h && rsi5Bull) side = 'buy'
    else if (bearStack && belowVwap1h && rsi5Bear) side = 'sell'
    if (!side) return null

    const dir = side === 'buy' ? 1 : -1
    return {
      setup: 'momentum',
      symbol: snap.symbol,
      action: side,
      confidence: this.cfg.confidence,
      stopLossHint:   last - dir * atr * this.cfg.atrStopMult,
      takeProfitHint: last + dir * atr * this.cfg.atrTpMult,
      atrHint: atr,
      createdAt: snap.ts,
    }
  }
}
