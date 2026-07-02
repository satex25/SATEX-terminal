import { describe, it, expect } from 'vitest'
import type {
  BrainParameter, CalibrationSnapshot, Candle, DepthSnapshot,
  IndicatorSnapshot, MacroSnapshot, Quote, RegimeSnapshot,
} from '@shared/types'
import { composeIntelSnapshot, intelCorrelationSymbols, type IntelFusionDeps } from './intel-fusion'

const T = Date.parse('2026-06-29T15:00:00.000Z')

const quote = (last: number): Quote => ({
  symbol: 'NVDA', name: 'NVIDIA', assetClass: 'equity',
  last, bid: last - 0.05, ask: last + 0.05, prevClose: last, changePct: 0, change: 0,
  volume: 1000, vwap: last, sparkline: [], timestamp: T,
})

const ind: IndicatorSnapshot = {
  symbol: 'NVDA', vwap: 100, ema9: 102, ema21: 101, ema50: 100,
  rsi14: 60, atr14: 1.5, trendStrength: 0.6, volatility: 0.2,
}

const candles = (base: number, n = 30): Candle[] =>
  Array.from({ length: n }, (_, i) => {
    const close = base + Math.sin(i / 3) * 2 + i * 0.1
    return { time: T / 1000 - (n - i) * 60, open: close, high: close + 1, low: close - 1, close, volume: 100 }
  })

const calibration: CalibrationSnapshot = {
  samples: 50, minSamples: 30, brierScore: 0.18, multiplier: 0.9, computedAt: T,
  buckets: [
    { lo: 0.0, hi: 0.5, n: 20, avgConfidence: 0.3, winRate: 0.35 },
    { lo: 0.5, hi: 1.0, n: 30, avgConfidence: 0.7, winRate: 0.62 },
  ],
}

const regime: RegimeSnapshot = {
  state: 'EXPANSION · NY', session: 'NY', symbol: 'NVDA',
  liquidity: { v: 0.7, label: 'Deep', trend: 0.1 },
  spread: { v: 0.2, label: 'Tight', trend: -0.05 },
  volatility: { v: 0.4, label: 'Calm', trend: 0.0 },
  trend: { v: 0.6, label: 'Up', trend: 0.2 },
  hmm: [{ name: 'EXPANSION', p: 0.6 }, { name: 'MEAN-REVERT', p: 0.2 }, { name: 'COMPRESSION', p: 0.1 }, { name: 'CAPITULATION', p: 0.1 }],
  lastSwitchUtc: null, computedAt: T,
}

const macro: MacroSnapshot = {
  events: [{ id: 'cpi', tsUtc: new Date(T + 2 * 3_600_000).toISOString(), label: 'US CPI', cons: '3.2%', actual: '', impact: 'high' }],
  horizonHours: 24, computedAt: T,
}

const depth: DepthSnapshot = {
  symbol: 'NVDA', mid: 100, spread: 0.1, vpin: 0.45,
  bids: [{ p: 99.95, size: 400, tot: 400 }, { p: 99.9, size: 200, tot: 600 }],
  asks: [{ p: 100.05, size: 150, tot: 150 }, { p: 100.1, size: 100, tot: 250 }],
  computedAt: T,
}

const features = {
  ema_stack: 1, rsi_mid: 0.2, vwap_side: 1, trend_strength: 0.6,
  atr_norm: 0.3, depth_imbalance: 0.25, microprice_dev: 0.1,
}

const param = (key: string, value: number): BrainParameter =>
  ({ key, symbol: null, value, sampleSize: 40, confidence: 1, updatedAt: T })

const brainNow: BrainParameter[] = [
  param('ema_stack', 0.5), param('rsi_mid', 0.15), param('vwap_side', 0.2),
  param('trend_strength', 0.2), param('atr_norm', -0.1), param('depth_imbalance', 0.15),
  param('microprice_dev', 0.1), param('bias_intercept', 0.05),
]
const brainStart: BrainParameter[] = [
  param('ema_stack', 0.4), param('rsi_mid', 0.15), param('vwap_side', 0.2),
  param('trend_strength', 0.15), param('atr_norm', -0.1), param('depth_imbalance', 0.15),
  param('microprice_dev', 0.1), param('bias_intercept', 0.0),
]

