/**
 * SATEX — IPC Bridge Hook
 * Registers all push channel listeners on mount, tears them down on unmount.
 * Feeds directly into Zustand stores. Called once from App root.
 *
 * Deps strategy (2026-05-19): the effect intentionally runs ONCE per mount.
 * All store setters are pulled via `useXStore.getState()` rather than via
 * selector hooks, so they're stable function references that don't need to
 * appear in the dep array. Re-subscribing IPC channels on every render would
 * lose ticks during the gap between unsubscribe and re-subscribe — a hard
 * no-go for a 20Hz quote feed. With getState(), the effect's deps are
 * honestly empty and the lint rule is satisfied without disable comments.
 */
import { useEffect, useRef } from 'react'
import { useMarketStore } from '../stores/marketStore'
import { useAccountStore } from '../stores/accountStore'
import { useRegimeStore } from '../stores/regimeStore'
import { useRiskGatesStore } from '../stores/riskGatesStore'
import { useMacroStore } from '../stores/macroStore'
import { useLogsStore } from '../stores/logsStore'
import { useDepthStore } from '../stores/depthStore'
import { useReplayStore } from '../stores/replayStore'
import { useJournalStore } from '../stores/journalStore'
import { useFootprintStore } from '../stores/footprintStore'
import { useFeedStore } from '../stores/feedStore'
import { useUpdateStore } from '../stores/update-store'
import { useSubsecondStore } from '../stores/subsecondStore'
import { useHealthStore } from '../stores/healthStore'
import type { NewsItem, ReplayMode, ClosedTrade, Trade, FeedStatus, UpdateAvailable, SubSecondCandle } from '@shared/types'
import type { HealthReport } from '@shared/health/types'

