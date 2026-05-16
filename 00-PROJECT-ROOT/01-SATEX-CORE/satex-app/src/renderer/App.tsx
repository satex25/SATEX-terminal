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
import { useEffect, useState } from 'react'
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
import { useIndicatorStore } from './stores/indicatorStore'
import { useWorkspaceStore } from './stores/workspaceStore'
import { WatchlistPanel } from './panels/WatchlistPanel'
import { QuadChartPanel } from './panels/QuadChartPanel'
import { MacroStripPanel } from './panels/MacroStripPanel'
import { DepthBookPanel } from './panels/DepthBookPanel'
import { RegimeDashboardPanel } from './panels/RegimeDashboardPanel'
import { ExecTicketPanel } from './panels/ExecTicketPanel'
import { PortfolioMiniPanel } from './panels/PortfolioMiniPanel'
import { CatalystsPanel } from './panels/CatalystsPanel'
import { RiskGatePanel } from './panels/RiskGatePanel'
import { SystemLogsPanel } from './panels/SystemLogsPanel'
import { ChartPanel } from './panels/ChartPanel'
import { ReplayPanel } from './panels/ReplayPanel'
import { MarketsOverviewPanel } from './panels/MarketsOverviewPanel'
import { AIInsightsPanel } from './panels/AIInsightsPanel'
import { TimeSalesPanel } from './panels/TimeSalesPanel'
import { JournalPanel } from './panels/JournalPanel'

export default function App() {
  useIPC()

  const symbol = useMarketStore(s => s.symbol)
  const account = useAccountStore(s => s.account)
  const replayActive = useReplayStore(s => s.active)

  const [cmdOpen,    setCmdOpen]    = useState(false)
  const [tweaksOpen, setTweaksOpen] = useState(false)
  const [modal,      setModal]      = useState<ModalKind | null>(null)
  const [liveMode,   setLiveMode]   = useState(false)

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

  // Keyboard shortcuts
  useEffect(() => {
    // Map digit keys 1..5 to workspace tabs in TopBar order.
    const WS_DIGITS: Record<string, Workspace> = {
      '1': 'Trade', '2': 'Focus', '3': 'Markets', '4': 'Replay', '5': 'Quad',
    }
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); setCmdOpen(o => !o); return }
      if (mod && e.key === ',')               { e.preventDefault(); setTweaksOpen(o => !o); return }
      if (mod && e.shiftKey && e.key.toLowerCase() === 'd') { e.preventDefault(); window.satex?.toggleDevTools(); return }
      if (mod && e.shiftKey && e.key.toLowerCase() === 'k') { e.preventDefault(); window.satex?.killSwitch(!account.killSwitchArmed); return }
      if (mod && e.shiftKey && e.key.toLowerCase() === 'i') { e.preventDefault(); setModal(m => m === 'indicators' ? null : 'indicators'); return }
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
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [account.killSwitchArmed])

  return (
    <div className="bb-app">
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
        <div className="bb-sec-catalysts"><CatalystsPanel /></div>
        <span className="bb-divider-v" />
        <div className="bb-sec-risk"><RiskGatePanel /></div>
        <span className="bb-divider-v" />
        <div className="bb-sec-logs"><SystemLogsPanel /></div>
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
    </div>
  )
}
