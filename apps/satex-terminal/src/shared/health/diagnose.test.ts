/**
 * SATEX — Self-Diagnostic Core tests (P-036).
 * Pure: no DOM, no engine, no clock. Every threshold boundary is pinned, plus
 * mode-gating, worst-wins fusion, deterministic ordering, and idempotence.
 */
import { describe, it, expect } from 'vitest'
import { diagnoseHealth, HEALTH_THRESHOLDS } from './diagnose'
import type { HealthSignals, HealthMode, HealthSessionState } from './types'

/** A fully-nominal `paper`-mode snapshot; override one field per case. */
function healthy(overrides: Partial<HealthSignals> = {}): HealthSignals {
  return {
    mode: 'paper',
    sessionState: 'CONNECTED',
    connected: true,
    tickHz: 20,
    msSinceLastTick: 50,
    wsDownMs: 0,
    memMb: 180,
    memGrowthPctPerHr: 2,
    errorRatePct: 0,
    drawdownPct: 0,
    lastError: null,
    ...overrides,
  }
}

describe('diagnoseHealth — nominal', () => {
  it('reports healthy with no findings when every signal is nominal', () => {
    const r = diagnoseHealth(healthy())
    expect(r.severity).toBe('healthy')
    expect(r.findings).toEqual([])
    expect(r.recommendedAction).toBeNull()
    expect(r.needsAttention).toBe(false)
  })

  it('is idempotent — same input yields a deep-equal report', () => {
    const s = healthy({ drawdownPct: 0.04, memGrowthPctPerHr: 12 })
    expect(diagnoseHealth(s)).toEqual(diagnoseHealth(s))
  })
})

describe('diagnoseHealth — silent feed stall (connected but no ticks)', () => {
  it('does not fire just below the degraded threshold', () => {
    const r = diagnoseHealth(healthy({ tickHz: 0, msSinceLastTick: HEALTH_THRESHOLDS.feedStallDegradedMs - 1 }))
    expect(r.severity).toBe('healthy')
  })

  it('fires degraded at the threshold', () => {
    const r = diagnoseHealth(healthy({ tickHz: 0, msSinceLastTick: HEALTH_THRESHOLDS.feedStallDegradedMs }))
    expect(r.severity).toBe('degraded')
    expect(r.findings[0]!.code).toBe('feed-stall')
    expect(r.findings[0]!.evidence).toContain('tickHz 0')
    expect(r.findings[0]!.ref).toContain('§')
  })

  it('escalates to critical past the critical threshold', () => {
    const r = diagnoseHealth(healthy({ tickHz: 0, msSinceLastTick: HEALTH_THRESHOLDS.feedStallCriticalMs + 1 }))
    expect(r.severity).toBe('critical')
    expect(r.findings[0]!.code).toBe('feed-stall')
  })

  it('does not fire while ticks are still flowing', () => {
    const r = diagnoseHealth(healthy({ tickHz: 1, msSinceLastTick: 999_999 }))
    expect(r.findings.some((f) => f.code === 'feed-stall')).toBe(false)
  })
})

describe('diagnoseHealth — WS disconnect duration', () => {
  it('degraded at the 10s alert threshold (§9.3)', () => {
    const r = diagnoseHealth(healthy({ wsDownMs: HEALTH_THRESHOLDS.wsDownDegradedMs }))
    expect(r.severity).toBe('degraded')
    expect(r.findings[0]!.code).toBe('feed-disconnected')
  })

  it('critical at the 5-minute HALT threshold (§11)', () => {
    const r = diagnoseHealth(healthy({ wsDownMs: HEALTH_THRESHOLDS.wsDownCriticalMs }))
    expect(r.severity).toBe('critical')
    expect(r.findings[0]!.code).toBe('feed-disconnected')
  })

  it('an explicit WS-down supersedes the silent-stall finding (mutually exclusive)', () => {
    const r = diagnoseHealth(healthy({ wsDownMs: 15_000, tickHz: 0, msSinceLastTick: 60_000 }))
    const codes = r.findings.map((f) => f.code)
    expect(codes).toContain('feed-disconnected')
    expect(codes).not.toContain('feed-stall')
  })
})

