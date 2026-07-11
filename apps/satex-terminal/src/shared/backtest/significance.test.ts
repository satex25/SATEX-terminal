/**
 * SATEX — significance.ts unit pins (P-096).
 * Every numeric expectation is hand-derived from the literature formula (shown
 * in-comment) or cross-checked against a sibling function (e.g. minTRL→PSR
 * round-trip), never copied from a run. Directional/monotonicity assertions
 * lock the qualitative behavior the operator relies on.
 */
import { describe, it, expect } from 'vitest'
import {
  mean,
  stdev,
  skewness,
  kurtosis,
  erf,
  normCdf,
  normInvCdf,
  probabilisticSharpe,
  minTrackRecordLength,
  expectedMaxSharpeNull,
  deflatedSharpe,
  significanceFromReturns,
  withDsr,
} from './significance'

describe('descriptive statistics', () => {
  it('mean and sample/population stdev', () => {
    expect(mean([2, 4, 6])).toBeCloseTo(4, 12)
    expect(mean([])).toBe(0)
    // var_pop of [2,4,6] = ((4)+(0)+(4))/3 = 2.6667 → sd 1.63299
    expect(stdev([2, 4, 6], 0)).toBeCloseTo(1.632993, 5)
    // var_sample = 8/2 = 4 → sd 2
    expect(stdev([2, 4, 6], 1)).toBeCloseTo(2, 12)
    expect(stdev([5], 1)).toBe(0) // n-ddof<=0 guard
    expect(stdev([3, 3, 3], 1)).toBe(0) // zero-variance guard
  })

  it('skewness: symmetric → 0, right-tailed → positive', () => {
    // [-1,-1,1,1]: μ=0, σ_pop=1, Σz³ = -1-1+1+1 = 0 → 0
    expect(skewness([-1, -1, 1, 1])).toBeCloseTo(0, 12)
    expect(skewness([1, 1, 1, 1, 10])).toBeGreaterThan(0) // one big right value
    expect(skewness([5])).toBe(0) // too short
  })

  it('kurtosis: RAW convention (two-point symmetric = 1, normal ≈ 3)', () => {
    // [-1,-1,1,1]: z=±1, z⁴=1 each → mean 1
    expect(kurtosis([-1, -1, 1, 1])).toBeCloseTo(1, 12)
    expect(kurtosis([5])).toBe(3) // degenerate → normal null, not NaN
    expect(kurtosis([3, 3, 3])).toBe(3) // zero-variance → normal null
  })
})

describe('normal distribution primitives', () => {
  it('erf anchors', () => {
    expect(erf(0)).toBeCloseTo(0, 6)
    expect(erf(3)).toBeCloseTo(1, 4)
    expect(erf(-1)).toBeCloseTo(-erf(1), 12) // odd function
  })

  it('normCdf anchors + symmetry', () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 6)
    expect(normCdf(1.2815515655)).toBeCloseTo(0.9, 4)
    expect(normCdf(1.959963985)).toBeCloseTo(0.975, 4)
    expect(normCdf(-1.5)).toBeCloseTo(1 - normCdf(1.5), 6)
  })

  it('normInvCdf anchors, symmetry, domain guards', () => {
    expect(normInvCdf(0.5)).toBeCloseTo(0, 8)
    expect(normInvCdf(0.975)).toBeCloseTo(1.959963985, 4)
    expect(normInvCdf(0.9)).toBeCloseTo(1.2815515655, 4)
    expect(normInvCdf(0.1)).toBeCloseTo(-normInvCdf(0.9), 6)
    expect(normInvCdf(0)).toBe(-Infinity)
    expect(normInvCdf(1)).toBe(Infinity)
  })

  it('normCdf ∘ normInvCdf round-trips across the body', () => {
    for (const p of [0.01, 0.2, 0.5, 0.8, 0.99]) {
      expect(normCdf(normInvCdf(p))).toBeCloseTo(p, 6)
    }
  })
})

describe('probabilisticSharpe (PSR)', () => {
  it('reference: SR=0.1, SR*=0, n=100, γ3=0, γ4=3 → ≈0.8395', () => {
    // denom=√(1+0.5·0.01)=1.0024969 ; num=0.1·√99=0.9949874 ; z=0.992540 ; Φ(z)≈0.83953
    expect(probabilisticSharpe(0.1, 0, 100, 0, 3)).toBeCloseTo(0.8395, 3)
  })

  it('increases with sample length n (all else equal)', () => {
    const short = probabilisticSharpe(0.1, 0, 30, 0, 3)!
    const long = probabilisticSharpe(0.1, 0, 500, 0, 3)!
    expect(long).toBeGreaterThan(short)
  })

  it('negative skew lowers PSR vs symmetric (fat left tail penalized)', () => {
    const sym = probabilisticSharpe(0.15, 0, 200, 0, 3)!
    const negSkew = probabilisticSharpe(0.15, 0, 200, -1.5, 6)!
    expect(negSkew).toBeLessThan(sym)
  })

  it('returns null for n<2', () => {
    expect(probabilisticSharpe(0.1, 0, 1, 0, 3)).toBeNull()
  })
})