function fullDeps(): IntelFusionDeps {
  return {
    now: () => T,
    getCalibration: () => calibration,
    getRegime: () => regime,
    getMacro: () => macro,
    getDepth: () => depth,
    getQuote: () => quote(102),
    getIndicators: () => ind,
    getCandles: (s) => candles(s === 'SPY' ? 400 : 100),
    getFeatures: () => features,
    getBrainParams: () => brainNow,
    getBrainParamsAtStart: () => brainStart,
    correlationSymbols: (focus) => [focus, 'SPY'],
  }
}

describe('composeIntelSnapshot — full signal', () => {
  const snap = composeIntelSnapshot(fullDeps(), 'NVDA')

  it('decomposes feature attribution over every feature', () => {
    expect(snap.attribution).not.toBeNull()
    expect(snap.attribution!.contributions).toHaveLength(7)
    expect(Number.isFinite(snap.attribution!.score)).toBe(true)
  })

  it('builds a correlation matrix across the focus set', () => {
    expect(snap.correlation).not.toBeNull()
    expect(snap.correlation!.symbols).toEqual(['NVDA', 'SPY'])
    expect(snap.correlation!.rows[0]![0]).toBe(1)
  })

  it('reads microstructure from the book', () => {
    expect(snap.microstructure).not.toBeNull()
    expect(snap.microstructure!.imbalance).toBeCloseTo((400 - 150) / 550, 6)
  })

  it('surfaces weight drift from the session-start priors', () => {
    expect(Array.isArray(snap.weightDrift)).toBe(true)
    const ema = snap.weightDrift!.find((r) => r.key === 'ema_stack')
    expect(ema).toMatchObject({ from: 0.4, to: 0.5 })
    expect(ema!.delta).toBeCloseTo(0.1, 10)
  })

  it('fuses a scenario whose probabilities sum to 1 and includes the imminent-macro layer', () => {
    expect(snap.scenario).not.toBeNull()
    const { bull, bear, neutral, layers } = snap.scenario!
    expect(bull + bear + neutral).toBeCloseTo(1, 10)
    expect(layers.some((l) => l.label === 'Macro event risk')).toBe(true)
  })

  it('passes calibration / regime / macro through', () => {
    expect(snap.calibration?.brierScore).toBe(0.18)
    expect(snap.regime?.state).toContain('EXPANSION')
    expect(snap.macro?.events).toHaveLength(1)
  })
})

describe('composeIntelSnapshot — degenerate (everything UNKNOWN, no throw)', () => {
  const emptyDeps: IntelFusionDeps = {
    now: () => T,
    getCalibration: () => { throw new Error('no calibration') },
    getRegime: () => { throw new Error('no regime') },
    getMacro: () => { throw new Error('no macro') },
    getDepth: () => ({ symbol: 'NVDA', mid: 0, spread: 0, vpin: NaN, bids: [], asks: [], computedAt: T }),
    getQuote: () => undefined,
    getIndicators: () => { throw new Error('no indicators') },
    getCandles: () => [],
    getFeatures: () => { throw new Error('no features') },
    getBrainParams: () => [],
    getBrainParamsAtStart: () => [],
    correlationSymbols: (focus) => [focus],
  }
  const snap = composeIntelSnapshot(emptyDeps, 'NVDA')

  it('returns a fully-null snapshot rather than fabricating values', () => {
    expect(snap.attribution).toBeNull()
    expect(snap.correlation).toBeNull()
    expect(snap.microstructure).toBeNull()
    expect(snap.scenario).toBeNull()
    expect(snap.calibration).toBeNull()
    expect(snap.regime).toBeNull()
    expect(snap.macro).toBeNull()
    expect(snap.weightDrift).toEqual([])
    expect(snap.symbol).toBe('NVDA')
  })
})

describe('intelCorrelationSymbols', () => {
  it('puts the focus first, then the rest of the universe, capped', () => {
    const out = intelCorrelationSymbols('NVDA', ['SPY', 'NVDA', 'AAPL', 'ES', 'BTC'], 3)
    expect(out[0]).toBe('NVDA')
    expect(out).toHaveLength(3)
    expect(out).not.toContain(undefined)
    expect(new Set(out).size).toBe(3) // no dupes (focus excluded from rest)
  })
})
