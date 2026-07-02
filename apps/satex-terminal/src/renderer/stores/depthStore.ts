/**
 * SATEX — L2 Depth Snapshot Store (Phase 10 · Black Box)
 * Subscribed to DEPTH_UPDATE push channel via useIPC.
 */
import { create } from 'zustand'
import type { DepthSnapshot } from '@shared/types'

interface DepthState {
  snapshot: DepthSnapshot | null
  setSnapshot: (s: DepthSnapshot) => void
}

export const useDepthStore = create<DepthState>((set) => ({
  snapshot: null,
  setSnapshot: (snapshot) => set({ snapshot }),
}))
