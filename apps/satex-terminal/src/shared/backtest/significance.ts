/**
 * SATEX — Statistical significance of a Sharpe ratio (P-096).
 *
 * Pure, deterministic, dependency-free quant primitives that answer the only
 * question that matters when the nightly self-evaluation reports a Sharpe:
 * *is this edge real, or is it selection luck?*
 *
 * Implements the Bailey & López de Prado framework:
 *   - Probabilistic Sharpe Ratio (PSR)      — Sharpe Ratio Efficient Frontier, J.Risk 2012
 *   - Minimum Track Record Length (minTRL)  — ibid.
 *   - Deflated Sharpe Ratio (DSR)           — The Deflated Sharpe Ratio, JPM 2014
 * plus the supporting normal CDF / inverse CDF and standardized moments.
 *
 * STRICTLY OBSERVATIONAL. Nothing in this module reads or writes risk limits,
 * order state, calibration multipliers, or any perimeter surface. It computes
 * numbers that get *printed*. Its outputs must never feed a trade decision,
 * a position size, or an autonomy multiplier (Constitution §3.6).
 *
 * CONVENTIONS (pinned by significance.test.ts):
 *   - `SR` passed to PSR/minTRL/DSR is the NON-ANNUALIZED, per-observation
 *     Sharpe: mean(returns)/stdev(returns). Never the annualized metrics.sharpe.
 *   - Kurtosis is RAW (a normal distribution → 3.0), not excess.
 *   - Skewness & kurtosis standardize by the POPULATION std (ddof=0); the
 *     per-observation Sharpe uses the SAMPLE std (ddof=1).
 */

/** Euler–Mascheroni constant. */
const EULER_GAMMA = 0.5772156649015329

// ─────────────────────────────────────────────────────────────────────────────
// Descriptive statistics
// ─────────────────────────────────────────────────────────────────────────────

/** Arithmetic mean. Returns 0 for an empty series. */
export function mean(xs: readonly number[]): number {
  if (xs.length === 0) return 0
  let s = 0
  for (const x of xs) s += x
  return s / xs.length
}

/**
 * Standard deviation. `ddof=1` (default) → sample std (Bessel-corrected);
 * `ddof=0` → population std. Returns 0 when fewer than `ddof+1` points or when
 * every value is identical (degenerate — callers must guard division).
 */
export function stdev(xs: readonly number[], ddof: 0 | 1 = 1): number {
  const n = xs.length
  if (n - ddof <= 0) return 0
  const m = mean(xs)
  let acc = 0
  for (const x of xs) acc += (x - m) * (x - m)
  return Math.sqrt(acc / (n - ddof))
}

/**
 * Standardized skewness (γ3), population-moment form:
 *   (1/n) Σ ((x − μ)/σ_pop)³.
 * Returns 0 for a degenerate (zero-variance) or too-short (n<2) series.
 */
export function skewness(xs: readonly number[]): number {
  const n = xs.length
  if (n < 2) return 0
  const m = mean(xs)
  const sp = stdev(xs, 0)
  if (sp === 0) return 0
  let acc = 0
  for (const x of xs) {
    const z = (x - m) / sp
    acc += z * z * z
  }
  return acc / n
}

/**
 * Standardized RAW kurtosis (γ4), population-moment form:
 *   (1/n) Σ ((x − μ)/σ_pop)⁴.
 * A normal distribution yields 3.0. Returns 3 for a degenerate/too-short
 * series so the PSR denominator stays well-defined (matches the normal null).
 */
export function kurtosis(xs: readonly number[]): number {
  const n = xs.length
  if (n < 2) return 3
  const m = mean(xs)
  const sp = stdev(xs, 0)
  if (sp === 0) return 3
  let acc = 0
  for (const x of xs) {
    const z = (x - m) / sp
    acc += z * z * z * z
  }
  return acc / n
}

// ─────────────────────────────────────────────────────────────────────────────
// Normal distribution: CDF (erf) and inverse CDF (Acklam + Halley refinement)
// ─────────────────────────────────────────────────────────────────────────────

/** Error function — Abramowitz & Stegun 7.1.26 (|error| ≤ 1.5e-7). */
export function erf(x: number): number {
  const sign = x < 0 ? -1 : 1
  const ax = Math.abs(x)
  const t = 1 / (1 + 0.3275911 * ax)
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-ax * ax)
  return sign * y
}

