/**
 * SATEX — Funded Account Store (P-021)
 *
 * Receives FUNDED_ACCOUNT_UPDATE push events via useIPC and exposes the
 * FundedAccountSnapshot to every renderer component that needs it. Follows
 * the exact same pattern as riskGatesStore / regimeStore — single
 * `setSnapshot` setter, snapshot starts null until the first push arrives.
 *
 * Boot hydration is done in useIPC.ts via `window.satex.getFundedAccount()`
 * immediately after the push subscription is registered (post-subscribe seed
 * pattern matching getRiskGates / getRegime).
 */
import { create } from 'zustand'
import type { FundedAccountSnapshot } from '@shared/funded/types'

interface FundedAccountState {
  snapshot: FundedAccountSnapshot | null
  setSnapshot: (s: FundedAccountSnapshot) => void
}

export const useFundedAccountStore = create<FundedAccountState>((set) => ({
  snapshot: null,
  setSnapshot: (snapshot) => set({ snapshot }),
}))