describe('diagnoseHealth — broker session machine', () => {
  it('FAILED session is critical', () => {
    const r = diagnoseHealth(healthy({ sessionState: 'FAILED' }))
    expect(r.severity).toBe('critical')
    expect(r.findings[0]!.code).toBe('session-failed')
  })

  it('RECONNECTING session is degraded', () => {
    const r = diagnoseHealth(healthy({ sessionState: 'RECONNECTING' }))
    expect(r.severity).toBe('degraded')
    expect(r.findings.some((f) => f.code === 'session-reconnecting')).toBe(true)
  })
})

describe('diagnoseHealth — mode gating (no false alarms)', () => {
  it('simulator suppresses feed/session findings (no broker WS exists)', () => {
    const r = diagnoseHealth(
      healthy({ mode: 'simulator', sessionState: null, tickHz: 0, msSinceLastTick: 999_999, wsDownMs: 999_999 }),
    )
    expect(r.severity).toBe('healthy')
    expect(r.findings).toEqual([])
  })

  it('replay suppresses feed/session AND drawdown findings', () => {
    const r = diagnoseHealth(
      healthy({ mode: 'replay', sessionState: 'FAILED', drawdownPct: 0.2, wsDownMs: 999_999 }),
    )
    expect(r.severity).toBe('healthy')
  })

  it('but process-level memory findings still apply in simulator', () => {
    const r = diagnoseHealth(healthy({ mode: 'simulator', sessionState: null, memGrowthPctPerHr: 30 }))
    expect(r.severity).toBe('critical')
    expect(r.findings[0]!.code).toBe('memory-growth')
  })
})

describe('diagnoseHealth — memory growth (§9.3)', () => {
  it('null growth (no baseline yet) produces no finding', () => {
    expect(diagnoseHealth(healthy({ memGrowthPctPerHr: null })).severity).toBe('healthy')
  })

  it('just below 10%/hr is healthy', () => {
    expect(diagnoseHealth(healthy({ memGrowthPctPerHr: 9.9 })).severity).toBe('healthy')
  })

  it('degraded at 10%/hr, critical at 25%/hr', () => {
    expect(diagnoseHealth(healthy({ memGrowthPctPerHr: 10 })).severity).toBe('degraded')
    expect(diagnoseHealth(healthy({ memGrowthPctPerHr: 25 })).severity).toBe('critical')
  })
})

describe('diagnoseHealth — error rate (§9.3 / §11)', () => {
  it('null rate (no calls) produces no finding', () => {
    expect(diagnoseHealth(healthy({ errorRatePct: null })).severity).toBe('healthy')
  })

  it('degraded at 5%, critical at 20%', () => {
    expect(diagnoseHealth(healthy({ errorRatePct: 5 })).severity).toBe('degraded')
    expect(diagnoseHealth(healthy({ errorRatePct: 20 })).severity).toBe('critical')
  })
})

describe('diagnoseHealth — drawdown (§5.2 / §5.3 / §8.1)', () => {
  it('just below 3% is healthy', () => {
    expect(diagnoseHealth(healthy({ drawdownPct: 0.0299 })).severity).toBe('healthy')
  })

  it('degraded at the 3% review floor with a percent evidence string', () => {
    const r = diagnoseHealth(healthy({ drawdownPct: HEALTH_THRESHOLDS.drawdownDegraded }))
    expect(r.severity).toBe('degraded')
    expect(r.findings[0]!.code).toBe('drawdown')
    expect(r.findings[0]!.evidence).toContain('3%')
  })

  it('critical at the 5% kill-switch floor', () => {
    const r = diagnoseHealth(healthy({ drawdownPct: HEALTH_THRESHOLDS.drawdownCritical }))
    expect(r.severity).toBe('critical')
    expect(r.findings[0]!.ref).toContain('§8.1')
  })
})

