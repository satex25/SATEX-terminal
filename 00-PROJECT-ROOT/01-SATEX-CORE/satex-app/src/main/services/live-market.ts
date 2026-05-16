/**
 * SATEX — Live Market (Alpaca-backed MarketDataSource)
 * Wraps AlpacaClient to implement the same MarketDataSource interface as
 * MarketSimulator, so the rest of the system is broker-agnostic.
 */
import type { AlpacaClient, AlpacaTick } from './alpaca'
import { LiveCandleBuffer } from './live-candle-buffer'
import type { Candle, NewsItem, Quote, Trade, TradeSide } from '@shared/types'
import { SIMULATOR_CANDLE_INTERVAL_SEC, SPARKLINE_LENGTH, UNIVERSE, findUniverseEntry } from '@shared/constants'
import type { MarketDataSource, Unsub } from './market-data'
import { createLogger } from './logger'

const log = createLogger('live-market')

interface QuoteState {
  symbol: string; name: string; assetClass: 'equity' | 'index' | 'future' | 'crypto'
  last: number; bid: number; ask: number; prevClose: number
  volume: number; vwapNumer: number; vwapVol: number; sparkline: number[]; timestamp: number
}

export class LiveMarket implements MarketDataSource {
  private quoteListeners  = new Set<(q: Quote[]) => void>()
  private candleListeners = new Set<(s: string, c: Candle, isNew: boolean) => void>()
  private newsListeners   = new Set<(n: NewsItem) => void>()
  private tradeListeners  = new Set<(t: Trade[]) => void>()
  private quotes          = new Map<string, QuoteState>()
  private lastTradeSide   = new Map<string, TradeSide>()
  private buffer: LiveCandleBuffer
  private unsubTick:   (() => void) | null = null
  private unsubCandle: (() => void) | null = null
  private started = false
  private symbols: string[]

  constructor(
    private alpaca: AlpacaClient,
    symbols: string[] = UNIVERSE.map((u) => u.symbol),
    candleIntervalSec = SIMULATOR_CANDLE_INTERVAL_SEC
  ) {
    this.symbols = symbols
    this.buffer  = new LiveCandleBuffer(candleIntervalSec)
    for (const sym of symbols) {
      const entry = findUniverseEntry(sym)
      this.quotes.set(sym, {
        symbol: sym, name: entry?.name ?? sym,
        assetClass: (entry?.assetClass ?? 'equity') as QuoteState['assetClass'],
        last: entry?.seed ?? 0, bid: 0, ask: 0,
        prevClose: entry?.seed ?? 0,
        volume: 0, vwapNumer: 0, vwapVol: 0,
        sparkline: new Array(SPARKLINE_LENGTH).fill(entry?.seed ?? 0),
        timestamp: 0,
      })
    }
  }

  async start(): Promise<void> {
    if (this.started) return
    this.started = true
    this.buffer.start()
    this.unsubTick   = this.alpaca.onTick((tick) => this.onTick(tick))
    this.unsubCandle = this.buffer.onCandle((sym, c, isNew) => {
      for (const l of this.candleListeners) l(sym, c, isNew)
    })
    await this.alpaca.connectMarketStream(this.symbols)
    await this.alpaca.connectAccountStream()
    log.info('live market started', { symbols: this.symbols.length })
  }

  stop(): void {
    if (!this.started) return
    this.started = false
    this.unsubTick?.(); this.unsubCandle?.()
    this.unsubTick = this.unsubCandle = null
    this.buffer.stop()
    this.alpaca.disconnectMarketStream()
    this.alpaca.disconnectAccountStream()
  }

  onQuotes(fn: (q: Quote[]) => void):              Unsub { this.quoteListeners.add(fn);  return () => this.quoteListeners.delete(fn) }
  onCandle(fn: (s: string, c: Candle, n: boolean) => void): Unsub { this.candleListeners.add(fn); return () => this.candleListeners.delete(fn) }
  onNews(fn: (n: NewsItem) => void):               Unsub { this.newsListeners.add(fn);   return () => this.newsListeners.delete(fn) }
  /** P0-1 footprint — IEX feed doesn't surface aggressor-side. We classify
   *  every tick as inferred from the price delta vs the symbol's previous
   *  last. When the SIP entitlement lands the alpaca client will emit real
   *  side data and we'll forward that with provenance: 'real'. */
  onTrades(fn: (t: Trade[]) => void):              Unsub { this.tradeListeners.add(fn);  return () => this.tradeListeners.delete(fn) }

  pushNews(item: NewsItem): void { for (const l of this.newsListeners) l(item) }

  getQuote(symbol: string): Quote | undefined { const q = this.quotes.get(symbol); return q ? this.toPublic(q) : undefined }
  getAllQuotes(): Quote[] { return Array.from(this.quotes.values()).map((q) => this.toPublic(q)) }
  getCandles(symbol: string, limit = 500): Candle[] { return this.buffer.getCandles(symbol, limit) }

  seedHistory(symbol: string, candles: Candle[]): void { this.buffer.seedHistory(symbol, candles) }

  private toPublic(q: QuoteState): Quote {
    const change = q.last - q.prevClose
    return {
      symbol: q.symbol, name: q.name, assetClass: q.assetClass,
      last: q.last, bid: q.bid, ask: q.ask, prevClose: q.prevClose,
      change, changePct: q.prevClose === 0 ? 0 : (change / q.prevClose) * 100,
      volume: q.volume, vwap: q.vwapVol === 0 ? q.last : q.vwapNumer / q.vwapVol,
      sparkline: q.sparkline.slice(), timestamp: q.timestamp,
    }
  }

  private onTick(tick: AlpacaTick): void {
    const q = this.quotes.get(tick.symbol)
    if (!q) return
    const prevLast = q.last
    q.last = tick.price || q.last
    q.bid  = tick.bid   || q.bid   || q.last * 0.9999
    q.ask  = tick.ask   || q.ask   || q.last * 1.0001
    q.volume    += Math.max(0, tick.size)
    q.vwapNumer += q.last * Math.max(0, tick.size)
    q.vwapVol   += Math.max(0, tick.size)
    q.timestamp  = tick.timestamp
    q.sparkline.shift(); q.sparkline.push(q.last)
    this.buffer.ingestTick(tick.symbol, q.last, tick.size, tick.timestamp)
    for (const l of this.quoteListeners) l([this.toPublic(q)])

    // P0-1 footprint — infer per-tick aggressor side and emit a Trade.
    // Skip zero-size ticks (Alpaca emits a synthetic 0-size quote on
    // bid/ask updates that aren't actual trades). Only emit on positive
    // size so the footprint reflects real prints, not just quote shifts.
    const tradeSize = Math.max(0, tick.size)
    if (tradeSize > 0) {
      const inferredSide: TradeSide = q.last > prevLast ? 'buy'
        : q.last < prevLast ? 'sell'
        : this.lastTradeSide.get(tick.symbol) ?? 'buy'
      this.lastTradeSide.set(tick.symbol, inferredSide)
      const trade: Trade = {
        symbol: tick.symbol, ts: tick.timestamp, price: q.last,
        size: tradeSize, side: inferredSide, provenance: 'inferred',
      }
      for (const l of this.tradeListeners) l([trade])
    }
  }
}
