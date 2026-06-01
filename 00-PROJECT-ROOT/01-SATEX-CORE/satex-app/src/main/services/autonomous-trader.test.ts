/**
 * SATEX — AutonomousTrader tests.
 *
 * Locks in the bullish path that already worked AND the bearish path that
 * Phase B (G-9, 2026-05-29) enables. Drives the private `tryOne` directly
 * via bracket-access cast — keeps the production surface unchanged while
 * letting tests exercise a single cycle deterministically.
 */
import { describe, expect, it } from 'vitest'
import { AutonomousTrader, type AutonomousDeps } from './autonomous-trader'
import type { Account, AiDecision, IndicatorSnapshot, OrderRequest, Quote } from '@shared/types'

function makeQuote(symbol = 'NVDA', last = 100): Quote {
  return {
    symbol, name: symbol, assetClass: 'equity',
    last, bid: last - 0.01, ask: last + 0.01,
    prevClose: last, changePct: 0, change: 0, volume: 1000, vwap: last,
    sparkline: [], timestamp: Date.now(),
  }
}

function makeInd(atr14 = 1.0): IndicatorSnapshot {
  return {
    symbol: 'NVDA',
    vwap: 100, ema9: 100, ema21: 100, ema50: 100,
    rsi14: 50, atr14, trendStrength: 0, volatility: 0,
  }
}

function makeAccount(): Account {
  return {
    equity: 100_000, cash: 100_000, buyingPower: 400_000,
    openPositions: [], dailyPnl: 0, dailyLossLimitPct: 0.03,
    mode: 'paper', killSwitchArmed: false, sessionStartedAt: Date.now(),
  }
}

interface TestFixture {
  trader: AutonomousTrader
  submitted: OrderRequest[]
}

function buildFixture(decisionOverrides?: Partial<AiDecision>): TestFixture {
  const submitted: OrderRequest[] = []
  const deps: AutonomousDeps = {
    getWatchlist: () => ['NVDA'],
    getQuote: () => makeQuote(),
    getIndicators: () => makeInd(),
    getAccount: () => makeAccount(),
    isLiveCapitalRouted: () => false,
    getDecision: async (symbol): Promise<AiDecision> => ({
      symbol, bias: 'bullish', confidence: 0.8,
      localScore: 0.5, llmRationale: null, veto: false, vetoReason: null,
      generatedAt: Date.now(),
      ...decisionOverrides,
    }),
    submitOrder: async (req) => {
      submitted.push(req)
      return { ok: true, orderId: 'ord-test' }
    },
  }
  return { trader: new AutonomousTrader(deps), submitted }
}

/** Drive the private `tryOne` directly. Private is compile-time only;
 *  the method exists on the instance at runtime. */
async function driveTryOne(trader: AutonomousTrader, symbol: string, account: Account): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (trader as any).tryOne(symbol, account)
}

describe('AutonomousTrader — bullish path (regression baseline)', () => {
  it('submits a BUY order with stop BELOW entry and TP ABOVE entry on a bullish signal', async () => {
    const fx = buildFixture()
    await driveTryOne(fx.trader, 'NVDA', makeAccount())

    expect(fx.submitted).toHaveLength(1)
    const req = fx.submitted[0]!
    expect(req.side).toBe('buy')
    expect(req.stopLoss).toBeLessThan(100)      // stop below entry for longs
    expect(req.takeProfit).toBeGreaterThan(100) // TP above entry for longs
  })

  it('attaches the autonomous source tag', async () => {
    const fx = buildFixture()
    await driveTryOne(fx.trader, 'NVDA', makeAccount())
    expect(fx.submitted[0]!.source).toBe('autonomous')
  })
})

describe('AutonomousTrader — bearish path (Phase B G-9, 2026-05-29)', () => {
  it('submits a SELL order with stop ABOVE entry and TP BELOW entry on a bearish signal', async () => {
    const fx = buildFixture({ bias: 'bearish', localScore: -0.5 })
    await driveTryOne(fx.trader, 'NVDA', makeAccount())

    expect(fx.submitted).toHaveLength(1)
    const req = fx.submitted[0]!
    expect(req.side).toBe('sell')
    expect(req.stopLoss).toBeGreaterThan(100)   // stop ABOVE entry for shorts
    expect(req.takeProfit).toBeLessThan(100)    // TP BELOW entry for shorts
  })

  it('preserves symmetric reward:risk between long and short', async () => {
    const entry = 100

    const long = buildFixture({ bias: 'bullish' })
    await driveTryOne(long.trader, 'NVDA', makeAccount())
    const longReq = long.submitted[0]!
    const longRR = (longReq.takeProfit! - entry) / (entry - longReq.stopLoss!)

    const short = buildFixture({ bias: 'bearish', localScore: -0.5 })
    await driveTryOne(short.trader, 'NVDA', makeAccount())
    const shortReq = short.submitted[0]!
    const shortRR = (entry - shortReq.takeProfit!) / (shortReq.stopLoss! - entry)

    // Should be exactly takeProfitAtrMult / stopAtrMult on both sides.
    const cfg = long.trader.getConfig()
    const expectedRR = cfg.takeProfitAtrMult / cfg.stopAtrMult
    expect(longRR).toBeCloseTo(expectedRR, 6)
    expect(shortRR).toBeCloseTo(expectedRR, 6)
    expect(shortRR).toBeCloseTo(longRR, 6)
  })

  it('attaches source tag for shorts too', async () => {
    const fx = buildFixture({ bias: 'bearish', localScore: -0.5 })
    await driveTryOne(fx.trader, 'NVDA', makeAccount())
    expect(fx.submitted[0]!.source).toBe('autonomous')
  })
})

