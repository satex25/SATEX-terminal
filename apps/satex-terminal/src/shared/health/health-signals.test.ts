/**
 * SATEX — signal adapter tests (P-037).
 * Pure: no engine, no clock. Pins the two trend helpers + the compose→diagnose seam.
 */
import { describe, it, expect } from 'vitest'
import {
  computeMemGrowthPctPerHr,
  computeDrawdownPct,
  composeHealthSignals,
  MEM_GROWTH_MIN_SAMPLES,
  MEM_GROWTH_MIN_SPAN_MS,
  type HealthSnapshot,
  type MemSample,
} from './health-signals'
import { diagnoseHealth } from './diagnose'

const HOUR = 3_600_000

/** Build a sample ring spanning `spanMs` from `mb0` to `mb1`, `n` points. */
function ring(mb0: number, mb1: number, spanMs: number, n = 4): MemSample[] {
  const out: MemSample[] = []
  for (let i = 0; i < n; i++) {
    const f = n === 1 ? 0 : i / (n - 1)
    out.push({ t: i === 0 ? 0 : Math.round(f * spanMs), mb: mb0 + (mb1 - mb0) * f })
  }
  return out
}

describe('computeMemGrowthPctPerHr', () => {
  it('null below the minimum sample count', () => {
    expect(computeMemGrowthPctPerHr(ring(100, 200, HOUR, MEM_GROWTH_MIN_SAMPLES - 1))).toBeNull()
  })

  it('null when the span is too short (anti-noise warm-up)', () => {
    expect(computeMemGrowthPctPerHr(ring(100, 200, MEM_GROWTH_MIN_SPAN_MS - 1))).toBeNull()
  })

  it('null when the baseline is non-positive', () => {
    expect(computeMemGrowthPctPerHr(ring(0, 50, HOUR))).toBeNull()
  })

  it('0 for a flat ring', () => {
    expect(computeMemGrowthPctPerHr(ring(150, 150, HOUR))).toBe(0)
  })

  it('computes percent-of-baseline per hour (10% over 30min = 20%/hr)', () => {
    expect(computeMemGrowthPctPerHr(ring(100, 110, HOUR / 2))).toBeCloseTo(20, 6)
  })
})

describe('computeDrawdownPct', () => {
  it('0 when peak is non-positive or non-finite', () => {
    expect(computeDrawdownPct(0, 100)).toBe(0)
    expect(computeDrawdownPct(-5, 100)).toBe(0)
    expect(computeDrawdownPct(Number.NaN, 100)).toBe(0)
  })

  it('0 when current is at or above peak', () => {
    expect(computeDrawdownPct(100_000, 100_000)).toBe(0)
    expect(computeDrawdownPct(100_000, 110_000)).toBe(0)
  })

  it('positive fraction below peak (5% drawdown)', () => {
    expect(computeDrawdownPct(100_000, 95_000)).toBeCloseTo(0.05, 9)
  })
})

function snapshot(overrides: Partial<HealthSnapshot> = {}): HealthSnapshot {
  return {
    mode: 'paper',
    sessionState: 'CONNECTED',
    connected: true,
    tickHz: 20,
    msSinceLastTick: 40,
    wsDownMs: 0,
    memMb: 180,
    memSamples: [],
    peakEquity: 100_000,
    currentEquity: 100_000,
    errorRatePct: null,
    lastError: null,
    ...overrides,
  }
}

describe('composeHealthSignals', () => {
  it('derives mem-growth + drawdown and passes Tier-C through as null', () => {
    const s = composeHealthSignals(snapshot({ memSamples: ring(100, 110, HOUR / 2), peakEquity: 100_000, currentEquity: 96_000 }))
    expect(s.memGrowthPctPerHr).toBeCloseTo(20, 6)
    expect(s.drawdownPct).toBeCloseTo(0.04, 9)
    expect(s.errorRatePct).toBeNull()
    expect(s.lastError).toBeNull()
  })

  it('a nominal snapshot composes to a healthy verdict', () => {
    expect(diagnoseHealth(composeHealthSignals(snapshot())).severity).toBe('healthy')
  })

  it('a drawdown-breaching snapshot composes to a critical verdict', () => {
    const r = diagnoseHealth(composeHealthSignals(snapshot({ currentEquity: 94_000 }))) // 6% < peak
    expect(r.severity).toBe('critical')
    expect(r.findings[0]!.code).toBe('drawdown')
  })

  it('a connected-but-frozen feed composes to a feed-stall finding', () => {
    const r = diagnoseHealth(composeHealthSignals(snapshot({ tickHz: 0, msSinceLastTick: 60_000 })))
    expect(r.findings.some((f) => f.code === 'feed-stall')).toBe(true)
  })
})
