/**
 * SATEX — Risk Gate Panel (Phase 10 · Black Box)
 *
 * 3×2 grid of pre-trade risk gates. Each cell shows label, status pill,
 * value string, and a colored progress bar. Subscribes to riskGatesStore
 * (pushed by main-process RiskGatesService).
 */
import { useRiskGatesStore } from '../stores/riskGatesStore'
import { PanelHead } from '../components/PanelHead'
import type { RiskGate } from '@shared/types'

function statusColor(g: RiskGate): string {
  return g.status === 'OK' ? 'var(--bb-pos)'
       : g.status === 'WATCH' ? 'var(--bb-warn)'
       : 'var(--bb-neg)'
}

export function RiskGatePanel() {
  const snap = useRiskGatesStore(s => s.snapshot)
  if (!snap) {
    return (
      <div className="bb-risk-panel">
        <PanelHead title="RISK GATES" right="Computing…" />
      </div>
    )
  }

  const summary = (
    <span style={{ color: snap.breachingCount > 0 ? 'var(--bb-neg)' : snap.watchingCount > 0 ? 'var(--bb-warn)' : 'var(--bb-pos)' }}>
      ● {snap.passingCount} OK · {snap.watchingCount} WATCH{snap.breachingCount > 0 ? ` · ${snap.breachingCount} BREACH` : ''}
    </span>
  )

  return (
    <div className="bb-risk-panel">
      <PanelHead title="RISK GATES" right={summary} />
      <div className="bb-risk-grid">
        {snap.gates.map(g => (
          <div key={g.key} className="bb-risk-cell">
            <div className="bb-risk-head">
              <span className="bb-risk-label">{g.label}</span>
              <span style={{ flex: 1 }} />
              <span className={`bb-risk-status bb-risk-${g.status.toLowerCase()}`}>{g.status}</span>
            </div>
            <div className="bb-risk-value">{g.value}</div>
            <div className="bb-risk-bar">
              <span style={{ width: `${Math.max(0, Math.min(100, g.pct * 100))}%`, background: statusColor(g) }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
