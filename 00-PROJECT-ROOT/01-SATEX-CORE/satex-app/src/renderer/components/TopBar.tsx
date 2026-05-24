/**
 * SATEX — Top Bar (Phase 10 · Black Box)
 *
 * 40px header row. Replaces MenuBar. Behaviors ported VERBATIM from
 * MenuBar.tsx to preserve every user flow:
 *
 *   - File/View/Markets/Workspace/Help dropdowns
 *   - PAPER/LIVE endpoint toggle with confirm + creds-check flow
 *   - Autonomous trader status pill + safety-gated toggle
 *   - Observer/Learner/Vault INTEL pip
 *   - Tactics 策 pip → opens TacticsModal
 *   - Kill switch toggle
 *   - Command palette opener (Cmd+K)
 *
 * New for Black Box:
 *   - Dragonfly pixel logo
 *   - Workspace eyebrow tabs (Trade/Focus/Markets/Replay/Quad)
 *   - SessionPill (TOKYO/LONDON/NY)
 *   - Inline command stub
 *   - Dual UTC + CST clocks (right-aligned)
 *
 * The accent dropdown is GONE — cyan is the brand now.
 */
import { useEffect, useState } from 'react'
import { useAccountStore } from '../stores/accountStore'
import { Dropdown, type DropdownItem } from './Dropdown'
import { Dragonfly } from './Dragonfly'
import { SessionPill } from './SessionPill'
import { StatPill } from './StatPill'
import { FeedSwitch } from './FeedSwitch'
import { useClocks } from '../hooks/useClocks'
import type {
  TacticsStatus, ObserverStats, LearnerStats, VaultStats,
  AlpacaModeStatus,
} from '@shared/types'
// Phase 12: Workspace + WORKSPACE_TABS moved to shared/types so the main
// process can sanitize persisted state. Re-export here for back-compat with
// existing renderer imports (App.tsx, CommandPalette.tsx).
import { WORKSPACE_TABS, type Workspace } from '@shared/types'
export { WORKSPACE_TABS }
export type { Workspace }

export type ModalKind = 'about' | 'shortcuts' | 'settings' | 'live' | 'tactics' | 'indicators'

const WORKSPACE_TITLES: Record<Workspace, string> = {
  Trade:   'Single chart + AI insights — trading-focused layout',
  Focus:   'Single chart, distraction-free',
  Markets: 'Universe scan — sortable Markets table',
  Replay:  'Historical replay — pick a session and scrub',
  Quad:    '4-pane synced chart grid',
}

interface Props {
  onCmd:           () => void
  onOpenModal:     (kind: ModalKind) => void
  liveModeEnabled: boolean
  onTweaks?:       () => void
  workspace:       Workspace
  onWorkspace:     (ws: Workspace) => void
}

