import { describe, expect, it } from 'vitest'
import { MomentumStrategy } from './momentum'
import type { StrategySnapshot } from '../strategy'
import type { IndicatorSnapshot, Quote } from '@shared/types'

function ind(over?: Partial<IndicatorSnapshot>): IndicatorSnapshot {
  return {
    symbol: 'NVDA', vwap: 100, ema9: 100, ema21: 100, ema50: 100,
    rsi14: 50, atr14: 2.0, trendStrength: 0, volatility: 0, ...over,
  }
}

function quote(last = 100): Quote {
  return {
    symbol: 'NVDA', name: 'N', assetClass: 'equity',
    last, bid: last - 0.01, ask: last + 0.01,
    prevClose: last, changePct: 0, change: 0, volume: 1000,
    vwap: last, sparkline: [], timestamp: 0,
  }
}

function snap(over?: Partial<StrategySnapshot>): StrategySnapshot {
  const base1m = ind({ ema9: 105, ema21: 100, ema50: 95, rsi14: 58, atr14: 2 })
  return {
    ts: 0, symbol: 'NVDA', quote: quote(102), indicators: base1m,
    multiTimeframe: {
      symbol: 'NVDA', ts: 0,
      byTimeframe: {
        '1m':  base1m,
        '5m':  ind({ rsi14: 60 }),
        '15m': ind({ trendStrength: 0.6 }),
        '1h':  ind({ vwap: 100 }),
      },
    },
    ...over,
  }
}

describe('MomentumStrategy', () => {
  it('long on bullish stack + above 1h VWAP + 5m RSI confirming + 15m trend strong', () => {
    const sig = new MomentumStrategy().decide(snap())
    expect(sig?.action).toBe('buy')
    expect(sig?.setup).toBe('momentum')
    expect(sig!.stopLossHint).toBeLessThan(102)
    expect(sig!.takeProfitHint).toBeGreaterThan(102)
  })

  it('short on bearish stack + below 1h VWAP + 5m RSI low + 15m trend strong', () => {
    const s = snap({
      indicators: ind({ ema9: 95, ema21: 100, ema50: 105, rsi14: 42 }),
      quote: quote(98),
      multiTimeframe: {
        symbol: 'NVDA', ts: 0,
        byTimeframe: {
          '1m':  ind({ ema9: 95, ema21: 100, ema50: 105 }),
          '5m':  ind({ rsi14: 40 }),
          '15m': ind({ trendStrength: 0.7 }),
          '1h':  ind({ vwap: 100 }),
        },
      },
    })
    const sig = new MomentumStrategy().decide(s)
    expect(sig?.action).toBe('sell')
    expect(sig!.stopLossHint).toBeGreaterThan(98)
    expect(sig!.takeProfitHint).toBeLessThan(98)
  })

  it('skips when 15m trend is weak', () => {
    const s = snap({
      multiTimeframe: {
        symbol: 'NVDA', ts: 0,
        byTimeframe: {
          '1m':  ind({ ema9: 105, ema21: 100, ema50: 95 }),
          '5m':  ind({ rsi14: 60 }),
          '15m': ind({ trendStrength: 0.1 }),
          '1h':  ind({ vwap: 100 }),
        },
      },
    })
    expect(new MomentumStrategy().decide(s)).toBeNull()
  })

  it('skips when 5m RSI is overbought (above bullHi)', () => {
    const s = snap({
      multiTimeframe: {
        symbol: 'NVDA', ts: 0,
        byTimeframe: {
          '1m':  ind({ ema9: 105, ema21: 100, ema50: 95 }),
          '5m':  ind({ rsi14: 78 }),
          '15m': ind({ trendStrength: 0.7 }),
          '1h':  ind({ vwap: 100 }),
        },
      },
    })
    expect(new MomentumStrategy().decide(s)).toBeNull()
  })

  it('abstains without multiTimeframe data', () => {
    const s = snap()
    delete s.multiTimeframe
    expect(new MomentumStrategy().decide(s)).toBeNull()
  })

  it('abstains when ATR is zero', () => {
    const s = snap({ indicators: ind({ ema9: 105, ema21: 100, ema50: 95, atr14: 0 }) })
    expect(new MomentumStrategy().decide(s)).toBeNull()
  })

  it('reports name = "momentum"', () => {
    expect(new MomentumStrategy().name).toBe('momentum')
  })
})