export function useIPC(): void {
  // Track previous replay mode so we can detect transitions and wipe stale candles.
  const prevReplayMode = useRef<ReplayMode | null>(null)

  useEffect(() => {
    if (!window.satex) { console.error('[SATEX] window.satex not found — preload failed'); return }

    // Pull every setter via getState() — stable references across renders, so
    // the dep array stays honestly empty.
    const { updateQuotes, updateCandle, bulkReplaceCandles, appendNews, resetCandles } = useMarketStore.getState()
    const { setAccount, setOrders, setStatus, setAutonomous } = useAccountStore.getState()
    const setRegime    = useRegimeStore.getState().setSnapshot
    const setRiskGates = useRiskGatesStore.getState().setSnapshot
    const setMacro     = useMacroStore.getState().setSnapshot
    const setLogsTail  = useLogsStore.getState().setTail
    const setDepth     = useDepthStore.getState().setSnapshot
    const setReplay    = useReplayStore.getState().setStatus

    // ── Legacy push subscriptions ──────────────────────────────────────────
    const unsubQuotes  = window.satex.onQuotesTick((quotes) => updateQuotes(quotes))
    const unsubCandles = window.satex.onCandlesUpdate(({ symbol, candle, isNew }) => updateCandle(symbol, candle, isNew))
    // Bulk-replace channel — one event per symbol with the full warmed-up
    // history. Currently fired only by ReplaySource.warmup; safe to leave
    // subscribed always (the live tick path doesn't emit on this channel).
    const unsubCandlesBulk = window.satex.onCandlesBulkReplace?.(({ symbol, candles }) => {
      bulkReplaceCandles(symbol, candles)
    }) ?? (() => {})
    const unsubNews    = window.satex.onNewsAppend((item) => appendNews(item as NewsItem))
    const unsubAccount = window.satex.onAccountUpdate(setAccount)
    const unsubOrders  = window.satex.onOrdersUpdate(setOrders)
    const unsubStatus  = window.satex.onSystemStatus(setStatus)
    const unsubAutonomous = window.satex.onAutonomousStats?.(setAutonomous) ?? (() => {})

    // Replay status — clear cached candles when entering/leaving replay so the
    // chart reflects the new source's historical bars, not a hybrid timeline.
    // P0-1: also reset the footprint aggregator on the same boundary — the
    // replay tape has no trade-side info so retaining live deltas across a
    // replay swap would mix live and historical contexts.
    const resetFootprint = useFootprintStore.getState().reset
    const unsubReplay = window.satex.replay?.onStatus((s) => {
      const prev = prevReplayMode.current
      const enteringReplay = prev !== 'playing' && prev !== 'paused' && (s.mode === 'playing' || s.mode === 'paused')
      const leavingReplay  = (prev === 'playing' || prev === 'paused') && s.mode !== 'playing' && s.mode !== 'paused'
      if (enteringReplay || leavingReplay) { resetCandles(); resetFootprint() }
      prevReplayMode.current = s.mode
      setReplay(s)
    }) ?? (() => {})

    // ── Phase 10: Black Box push subscriptions ─────────────────────────────
    const unsubRegime    = window.satex.onRegimeUpdate?.(setRegime)        ?? (() => {})
    const unsubRiskGates = window.satex.onRiskGatesUpdate?.(setRiskGates)  ?? (() => {})
    const unsubMacro     = window.satex.onMacroUpdate?.(setMacro)          ?? (() => {})
    const unsubLogs      = window.satex.onLogsTail?.(setLogsTail)          ?? (() => {})
    const unsubDepth     = window.satex.onDepthUpdate?.(setDepth)          ?? (() => {})

    // ── P0-2: closed-trade stream feeds the JournalPanel ───────────────────
    const upsertTrade = useJournalStore.getState().upsertTrade
    const unsubJournal = window.satex.journal?.onTradeClosed?.((t: ClosedTrade) => upsertTrade(t)) ?? (() => {})
    void useJournalStore.getState().hydrate()

    // ── P0-1: trade stream feeds the FootprintAggregator for DeltaStrip ────
    const ingestTrades = useFootprintStore.getState().ingest
    const unsubTrades  = window.satex.onTradesTick?.((batch: Trade[]) => ingestTrades(batch)) ?? (() => {})

    // ── B3: per-asset-class feed status → WatchlistPanel SIM badge ─────────
    const setFeedStatus = useFeedStore.getState().setStatus
    const unsubFeed = window.satex.onFeedStatusUpdate?.((s: FeedStatus) => setFeedStatus(s)) ?? (() => {})

    // ── P-037: Self-Diagnostic Core health report → healthStore (HealthPanel) ──
    const setHealth = useHealthStore.getState().setReport
    const unsubHealth = window.satex.onHealthReport?.((r: HealthReport) => setHealth(r)) ?? (() => {})

    // ── S1-9: auto-update push → UpdateToast banner ────────────────────────
    const setUpdateAvailable = useUpdateStore.getState().setAvailable
    const unsubUpdate = window.satex.onUpdateAvailable?.((u: UpdateAvailable) => setUpdateAvailable(u)) ?? (() => {})

    // ── A1 (v0.4.4): sub-second crypto candle seals → subsecondStore ───────
    const appendSubsecond = useSubsecondStore.getState().appendBar
    const unsubSubsecond = window.satex.onSubsecondCandlesUpdate?.((c: SubSecondCandle) => appendSubsecond(c)) ?? (() => {})

    // A1 Sprint 2 — boot hydration of per-symbol bucket prefs from disk.
    // No push channel — prefs change only when the user clicks in Settings,
    // and that path uses the setSubsecondPref echo to update the store. So
    // a single mount-time fetch is enough. getState() pattern matches the
    // rest of the file: no re-subscribe race, honestly-empty deps.
    void window.satex.getSubsecondPrefs?.()
      .then((p) => { if (p) useSubsecondStore.getState().hydratePrefs(p) })
      .catch(() => { /* engine offline / not yet initialized — UI tolerates */ })

    // ── Initial seed fetches (post-subscribe so we don't miss a push) ──────
    void window.satex.subscribe([])
    void window.satex.getAutonomousStatus?.().then(s => { if (s) setAutonomous(s) }).catch(() => {})
    void window.satex.getRegime?.().then(s => { if (s) setRegime(s) }).catch(() => {})
    void window.satex.getRiskGates?.().then(s => { if (s) setRiskGates(s) }).catch(() => {})
    void window.satex.getMacro?.().then(s => { if (s) setMacro(s) }).catch(() => {})
    void window.satex.getLogsTail?.().then(s => { if (s) setLogsTail(s) }).catch(() => {})
    void window.satex.getDepth?.().then(s => { if (s) setDepth(s) }).catch(() => {})
    void window.satex.replay?.getStatus().then(s => { if (s) setReplay(s) }).catch(() => {})

    return () => {
      unsubQuotes()
      unsubCandles()
      unsubCandlesBulk()
      unsubNews()
      unsubAccount()
      unsubOrders()
      unsubStatus()
      unsubReplay()
      unsubAutonomous()
      unsubRegime()
      unsubRiskGates()
      unsubMacro()
      unsubLogs()
      unsubDepth()
      unsubJournal()
      unsubTrades()
      unsubFeed()
      unsubHealth()
      unsubUpdate()
      unsubSubsecond()
    }
  }, [])
}
