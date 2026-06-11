import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PatternLearner } from './pattern-learner'
import * as db from './persistence'
import type { Observation } from '@shared/types'

vi.mock('./persistence', () => ({
  listObservations: vi.fn(() => []),
  listPatternWeights: vi.fn(() => []),
  upsertPatternWeight: vi.fn(),
  insertLearningCycle: vi.fn(),
}))

/** A strongly-trending observation stream: rising last + bullish stack so the
 *  forward log-return labels are non-zero and gradients actually move. */
function obs(ts: number, last: number): Observation {
  return {
    ts, symbol: 'NVDA', last, mid: last, spreadBps: 2, velocityBps: 12,
    ema9: last, ema21: last - 1, ema50: last - 2,
    rsi14: 64, atr14: 1.2, vwap: last - 0.5, trendStrength: 0.7,
    regime: 'trend_up',
  }
}

/** 5 minutes of 5s-spaced observations ending at `now`, trending +0.1%/step. */
function stream(now: number): Observation[] {
  const out: Observation[] = []
  for (let i = 0; i < 60; i++) {
    const ts = now - 300_000 + i * 5_000
    out.push(obs(ts, 100 * (1 + 0.001 * i)))
  }
  return out
}

/** Gradient persistence volume — proxy for "did anything learn?". */
function persistCallCount(): number {
  return vi.mocked(db.upsertPatternWeight).mock.calls.length
}

describe('PatternLearner — P-001 duplicate-update cursor', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(db.listObservations).mockReturnValue([])
    vi.mocked(db.listPatternWeights).mockReturnValue([])
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-10T15:00:00Z'))
  })

  it('learns from each observation exactly once across overlapping cycles', async () => {
    const now = Date.now()
    const tape = stream(now)
    vi.mocked(db.listObservations).mockReturnValue(tape)

    const learner = new PatternLearner({ getWatchlist: () => ['NVDA'] })
    learner.initialize()

    await learner.cycle()
    const firstCycle = vi.mocked(db.insertLearningCycle).mock.calls[0]![0]
    expect(firstCycle.weightsUpdated).toBeGreaterThan(0)

    // Same DB contents 30s later (the overlapping-window scenario): pre-fix
    // this re-applied every gradient; post-fix nothing new is labelable.
    vi.setSystemTime(now + 30_000)
    await learner.cycle()
    const secondCycle = vi.mocked(db.insertLearningCycle).mock.calls[1]![0]
    expect(secondCycle.weightsUpdated).toBe(0)
    expect(secondCycle.note).toBe('insufficient-observations')
  })

  it('resumes from the cursor when NEW observations arrive', async () => {
    const now = Date.now()
    const tape = stream(now)
    vi.mocked(db.listObservations).mockReturnValue(tape)
    const learner = new PatternLearner({ getWatchlist: () => ['NVDA'] })
    learner.initialize()
    await learner.cycle()
    const updatedFirst = vi.mocked(db.insertLearningCycle).mock.calls[0]![0].weightsUpdated

    // 90s later: the stream extended by 18 fresh observations; the previously
    // unlabelable tail (inside the 60s horizon) plus some new rows mature.
    vi.setSystemTime(now + 90_000)
    const extended = [...tape]
    for (let i = 0; i < 18; i++) {
      extended.push(obs(now + (i + 1) * 5_000, 106 * (1 + 0.001 * i)))
    }
    vi.mocked(db.listObservations).mockReturnValue(extended)
    await learner.cycle()
    const second = vi.mocked(db.insertLearningCycle).mock.calls[1]![0]
    expect(second.weightsUpdated).toBeGreaterThan(0)

    // And the union never exceeds one update per labelable observation.
    expect(updatedFirst + second.weightsUpdated).toBeLessThanOrEqual(extended.length)
  })

  it('persists weights only when something was actually learned', async () => {
    const learner = new PatternLearner({ getWatchlist: () => ['NVDA'] })
    learner.initialize()
    await learner.cycle()                 // empty DB → no observations
    expect(persistCallCount()).toBe(0)
    expect(vi.mocked(db.insertLearningCycle).mock.calls[0]![0].note).toBe('insufficient-observations')
  })
})
