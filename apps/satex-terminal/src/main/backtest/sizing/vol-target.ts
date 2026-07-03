/**
 * SATEX — VolatilityTargetSizing.
 *
 * Computes a position notional that targets a constant annualized vol
 * contribution per position. Formula:
 *
 *   per_bar_vol  = atr14 / quote.last
 *   annual_vol   = per_bar_vol × sqrt(periodsPerYear)
 *   base         = (equity × annualVolTarget) / annual_vol
 *   kelly_adj    = base × kellyFraction × clamp(signal.confidence, 0.1, 1)
 *   notional     = clamp(kelly_adj, minNotional, equity × maxFraction)
 *   qty          = max(1, floor(notional / quote.last))
 *
 * Replaces fixed-fraction sizing — same symbol-class gets a SMALLER
 * position when ATR rises, a LARGER position when ATR falls, keeping the
 * portfolio's vol contribution stable across regimes.
 *
 * Tier-2 Task E.7.
 */
import type { Quote, StrategySignal } from '@shared/types'

export interface VolTargetSizerConfig {
  /** Target annualized vol per position (0.15 = 15%). */
  annualVolTarget: number
  /** Bars per year for vol annualization (252 daily, 252*6.5*60 1-min). */
  periodsPerYear: number
  /** Kelly fraction in [0,1] — full Kelly = 1, half-Kelly = 0.5. */
  kellyFraction: number
  /** Floor on per-trade notional (USD). */
  minNotional: number
  /** Cap as fraction of total equity. */
  maxFraction: number
}

export interface SizeInput {
  signal: StrategySignal
  quote: Quote
  equity: number
}

export interface SizingResult {
  notional: number
  quantity: number
  reason: string
}

const DEFAULT_CONFIG: VolTargetSizerConfig = {
  annualVolTarget: 0.15,
  periodsPerYear: 252 * 6.5 * 60,
  kellyFraction: 0.5,
  minNotional: 500,
  maxFraction: 0.10,
}

export class VolatilityTargetSizing {
  readonly name = 'vol-target'
  private readonly cfg: VolTargetSizerConfig

  constructor(config?: Partial<VolTargetSizerConfig>) {
    this.cfg = { ...DEFAULT_CONFIG, ...config }
  }

  size(input: SizeInput): SizingResult {
    const { signal, quote, equity } = input
    const atr = signal.atrHint
    if (atr <= 0 || quote.last <= 0 || equity <= 0) {
      return { notional: 0, quantity: 0, reason: 'invalid-input' }
    }

    const perBarVol = atr / quote.last
    const annualVol = perBarVol * Math.sqrt(this.cfg.periodsPerYear)
    if (annualVol <= 0) {
      return { notional: 0, quantity: 0, reason: 'zero-vol' }
    }

    const baseNotional = (equity * this.cfg.annualVolTarget) / annualVol
    const kellyAdj = baseNotional * this.cfg.kellyFraction *
      Math.max(0.1, Math.min(1, signal.confidence))
    const capped = Math.min(equity * this.cfg.maxFraction, Math.max(this.cfg.minNotional, kellyAdj))
    const quantity = Math.max(1, Math.floor(capped / quote.last))
    return { notional: quantity * quote.last, quantity, reason: 'ok' }
  }
}
