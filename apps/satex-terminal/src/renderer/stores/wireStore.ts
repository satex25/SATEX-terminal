/**
 * SATEX — THE WIRE store. Hydrated by WIRE_UPDATE pushes + WIRE_GET on mount
 * (subscription lives in NewsDeskPanel — the desk is the only consumer).
 */
import { create } from 'zustand'
import type { WireSnapshot } from '@shared/types'

interface WireState {
  snap: WireSnapshot | null
  setSnap: (s: WireSnapshot) => void
}

export const useWireStore = create<WireState>((set) => ({
  snap: null,
  setSnap: (snap) => set({ snap }),
}))
