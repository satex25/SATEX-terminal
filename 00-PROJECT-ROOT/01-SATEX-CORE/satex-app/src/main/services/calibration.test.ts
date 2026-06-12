import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  CalibrationService, computeBrier, computeBuckets, computeMultiplier,
  type OutcomeSample,
} from './calibration'
import * as db from './persistence'

vi.mock('./persistence', () => ({
  listCalibrationSamples: vi.fn(() => []),
  insertCalibrationSample: vi.fn(),
  pruneCalibrationLog: vi.fn(() => 0),
}))

function mk(confidence: number, win: boolean, i = 0): OutcomeSample {
  return { ts: 1_000 + i, symbol: 'NVDA', confidence, win }
}

/** n samples at a stated confidence with an exact realized win rate. */
function batch(n: number, confidence: number, winRate: number): OutcomeSample[] {
  const wins = Math.round(n * winRate)
  return Array.from({ length: n }, (_, i) => mk(confidence, i < wins, i))
}

describe('computeBrier', () => {
  it('returns null on empty window', () => {
    expect(computeBrier([])).toBeNull()
  })

  it('is 0 for a perfectly calibrated oracle', () => {
    expect(computeBrier([mk(1, true), mk(0, false)])).toBe(0)
  })

  it('is 0.25 for a coin claiming 0.5', () => {
    expect(computeBrier(batch(100, 0.5, 0.5))).toBeCloseTo(0.25, 10)
  })

  it('punishes confident wrongness hardest', () => {
    const arrogant = computeBrier([mk(0.9, false)])!
    const humble   = computeBrier([mk(0.55, false)])!
    expect(arrogant).toBeGreaterThan(humble)
    expect(arrogant).toBeCloseTo(0.81, 10)
  })
})

describe('computeBuckets', () => {
  it('produces 10 buckets spanning [0,1] with conf=1.0 in the top bucket', () => {
    const buckets = computeBuckets([mk(1.0, true), mk(0.05, false), mk(0.72, true), mk(0.78, false)])
    expect(buckets).toHaveLength(10)
    expect(buckets[9]!.n).toBe(1)            // conf=1.0
    expect(buckets[0]!.n).toBe(1)            // conf=0.05
    expect(buckets[7]!.n).toBe(2)            // 0.72 + 0.78
    expect(buckets[7]!.avgConfidence).toBeCloseTo(0.75, 10)
    expect(buckets[7]!.winRate).toBeCloseTo(0.5, 10)
  })
})

describe('computeMultiplier', () => {
  it('is identity below the sample floor', () => {
    expect(computeMultiplier(batch(29, 0.8, 0.1))).toBe(1)
  })

  it('downgrades an overconfident system by winRate/avgConfidence', () => {
    // Claims 75%, delivers 45% → 0.6 multiplier.
    expect(computeMultiplier(batch(100, 0.75, 0.45))).toBeCloseTo(0.6, 10)
  })

  it('never boosts an underconfident system above 1', () => {
    expect(computeMultiplier(batch(100, 0.5, 0.9))).toBe(1)
  })

  it('clamps catastrophic streaks at the floor instead of zeroing the system', () => {
    expect(computeMultiplier(batch(100, 0.9, 0.0))).toBe(0.5)
  })
})

describe('CalibrationService', () => {
  beforeEach(() => {
    // resetAllMocks (not clearAllMocks): mockReturnValue from a prior test
    // must not leak hydrated samples into the next test's initialize().
    vi.resetAllMocks()
    vi.mocked(db.listCalibrationSamples).mockReturnValue([])
  })

  it('hydrates from persistence on initialize', () => {
    vi.mocked(db.listCalibrationSamples).mockReturnValue(batch(40, 0.8, 0.4))
    const svc = new CalibrationService()
    svc.initialize()
    expect(svc.snapshot().samples).toBe(40)
    expect(svc.snapshot().multiplier).toBeCloseTo(0.5, 10)
  })

  it('record() clamps confidence, persists, and rolls the window', () => {
    const svc = new CalibrationService()
    svc.initialize()
    svc.record('NVDA', 1.7, 120)   // clamped to 1.0
    svc.record('AMD', -0.2, -50)   // clamped to 0.0
    expect(db.insertCalibrationSample).toHaveBeenCalledTimes(2)
    const snap = svc.snapshot()
    expect(snap.samples).toBe(2)
    expect(snap.buckets[9]!.n).toBe(1)
    expect(snap.buckets[0]!.n).toBe(1)
  })

  it('persistence failure never propagates into the close pipeline', () => {
    vi.mocked(db.insertCalibrationSample).mockImplementation(() => { throw new Error('disk full') })
    const svc = new CalibrationService()
    svc.initialize()
    expect(() => svc.record('NVDA', 0.7, 10)).not.toThrow()
    expect(svc.snapshot().samples).toBe(1)   // in-memory window still advanced
  })

  it('calibrate() is identity until MIN_SAMPLES, then downgrade-only', () => {
    const svc = new CalibrationService()
    svc.initialize()
    for (let i = 0; i < 29; i++) svc.record('NVDA', 0.8, -1)
    expect(svc.calibrate(0.8)).toBe(0.8)         // 29 samples — untouched
    svc.record('NVDA', 0.8, -1)                  // 30th sample, 0% win rate
    expect(svc.calibrate(0.8)).toBeCloseTo(0.4, 10)  // 0.8 × floor(0.5)
    expect(svc.snapshot().brierScore).toBeCloseTo(0.64, 10)
  })

  it('keeps the window bounded at 200', () => {
    const svc = new CalibrationService()
    svc.initialize()
    for (let i = 0; i < 250; i++) svc.record('NVDA', 0.6, 1)
    expect(svc.snapshot().samples).toBe(200)
  })
})
