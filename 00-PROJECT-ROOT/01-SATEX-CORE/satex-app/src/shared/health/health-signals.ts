/**
 * SATEX — Self-Diagnostic Core: signal adapter (P-037).
 *
 * The thin, pure bridge between *raw engine state* and the `HealthSignals` that
 * `diagnoseHealth` consumes. All transformation that would otherwise bloat the
 * engine call-site lives here as pure, unit-tested functions:
 *   • `computeMemGrowthPctPerHr` — heap-leak slope from a bounded sample ring.
 *   • `computeDrawdownPct`       — rolling drawdown from peak vs current equity.
 *   • `composeHealthSignals`     — assemble the `HealthSignals` interface.
 *
 * Keeping these here means the `trading-engine.ts` edit is a dumb call-site:
 * gather a `HealthSnapshot`, call `composeHealthSignals`, call `diagnoseHealth`.
 *
 * Pure. No clock reads, no engine import, no I/O — deterministic in its args
 * (the engine passes `Date.now()`-derived values IN via the snapshot). Off the
 * trading-safety perimeter: reads equity numbers, mutates nothing.
 */
import type { HealthMode, HealthSessionState, HealthSignals } from './types'

/** One heap sample: wall-clock ms + heap MB. The engine pushes one per status tick. */
export interface MemSample {
  t: number
  mb: number
}

/**
 * The raw fields the engine already has at its status tick, before grading.
 * `errorRatePct` / `lastError` are Tier-C (not tracked yet) and pass straight
 * through as `null` — `diagnoseHealth` emits no finding for a null signal
 * (Constitution 0.1: a signal with no source ships as null, never a guess).
 */
export interface HealthSnapshot {
  mode: HealthMode
  sessionState: HealthSessionState
  connected: boolean
  tickHz: number
  msSinceLastTick: number
  wsDownMs: number
  memMb: number
  /** Bounded ring of recent heap samples (oldest first). */
  memSamples: readonly MemSample[]
  /** Session high-water equity (DEFAULT_EQUITY-seeded, never a constant at read). */
  peakEquity: number
  /** Current account equity. */
  currentEquity: number
  errorRatePct: number | null
  lastError: string | null
}

/** Need this many samples before a growth slope is trustworthy (anti-noise). */
export const MEM_GROWTH_MIN_SAMPLES = 3
/** And at least this much wall-clock span, so early-boot jitter can't blow up %/hr. */
export const MEM_GROWTH_MIN_SPAN_MS = 30_000

/**
 * Heap growth as percent-of-baseline per hour, from the sample ring. First-vs-last
 * slope (the §9.3 alert is coarse: > 10%/hr). Returns `null` until warmed up
 * (too few samples, too short a span, or a non-positive baseline) so the
 * diagnostic stays silent rather than firing on noise.
 */
export function computeMemGrowthPctPerHr(samples: readonly MemSample[]): number | null {
  if (samples.length < MEM_GROWTH_MIN_SAMPLES) return null
  const first = samples[0]!
  const last = samples[samples.length - 1]!
  const spanMs = last.t - first.t
  if (spanMs < MEM_GROWTH_MIN_SPAN_MS) return null
  if (first.mb <= 0) return null
  const hours = spanMs / 3_600_000
  return ((last.mb - first.mb) / first.mb / hours) * 100
}

/**
 * Rolling drawdown as a positive fraction (0.03 = 3% below peak). Guards a
 * non-positive / non-finite peak (returns 0) and clamps the negative case
 * (current above peak ⇒ no drawdown).
 */
export function computeDrawdownPct(peakEquity: number, currentEquity: number): number {
  if (!Number.isFinite(peakEquity) || peakEquity <= 0) return 0
  const dd = (peakEquity - currentEquity) / peakEquity
  return dd > 0 ? dd : 0
}

/** Assemble the `HealthSignals` the core grades, deriving the two trend signals. */
export function composeHealthSignals(raw: HealthSnapshot): HealthSignals {
  return {
    mode: raw.mode,
    sessionState: raw.sessionState,
    connected: raw.connected,
    tickHz: raw.tickHz,
    msSinceLastTick: raw.msSinceLastTick,
    wsDownMs: raw.wsDownMs,
    memMb: raw.memMb,
    memGrowthPctPerHr: computeMemGrowthPctPerHr(raw.memSamples),
    errorRatePct: raw.errorRatePct,
    drawdownPct: computeDrawdownPct(raw.peakEquity, raw.currentEquity),
    lastError: raw.lastError,
  }
}

