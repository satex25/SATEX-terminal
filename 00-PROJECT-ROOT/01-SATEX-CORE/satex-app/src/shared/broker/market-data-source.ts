/**
 * SATEX — MarketDataSource interface.
 *
 * Extracted from src/main/services/market-data.ts so BrokerSession.data
 * (declared in @shared/broker/broker-session) can reference the type
 * without crossing the main → shared layer boundary.
 *
 * Concrete implementations stay in main/: MarketSimulator, LiveMarket,
 * ReplaySource. F.1 task A.0.
 */
import type { Candle, NewsItem, Quote, Trade } from '@shared/types'

/** Unsubscribe handle returned by every `on*` subscription. */
export type Unsub = () => void

/** The data-feed contract shared by simulator, live-broker WS, and replay. */
export interface MarketDataSource {
  start(): void
  stop(): void
  onQuotes(fn: (quotes: Quote[]) => void): Unsub
  onCandle(fn: (symbol: string, candle: Candle, isNew: boolean) => void): Unsub
  /** Optional bulk-snapshot stream — fires once per symbol with the full
   *  candle history when a source has a "warmed up" moment (currently only
   *  ReplaySource after seek). LiveMarket and MarketSimulator don't
   *  implement this; subscribers must tolerate the listener never firing. */
  onBulkCandlesReplace?(fn: (symbol: string, candles: Candle[]) => void): Unsub
  onNews(fn: (item: NewsItem) => void): Unsub
  /** P0-1 Footprint — per-trade event stream. MarketSimulator infers from
   *  tick direction; LiveMarket forwards Alpaca SIP trades when entitled;
   *  ReplaySource is a no-op today (historical import doesn't carry side). */
  onTrades(fn: (trades: Trade[]) => void): Unsub
  getQuote(symbol: string): Quote | undefined
  getAllQuotes(): Quote[]
  getCandles(symbol: string, limit?: number): Candle[]
}
