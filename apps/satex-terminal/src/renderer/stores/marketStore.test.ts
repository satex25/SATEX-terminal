/**
 * SATEX — Market Data Store characterization coverage.
 *
 * Pins the reducer-like behavior of the renderer's central quote/candle store
 * (every price and bar the chart draws flows through here). Characterization
 * tests: they assert MEASURED current behavior, not a spec, so a future refactor
 * that silently changes a bound or an immutability contract turns them red.
 *
 * Three guards are load-bearing and pinned explicitly:
 *   1. Unbounded candle growth  -> MAX_CANDLES trim (updateCandle / bulkReplaceCandles)
 *   2. live<->replay history bleed -> resetCandles wipes to empty (invariant 6)
 *   3. snapshot-cache stable ref -> selectCandles returns a single FROZEN empty
 *      array for every miss (Zustand v5 useSyncExternalStore invariant; the
 *      correctly-handled member of the P-061/P-074 shared-default class).
 */
import { beforeEach, describe, expect, it } from 'vitest'
import type { Candle, NewsItem, Quote } from '@shared/types'
import { UNIVERSE } from '@shared/constants'
import { useMarketStore, selectCandles } from './marketStore'

function candle(time: number, close = 100): Candle {
  return { time, open: close, high: close + 1, low: close - 1, close, volume: 10 }
}
function quote(symbol: string, last = 50): Quote {
  return {
    symbol, name: symbol, assetClass: 'equity',
    last, bid: last - 0.01, ask: last + 0.01, prevClose: last,
    changePct: 0, change: 0, volume: 0, vwap: last,
    sparkline: new Array(30).fill(last), timestamp: 0,
  }
}
function news(id: string): NewsItem {
  return { id, source: 'test', kind: 'breaking', title: id, summary: id, sentiment: 0, publishedAt: 0 }
}

const MAX_CANDLES = 30_000
const MAX_NEWS = 200

beforeEach(() => {
  useMarketStore.setState(useMarketStore.getInitialState(), true)
})

describe('marketStore — initial state', () => {
  it('focuses NVDA and seeds one quote per UNIVERSE entry', () => {
    const s = useMarketStore.getState()
    expect(s.symbol).toBe('NVDA')
    expect(s.quotes.size).toBe(UNIVERSE.length)
    expect(s.candles.size).toBe(0)
    expect(s.news).toEqual([])
  })

  it('seeds NVDA from its UNIVERSE seed with a 30-point flat sparkline', () => {
    const nvda = UNIVERSE.find(u => u.symbol === 'NVDA')!
    const q = useMarketStore.getState().quotes.get('NVDA')!
    expect(q.last).toBe(nvda.seed)
    expect(q.bid).toBeCloseTo(nvda.seed * 0.9999, 6)
    expect(q.ask).toBeCloseTo(nvda.seed * 1.0001, 6)
    expect(q.sparkline).toHaveLength(30)
    expect(q.change).toBe(0)
  })
})

describe('marketStore — setSymbol', () => {
  it('replaces the focused symbol', () => {
    useMarketStore.getState().setSymbol('AAPL')
    expect(useMarketStore.getState().symbol).toBe('AAPL')
  })
})

describe('marketStore — seedQuotes', () => {
  it('merges by symbol into a fresh Map, preserving untouched entries', () => {
    const before = useMarketStore.getState().quotes
    useMarketStore.getState().seedQuotes([quote('AAPL', 111)])
    const after = useMarketStore.getState().quotes
    expect(after).not.toBe(before)
    expect(after.get('AAPL')!.last).toBe(111)
    expect(after.get('NVDA')).toBeDefined()
  })
})

describe('marketStore — updateQuotes', () => {
  it('shallow-merges partial quote fields onto the previous quote', () => {
    useMarketStore.getState().updateQuotes([{ symbol: 'NVDA', last: 1000 } as Quote])
    const q = useMarketStore.getState().quotes.get('NVDA')!
    expect(q.last).toBe(1000)
    expect(q.name).toBe('NVIDIA Corp.')
  })

  it('inserts an unknown symbol as the payload itself', () => {
    useMarketStore.getState().updateQuotes([quote('ZZZ', 7)])
    expect(useMarketStore.getState().quotes.get('ZZZ')!.last).toBe(7)
  })

  it('returns a new Map reference each call', () => {
    const before = useMarketStore.getState().quotes
    useMarketStore.getState().updateQuotes([quote('NVDA', 5)])
    expect(useMarketStore.getState().quotes).not.toBe(before)
  })
})

