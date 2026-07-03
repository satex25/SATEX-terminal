import { describe, it, expect } from 'vitest'
import type { DepthSnapshot, ScenarioLayer } from './types'
import {
  alignedLogReturns,
  pearson,
  correlationMatrix,
  featureAttribution,
  microstructureFromDepth,
  deriveScenarioLayers,
  buildScenario,
} from './intel-analytics'

describe('alignedLogReturns', () => {
  it('computes log-returns and emits NaN across a non-positive price (negative-price safe)', () => {
    const r = alignedLogReturns([100, 110, -5, 120])
    expect(r).toHaveLength(3)
    expect(r[0]).toBeCloseTo(Math.log(110 / 100), 10)
    expect(Number.isNaN(r[1]!)).toBe(true) // 110 -> -5
    expect(Number.isNaN(r[2]!)).toBe(true) // -5 -> 120
  })
})

describe('pearson', () => {
  it('returns +1 for a perfectly correlated pair and -1 for anti-correlated', () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])!).toBeCloseTo(1, 10)
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])!).toBeCloseTo(-1, 10)
  })

  it('returns null on insufficient finite pairs or zero variance', () => {
    expect(pearson([1], [1])).toBeNull()
    expect(pearson([5, 5, 5], [1, 2, 3])).toBeNull() // x has no variance
    expect(pearson([1, NaN, 3], [1, 2, NaN])).toBeNull() // only 1 finite pair
  })

  it('ignores index pairs where either value is non-finite', () => {
    const r = pearson([1, 2, NaN, 4], [2, 4, 99, 8])
    expect(r!).toBeCloseTo(1, 10) // the NaN pair is skipped
  })
})

describe('correlationMatrix', () => {
  it('returns an empty matrix (UNKNOWN) when fewer than 2 symbols have enough bars', () => {
    const m = correlationMatrix([{ symbol: 'A', closes: [1, 2, 3] }], 2)
    expect(m).toEqual({ symbols: [], rows: [], bars: 0 })
  })

  it('builds a symmetric matrix with a unit diagonal', () => {
    const up = [1, 2, 3, 4, 5, 6]
    const down = [6, 5, 4, 3, 2, 1]
    const m = correlationMatrix([
      { symbol: 'UP', closes: up },
      { symbol: 'DN', closes: down },
    ], 2)
    expect(m.symbols).toEqual(['UP', 'DN'])
    expect(m.rows[0]![0]).toBe(1)
    expect(m.rows[1]![1]).toBe(1)
    expect(m.rows[0]![1]).toBeCloseTo(m.rows[1]![0]!, 10) // symmetric
    expect(m.bars).toBe(5)
  })
})

describe('featureAttribution', () => {
  it('decomposes weight x feature, squashes the score, and sorts by magnitude', () => {
    const weights = new Map<string, number>([['a', 0.5], ['b', -0.2], ['c', 0.1]])
    const features = { a: 1, b: 1, c: 1 }
    const out = featureAttribution(weights, 0, features, ['a', 'b', 'c'])
    expect(out.contributions[0]!.key).toBe('a') // |0.5| largest
    expect(out.contributions[0]!.contribution).toBeCloseTo(0.5, 10)
    expect(out.contributions[1]!.key).toBe('b') // |0.2| next
    expect(out.score).toBeCloseTo(Math.tanh(0.5 - 0.2 + 0.1), 10)
  })

  it('treats a missing weight or non-finite feature as 0', () => {
    const out = featureAttribution(new Map(), 0.3, { a: NaN }, ['a'])
    expect(out.contributions[0]!.contribution).toBe(0)
    expect(out.score).toBeCloseTo(Math.tanh(0.3), 10)
  })
})

describe('microstructureFromDepth', () => {
  const depth = (over: Partial<DepthSnapshot> = {}): DepthSnapshot => ({
    symbol: 'NVDA', mid: 100, spread: 0.1, vpin: 0.4,
    bids: [{ p: 99.95, size: 300, tot: 300 }],
    asks: [{ p: 100.05, size: 100, tot: 100 }],
    computedAt: 0, ...over,
  })

  it('computes imbalance, spread in bps, and clamps vpin', () => {
    const m = microstructureFromDepth(depth())
    expect(m.imbalance).toBeCloseTo((300 - 100) / 400, 10)
    expect(m.spreadBps).toBeCloseTo((0.1 / 100) * 10_000, 10)
    expect(m.vpin).toBe(0.4)
  })

  it('returns null fields when the book is empty (UNKNOWN, no fabrication)', () => {
    const m = microstructureFromDepth(depth({ bids: [], asks: [] }))
    expect(m.imbalance).toBeNull()
    expect(m.spreadBps).toBeNull()
    expect(m.bids).toEqual([])
  })

  it('handles a null depth snapshot', () => {
    const m = microstructureFromDepth(null)
    expect(m).toMatchObject({ imbalance: null, vpin: null, spreadBps: null })
  })
})

describe('deriveScenarioLayers', () => {
  it('omits layers whose input is null and scales confidence by calibration', () => {
    const layers = deriveScenarioLayers({
      modelScore: 0.8, trendStructure: null, imbalance: -0.5,
      calibrationMultiplier: 0.5, macroImminentHighImpact: false,
    })
    expect(layers.map(l => l.label)).toEqual(['Model (technical)', 'Order-flow'])
    expect(layers[0]!.direction).toBe('bull')
    expect(layers[0]!.confidence).toBeCloseTo(0.8 * 0.5, 10) // calibration-scaled
    expect(layers[1]!.direction).toBe('bear')
  })

  it('adds a neutral macro-risk layer when a high-impact event is imminent', () => {
    const layers = deriveScenarioLayers({
      modelScore: null, trendStructure: null, imbalance: null,
      calibrationMultiplier: 1, macroImminentHighImpact: true,
    })
    expect(layers).toHaveLength(1)
    expect(layers[0]).toMatchObject({ direction: 'neutral', confidence: 0.7 })
  })
})

describe('buildScenario', () => {
  it('normalizes to probabilities summing to 1 and counts convergence at conf>=0.6', () => {
    const layers: ScenarioLayer[] = [
      { label: 'a', direction: 'bull', confidence: 0.8 },
      { label: 'b', direction: 'bull', confidence: 0.7 },
      { label: 'c', direction: 'bear', confidence: 0.3 },
    ]
    const s = buildScenario(layers)
    expect(s.bull + s.bear + s.neutral).toBeCloseTo(1, 10)
    expect(s.dominant).toBe('bull')
    expect(s.convergence).toBe(2) // two bull layers at >=0.6
  })

  it('is fully neutral with zero convergence when there are no layers', () => {
    const s = buildScenario([])
    expect(s).toMatchObject({ bull: 0, bear: 0, neutral: 1, dominant: 'neutral', convergence: 0 })
  })
})
