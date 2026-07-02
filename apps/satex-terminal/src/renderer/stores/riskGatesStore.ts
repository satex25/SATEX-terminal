/**
 * SATEX — Risk Gates Store (Phase 10 · Black Box)
 * Subscribed to RISK_GATES_UPDATE push channel via useIPC.
 */
import { create } from 'zustand'
import type { RiskGatesSnapshot } from '@shared/types'

interface RiskGatesState {
  snapshot: RiskGatesSnapshot | null
  setSnapshot: (s: RiskGatesSnapshot) => void
}

export const useRiskGatesStore = create<RiskGatesState>((set) => ({
  snapshot: null,
  setSnapshot: (snapshot) => set({ snapshot }),
}))
