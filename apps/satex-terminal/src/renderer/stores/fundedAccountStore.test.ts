/**
 * SATEX — Funded-account store characterization coverage.
 *
 * Pins the FUNDED_ACCOUNT_UPDATE reducer (L1.D funded-overlay display state):
 * snapshot starts null until the first push, and setSnapshot replaces by
 * reference. This is display-only state — it routes no order — but the funded
 * rail's MLL buffer reads from here, so the null-until-push contract must hold.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import type { FundedAccountSnapshot } from '@shared/funded/types'
import { useFundedAccountStore } from './fundedAccountStore'

function snapshot(highestEodBalance = 50_000): FundedAccountSnapshot {
  return {
    active: false,
    profile: null,
    highestEodBalance,
    currentMll: highestEodBalance - 2_000,
    mllLocked: false,
    mllBuffer: 2_000,
    today: '2026-07-20',
    msToFlatBy: 0,
    ledger: [],
    payoutMetrics: {
      totalProfit: 0,
      largestProfitableDay: 0,
      consistencyRatio: 0,
      consistencyOk: true,
      profitTargetProgress: 0,
      profitTargetReached: false,
      tradingDaysCount: 0,
      minDaysSatisfied: false,
      phase: 'combine',
      dailyHistory: [],
    },
    computedAt: 0,
  }
}

beforeEach(() => {
  useFundedAccountStore.setState(useFundedAccountStore.getInitialState(), true)
})

describe('fundedAccountStore', () => {
  it('seeds a null snapshot (nothing until the first push)', () => {
    expect(useFundedAccountStore.getState().snapshot).toBeNull()
  })

  it('setSnapshot stores the snapshot by reference', () => {
    const s = snapshot()
    useFundedAccountStore.getState().setSnapshot(s)
    expect(useFundedAccountStore.getState().snapshot).toBe(s)
  })

  it('a second setSnapshot replaces the previous', () => {
    const a = snapshot(50_000)
    const b = snapshot(51_000)
    useFundedAccountStore.getState().setSnapshot(a)
    useFundedAccountStore.getState().setSnapshot(b)
    expect(useFundedAccountStore.getState().snapshot).toBe(b)
  })
})
