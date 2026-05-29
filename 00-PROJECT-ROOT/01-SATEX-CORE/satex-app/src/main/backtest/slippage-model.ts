/**
 * SATEX — Slippage Model
 * Pluggable fill-price simulator. Wraps the simulator path in OrderManager
 * so backtests and day-to-day paper trading both compute fills that aren't
 * "fill at quote.last with zero friction".
 *
 * Interface is intentionally small: take an order + a market snapshot,
 * return the executed fill price + ms-delay-before-fill. Stateless;
 * callers may pass per-call config.
 *
 * G-11 from docs/audits/2026-05-28-evidence-audit.md.
 */
import type { OrderRequest, Quote } from '@shared/types'

export interface SlippageContext {
  /** Reference quote at the moment the order hit the simulator. */
  quote: Quote
  /** Optional bid/ask spread override if the source has L1. Falls back to
   *  derived spread from quote.bid/ask, then to a synthetic 1bp spread. */
  spreadBpsOverride?: number
}

export interface SlippageFill {
  /** Price the simulator should record as the actual fill. */
  fillPrice: number
  /** Delay before the fill resolves (ms). Models latency; default 50. */
  delayMs: number
}

export interface SlippageModel {
  readonly name: string
  fill(req: OrderRequest, ctx: SlippageContext): SlippageFill
}

/** Zero-slippage baseline = pre-2026-05-29 behavior. Default for OrderManager
 *  so existing callers don't see a behavior change. Useful in unit tests as a
 *  control. */
export class ZeroSlippageModel implements SlippageModel {
  readonly name = 'zero'
  fill(_req: OrderRequest, ctx: SlippageContext): SlippageFill {
    return { fillPrice: ctx.quote.last, delayMs: 50 }
  }
}
