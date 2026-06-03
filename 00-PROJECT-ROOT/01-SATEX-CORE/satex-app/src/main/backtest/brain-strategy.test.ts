/**
 * SATEX — BrainStrategy tests.
 * Verify the wrapper round-trips a neutral / bullish / bearish snapshot
 * into the expected StrategySignal shape (or null when vetoed).
 */
import { describe, expect, it } from 'vitest'
import { BrainStrategy } from './brain-strategy'
import { Brain } from '../services/brain'
import type { IndicatorSnapshot, Quote } from '@shared/types'

function quote(last = 100): Quote {
  return {
    symbol: 'NVDA', name: 'NVIDIA', assetClass: 'equity',
    last, bid: last - 0.01, ask: last + 0.01,
    prevClose: last, changePct: 0, change: 0, volume: 1000, vwap: last,
    sparkline: [], timestamp: Date.now(),
  }
}

function bullishInd(): IndicatorSnapshot {
  return {
    symbol: 'NVDA',
    vwap: 95, ema9: 105, ema21: 100, ema50: 95,
    rsi14: 62, atr14: 2.0, trendStrength: 0.7, volatility: 0.1,
  }
}

function bearishInd(): IndicatorSnapshot {
  return {
    symbol: 'NVDA',
    vwap: 105, ema9: 95, ema21: 100, ema50: 105,
    rsi14: 38, atr14: 2.0, trendStrength: 0.7, volatility: 0.1,
  }
}

function neutralInd(): IndicatorSnapshot {
  return {
    symbol: 'NVDA',
    vwap: 100, ema9: 100, ema21: 100, ema50: 100,
    rsi14: 50, atr14: 2.0, trendStrength: 0, volatility: 0,
  }
}

describe('BrainStrategy', () => {
  it('returns null when ATR is zero (cannot size brackets)', () => {
    const s = new BrainStrategy(new Brain(), { threshold: 0 })
    const ind = bullishInd()
    ind.atr14 = 0
    expect(s.decide({ ts: 0, symbol: 'NVDA', quote: quote(), indicators: ind })).toBeNull()
  })

  it('returns null on a neutral indicator stack', () => {
    const s = new BrainStrategy(new Brain())
    expect(s.decide({ ts: 0, symbol: 'NVDA', quote: quote(), indicators: neutralInd() })).toBeNull()
  })

  it('returns a buy signal with stops BELOW and TP ABOVE on a bullish stack', () => {
    const s = new BrainStrategy(new Brain(), { threshold: 0, atrStopMult: 2, atrTpMult: 6 })
    const sig = s.decide({ ts: 0, symbol: 'NVDA', quote: quote(100), indicators: bullishInd() })
    expect(sig).not.toBeNull()
    expect(sig!.action).toBe('buy')
    expect(sig!.stopLossHint).toBeLessThan(100)
    expect(sig!.takeProfitHint).toBeGreaterThan(100)
    // ATR=2.0, stopMult=2 → stop 4 below; TP mult=6 → TP 12 above.
    expect(sig!.stopLossHint).toBeCloseTo(96, 6)
    expect(sig!.takeProfitHint).toBeCloseTo(112, 6)
  })

  it('returns a sell signal with stops ABOVE and TP BELOW on a bearish stack', () => {
    const s = new BrainStrategy(new Brain(), { threshold: 0, atrStopMult: 2, atrTpMult: 6 })
    const sig = s.decide({ ts: 0, symbol: 'NVDA', quote: quote(100), indicators: bearishInd() })
    expect(sig).not.toBeNull()
    expect(sig!.action).toBe('sell')
    expect(sig!.stopLossHint).toBeCloseTo(104, 6)
    expect(sig!.takeProfitHint).toBeCloseTo(88, 6)
  })

  it('vetoes signals below the configured threshold', () => {
    const s = new BrainStrategy(new Brain(), { threshold: 0.99 })
    expect(s.decide({ ts: 0, symbol: 'NVDA', quote: quote(), indicators: bullishInd() })).toBeNull()
  })

  it('reports name = "brain"', () => {
    expect(new BrainStrategy(new Brain()).name).toBe('brain')
  })
})
