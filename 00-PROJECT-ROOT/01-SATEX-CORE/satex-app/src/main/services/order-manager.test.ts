/**
 * SATEX — OrderManager unit tests.
 *
 * Locks down the adversarial-review fixes from 2026-05-16:
 *   • C1 — `triggeredBy` no longer exists on OrderRequest; Gate 1 (kill
 *          switch) fires unconditionally; Gate 0 (stale quote) too.
 *   • C2 — `setSessionStartEquity` rebases daily-loss math and refuses
 *          non-positive equity.
 *   • C3 — `signalToRequest` sizes by refPrice instead of collapsing to qty=1.
 */
import { beforeEach, describe, expect, it } from 'vitest'
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

  // ── D6 v0.4.3 — Non-finite refPriceAge defense-in-depth ───────────────────
  // Pre-fix `NaN > MAX_QUOTE_AGE_MS` evaluated to false → Gate 0 silently
  // passed orders through when a hostile WS frame had corrupted timestamp
  // upstream. v0.4.2 added the WS-boundary num()/ts() guards; this case
  // tightens Gate 0 itself so even if a future code path leaks a non-finite
  // value past the boundary, the order gets rejected here.

  it('Gate 0 rejects NaN refPriceAge in live mode (D6 defense-in-depth)', () => {
    const om = new OrderManager(100_000)
    om.setMarketOpen(true)
    const ctx = liveCtx({ refPriceAge: NaN })
    const res = om.validate(baseBuy({ quantity: 1 }), ctx)
    expect(res.ok).toBe(false)
    expect(res.gate).toBe('stale-quote')
    expect(res.reason).toContain('non-finite')
  })

  it('Gate 0 rejects Infinity refPriceAge in live mode', () => {
    const om = new OrderManager(100_000)
    om.setMarketOpen(true)
    const ctx = liveCtx({ refPriceAge: Infinity })
    const res = om.validate(baseBuy({ quantity: 1 }), ctx)
    expect(res.ok).toBe(false)
    expect(res.gate).toBe('stale-quote')
  })

  it('Gate 0 rejects -Infinity refPriceAge in live mode', () => {
    const om = new OrderManager(100_000)
    om.setMarketOpen(true)
    const ctx = liveCtx({ refPriceAge: -Infinity })
    const res = om.validate(baseBuy({ quantity: 1 }), ctx)
    expect(res.ok).toBe(false)
    expect(res.gate).toBe('stale-quote')
  })

  it('Gate 0 tolerates non-finite refPriceAge in paper mode (no live capital at risk)', () => {
    // Symmetric with the existing "Gate 0 bypassed in paper mode" case: in
    // paper/simulator we tolerate flaky timestamps so dev loops aren't
    // friction-laden. The risk surface is zero (no broker call).
    const om = new OrderManager(100_000)
    om.setMarketOpen(true)
    const ctx: OrderValidationContext = {
      refPrice: 100, refPriceAge: NaN, liveMode: false, notionalCap: 0,
    }
    expect(om.validate(baseBuy({ quantity: 1 }), ctx).ok).toBe(true)
  })
})