describe('marketStore — updateCandle', () => {
  it('appends the first candle to an empty history', () => {
    useMarketStore.getState().updateCandle('NVDA', candle(1), true)
    expect(useMarketStore.getState().candles.get('NVDA')).toEqual([candle(1)])
  })

  it('replaces the in-flight (last) candle when isNew=false', () => {
    const st = useMarketStore.getState()
    st.updateCandle('NVDA', candle(1, 100), true)
    st.updateCandle('NVDA', candle(1, 105), false)
    const bars = useMarketStore.getState().candles.get('NVDA')!
    expect(bars).toHaveLength(1)
    expect(bars[0].close).toBe(105)
  })

  it('treats isNew=false on empty history as a first insert', () => {
    useMarketStore.getState().updateCandle('NVDA', candle(9), false)
    expect(useMarketStore.getState().candles.get('NVDA')).toEqual([candle(9)])
  })

  it('holds the MAX_CANDLES ceiling when appending past a full buffer', () => {
    const full = Array.from({ length: MAX_CANDLES }, (_, i) => candle(i))
    useMarketStore.getState().bulkReplaceCandles('NVDA', full)
    useMarketStore.getState().updateCandle('NVDA', candle(999_999), true)
    const bars = useMarketStore.getState().candles.get('NVDA')!
    expect(bars).toHaveLength(MAX_CANDLES)
    expect(bars[bars.length - 1].time).toBe(999_999)
    expect(bars[0].time).toBe(1)
  })

  it('returns a new candles Map reference each call', () => {
    const before = useMarketStore.getState().candles
    useMarketStore.getState().updateCandle('NVDA', candle(1), true)
    expect(useMarketStore.getState().candles).not.toBe(before)
  })
})

describe('marketStore — bulkReplaceCandles', () => {
  it('replaces the whole series in one update when under the ceiling', () => {
    const bars = [candle(1), candle(2), candle(3)]
    useMarketStore.getState().bulkReplaceCandles('NVDA', bars)
    expect(useMarketStore.getState().candles.get('NVDA')).toEqual(bars)
  })

  it('keeps only the last MAX_CANDLES when handed an oversized series', () => {
    const over = Array.from({ length: MAX_CANDLES + 1 }, (_, i) => candle(i))
    useMarketStore.getState().bulkReplaceCandles('NVDA', over)
    const bars = useMarketStore.getState().candles.get('NVDA')!
    expect(bars).toHaveLength(MAX_CANDLES)
    expect(bars[0].time).toBe(1)
  })
})

describe('marketStore — appendNews', () => {
  it('prepends newest-first', () => {
    const st = useMarketStore.getState()
    st.appendNews(news('a'))
    st.appendNews(news('b'))
    expect(useMarketStore.getState().news.map(n => n.id)).toEqual(['b', 'a'])
  })

  it('caps the feed at MAX_NEWS, evicting the oldest', () => {
    const st = useMarketStore.getState()
    for (let i = 0; i < MAX_NEWS + 1; i++) st.appendNews(news(`n${i}`))
    const feed = useMarketStore.getState().news
    expect(feed).toHaveLength(MAX_NEWS)
    expect(feed[0].id).toBe(`n${MAX_NEWS}`)
    expect(feed.some(n => n.id === 'n0')).toBe(false)
  })
})

describe('marketStore — resetCandles (live<->replay bleed guard, invariant 6)', () => {
  it('wipes candle history to an empty Map', () => {
    useMarketStore.getState().bulkReplaceCandles('NVDA', [candle(1), candle(2)])
    useMarketStore.getState().resetCandles()
    expect(useMarketStore.getState().candles.size).toBe(0)
  })
})

describe('selectCandles — snapshot-cache stable reference', () => {
  it('returns the stored array for a known symbol', () => {
    const bars = [candle(1), candle(2)]
    useMarketStore.getState().bulkReplaceCandles('NVDA', bars)
    expect(selectCandles('NVDA')(useMarketStore.getState())).toEqual(bars)
  })

  it('returns one shared FROZEN empty array for every miss', () => {
    const s = useMarketStore.getState()
    const a = selectCandles('ZZZ')(s)
    const b = selectCandles('WWW')(s)
    expect(a).toHaveLength(0)
    expect(a).toBe(b)
    expect(Object.isFrozen(a)).toBe(true)
  })
})