describe('diagnoseHealth — discrete engine error', () => {
  it('a non-empty lastError is degraded; empty/null is not', () => {
    expect(diagnoseHealth(healthy({ lastError: 'WS 1006 abnormal closure' })).severity).toBe('degraded')
    expect(diagnoseHealth(healthy({ lastError: '' })).severity).toBe('healthy')
    expect(diagnoseHealth(healthy({ lastError: null })).severity).toBe('healthy')
  })
})

describe('diagnoseHealth — fusion + ordering', () => {
  it('worst finding wins the overall severity', () => {
    const r = diagnoseHealth(healthy({ drawdownPct: 0.06, memGrowthPctPerHr: 12 }))
    expect(r.severity).toBe('critical')
    expect(r.needsAttention).toBe(true)
  })

  it('findings sort critical-first, then by fixed code order', () => {
    // session-failed (critical) + drawdown critical + memory degraded.
    const r = diagnoseHealth(healthy({ sessionState: 'FAILED', drawdownPct: 0.07, memGrowthPctPerHr: 12 }))
    expect(r.findings.map((f) => f.code)).toEqual(['session-failed', 'drawdown', 'memory-growth'])
    // recommendedAction is the worst/root finding's remediation.
    expect(r.recommendedAction).toBe(r.findings[0]!.remediation)
  })

  it('every emitted finding carries evidence, remediation, and a §ref', () => {
    const r = diagnoseHealth(healthy({ sessionState: 'FAILED', drawdownPct: 0.06, errorRatePct: 30, lastError: 'x' }))
    expect(r.findings.length).toBeGreaterThanOrEqual(3)
    for (const f of r.findings) {
      expect(f.evidence.length).toBeGreaterThan(0)
      expect(f.remediation.length).toBeGreaterThan(0)
      expect(f.ref).toContain('§')
      expect(f.severity === 'degraded' || f.severity === 'critical').toBe(true)
    }
  })
})

describe('HEALTH_THRESHOLDS — pinned to the Constitution', () => {
  it('matches §9.3 / §11 / §5 documented values', () => {
    expect(HEALTH_THRESHOLDS.wsDownDegradedMs).toBe(10_000) // §9.3 disconnect > 10s
    expect(HEALTH_THRESHOLDS.wsDownCriticalMs).toBe(300_000) // §11 > 5 min HALT
    expect(HEALTH_THRESHOLDS.memGrowthDegradedPctPerHr).toBe(10) // §9.3 heap > 10%/hr
    expect(HEALTH_THRESHOLDS.errorRateDegradedPct).toBe(5) // §9.3 error > 5%/min
    expect(HEALTH_THRESHOLDS.drawdownDegraded).toBe(0.03) // §5.3 / §11 > 3%
    expect(HEALTH_THRESHOLDS.drawdownCritical).toBe(0.05) // §5.2 / §8.1 > 5%
  })
})

describe('diagnoseHealth — totality (never throws, always valid)', () => {
  const ALL_MODES: HealthMode[] = ['simulator', 'paper', 'live', 'replay']
  const ALL_STATES: HealthSessionState[] = [
    'DISCONNECTED', 'CONNECTING', 'CONNECTED', 'RECONNECTING', 'FAILED', null,
  ]

  it('returns a well-formed report for every mode x session-state', () => {
    for (const mode of ALL_MODES) {
      for (const sessionState of ALL_STATES) {
        const r = diagnoseHealth(healthy({ mode, sessionState }))
        expect(['healthy', 'degraded', 'critical']).toContain(r.severity)
        expect(r.needsAttention).toBe(r.severity !== 'healthy')
        // recommendedAction is null iff there are no findings.
        expect(r.recommendedAction === null).toBe(r.findings.length === 0)
      }
    }
  })
})
