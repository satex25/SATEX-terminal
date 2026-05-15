/**
 * SATEX — Macro Calendar Store (Phase 10 · Black Box)
 * Subscribed to MACRO_UPDATE push channel via useIPC.
 */
import { create } from 'zustand'
import type { MacroSnapshot } from '@shared/types'

interface MacroState {
  snapshot: MacroSnapshot | null
  setSnapshot: (s: MacroSnapshot) => void
}

export const useMacroStore = create<MacroState>((set) => ({
  snapshot: null,
  setSnapshot: (snapshot) => set({ snapshot }),
}))
