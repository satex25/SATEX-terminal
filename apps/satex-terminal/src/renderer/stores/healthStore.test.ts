/**
 * SATEX — Health store characterization coverage.
 *
 * Pins the HEALTH_REPORT reducer: the healthy/empty default report, and
 * setReport replace-by-reference. The renderer health pill reads `needsAttention`
 * from here, so the healthy default (severity 'healthy', no findings, no
 * recommended action, needsAttention false) must not drift.
 *
 * Also pins — but does NOT fix — the observed shared-mutable-default aliasing:
 * the initial `report` (and its `findings` array) is the module const by
 * reference (P-061/P-074 class). Flagged for operator taste (ledger), not edited.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import type { HealthReport, HealthFinding } from '@shared/health/types'
import { useHealthStore } from './healthStore'

function finding(): HealthFinding {
  return {
    code: 'feed-stall',
    severity: 'degraded',
    summary: 'no ticks are landing',
    evidence: '0 ticks in 5s while connected',
    remediation: 'reconnect the feed',
    ref: '§9.3',
  }
}

function report(): HealthReport {
  return {
    severity: 'degraded',
    findings: [finding()],
    recommendedAction: 'reconnect the feed',
    needsAttention: true,
  }
}

beforeEach(() => {
  useHealthStore.setState(useHealthStore.getInitialState(), true)
})

describe('healthStore — initial state', () => {
  it('seeds a healthy, empty report', () => {
    expect(useHealthStore.getState().report).toEqual({
      severity: 'healthy',
      findings: [],
      recommendedAction: null,
      needsAttention: false,
    })
  })
})

describe('healthStore — setReport', () => {
  it('stores the report by reference', () => {
    const r = report()
    useHealthStore.getState().setReport(r)
    expect(useHealthStore.getState().report).toBe(r)
    expect(useHealthStore.getState().report.needsAttention).toBe(true)
  })

  it('LATENT ALIASING (P-061/P-074): initial report + findings are the shared module const', () => {
    const first = useHealthStore.getInitialState().report
    const second = useHealthStore.getInitialState().report
    expect(first).toBe(second)
    expect(first.findings).toBe(second.findings)
  })
})
