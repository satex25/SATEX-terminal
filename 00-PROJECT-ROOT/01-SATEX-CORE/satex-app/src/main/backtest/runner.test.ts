/**
 * SATEX — BacktestRunner tests.
 * Synthetic tapes exercise the required behaviors:
 *   - Long trade hits TP
 *   - Long trade hits stop
 *   - Short trade hits TP
 *   - End-of-tape force-closes an open position
 *   - Equity curve sanity
 *   - Config round-trips into the report
 */
import { describe, expect, it } from 'vitest'
import { BacktestRunner } from './runner'
import { ZeroSlippageModel } from './slippage-model'
import type { Strategy, StrategySnapshot } from './strategy'
import type { Candle, StrategySignal } from '@shared/types'

/** Build N bars stepping by 1 minute, all OHLC == close. */
function ramp(closes: number[]): Candle[] {
  return closes.map((c, i) => ({
    time: 1_700_000_000 + i * 60,
    open: c, high: c, low: c, close: c, volume: 1000,
  }))
}

/** Always-long strategy that fires once at the first bar after entryAt. */
class AlwaysBuyAt implements Strategy {
  readonly name = 'always-buy'
  private fired = false
  constructor(
    private readonly entryAt: number,
    private readonly stop: number,
    private readonly tp: number,
  ) {}
  decide(snap: StrategySnapshot): StrategySignal | null {
    if (this.fired) return null
    if (snap.ts < this.entryAt) return null
    this.fired = true
    return {
      setup: 'test', symbol: snap.symbol, action: 'buy', confidence: 1,
      stopLossHint: this.stop, takeProfitHint: this.tp, atrHint: 1, createdAt: snap.ts,
    }
  }
}

/** Always-short strategy mirror. */
class AlwaysSellAt implements Strategy {
  readonly name = 'always-sell'
  private fired = false
  constructor(
    private readonly entryAt: number,
    private readonly stop: number,
    private readonly tp: number,
  ) {}
  decide(snap: StrategySnapshot): StrategySignal | null {
    if (this.fired) return null
    if (snap.ts < this.entryAt) return null
    this.fired = true
    return {
      setup: 'test', symbol: snap.symbol, action: 'sell', confidence: 1,
      stopLossHint: this.stop, takeProfitHint: this.tp, atrHint: 1, createdAt: snap.ts,
    }
  }
}

const cfg = (over?: object) => ({
  strategy: 'test', symbol: 'NVDA', tape: 'in-memory',
  startingEquity: 100_000, slippageModel: 'zero', notionalPct: 0.05,
  ...over,
})

