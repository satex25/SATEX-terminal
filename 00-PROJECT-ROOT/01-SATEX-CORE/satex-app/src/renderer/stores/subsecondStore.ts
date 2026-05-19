/**
 * SATEX — Sub-second crypto candle store (A1, v0.4.4)
 *
 * Renderer-side ring of bucket-sealed bars, keyed by `${symbol}:${bucketMs}`.
 * Fed by `useIPC` from SUBSECOND_CANDLES_UPDATE push events (one bar per seal).
 * Initial hydration on chart mount / timeframe switch goes through the
 * `window.satex.getSubsecondCandles(symbol, bucketMs, limit)` invoke path.
 *
 * Crypto-only by construction — main never pushes equity / index / future bars
 * on this channel. The store doesn't enforce a class filter; if a non-crypto
 * symbol somehow lands here it'll get rung but the ChartPanel only fetches
 * for crypto symbols anyway.
 *
 * Capped at 1 200 bars per (symbol, bucketMs) — slightly above the engine's
 * 1 000-bar retention so the renderer holds a small margin while the eviction
 * race on the engine side settles. Oldest dropped from the head on overflow.
 */
import { create } from 'zustand'
import type { SubSecondCandle } from '@shared/types'

const MAX_BARS_PER_SERIES = 1_200

/** Sprint 2 — the same {250, 500} literal-union as the engine + Zod schema.
 *  Kept tight in the store so a future addition of e.g. 100ms requires a
 *  matched bump on all three surfaces (engine, schema, store) instead of
 *  silently widening the renderer contract. */
export type PreferredBucketMs = 250 | 500

interface SubsecondState {
  /** Map<`${symbol}:${bucketMs}`, SubSecondCandle[]> — bars in ascending time order. */
  series: Map<string, SubSecondCandle[]>
  /** Sprint 2 — per-symbol preferred default bucket mirror. Hydrated from
   *  main on mount via useIPC; updated optimistically by Settings UI clicks
   *  then reconciled with the engine's authoritative full-prefs map echo. */
  prefs: Record<string, PreferredBucketMs>
  /** Replace the entire ring for one (symbol, bucketMs) — used by the
   *  hydration path. Bars must already be in ascending time order. */
  hydrate: (symbol: string, bucketMs: number, bars: SubSecondCandle[]) => void
  /** Append (or update in place if openMs matches the last bar) one bar.
   *  Trims the head when length exceeds MAX_BARS_PER_SERIES. */
  appendBar: (bar: SubSecondCandle) => void
  /** Read a slice for a (symbol, bucketMs). Returns a stable reference per
   *  store update so React selectors don't churn. */
  getBars: (symbol: string, bucketMs: number) => readonly SubSecondCandle[]
  /** Sprint 2 — wholesale replace the prefs mirror. Called by useIPC on mount
   *  with the engine snapshot, and on every setSubsecondPref echo. */
  hydratePrefs: (prefs: Record<string, PreferredBucketMs>) => void
  /** Sprint 2 — convenience getter that defaults non-configured symbols to
   *  null instead of an arbitrary fallback. Lets the chart distinguish
   *  "user has explicitly chosen 250ms" from "user has never picked", which
   *  matters for the auto-snap heuristic (don't snap if no preference). */
  getPref: (symbol: string) => PreferredBucketMs | null
}

function keyFor(symbol: string, bucketMs: number): string {
  return `${symbol}:${bucketMs}`
}

export const useSubsecondStore = create<SubsecondState>((set, get) => ({
  series: new Map(),
  prefs: {},
  hydrate: (symbol, bucketMs, bars) => {
    set((prev) => {
      const next = new Map(prev.series)
      next.set(keyFor(symbol, bucketMs), bars.slice(-MAX_BARS_PER_SERIES))
      return { series: next }
    })
  },
  appendBar: (bar) => {
    const key = keyFor(bar.symbol, bar.bucketMs)
    set((prev) => {
      const existing = prev.series.get(key) ?? []
      const tail = existing[existing.length - 1]
      let combined: SubSecondCandle[]
      if (tail && tail.openMs === bar.openMs) {
        // Same-bucket re-seal (idempotent on the engine side) — replace in place
        // so a corrected bar doesn't create a duplicate row.
        combined = existing.slice(0, -1).concat([bar])
      } else if (tail && bar.openMs < tail.openMs) {
        // Out-of-order push — drop. The engine guarantees monotonically
        // increasing openMs per (symbol, bucketMs) in normal operation; this
        // branch defends a renderer that briefly fell behind during a tab
        // restore.
        return prev
      } else {
        combined = existing.concat([bar])
      }
      if (combined.length > MAX_BARS_PER_SERIES) {
        combined = combined.slice(combined.length - MAX_BARS_PER_SERIES)
      }
      const next = new Map(prev.series)
      next.set(key, combined)
      return { series: next }
    })
  },
  getBars: (symbol, bucketMs) => get().series.get(keyFor(symbol, bucketMs)) ?? [],
  hydratePrefs: (prefs) => {
    // Defensive: drop non-{250,500} values that could slip in from a hand-
    // edited or stale prefs file. The engine sanitizer already runs, but a
    // wider contract on the IPC envelope is one source of drift away — the
    // store guards independently so we never poison the UI dropdown state.
    const clean: Record<string, PreferredBucketMs> = {}
    for (const [s, v] of Object.entries(prefs)) {
      if (v === 250 || v === 500) clean[s] = v
    }
    set({ prefs: clean })
  },
  getPref: (symbol) => get().prefs[symbol] ?? null,
}))
