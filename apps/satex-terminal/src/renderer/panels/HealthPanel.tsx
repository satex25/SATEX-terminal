/**
 * SATEX — Health Panel (P-037 · Self-Diagnostic Core)
 *
 * Renders the fused HealthReport from the engine's pure `diagnoseHealth` core:
 * a graded severity badge (green / amber / red) and, when degraded or critical,
 * every finding's kink, evidence, and the Constitution-mandated remediation.
 *
 * Diagnosis only: the remediation text is advice for the operator — nothing in
 * this panel executes, cancels, or sizes anything. It is the surface that lets
 * the operator see a kink the instant the engine names it.
 */
import { useHealthStore } from '../stores/healthStore'
import { PanelHead } from '../components/PanelHead'
import type { HealthSeverity, HealthFinding } from '@shared/health/types'

const SEVERITY_LABEL: Record<HealthSeverity, string> = {
  healthy:  'NOMINAL',
  degraded: 'DEGRADED',
  critical: 'CRITICAL',
}

function sevClass(s: HealthSeverity): string {
  switch (s) {
    case 'critical': return 'bb-health-crit'
    case 'degraded': return 'bb-health-degr'
    default:         return 'bb-health-ok'
  }
}

export function HealthPanel() {
  const report = useHealthStore((s) => s.report)
  const { severity, findings, recommendedAction, needsAttention } = report

  return (
    <div className="bb-health-panel">
      <PanelHead
        title="SYSTEM HEALTH"
        live={needsAttention}
        right={<span className={`bb-health-badge ${sevClass(severity)}`}>{SEVERITY_LABEL[severity]}</span>}
      />
      <div className="bb-health-body">
        {findings.length === 0 && (
          <div className="bb-health-empty">All systems nominal — no kinks detected.</div>
        )}

        {recommendedAction && (
          <div className="bb-health-action">
            <span className="bb-health-action-label">NEXT</span>
            <span className="bb-health-action-text">{recommendedAction}</span>
          </div>
        )}

        {findings.map((f: HealthFinding) => (
          <div key={f.code} className={`bb-health-row ${sevClass(f.severity)}`}>
            <div className="bb-health-row-head">
              <span className="bb-health-dot" />
              <span className="bb-health-summary">{f.summary}</span>
              <span className="bb-health-ref">{f.ref}</span>
            </div>
            <div className="bb-health-evidence">{f.evidence}</div>
            <div className="bb-health-remedy">{f.remediation}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
