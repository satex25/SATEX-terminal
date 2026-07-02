/**
 * SATEX — Intel analytics (pure, headless, shared).
 *
 * The math behind the Quant Intelligence workspace: pairwise return
 * correlation, brain feature attribution, microstructure reads, and the
 * forward-looking scenario / multi-layer convergence synthesis. Zero Node and
 * zero DOM deps so the same functions run in the main fusion and in unit tests.
 *
 * Discipline: every function is UNKNOWN-safe — insufficient input yields a
 * `null` / empty result (Constitution 0.1, never a fabricated number) — and
 * negative-price-safe (log-returns skip any step through a non-positive price,
 * the P-039 / P-034 class). Nothing here reads a clock or mutates state.
 */
import type {
  AttributionSnapshot,
  CorrelationMatrix,
  DepthSnapshot,
  FeatureContribution,
  MicrostructureRead,
  ScenarioDirection,
  ScenarioLayer,
  ScenarioOutlook,
} from './types'

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x))
const clamp11 = (x: number): number => Math.max(-1, Math.min(1, x))

/** Direction of a signed signal with a small neutral dead-band. */
function directionOf(x: number, deadband = 0.1): ScenarioDirection {
  if (x > deadband) return 'bull'
  if (x < -deadband) return 'bear'
  return 'neutral'
}

/**
 * Element-wise log-returns, preserving index alignment: a step through a
 * non-positive price yields `NaN` (excluded pairwise by `pearson`) rather than
 * being dropped, so two symbols' return series stay index-aligned for
 * correlation. Length = closes.length - 1.
 */
export function alignedLogReturns(closes: readonly number[]): number[] {
  const out: number[] = []
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1]!
    const curr = closes[i]!
    out.push(prev > 0 && curr > 0 ? Math.log(curr / prev) : NaN)
  }
  return out
}

/**
 * Pearson correlation over two equal-cadence series, ignoring index pairs where
 * either value is non-finite. Returns null when fewer than 2 finite pairs or
 * when either series has zero variance (correlation undefined).
 */
export function pearson(a: readonly number[], b: readonly number[]): number | null {
  const n = Math.min(a.length, b.length)
  let sx = 0, sy = 0, cnt = 0
  for (let i = 0; i < n; i++) {
    const x = a[i]!, y = b[i]!
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    sx += x; sy += y; cnt++
  }
  if (cnt < 2) return null
  const mx = sx / cnt, my = sy / cnt
  let cov = 0, vx = 0, vy = 0
  for (let i = 0; i < n; i++) {
    const x = a[i]!, y = b[i]!
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    const dx = x - mx, dy = y - my
    cov += dx * dy; vx += dx * dx; vy += dy * dy
  }
  if (vx <= 0 || vy <= 0) return null
  return clamp11(cov / Math.sqrt(vx * vy))
}

/**
 * Pairwise return-correlation matrix across symbols. Symbols with fewer than
 * `minBars + 1` closes are dropped; all survivors are truncated to the shortest
 * length so returns align by bar. Returns an empty matrix (UNKNOWN) when fewer
 * than 2 symbols qualify or the overlap is below `minBars`.
 */
export function correlationMatrix(
  series: ReadonlyArray<{ symbol: string; closes: readonly number[] }>,
  minBars = 20,
): CorrelationMatrix {
  const valid = series.filter((s) => s.closes.length >= minBars + 1)
  if (valid.length < 2) return { symbols: [], rows: [], bars: 0 }
  const minLen = Math.min(...valid.map((s) => s.closes.length))
  const bars = minLen - 1
  if (bars < minBars) return { symbols: [], rows: [], bars: 0 }
  const rets = valid.map((s) => alignedLogReturns(s.closes.slice(-minLen)))
  const symbols = valid.map((s) => s.symbol)
  const rows = symbols.map((_, i) =>
    symbols.map((_, j) => {
      if (i === j) return 1
      return pearson(rets[i]!, rets[j]!) ?? 0
    }),
  )
  return { symbols, rows, bars }
}

/**
 * Decompose the brain's linear score into per-feature contributions
 * (weight x feature). `score = tanh(bias + sum(contribution))` mirrors
 * `Brain.scoreLocal`. Contributions are returned largest-magnitude first.
 */
export function featureAttribution(
  weights: ReadonlyMap<string, number>,
  bias: number,
  features: Readonly<Record<string, number>>,
  order: readonly string[],
): AttributionSnapshot {
  const contributions: FeatureContribution[] = []
  let sum = bias
  for (const key of order) {
    const weight = weights.get(key) ?? 0
    const feature = Number.isFinite(features[key]) ? features[key]! : 0
    const contribution = weight * feature
    sum += contribution
    contributions.push({ key, weight, feature, contribution })
  }
  contributions.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
  return { bias, score: Math.tanh(sum), contributions }
}

