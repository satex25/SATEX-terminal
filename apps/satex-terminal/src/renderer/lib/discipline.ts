/**
 * SATEX — Discipline read model (pure, headless, node-testable).
 *
 * The Conviction Layer's brain. Maps the raw calibration / self-eval / risk
 * numbers the services already compute into an *earned psychological state* the
 * operator can read at a glance — the trading-psychology doctrine the codebase
 * already encodes, rendered as words instead of thrown away:
 *
 *   - Mark Douglas (probabilistic mindset): conviction is only ever scaled
 *     DOWN, never up. `calibration.ts` enforces this as a downgrade-only
 *     multiplier; here it becomes a state — CALIBRATED / TEMPERED / OVERCONFIDENT.
 *   - Van Tharp (process over outcome): the system grades *itself* nightly
 *     (self-eval), so a fresh, regression-free audit is a discipline signal
 *     independent of any single trade's P&L.
 *   - Risk stays ground truth beside conviction — never conflated with it.
 *
 * Pure functions only. No React, no IPC, no clock of its own (callers pass
 * `now`). Every input is treated as possibly-null/degenerate — a cold-boot
 * terminal with zero closed trades must render something honest, not throw.
 */
import type { CalibrationSnapshot, SelfEvalStatus } from '@shared/types'

export type DisciplineTone = 'pos' | 'warn' | 'neg' | 'mute'

/** A system that claims within this factor of its realized rate is "trued". */
const CALIBRATED_AT = 0.97
/** Below this multiplier the engine is discounting its own conviction hard. */
const OVERCONFIDENT_AT = 0.75
/** A self-audit older than this reads as stale (nightly cadence + slack). */
const SELF_AUDIT_STALE_MS = 36 * 60 * 60 * 1000

// ── Conviction (from calibration) ───────────────────────────────────────────

export interface ConvictionRead {
  /** 'NO DATA' | 'WARMUP' | 'CALIBRATED' | 'TEMPERED' | 'OVERCONFIDENT' */
  label: string
  tone: DisciplineTone
  detail: string
  /** Downgrade multiplier (1 = untouched); null until the sample is real. */
  multiplier: number | null
  brier: number | null
  samples: number
  minSamples: number
  /** True once enough samples exist for the multiplier to bite. */
  armed: boolean
}

export function readConviction(calib: CalibrationSnapshot | null): ConvictionRead {
  if (!calib || calib.samples <= 0) {
    return {
      label: 'NO DATA', tone: 'mute',
      detail: 'No closed trades yet — conviction is unproven.',
      multiplier: null, brier: calib?.brierScore ?? null,
      samples: calib?.samples ?? 0, minSamples: calib?.minSamples ?? 0, armed: false,
    }
  }
  const { samples, minSamples, brierScore, multiplier } = calib
  if (samples < minSamples) {
    return {
      label: 'WARMUP', tone: 'mute',
      detail: `Proving conviction — ${samples}/${minSamples} trades. Claims taken at face value until the sample is real.`,
      multiplier: null, brier: brierScore, samples, minSamples, armed: false,
    }
  }
  if (multiplier >= CALIBRATED_AT) {
    return {
      label: 'CALIBRATED', tone: 'pos',
      detail: 'Claims match outcomes — no downgrade needed.',
      multiplier, brier: brierScore, samples, minSamples, armed: true,
    }
  }
  if (multiplier >= OVERCONFIDENT_AT) {
    return {
      label: 'TEMPERED', tone: 'warn',
      detail: `Slightly overconfident — claims scaled ${fmtMultiplier(multiplier)}.`,
      multiplier, brier: brierScore, samples, minSamples, armed: true,
    }
  }
  return {
    label: 'OVERCONFIDENT', tone: 'neg',
    detail: `Claims scaled ${fmtMultiplier(multiplier)} — the engine is discounting its own conviction hard.`,
    multiplier, brier: brierScore, samples, minSamples, armed: true,
  }
}

// ── Self-audit (from nightly self-eval status) ──────────────────────────────

export interface SelfAuditRead {
  /** 'DISABLED' | 'PENDING' | 'RUNNING' | 'GRADED' | 'FLAGGED' | 'STALE' */
  label: string
  tone: DisciplineTone
  detail: string
  ageMs: number | null
  regressions: number | null
}

