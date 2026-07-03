/**
 * SATEX — tradesStore (CHART-10 wiring).
 *
 * Per-symbol ring buffer of raw Trade prints, sourced from window.satex.onTradesTick.
 * OrderFlowTape reads from this store; useIPC already feeds the FootprintAggregator
 * via the same channel but discards raw trades after aggregation, so the tape needs
 * its own buffer to render individual prints. Singleton lazy subscription mirrors
 * the footprintStore pattern (one channel, multiple consumers).
 */
import { create } from 'zustand'
import type { Trade } from '@shared/types'

const MAX_PER_SYMBOL = 500

interface State {
  bySymbol: Record<string, readonly Trade[]>
  ingest:   (batch: Trade[]) => void
  reset:    () => void
}

export const useTradesStore = create<State>((set, get) => ({
  bySymbol: {},
  ingest: (batch) => {
    if (!batch || batch.length === 0) return
    const next: Record<string, Trade[]> = { ...get().bySymbol } as Record<string, Trade[]>
    for (const t of batch) {
      const prev = (next[t.symbol] ?? []) as Trade[]
      const merged = prev.length >= MAX_PER_SYMBOL
        ? [...prev.slice(prev.length - MAX_PER_SYMBOL + 1), t]
        : [...prev, t]
      next[t.symbol] = merged
    }
    set({ bySymbol: next })
  },
  reset: () => set({ bySymbol: {} }),
}))

// useSyncExternalStore (Zustand v5) requires selectors to return stable references for
// the same state -- `?? []` mints a new array on every call and breaks the snapshot-cache
// invariant, causing infinite render loops (same pitfall solved by EMPTY_DRAWINGS in
// drawingStore / EMPTY_CANDLES in marketStore). Subscribe via this selector so a symbol
// with no prints yet yields one frozen array instead of a fresh one every render.
const EMPTY_TRADES: readonly Trade[] = Object.freeze([])

/** Stable per-symbol trades selector for React subscriptions. */
export const selectTrades = (symbol: string) => (s: State): readonly Trade[] =>
  s.bySymbol[symbol] ?? EMPTY_TRADES

let subscribed = false
let cleanup: (() => void) | null = null

/** Idempotent — first call attaches the IPC subscription, subsequent calls no-op. */
export function ensureTradesSubscription(): void {
  if (subscribed) return
  subscribed = true
  const ingest = useTradesStore.getState().ingest
  const w = window as unknown as {
    satex?: { onTradesTick?: (h: (batch: Trade[]) => void) => () => void }
  }
  cleanup = w.satex?.onTradesTick?.((batch: Trade[]) => ingest(batch)) ?? null
}

/** Optional teardown — exposed for tests / hot-reload, not used in normal lifecycle. */
export function disposeTradesSubscription(): void {
  cleanup?.()
  cleanup = null
  subscribed = false
}
