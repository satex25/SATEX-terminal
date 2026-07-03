/**
 * riskGatesStore contract tests (P-054).
 *
 * The store is a read-only DISPLAY MIRROR of RISK_GATES_UPDATE pushes —
 * off the trading-safety perimeter; these tests pin display contracts only:
 * initial-null, store-exact-object (no derivation, no mutation), replace on
 * next push. Enforcement lives in main `services/risk/` and is not touched.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useRiskGatesStore } from './riskGatesStore'
import type { RiskGatesSnapshot } from '@shared/types'

function makeSnap(computedAt: number): RiskGatesSnapshot {
  return { gates: [], passingCount: 0, watchingCount: 0, breachingCount: 0, computedAt }
}

beforeEach(() => {
  useRiskGatesStore.setState({ snapshot: null })
})

describe('riskGatesStore (display mirror)', () => {
  it('starts with no snapshot', () => {
    expect(useRiskGatesStore.getState().snapshot).toBeNull()
  })

  it('stores the pushed snapshot verbatim — no derivation, no mutation', () => {
    const snap = makeSnap(1_000)
    const clone = structuredClone(snap)
    useRiskGatesStore.getState().setSnapshot(snap)
    expect(useRiskGatesStore.getState().snapshot).toBe(snap)
    expect(snap).toEqual(clone)
  })

  it('replaces the snapshot on the next push', () => {
    useRiskGatesStore.getState().setSnapshot(makeSnap(1_000))
    const next = makeSnap(2_000)
    useRiskGatesStore.getState().setSnapshot(next)
    expect(useRiskGatesStore.getState().snapshot).toBe(next)
  })
})
