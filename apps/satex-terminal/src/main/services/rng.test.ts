/**
 * SATEX — PRNG (mulberry32) tests.
 *
 * Key invariants protected here:
 *   1. next() output is always in [0, 1).
 *   2. Same seed produces the EXACT same sequence (simulator reproducibility).
 *   3. nextInt(max) returns integers strictly in [0, max).
 *   4. nextGaussian() returns finite numbers with a near-zero mean over N=10k.
 *   5. randomSeed() returns non-negative integers (two calls differ with high probability).
 *
 * If test (2) breaks, simulator tick streams are no longer reproducible across
 * runs or Node versions — a critical regression for backtesting fidelity.
 */
import { describe, it, expect } from 'vitest'
import { mulberry32, randomSeed } from './rng'

// ─── next() ────────────────────────────────────────────────────────────────

describe('mulberry32 — next()', () => {
  it('always returns values in [0, 1)', () => {
    const rng = mulberry32(42)
    for (let i = 0; i < 200; i++) {
      const v = rng.next()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('same seed → identical sequence (determinism / simulator reproducibility)', () => {
    const a = mulberry32(99_999)
    const b = mulberry32(99_999)
    for (let i = 0; i < 100; i++) {
      expect(a.next()).toBe(b.next())
    }
  })

  it('different seeds produce meaningfully different sequences', () => {
    const a = mulberry32(1)
    const b = mulberry32(2)
    const mismatches = Array.from({ length: 20 }, () => a.next() !== b.next())
    // Probability of all 20 matching is astronomically small for a good PRNG
    expect(mismatches.some(Boolean)).toBe(true)
  })

  it('seed 0 is valid and deterministic', () => {
    const a = mulberry32(0)
    const b = mulberry32(0)
    expect(a.next()).toBe(b.next())
  })

  it('fractional seeds are floor-truncated (>>> 0 in implementation)', () => {
    // mulberry32(1) and mulberry32(1.9) should behave the same because
    // the implementation does `let s = seed >>> 0`
    const a = mulberry32(1)
    const b = mulberry32(1.9)
    expect(a.next()).toBe(b.next())
  })
})

// ─── nextInt() ─────────────────────────────────────────────────────────────

describe('mulberry32 — nextInt()', () => {
  it('returns integers in [0, max) for max=10', () => {
    const rng = mulberry32(7)
    for (let i = 0; i < 300; i++) {
      const v = rng.nextInt(10)
      expect(Number.isInteger(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(10)
    }
  })

  it('returns integers in [0, max) for max=1 (always 0)', () => {
    const rng = mulberry32(3)
    for (let i = 0; i < 20; i++) {
      expect(rng.nextInt(1)).toBe(0)
    }
  })

  it('covers all values in range with enough samples', () => {
    const rng = mulberry32(0xABCD_EF01)
    const counts = new Array<number>(5).fill(0)
    for (let i = 0; i < 5000; i++) counts[rng.nextInt(5)]++
    // Every bucket should appear at least once over 5000 draws
    expect(counts.every(c => c > 0)).toBe(true)
  })
})

// ─── nextGaussian() ────────────────────────────────────────────────────────

describe('mulberry32 — nextGaussian()', () => {
  it('returns finite numbers', () => {
    const rng = mulberry32(13)
    for (let i = 0; i < 100; i++) {
      expect(Number.isFinite(rng.nextGaussian())).toBe(true)
    }
  })

  it('mean ≈ 0 over N=10 000 (Box-Muller sanity check)', () => {
    const rng = mulberry32(0xDEAD_BEEF)
    let sum = 0
    for (let i = 0; i < 10_000; i++) sum += rng.nextGaussian()
    // For a true N(0,1), E[X̄] = 0 with std-err ≈ 0.01 over 10k samples.
    // Tolerance of ±0.05 gives ~5σ margin — should never flake.
    expect(Math.abs(sum / 10_000)).toBeLessThan(0.05)
  })

  it('spare value is consumed on next call (pairs exhaust correctly)', () => {
    // Box-Muller produces two samples per rejection-loop iteration;
    // the second is stored as _spare. Verify every call returns a value.
    const rng = mulberry32(55)
    const samples = Array.from({ length: 10 }, () => rng.nextGaussian())
    expect(samples.every(Number.isFinite)).toBe(true)
  })
})

// ─── randomSeed() ──────────────────────────────────────────────────────────

describe('randomSeed', () => {
  it('returns a non-negative integer', () => {
    const s = randomSeed()
    expect(Number.isInteger(s)).toBe(true)
    expect(s).toBeGreaterThanOrEqual(0)
    // uint32 ceiling
    expect(s).toBeLessThanOrEqual(0xFFFF_FFFF)
  })

  it('returns different values on repeated calls (stochastic; P(collision) < 2⁻³²)', () => {
    const seeds = new Set(Array.from({ length: 20 }, randomSeed))
    expect(seeds.size).toBeGreaterThan(1)
  })
})