describe('AutonomousTrader — neutral / low-confidence still vetoed', () => {
  it('records a rejection (not a submission) on a neutral signal', async () => {
    const fx = buildFixture({ bias: 'neutral', confidence: 0.0, localScore: 0 })
    await driveTryOne(fx.trader, 'NVDA', makeAccount())
    expect(fx.submitted).toHaveLength(0)
    const recent = fx.trader.getRecent()
    expect(recent).toHaveLength(1)
    expect(recent[0]!.approved).toBe(false)
  })

  it('records a rejection on a bearish signal below the confidence threshold', async () => {
    const fx = buildFixture({ bias: 'bearish', confidence: 0.05, localScore: -0.05 })
    await driveTryOne(fx.trader, 'NVDA', makeAccount())
    expect(fx.submitted).toHaveLength(0)
  })
})

// ─── Tier-2 ensemble path ────────────────────────────────────────────────
import type { StrategySignal } from '@shared/types'

function buildSignalFixture(signal: StrategySignal | null) {
  const submitted: OrderRequest[] = []
  const deps: AutonomousDeps = {
    getWatchlist: () => ['NVDA'],
    getQuote: () => makeQuote(),
    getIndicators: () => makeInd(),
    getAccount: () => makeAccount(),
    isLiveCapitalRouted: () => false,
    // Legacy path must not be invoked when getSignal is wired.
    getDecision: async () => {
      throw new Error('getDecision should not be called when getSignal is wired')
    },
    submitOrder: async (req) => {
      submitted.push(req)
      return { ok: true, orderId: 'ord-test' }
    },
    getSignal: async () => signal,
  }
  return { trader: new AutonomousTrader(deps), submitted }
}

describe('AutonomousTrader — getSignal (Tier-2 ensemble path)', () => {
  it('uses the strategy signal verbatim (stops + TP from signal, NOT ATR-derived)', async () => {
    const sig: StrategySignal = {
      setup: 'momentum', symbol: 'NVDA', action: 'buy',
      confidence: 0.8,
      stopLossHint: 95.5,
      takeProfitHint: 108.5,
      atrHint: 2,
      createdAt: 0,
    }
    const fx = buildSignalFixture(sig)
    await driveTryOne(fx.trader, 'NVDA', makeAccount())

    expect(fx.submitted).toHaveLength(1)
    const req = fx.submitted[0]!
    expect(req.side).toBe('buy')
    expect(req.stopLoss).toBe(95.5)
    expect(req.takeProfit).toBe(108.5)
    expect(req.source).toBe('autonomous-momentum')
  })

  it('records a rejection when the strategy abstains (returns null)', async () => {
    const fx = buildSignalFixture(null)
    await driveTryOne(fx.trader, 'NVDA', makeAccount())
    expect(fx.submitted).toHaveLength(0)
    const recent = fx.trader.getRecent()
    expect(recent).toHaveLength(1)
    expect(recent[0]!.approved).toBe(false)
    expect(recent[0]!.reason).toContain('abstained')
  })

  it('records a rejection when the signal confidence is below threshold', async () => {
    const fx = buildSignalFixture({
      setup: 'breakout', symbol: 'NVDA', action: 'sell',
      confidence: 0.05,
      stopLossHint: 103, takeProfitHint: 94,
      atrHint: 2, createdAt: 0,
    })
    await driveTryOne(fx.trader, 'NVDA', makeAccount())
    expect(fx.submitted).toHaveLength(0)
    const recent = fx.trader.getRecent()
    expect(recent[0]!.reason).toContain('breakout')
    expect(recent[0]!.reason).toContain('5%')
  })

  it('does not call getDecision when getSignal is wired', async () => {
    // buildSignalFixture''s getDecision throws — reaching the end without
    // throwing proves the legacy path is NOT executed.
    const sig: StrategySignal = {
      setup: 'momentum', symbol: 'NVDA', action: 'buy',
      confidence: 0.7,
      stopLossHint: 99, takeProfitHint: 105,
      atrHint: 2, createdAt: 0,
    }
    const fx = buildSignalFixture(sig)
    await driveTryOne(fx.trader, 'NVDA', makeAccount())
    expect(fx.submitted).toHaveLength(1)
  })

  it('passes short-side signal through with mirrored brackets', async () => {
    const fx = buildSignalFixture({
      setup: 'mean-reversion', symbol: 'NVDA', action: 'sell',
      confidence: 0.6,
      stopLossHint: 105,
      takeProfitHint: 92,
      atrHint: 2, createdAt: 0,
    })
    await driveTryOne(fx.trader, 'NVDA', makeAccount())
    const req = fx.submitted[0]!
    expect(req.side).toBe('sell')
    expect(req.stopLoss).toBe(105)
    expect(req.takeProfit).toBe(92)
    expect(req.source).toBe('autonomous-mean-reversion')
  })

  it('signalsFired increments even when strategy abstains', async () => {
    const fx = buildSignalFixture(null)
    await driveTryOne(fx.trader, 'NVDA', makeAccount())
    expect(fx.trader.getStatus().signalsFired).toBe(1)
  })
})
