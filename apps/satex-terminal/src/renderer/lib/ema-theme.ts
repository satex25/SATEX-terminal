/**
 * SATEX — EMA theme color logic (v0.6 Phase 3).
 *
 * Extracted from ChartPanel.tsx (Phase 5 hardening) so the per-period /
 * per-regime / per-theme EMA color decision is pure and unit-testable without
 * mounting the chart. The single DOM dependency — reading a CSS custom property
 * for the Mono/Bluyel token colors — is injected via `readVar`, so callers in
 * the renderer pass their `readCssVar` adapter while tests pass a fake.
 *
 * Behavior is identical to the shipped Phase 3 ChartPanel:
 *   - Classic: regime-based hue (EXPANSION=cyan, COMPRESSION=green,
 *     MEAN-REVERT=orange, CAPITULATION=red) with a period-opacity gradient
 *     (EMA9=1.0, EMA21=0.78, EMA50=0.58, EMA200=0.42 → 0.5 for other periods).
 *     Two signals on one line: regime via hue, period via opacity.
 *   - Mono / Bluyel: period-keyed color read from the `--bb-ema9` / `--bb-ema21`
 *     tokens (per-theme overrides in globals.css), full opacity. Color already
 *     separates EMA9 from EMA21, so no opacity gradient.
 *
 * The Regime Dashboard panel remains the source of truth for regime state in
 * alt themes — the chart is a secondary view.
 */

/** Reads a CSS custom property value (e.g. ChartPanel's `readCssVar`). */
type ReadVar = (name: string) => string

/**
 * Maps a dominant HMM regime state to its EMA accent color, per the Phase 11
 * spec. Codebase uses EXPANSION/MEAN-REVERT/COMPRESSION/CAPITULATION; the spec
 * named the last two TREND/PANIC. Mapping is explicit so the rename is safe.
 */
export function emaColorForRegime(state: string | null | undefined): string {
  switch (state) {
    case 'COMPRESSION':  return '#21c97a' // green
    case 'EXPANSION':    return '#00c8ff' // cyan (spec: "TREND")
    case 'MEAN-REVERT':  return '#f5a623' // orange
    case 'CAPITULATION': return '#ff4655' // red (spec: "PANIC")
    default:             return '#9aa1ad' // neutral mute
  }
}

/** Visual differentiation across EMA periods on the same chart (Classic). */
const EMA_PERIOD_OPACITY: Record<number, number> = { 9: 1.0, 21: 0.78, 50: 0.58, 200: 0.42 }

/**
 * Per-period EMA color and opacity, theme-aware. See module header for the
 * Classic vs Mono/Bluyel models. `readVar` resolves the `--bb-ema*` tokens for
 * the alt-theme branch; it is never consulted in Classic.
 */
export function emaColorForPeriod(
  period: number,
  dominantRegime: string | null | undefined,
  theme: string,
  readVar: ReadVar,
): { color: string; opacity: number } {
  if (theme === 'classic') {
    return {
      color:   emaColorForRegime(dominantRegime),
      opacity: EMA_PERIOD_OPACITY[period] ?? 0.5,
    }
  }
  // Mono / Bluyel — period-keyed CSS tokens, full opacity.
  const token = period <= 9 ? '--bb-ema9' : period <= 21 ? '--bb-ema21' : '--bb-ema9'
  return {
    color:   readVar(token) || (period <= 9 ? '#f5c46a' : '#b48cff'),
    opacity: 1.0,
  }
}
