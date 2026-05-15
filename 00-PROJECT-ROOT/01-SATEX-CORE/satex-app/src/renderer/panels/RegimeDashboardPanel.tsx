/**
 * SATEX — Regime Dashboard Panel (Phase 10 · Black Box)
 *
 * Replaces AIInsightsPanel. Renders the HMM 4-state regime view from the
 * regimeStore: state header, 4 metric tiles (LIQUIDITY/SPREAD/VOLATILITY/TREND)
 * with directional arrows, then 4 HMM state probability bars.
 */
import { useRegimeStore } from '../stores/regimeStore'
import { PanelHead } from '../components/PanelHead'
import type { RegimeMetric } from '@shared/types'

function MetricTile({ label, m, invert }: { label: string; m: RegimeMetric; invert?: boolean }) {
  const good = invert ? m.trend < 0 : m.trend > 0
  return (
    <div className="bb-regime-tile">
      <div className="bb-regime-tile-head">
        <span className="bb-regime-tile-label">{label}</span>
        <span style={{ flex: 1 }} />
        <span className={good ? 'bb-pos' : 'bb-neg'} style={{ fontSize: 9.5 }}>
          {m.trend >= 0 ? '▲' : '▼'} {Math.abs(m.trend).toFixed(2)}
        </span>
      </div>
      <div className="bb-regime-tile-row">
        <span className="bb-regime-tile-value">{m.v.toFixed(2)}</span>
        <span className="bb-regime-tile-sublabel">{m.label}</span>
      </div>
      <div className="bb-regime-tile-bar">
        <span style={{ width: `${Math.max(0, Math.min(100, m.v * 100))}%` }} />
      </div>
    </div>
  )
}

export function RegimeDashboardPanel() {
  const snap = useRegimeStore(s => s.snapshot)
  if (!snap) {
    return (
      <div className="bb-regime-panel">
        <PanelHead title="REGIME ANALYSIS" right="HMM · 4-STATE · 30D" />
        <div className="bb-regime-empty">Computing regime…</div>
      </div>
    )
  }

  return (
    <div className="bb-regime-panel">
      <PanelHead title="REGIME ANALYSIS" right={<span>HMM · 4-STATE · 30D</span>} />
      <div className="bb-regime-body">
        <div className="bb-regime-state-row">
          <span className="bb-regime-state-dot">●</span>
          <span className="bb-regime-state-eyebrow">STATE</span>
          <span className="bb-regime-state-text">{snap.state}</span>
        </div>

        <div className="bb-regime-grid">
          <MetricTile label="LIQUIDITY"      m={snap.liquidity} />
          <MetricTile label="SPREAD COST"    m={snap.spread}    invert />
          <MetricTile label="VOLATILITY"     m={snap.volatility} />
          <MetricTile label="TREND STRENGTH" m={snap.trend} />
        </div>

        <div className="bb-regime-section">STATE PROB · HMM</div>
        <div className="bb-regime-hmm">
          {snap.hmm.map((s, i) => {
            const isTop = snap.hmm.every(t => t.p <= s.p)
            return (
              <div key={s.name} className="bb-regime-hmm-row">
                <span className={`bb-regime-hmm-name ${isTop ? 'top' : ''}`}>{s.name}</span>
                <div className="bb-regime-hmm-bar">
                  <span style={{ width: `${Math.max(0, Math.min(100, s.p * 100))}%`, background: isTop ? 'var(--bb-accent)' : 'var(--bb-txt-mute)' }} />
                </div>
                <span className="bb-regime-hmm-pct">{(s.p * 100).toFixed(0)}%</span>
                {/* avoid TS unused-var: silence i */}
                <span style={{ display: 'none' }}>{i}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
