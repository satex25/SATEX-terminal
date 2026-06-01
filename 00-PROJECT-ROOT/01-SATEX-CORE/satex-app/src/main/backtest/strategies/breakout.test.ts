import { describe, expect, it } from 'vitest'
import { BreakoutStrategy } from './breakout'
import type { StrategySnapshot } from '../strategy'
import type { IndicatorSnapshot, Quote } from '@shared/types'

function ind(over?: Partial<IndicatorSnapshot>): IndicatorSnapshot {
  return { symbol: 'NVDA', vwap: 100, ema9: 100, ema21: 100, ema50: 100,
    rsi14: 50, atr14: 2.0, trendStrength: 0, volatility: 0, ...over }
}

function quote(last = 100): Quote {
  return { symbol: 'NVDA', name: 'N', assetClass: 'equity',
    last, bid: last - 0.01, ask: last + 0.01,
    prevClose: last, changePct: 0, change: 0, volume: 1000,
    vwap: last, sparkline: [], timestamp: 0 }
}

function snap(last: number, atr15 = 2, tf1hOver?: Partial<IndicatorSnapshot>): StrategySnapshot {
  return {
    ts: 0, symbol: 'NVDA', quote: quote(last), indicators: ind({ atr14: atr15 }),
    multiTimeframe: {
      symbol: 'NVDA', ts: 0,
      byTimeframe: {
        '1m':  ind(), '5m': ind(), '15m': ind({ atr14: atr15 }),
        '1h':  ind({ trendStrength: 0.6, ema9: 102, ema50: 98, ...tf1hOver }),
      },
    },
  }
}

describe('BreakoutStrategy', () => {
  it('warmup bar returns null (no prior range yet)', () => {
    const s = new BreakoutStrategy()
    expect(s.decide(snap(100))).toBeNull()
  })

  it('long on break above prior range + bullish 1h trend', () => {
    const s = new BreakoutStrategy()
    s.decide(snap(100, 2))
    const sig = s.decide(snap(110, 4))
    expect(sig?.action).toBe('buy')
  })

  it('short on break below prior range + bearish 1h trend', () => {
    const s = new BreakoutStrategy()
    s.decide(snap(100, 2))
    const sig = s.decide(snap(90, 4, { ema9: 98, ema50: 102 }))
    expect(sig?.action).toBe('sell')
  })

  it('refuses when 1h trend is weak', () => {
    const s = new BreakoutStrategy()
    s.decide(snap(100, 2))
    expect(s.decide(snap(110, 4, { trendStrength: 0.1 }))).toBeNull()
  })

  it('abstains without multiTimeframe data', () => {
    const s = new BreakoutStrategy()
    expect(s.decide({
      ts: 0, symbol: 'NVDA', quote: quote(100), indicators: ind({ atr14: 2 }),
    })).toBeNull()
  })

  it('reset clears prior range so the next decide is a warmup again', () => {
    const s = new BreakoutStrategy()
    s.decide(snap(100, 2))
    s.reset()
    expect(s.decide(snap(110, 4))).toBeNull() // warmup again, no signal
  })

  it('reports name = "breakout"', () => {
    expect(new BreakoutStrategy().name).toBe('breakout')
  })
})
