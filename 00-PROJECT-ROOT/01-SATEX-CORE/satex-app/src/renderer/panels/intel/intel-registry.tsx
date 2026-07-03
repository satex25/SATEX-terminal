/**
 * SATEX — Intel module renderer (live read-only visualizations).
 *
 * Component-only by design (only `IntelModuleBody` is exported) so React
 * Fast-Refresh stays happy. Every module reads the polled `IntelSnapshot` from
 * `intelStore` and renders an honest `UNKNOWN — SIGNAL INSUFFICIENT` state when
 * its slice is null (Constitution 0.1 — never a fabricated number). All vizzes
 * are zero-dependency (hand-rolled SVG / CSS bars), themed via `--bb-*` tokens.
 */
import { Fragment, type CSSProperties, type FC } from 'react'
import type { IntelModuleId } from '@shared/types'
import { useIntelStore } from '../../stores/intelStore'

// ── shared helpers ───────────────────────────────────────────────────────────

const FEATURE_LABELS: Record<string, string> = {
  ema_stack: 'EMA stack', rsi_mid: 'RSI', vwap_side: 'VWAP side', trend_strength: 'Trend',
  atr_norm: 'ATR (vol)', depth_imbalance: 'Depth imbalance', microprice_dev: 'Microprice',
  bias_intercept: 'Bias',
}
const flabel = (k: string): string => FEATURE_LABELS[k] ?? k
const pct = (x: number): string => `${(x * 100).toFixed(0)}%`
const signed = (x: number, d = 2): string => `${x >= 0 ? '+' : ''}${x.toFixed(d)}`

type Tone = 'pos' | 'neg' | 'warn' | 'dim'
const toneOfDir = (d: string): Tone => (d === 'bull' ? 'pos' : d === 'bear' ? 'neg' : 'dim')

function corrColor(r: number): string {
  const a = Math.min(0.85, Math.abs(r))
  return r >= 0 ? `rgba(54, 179, 126, ${a})` : `rgba(255, 70, 85, ${a})`
}
function brierTone(b: number | null): Tone {
  if (b == null) return 'dim'
  return b < 0.2 ? 'pos' : b < 0.25 ? 'warn' : 'neg'
}
function fmtHrs(h: number): string {
  if (h < 1) return `${Math.max(0, Math.round(h * 60))}m`
  if (h < 48) return `${h.toFixed(1)}h`
  return `${Math.round(h / 24)}d`
}
function centeredBarStyle(magnitudePct: number, positive: boolean): CSSProperties {
  return positive ? { left: '50%', width: `${magnitudePct}%` } : { right: '50%', width: `${magnitudePct}%` }
}

const Unknown: FC<{ reason?: string }> = ({ reason }) => (
  <div className="bb-intel-mod-body">
    <div className="bb-intel-unknown" role="status">UNKNOWN — SIGNAL INSUFFICIENT</div>
    {reason ? <p className="bb-intel-mod-note">{reason}</p> : null}
  </div>
)

const Stat: FC<{ label: string; value: string; tone?: Tone }> = ({ label, value, tone }) => (
  <div className="bb-intel-stat">
    <span className="bb-intel-stat-v" data-tone={tone}>{value}</span>
    <span className="bb-intel-stat-l">{label}</span>
  </div>
)

const CenteredBarRow: FC<{ label: string; magnitudePct: number; positive: boolean; value: string }> =
  ({ label, magnitudePct, positive, value }) => (
    <div className="bb-intel-bar-row">
      <span className="bb-intel-bar-label">{label}</span>
      <div className="bb-intel-bar-track">
        <span className="bb-intel-bar-zero" />
        <span className="bb-intel-bar-fill" data-dir={positive ? 'pos' : 'neg'} style={centeredBarStyle(magnitudePct, positive)} />
      </div>
      <span className="bb-intel-bar-val" data-tone={positive ? 'pos' : 'neg'}>{value}</span>
    </div>
  )

