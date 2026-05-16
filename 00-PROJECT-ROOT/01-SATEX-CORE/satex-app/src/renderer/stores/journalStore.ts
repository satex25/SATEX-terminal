/**
 * SATEX — Trading journal store (P0-2 complete · 2026-05-15).
 *
 * Holds the closed-trade ring received from main via the TRADE_CLOSED push
 * channel. Hydrates once on mount from CLOSED_TRADES_GET so a renderer
 * remount (HMR / devtools reload / app re-open mid-session) doesn't show
 * an empty panel.
 *
 * Surfaces:
 *   - `trades` — most-recent-last array, capped to MAX (matches engine cap)
 *   - `pendingReflection` — id of the most-recent close that hasn't been
 *     dismissed/reflected on; drives the auto-open exit-reflection modal
 *   - aggregate selectors via `useJournalAggregates()` below
 *
 * Reflection lifecycle: on a new close, `pendingReflection` is set to the
 * trade id. The modal reads this, lets the user fill or skip; on either
 * outcome, `clearPendingReflection()` zeroes it so it doesn't re-prompt.
 */
import { create } from 'zustand'
import type { ClosedTrade, JournalTag } from '@shared/types'

const MAX_TRADES = 500

interface JournalStoreState {
  trades: ClosedTrade[]
  hydrated: boolean
  /** Id of the trade currently awaiting an exit-reflection prompt response.
   *  Null when no prompt is pending. */
  pendingReflection: string | null
  hydrate:     () => Promise<void>
  /** Apply a closed-trade push from main. Replaces an existing entry with
   *  the same id (lesson updates flow through this path too). */
  upsertTrade: (t: ClosedTrade) => void
  /** Persist a lesson + emotion tag to the trade and clear pendingReflection. */
  submitReflection: (id: string, lesson: string, emotionTag?: JournalTag) => Promise<void>
  /** Dismiss the reflection prompt without writing anything. */
  clearPendingReflection: () => void
}

export const useJournalStore = create<JournalStoreState>((set, get) => ({
  trades: [],
  hydrated: false,
  pendingReflection: null,

  hydrate: async () => {
    try {
      const seed = await window.satex?.journal?.getClosed()
      if (seed) set({ trades: seed.slice(-MAX_TRADES), hydrated: true })
      else      set({ hydrated: true })
    } catch (err) {
      console.warn('[journal] hydrate failed', err)
      set({ hydrated: true })
    }
  },

  upsertTrade: (t) => {
    const cur = get().trades
    const idx = cur.findIndex(x => x.id === t.id)
    let next: ClosedTrade[]
    let isNewClose = false
    if (idx >= 0) {
      next = [...cur]
      next[idx] = t
    } else {
      next = [...cur, t]
      if (next.length > MAX_TRADES) next.splice(0, next.length - MAX_TRADES)
      isNewClose = true
    }
    set({
      trades: next,
      // Only NEW closes trigger the prompt — a reflection update upsert
      // (same id, different fields) doesn't re-open it.
      ...(isNewClose ? { pendingReflection: t.id } : {}),
    })
  },

  submitReflection: async (id, lesson, emotionTag) => {
    try {
      await window.satex?.journal?.reflect({ id, lesson, emotionTag })
    } catch (err) {
      console.warn('[journal] reflect failed', err)
    } finally {
      // Clear regardless — the user dismissed the prompt either way.
      if (get().pendingReflection === id) set({ pendingReflection: null })
    }
  },

  clearPendingReflection: () => set({ pendingReflection: null }),
}))

/** Aggregates derived from the trade ring. Pure read; safe to call from any
 *  component without triggering store mutation. */
export function computeJournalAggregates(trades: ClosedTrade[]): {
  count: number
  wins: number
  losses: number
  winRate: number
  totalPnl: number
  highConvPnl: number   // conviction >= 7
  lowConvPnl: number    // conviction <= 4
  bestTag: { tag: string; pnl: number } | null
  worstTag: { tag: string; pnl: number } | null
  /** S1-6 — mean entry slippage across trades that had a captured quote.
   *  Null when no trade in the ring has a slippage value (e.g., session is
   *  pure-simulator and we haven't logged any non-zero figures). */
  avgEntrySlipBps: number | null
  /** C16 / F4 — per-regime P&L breakdown. Trades without `regimeAtEntry`
   *  are bucketed under 'UNKNOWN' rather than dropped so the user can see
   *  if regime capture is missing. Order is insertion-deterministic. */
  byRegime: Array<{ regime: string; count: number; totalPnl: number; winRate: number }>
} {
  const out = {
    count: trades.length,
    wins:    0,
    losses:  0,
    winRate: 0,
    totalPnl: 0,
    highConvPnl: 0,
    lowConvPnl: 0,
    bestTag:  null as { tag: string; pnl: number } | null,
    worstTag: null as { tag: string; pnl: number } | null,
    avgEntrySlipBps: null as number | null,
    byRegime: [] as Array<{ regime: string; count: number; totalPnl: number; winRate: number }>,
  }
  const tagPnl = new Map<string, number>()
  const regimeAgg = new Map<string, { count: number; totalPnl: number; wins: number; losses: number }>()
  let slipSum = 0
  let slipCount = 0
  for (const t of trades) {
    out.totalPnl += t.pnl
    if (t.pnl > 0) out.wins++
    else if (t.pnl < 0) out.losses++
    if (t.conviction != null) {
      if (t.conviction >= 7) out.highConvPnl += t.pnl
      if (t.conviction <= 4) out.lowConvPnl  += t.pnl
    }
    for (const tag of t.tags) tagPnl.set(tag, (tagPnl.get(tag) ?? 0) + t.pnl)
    if (t.entrySlippageBps != null && Number.isFinite(t.entrySlippageBps)) {
      slipSum += t.entrySlippageBps
      slipCount++
    }
    // C16: bucket by regime; null/missing values land in 'UNKNOWN'.
    const reg = t.regimeAtEntry ?? 'UNKNOWN'
    const cur = regimeAgg.get(reg) ?? { count: 0, totalPnl: 0, wins: 0, losses: 0 }
    cur.count++
    cur.totalPnl += t.pnl
    if (t.pnl > 0) cur.wins++
    else if (t.pnl < 0) cur.losses++
    regimeAgg.set(reg, cur)
  }
  out.winRate = out.count > 0 ? out.wins / (out.wins + out.losses || 1) : 0
  out.avgEntrySlipBps = slipCount > 0 ? slipSum / slipCount : null
  // C16: flatten regime aggregate into a sorted array (best P&L first) so the
  // panel can render deterministically without re-sorting on every render.
  out.byRegime = Array.from(regimeAgg.entries())
    .map(([regime, v]) => ({
      regime,
      count: v.count,
      totalPnl: v.totalPnl,
      winRate: (v.wins + v.losses) > 0 ? v.wins / (v.wins + v.losses) : 0,
    }))
    .sort((a, b) => b.totalPnl - a.totalPnl)
  for (const [tag, pnl] of tagPnl) {
    if (!out.bestTag  || pnl > out.bestTag.pnl)  out.bestTag  = { tag, pnl }
    if (!out.worstTag || pnl < out.worstTag.pnl) out.worstTag = { tag, pnl }
  }
  // Suppress identical best/worst when only one tag exists.
  if (out.bestTag && out.worstTag && out.bestTag.tag === out.worstTag.tag) {
    out.worstTag = null
  }
  return out
}
