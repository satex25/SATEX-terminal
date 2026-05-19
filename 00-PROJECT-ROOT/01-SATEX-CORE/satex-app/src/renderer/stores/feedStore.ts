/**
 * SATEX — Feed Status Store (B3, 2026-05-18)
 *
 * Per-asset-class feed status. Subscribed to FEED_STATUS_UPDATE push channel
 * via useIPC. Drives the WatchlistPanel SIM badge so users can tell when a
 * quote is from a live broker feed vs a synthetic seed walk.
 *
 * Default before first push is the safe pessimistic shape: equity 'off',
 * futures 'synthetic' (always-true today), crypto 'off'. The 1500ms post-init
 * snapshot in main/index.ts overwrites this with the real engine state.
 */
import { create } from 'zustand'
import type { FeedStatus } from '@shared/types'

interface FeedState {
  status: FeedStatus
  setStatus: (s: FeedStatus) => void
}

const DEFAULT: FeedStatus = { equity: 'off', futures: 'synthetic', crypto: 'off' }

export const useFeedStore = create<FeedState>((set) => ({
  status: DEFAULT,
  setStatus: (status) => set({ status }),
}))
