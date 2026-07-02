import { describe, expect, it } from 'vitest'
import { MeanReversionStrategy } from './mean-reversion'
import type { StrategySnapshot } from '../strategy'
import type { IndicatorSnapshot, Quote } from '@shared/types'

function ind(over?: Partial<IndicatorSnapshot>): IndicatorSnapshot {
  return {
    symbol: 'NVDA', vwap: 100, ema9: 100, ema21: 100, ema50: 100,
    rsi14: 50, atr14: 2.0, trendStrength: 0, volatility: 0, ...over,
  }
}

function quote(last = 100): Quote {
  return { symbol: 'NVDA', name: 'N', assetClass: 'equity',
    last, bid: last - 0.01, ask: last + 0.01,
    prevClose: last, changePct: 0, change: 0, volume: 1000,
    vwap: last, sparkline: [], timestamp: 0 }
}

function mtfWith(rsi5: number, trend15: number, vwap1h: number): StrategySnapshot['multiTimeframe'] {
  return {
    symbol: 'NVDA', ts: 0,
    byTimeframe: {
      '1m':  ind(), '5m':  ind({ rsi14: rsi5 }),
      '15m': ind({ trendStrength: trend15 }),
      '1h':  ind({ vwap: vwap1h }),
    },
  }
}

describe('MeanReversionStrategy', () => {
  it('longs oversold + below VWAP in a sideways regime', () => {
    const sig = new MeanReversionStrategy().decide({
      ts: 0, symbol: 'NVDA', quote: quote(95),
      indicators: ind({ atr14: 2 }),
      multiTimeframe: mtfWith(25, 0.1, 100),
    })
    expect(sig?.action).toBe('buy')
    expect(sig?.setup).toBe('mean-reversion')
    expect(sig!.takeProfitHint).toBe(100)
    expect(sig!.stopLossHint).toBeLessThan(95)
  })

  it('shorts overbought + above VWAP in a sideways regime', () => {
    const sig = new MeanReversionStrategy().decide({
      ts: 0, symbol: 'NVDA', quote: quote(105),
      indicators: ind({ atr14: 2 }),
      multiTimeframe: mtfWith(75, 0.1, 100),
    })
    expect(sig?.action).toBe('sell')
    expect(sig!.takeProfitHint).toBe(100)
    expect(sig!.stopLossHint).toBeGreaterThan(105)
  })

  it('refuses to fire when 15m trend is strong (momentum regime)', () => {
    expect(new MeanReversionStrategy().decide({
      ts: 0, symbol: 'NVDA', quote: quote(95),
      indicators: ind({ atr14: 2 }),
      multiTimeframe: mtfWith(25, 0.7, 100),
    })).toBeNull()
  })

  it('refuses RSI extremes that are too close to VWAP', () => {
    expect(new MeanReversionStrategy().decide({
      ts: 0, symbol: 'NVDA', quote: quote(99.5),
      indicators: ind({ atr14: 2 }),
      multiTimeframe: mtfWith(25, 0.1, 100),
    })).toBeNull()
  })

  it('abstains without multiTimeframe data', () => {
    expect(new MeanReversionStrategy().decide({
      ts: 0, symbol: 'NVDA', quote: quote(95),
      indicators: ind({ atr14: 2 }),
    })).toBeNull()
  })

  it('reports name = "mean-reversion"', () => {
    expect(new MeanReversionStrategy().name).toBe('mean-reversion')
  })
})
