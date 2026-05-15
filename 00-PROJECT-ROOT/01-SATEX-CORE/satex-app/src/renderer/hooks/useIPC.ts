/**
 * SATEX — IPC Bridge Hook
 * Registers all push channel listeners on mount, tears them down on unmount.
 * Feeds directly into Zustand stores. Called once from App root.
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
import type { NewsItem, ReplayMode } from '@shared/types'

export function useIPC(): void {
  const { updateQuotes, updateCandle, appendNews, resetCandles } = useMarketStore()
  const { setAccount, setOrders, setStatus, setAutonomous } = useAccountStore()
  const setRegime    = useRegimeStore(s => s.setSnapshot)
  const setRiskGates = useRiskGatesStore(s => s.setSnapshot)
  const setMacro     = useMacroStore(s => s.setSnapshot)
  const setLogsTail  = useLogsStore(s => s.setTail)
  const setDepth     = useDepthStore(s => s.setSnapshot)
  const setReplay    = useReplayStore(s => s.setStatus)

  // Track previous replay mode so we can detect transitions and wipe stale candles.
  const prevReplayMode = useRef<ReplayMode | null>(null)

  useEffect(() => {
    if (!window.satex) { console.error('[SATEX] window.satex not found — preload failed'); return }

    // ── Legacy push subscriptions ──────────────────────────────────────────
    const unsubQuotes  = window.satex.onQuotesTick((quotes) => updateQuotes(quotes))
    const unsubCandles = window.satex.onCandlesUpdate(({ symbol, candle, isNew }) => updateCandle(symbol, candle, isNew))
    const unsubNews    = window.satex.onNewsAppend((item) => appendNews(item as NewsItem))
    const unsubAccount = window.satex.onAccountUpdate(setAccount)
    const unsubOrders  = window.satex.onOrdersUpdate(setOrders)
    const unsubStatus  = window.satex.onSystemStatus(setStatus)
    const unsubAutonomous = window.satex.onAutonomousStats?.(setAutonomous) ?? (() => {})

    // Replay status — clear cached candles when entering/leaving replay so the
    // chart reflects the new source's historical bars, not a hybrid timeline.
    const unsubReplay = window.satex.replay?.onStatus((s) => {
      const prev = prevReplayMode.current
      const enteringReplay = prev !== 'playing' && prev !== 'paused' && (s.mode === 'playing' || s.mode === 'paused')
      const leavingReplay  = (prev === 'playing' || prev === 'paused') && s.mode !== 'playing' && s.mode !== 'paused'
      if (enteringReplay || leavingReplay) resetCandles()
      prevReplayMode.current = s.mode
      setReplay(s)
    }) ?? (() => {})

    // ── Phase 10: Black Box push subscriptions ─────────────────────────────
    const unsubRegime    = window.satex.onRegimeUpdate?.(setRegime)        ?? (() => {})
    const unsubRiskGates = window.satex.onRiskGatesUpdate?.(setRiskGates)  ?? (() => {})
    const unsubMacro     = window.satex.onMacroUpdate?.(setMacro)          ?? (() => {})
    const unsubLogs      = window.satex.onLogsTail?.(setLogsTail)          ?? (() => {})
    const unsubDepth     = window.satex.onDepthUpdate?.(setDepth)          ?? (() => {})

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
    }
  }, [])
}
