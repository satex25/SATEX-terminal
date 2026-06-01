/**
 * SATEX — Brain tests.
 * Tier-2 E.9 adds microstructure features (depth_imbalance + microprice_dev).
 * Brain had no test file before this; this covers the new + a sanity check
 * on scoreLocal.
 */
import { describe, expect, it } from 'vitest'
import { Brain } from './brain'
import type { DepthSnapshot, IndicatorSnapshot, Quote } from '@shared/types'

function quote(last = 100): Quote {
  return { symbol: 'NVDA', name: 'N', assetClass: 'equity',
    last, bid: last - 0.01, ask: last + 0.01,
    prevClose: last, changePct: 0, change: 0, volume: 0,
    vwap: last, sparkline: [], timestamp: 0 }
}

function ind(over?: Partial<IndicatorSnapshot>): IndicatorSnapshot {
  return { symbol: 'NVDA', vwap: 100, ema9: 100, ema21: 100, ema50: 100,
    rsi14: 50, atr14: 1, trendStrength: 0, volatility: 0, ...over }
}

function depth(bidSize: number, askSize: number, bid = 99.99, ask = 100.01): DepthSnapshot {
  return {
    symbol: 'NVDA',
    mid: (bid + ask) / 2,
    spread: ask - bid,
    vpin: 0,
    bids: [{ p: bid, size: bidSize, tot: bidSize }],
    asks: [{ p: ask, size: askSize, tot: askSize }],
    computedAt: 0,
  }
}

describe('Brain.features — base feature set', () => {
  it('emaStack = +1 for bullish stack', () => {
    const f = new Brain().features(quote(), ind({ ema9: 105, ema21: 100, ema50: 95 }))
    expect(f.ema_stack).toBe(1)
  })

  it('emaStack = -1 for bearish stack', () => {
    const f = new Brain().features(quote(), ind({ ema9: 95, ema21: 100, ema50: 105 }))
    expect(f.ema_stack).toBe(-1)
  })

  it('rsi_mid normalizes RSI to [-1, +1]', () => {
    expect(new Brain().features(quote(), ind({ rsi14: 100 })).rsi_mid).toBe(1)
    expect(new Brain().features(quote(), ind({ rsi14: 0   })).rsi_mid).toBe(-1)
    expect(new Brain().features(quote(), ind({ rsi14: 50  })).rsi_mid).toBe(0)
  })
})

describe('Brain.features — microstructure (Tier-2 E.9)', () => {
  it('defaults to 0 microstructure when no depth supplied', () => {
    const f = new Brain().features(quote(), ind())
    expect(f.depth_imbalance).toBe(0)
    expect(f.microprice_dev).toBe(0)
  })

  it('positive depth_imbalance when bid side is heavier', () => {
    const f = new Brain().features(quote(), ind(), depth(1000, 100))
    expect(f.depth_imbalance).toBeGreaterThan(0)
  })

  it('negative depth_imbalance when ask side is heavier', () => {
    const f = new Brain().features(quote(), ind(), depth(100, 1000))
    expect(f.depth_imbalance).toBeLessThan(0)
  })

  it('microprice_dev positive when heavier bid pulls microprice toward ask', () => {
    const f = new Brain().features(quote(100), ind(), depth(1000, 100, 99.99, 100.01))
    expect(f.microprice_dev).toBeGreaterThan(0)
  })

  it('clips microprice_dev to ±1 even on extreme size imbalance', () => {
    // Very wide spread + extreme size imbalance → microprice far from last
    const extreme = depth(1_000_000, 1, 99.5, 100.5)
    const f = new Brain().features(quote(100), ind(), extreme)
    expect(Math.abs(f.microprice_dev)).toBeLessThanOrEqual(1)
  })

  it('returns 0 microstructure when totSize is 0', () => {
    const zeroDepth = depth(0, 0)
    const f = new Brain().features(quote(), ind(), zeroDepth)
    expect(f.depth_imbalance).toBe(0)
    expect(f.microprice_dev).toBe(0)
  })
})

describe('Brain.scoreLocal', () => {
  it('returns a tanh-squashed value in [-1, +1]', () => {
    const b = new Brain()
    const bullish = b.features(quote(), ind({ ema9: 105, ema21: 100, ema50: 95, rsi14: 60 }))
    const s = b.scoreLocal(bullish)
    expect(Number.isFinite(s)).toBe(true)
    expect(Math.abs(s)).toBeLessThanOrEqual(1)
  })

  it('a bullish feature vector produces a positive score', () => {
    const b = new Brain()
    const bullish = b.features(quote(102), ind({ ema9: 110, ema21: 100, ema50: 90, rsi14: 65, trendStrength: 0.7 }))
    expect(b.scoreLocal(bullish)).toBeGreaterThan(0)
  })

  it('a bearish feature vector produces a negative score', () => {
    const b = new Brain()
    const bearish = b.features(quote(98), ind({ ema9: 90, ema21: 100, ema50: 110, rsi14: 35, trendStrength: 0.7 }))
    expect(b.scoreLocal(bearish)).toBeLessThan(0)
  })
})
