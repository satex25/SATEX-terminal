/**
 * SATEX — BacktestRunner.
 * Synchronous over a pre-loaded Candle[] array. One open position at a time
 * (no pyramiding for v1). Bracket resolution is intra-bar with conservative
 * worst-case ordering: if both stop and TP could have triggered in a single
 * bar, the stop wins. Strategy.decide is only called when no position is
 * open, gated by `warmupBars` so early bars don't fire on uninitialized
 * indicators. End-of-tape force-closes any still-open position at the
 * final bar's close.
 *
 * Equity accounting:
 *   equity(t) = startingEquity + realizedPnL + unrealizedPnL(t)
 *   Long  PnL = qty × (exitPrice − entryPrice)
 *   Short PnL = qty × (entryPrice − exitPrice)
 *
 * Out of scope for v1: pyramiding, multi-symbol, intra-bar tick resolution,
 * funded-account rule profiles (Tier-1 work), TCA breakdown.
 *
 * G-10 Task C.5.
 */
import { randomUUID } from 'node:crypto'
import { computeSnapshot } from '@shared/indicators'
import { computeMultiTimeframe } from '@shared/indicators-mtf'
import type { AssetClass, Candle, ClosedTrade, OrderRequest, Quote } from '@shared/types'
import { computeMetrics } from '@shared/backtest/metrics'
import type { BacktestConfig, BacktestReport, EquityPoint } from '@shared/backtest/types'
import type { SlippageModel } from './slippage-model'
import type { Strategy, StrategySnapshot } from './strategy'

interface OpenPos {
  ts: number
  symbol: string
  side: 'long' | 'short'
  quantity: number
  entryPrice: number
  stopLoss: number
  takeProfit: number
}

export interface BacktestRunInput {
  candles: Candle[]
  assetClass: AssetClass
  /** Bars to skip before strategy.decide is allowed to fire. Default 50. */
  warmupBars?: number
  /** Used for Sharpe/Sortino annualization. Default = 252 × 6.5 × 60 = 98280
   *  (1-minute equity bars). Daily bars: pass 252. */
  periodsPerYear?: number
  /** Tier-2 E.2 — when true, attach a `multiTimeframe` snapshot to every
   *  StrategySnapshot. Adds O(bars × timeframes) work per decide call;
   *  default false so Phase-C BrainStrategy back-tests keep their speed. */
  withMultiTimeframe?: boolean
}

export class BacktestRunner {
  constructor(
    private readonly strategy: Strategy,
    private readonly slippage: SlippageModel,
    private readonly config: BacktestConfig,
  ) {}

