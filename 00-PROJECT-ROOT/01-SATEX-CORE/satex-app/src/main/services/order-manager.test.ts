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
import { FixedBpsSlippageModel, SpreadHalfPlusImpactModel } from '../backtest/slippage-model'
import type { OrderRequest, StrategySignal } from '../../shared/types'
import type { AccountSnapshot } from '../../shared/broker/account-syncer'
import { TOPSTEP_50K_XFA } from '../../shared/funded/topstep-50k-xfa'

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
    // synced from broker; dailyPnl now reflects equity - new baseline.
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
    om.syncFromSnapshot({ equity: 100_000, cash: 100_000, buyingPower: 100_000, positions: [], observedAt: Date.now() })
    om.setSessionStartEquity(100_000)
    // Simulate equity drop within the daily-loss cap (default 2%): -1_500 of 100k = 1.5%
    om.syncFromSnapshot({ equity: 98_500, cash: 98_500, buyingPower: 98_500, positions: [], observedAt: Date.now() })
    expect(om.validate(baseBuy({ quantity: 1 }), liveCtx({ refPrice: 100 })).ok).toBe(true)
    // Now breach: drop to -2.5%
    om.syncFromSnapshot({ equity: 97_500, cash: 97_500, buyingPower: 97_500, positions: [], observedAt: Date.now() })
    const res = om.validate(baseBuy({ quantity: 1 }), liveCtx({ refPrice: 100 }))
    expect(res.ok).toBe(false)
    expect(res.gate).toBe('daily-loss')
  })

  it('T5: Gate 3 funded DLL — absolute cap wins when tighter than pct limit (P0-A)', () => {
    // Session: $100K start, 2% pct limit = $2K DLL. Funded profile cap = $1K → must win.
    om.setMarketOpen(true)
    om.syncFromSnapshot({ equity: 100_000, cash: 100_000, buyingPower: 200_000, positions: [], observedAt: Date.now() })
    om.setSessionStartEquity(100_000)
    // Use the real preset — dailyLossLimit=1_000 already; avoids missing fields crashing Gates 10-11.
    const fundedProfile = TOPSTEP_50K_XFA
    // Pin nowMs to 10:30 AM ET so Gate 12 (flatBy 16:10 ET) never fires.
    const nowMs = new Date('2026-06-16T14:30:00.000Z').getTime() // 10:30 AM ET
    // Loss = $900 < $1K abs cap — should pass
    om.syncFromSnapshot({ equity: 99_100, cash: 99_100, buyingPower: 198_200, positions: [], observedAt: nowMs })
    expect(om.validate(baseBuy({ quantity: 1 }), liveCtx({ refPrice: 50, fundedProfile, nowMs })).ok).toBe(true)
    // Loss = $1_100 > $1K abs cap (but < $2K pct cap) — must reject with funded reason
    om.syncFromSnapshot({ equity: 98_900, cash: 98_900, buyingPower: 197_800, positions: [], observedAt: nowMs })
    const res = om.validate(baseBuy({ quantity: 1 }), liveCtx({ refPrice: 50, fundedProfile, nowMs }))
    expect(res.ok).toBe(false)
    expect(res.gate).toBe('daily-loss')
    expect(res.reason).toContain('funded-account cap')
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

describe('OrderManager — syncFromSnapshot (F.1 L1.A Task 1.7)', () => {
  it('syncFromSnapshot accepts AccountSnapshot directly and sets equity', () => {
    const om = new OrderManager(100_000)
    const snap: AccountSnapshot = {
      equity: 50_000,
      cash: 50_000,
      buyingPower: 100_000,
      positions: [],
      observedAt: Date.now(),
    }
    om.syncFromSnapshot(snap)
    expect(om.getAccount().equity).toBe(50_000)
  })

  it('syncFromSnapshot sets cash and buyingPower', () => {
    const om = new OrderManager(100_000)
    const snap: AccountSnapshot = {
      equity: 75_000,
      cash: 30_000,
      buyingPower: 60_000,
      positions: [],
      observedAt: Date.now(),
    }
    om.syncFromSnapshot(snap)
    const acct = om.getAccount()
    expect(acct.cash).toBe(30_000)
    expect(acct.buyingPower).toBe(60_000)
  })

  it('syncFromSnapshot replaces positions from the snapshot', () => {
    const om = new OrderManager(100_000)
    const pos: import('../../shared/types').Position = {
      symbol: 'NVDA', quantity: 10, avgPrice: 100,
      unrealizedPnl: 0, realizedPnl: 0, openedAt: Date.now(),
    }
    const snap: AccountSnapshot = {
      equity: 100_000, cash: 100_000, buyingPower: 200_000,
      positions: [pos], observedAt: Date.now(),
    }
    om.syncFromSnapshot(snap)
    expect(om.getPosition('NVDA')).toBeDefined()
    expect(om.getAccount().openPositions).toHaveLength(1)
  })

  it('syncFromSnapshot computes dailyPnl against sessionStartEquity', () => {
    const om = new OrderManager(100_000)
    om.setSessionStartEquity(100_000)
    const snap: AccountSnapshot = {
      equity: 98_000, cash: 98_000, buyingPower: 196_000,
      positions: [], observedAt: Date.now(),
    }
    om.syncFromSnapshot(snap)
    expect(om.getAccount().dailyPnl).toBeCloseTo(-2_000)
  })
})

describe('OrderManager — slippage model injection (G-11, 2026-05-29)', () => {
  it('defaults to ZeroSlippageModel when no model is provided (backwards compatible)', () => {
    const om = new OrderManager(100_000)
    expect(om.getSlippageModel().name).toBe('zero')
  })

  it('accepts an injected FixedBpsSlippageModel', () => {
    const fixed = new FixedBpsSlippageModel(5)
    const om = new OrderManager(100_000, fixed)
    expect(om.getSlippageModel().name).toBe('fixed-bps')
    expect(om.getSlippageModel()).toBe(fixed) // exact reference
  })

  it('accepts an injected SpreadHalfPlusImpactModel', () => {
    const spread = new SpreadHalfPlusImpactModel({ impactCoef: 0.0001 })
    const om = new OrderManager(100_000, spread)
    expect(om.getSlippageModel().name).toBe('spread-half-impact')
  })

  it('resetToPaper() does NOT change the slippage model', () => {
    const fixed = new FixedBpsSlippageModel(5)
    const om = new OrderManager(100_000, fixed)
    om.resetToPaper(50_000)
    expect(om.getSlippageModel()).toBe(fixed)
  })
})

// ─── Tier-1 (D.8) — Topstep funded-account gates 9-13 ─────────────────────
import type { MacroEvent } from '@shared/types'

describe('OrderManager — Tier-1 Topstep gates (D.8)', () => {
  function fundedCtx(over?: Partial<OrderValidationContext>): OrderValidationContext {
    return {
      refPrice: 100,
      refPriceAge: 100,
      liveMode: false,
      notionalCap: 1_000_000,
      assetClass: 'equity',
      fundedProfile: TOPSTEP_50K_XFA,
      fundedMll: 48_000,
      worstCaseLossDollar: 0,
      currentPositionQty: 0,
      macroEvents: [],
      nowMs: Date.parse('2026-05-29T15:00:00Z'), // 11am ET, before cutoff
      ...over,
    }
  }

  describe('Gate 9 — trailing MaxDD', () => {
    it('passes when worst-case loss keeps equity above MLL', () => {
      const om = new OrderManager(50_000)
      om.setMarketOpen(true)
      const ctx = fundedCtx({ worstCaseLossDollar: 1_000 })
      expect(om.validate(baseBuy(), ctx).ok).toBe(true)
    })

    it('rejects when worst-case loss would breach MLL', () => {
      const om = new OrderManager(50_000)
      om.setMarketOpen(true)
      const ctx = fundedCtx({ worstCaseLossDollar: 2_500 })
      const r = om.validate(baseBuy(), ctx)
      expect(r.ok).toBe(false)
      expect(r.gate).toBe('funded-mll')
    })
  })

  describe('Gate 10 — news blackout', () => {
    const nowMs = Date.parse('2026-05-29T13:30:00Z')
    function evt(offsetSec: number, impact: 'high' | 'med' = 'high'): MacroEvent {
      return {
        id: 'cpi', label: 'US CPI', cons: '+0.2%', actual: '—', impact,
        tsUtc: new Date(nowMs + offsetSec * 1000).toISOString(),
      }
    }

    it('passes when no events are in the ±60s window', () => {
      const om = new OrderManager(50_000)
      om.setMarketOpen(true)
      const ctx = fundedCtx({ nowMs, macroEvents: [evt(300)] })
      expect(om.validate(baseBuy(), ctx).ok).toBe(true)
    })

    it('rejects when a high-impact event is inside the window', () => {
      const om = new OrderManager(50_000)
      om.setMarketOpen(true)
      const ctx = fundedCtx({ nowMs, macroEvents: [evt(30)] })
      const r = om.validate(baseBuy(), ctx)
      expect(r.ok).toBe(false)
      expect(r.gate).toBe('funded-blackout')
      expect(r.reason).toContain('CPI')
    })

    it('ignores med-impact events for the Topstep profile (high-only blackout)', () => {
      const om = new OrderManager(50_000)
      om.setMarketOpen(true)
      const ctx = fundedCtx({ nowMs, macroEvents: [evt(30, 'med')] })
      expect(om.validate(baseBuy(), ctx).ok).toBe(true)
    })
  })

  describe('Gate 11 — max contracts', () => {
    it('AAPL (unlisted) → buy 1 → OK at default cap', () => {
      const om = new OrderManager(50_000)
      om.setMarketOpen(true)
      expect(om.validate(baseBuy({ symbol: 'AAPL', quantity: 1 }), fundedCtx()).ok).toBe(true)
    })

    it('AAPL → buy 2 → REJECT (default cap = 1)', () => {
      const om = new OrderManager(50_000)
      om.setMarketOpen(true)
      const r = om.validate(baseBuy({ symbol: 'AAPL', quantity: 2 }), fundedCtx())
      expect(r.ok).toBe(false)
      expect(r.gate).toBe('funded-max-contracts')
    })

    it('ES (cap 5) → buy 5 → OK', () => {
      const om = new OrderManager(50_000)
      om.setMarketOpen(true)
      expect(om.validate(baseBuy({ symbol: 'ES', quantity: 5 }), fundedCtx()).ok).toBe(true)
    })

    it('ES → buy 6 → REJECT', () => {
      const om = new OrderManager(50_000)
      om.setMarketOpen(true)
      expect(om.validate(baseBuy({ symbol: 'ES', quantity: 6 }), fundedCtx()).gate).toBe('funded-max-contracts')
    })
  })

  describe('Gate 12 — post-EOD-flat', () => {
    it('rejects new BUY entries after 4:10 PM ET', () => {
      const om = new OrderManager(50_000)
      om.setMarketOpen(true)
      const ctx = fundedCtx({ nowMs: Date.parse('2026-05-29T20:15:00Z') })
      const r = om.validate(baseBuy({ symbol: 'ES' }), ctx)
      expect(r.ok).toBe(false)
      expect(r.gate).toBe('funded-eod')
    })

    it('allows closing SELL (long → exit) after the cutoff', () => {
      const om = new OrderManager(50_000)
      om.setMarketOpen(true)
      const ctx = fundedCtx({
        nowMs: Date.parse('2026-05-29T20:15:00Z'),
        currentPositionQty: 3,
      })
      expect(om.validate(baseSell({ symbol: 'ES', quantity: 3 }), ctx).ok).toBe(true)
    })

    it('rejects new SELL (short opening) after the cutoff', () => {
      const om = new OrderManager(50_000)
      om.setMarketOpen(true)
      const ctx = fundedCtx({
        nowMs: Date.parse('2026-05-29T20:15:00Z'),
        currentPositionQty: 0,
      })
      const r = om.validate(baseSell({ symbol: 'ES', quantity: 1 }), ctx)
      expect(r.ok).toBe(false)
      expect(r.gate).toBe('funded-eod')
    })
  })

  describe('Gate 13 — allowed asset class', () => {
    it('equity allowed (overlay default)', () => {
      const om = new OrderManager(50_000)
      om.setMarketOpen(true)
      expect(om.validate(baseBuy(), fundedCtx({ assetClass: 'equity' })).ok).toBe(true)
    })

    it('index rejected (not in Topstep overlay list)', () => {
      const om = new OrderManager(50_000)
      om.setMarketOpen(true)
      const r = om.validate(baseBuy(), fundedCtx({ assetClass: 'index' }))
      expect(r.ok).toBe(false)
      expect(r.gate).toBe('funded-asset-class')
    })
  })

  describe('No-profile bypass', () => {
    it('skips every Tier-1 gate when fundedProfile is undefined', () => {
      const om = new OrderManager(100_000)
      om.setMarketOpen(true)
      const ctx: OrderValidationContext = {
        refPrice: 100, refPriceAge: 100, liveMode: false,
        notionalCap: 1_000_000, assetClass: 'index', // index would trip Gate 13 if profile set
      }
      // AAPL qty=2 — would trip funded-max-contracts (default cap=1) if
      // profile were attached, but with no profile every Tier-1 gate is
      // inert. Index asset class would trip Gate 13. Neither fires here.
      expect(om.validate(baseBuy({ symbol: 'AAPL', quantity: 2 }), ctx).ok).toBe(true)
    })
  })
})

describe('OrderManager — cancelAllOrders + flattenAllPositions', () => {
  it('cancelAllOrders cancels every pending order and reports the count', () => {
    const om = new OrderManager(100_000)
    om.createOrder({ symbol: 'NVDA', side: 'buy', type: 'market', quantity: 1 })
    om.createOrder({ symbol: 'AAPL', side: 'buy', type: 'market', quantity: 1 })
    const n = om.cancelAllOrders()
    expect(n).toBe(2)
    for (const o of om.getOrders()) expect(o.status).toBe('canceled')
  })

  it('flattenAllPositions market-closes every open position', () => {
    const om = new OrderManager(100_000)
    const buy = om.createOrder({ symbol: 'NVDA', side: 'buy', type: 'market', quantity: 10 })
    om.fillOrder(buy.id, 100)
    expect(om.getAccount().openPositions).toHaveLength(1)
    const n = om.flattenAllPositions(() => ({ last: 102 }))
    expect(n).toBe(1)
    expect(om.getAccount().openPositions).toHaveLength(0)
  })
})