// ── modules ──────────────────────────────────────────────────────────────────

const ReliabilityModule: FC = () => {
  const cal = useIntelStore((s) => s.snapshot?.calibration)
  if (!cal) return <Unknown reason="Calibration warms up after the first scored trades." />
  const pts = cal.buckets.filter((b) => b.n > 0)
  return (
    <div className="bb-intel-rel">
      <div className="bb-intel-statrow">
        <Stat label="Brier" value={cal.brierScore == null ? '—' : cal.brierScore.toFixed(3)} tone={brierTone(cal.brierScore)} />
        <Stat label="Samples" value={String(cal.samples)} />
        <Stat label="Multiplier" value={cal.multiplier.toFixed(2)} tone={cal.multiplier < 1 ? 'warn' : 'pos'} />
      </div>
      <div className="bb-intel-rel-plotwrap">
        <svg viewBox="0 0 100 100" className="bb-intel-rel-plot" role="img" aria-label="Reliability diagram">
          <line x1="0" y1="100" x2="100" y2="0" className="bb-intel-rel-diag" />
          {pts.map((b, i) => (
            <circle
              key={i}
              cx={b.avgConfidence * 100}
              cy={100 - b.winRate * 100}
              r={2.5 + Math.min(6, Math.sqrt(b.n))}
              className="bb-intel-rel-pt"
            />
          ))}
        </svg>
        <span className="bb-intel-rel-ax-x">confidence →</span>
        <span className="bb-intel-rel-ax-y">win rate ↑</span>
      </div>
      {cal.samples < cal.minSamples
        ? <p className="bb-intel-mod-note">Warming up ({cal.samples}/{cal.minSamples} samples).</p>
        : null}
    </div>
  )
}

const AttributionModule: FC = () => {
  const a = useIntelStore((s) => s.snapshot?.attribution)
  if (!a) return <Unknown reason="Awaiting a live quote + indicators for the symbol." />
  const max = Math.max(0.001, ...a.contributions.map((c) => Math.abs(c.contribution)))
  const dir: Tone = a.score > 0.05 ? 'pos' : a.score < -0.05 ? 'neg' : 'dim'
  return (
    <div className="bb-intel-attr">
      <div className="bb-intel-attr-head">
        <span className="bb-intel-attr-score" data-tone={dir}>{signed(a.score)}</span>
        <span className="bb-intel-attr-sub">model score · bias {signed(a.bias)}</span>
      </div>
      <div className="bb-intel-bars">
        {a.contributions.map((c) => (
          <CenteredBarRow
            key={c.key}
            label={flabel(c.key)}
            magnitudePct={(Math.abs(c.contribution) / max) * 50}
            positive={c.contribution >= 0}
            value={signed(c.contribution)}
          />
        ))}
      </div>
    </div>
  )
}

