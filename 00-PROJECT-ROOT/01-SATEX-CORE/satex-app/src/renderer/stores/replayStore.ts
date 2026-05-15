/**
 * SATEX — Replay Status Store (Phase 10 · Black Box)
 *
 * Lifts replay state out of per-panel useEffects so the new App.tsx can
 * branch its center column on `active` without a chain of subscriptions.
 * Subscribed to REPLAY_STATUS push channel via useIPC.
 */
import { create } from 'zustand'
import type { ReplayStatus } from '@shared/types'

interface ReplayState {
  status: ReplayStatus | null
  active: boolean
  setStatus: (s: ReplayStatus) => void
}

export const useReplayStore = create<ReplayState>((set) => ({
  status: null,
  active: false,
  setStatus: (status) => set({
    status,
    active: status.mode === 'playing' || status.mode === 'paused',
  }),
}))
