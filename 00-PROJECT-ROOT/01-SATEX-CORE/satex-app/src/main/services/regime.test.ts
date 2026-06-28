/**
 * SATEX — Regime Service unit tests (Phase 10 · Black Box · P-033 coverage pin)
 *
 * First test coverage for the HMM 4-state regime classifier. `regime.ts` is on
 * the live-decision *input* path (regime drives ensemble-confidence fusion) yet
 * shipped with zero direct coverage — a silent regression in the feature math or
 * the HMM forward step would skew decision confidence untested.
 *
 * New file only: regime.ts is byte-for-byte unchanged, so production behavior
 * cannot regress from this commit. Deps are injected stubs; no timer is started
 * (recompute is driven synchronously via get() / setSymbol()).
 */
import { describe, it, expect } from 'vitest'
import { RegimeService, type RegimeDeps } from './regime'
import type { Quote, Candle, IndicatorSnapshot, HmmStateName } from '@shared/types'

const HMM_STATES: HmmStateName[] = ['EXPANSION', 'MEAN-REVERT', 'COMPRESSION', 'CAPITULATION']

function quote(partial: Partial<Quote> = {}): Quote {
  return {
    symbol: 'NVDA', name: 'NVDA', assetClass: 'equity',
    last: 100, bid: 99.99, ask: 100.01, prevClose: 99, changePct: 1, change: 1,
    volume: 1_000_000, vwap: 100, sparkline: [], timestamp: 0,
    ...partial,
  }
}

function candle(i: number, close: number, volume = 100): Candle {
  return { time: i * 60, open: close, high: close * 1.01, low: close * 0.99, close, volume }
}

function indicators(partial: Partial<IndicatorSnapshot> = {}): IndicatorSnapshot {
  return {
    symbol: 'NVDA', vwap: 100, ema9: 100, ema21: 100, ema50: 100,
    rsi14: 50, atr14: 0.5, trendStrength: 0.2, volatility: 0.2,
    ...partial,
  }
}

/** Deterministic deps: 80 flat candles, mid-spread quote, neutral indicators. */
function makeDeps(over: Partial<RegimeDeps> = {}): RegimeDeps {
  const candles = Array.from({ length: 80 }, (_, i) => candle(i, 100))
  return {
    getQuote:      () => quote(),
    getCandles:    () => candles,
    getIndicators: () => indicators(),
    ...over,
  }
}

describe('RegimeService (P-033 coverage pin)', () => {
  it('get() returns a fully-formed snapshot driven by injected deps', () => {
    const snap = new RegimeService(makeDeps()).get()
    expect(snap.symbol).toBe('NVDA')                 // default focus symbol
    expect(['TOKYO', 'LONDON', 'NY']).toContain(snap.session)
    expect(snap.state).toContain(snap.session)       // header: "STATE · SESSION LIQUIDITY"
    expect(snap.lastSwitchUtc).toBeNull()            // no transition on first compute
    for (const m of [snap.liquidity, snap.spread, snap.volatility, snap.trend]) {
      expect(m.v).toBeGreaterThanOrEqual(0)
      expect(m.v).toBeLessThanOrEqual(1)
      expect(Number.isNaN(m.v)).toBe(false)
    }
  })

  it('hmm posterior is a valid probability distribution (4 named states, sums to 1)', () => {
    const { hmm } = new RegimeService(makeDeps()).get()
    expect(hmm.map((h) => h.name)).toEqual(HMM_STATES)
    expect(hmm.reduce((a, h) => a + h.p, 0)).toBeCloseTo(1, 2)
    for (const h of hmm) {
      expect(h.p).toBeGreaterThanOrEqual(0)
      expect(h.p).toBeLessThanOrEqual(1)
    }
  })

  it('the state header is prefixed by one of the four HMM state names', () => {
    const snap = new RegimeService(makeDeps()).get()
    expect(HMM_STATES.some((s) => snap.state.startsWith(s))).toBe(true)
  })

  it('a toxic order book (high VPIN) lowers liquidity vs a clean one', () => {
    const clean = new RegimeService(makeDeps({ getVpin: () => 0 })).get().liquidity.v
    const toxic = new RegimeService(makeDeps({ getVpin: () => 0.9 })).get().liquidity.v
    expect(toxic).toBeLessThan(clean)
  })

  it('a wide spread reads as lower liquidity and higher spread than a tight one', () => {
    const tight = new RegimeService(makeDeps({ getQuote: () => quote({ bid: 99.99, ask: 100.01 }) })).get()
    const wide  = new RegimeService(makeDeps({ getQuote: () => quote({ bid: 99.0,  ask: 101.0  }) })).get()
    expect(wide.liquidity.v).toBeLessThan(tight.liquidity.v)
    expect(wide.spread.v).toBeGreaterThan(tight.spread.v)
  })

  it('setSymbol re-focuses the snapshot context', () => {
    const svc = new RegimeService(makeDeps())
    svc.get()
    svc.setSymbol('BTC/USD')
    expect(svc.get().symbol).toBe('BTC/USD')
  })

  it('onUpdate listeners fire on recompute and stop after unsubscribe', () => {
    const svc = new RegimeService(makeDeps())
    let calls = 0
    const off = svc.onUpdate(() => { calls++ })
    svc.setSymbol('AAPL')            // distinct symbol → recompute → fires
    expect(calls).toBeGreaterThanOrEqual(1)
    off()
    const at = calls
    svc.setSymbol('MSFT')            // recompute, but listener removed
    expect(calls).toBe(at)
  })

  it('handles an absent quote without throwing or emitting NaN', () => {
    const svc = new RegimeService(makeDeps({ getQuote: () => undefined }))
    expect(() => svc.get()).not.toThrow()
    const snap = svc.get()
    expect(Number.isNaN(snap.spread.v)).toBe(false)
    expect(Number.isNaN(snap.volatility.v)).toBe(false)
  })
})
