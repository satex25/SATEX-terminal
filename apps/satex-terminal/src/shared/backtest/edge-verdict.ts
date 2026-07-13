/**
 * SATEX — Edge-verdict classification (P-096 significance → operator verdict).
 *
 * The ONE source of truth for the real / selection-risk / noise thresholds,
 * extracted from the inline ternary in `self-eval.ts` so the nightly markdown
 * report (main) and the DISCIPLINE panel EDGE block (renderer) can never
 * drift apart.
 *
 * STRICTLY OBSERVATIONAL — a verdict is a label on measured history, never an
 * input to sizing, gating, or autonomy (CONSTITUTION §3.6 invariant 3).
 */
import type { EdgeVerdict } from '../types'

/** Confidence bar shared by the PSR and DSR tests (P-096 design). */
const CONFIDENCE_BAR = 0.95

/**
 * - DSR ≥ 0.95 → `real`: the edge survives deflation for multiple testing.
 * - else PSR ≥ 0.95 → `selection-risk`: significant alone, but plausibly the
 *   best of N tries — selection bias not yet ruled out.
 * - else → `noise`: indistinguishable from zero edge. Includes the null case
 *   (n < 2 / flat equity): absence of evidence is not evidence of edge.
 */
export function classifyEdge(sig: { psr: number | null; dsr: number | null }): EdgeVerdict {
  if (sig.dsr != null && sig.dsr >= CONFIDENCE_BAR) return 'real'
  if (sig.psr != null && sig.psr >= CONFIDENCE_BAR) return 'selection-risk'
  return 'noise'
}
