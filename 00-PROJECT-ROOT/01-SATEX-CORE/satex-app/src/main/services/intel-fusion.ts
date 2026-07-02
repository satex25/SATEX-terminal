/**
 * SATEX — Intel snapshot fusion (read-only).
 *
 * Composes the existing intelligence surfaces (calibration, regime, macro,
 * depth, brain) plus the pure `@shared/intel-analytics` derivations into one
 * `IntelSnapshot` the renderer polls. Dependency-injected (the RegimeDeps
 * pattern) so the fusion is unit-testable without the engine. Strictly
 * read-only: it gathers and computes, it never places, sizes, or routes an
 * order (off the trading-safety perimeter by construction). Every field is
 * nullable — an insufficient signal yields null (Constitution 0.1), never a
 * fabricated value.
 */
import type {
  AttributionSnapshot, BrainParameter, CalibrationSnapshot, Candle,
  DepthSnapshot, IndicatorSnapshot, IntelSnapshot, MacroSnapshot, Quote, RegimeSnapshot, WeightDriftRow,
} from '@shared/types'
import {
  buildScenario, correlationMatrix, deriveScenarioLayers,
  featureAttribution, microstructureFromDepth,
} from '@shared/intel-analytics'
import { computeWeightDrift } from './learning-report'

const BIAS_KEY = 'bias_intercept'
const CORR_BARS = 240          // bars pulled per symbol for correlation
const CORR_MIN_BARS = 20       // min overlap before correlation is meaningful
const MACRO_IMMINENT_HOURS = 4 // a high-impact event within this window is an uncertainty layer

/** The symbol set for the correlation matrix: the focused symbol first, then the
 *  rest of the universe, capped. Always real symbols (no fabricated tickers). */
export function intelCorrelationSymbols(focus: string, universe: readonly string[], max = 8): string[] {
  const rest = universe.filter((s) => s !== focus)
  return [focus, ...rest].slice(0, Math.max(1, max))
}

export interface IntelFusionDeps {
  now: () => number
  getCalibration: () => CalibrationSnapshot
  getRegime: () => RegimeSnapshot
  getMacro: () => MacroSnapshot
  getDepth: (symbol: string) => DepthSnapshot
  getQuote: (symbol: string) => Quote | undefined
  getIndicators: (symbol: string) => IndicatorSnapshot
  getCandles: (symbol: string, limit: number) => Candle[]
  /** Brain feature vector for the symbol (delegates to `Brain.features`). */
  getFeatures: (quote: Quote, ind: IndicatorSnapshot, depth: DepthSnapshot | undefined) => Record<string, number>
  getBrainParams: () => BrainParameter[]
  getBrainParamsAtStart: () => BrainParameter[]
  /** Symbols to include in the correlation matrix (focused + liquid majors). */
  correlationSymbols: (focused: string) => string[]
}

/** Run a getter, swallowing any throw into a null (a missing service must
 *  never crash the read-only snapshot). */
function safe<T>(fn: () => T): T | null {
  try {
    return fn()
  } catch {
    return null
  }
}

export function composeIntelSnapshot(deps: IntelFusionDeps, symbol: string): IntelSnapshot {
  const now = deps.now()
  const calibration = safe(() => deps.getCalibration())
  const regime = safe(() => deps.getRegime())
  const macro = safe(() => deps.getMacro())
  const depth = safe(() => deps.getDepth(symbol)) ?? undefined

  // ── Feature attribution: brain weights x current features ──────────────────
  let attribution: AttributionSnapshot | null = null
  let trendStructure: number | null = null
  const quote = safe(() => deps.getQuote(symbol)) ?? undefined
  const ind = safe(() => deps.getIndicators(symbol)) ?? undefined
  if (quote && ind) {
    const features = safe(() => deps.getFeatures(quote, ind, depth))
    if (features) {
      const globals = deps.getBrainParams().filter((p) => p.symbol === null)
      const weights = new Map(globals.map((p) => [p.key, p.value]))
      const bias = weights.get(BIAS_KEY) ?? 0
      attribution = featureAttribution(weights, bias, features, Object.keys(features))
      const ts = features['trend_strength']
      trendStructure = typeof ts === 'number' && Number.isFinite(ts) ? Math.max(-1, Math.min(1, ts)) : null
    }
  }

  // ── Brain weight drift since session-start priors ──────────────────────────
  const weightDrift: WeightDriftRow[] | null = safe(() => computeWeightDrift(deps.getBrainParamsAtStart(), deps.getBrainParams()))

  // ── Cross-asset correlation ────────────────────────────────────────────────
  const corrSymbols = safe(() => deps.correlationSymbols(symbol)) ?? []
  const series = corrSymbols.map((s) => ({
    symbol: s,
    closes: (safe(() => deps.getCandles(s, CORR_BARS)) ?? []).map((c) => c.close),
  }))
  const correlationRaw = correlationMatrix(series, CORR_MIN_BARS)
  const correlation = correlationRaw.symbols.length >= 2 ? correlationRaw : null

  // ── Microstructure ─────────────────────────────────────────────────────────
  const micro = microstructureFromDepth(depth)
  const microstructure =
    micro.imbalance != null || micro.vpin != null || micro.bids.length > 0 ? micro : null

  // ── Scenario / multi-layer convergence ─────────────────────────────────────
  const macroImminentHighImpact = !!macro && macro.events.some((e) => {
    if (e.impact !== 'high') return false
    const hours = (Date.parse(e.tsUtc) - now) / 3_600_000
    return Number.isFinite(hours) && hours >= 0 && hours <= MACRO_IMMINENT_HOURS
  })
  const layers = deriveScenarioLayers({
    modelScore: attribution?.score ?? null,
    trendStructure,
    imbalance: micro.imbalance,
    calibrationMultiplier: calibration?.multiplier ?? 1,
    macroImminentHighImpact,
  })
  const scenario = layers.length > 0 ? buildScenario(layers) : null

  return {
    symbol,
    computedAt: now,
    calibration,
    regime,
    macro,
    attribution,
    weightDrift,
    correlation,
    microstructure,
    scenario,
  }
}