/** Standard-normal CDF Φ(z) = 0.5·(1 + erf(z/√2)). */
export function normCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2))
}

/** Standard-normal PDF φ(z). */
function normPdf(z: number): number {
  return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI)
}

/**
 * Inverse standard-normal CDF Φ⁻¹(p), domain (0,1).
 * Acklam's rational approximation refined by one Halley step against `normCdf`
 * → accuracy well beyond the ±1e-4 this module is pinned to. Guards the domain:
 * p≤0 → −Infinity, p≥1 → +Infinity.
 */
export function normInvCdf(p: number): number {
  if (p <= 0) return -Infinity
  if (p >= 1) return Infinity

  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239e0,
  ]
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ]
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838e0,
    -2.549732539343734e0, 4.374664141464968e0, 2.938163982698783e0,
  ]
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996e0,
    3.754408661907416e0,
  ]
  const pLow = 0.02425
  const pHigh = 1 - pLow

  let x: number
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p))
    x =
      (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1)
  } else if (p <= pHigh) {
    const q = p - 0.5
    const r = q * q
    x =
      ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q) /
      (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1)
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p))
    x =
      -(((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1)
  }

  // One Halley refinement step.
  const e = normCdf(x) - p
  const u = e / normPdf(x)
  x = x - u / (1 + (x * u) / 2)
  return x
}

// ─────────────────────────────────────────────────────────────────────────────
// Sharpe-ratio significance
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The PSR variance-correction denominator:
 *   √( 1 − γ3·SR + ((γ4 − 1)/4)·SR² ).
 * Never returns ≤ 0 (the radicand is ≥ 0 for realistic moments; clamped).
 */
function psrDenominator(sr: number, skew: number, kurt: number): number {
  const radicand = 1 - skew * sr + ((kurt - 1) / 4) * sr * sr
  return Math.sqrt(Math.max(radicand, 1e-12))
}

/**
 * Probabilistic Sharpe Ratio: P(true Sharpe > `srBenchmark` | observed sample).
 *
 *   PSR = Φ( ((SR − SR*)·√(n−1)) / √(1 − γ3·SR + ((γ4−1)/4)·SR²) )
 *
 * @param sr   observed NON-annualized (per-observation) Sharpe
 * @param srBenchmark  benchmark Sharpe SR* (default 0)
 * @param n    number of return observations
 * @param skew standardized skewness γ3
 * @param kurt standardized RAW kurtosis γ4 (normal = 3)
 * @returns probability in (0,1), or `null` when n < 2
 */
export function probabilisticSharpe(
  sr: number,
  srBenchmark: number,
  n: number,
  skew: number,
  kurt: number,
): number | null {
  if (n < 2) return null
  const num = (sr - srBenchmark) * Math.sqrt(n - 1)
  return normCdf(num / psrDenominator(sr, skew, kurt))
}

/**
 * Minimum Track Record Length: the number of observations required for
 * `PSR(srBenchmark) ≥ targetConfidence`.
 *
 *   minTRL = 1 + (1 − γ3·SR + ((γ4−1)/4)·SR²) · ( Φ⁻¹(conf) / (SR − SR*) )²
 *
 * Returns `Infinity` when SR ≤ SR* (the confidence is never reachable).
 */
export function minTrackRecordLength(
  sr: number,
  srBenchmark: number,
  skew: number,
  kurt: number,
  targetConfidence = 0.95,
): number {
  if (sr <= srBenchmark) return Infinity
  const denom = psrDenominator(sr, skew, kurt) // = √radicand
  const radicand = denom * denom
  const z = normInvCdf(targetConfidence)
  const ratio = z / (sr - srBenchmark)
  return 1 + radicand * ratio * ratio
}

/**
 * Expected maximum Sharpe under the null across `nTrials` independent trials
 * whose Sharpe estimates have variance `varSR` (Bailey & López de Prado 2014):
 *
 *   E[max] = √varSR · [ (1−γe)·Φ⁻¹(1 − 1/N) + γe·Φ⁻¹(1 − 1/(N·e)) ]
 *
 * This is the Sharpe you would expect to see from luck alone after N tries —
 * the benchmark DSR deflates against. Returns 0 for N ≤ 1 or varSR ≤ 0
 * (no selection effect to correct for).
 */
export function expectedMaxSharpeNull(varSR: number, nTrials: number): number {
  if (nTrials <= 1 || varSR <= 0) return 0
  const sd = Math.sqrt(varSR)
  const a = normInvCdf(1 - 1 / nTrials)
  const b = normInvCdf(1 - 1 / (nTrials * Math.E))
  return sd * ((1 - EULER_GAMMA) * a + EULER_GAMMA * b)
}

