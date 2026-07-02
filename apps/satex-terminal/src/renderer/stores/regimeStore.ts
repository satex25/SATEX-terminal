/**
 * SATEX — Regime Snapshot Store (Phase 10 · Black Box)
 * Subscribed to REGIME_UPDATE push channel via useIPC.
 */
import { create } from 'zustand'
import type { RegimeSnapshot } from '@shared/types'

interface RegimeState {
  snapshot: RegimeSnapshot | null
  setSnapshot: (s: RegimeSnapshot) => void
}

export const useRegimeStore = create<RegimeState>((set) => ({
  snapshot: null,
  setSnapshot: (snapshot) => set({ snapshot }),
}))
