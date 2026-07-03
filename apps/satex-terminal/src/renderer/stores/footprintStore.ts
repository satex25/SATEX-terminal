/**
 * SATEX — Footprint store (P0-1 · 2026-05-15).
 *
 * Holds one shared FootprintAggregator and exposes per-symbol candle reads.
 * Subscribes via useIPC to the TRADES_TICK push channel and feeds every
 * incoming Trade into the aggregator. The DeltaStrip / FootprintOverlay
 * components read the per-symbol slice via `useFootprintCandles(symbol)`.
 *
 * Why a store and not a hook around `useState`:
 *   - the aggregator is shared across panels (DeltaStrip + multi-pane Quad
 *     would otherwise need duplicate aggregators);
 *   - we want a single subscription to TRADES_TICK, not one per consumer;
 *   - capping memory globally (per-symbol historyLimit) is simpler with one
 *     instance.
 *
 * The `version` counter increments on every ingestion so React can re-read
 * the aggregator's data even though the Maps inside aren't reactive. Zustand
 * notifies subscribers when version changes; selectors derive fresh slices.
 */
import { create } from 'zustand'
import { FootprintAggregator } from '@shared/footprint-aggregator'
import type { FootprintCandle } from '@shared/footprint-aggregator'
import type { Trade } from '@shared/types'

interface FootprintStoreState {
  /** Single shared aggregator. Methods are stable, state lives in this object. */
  agg: FootprintAggregator
  /** Monotonic version — bumped on every ingestion so subscribers re-render. */
  version: number
  /** Ingest a batch of trades. Called from useIPC. */
  ingest: (trades: Trade[]) => void
  /** Clear all candle history (e.g. on replay swap). */
  reset: () => void
}

export const useFootprintStore = create<FootprintStoreState>((set, get) => ({
  agg: new FootprintAggregator({ tickSize: 0.01, candleSec: 1, historyLimit: 240 }),
  version: 0,
  ingest: (trades) => {
    if (!trades || trades.length === 0) return
    const agg = get().agg
    for (const t of trades) agg.ingest(t)
    set({ version: get().version + 1 })
  },
  reset: () => {
    get().agg.clearAll()
    set({ version: get().version + 1 })
  },
}))

/** Selector hook — returns the most-recent N footprint candles for a symbol.
 *  Re-evaluates whenever the aggregator version bumps (= on each tick batch). */
export function useFootprintCandles(symbol: string, limit = 60): FootprintCandle[] {
  const version = useFootprintStore(s => s.version)
  const agg     = useFootprintStore(s => s.agg)
  // version is referenced so the hook re-runs when ingestion happens.
  void version
  return agg.recent(symbol, limit)
}