/**
 * Deflated Sharpe Ratio: PSR evaluated against the expected-maximum-under-null
 * benchmark, correcting the observed Sharpe for multiple-testing selection bias.
 *
 * @param sr       observed NON-annualized Sharpe of the selected strategy
 * @param n        number of return observations
 * @param skew     γ3 of the selected strategy's returns
 * @param kurt     raw γ4 of the selected strategy's returns
 * @param trialSRs the NON-annualized Sharpes of every trial in the selection set
 *                 (including the selected one). Its length is N and its variance
 *                 is varSR.
 * @returns probability in (0,1), or `null` when n < 2. With a single trial
 *          (or zero-variance trial set) DSR === PSR(vs 0) — no deflation possible.
 */
export function deflatedSharpe(
  sr: number,
  n: number,
  skew: number,
  kurt: number,
  trialSRs: readonly number[],
): number | null {
  if (n < 2) return null
  const nTrials = trialSRs.length
  const varSR = nTrials > 1 ? stdev(trialSRs, 1) ** 2 : 0
  const srStar = expectedMaxSharpeNull(varSR, nTrials)
  return probabilisticSharpe(sr, srStar, n, skew, kurt)
}

// ─────────────────────────────────────────────────────────────────────────────
// Adapter — from a raw return series to a full significance record
// ─────────────────────────────────────────────────────────────────────────────

export interface SignificanceMetrics {
  /** Number of return observations. */
  n: number
  /** Non-annualized per-observation Sharpe = mean/stdev(ddof=1); null if n<2 or flat. */
  perObsSharpe: number | null
  /** Standardized skewness γ3 (null if undefined). */
  skew: number | null
  /** Standardized RAW kurtosis γ4 (normal = 3; null if undefined). */
  kurtosis: number | null
  /** PSR vs SR*=0; null when undefined. */
  psr: number | null
  /** Observations needed to reach `targetConfidence`; null/Infinity when undefined/unreachable. */
  minTRL: number | null
  /** Deflated Sharpe; null until the trial-aware pass (`withDsr`) fills it. */
  dsr: number | null
  /** Number of trials used for DSR; null until `withDsr`. */
  nTrials: number | null
}

const SENTINEL: SignificanceMetrics = {
  n: 0,
  perObsSharpe: null,
  skew: null,
  kurtosis: null,
  psr: null,
  minTRL: null,
  dsr: null,
  nTrials: null,
}

/**
 * Single-series significance. Fills everything except `dsr`/`nTrials`, which
 * require the whole trial set — apply `withDsr` afterward. Degenerate inputs
 * (n<2, zero-variance flat equity) yield the null SENTINEL, never NaN/throw.
 */
export function significanceFromReturns(
  rets: readonly number[],
  opts?: { srBenchmark?: number; targetConfidence?: number },
): SignificanceMetrics {
  const n = rets.length
  if (n < 2) return { ...SENTINEL, n }
  const sd = stdev(rets, 1)
  if (sd === 0) return { ...SENTINEL, n }

  const srBench = opts?.srBenchmark ?? 0
  const conf = opts?.targetConfidence ?? 0.95
  const sr = mean(rets) / sd
  const g3 = skewness(rets)
  const g4 = kurtosis(rets)

  return {
    n,
    perObsSharpe: sr,
    skew: g3,
    kurtosis: g4,
    psr: probabilisticSharpe(sr, srBench, n, g3, g4),
    minTRL: minTrackRecordLength(sr, srBench, g3, g4, conf),
    dsr: null,
    nTrials: null,
  }
}

/**
 * Pure trial-aware pass: returns a copy of `row` with `dsr`/`nTrials` filled
 * from the full set of per-observation trial Sharpes. Rows whose single-series
 * pass produced the SENTINEL (perObsSharpe null) are returned unchanged.
 */
export function withDsr(
  row: SignificanceMetrics,
  trialSRs: readonly number[],
): SignificanceMetrics {
  if (row.perObsSharpe == null || row.skew == null || row.kurtosis == null) {
    return { ...row }
  }
  return {
    ...row,
    dsr: deflatedSharpe(row.perObsSharpe, row.n, row.skew, row.kurtosis, trialSRs),
    nTrials: trialSRs.length,
  }
}
