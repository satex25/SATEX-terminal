/**
 * SATEX — End-of-Session LEARNINGS report (2026-06-10).
 *
 * One short, size-capped markdown note per session close, written to
 * `Vault/Learnings/`. The emphasis is LEARNINGS — what the system's models
 * actually changed and how honest its confidence was — not a stats dump:
 *
 *   1. CALIBRATION — Brier, multiplier, the single worst bucket.
 *   2. WEIGHT DRIFT — which brain features moved this session, and how far.
 *   3. LEARNER — pattern-learner cycle health.
 *   4. AUTONOMOUS — signal → approval funnel for the session.
 *
 * Hard guarantees (the Observer-flood lesson, audit §5):
 *   - `MAX_REPORT_BYTES` cap — the renderer truncates, never overflows.
 *   - Caller prunes `Vault/Learnings/` to `MAX_LEARNINGS_FILES` notes.
 *
 * Pure functions only — all data in, markdown out. No IO, no Electron.
 */
import type { AutonomousStatus, BrainParameter, CalibrationSnapshot, LearnerStats } from '@shared/types'

/** Hard byte cap on a learnings note. ~4 KB is a one-screen read. */
export const MAX_REPORT_BYTES = 4_096
/** Keep at most this many learnings notes on disk (caller enforces). */
export const MAX_LEARNINGS_FILES = 30
/** Show at most this many drifted weights — the movers, not the roster. */
const MAX_DRIFT_ROWS = 5
/** Weight changes below this are noise, not learnings. */
const DRIFT_EPSILON = 0.005

export interface LearningsInput {
  sessionId: string
  startedAt: number
  endedAt: number
  calibration: CalibrationSnapshot
  weightsAtStart: BrainParameter[]
  weightsAtEnd: BrainParameter[]
  learner: LearnerStats
  autonomous: AutonomousStatus
}

interface DriftRow { key: string; from: number; to: number; delta: number }

/** Per-feature weight movement over the session, largest |delta| first.
 *  Exported for unit tests. */
export function computeWeightDrift(start: BrainParameter[], end: BrainParameter[]): DriftRow[] {
  const before = new Map<string, number>()
  for (const p of start) if (p.symbol === null) before.set(p.key, p.value)
  const rows: DriftRow[] = []
  for (const p of end) {
    if (p.symbol !== null) continue
    const from = before.get(p.key) ?? 0
    const delta = p.value - from
    if (Math.abs(delta) >= DRIFT_EPSILON) rows.push({ key: p.key, from, to: p.value, delta })
  }
  rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
  return rows.slice(0, MAX_DRIFT_ROWS)
}

/** The single most miscalibrated bucket with enough samples to matter. */
function worstBucket(c: CalibrationSnapshot): string {
  let worst: { gap: number; line: string } | null = null
  for (const b of c.buckets) {
    if (b.n < 3) continue
    const gap = b.avgConfidence - b.winRate
    if (!worst || Math.abs(gap) > Math.abs(worst.gap)) {
      const dir = gap > 0 ? 'overconfident' : 'underconfident'
      worst = { gap, line: `${(b.lo * 100).toFixed(0)}–${(b.hi * 100).toFixed(0)}% bucket is ${dir} by ${Math.abs(gap * 100).toFixed(0)}pts (claimed ${(b.avgConfidence * 100).toFixed(0)}%, won ${(b.winRate * 100).toFixed(0)}%, n=${b.n})` }
    }
  }
  return worst?.line ?? 'no bucket has enough samples yet'
}

function hm(ms: number): string {
  const h = Math.floor(ms / 3_600_000)
  const m = Math.round((ms % 3_600_000) / 60_000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

/** Render the learnings note. ALWAYS ≤ MAX_REPORT_BYTES (UTF-8). */
export function renderLearningsMd(input: LearningsInput): string {
  const d = new Date(input.endedAt)
  const c = input.calibration
  const drift = computeWeightDrift(input.weightsAtStart, input.weightsAtEnd)
  const a = input.autonomous

  const lines: string[] = []
  lines.push('---')
  lines.push('type: learnings')
  lines.push(`session: ${input.sessionId}`)
  lines.push(`date: ${d.toISOString()}`)
  lines.push('tags: [satex, learnings, session]')
  lines.push('---')
  lines.push('')
  lines.push(`# Session Learnings — ${d.toISOString().slice(0, 10)} (${hm(input.endedAt - input.startedAt)})`)
  lines.push('')
  lines.push('## What the system learned')
  lines.push('')
  if (drift.length === 0) {
    lines.push('- **No weight movement.** No closed trades fed the brain this session (or moves were < 0.005). A session without outcomes is a session without learning — check that trades are closing.')
  } else {
    for (const r of drift) {
      const arrow = r.delta > 0 ? '↑' : '↓'
      lines.push(`- **${r.key}** ${arrow} ${r.delta > 0 ? '+' : ''}${r.delta.toFixed(3)} (${r.from.toFixed(3)} → ${r.to.toFixed(3)})`)
    }
  }
  lines.push('')
  lines.push('## How honest was its confidence')
  lines.push('')
  if (c.samples === 0) {
    lines.push('- No confidence-stamped outcomes yet — calibration starts with the first closed autonomous trade.')
  } else {
    lines.push(`- Brier **${c.brierScore !== null ? c.brierScore.toFixed(3) : '—'}** (0 = oracle, 0.25 = coin) over ${c.samples} outcomes${c.samples < c.minSamples ? ` — warmup, ${c.minSamples - c.samples} more until the multiplier arms` : ''}.`)
    lines.push(`- Confidence multiplier **×${c.multiplier.toFixed(2)}**${c.multiplier < 1 ? ' — the system is being downgraded for overconfidence.' : ' — claims are holding up.'}`)
    lines.push(`- Worst bucket: ${worstBucket(c)}.`)
  }
  lines.push('')
  lines.push('## Signal funnel (autonomous)')
  lines.push('')
  lines.push(`- ${a.signalsFired} signals → ${a.approvedCount} entered, ${a.rejectedCount} rejected${a.signalsFired > 0 ? ` (${((a.approvedCount / Math.max(1, a.signalsFired)) * 100).toFixed(0)}% pass rate)` : ''}.`)
  lines.push(`- Pattern-learner: ${input.learner.cycles} cycles, last avg error ${input.learner.lastCycleAvgError.toFixed(4)}, ${input.learner.weightsTracked} weights tracked.`)
  lines.push('')
  lines.push('> Next: nightly self-eval verdicts live in [[Vault/Backtests]]; calibration detail in the AI Insights panel.')
  lines.push('')

  let out = lines.join('\n')
  // Hard cap — truncate at a line boundary with an explicit marker.
  if (Buffer.byteLength(out, 'utf-8') > MAX_REPORT_BYTES) {
    const marker = '\n…(truncated at size cap)\n'
    const budget = MAX_REPORT_BYTES - Buffer.byteLength(marker, 'utf-8')
    let cut = out
    while (Buffer.byteLength(cut, 'utf-8') > budget) {
      const lastNl = cut.lastIndexOf('\n')
      if (lastNl <= 0) { cut = cut.slice(0, Math.floor(budget / 2)); break }
      cut = cut.slice(0, lastNl)
    }
    out = cut + marker
  }
  return out
}
