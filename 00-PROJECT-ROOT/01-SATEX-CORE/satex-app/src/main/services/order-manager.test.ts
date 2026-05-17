/**
 * SATEX — OrderManager unit tests.
 *
 * Locks down the adversarial-review fix from 2026-05-16:
 *   • C3 — `signalToRequest` sizes by refPrice instead of collapsing to qty=1.
 *
 * Further sections (C1, C2) will be appended by subsequent commits.
 */
import { describe, expect, it } from 'vitest'
import { OrderManager } from './order-manager'
import type { StrategySignal } from '../../shared/types'

describe('OrderManager — C3: signalToRequest sizes by refPrice', () => {
  const signal: StrategySignal = {
    symbol: 'NVDA',
    action: 'buy',
    setup: 'breakout',
    confidence: 0.7,
    stopLossHint: 95,
    takeProfitHint: 110,
    atrHint: 2.5,
    createdAt: 1_700_000_000_000,
  }

  it('produces qty = floor(notionalCap / refPrice) — not always 1', () => {
    const om = new OrderManager(100_000)
    expect(om.signalToRequest(signal, 5_000, 100).quantity).toBe(50)
    expect(om.signalToRequest(signal, 1_000, 200).quantity).toBe(5)
    expect(om.signalToRequest(signal, 10_000, 137.42).quantity).toBe(72)
  })

  it('floors qty to 1 minimum when notional is below one share', () => {
    const om = new OrderManager(100_000)
    // $500 cap on a $1000 stock → can't afford even one, fall back to 1
    expect(om.signalToRequest(signal, 500, 1000).quantity).toBe(1)
  })

  it('falls back to qty=1 when refPrice is non-positive (stale or missing quote)', () => {
    const om = new OrderManager(100_000)
    expect(om.signalToRequest(signal, 5_000, 0).quantity).toBe(1)
    expect(om.signalToRequest(signal, 5_000, -10).quantity).toBe(1)
  })
})
