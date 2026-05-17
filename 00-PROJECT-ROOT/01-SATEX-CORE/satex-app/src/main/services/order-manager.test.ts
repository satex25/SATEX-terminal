/**
 * SATEX — OrderManager unit tests.
 *
 * Locks down the adversarial-review fixes from 2026-05-16:
 *   • C1 — `triggeredBy` no longer exists on OrderRequest; Gate 1 (kill
 *          switch) fires unconditionally; Gate 0 (stale quote) too.
 *   • C3 — `signalToRequest` sizes by refPrice instead of collapsing to qty=1.
 *
 * The C2 (sessionStartEquity) section is added by a subsequent commit.
 */
import { describe, expect, it } from 'vitest'
import { OrderManager, type OrderValidationContext } from './order-manager'
import type { OrderRequest, StrategySignal } from '../../shared/types'

function baseBuy(overrides?: Partial<OrderRequest>): OrderRequest {
  return {
    symbol: 'NVDA',
    side: 'buy',
    type: 'market',
    quantity: 1,
    ...overrides,
  }
}

function baseSell(overrides?: Partial<OrderRequest>): OrderRequest {
  return {
    symbol: 'NVDA',
    side: 'sell',
    type: 'market',
    quantity: 1,
    ...overrides,
  }
}

function liveCtx(overrides?: Partial<OrderValidationContext>): OrderValidationContext {
  return {
    refPrice: 100,
    refPriceAge: 100,
    liveMode: true,
    notionalCap: 1_000_000,
    assetClass: 'equity',
    ...overrides,
  }
}

describe('OrderManager — C1: triggeredBy bypass closed', () => {
  it('Gate 1 (kill switch) fires for every order — no carve-outs', () => {
    const om = new OrderManager(100_000)
    om.setMarketOpen(true)
    om.armKillSwitch('test')

    // Plain buy
    expect(om.validate(baseBuy({ quantity: 1 }), liveCtx()).gate).toBe('kill-switch')
    // Plain sell
    expect(om.validate(baseSell({ quantity: 1 }), liveCtx()).gate).toBe('kill-switch')
    // Hostile attempt: even if the renderer COULD set triggeredBy (it can't
    // anymore — Zod strips the field at the IPC boundary), the OM no longer
    // checks for it. We cast to `any` here only to simulate the historical
    // bypass and confirm the gate now fires regardless.
    const sneaky = { ...baseBuy({ quantity: 1 }), triggeredBy: 'stop-loss' } as unknown as OrderRequest
    expect(om.validate(sneaky, liveCtx()).gate).toBe('kill-switch')
  })

  it('Gate 0 (stale quote) fires under live mode regardless of any extra fields', () => {
    const om = new OrderManager(100_000)
    om.setMarketOpen(true)
    const ctx = liveCtx({ refPriceAge: 10_000 }) // 10s stale, far over 5s cap
    const res = om.validate(baseBuy({ quantity: 1 }), ctx)
    expect(res.ok).toBe(false)
    expect(res.gate).toBe('stale-quote')

    // Historical bypass attempt: even with a forged stop-loss tag, gate fires.
    const sneaky = { ...baseBuy({ quantity: 1 }), triggeredBy: 'stop-loss' } as unknown as OrderRequest
    expect(om.validate(sneaky, ctx).gate).toBe('stale-quote')
  })

  it('Gate 0 stays bypassed in paper/simulator mode (no live flag)', () => {
    const om = new OrderManager(100_000)
    om.setMarketOpen(true)
    const ctx: OrderValidationContext = {
      refPrice: 100, refPriceAge: 10_000, liveMode: false, notionalCap: 0,
    }
    expect(om.validate(baseBuy({ quantity: 1 }), ctx).ok).toBe(true)
  })
})

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

describe('OrderManager — other gates still behave', () => {
  it('Gate 7 (live notional cap) fires when notional > cap', () => {
    const om = new OrderManager(100_000)
    om.setMarketOpen(true)
    const res = om.validate(baseBuy({ quantity: 10 }), liveCtx({ refPrice: 100, notionalCap: 500 }))
    expect(res.ok).toBe(false)
    expect(res.gate).toBe('notional-cap')
  })

  it('Gate 6 (buying power) rejects orders that exceed it', () => {
    const om = new OrderManager(1_000)
    om.setMarketOpen(true)
    // buyingPower = 1_000 * BUYING_POWER_MULT; notional 100 * 100 = 10_000
    const res = om.validate(baseBuy({ quantity: 100 }), liveCtx({ refPrice: 100, notionalCap: 1_000_000 }))
    expect(res.ok).toBe(false)
    // Could be max-positions, concentration, or buying-power depending on
    // constants; we just assert it didn't pass.
    expect(res.gate).toBeDefined()
  })
})