  run(input: BacktestRunInput): BacktestReport {
    const startedAt = Date.now()
    const { candles, assetClass } = input
    const warmup = input.warmupBars ?? 50
    const periodsPerYear = input.periodsPerYear ?? (252 * 6.5 * 60)
    const notionalPct = this.config.notionalPct ?? 0.05

    const trades: ClosedTrade[] = []
    const curve: EquityPoint[] = []
    const startingEquity = this.config.startingEquity
    let realizedPnl = 0
    let open: OpenPos | null = null

    for (let i = 0; i < candles.length; i++) {
      const candle = candles[i]!
      const tsMs = candle.time * 1000

      // 1. Resolve any open bracket against this bar's H/L.
      if (open) {
        const closed = checkBrackets(open, candle, tsMs)
        if (closed) {
          trades.push(closed)
          realizedPnl += closed.pnl
          open = null
        }
      }

      // 2. If no position and past warmup: ask the strategy.
      if (!open && i >= warmup) {
        const indicators = computeSnapshot(this.config.symbol, candles.slice(Math.max(0, i - 199), i + 1))
        const prevClose = candles[i - 1]?.close ?? candle.close
        const quote: Quote = {
          symbol: this.config.symbol,
          name: this.config.symbol,
          assetClass,
          last: candle.close,
          bid: candle.close - 0.01,
          ask: candle.close + 0.01,
          prevClose,
          changePct: prevClose > 0 ? (candle.close - prevClose) / prevClose : 0,
          change: candle.close - prevClose,
          volume: candle.volume,
          vwap: indicators.vwap,
          sparkline: [],
          timestamp: tsMs,
        }

        const snap: StrategySnapshot = { ts: tsMs, symbol: this.config.symbol, quote, indicators }
        if (input.withMultiTimeframe) {
          snap.multiTimeframe = computeMultiTimeframe(
            this.config.symbol,
            candles.slice(Math.max(0, i - 199), i + 1),
          )
        }
        const signal = this.strategy.decide(snap)
        if (signal) {
          const equityNow = startingEquity + realizedPnl
          const targetNotional = equityNow * notionalPct
          const qty = Math.max(1, Math.floor(targetNotional / quote.last))
          const orderReq: OrderRequest = {
            symbol: signal.symbol,
            side: signal.action,
            type: 'market',
            quantity: qty,
            stopLoss: signal.stopLossHint,
            takeProfit: signal.takeProfitHint,
            source: 'backtest',
          }
          const slip = this.slippage.fill(orderReq, { quote })
          open = {
            ts: tsMs,
            symbol: signal.symbol,
            side: signal.action === 'buy' ? 'long' : 'short',
            quantity: qty,
            entryPrice: slip.fillPrice,
            stopLoss: signal.stopLossHint,
            takeProfit: signal.takeProfitHint,
          }
        }
      }

      // 3. Mark-to-market equity at this bar's close.
      const unrealized = open ? markToMarket(open, candle.close) : 0
      curve.push({ ts: tsMs, equity: startingEquity + realizedPnl + unrealized })
    }

    // 4. Force-close any open position at the last bar's close.
    if (open && candles.length > 0) {
      const lastCandle = candles[candles.length - 1]!
      const closed = closeAt(open, lastCandle.close, lastCandle.time * 1000, null)
      trades.push(closed)
      realizedPnl += closed.pnl
      // Replace the final equity point so realized == unrealized at end.
      curve[curve.length - 1] = {
        ts: curve[curve.length - 1]!.ts,
        equity: startingEquity + realizedPnl,
      }
    }

    const endedAt = Date.now()
    const endingEquity = startingEquity + realizedPnl
    const metrics = computeMetrics(curve, trades, periodsPerYear)

    return {
      config: this.config,
      startedAt,
      endedAt,
      startingEquity,
      endingEquity,
      equityCurve: curve,
      trades,
      metrics,
    }
  }
}

function checkBrackets(open: OpenPos, candle: Candle, tsMs: number): ClosedTrade | null {
  if (open.side === 'long') {
    if (candle.low <= open.stopLoss)    return closeAt(open, open.stopLoss,   tsMs, 'stop-loss')
    if (candle.high >= open.takeProfit) return closeAt(open, open.takeProfit, tsMs, 'take-profit')
  } else {
    if (candle.high >= open.stopLoss)   return closeAt(open, open.stopLoss,   tsMs, 'stop-loss')
    if (candle.low <= open.takeProfit)  return closeAt(open, open.takeProfit, tsMs, 'take-profit')
  }
  return null
}

function closeAt(
  open: OpenPos,
  exitPrice: number,
  tsMs: number,
  triggeredBy: 'stop-loss' | 'take-profit' | null,
): ClosedTrade {
  const pnl = open.side === 'long'
    ? open.quantity * (exitPrice - open.entryPrice)
    : open.quantity * (open.entryPrice - exitPrice)
  const entryNotional = open.entryPrice * open.quantity
  const pnlPct = entryNotional > 0 ? pnl / entryNotional : 0
  return {
    id: randomUUID(),
    symbol: open.symbol,
    side: open.side,
    quantity: open.quantity,
    entryPrice: open.entryPrice,
    exitPrice,
    pnl,
    pnlPct,
    holdMs: tsMs - open.ts,
    closedAt: tsMs,
    triggeredBy,
    source: 'backtest',
    tags: [],
    conviction: null,
    regimeAtEntry: null,
    entrySlippageBps: null,
  }
}

function markToMarket(open: OpenPos, lastPrice: number): number {
  return open.side === 'long'
    ? open.quantity * (lastPrice - open.entryPrice)
    : open.quantity * (open.entryPrice - lastPrice)
}
