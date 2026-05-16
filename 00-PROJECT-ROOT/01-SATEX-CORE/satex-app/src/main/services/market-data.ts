/**
 * SATEX — Deterministic GBM Market Simulator
 * Implements MarketDataSource. Used when SATEX_USE_SIMULATOR=true or no credentials.
 * Same seed → identical tick stream. No Math.random() in simulation path.
 */
import {
  SIMULATOR_CANDLE_INTERVAL_SEC, SPARKLINE_LENGTH, TICK_HZ, UNIVERSE, type UniverseEntry
} from '@shared/constants'
import type { Candle, NewsItem, Quote, Trade, TradeSide } from '@shared/types'
import { shortId } from './id-generator'
import { mulberry32, randomSeed, type Rng } from './rng'
import { createLogger } from './logger'

const log = createLogger('simulator')

export type Unsub = () => void
export interface MarketDataSource {
  start(): void
  stop(): void
  onQuotes(fn: (quotes: Quote[]) => void): Unsub
  onCandle(fn: (symbol: string, candle: Candle, isNew: boolean) => void): Unsub
  onNews(fn: (item: NewsItem) => void): Unsub
  /** P0-1 Footprint — per-trade event stream. MarketSimulator infers from
   *  tick direction; LiveMarket forwards Alpaca SIP trades when entitled;
   *  ReplaySource is a no-op today (historical import doesn't carry side). */
  onTrades(fn: (trades: Trade[]) => void): Unsub
  getQuote(symbol: string): Quote | undefined
  getAllQuotes(): Quote[]
  getCandles(symbol: string, limit?: number): Candle[]
}

interface SymbolState {
  entry: UniverseEntry
  price: number
  prevClose: number
  drift: number
  sigma: number
  vwapNumer: number
  vwapVol: number
  sparkline: number[]
  bid: number
  ask: number
  volume: number
  currentCandle: Candle
  candles: Candle[]
}

const HEADLINES = [
  { kind: 'macro'    as const, title: 'Fed minutes hint at extended pause',           summary: 'Officials lean toward holding rates steady through Q2.', sentiment: 0.10 },
  { kind: 'flow'     as const, title: 'Large block crosses in NVDA at open',           summary: 'Notional >$500M routed through dark pool tier.',          sentiment: 0.30 },
  { kind: 'earnings' as const, title: 'AAPL beats top-line, services growth strong',   summary: 'Revenue $99.1B vs $97.8B est.; services +14% YoY.',       sentiment: 0.60 },
  { kind: 'breaking' as const, title: 'Crude inventories drawdown larger than forecast',summary: 'EIA reports -3.4M barrels vs -1.2M expected.',           sentiment: 0.40 },
  { kind: 'sentiment'as const, title: 'Retail positioning skew turns net short SPY',  summary: 'Brokerage flow data shows -0.4 z-score in mom indices.',   sentiment: -0.20 },
  { kind: 'macro'    as const, title: 'Initial jobless claims tick higher',            summary: 'Weekly print 234K vs 220K est. — labor cooling.',         sentiment: -0.15 },
  { kind: 'flow'     as const, title: 'AMD options volume 2x daily average',           summary: 'Call skew widens into upcoming product launch.',          sentiment: 0.25 },
]

export class MarketSimulator implements MarketDataSource {
  private rng: Rng
  private states = new Map<string, SymbolState>()
  private tickTimer: NodeJS.Timeout | null = null
  private candleTimer: NodeJS.Timeout | null = null
  private newsTimer: NodeJS.Timeout | null = null
  private quoteListeners   = new Set<(q: Quote[]) => void>()
  private candleListeners  = new Set<(s: string, c: Candle, isNew: boolean) => void>()
  private newsListeners    = new Set<(n: NewsItem) => void>()
  private tradeListeners   = new Set<(t: Trade[]) => void>()
  private currentCandleStart = 0
  /** Last-tick price per symbol — used to infer trade side on the next tick.
   *  Initialized from the universe seed on construction so the very first
   *  tick still has a comparison baseline. */
  private lastPrice = new Map<string, number>()
  /** Persists the last inferred side per symbol so flat ticks (price ==
   *  previous) keep the previous direction instead of dropping to neutral. */
  private lastSide  = new Map<string, TradeSide>()

  constructor(seed?: number) {
    this.rng = mulberry32(seed ?? randomSeed())
    for (const entry of UNIVERSE) {
      const drift  = (0.0001 + this.rng.next() * 0.0003) * (this.rng.next() > 0.5 ? 1 : -1)
      const sigma  = 0.0006 + this.rng.next() * 0.0012
      const nowSec = Math.floor(Date.now() / 1000)
      this.currentCandleStart = Math.floor(nowSec / SIMULATOR_CANDLE_INTERVAL_SEC) * SIMULATOR_CANDLE_INTERVAL_SEC
      this.states.set(entry.symbol, {
        entry, price: entry.seed, prevClose: entry.seed,
        drift, sigma, vwapNumer: 0, vwapVol: 0,
        sparkline: new Array(SPARKLINE_LENGTH).fill(entry.seed),
        bid: entry.seed - 0.05, ask: entry.seed + 0.05,
        volume: 0,
        currentCandle: { time: this.currentCandleStart, open: entry.seed, high: entry.seed, low: entry.seed, close: entry.seed, volume: 0 },
        candles: [],
      })
    }
    log.info('simulator initialized', { symbols: UNIVERSE.length })
  }

  start(): void {
    if (this.tickTimer) return
    const tickMs = Math.floor(1000 / TICK_HZ)
    this.tickTimer   = setInterval(() => this.tick(), tickMs)
    this.candleTimer = setInterval(() => this.rollCandle(), 1000)
    this.newsTimer   = setInterval(() => this.maybeEmitNews(), 4_000)
    log.info('simulator started', { tickHz: TICK_HZ })
  }