describe('minTrackRecordLength', () => {
  it('reference: SR=0.1, SR*=0, γ3=0, γ4=3, conf=0.95 → ≈272.91', () => {
    // 1 + 1.005·(Φ⁻¹(0.95)/0.1)² = 1 + 1.005·(16.448536)² = 272.907
    expect(minTrackRecordLength(0.1, 0, 0, 3, 0.95)).toBeCloseTo(272.907, 1)
  })

  it('round-trips: PSR at n=minTRL equals the target confidence', () => {
    const n = minTrackRecordLength(0.1, 0, 0, 3, 0.95)
    expect(probabilisticSharpe(0.1, 0, n, 0, 3)).toBeCloseTo(0.95, 3)
  })

  it('unreachable (SR ≤ SR*) → Infinity', () => {
    expect(minTrackRecordLength(0, 0, 0, 3)).toBe(Infinity)
    expect(minTrackRecordLength(-0.05, 0, 0, 3)).toBe(Infinity)
  })
})

describe('expectedMaxSharpeNull', () => {
  it('N=10, varSR=1 → ~1.575 (Bailey–LdP expected max under null)', () => {
    const v = expectedMaxSharpeNull(1, 10)
    expect(v).toBeGreaterThan(1.5)
    expect(v).toBeLessThan(1.65)
  })

  it('no selection effect when N≤1 or varSR≤0', () => {
    expect(expectedMaxSharpeNull(1, 1)).toBe(0)
    expect(expectedMaxSharpeNull(0, 10)).toBe(0)
  })

  it('grows with the number of trials and with trial variance', () => {
    expect(expectedMaxSharpeNull(1, 100)).toBeGreaterThan(expectedMaxSharpeNull(1, 10))
    expect(expectedMaxSharpeNull(4, 10)).toBeGreaterThan(expectedMaxSharpeNull(1, 10))
  })
})

describe('deflatedSharpe (DSR)', () => {
  it('single trial → equals PSR vs 0 (no deflation possible)', () => {
    const psr = probabilisticSharpe(0.12, 0, 250, 0, 3)!
    const dsr = deflatedSharpe(0.12, 250, 0, 3, [0.12])!
    expect(dsr).toBeCloseTo(psr, 10)
  })

  it('multiple varied trials deflate below the naive PSR', () => {
    const psr = probabilisticSharpe(0.12, 0, 250, 0, 3)!
    const trials = [0.12, 0.05, -0.02, 0.08, 0.11, -0.06, 0.09, 0.03]
    const dsr = deflatedSharpe(0.12, 250, 0, 3, trials)!
    expect(dsr).toBeLessThan(psr) // selection bias correction bites
    expect(dsr).toBeGreaterThan(0)
    expect(dsr).toBeLessThan(1)
  })

  it('returns null for n<2', () => {
    expect(deflatedSharpe(0.12, 1, 0, 3, [0.12, 0.05])).toBeNull()
  })
})

describe('significanceFromReturns adapter', () => {
  it('computes a NON-annualized per-obs Sharpe = mean/stdev(ddof=1)', () => {
    const rets = [0.01, -0.005, 0.02, 0.0, 0.015] // μ=0.008, s=0.0103682 → SR≈0.77161
    const s = significanceFromReturns(rets)
    expect(s.n).toBe(5)
    expect(s.perObsSharpe).toBeCloseTo(0.77161, 4)
    expect(s.psr).not.toBeNull()
    expect(s.minTRL).not.toBeNull()
    expect(s.dsr).toBeNull() // not filled until withDsr
    expect(s.nTrials).toBeNull()
  })

  it('degenerate series → null sentinel, never NaN or throw', () => {
    const a = significanceFromReturns([]) // n=0
    const b = significanceFromReturns([0.01]) // n=1
    const c = significanceFromReturns([0.005, 0.005, 0.005]) // zero variance
    for (const s of [a, b, c]) {
      expect(s.perObsSharpe).toBeNull()
      expect(s.psr).toBeNull()
      expect(s.dsr).toBeNull()
    }
    expect(a.n).toBe(0)
    expect(c.n).toBe(3)
  })

  it('withDsr fills dsr/nTrials for a live row, leaves a sentinel row untouched', () => {
    const live = significanceFromReturns([0.01, -0.005, 0.02, 0.0, 0.015])
    const trialSRs = [live.perObsSharpe!, 0.2, -0.1, 0.05]
    const filled = withDsr(live, trialSRs)
    expect(filled.dsr).not.toBeNull()
    expect(filled.nTrials).toBe(4)
    expect(live.dsr).toBeNull() // withDsr is pure — original unchanged

    const sentinel = significanceFromReturns([])
    const stillSentinel = withDsr(sentinel, trialSRs)
    expect(stillSentinel.dsr).toBeNull()
    expect(stillSentinel.nTrials).toBeNull()
  })
})
