/**
 * SATEX — Discipline Panel (Conviction Layer · Black Box)
 *
 * The one cockpit surface that shows the operator their own *earned* psychological
 * state instead of raw P&L: conviction that had to be proven (Douglas's
 * downgrade-only calibration), a process that grades itself (Tharp's self-eval),
 * and risk as ever-present ground truth beside them.
 *
 * Pure read-only rendering of data that already crosses the IPC boundary
 * (`getCalibration`, `getSelfEvalStatus`) plus the riskGatesStore snapshot — no
 * new perimeter, no trading-path contact. All interpretation lives in the
 * headless, unit-tested `lib/discipline.ts`; this file is the thin shell.
 */
import { useEffect, useState } from 'react'
import type { CalibrationSnapshot, SelfEvalStatus } from '@shared/types'
import { useRiskGatesStore } from '../stores/riskGatesStore'
import { PanelHead } from '../components/PanelHead'
import {
  readConviction, readSelfAudit, composeDiscipline,
  fmtMultiplier, fmtBrier,
  type DisciplineTone, type RiskPosture,
} from '../lib/discipline'

const toneVar: Record<DisciplineTone, string> = {
  pos: 'var(--bb-pos)', warn: 'var(--bb-warn)', neg: 'var(--bb-neg)', mute: 'var(--bb-txt-dim)',
}

export function DisciplinePanel() {
  const [calib, setCalib] = useState<CalibrationSnapshot | null>(null)
  const [selfEval, setSelfEval] = useState<SelfEvalStatus | null>(null)
  const riskSnap = useRiskGatesStore(s => s.snapshot)

  // Calibration health — global, light 30s cadence (mirrors AIInsightsPanel).
  useEffect(() => {
    if (!window.satex?.getCalibration) return
    let cancelled = false
    const pull = () => { window.satex.getCalibration().then(c => { if (!cancelled) setCalib(c) }).catch(() => {}) }
    pull()
    const id = setInterval(pull, 30000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  // Nightly self-audit status — changes at most once a day; 60s is ample.
  useEffect(() => {
    if (!window.satex?.getSelfEvalStatus) return
    let cancelled = false
    const pull = () => { window.satex.getSelfEvalStatus().then(s => { if (!cancelled) setSelfEval(s) }).catch(() => {}) }
    pull()
    const id = setInterval(pull, 60000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  const now = Date.now()
  const conviction = readConviction(calib)
  const audit = readSelfAudit(selfEval, now)
  const posture: RiskPosture | null = riskSnap
    ? { breaching: riskSnap.breachingCount, watching: riskSnap.watchingCount, passing: riskSnap.passingCount }
    : null
  const composite = composeDiscipline(conviction, audit, posture)

  // The signature meter: solid = earned conviction, hatch = confidence handed
  // back to humility. Dormant (dashed, no fill) until the sample is real.
  const pct = conviction.multiplier === null ? null : Math.round(conviction.multiplier * 100)

  const nums = conviction.armed
    ? `${fmtMultiplier(conviction.multiplier)} · Brier ${fmtBrier(conviction.brier)} · n=${conviction.samples}`
    : conviction.samples > 0
      ? `n=${conviction.samples}/${conviction.minSamples}`
      : '—'

  const risk = riskSnap
    ? riskSnap.breachingCount > 0
      ? { tone: 'neg' as DisciplineTone, detail: `${riskSnap.breachingCount} ${riskSnap.breachingCount === 1 ? 'gate' : 'gates'} breaching` }
      : riskSnap.watchingCount > 0
        ? { tone: 'warn' as DisciplineTone, detail: `${riskSnap.watchingCount} watching · ${riskSnap.passingCount} clear` }
        : { tone: 'pos' as DisciplineTone, detail: `All ${riskSnap.passingCount} gates clear` }
    : null

  return (
    <div className="bb-disc-panel">
      <PanelHead
        title="DISCIPLINE"
        right={<span style={{ color: toneVar[composite.tone], letterSpacing: '0.08em' }}>● {composite.label} · {composite.score}</span>}
      />
      <div className="bb-disc-body">
        <div className="bb-disc-conv">
          <div className="bb-disc-conv-head">
            <span className="bb-disc-state" style={{ color: toneVar[conviction.tone] }}>{conviction.label}</span>
            <span className="bb-disc-nums">{nums}</span>
          </div>
          <div
            className={`bb-disc-meter${pct === null ? ' bb-disc-meter--dormant' : ''}`}
            title={conviction.detail}
            role="meter"
            aria-valuenow={pct ?? undefined}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Earned conviction — ${conviction.label.toLowerCase()}`}
          >
            {pct !== null && (
              <>
                <span className="bb-disc-meter-fill" style={{ width: `${pct}%`, background: toneVar[conviction.tone] }} />
                <span className="bb-disc-meter-ghost" style={{ width: `${100 - pct}%` }} />
                <span className="bb-disc-meter-tick" style={{ left: `${pct}%` }} />
              </>
            )}
          </div>
          <div className="bb-disc-caption" title={conviction.detail}>{conviction.detail}</div>
        </div>

        <div className="bb-disc-rows">
          <div className="bb-disc-row">
            <span className="bb-disc-row-dot" style={{ background: toneVar[audit.tone] }} />
            <span className="bb-disc-row-label">AUDIT</span>
            <span className="bb-disc-row-detail" title={audit.detail}>{audit.detail}</span>
          </div>
          {risk && (
            <div className="bb-disc-row">
              <span className="bb-disc-row-dot" style={{ background: toneVar[risk.tone] }} />
              <span className="bb-disc-row-label">RISK</span>
              <span className="bb-disc-row-detail">{risk.detail}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