describe('BacktestRunner', () => {
  it('long trade hits TP and records a winning ClosedTrade', () => {
    const candles = ramp([...Array(51).fill(100), 105, 110, 115, 120])
    const entryAt = candles[51]!.time * 1000
    const strat = new AlwaysBuyAt(entryAt, /*stop*/ 95, /*tp*/ 115)
    const runner = new BacktestRunner(strat, new ZeroSlippageModel(), cfg())
    const report = runner.run({ candles, assetClass: 'equity' })

    expect(report.trades).toHaveLength(1)
    const t = report.trades[0]!
    expect(t.side).toBe('long')
    expect(t.triggeredBy).toBe('take-profit')
    expect(t.exitPrice).toBe(115)
    expect(t.pnl).toBeGreaterThan(0)
    expect(report.endingEquity).toBeGreaterThan(report.startingEquity)
  })

  it('long trade hits stop and records a losing ClosedTrade', () => {
    const candles = ramp([...Array(51).fill(100), 98, 95, 92, 90])
    const entryAt = candles[51]!.time * 1000
    const strat = new AlwaysBuyAt(entryAt, /*stop*/ 95, /*tp*/ 110)
    const runner = new BacktestRunner(strat, new ZeroSlippageModel(), cfg())
    const report = runner.run({ candles, assetClass: 'equity' })

    expect(report.trades).toHaveLength(1)
    const t = report.trades[0]!
    expect(t.triggeredBy).toBe('stop-loss')
    expect(t.exitPrice).toBe(95)
    expect(t.pnl).toBeLessThan(0)
  })

  it('short trade hits TP and records a winning ClosedTrade', () => {
    const candles = ramp([...Array(51).fill(100), 98, 95, 92, 90])
    const entryAt = candles[51]!.time * 1000
    const strat = new AlwaysSellAt(entryAt, /*stop*/ 105, /*tp*/ 92)
    const runner = new BacktestRunner(strat, new ZeroSlippageModel(), cfg())
    const report = runner.run({ candles, assetClass: 'equity' })

    expect(report.trades).toHaveLength(1)
    const t = report.trades[0]!
    expect(t.side).toBe('short')
    expect(t.triggeredBy).toBe('take-profit')
    expect(t.exitPrice).toBe(92)
    expect(t.pnl).toBeGreaterThan(0)
  })

  it('force-closes an open position at end-of-tape (triggeredBy = null)', () => {
    const candles = ramp([...Array(51).fill(100), 101, 102, 103])
    const entryAt = candles[51]!.time * 1000
    const strat = new AlwaysBuyAt(entryAt, /*stop*/ 50, /*tp*/ 200)
    const runner = new BacktestRunner(strat, new ZeroSlippageModel(), cfg())
    const report = runner.run({ candles, assetClass: 'equity' })

    expect(report.trades).toHaveLength(1)
    expect(report.trades[0]!.triggeredBy).toBeNull()
    expect(report.trades[0]!.exitPrice).toBe(103)
  })

  it('produces an equity curve with one point per bar', () => {
    const candles = ramp([...Array(60).fill(100)])
    const runner = new BacktestRunner(
      new AlwaysBuyAt(Infinity, 0, 0),
      new ZeroSlippageModel(),
      cfg(),
    )
    const report = runner.run({ candles, assetClass: 'equity' })
    expect(report.equityCurve).toHaveLength(60)
    expect(report.equityCurve[0]!.equity).toBe(100_000)
    expect(report.equityCurve[report.equityCurve.length - 1]!.equity).toBe(100_000)
  })

  it('stamps BacktestConfig into the report verbatim', () => {
    const candles = ramp([...Array(60).fill(100)])
    const c = cfg({ symbol: 'BTC', strategy: 'demo' })
    const runner = new BacktestRunner(new AlwaysBuyAt(Infinity, 0, 0), new ZeroSlippageModel(), c)
    const report = runner.run({ candles, assetClass: 'crypto' })
    expect(report.config).toEqual(c)
  })

  it('returns zero trades when strategy never signals', () => {
    const candles = ramp([...Array(60).fill(100)])
    const runner = new BacktestRunner(
      new AlwaysBuyAt(Infinity, 0, 0),
      new ZeroSlippageModel(),
      cfg(),
    )
    const report = runner.run({ candles, assetClass: 'equity' })
    expect(report.trades).toHaveLength(0)
    expect(report.metrics.tradeCount).toBe(0)
  })

  it('honors notionalPct for position sizing', () => {
    // 5% of 100k = 5k. Entry bar is index 51 at price 100 → 50 shares.
    // Bar 52 at price 95 triggers the stop → loss of $250.
    const candles = ramp([...Array(52).fill(100), 95])
    const entryAt = candles[51]!.time * 1000
    const strat = new AlwaysBuyAt(entryAt, /*stop*/ 95, /*tp*/ 200)
    const runner = new BacktestRunner(strat, new ZeroSlippageModel(), cfg({ notionalPct: 0.05 }))
    const report = runner.run({ candles, assetClass: 'equity' })
    expect(report.trades[0]!.quantity).toBe(50)
    expect(report.trades[0]!.pnl).toBeCloseTo(-250, 6)
  })

  it('records hold duration in ms', () => {
    // Entry on bar 51 (close=100). Stop hits on bar 52 (close=low=95). Δt = 60s.
    const candles = ramp([...Array(52).fill(100), 95])
    const entryAt = candles[51]!.time * 1000
    const strat = new AlwaysBuyAt(entryAt, /*stop*/ 95, /*tp*/ 110)
    const runner = new BacktestRunner(strat, new ZeroSlippageModel(), cfg())
    const report = runner.run({ candles, assetClass: 'equity' })
    expect(report.trades[0]!.holdMs).toBe(60_000)
  })
})