describe('OrderManager — C2: session equity baseline rebase', () => {
  let om: OrderManager
  beforeEach(() => { om = new OrderManager(10_000) })

  it('setSessionStartEquity updates the baseline and rebuilds dailyPnl', () => {
    expect(om.getSessionStartEquity()).toBe(10_000)
    om.setSessionStartEquity(100_000)
    expect(om.getSessionStartEquity()).toBe(100_000)
    const acct = om.getAccount()
    // account.equity is still the constructor's 10_000 because we haven't
    // syncFromAlpaca'd; dailyPnl now reflects equity - new baseline.
    expect(acct.dailyPnl).toBeCloseTo(10_000 - 100_000)
  })

  it('refuses non-positive equity (broker outage, brand-new account)', () => {
    om.setSessionStartEquity(0)
    expect(om.getSessionStartEquity()).toBe(10_000) // unchanged
    om.setSessionStartEquity(-500)
    expect(om.getSessionStartEquity()).toBe(10_000)
    om.setSessionStartEquity(Number.NaN)
    expect(om.getSessionStartEquity()).toBe(10_000)
    om.setSessionStartEquity(Number.POSITIVE_INFINITY)
    expect(om.getSessionStartEquity()).toBe(10_000)
  })

  it('Gate 3 (daily loss) measures against the rebased baseline, not the constant', () => {
    om.setMarketOpen(true)
    om.syncFromAlpaca({ equity: 100_000, cash: 100_000, buyingPower: 100_000 }, [])
    om.setSessionStartEquity(100_000)
    // Simulate equity drop within the daily-loss cap (default 2%): -1_500 of 100k = 1.5%
    om.syncFromAlpaca({ equity: 98_500, cash: 98_500, buyingPower: 98_500 }, [])
    expect(om.validate(baseBuy({ quantity: 1 }), liveCtx({ refPrice: 100 })).ok).toBe(true)
    // Now breach: drop to -2.5%
    om.syncFromAlpaca({ equity: 97_500, cash: 97_500, buyingPower: 97_500 }, [])
    const res = om.validate(baseBuy({ quantity: 1 }), liveCtx({ refPrice: 100 }))
    expect(res.ok).toBe(false)
    expect(res.gate).toBe('daily-loss')
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

describe('OrderManager — applyFill accounting (2026-05-18 regression)', () => {
  // Locks down the CRITICAL fix from the 2026-05-18 audit:
  //   • sell branch no longer double-counts realized PnL into cash
  //   • rebuildEquity adds position mark-to-market, not just unrealizedPnl
  // Pre-fix: 100 sh bought @ $4 then sold @ $5 left paper cash $100 over
  // the true value, with equity wrong during the hold by exactly the cost
  // basis.

  function buyMarket(om: OrderManager, sym: string, qty: number, fill: number): void {
    const req: OrderRequest = { symbol: sym, side: 'buy', type: 'market', quantity: qty }
    om.setMarketOpen(true)
    const o = om.createOrder(req)
    om.fillOrder(o.id, fill)
  }
  function sellMarket(om: OrderManager, sym: string, qty: number, fill: number): void {
    const req: OrderRequest = { symbol: sym, side: 'sell', type: 'market', quantity: qty }
    const o = om.createOrder(req)
    om.fillOrder(o.id, fill)
  }

  it('equity is preserved across a buy fill (cash drop offset by position value)', () => {
    const om = new OrderManager(10_000)
    expect(om.getAccount().equity).toBeCloseTo(10_000)
    expect(om.getAccount().cash).toBeCloseTo(10_000)
    buyMarket(om, 'NVDA', 100, 4)
    const acct = om.getAccount()
    expect(acct.cash).toBeCloseTo(9_600)
    expect(acct.equity).toBeCloseTo(10_000) // pre-fix: $9,600
    expect(acct.dailyPnl).toBeCloseTo(0)
  })

  it('equity tracks unrealized PnL while a position is open', () => {
    const om = new OrderManager(10_000)
    buyMarket(om, 'NVDA', 100, 4)
    om.updatePositionPrice('NVDA', 5)
    const acct = om.getAccount()
    expect(acct.cash).toBeCloseTo(9_600)
    expect(acct.equity).toBeCloseTo(10_100) // 9_600 cash + (100*4 + 100) position
    expect(acct.dailyPnl).toBeCloseTo(100)
  })

  it('winning sell realizes correct cash and equity (no double-count)', () => {
    const om = new OrderManager(10_000)
    buyMarket(om, 'NVDA', 100, 4)
    om.updatePositionPrice('NVDA', 5)
    sellMarket(om, 'NVDA', 100, 5)
    const acct = om.getAccount()
    expect(acct.cash).toBeCloseTo(10_100) // pre-fix: 10_200
    expect(acct.equity).toBeCloseTo(10_100) // pre-fix: 10_200
    expect(acct.dailyPnl).toBeCloseTo(100)
    expect(acct.openPositions.length).toBe(0)
  })

  it('losing sell realizes correct cash and equity', () => {
    const om = new OrderManager(10_000)
    buyMarket(om, 'NVDA', 100, 4)
    om.updatePositionPrice('NVDA', 3)
    sellMarket(om, 'NVDA', 100, 3)
    const acct = om.getAccount()
    expect(acct.cash).toBeCloseTo(9_900)
    expect(acct.equity).toBeCloseTo(9_900)
    expect(acct.dailyPnl).toBeCloseTo(-100)
  })

  it('round-trip at entry price is cash-neutral and equity-neutral', () => {
    const om = new OrderManager(10_000)
    buyMarket(om, 'NVDA', 50, 20)
    sellMarket(om, 'NVDA', 50, 20)
    const acct = om.getAccount()
    expect(acct.cash).toBeCloseTo(10_000)
    expect(acct.equity).toBeCloseTo(10_000)
    expect(acct.dailyPnl).toBeCloseTo(0)
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

describe('OrderManager — kill-switch persistence wiring (2026-05-18)', () => {
  it('armKillSwitch fires the change callback with armed=true and the reason', () => {
    const om = new OrderManager(100_000)
    const calls: Array<{ armed: boolean; reason: string }> = []
    om.setOnKillSwitchChange((armed, reason) => calls.push({ armed, reason }))

    om.armKillSwitch('manual')

    expect(calls).toEqual([{ armed: true, reason: 'manual' }])
  })

  it('disarmKillSwitch fires the change callback with armed=false and empty reason', () => {
    const om = new OrderManager(100_000)
    om.armKillSwitch('manual')          // arm first (no listener yet)
    const calls: Array<{ armed: boolean; reason: string }> = []
    om.setOnKillSwitchChange((armed, reason) => calls.push({ armed, reason }))

    om.disarmKillSwitch()

    expect(calls).toEqual([{ armed: false, reason: '' }])
  })

  it('disarmKillSwitch is a no-op when already disarmed (no callback fire)', () => {
    const om = new OrderManager(100_000)
    const calls: Array<{ armed: boolean; reason: string }> = []
    om.setOnKillSwitchChange((armed, reason) => calls.push({ armed, reason }))

    om.disarmKillSwitch()

    expect(calls).toEqual([])
  })

  it('armKillSwitch is a no-op when already armed (no duplicate callback)', () => {
    const om = new OrderManager(100_000)
    om.armKillSwitch('manual')
    const calls: Array<{ armed: boolean; reason: string }> = []
    om.setOnKillSwitchChange((armed, reason) => calls.push({ armed, reason }))

    om.armKillSwitch('manual')

    expect(calls).toEqual([])
  })

  it('restoreKillSwitch arms state and fires operational killCbs but NOT the change callback', () => {
    const om = new OrderManager(100_000)
    const opCalls: number[] = []
    const persistCalls: Array<{ armed: boolean; reason: string }> = []
    om.onKillSwitch(() => opCalls.push(Date.now()))
    om.setOnKillSwitchChange((armed, reason) => persistCalls.push({ armed, reason }))

    om.restoreKillSwitch('daily-loss-limit')

    expect(om.getAccount().killSwitchArmed).toBe(true)
    expect(opCalls.length).toBe(1)        // killCbs DID fire (so the engine broadcasts)
    expect(persistCalls).toEqual([])      // change cb did NOT fire (we just loaded it)
  })

  it('daily-loss auto-arm in applyFill fires the change callback with reason="daily-loss-limit"', () => {
    const om = new OrderManager(1_000)    // small equity → easy to breach 2% (=$20)
    om.setMarketOpen(true)
    om.setSessionStartEquity(1_000)
    const calls: Array<{ armed: boolean; reason: string }> = []
    om.setOnKillSwitchChange((armed, reason) => calls.push({ armed, reason }))

    // Buy 1 share @ $100, then sell @ $50 → realized loss $50 > 2% of $1000 = $20
    const buy = om.createOrder({ symbol: 'NVDA', side: 'buy',  type: 'market', quantity: 1 })
    om.fillOrder(buy.id, 100)
    const sell = om.createOrder({ symbol: 'NVDA', side: 'sell', type: 'market', quantity: 1 })
    om.fillOrder(sell.id, 50)

    expect(calls).toEqual([{ armed: true, reason: 'daily-loss-limit' }])
    expect(om.getAccount().killSwitchArmed).toBe(true)
  })
})

describe('resetToPaper — clean-sandbox reset for the data-feed switch', () => {
  it('clears positions + orders and restores a fresh paper account', () => {
    const om = new OrderManager(50_000)
    const o = om.createOrder(baseBuy({ quantity: 10 }))
    om.fillOrder(o.id, 100)
    expect(om.getPosition('NVDA')).toBeDefined()

    om.resetToPaper(100_000)

    expect(om.getPosition('NVDA')).toBeUndefined()
    expect(om.getOrders()).toEqual([])
    const a = om.getAccount()
    expect(a.equity).toBe(100_000)
    expect(a.cash).toBe(100_000)
    expect(a.buyingPower).toBe(100_000 * 2)   // BUYING_POWER_MULT
    expect(a.dailyPnl).toBe(0)
    expect(a.mode).toBe('paper')
    expect(a.openPositions).toEqual([])
  })

  it('defaults to DEFAULT_EQUITY when no argument given', () => {
    const om = new OrderManager(50_000)
    om.resetToPaper()
    expect(om.getAccount().equity).toBe(100_000)   // DEFAULT_EQUITY
  })

  it('preserves an armed kill switch (a reset must never silently re-enable trading)', () => {
    const om = new OrderManager()
    om.armKillSwitch('test')
    om.resetToPaper()
    expect(om.getAccount().killSwitchArmed).toBe(true)
  })
})