export function TopBar({ onCmd, onOpenModal, liveModeEnabled, onTweaks, workspace, onWorkspace }: Props) {
  const status = useAccountStore(s => s.status)
  const account = useAccountStore(s => s.account)
  const autonomous = useAccountStore(s => s.autonomous)
  const { utc, cst, session } = useClocks()

  const [tactics, setTactics] = useState<TacticsStatus | null>(null)
  const [observer, setObserver] = useState<ObserverStats | null>(null)
  const [learner,  setLearner]  = useState<LearnerStats | null>(null)
  const [vault,    setVault]    = useState<VaultStats | null>(null)
  const [alpacaMode, setAlpacaMode] = useState<AlpacaModeStatus | null>(null)
  const [flipBusy, setFlipBusy] = useState(false)
  const [autoBusy, setAutoBusy] = useState(false)

  useEffect(() => {
    if (!window.satex?.getTacticsStatus) return
    let cancelled = false
    const pull = () => window.satex.getTacticsStatus().then(s => { if (!cancelled) setTactics(s) }).catch(() => {})
    pull()
    const id = setInterval(pull, 5000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  useEffect(() => {
    if (!window.satex?.getAlpacaMode) return
    let cancelled = false
    const pull = async () => {
      try {
        const s = await window.satex.getAlpacaMode()
        if (!cancelled && s) setAlpacaMode(s)
      } catch { /* ignore */ }
    }
    void pull()
    const id = setInterval(pull, 5000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  useEffect(() => {
    const unsubs: Array<() => void> = []
    if (window.satex?.onObserverStats) unsubs.push(window.satex.onObserverStats(setObserver))
    if (window.satex?.onLearnerStats)  unsubs.push(window.satex.onLearnerStats(setLearner))
    if (window.satex?.onVaultStats)    unsubs.push(window.satex.onVaultStats(setVault))
    void window.satex?.getObserverStats?.().then(setObserver).catch(() => {})
    void window.satex?.getLearnerStats?.().then(setLearner).catch(() => {})
    void window.satex?.getVaultStats?.().then(setVault).catch(() => {})
    return () => { for (const u of unsubs) u() }
  }, [])

  // Behavior preserved verbatim from MenuBar.tsx:87-123.
  async function toggleAutonomous() {
    if (!window.satex || autoBusy) return
    const wantOn = !(autonomous?.enabled)
    setAutoBusy(true)
    try {
      if (wantOn) {
        if (alpacaMode?.mode === 'live' || liveModeEnabled) {
          window.alert(
            'Autonomous trading is paper-only by policy.\n\n' +
            'Switch to PAPER mode (top-right toggle) and disarm the live interlock\n' +
            '(Markets → ● LIVE mode) before enabling.'
          )
          return
        }
        const ok = window.confirm(
          'Enable autonomous paper trading?\n\n' +
          '• Cycles every 30 seconds.\n' +
          '• Submits paper-only longs when Brain confidence is high.\n' +
          '• Bracket stops + take-profit set from ATR.\n' +
          '• Will keep running while you sleep until you turn it off.\n\n' +
          'Enable now?'
        )
        if (!ok) return
        const res = await window.satex.enableAutonomous()
        if (!res.ok) window.alert(`Could not enable: ${res.reason ?? 'unknown'}`)
      } else {
        await window.satex.disableAutonomous()
      }
    } catch (e) {
      window.alert(`Autonomous toggle error: ${String(e)}`)
    } finally {
      setAutoBusy(false)
    }
  }

  // Behavior preserved verbatim from MenuBar.tsx:125-157.
  async function flipMode(target: 'paper' | 'live') {
    if (!window.satex?.setAlpacaMode || flipBusy) return
    if (!alpacaMode || target === alpacaMode.mode) return
    if (target === 'live') {
      if (!alpacaMode.liveConfigured) {
        window.alert(
          'No live credentials configured.\n\n' +
          'Open Settings → "Alpaca · Live Trading" and paste your live API keys before switching modes.'
        )
        onOpenModal('settings')
        return
      }
      const ok = window.confirm(
        'Switch endpoint to LIVE?\n\n' +
        '✓ Live account data will load (positions, balances, real prices).\n' +
        '✗ Order submission remains blocked at the AlpacaClient until you arm\n' +
        '   the typed-phrase interlock (Markets → ● LIVE mode).\n\n' +
        'Switch endpoint now?'
      )
      if (!ok) return
    }
    setFlipBusy(true)
    try {
      const res = await window.satex.setAlpacaMode({ mode: target })
      if (!res.ok) window.alert(`Failed to switch mode: ${res.reason ?? 'unknown'}`)
      const s = await window.satex.getAlpacaMode()
      if (s) setAlpacaMode(s)
    } catch (e) {
      window.alert(`Error switching mode: ${String(e)}`)
    } finally {
      setFlipBusy(false)
    }
  }

  const modeDisplay = alpacaMode?.mode ?? (liveModeEnabled ? 'live' : 'paper')

  const fileItems: DropdownItem[] = [
    { label: 'Save workspace layout',  onClick: () => window.satex?.saveLayout?.() },
    { label: 'Reload workspace',       onClick: () => location.reload() },
    { divider: true },
    { label: 'Export orders (CSV)',    onClick: () => window.satex?.exportOrdersCsv?.() },
    {
      label: vault?.enabled ? 'Write vault checkpoint…' : 'Vault checkpoint (vault unavailable)',
      onClick: async () => {
        if (!window.satex?.vaultCheckpoint) return
        const reason = window.prompt('Checkpoint reason?', 'Manual checkpoint')
        if (!reason) return
        await window.satex.vaultCheckpoint({ reason, scope: 'manual' })
      },
    },
    { divider: true },
    { label: 'Quit',                   onClick: () => window.close() },
  ]

  const viewItems: DropdownItem[] = [
    { label: 'Command palette…', kbd: '⌘K',  onClick: onCmd },
    { divider: true },
    { label: 'Chart indicators…', kbd: '⌘⇧I', onClick: () => onOpenModal('indicators') },
    { label: 'Open Tweaks…',     onClick: onTweaks ?? (() => {}) },
    { label: 'Toggle fullscreen',kbd: '⌘↵',  onClick: () => window.satex?.toggleFullscreen() },
    { label: 'Toggle DevTools',  kbd: '⌘⇧D', onClick: () => window.satex?.toggleDevTools() },
    { divider: true },
    { label: 'Settings…',        onClick: () => onOpenModal('settings') },
  ]

  const marketItems: DropdownItem[] = [
    { header: 'Mode' },
    {
      label: liveModeEnabled ? '● LIVE mode (real capital)' : '○ Paper mode',
      onClick: () => onOpenModal('live'),
    },
    { divider: true },
    { header: 'Autonomous' },
    {
      label: autonomous?.enabled
        ? `● AUTONOMOUS ON  · ${autonomous.approvedCount} sent / ${autonomous.signalsFired} signals`
        : '○ Autonomous trader (paper-only)',
      onClick: () => void toggleAutonomous(),
    },
    { divider: true },
    { header: 'Risk' },
    {
      label: account.killSwitchArmed ? 'Disarm kill switch' : 'Arm kill switch',
      kbd: '⌘⇧K',
      onClick: () => window.satex?.killSwitch(!account.killSwitchArmed),
    },
    { divider: true },
    { header: 'Connection' },
    { label: 'Reconnect Alpaca stream', onClick: () => window.satex?.reconnectAlpaca?.() },
  ]

  const helpItems: DropdownItem[] = [
    { label: 'Keyboard shortcuts…',   onClick: () => onOpenModal('shortcuts') },
    { divider: true },
    { label: 'About SATEX',           onClick: () => onOpenModal('about') },
  ]

  return (
    <div className="bb-topbar">
      {/* Brand */}
      <div className="bb-brand">
        <Dragonfly size={28} title="SATEX" />
        <div className="bb-brand-text">
          <span className="bb-brand-name">SATEX</span>
          <span className="bb-brand-version">v0.5.0 · 取引端末</span>
        </div>
      </div>

      <span className="bb-vrule" />

      {/* File menu */}
      <div className="bb-menubar">
        <Dropdown label="File"     items={fileItems} />
        <Dropdown label="View"     items={viewItems} />
        <Dropdown label="Markets"  items={marketItems} />
        <Dropdown label="Help"     items={helpItems} />
      </div>

      <span className="bb-vrule" />

      {/* Workspace tabs */}
      <div className="bb-workspace-tabs" role="group" aria-label="Workspace">
        <span className="bb-eyebrow" aria-hidden="true">WORKSPACE</span>
        {WORKSPACE_TABS.map(t => (
          <button
            key={t}
            type="button"
            className={`bb-ws-tab ${workspace === t ? 'on' : ''}`}
            aria-pressed={workspace === t}
            onClick={() => onWorkspace(t)}
            title={WORKSPACE_TITLES[t]}
          >{t}</button>
        ))}
      </div>

      <span style={{ flex: 1 }} />

      {/* Command palette stub */}
      <button type="button" className="bb-cmd-stub" onClick={onCmd} aria-label="Open command palette (⌘K)">
        <span className="bb-cmd-prefix">›</span>
        <span className="bb-cmd-hint">buy 100 nvda lmt 962.40</span>
        <span className="bb-cmd-kbd">⌘K</span>
      </button>

      {/* Session pill */}
      <SessionPill session={session} />

      {/* PAPER/LIVE endpoint toggle */}
      <div
        className="bb-mode-toggle"
        data-mode={modeDisplay}
        title={
          alpacaMode
            ? [
                `Endpoint: ${alpacaMode.baseUrl}`,
                `Paper keys: ${alpacaMode.paperConfigured ? 'configured' : 'NOT configured'}`,
                `Live  keys: ${alpacaMode.liveConfigured  ? 'configured' : 'NOT configured'}`,
                `Order interlock: ${liveModeEnabled ? 'ARMED' : 'not armed'}`,
              ].join('\n')
            : 'Loading mode…'
        }
      >
        <span className="bb-mode-label">PAPER</span>
        <button
          type="button"
          className={modeDisplay === 'live' ? 'bb-live on' : 'bb-live'}
          onClick={() => flipMode(modeDisplay === 'live' ? 'paper' : 'live')}
          disabled={flipBusy}
        >
          {modeDisplay === 'live' ? 'LIVE' : 'LIVE'}
        </button>
      </div>

      {/* Data-feed switch (Simulator ⇄ live Alpaca data) — cyan, distinct from the PAPER/LIVE money toggle */}
      <span className="bb-vrule" />
      <FeedSwitch />

      {/* Status pills */}
      <div className="bb-status-cluster">
        {tactics && (
          <span
            className={`bb-tactics-pip bb-${tactics.state}`}
            onClick={() => onOpenModal('tactics')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenModal('tactics') } }}
            role="button"
            tabIndex={0}
            aria-label={`MAY-TACTICS: ${tactics.state}`}
            title={tactics.vetoReason ?? `MAY-TACTICS: ${tactics.state}`}
          >
            策 {tactics.state.toUpperCase()}
          </span>
        )}
        <StatPill
          dot={autonomous?.enabled ? 'var(--bb-pos)' : 'var(--bb-txt-mute)'}
          label="AUTO"
          value={autonomous ? `${autonomous.approvedCount}/${autonomous.signalsFired}` : '—'}
          title={autonomous ? `${autonomous.approvedCount} approved / ${autonomous.signalsFired} signals · ${autonomous.rejectedCount} rejected` : 'Autonomous off'}
          onClick={() => void toggleAutonomous()}
          pulse={autonomous?.enabled}
        />
        <StatPill
          dot={observer?.running && learner?.running ? 'var(--bb-accent)' : 'var(--bb-txt-mute)'}
          label="INTEL"
          value={observer ? `${observer.observationsPerMinute}/m` : '—'}
          title={[
            `Observer: ${observer?.running ? 'running' : 'idle'} · ${observer?.observationsPerMinute ?? 0}/min · ${observer?.totalObserved.toLocaleString() ?? 0} total`,
            `Learner: ${learner?.cycles ?? 0} cycles · err ${(learner?.lastCycleAvgError ?? 0).toFixed(3)} · ${learner?.weightsTracked ?? 0} weights`,
            `Vault: ${vault?.enabled ? `${vault.notesWritten} notes` : 'disabled'}`,
          ].join('\n')}
        />
        <StatPill
          dot={status.crypto.connected ? 'var(--bb-pos)' : 'var(--bb-txt-mute)'}
          label="₿"
          value={status.crypto.connected ? `${status.crypto.subscribedSymbols}` : '—'}
          title={status.crypto.connected
            ? `Crypto feed live · ${status.crypto.subscribedSymbols} symbol${status.crypto.subscribedSymbols === 1 ? '' : 's'} streaming (separate from US-equity WebSocket)`
            : 'Crypto feed offline — save Alpaca keys (Settings → Data Source) to enable 24/7 BTC/ETH streaming'}
          pulse={status.crypto.connected}
        />
        <StatPill
          dot={status.latencyMs > 50 ? 'var(--bb-warn)' : 'var(--bb-pos)'}
          label="LAT"
          value={status.latencyMs ? `${status.latencyMs}ms` : '—'}
        />
      </div>

      {/* Dual clocks */}
      <div className="bb-clocks">
        <div className="bb-clock-row bb-clock-cst">
          <span className="bb-clock-time">{cst}</span>
          <span className="bb-clock-zone">CST</span>
        </div>
        <div className="bb-clock-row bb-clock-utc">
          <span className="bb-clock-time">{utc}</span>
          <span className="bb-clock-zone">UTC</span>
        </div>
      </div>
    </div>
  )
}
