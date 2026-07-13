/**
 * SATEX — DISCIPLINE panel · EDGE block interpretation (headless).
 *
 * Pure ranking, counting, and formatting over the nightly `SelfEvalReport`
 * (P-096 PSR/DSR significance). Display-only by constitution (§3.6
 * invariant 3): the numbers arrive over a read-only IPC channel and stop at
 * the panel — nothing here feeds sizing, gating, or autonomy.
 */
import type { SelfEvalReport, SelfEvalReportRow } from '@shared/types'

/** Descending numeric compare with nulls last (unknown never outranks known). */
function numDesc(a: number | null, b: number | null): number {
  if (a == null) return b == null ? 0 : 1
  if (b == null) return -1
  return b - a
}

/** DSR desc (nulls last) → PSR desc (nulls last) → Sharpe desc. */
function cmpEdge(a: SelfEvalReportRow, b: SelfEvalReportRow): number {
  return numDesc(a.dsr, b.dsr) || numDesc(a.psr, b.psr) || (b.sharpe - a.sharpe)
}

/** Top `n` strategies by Deflated Sharpe. Copies before sorting — the
 *  report object held in component state is never mutated. */
export function rankTopByDsr(report: SelfEvalReport | null, n = 3): SelfEvalReportRow[] {
  if (!report || report.rows.length === 0 || n <= 0) return []
  return report.rows.slice().sort(cmpEdge).slice(0, n)
}

/** Verdict tallies for the EDGE header line. */
export function verdictCounts(report: SelfEvalReport | null): { real: number; selectionRisk: number; noise: number } {
  const counts = { real: 0, selectionRisk: 0, noise: 0 }
  for (const r of report?.rows ?? []) {
    if (r.verdict === 'real') counts.real++
    else if (r.verdict === 'selection-risk') counts.selectionRisk++
    else counts.noise++
  }
  return counts
}

/** DSR% cell — `n/a` for null (n<2 / flat equity), never a fabricated 0%. */
export function fmtDsr(dsr: number | null): string {
  if (dsr == null || !Number.isFinite(dsr)) return 'n/a'
  return `${(dsr * 100).toFixed(1)}%`
}
