/**
 * SATEX — Intel analytics store (Zustand).
 *
 * Holds the read-only `IntelSnapshot` polled from the main process for the
 * currently-analyzed symbol, plus that symbol (research mode lets the operator
 * analyze a symbol independent of the global chart focus). The IntelWorkspace
 * owns the poll lifecycle (leak-safe); modules read the snapshot here. Changing
 * the analysis symbol clears the stale snapshot so a module never shows another
 * symbol's numbers for a frame.
 */
import { create } from 'zustand'
import type { IntelSnapshot } from '@shared/types'

interface IntelStoreState {
  /** Symbol the analytics are computed against (research-mode selectable). */
  symbol: string
  snapshot: IntelSnapshot | null
  lastUpdated: number
  setSymbol: (s: string) => void
  setSnapshot: (snap: IntelSnapshot | null) => void
}

export const useIntelStore = create<IntelStoreState>((set, get) => ({
  symbol: 'NVDA',
  snapshot: null,
  lastUpdated: 0,
  setSymbol: (s) => {
    const up = s.toUpperCase()
    if (up === get().symbol) return
    set({ symbol: up, snapshot: null, lastUpdated: 0 })
  },
  setSnapshot: (snap) => set({ snapshot: snap, lastUpdated: Date.now() }),
}))