const RegimeModule: FC = () => {
  const r = useIntelStore((s) => s.snapshot?.regime)
  if (!r) return <Unknown reason="Regime classifier needs candle history." />
  const metricLabels = ['Liquidity', 'Spread', 'Volatility', 'Trend']
  const metrics = [r.liquidity, r.spread, r.volatility, r.trend]
  return (
    <div className="bb-intel-regime">
      <div className="bb-intel-regime-state">{r.state}</div>
      <div className="bb-intel-hmm">
        {r.hmm.map((h) => (
          <div key={h.name} className="bb-intel-hmm-row">
            <span className="bb-intel-hmm-name">{h.name}</span>
            <div className="bb-intel-hmm-track"><span className="bb-intel-hmm-fill" data-state={h.name} style={{ width: pct(h.p) }} /></div>
            <span className="bb-intel-hmm-p">{pct(h.p)}</span>
          </div>
        ))}
      </div>
      <div className="bb-intel-regime-metrics">
        {metrics.map((m, i) => (
          <div key={metricLabels[i]} className="bb-intel-metric">
            <span className="bb-intel-metric-v">{m.label}</span>
            <span className="bb-intel-metric-l">{metricLabels[i]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const WeightDriftModule: FC = () => {
  const d = useIntelStore((s) => s.snapshot?.weightDrift)
  if (d == null) return <Unknown reason="Brain weights load with the session." />
  if (d.length === 0) return <Unknown reason="No weight drift from cold-start priors yet." />
  const max = Math.max(0.001, ...d.map((r) => Math.abs(r.delta)))
  return (
    <div className="bb-intel-bars bb-intel-drift">
      {d.map((r) => (
        <CenteredBarRow
          key={r.key}
          label={flabel(r.key)}
          magnitudePct={(Math.abs(r.delta) / max) * 50}
          positive={r.delta >= 0}
          value={signed(r.delta, 3)}
        />
      ))}
    </div>
  )
}

const CorrelationModule: FC = () => {
  const c = useIntelStore((s) => s.snapshot?.correlation)
  if (!c) return <Unknown reason="Needs ≥20 aligned bars across symbols." />
  const n = c.symbols.length
  return (
    <div className="bb-intel-corr">
      <div className="bb-intel-corr-grid" style={{ gridTemplateColumns: `auto repeat(${n}, minmax(0, 1fr))` }}>
        <span className="bb-intel-corr-corner" />
        {c.symbols.map((s) => <span key={`h-${s}`} className="bb-intel-corr-collabel">{s}</span>)}
        {c.symbols.map((rs, i) => (
          <Fragment key={`r-${rs}`}>
            <span className="bb-intel-corr-rowlabel">{rs}</span>
            {c.rows[i]!.map((v, j) => (
              <span
                key={j}
                className="bb-intel-corr-cell"
                style={{ background: corrColor(v) }}
                title={`${rs} / ${c.symbols[j]}: ${v.toFixed(2)}`}
              >
                {v.toFixed(2)}
              </span>
            ))}
          </Fragment>
        ))}
      </div>
      <p className="bb-intel-mod-note">{c.bars} bars · log-return ρ</p>
    </div>
  )
}

const MicrostructureModule: FC = () => {
  const m = useIntelStore((s) => s.snapshot?.microstructure)
  if (!m) return <Unknown reason="No live order book for this symbol." />
  const ladderMax = Math.max(1, ...m.bids.map((b) => b.size), ...m.asks.map((a) => a.size))
  return (
    <div className="bb-intel-micro">
      <div className="bb-intel-statrow">
        <Stat label="VPIN" value={m.vpin == null ? '—' : m.vpin.toFixed(2)} tone={m.vpin != null && m.vpin > 0.6 ? 'warn' : 'dim'} />
        <Stat label="Spread" value={m.spreadBps == null ? '—' : `${m.spreadBps.toFixed(1)}bp`} />
        <Stat label="Imbalance" value={m.imbalance == null ? '—' : signed(m.imbalance)} tone={m.imbalance == null ? 'dim' : m.imbalance > 0 ? 'pos' : 'neg'} />
      </div>
      {m.imbalance != null ? (
        <div className="bb-intel-bar-track bb-intel-imb">
          <span className="bb-intel-bar-zero" />
          <span className="bb-intel-bar-fill" data-dir={m.imbalance >= 0 ? 'pos' : 'neg'} style={centeredBarStyle(Math.abs(m.imbalance) * 50, m.imbalance >= 0)} />
        </div>
      ) : null}
      <div className="bb-intel-ladder">
        {m.asks.slice().reverse().map((l, i) => (
          <div key={`a${i}`} className="bb-intel-ladder-row" data-side="ask">
            <span className="bb-intel-ladder-px">{l.p.toFixed(2)}</span>
            <div className="bb-intel-ladder-bar"><span data-side="ask" style={{ width: pct(l.size / ladderMax) }} /></div>
            <span className="bb-intel-ladder-sz">{l.size}</span>
          </div>
        ))}
        {m.bids.map((l, i) => (
          <div key={`b${i}`} className="bb-intel-ladder-row" data-side="bid">
            <span className="bb-intel-ladder-px">{l.p.toFixed(2)}</span>
            <div className="bb-intel-ladder-bar"><span data-side="bid" style={{ width: pct(l.size / ladderMax) }} /></div>
            <span className="bb-intel-ladder-sz">{l.size}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const MacroModule: FC = () => {
  const macro = useIntelStore((s) => s.snapshot?.macro)
  const stamp = useIntelStore((s) => s.lastUpdated)
  if (!macro || macro.events.length === 0) return <Unknown reason="No scheduled catalysts in the horizon." />
  const now = stamp || Date.now()
  return (
    <div className="bb-intel-macro">
      {macro.events.slice(0, 7).map((e) => {
        const h = (Date.parse(e.tsUtc) - now) / 3_600_000
        return (
          <div key={e.id} className="bb-intel-macro-row">
            <span className="bb-intel-macro-when">{Number.isFinite(h) && h >= 0 ? `in ${fmtHrs(h)}` : '—'}</span>
            <span className="bb-intel-macro-label">{e.label}</span>
            <span className="bb-intel-macro-impact" data-impact={e.impact}>{e.impact}</span>
          </div>
        )
      })}
    </div>
  )
}

const ProbBar: FC<{ label: string; v: number; tone: Tone; dominant: boolean }> = ({ label, v, tone, dominant }) => (
  <div className={`bb-intel-prob${dominant ? ' is-dominant' : ''}`}>
    <span className="bb-intel-prob-label">{label}</span>
    <div className="bb-intel-prob-track"><span className="bb-intel-prob-fill" data-tone={tone} style={{ width: pct(v) }} /></div>
    <span className="bb-intel-prob-v">{pct(v)}</span>
  </div>
)

const ScenarioModule: FC = () => {
  const s = useIntelStore((st) => st.snapshot?.scenario)
  if (!s) return <Unknown reason="Needs at least one live directional signal." />
  return (
    <div className="bb-intel-scn">
      <div className="bb-intel-scn-probs">
        <ProbBar label="Bull" v={s.bull} tone="pos" dominant={s.dominant === 'bull'} />
        <ProbBar label="Neutral" v={s.neutral} tone="dim" dominant={s.dominant === 'neutral'} />
        <ProbBar label="Bear" v={s.bear} tone="neg" dominant={s.dominant === 'bear'} />
      </div>
      <div className="bb-intel-scn-conv">
        <span className="bb-intel-scn-conv-n" data-ok={s.convergence >= 3}>{s.convergence}</span>
        <span className="bb-intel-scn-conv-txt">
          / {s.layers.length} layers converge <strong data-tone={toneOfDir(s.dominant)}>{s.dominant.toUpperCase()}</strong>
          {s.convergence >= 3 ? ' ✓' : ''}
        </span>
      </div>
      <div className="bb-intel-scn-layers">
        {s.layers.map((l, i) => (
          <div key={i} className="bb-intel-scn-layer">
            <span className="bb-intel-scn-arrow" data-dir={l.direction}>{l.direction === 'bull' ? '▲' : l.direction === 'bear' ? '▼' : '■'}</span>
            <span className="bb-intel-scn-layer-label">{l.label}</span>
            <span className="bb-intel-scn-layer-conf">{pct(l.confidence)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function IntelModuleBody({ id }: { id: IntelModuleId }) {
  switch (id) {
    case 'reliability': return <ReliabilityModule />
    case 'attribution': return <AttributionModule />
    case 'regime': return <RegimeModule />
    case 'weight-drift': return <WeightDriftModule />
    case 'correlation': return <CorrelationModule />
    case 'microstructure': return <MicrostructureModule />
    case 'macro': return <MacroModule />
    case 'scenario': return <ScenarioModule />
    default: return <Unknown />
  }
}
