/**
 * SATEX — Top menu bar (40px row).
 * Brand · File/View/Markets/Workspace/Help dropdowns · workspace selector ·
 * command-palette opener · live status cluster.
 */
import { useEffect, useState } from 'react'
import { useAccountStore } from '../stores/accountStore'
import { Icon } from './Icon'
import { Dropdown, type DropdownItem } from './Dropdown'
import type { TacticsStatus, ObserverStats, LearnerStats, VaultStats } from '@shared/types'

export type ModalKind = 'about' | 'shortcuts' | 'settings' | 'live' | 'tactics'

interface Props {
  onCmd: () => void
  onOpenModal: (kind: ModalKind) => void
  presetIdx: number
  setPresetIdx: (i: number) => void
  presets: readonly string[]
  liveModeEnabled: boolean
}

export function MenuBar({ onCmd, onOpenModal, presetIdx, setPresetIdx, presets, liveModeEnabled }: Props) {
  const status = useAccountStore(s => s.status)
  const account = useAccountStore(s => s.account)
  const [now, setNow] = useState(() => new Date())
  const [tactics, setTactics] = useState<TacticsStatus | null>(null)
  const [observer, setObserver] = useState<ObserverStats | null>(null)
  const [learner,  setLearner]  = useState<LearnerStats | null>(null)
  const [vault,    setVault]    = useState<VaultStats | null>(null)

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!window.satex?.getTacticsStatus) return
    let cancelled = false
    const pull = () => window.satex.getTacticsStatus().then(s => { if (!cancelled) setTactics(s) }).catch(() => {})
    pull()
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

  const liveDot = status.connected ? (
    <span className="status-pip"><span className="pip-dot" />{liveModeEnabled ? 'LIVE' : 'PAPER'}</span>
  ) : (
    <span className="status-pip">
      <span className="pip-dot" style={{ background: 'var(--bear-glow)', boxShadow: '0 0 0 2px var(--bear-soft), 0 0 12px var(--bear-soft)' }} />
      OFFLINE
    </span>
  )

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
    { label: 'Toggle fullscreen', kbd: '⌘↵', onClick: () => window.satex?.toggleFullscreen() },
    { label: 'Toggle DevTools',   kbd: '⌘⇧D', onClick: () => window.satex?.toggleDevTools() },
    { divider: true },
    { label: 'Settings…',         onClick: () => onOpenModal('settings') },
  ]

  const marketItems: DropdownItem[] = [
    { header: 'Mode' },
    {
      label: liveModeEnabled ? '● LIVE mode (real capital)' : '○ Paper mode',
      onClick: () => onOpenModal('live'),
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

  const workspaceItems: DropdownItem[] = presets.map((p, i) => ({
    label: `Switch to ${p}`,
    kbd:   `⌘${i + 1}`,
    onClick: () => setPresetIdx(i),
  }))

  const helpItems: DropdownItem[] = [
    { label: 'Keyboard shortcuts…',   onClick: () => onOpenModal('shortcuts') },
    { divider: true },
    { label: 'About SATEX 朱',         onClick: () => onOpenModal('about') },
  ]

  return (
    <div className="menubar">
      <div className="brand">
        <div className="brand-mark" />
        <div>
          <div className="brand-name">SATEX <span className="serif-i vermilion" style={{ fontSize: '0.78em', marginLeft: 2 }}>朱</span></div>
          <div className="brand-version">v0.4 · 取引端末</div>
        </div>
      </div>

      <div className="menu-items">
        <Dropdown label="File"      items={fileItems} />
        <Dropdown label="View"      items={viewItems} />
        <Dropdown label="Markets"   items={marketItems} />
        <Dropdown label="Workspace" items={workspaceItems} />
        <Dropdown label="Help"      items={helpItems} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 18, paddingLeft: 14, borderLeft: '1px solid var(--line)' }}>
        <span className="section-eyebrow" style={{ fontSize: 9 }}>WORKSPACE</span>
        <div className="seg" style={{ height: 24 }}>
          {presets.map((p, i) => (
            <button key={p} type="button" className={presetIdx === i ? 'on' : ''} onClick={() => setPresetIdx(i)}>
              {p}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={onCmd}
        className="menu-item"
        style={{
          display: 'flex', alignItems: 'center', gap: 6, marginLeft: 12,
          padding: '4px 10px', border: '1px solid var(--line)', borderRadius: 5, background: 'var(--bg-2)',
        }}
      >
        <Icon name="search" size={12} />
        <span style={{ color: 'var(--ink-3)', fontSize: 11 }}>Command…</span>
        <span className="kbd-key" style={{ marginLeft: 8 }}>⌘K</span>
      </button>

      <div className="status-cluster">
        {liveDot}
        {tactics && (
          <span
            className={`tactics-pip ${tactics.state}`}
            onClick={() => onOpenModal('tactics')}
            role="button"
            title={tactics.vetoReason ?? `MAY-TACTICS: ${tactics.state}`}
          >
            策 {tactics.state.toUpperCase()}
          </span>
        )}
        {(observer || learner || vault) && (
          <span
            className="status-pip"
            title={[
              `Observer: ${observer?.running ? 'running' : 'idle'} · ${observer?.observationsPerMinute ?? 0}/min · ${observer?.totalObserved.toLocaleString() ?? 0} total`,
              `Learner: ${learner?.cycles ?? 0} cycles · err ${(learner?.lastCycleAvgError ?? 0).toFixed(3)} · ${learner?.weightsTracked ?? 0} weights`,
              `Vault: ${vault?.enabled ? `${vault.notesWritten} notes` : 'disabled'}`,
            ].join('\n')}
          >
            <span
              className="pip-dot"
              style={{
                background: observer?.running && learner?.running
                  ? 'var(--bull-glow, #22C55E)'
                  : 'var(--ink-3)',
              }}
            />
            INTEL {observer?.observationsPerMinute ?? 0}
            <i>/m</i>
          </span>
        )}
        <span>LAT {status.latencyMs || '—'}<i>ms</i></span>
        <span>{status.tickHz || 0}<i>Hz</i></span>
        <span style={{ color: 'var(--ink-1)', fontWeight: 600 }}>
          {now.toLocaleTimeString('en-US', { hour12: false })}
        </span>
      </div>
    </div>
  )
}