export function readSelfAudit(status: SelfEvalStatus | null, now: number): SelfAuditRead {
  if (!status || !status.enabled) {
    return {
      label: 'DISABLED', tone: 'warn',
      detail: 'Nightly self-grading is off — the system is not auditing its own edge.',
      ageMs: null, regressions: null,
    }
  }
  if (status.running) {
    return { label: 'RUNNING', tone: 'mute', detail: 'Grading strategies now…', ageMs: null, regressions: null }
  }
  const last = status.lastRun
  if (!last) {
    return {
      label: 'PENDING', tone: 'mute',
      detail: 'Armed — no grading run has completed yet.',
      ageMs: null, regressions: null,
    }
  }
  const ageMs = Math.max(0, now - last.finishedAt)
  const rel = fmtRelTime(ageMs)
  const strat = `${last.evaluated} ${last.evaluated === 1 ? 'strategy' : 'strategies'}`
  const regr = `${last.regressions} ${last.regressions === 1 ? 'regression' : 'regressions'}`
  if (last.regressions > 0) {
    return {
      label: 'FLAGGED', tone: 'warn',
      detail: `Graded ${strat} ${rel} — ${regr} caught.`,
      ageMs, regressions: last.regressions,
    }
  }
  if (ageMs > SELF_AUDIT_STALE_MS) {
    return {
      label: 'STALE', tone: 'warn',
      detail: `Last grading ${rel} — overdue. ${strat}, clean.`,
      ageMs, regressions: 0,
    }
  }
  return {
    label: 'GRADED', tone: 'pos',
    detail: `Graded ${strat} ${rel} — no regressions.`,
    ageMs, regressions: 0,
  }
}

// ── Composite process-discipline readout (the "one number") ─────────────────

interface DisciplineFactor { label: string; ok: boolean; note: string }

export interface DisciplineComposite {
  /** 0..100 — quiet certainty in the process, not any single trade. */
  score: number
  /** 'DISCIPLINED' | 'GUARDED' | 'CALIBRATING' | 'DEGRADED' */
  label: string
  tone: DisciplineTone
  factors: DisciplineFactor[]
}

export interface RiskPosture { breaching: number; watching: number; passing: number }

export function composeDiscipline(
  conviction: ConvictionRead,
  audit: SelfAuditRead,
  risk?: RiskPosture | null,
): DisciplineComposite {
  const factors: DisciplineFactor[] = []
  let score = 100

  // Conviction: overconfidence is the cardinal sin; being unproven is neutral.
  if (conviction.label === 'OVERCONFIDENT') { score -= 35; factors.push({ label: 'Conviction', ok: false, note: 'overconfident — claims discounted' }) }
  else if (conviction.label === 'TEMPERED') { score -= 15; factors.push({ label: 'Conviction', ok: true, note: 'tempered — mild downgrade' }) }
  else if (conviction.label === 'CALIBRATED') { factors.push({ label: 'Conviction', ok: true, note: 'calibrated' }) }
  else { factors.push({ label: 'Conviction', ok: true, note: 'calibrating — unproven, not overstated' }) }

  // Self-audit: the process grading itself.
  if (audit.label === 'DISABLED') { score -= 25; factors.push({ label: 'Self-audit', ok: false, note: 'off' }) }
  else if (audit.label === 'STALE') { score -= 15; factors.push({ label: 'Self-audit', ok: false, note: 'stale' }) }
  else if (audit.label === 'FLAGGED') { score -= 10; factors.push({ label: 'Self-audit', ok: true, note: 'regressions caught' }) }
  else if (audit.label === 'PENDING') { score -= 10; factors.push({ label: 'Self-audit', ok: true, note: 'no run yet' }) }
  else { factors.push({ label: 'Self-audit', ok: true, note: 'fresh' }) }

  // Risk: ground truth beside conviction — a breach dominates the read.
  if (risk) {
    if (risk.breaching > 0) { score -= 30; factors.push({ label: 'Risk', ok: false, note: `${risk.breaching} breaching` }) }
    else if (risk.watching > 0) { score -= 10; factors.push({ label: 'Risk', ok: true, note: `${risk.watching} watching` }) }
    else { factors.push({ label: 'Risk', ok: true, note: 'all clear' }) }
  }

  score = Math.max(0, Math.min(100, score))

  const unproven = conviction.label === 'NO DATA' || conviction.label === 'WARMUP'
  let label: string
  let tone: DisciplineTone
  if (score >= 85 && unproven) { label = 'CALIBRATING'; tone = 'mute' }
  else if (score >= 85) { label = 'DISCIPLINED'; tone = 'pos' }
  else if (score >= 60) { label = 'GUARDED'; tone = 'warn' }
  else { label = 'DEGRADED'; tone = 'neg' }

  return { score, label, tone, factors }
}

// ── Formatters (guarded) ────────────────────────────────────────────────────

export function fmtMultiplier(m: number | null): string {
  if (m === null || !Number.isFinite(m)) return '—'
  return `×${m.toFixed(2)}`
}

export function fmtRelTime(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return 'never'
  const s = Math.floor(ms / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

export function fmtBrier(b: number | null): string {
  if (b === null || !Number.isFinite(b)) return '—'
  return b.toFixed(3)
}
