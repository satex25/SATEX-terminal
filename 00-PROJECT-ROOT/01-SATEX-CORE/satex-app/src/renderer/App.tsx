/**
 * SATEX — Root Application Component (Phase 10 · Black Box)
 *
 * Fixed 5-row Black Box stage at 1920×1080 (BrowserWindow matches):
 *   Row 1 (40px):  TopBar
 *   Row 2 (26px):  TickerTape
 *   Row 3 (1fr):   Main — Watchlist | QuadChart+Macro | Depth/Regime/Exec
 *   Row 4 (172px): Secondary — Portfolio | Catalysts | RiskGates | SystemLogs
 *   Row 5 (30px):  BottomBar
 *
 * Workspace tabs in TopBar drive the `workspace` state below; the center
 * column re-renders to match. Active replay sessions (useReplayStore().active)
 * force the Replay workspace so the scrubber can't be hidden mid-tape. The
 * Phase 9 historical-day flow is unchanged — ChartPanel still owns the date
 * picker.
 */
import { useEffect, useRef, useState } from 'react'
import { useIPC } from './hooks/useIPC'
import { perf } from './lib/perf'
import { useMarketStore } from './stores/marketStore'
import { useAccountStore } from './stores/accountStore'
import { useReplayStore } from './stores/replayStore'
import { TopBar, type ModalKind, type Workspace } from './components/TopBar'
import { TickerTape } from './components/TickerTape'
import { BottomBar } from './components/BottomBar'
import { CommandPalette } from './components/CommandPalette'
import { TweaksPanel } from './components/TweaksPanel'
import { AboutModal } from './components/modals/AboutModal'
import { ShortcutsModal } from './components/modals/ShortcutsModal'
import { SettingsModal } from './components/modals/SettingsModal'
import { LiveModeModal } from './components/modals/LiveModeModal'
import { TacticsModal } from './components/modals/TacticsModal'
import { IndicatorsModal } from './components/modals/IndicatorsModal'
import { ExitReflectionModal } from './components/modals/ExitReflectionModal'
import { UpdateToast } from './components/UpdateToast'
import { SplashIntro } from './components/SplashIntro'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useIndicatorStore } from './stores/indicatorStore'
import { useWorkspaceStore } from './stores/workspaceStore'
import { useThemeStore } from './stores/themeStore'
import { WatchlistPanel } from './panels/WatchlistPanel'
import { QuadChartPanel } from './panels/QuadChartPanel'
import { MacroStripPanel } from './panels/MacroStripPanel'
import { DepthBookPanel } from './panels/DepthBookPanel'
import { RegimeDashboardPanel } from './panels/RegimeDashboardPanel'
import { ExecTicketPanel } from './panels/ExecTicketPanel'
import { PortfolioMiniPanel } from './panels/PortfolioMiniPanel'
import { NewsDeskPanel } from './panels/NewsDeskPanel'
import { RiskGatePanel } from './panels/RiskGatePanel'
import { SystemLogsPanel } from './panels/SystemLogsPanel'
import { HealthPanel } from './panels/HealthPanel'
import { ChartPanel } from './panels/ChartPanel'
import { ReplayPanel } from './panels/ReplayPanel'
import { MarketsOverviewPanel } from './panels/MarketsOverviewPanel'
import { AIInsightsPanel } from './panels/AIInsightsPanel'
import { TimeSalesPanel } from './panels/TimeSalesPanel'
import { JournalPanel } from './panels/JournalPanel'

