/**
 * SATEX — Market Data Store (Zustand)
 * Holds quotes, candles, news. Fed by useIPC hook.
 */
import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import type { Candle, NewsItem, Quote } from '@shared/types'
import { UNIVERSE } from '@shared/constants'

interface MarketState {
  quotes:    Map<string, Quote>
  candles:   Map<string, Candle[]>
  news:      NewsItem[]
  symbol:    string            // currently focused symbol
  setSymbol: (s: string) => void
  updateQuotes:  (quotes: Quote[]) => void
  updateCandle:  (symbol: string, candle: Candle, isNew: boolean) => void
  appendNews:    (item: NewsItem) => void
  seedQuotes:    (quotes: Quote[]) => void
  /** Wipe candle history. Called when the data source swaps (live ↔ replay)
   *  so stale historical bars don't bleed across mode transitions. */
  resetCandles:  () => void
}

const MAX_NEWS = 200
// 1-second candle buckets × a full 6.5h US session = 23,400 candles per symbol.
// Bumped from 1,000 (≈16 min capacity — sufficient for live but not for
// historical replay) to 30,000 so Phase 9.2 historical-day loads can keep an
// entire trading day in memory without truncation. ≈75 B per candle × 30k
// × ~12 active symbols ≈ 27 MB worst case — well inside Electron's budget.
const MAX_CANDLES = 30_000

export const useMarketStore = create<MarketState>((set) => ({
  quotes:  new Map(UNIVERSE.map(u => [u.symbol, {
    symbol: u.symbol, name: u.name, assetClass: u.assetClass,
    last: u.seed, bid: u.seed * 0.9999, ask: u.seed * 1.0001,
    prevClose: u.seed, change: 0, changePct: 0, volume: 0,
    vwap: u.seed, sparkline: new Array(30).fill(u.seed), timestamp: 0,
  }])),
  candles:  new Map(),
  news:     [],
  symbol:   'NVDA',

  setSymbol: (s) => set({ symbol: s }),

  seedQuotes: (quotes) => set(state => {
    const next = new Map(state.quotes)
    for (const q of quotes) next.set(q.symbol, q)
    return { quotes: next }
  }),

  updateQuotes: (quotes) => set(state => {
    const next = new Map(state.quotes)
    for (const q of quotes) {
      const prev = next.get(q.symbol)
      next.set(q.symbol, { ...(prev ?? {}), ...q })
    }
    return { quotes: next }
  }),

  updateCandle: (symbol, candle, isNew) => set(state => {
    const prev = state.candles.get(symbol) ?? []
    let next: Candle[]
    if (isNew) {
      next = [...prev.slice(-(MAX_CANDLES - 1)), candle]
    } else {
      next = prev.length > 0
        ? [...prev.slice(0, -1), candle]  // replace in-flight candle
        : [candle]
    }
    const m = new Map(state.candles)
    m.set(symbol, next)
    return { candles: m }
  }),

  appendNews: (item) => set(state => ({
    news: [item, ...state.news].slice(0, MAX_NEWS)
  })),

  resetCandles: () => set({ candles: new Map() }),
}))

// Selector helpers
export const selectQuote = (sym: string) => (s: MarketState) => s.quotes.get(sym)

// useSyncExternalStore (Zustand v5) requires selectors to return stable references for
// the same state — `?? []` and `Array.from(...)` create a new value on every call and
// break the snapshot-cache invariant, causing infinite render loops.
//
// Pattern: subscribe to the Map (stable until mutated) and let consumers derive arrays
// via useMemo, OR wrap a derived selector in useShallow so React sees structurally-equal
// results as identical.

export const EMPTY_CANDLES: readonly Candle[] = Object.freeze([])
export const selectCandles = (sym: string) => (s: MarketState): readonly Candle[] =>
  s.candles.get(sym) ?? EMPTY_CANDLES

const allQuotesSelector = (s: MarketState) => Array.from(s.quotes.values())
export const useAllQuotes = () => useMarketStore(useShallow(allQuotesSelector))