/** Top-of-book microstructure read from a depth snapshot. UNKNOWN fields stay
 *  null when the book is absent. */
export function microstructureFromDepth(
  depth: DepthSnapshot | null | undefined,
  maxLevels = 6,
): MicrostructureRead {
  if (!depth || !depth.bids?.length || !depth.asks?.length) {
    return {
      symbol: depth?.symbol ?? '',
      imbalance: null,
      vpin: depth && Number.isFinite(depth.vpin) ? clamp01(depth.vpin) : null,
      spreadBps: null,
      bids: [],
      asks: [],
    }
  }
  const bidTop = depth.bids[0]!
  const askTop = depth.asks[0]!
  const tot = bidTop.size + askTop.size
  const imbalance = tot > 0 ? clamp11((bidTop.size - askTop.size) / tot) : null
  const spreadBps = depth.mid > 0 ? (depth.spread / depth.mid) * 10_000 : null
  return {
    symbol: depth.symbol,
    imbalance,
    vpin: Number.isFinite(depth.vpin) ? clamp01(depth.vpin) : null,
    spreadBps,
    bids: depth.bids.slice(0, maxLevels),
    asks: depth.asks.slice(0, maxLevels),
  }
}

/** Inputs for the scenario synthesis — each already a real measured signal, or
 *  null when unavailable (omitted from the layer set, never invented). */
export interface ScenarioInputs {
  /** Brain pre-squash score in [-1, 1]. */
  modelScore: number | null
  /** Signed trend-structure signal (EMA stack / trend strength) in [-1, 1]. */
  trendStructure: number | null
  /** Top-of-book imbalance in [-1, 1]. */
  imbalance: number | null
  /** Downgrade-only calibration multiplier (scales every confidence). */
  calibrationMultiplier: number
  /** True when a high-impact macro event is imminent (uncertainty layer). */
  macroImminentHighImpact: boolean
}

/** Build the independent signal layers from the real inputs. A null input adds
 *  no layer (no fabrication). Confidence is scaled by the calibration
 *  multiplier so an over-confident model can't dominate the tally. */
export function deriveScenarioLayers(inp: ScenarioInputs): ScenarioLayer[] {
  const mult = clamp01(Number.isFinite(inp.calibrationMultiplier) ? inp.calibrationMultiplier : 1)
  const layers: ScenarioLayer[] = []
  if (inp.modelScore != null) {
    layers.push({ label: 'Model (technical)', direction: directionOf(inp.modelScore, 0.18), confidence: clamp01(Math.abs(inp.modelScore)) * mult })
  }
  if (inp.trendStructure != null) {
    layers.push({ label: 'Trend (structure)', direction: directionOf(inp.trendStructure), confidence: clamp01(Math.abs(inp.trendStructure)) * mult })
  }
  if (inp.imbalance != null) {
    layers.push({ label: 'Order-flow', direction: directionOf(inp.imbalance), confidence: clamp01(Math.abs(inp.imbalance)) * mult })
  }
  if (inp.macroImminentHighImpact) {
    layers.push({ label: 'Macro event risk', direction: 'neutral', confidence: 0.7 })
  }
  return layers
}

/**
 * Fuse the signal layers into Bull / Bear / Neutral probabilities (sum ~1) plus
 * the multi-layer convergence count (Constitution 4.2/4.3): how many independent
 * layers agree with the dominant direction at confidence >= 0.6. With no layers
 * the outlook is fully neutral with zero convergence (honest UNKNOWN).
 */
export function buildScenario(layers: readonly ScenarioLayer[]): ScenarioOutlook {
  let bull = 0, bear = 0, neutral = 0
  for (const l of layers) {
    const c = clamp01(l.confidence)
    if (l.direction === 'bull') bull += c
    else if (l.direction === 'bear') bear += c
    else neutral += c
  }
  const total = bull + bear + neutral
  if (total <= 0) {
    return { bull: 0, bear: 0, neutral: 1, dominant: 'neutral', convergence: 0, layers: [...layers] }
  }
  const pBull = bull / total
  const pBear = bear / total
  const pNeutral = neutral / total
  const dominant: ScenarioDirection =
    pBull >= pBear && pBull >= pNeutral ? 'bull' : pBear >= pNeutral ? 'bear' : 'neutral'
  const convergence = layers.filter((l) => l.direction === dominant && l.confidence >= 0.6).length
  return { bull: pBull, bear: pBear, neutral: pNeutral, dominant, convergence, layers: [...layers] }
}