export default function App() {
  useIPC()

  const [splashDone, setSplashDone] = useState(false)

  const symbol = useMarketStore(s => s.symbol)
  const account = useAccountStore(s => s.account)
  const replayActive = useReplayStore(s => s.active)

  const [cmdOpen,    setCmdOpen]    = useState(false)
  const [tweaksOpen, setTweaksOpen] = useState(false)
  const [modal,      setModal]      = useState<ModalKind | null>(null)
  const [liveMode,   setLiveMode]   = useState(false)
  // S1-5: kill-switch arm-confirm chord state. progress in [0,1] while the
  // user is holding the chord; null when idle or already armed. Disarm stays
  // instant (single press) — operators need the fast path back to trading.
  const [armProgress, setArmProgress] = useState<number | null>(null)
  const armTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const armStartRef  = useRef<number>(0)

  // Workspace state is sourced from the workspace store so the user's last
  // selection (and Quad symbol set) restore on app boot. The store hydrates
  // from Vault/Settings/workspace-state.md in the effect below.
  const workspace    = useWorkspaceStore(s => s.state.workspace)
  const setWorkspace = useWorkspaceStore(s => s.setWorkspace)

  // Active replay sessions force the Replay workspace so the user can't
  // accidentally hide the scrubber while a historical tape is playing.
  const effectiveWs: Workspace = replayActive ? 'Replay' : workspace

  // Pull initial live-mode status; refresh after modal closes so the topbar
  // reflects any interlock changes the user just made.
  useEffect(() => {
    void (async () => {
      try {
        const s = await window.satex?.getLiveMode?.()
        if (s) setLiveMode(s.enabled)
      } catch { /* ignore */ }
    })()
  }, [modal])

  // Sync engine-side depth/regime focus when the user picks a new symbol in
  // the watchlist. Without this, the right rail stays pinned to NVDA.
  useEffect(() => {
    void window.satex?.subscribeDepth?.(symbol)
  }, [symbol])

  // Renderer frame-budget watcher — logs long frames (> 32ms) to the console
  // for performance regression detection. Disable with ?SATEX_PERF_OFF=1.
  useEffect(() => perf.frameWatch(), [])

  // Hydrate chart-indicator toggles from Vault/Settings/indicator-toggles.md
  // and workspace state from Vault/Settings/workspace-state.md once at mount.
  // Both stores fall back to defaults if the file is missing — never blocks
  // chart rendering.
  useEffect(() => {
    void useIndicatorStore.getState().hydrate()
    void useWorkspaceStore.getState().hydrate()
  }, [])

  // v0.6 Phase 1 — apply the active theme by writing `data-theme` on <html>.
  // The themeStore's initial state already reflects localStorage, so this
  // effect runs once at mount with the persisted value, then again on every
  // subsequent setTheme() call from the Settings dialog. The "classic" theme
  // is the default (no attribute = the :root token block in globals.css);
  // the two alternatives ('mono', 'bluyel') add CSS-variable overrides via
  // their `:root[data-theme="…"]` selectors.
  const theme = useThemeStore((s) => s.theme)
  useEffect(() => {
    const html = document.documentElement
    if (theme === 'classic') html.removeAttribute('data-theme')
    else html.setAttribute('data-theme', theme)
  }, [theme])

  // Keyboard shortcuts
  useEffect(() => {
    // Map digit keys 1..5 to workspace tabs in TopBar order.
    const WS_DIGITS: Record<string, Workspace> = {
      '1': 'Trade', '2': 'Focus', '3': 'Markets', '4': 'Replay', '5': 'Quad',
    }

    // S1-5: cancel any in-flight arm-hold timer cleanly. Idempotent.
    const cancelArmHold = (): void => {
      if (armTimerRef.current) {
        clearTimeout(armTimerRef.current)
        armTimerRef.current = null
      }
      setArmProgress(null)
    }

    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && !e.shiftKey && e.key.toLowerCase() === 'k') { e.preventDefault(); setCmdOpen(o => !o); return }
      if (mod && e.key === ',')               { e.preventDefault(); setTweaksOpen(o => !o); return }
      if (mod && e.shiftKey && e.key.toLowerCase() === 'd') { e.preventDefault(); window.satex?.toggleDevTools(); return }
      // S1-5: ⌘⇧K. DISARM is instant (operator wants fast return to trading).
      // ARM requires a 2-second hold of the chord so a finger-slip can't halt
      // the session by accident. Auto-key-repeat is no-op'd by checking the
      // existing timer ref.
      if (mod && e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        if (account.killSwitchArmed) {
          cancelArmHold()
          window.satex?.killSwitch(false)
          return
        }
        if (armTimerRef.current) return   // already counting down
        armStartRef.current = Date.now()
        setArmProgress(0)
        const tick = (): void => {
          const elapsed = Date.now() - armStartRef.current
          if (elapsed >= 2000) {
            armTimerRef.current = null
            setArmProgress(null)
            window.satex?.killSwitch(true)
            return
          }
          setArmProgress(elapsed / 2000)
          armTimerRef.current = setTimeout(tick, 50)
        }
        armTimerRef.current = setTimeout(tick, 50)
        return
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === 'i') { e.preventDefault(); setModal(m => m === 'indicators' ? null : 'indicators'); return }
      // C9: bare `?` opens the shortcuts cheat sheet. Skip when focus is in
      // an input/textarea so the user can type `?` into the order form / journal.
      if (!mod && e.key === '?') {
        const tag = (e.target as HTMLElement | null)?.tagName
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
          e.preventDefault()
          setModal(m => m === 'shortcuts' ? null : 'shortcuts')
          return
        }
      }
      if (mod && e.key === 'Enter')           { e.preventDefault(); window.satex?.toggleFullscreen(); return }
      // Workspace digits ⌘1..⌘5 — won't fire if focus is in an input, since
      // typing a number into the qty field shouldn't switch workspaces.
      if (mod && !e.shiftKey && WS_DIGITS[e.key]) {
        const tag = (e.target as HTMLElement | null)?.tagName
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
          e.preventDefault()
          setWorkspace(WS_DIGITS[e.key]!)
        }
      }
    }

    // S1-5: releasing any of the chord modifiers cancels the in-flight
    // arm-hold. Covers users who let go of Shift/Meta/Ctrl while still holding
    // K, as well as the straight-up release of K.
    const onKeyUp = (e: KeyboardEvent): void => {
      if (!armTimerRef.current) return
      const k = e.key.toLowerCase()
      if (k === 'k' || k === 'shift' || k === 'meta' || k === 'control') {
        cancelArmHold()
      }
    }

    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup',   onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup',   onKeyUp)
      cancelArmHold()
    }
  }, [account.killSwitchArmed, setWorkspace])

  return (
    <div className="bb-app">
      {!splashDone && <SplashIntro onComplete={() => setSplashDone(true)} />}
      <TopBar
        onCmd={() => setCmdOpen(true)}
        onOpenModal={setModal}
        liveModeEnabled={liveMode}
        onTweaks={() => setTweaksOpen(o => !o)}
        workspace={effectiveWs}
        onWorkspace={setWorkspace}
      />

      <TickerTape />

      <div className="bb-main-row">
        {/* Left rail: Watchlist */}
        <div className="bb-col-left">
          <WatchlistPanel />
        </div>
        <span className="bb-divider-v" />

        {/* Center column — content swaps with the active workspace tab. The
            Replay workspace overrides automatically when a tape is playing
            (replayActive in useReplayStore). */}
        <div className="bb-col-center">
          {/* A keyed render-error boundary isolates the active workspace: a throw in
              any center panel shows a recoverable fallback (with the real error) instead
              of unmounting the whole terminal. Keyed by workspace so switching tabs
              always remounts a clean attempt. Mirrors the per-pane guard in QuadChartPanel. */}
          <ErrorBoundary
            key={effectiveWs}
            fallback={(err) => (
              <div
                role="alert"
                style={{ height: '100%', overflow: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-start' }}
              >
                <div style={{ color: 'var(--bb-neg, #ff4655)', fontWeight: 600 }}>⚠ {effectiveWs} workspace failed to render</div>
                <div style={{ color: 'var(--bb-text-dim, rgba(232,230,224,0.7))', fontFamily: 'var(--font-mono, ui-monospace, monospace)', whiteSpace: 'pre-wrap', maxWidth: '680px' }}>{err.message}</div>
                <div style={{ color: 'var(--bb-text-dim, rgba(232,230,224,0.45))' }}>The rest of the terminal is unaffected — press ⌘1–⌘5 or use the tabs above to switch workspaces.</div>
              </div>
            )}
          >
          {effectiveWs === 'Replay' && (
            <div className="bb-replay-stack">
              <ReplayPanel />
              <span className="bb-divider-h" />
              <ChartPanel key={symbol} />
            </div>
          )}
          {effectiveWs === 'Quad' && (
            <>
              <div className="bb-center-chart"><QuadChartPanel /></div>
              <span className="bb-divider-h" />
              <MacroStripPanel />
            </>
          )}
          {effectiveWs === 'Focus' && (
            <>
              <div className="bb-center-chart"><ChartPanel key={symbol} /></div>
              <span className="bb-divider-h" />
              <MacroStripPanel />
            </>
          )}
          {effectiveWs === 'Markets' && (
            <>
              <div className="bb-center-chart" style={{ overflow: 'auto' }}>
                <MarketsOverviewPanel />
              </div>
              <span className="bb-divider-h" />
              <MacroStripPanel />
            </>
          )}
          {effectiveWs === 'Trade' && (
            <>
              <div className="bb-center-chart bb-trade-stack">
                <div className="bb-trade-chart"><ChartPanel key={symbol} /></div>
                <span className="bb-divider-h" />
                <div className="bb-trade-tape"><TimeSalesPanel /></div>
                <span className="bb-divider-h" />
                <div className="bb-trade-ai"><AIInsightsPanel /></div>
                <span className="bb-divider-h" />
                <div className="bb-trade-journal"><JournalPanel /></div>
              </div>
              <span className="bb-divider-h" />
              <MacroStripPanel />
            </>
          )}
          </ErrorBoundary>
        </div>
        <span className="bb-divider-v" />

        {/* Right rail: Depth / Regime / Exec */}
        <div className="bb-col-right">
          <div className="bb-right-depth"><DepthBookPanel /></div>
          <span className="bb-divider-h" />
          <div className="bb-right-regime"><RegimeDashboardPanel /></div>
          <span className="bb-divider-h" />
          <div className="bb-right-exec"><ExecTicketPanel /></div>
        </div>
      </div>

      {/* Secondary: Portfolio | Catalysts | Risk | Logs */}
      <div className="bb-secondary-row">
        <div className="bb-sec-portfolio"><PortfolioMiniPanel /></div>
        <span className="bb-divider-v" />
        <div className="bb-sec-catalysts"><NewsDeskPanel /></div>
        <span className="bb-divider-v" />
        <div className="bb-sec-risk"><RiskGatePanel /></div>
        <span className="bb-divider-v" />
        <div className="bb-sec-logs"><SystemLogsPanel /></div>
        <span className="bb-divider-v" />
        <div className="bb-sec-health"><HealthPanel /></div>
      </div>

      <BottomBar />

      <CommandPalette
        open={cmdOpen}
        onClose={() => setCmdOpen(false)}
        onSetWorkspace={setWorkspace}
      />

      <TweaksPanel open={tweaksOpen} onClose={() => setTweaksOpen(false)} />

      <AboutModal      open={modal === 'about'}      onClose={() => setModal(null)} />
      <ShortcutsModal  open={modal === 'shortcuts'}  onClose={() => setModal(null)} />
      <SettingsModal   open={modal === 'settings'}   onClose={() => setModal(null)} />
      <LiveModeModal   open={modal === 'live'}       onClose={() => setModal(null)} />
      <TacticsModal    open={modal === 'tactics'}    onClose={() => setModal(null)} />
      <IndicatorsModal open={modal === 'indicators'} onClose={() => setModal(null)} />
      <ExitReflectionModal />

      {/* S1-9: auto-update notification. Renders only after AutoUpdateService
          pushes an UPDATE_AVAILABLE event. Self-contained — no props. */}
      <UpdateToast />

      {/* S1-5: arm-hold progress overlay. Renders only while the user is
          holding the ⌘⇧K chord; auto-clears on release or after the 2s
          completes (whichever fires first). */}
      {armProgress !== null && (
        <div className="kill-arm-overlay" role="alert">
          <div className="kill-arm-card">
            <div className="kill-arm-title">HOLD ⌘⇧K TO ARM KILL SWITCH</div>
            <div className="kill-arm-bar">
              <div className="kill-arm-bar-fill" style={{ width: `${Math.round(armProgress * 100)}%` }} />
            </div>
            <div className="kill-arm-hint">release to cancel · cancels all open orders + halts trading</div>
          </div>
        </div>
      )}
    </div>
  )
}
