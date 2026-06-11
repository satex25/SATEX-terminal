import { describe, it, expect } from 'vitest'
import { renderLearningsMd, computeWeightDrift, MAX_REPORT_BYTES, type LearningsInput } from './learning-report'
import type { BrainParameter, CalibrationSnapshot } from '@shared/types'

function param(key: string, value: number, symbol: string | null = null): BrainParameter {
  return { key, symbol, value, sampleSize: 10, confidence: 0.25, updatedAt: 1 }
}

function calib(over: Partial<CalibrationSnapshot> = {}): CalibrationSnapshot {
  return {
    samples: 0, minSamples: 30, brierScore: null, multiplier: 1, computedAt: 1,
    buckets: Array.from({ length: 10 }, (_, i) => ({ lo: i / 10, hi: (i + 1) / 10, n: 0, avgConfidence: 0, winRate: 0 })),
    ...over,
  }
}

function input(over: Partial<LearningsInput> = {}): LearningsInput {
  return {
    sessionId: 'ses_test',
    startedAt: Date.parse('2026-06-10T13:30:00Z'),
    endedAt: Date.parse('2026-06-10T20:00:00Z'),
    calibration: calib(),
    weightsAtStart: [param('ema_stack', 0.40), param('rsi_mid', 0.15)],
    weightsAtEnd: [param('ema_stack', 0.40), param('rsi_mid', 0.15)],
    learner: { running: true, cycles: 120, lastCycleAt: 1, lastCycleObservations: 300, lastCycleAvgError: 0.0123, weightsTracked: 24 },
    autonomous: { enabled: true, lastDecisionAt: 1, approvedCount: 4, rejectedCount: 9, cooldownsActive: 2, signalsFired: 13 },
    ...over,
  }
}

describe('computeWeightDrift', () => {
  it('reports movers sorted by |delta|, ignoring noise and per-symbol rows', () => {
    const start = [param('ema_stack', 0.40), param('rsi_mid', 0.15), param('vwap_side', 0.20), param('sym_thing', 0.5, 'NVDA')]
    const end   = [param('ema_stack', 0.52), param('rsi_mid', 0.151), param('vwap_side', 0.14), param('sym_thing', 0.9, 'NVDA')]
    const drift = computeWeightDrift(start, end)
    expect(drift.map(d => d.key)).toEqual(['ema_stack', 'vwap_side'])  // rsi_mid < epsilon; symbol row excluded
    expect(drift[0]!.delta).toBeCloseTo(0.12, 10)
  })

  it('caps at 5 rows', () => {
    const start = Array.from({ length: 8 }, (_, i) => param(`f${i}`, 0))
    const end   = Array.from({ length: 8 }, (_, i) => param(`f${i}`, 0.1 * (i + 1)))
    expect(computeWeightDrift(start, end)).toHaveLength(5)
  })
})

describe('renderLearningsMd', () => {
  it('calls out a no-learning session explicitly', () => {
    const md = renderLearningsMd(input())
    expect(md).toMatch(/No weight movement/)
    expect(md).toMatch(/calibration starts with the first closed autonomous trade/)
    expect(md).toMatch(/13 signals → 4 entered, 9 rejected \(31% pass rate\)/)
  })

  it('reports drift, calibration honesty, and the worst bucket when data exists', () => {
    const buckets = calib().buckets
    buckets[7] = { lo: 0.7, hi: 0.8, n: 12, avgConfidence: 0.75, winRate: 0.42 }
    const md = renderLearningsMd(input({
      weightsAtEnd: [param('ema_stack', 0.52), param('rsi_mid', 0.15)],
      calibration: calib({ samples: 40, brierScore: 0.31, multiplier: 0.78, buckets }),
    }))
    expect(md).toMatch(/\*\*ema_stack\*\* ↑ \+0\.120/)
    expect(md).toMatch(/Brier \*\*0\.310\*\*/)
    expect(md).toMatch(/×0\.78\*\*.*downgraded for overconfidence/)
    expect(md).toMatch(/70–80% bucket is overconfident by 33pts/)
  })

  it('never exceeds the byte cap, truncating at a line boundary', () => {
    // Force pathological size with long synthetic keys.
    const start = Array.from({ length: 5 }, (_, i) => param(`feature_${'x'.repeat(900)}_${i}`, 0))
    const end   = Array.from({ length: 5 }, (_, i) => param(`feature_${'x'.repeat(900)}_${i}`, 1))
    const md = renderLearningsMd(input({ weightsAtStart: start, weightsAtEnd: end }))
    expect(Buffer.byteLength(md, 'utf-8')).toBeLessThanOrEqual(MAX_REPORT_BYTES)
    expect(md).toMatch(/truncated at size cap/)
  })

  it('carries Obsidian frontmatter + session duration in the title', () => {
    const md = renderLearningsMd(input())
    expect(md).toMatch(/^---\ntype: learnings\nsession: ses_test/)
    expect(md).toMatch(/Session Learnings — 2026-06-10 \(6h 30m\)/)
  })
})
