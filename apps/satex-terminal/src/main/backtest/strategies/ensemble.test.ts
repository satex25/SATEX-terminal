import { describe, expect, it } from 'vitest'
import { StrategyEnsemble } from './ensemble'
import type { Strategy, StrategySnapshot } from '../strategy'
import type { IndicatorSnapshot, Quote, RegimeSnapshot, StrategySignal } from '@shared/types'

class FixedSignal implements Strategy {
  constructor(readonly name: string, private readonly out: StrategySignal | null) {}
  decide(): StrategySignal | null { return this.out }
}

function ind(): IndicatorSnapshot {
  return { symbol: 'NVDA', vwap: 100, ema9: 100, ema21: 100, ema50: 100,
    rsi14: 50, atr14: 1, trendStrength: 0, volatility: 0 }
}

function quote(): Quote {
  return { symbol: 'NVDA', name: 'N', assetClass: 'equity',
    last: 100, bid: 99.99, ask: 100.01, prevClose: 100,
    changePct: 0, change: 0, volume: 0, vwap: 100,
    sparkline: [], timestamp: 0 }
}

function snap(state: string | null): StrategySnapshot {
  const regime: RegimeSnapshot | undefined = state === null ? undefined : {
    state, session: 'NY',
    symbol: 'NVDA',
    liquidity:  { value: 0, status: 'OK' },
    spread:     { value: 0, status: 'OK' },
    volatility: { value: 0, status: 'OK' },
    trend:      { value: 0, status: 'OK' },
    hmm: [],
    lastSwitchUtc: null,
    computedAt: 0,
  } as unknown as RegimeSnapshot
  return {
    ts: 0, symbol: 'NVDA', quote: quote(), indicators: ind(),
    ...(regime ? { regime } : {}),
  }
}

function sig(setup: string): StrategySignal {
  return { setup, symbol: 'NVDA', action: 'buy', confidence: 0.6,
    stopLossHint: 99, takeProfitHint: 102, atrHint: 1, createdAt: 0 }
}

describe('StrategyEnsemble', () => {
  it('routes to the matching regime child', () => {
    const ens = new StrategyEnsemble({
      routes: [
        { regime: 'bull-trend', strategy: new FixedSignal('mom', sig('momentum')) },
        { regime: 'chop',       strategy: new FixedSignal('mr',  sig('mean-reversion')) },
      ],
      fallback: new FixedSignal('brain', null),
    })
    expect(ens.decide(snap('bull-trend'))?.setup).toBe('momentum')
    expect(ens.decide(snap('chop'))?.setup).toBe('mean-reversion')
  })

  it('falls back when the primary child returns null', () => {
    const ens = new StrategyEnsemble({
      routes: [{ regime: 'bull-trend', strategy: new FixedSignal('m', null) }],
      fallback: new FixedSignal('brain', sig('brain-fb')),
    })
    expect(ens.decide(snap('bull-trend'))?.setup).toBe('brain-fb')
  })

  it('falls back when no regime is provided', () => {
    const ens = new StrategyEnsemble({
      routes: [{ regime: 'bull-trend', strategy: new FixedSignal('m', sig('momentum')) }],
      fallback: new FixedSignal('brain', sig('brain')),
    })
    expect(ens.decide(snap(null))?.setup).toBe('brain')
  })

  it('falls back when regime does not match any route', () => {
    const ens = new StrategyEnsemble({
      routes: [{ regime: 'bull-trend', strategy: new FixedSignal('m', sig('m')) }],
      fallback: new FixedSignal('brain', sig('brain')),
    })
    expect(ens.decide(snap('unseen-regime'))?.setup).toBe('brain')
  })

  it('returns null when both primary and fallback return null', () => {
    const ens = new StrategyEnsemble({
      routes: [{ regime: 'bull-trend', strategy: new FixedSignal('m', null) }],
      fallback: new FixedSignal('brain', null),
    })
    expect(ens.decide(snap('bull-trend'))).toBeNull()
  })

  it('reports name = "ensemble"', () => {
    const ens = new StrategyEnsemble({
      routes: [], fallback: new FixedSignal('brain', null),
    })
    expect(ens.name).toBe('ensemble')
  })
})