  stop(): void {
    if (this.tickTimer)   { clearInterval(this.tickTimer);   this.tickTimer   = null }
    if (this.candleTimer) { clearInterval(this.candleTimer); this.candleTimer = null }
    if (this.newsTimer)   { clearInterval(this.newsTimer);   this.newsTimer   = null }
  }

  onQuotes(fn: (q: Quote[]) => void):                         Unsub { this.quoteListeners.add(fn);  return () => this.quoteListeners.delete(fn)  }
  onCandle(fn: (s: string, c: Candle, n: boolean) => void):   Unsub { this.candleListeners.add(fn); return () => this.candleListeners.delete(fn) }
  onNews(fn: (n: NewsItem) => void):                          Unsub { this.newsListeners.add(fn);   return () => this.newsListeners.delete(fn)   }
  onTrades(fn: (t: Trade[]) => void):                         Unsub { this.tradeListeners.add(fn);  return () => this.tradeListeners.delete(fn)  }

  getQuote(symbol: string): Quote | undefined {
    const s = this.states.get(symbol); return s ? this.quoteFrom(s) : undefined
  }
  getAllQuotes(): Quote[] {
    return Array.from(this.states.values()).map((s) => this.quoteFrom(s))
  }
  getCandles(symbol: string, limit = 500): Candle[] {
    const s = this.states.get(symbol)
    if (!s) return []
    return [...s.candles, s.currentCandle].slice(-limit)
  }

  private quoteFrom(s: SymbolState): Quote {
    return {
      symbol: s.entry.symbol, name: s.entry.name, assetClass: s.entry.assetClass,
      last: s.price, bid: s.bid, ask: s.ask,
      prevClose: s.prevClose,
      change: s.price - s.prevClose,
      changePct: s.prevClose === 0 ? 0 : ((s.price - s.prevClose) / s.prevClose) * 100,
      volume: s.volume,
      vwap: s.vwapVol === 0 ? s.price : s.vwapNumer / s.vwapVol,
      sparkline: s.sparkline.slice(),
      timestamp: Date.now(),
    }
  }

  private tick(): void {
    const batch: Quote[] = []
    const trades: Trade[] = []
    const now = Date.now()
    for (const s of this.states.values()) {
      const z = this.rng.nextGaussian()
      const dt = 1 / (TICK_HZ * 60)
      const lr = s.drift * dt + s.sigma * z * Math.sqrt(dt)
      const vol = 100 + this.rng.nextInt(900)
      const prevPrice = this.lastPrice.get(s.entry.symbol) ?? s.price
      s.price = s.price * Math.exp(lr)
      s.bid = s.price * (1 - 0.0001)
      s.ask = s.price * (1 + 0.0001)
      s.volume += vol
      s.vwapNumer += s.price * vol
      s.vwapVol += vol
      s.sparkline.shift(); s.sparkline.push(s.price)
      const c = s.currentCandle
      c.high = Math.max(c.high, s.price)
      c.low  = Math.min(c.low,  s.price)
      c.close = s.price
      c.volume += vol
      batch.push(this.quoteFrom(s))

      // P0-1 Footprint — infer trade side from this-tick price vs last-tick
      // price. Up = ask-lift (buy), down = bid-hit (sell), unchanged = carry
      // forward last side (avoids a "neutral" classification the footprint
      // chart can't render). Provenance flagged 'inferred' so consumers can
      // visually distinguish from real SIP trades.
      const inferredSide: TradeSide = s.price > prevPrice ? 'buy'
        : s.price < prevPrice ? 'sell'
        : this.lastSide.get(s.entry.symbol) ?? 'buy'
      this.lastPrice.set(s.entry.symbol, s.price)
      this.lastSide.set(s.entry.symbol, inferredSide)
      trades.push({
        symbol: s.entry.symbol, ts: now, price: s.price,
        size: vol, side: inferredSide, provenance: 'inferred',
      })
    }
    for (const l of this.quoteListeners) l(batch)
    if (trades.length > 0) for (const l of this.tradeListeners) l(trades)
  }

  private rollCandle(): void {
    const nowSec = Math.floor(Date.now() / 1000)
    const bucket = Math.floor(nowSec / SIMULATOR_CANDLE_INTERVAL_SEC) * SIMULATOR_CANDLE_INTERVAL_SEC
    if (bucket === this.currentCandleStart) return
    for (const [sym, s] of this.states) {
      const closed = { ...s.currentCandle }
      s.candles.push(closed)
      if (s.candles.length > 2000) s.candles.shift()
      for (const l of this.candleListeners) l(sym, closed, false)
      const next: Candle = { time: bucket, open: closed.close, high: closed.close, low: closed.close, close: closed.close, volume: 0 }
      s.currentCandle = next
      for (const l of this.candleListeners) l(sym, next, true)
    }
    this.currentCandleStart = bucket
  }

  private maybeEmitNews(): void {
    if (this.rng.next() > 0.4) return
    const tpl = HEADLINES[this.rng.nextInt(HEADLINES.length)]!
    const syms = Array.from(this.states.keys())
    const sym  = this.rng.next() > 0.5 ? syms[this.rng.nextInt(syms.length)] : undefined
    const item: NewsItem = {
      id: shortId('nws'), source: 'SATEX/sim', kind: tpl.kind,
      ...(sym ? { symbol: sym } : {}),
      title: tpl.title, summary: tpl.summary, sentiment: tpl.sentiment,
      publishedAt: Date.now(),
    }
    for (const l of this.newsListeners) l(item)
  }
}
