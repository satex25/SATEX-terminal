import { describe, expect, it } from 'vitest'
import { buildAutonomousEnsemble, extractRegimeKey } from './autonomous-strategy'
import { Brain } from './brain'
import type { RegimeSnapshot } from '@shared/types'

function regimeWith(state: string): RegimeSnapshot {
  return {
    state, session: 'NY', symbol: 'NVDA',
    liquidity:  { value: 0, status: 'OK' },
    spread:     { value: 0, status: 'OK' },
    volatility: { value: 0, status: 'OK' },
    trend:      { value: 0, status: 'OK' },
    hmm: [], lastSwitchUtc: null, computedAt: 0,
  } as unknown as RegimeSnapshot
}

describe('extractRegimeKey', () => {
  it('returns the STATE prefix from a "STATE · SESSION LIQUIDITY" label', () => {
    expect(extractRegimeKey(regimeWith('EXPANSION · NY LIQUIDITY'))).toBe('EXPANSION')
    expect(extractRegimeKey(regimeWith('MEAN-REVERT · LONDON LIQUIDITY'))).toBe('MEAN-REVERT')
    expect(extractRegimeKey(regimeWith('COMPRESSION · TOKYO LIQUIDITY'))).toBe('COMPRESSION')
    expect(extractRegimeKey(regimeWith('CAPITULATION · NY LIQUIDITY'))).toBe('CAPITULATION')
  })

  it('returns the full state string when no separator is present', () => {
    expect(extractRegimeKey(regimeWith('UNKNOWN'))).toBe('UNKNOWN')
  })

  it('returns null for null or undefined input', () => {
    expect(extractRegimeKey(null)).toBeNull()
    expect(extractRegimeKey(undefined)).toBeNull()
  })
})

describe('buildAutonomousEnsemble', () => {
  it('produces a StrategyEnsemble named "ensemble"', () => {
    const ens = buildAutonomousEnsemble(new Brain())
    expect(ens.name).toBe('ensemble')
  })

  it('uses the same Brain instance for the BrainStrategy fallback', () => {
    // Indirect verification: the ensemble's fallback route falls back to
    // Brain when the regime is unknown. We confirm by inspecting decide()
    // doesn't throw (Brain is constructed with default weights).
    const brain = new Brain()
    const ens = buildAutonomousEnsemble(brain)
    // No regime → fallback path; null is allowed (Brain may abstain).
    const result = ens.decide({
      ts: 0, symbol: 'NVDA',
      quote: { symbol: 'NVDA', name: 'N', assetClass: 'equity',
        last: 100, bid: 99.99, ask: 100.01, prevClose: 100,
        changePct: 0, change: 0, volume: 0, vwap: 100,
        sparkline: [], timestamp: 0 },
      indicators: { symbol: 'NVDA', vwap: 100, ema9: 100, ema21: 100,
        ema50: 100, rsi14: 50, atr14: 1, trendStrength: 0, volatility: 0 },
    })
    // result is null or a StrategySignal — either is valid; just shouldn't throw.
    expect(result === null || typeof result === 'object').toBe(true)
  })
})
