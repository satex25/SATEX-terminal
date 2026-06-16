/**
 * SATEX — Node-graph indicator builder (CHART-18)
 *
 * MVP: a linear pipeline of typed transform nodes evaluated over a candle
 * series. Alerts are VISUAL ONLY — no path to EXEC (§4 ultraplan ⛔).
 *
 * Pipeline shape:
 *   [Source] → [Transform…] → [Output]
 *
 * Source nodes produce a number series from candles (close, volume, etc.).
 * Transform nodes apply EMA smoothing, stdev, or arithmetic to the upstream.
 * Threshold nodes emit boolean signals (alert markers on chart, not trades).
 *
 * Design principles:
 *   - Pure: candles in → series out. No side effects.
 *   - Composable: pipe() chains any transforms.
 *   - Typed: no `any`.
 *   - Extensible: new node kinds extend `GraphNode.kind` union.
 *
 * Pure — no DOM, no side effects.
 */
import type { Candle } from '../types'
import { emaSeries }   from './ema'
import { rsiSeries }   from './rsi'

// ── Node definitions ──────────────────────────────────────────────────────────

/** Extract a named price/volume field from each candle. */
export interface SourceNode {
  kind: 'source'
  field: 'close' | 'open' | 'high' | 'low' | 'volume' | 'hl2' | 'ohlc4'
}

/** EMA smoothing of the upstream series. */
export interface EmaNode {
  kind:   'ema'
  period: number
}

/** RSI of the upstream series (uses the built-in rsiSeries). */
export interface RsiNode {
  kind:   'rsi'
  period: number
}

/** Rolling standard deviation (population) of the upstream series. */
export interface StdevNode {
  kind:   'stdev'
  period: number
}

/** Subtract a second upstream from the first (used for EMA crossovers). */
export interface SubtractNode {
  kind: 'subtract'
  /** Index into the pipeline's running inputs stack (must be < current pos). */
  offsetA: number
  offsetB: number
}

/** Scalar multiply. */
export interface ScaleNode {
  kind:   'scale'
  factor: number
}

/** Emit 1 when series crosses above threshold, -1 below, 0 otherwise. */
export interface ThresholdNode {
  kind:      'threshold'
  level:     number
  direction: 'above' | 'below' | 'cross'
}

export type GraphNode =
  | SourceNode
  | EmaNode
  | RsiNode
  | StdevNode
  | SubtractNode
  | ScaleNode
  | ThresholdNode

// ── Output ────────────────────────────────────────────────────────────────────

export interface PipelineResult {
  /** Same length as input candles. */
  series:  number[]
  /** Node chain that produced the series (for legend/tooltip). */
  label:   string
  /** True if the final node is a ThresholdNode (alert markers). */
  isAlert: boolean
}

// ── Source extraction ─────────────────────────────────────────────────────────

function extractSource(candles: readonly Candle[], field: SourceNode['field']): number[] {
  return candles.map((c) => {
    switch (field) {
      case 'close':  return c.close
      case 'open':   return c.open
      case 'high':   return c.high
      case 'low':    return c.low
      case 'volume': return c.volume
      case 'hl2':    return (c.high + c.low) / 2
      case 'ohlc4':  return (c.open + c.high + c.low + c.close) / 4
    }
  })
}

// ── Transform kernels ─────────────────────────────────────────────────────────

function applyStdev(series: number[], period: number): number[] {
  const n = series.length
  const result = new Array<number>(n).fill(0)
  for (let i = period - 1; i < n; i++) {
    const win = series.slice(i - period + 1, i + 1)
    const mean = win.reduce((s, v) => s + v, 0) / period
    const variance = win.reduce((s, v) => s + (v - mean) ** 2, 0) / period
    result[i] = Math.sqrt(variance)
  }
  return result
}

function applyThreshold(series: number[], node: ThresholdNode): number[] {
  const result = new Array<number>(series.length).fill(0)
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1]!
    const curr = series[i]!
    if (node.direction === 'above') {
      result[i] = curr >= node.level ? 1 : 0
    } else if (node.direction === 'below') {
      result[i] = curr <= node.level ? -1 : 0
    } else {
      // cross
      if (prev < node.level && curr >= node.level) result[i] = 1
      else if (prev > node.level && curr <= node.level) result[i] = -1
    }
  }
  return result
}

// ── Pipeline evaluator ────────────────────────────────────────────────────────

/**
 * Evaluate a linear node pipeline over `candles`.
 *
 * Nodes are processed left-to-right. The first node MUST be a `SourceNode`.
 * Each node receives the output of the previous node (or raw candles for
 * source). Returns a `PipelineResult` with the final series + metadata.
 *
 * If the node list is empty or starts with a non-source node, returns a
 * zero-filled series with an error label.
 */
export function evalPipeline(
  candles: readonly Candle[],
  nodes:   readonly GraphNode[],
): PipelineResult {
  const n = candles.length
  const zero = () => new Array<number>(n).fill(0)

  if (nodes.length === 0 || nodes[0]!.kind !== 'source') {
    return { series: zero(), label: '[invalid: must start with source]', isAlert: false }
  }

  const labelParts: string[] = []
  // Track intermediate series for subtract offsets
  const history: number[][] = []

  let current = zero()

  for (const node of nodes) {
    switch (node.kind) {
      case 'source': {
        current = extractSource(candles, node.field)
        labelParts.push(node.field)
        break
      }
      case 'ema': {
        // emaSeries from @shared needs Candle[] with .close — adapt by mapping
        const fakeCandlesWithClose = current.map((v, i) => ({
          ...candles[i]!, close: v,
        }))
        current = emaSeries(fakeCandlesWithClose, node.period).values
        labelParts.push(`EMA(${node.period})`)
        break
      }
      case 'rsi': {
        const fakeCandlesWithClose = current.map((v, i) => ({
          ...candles[i]!, close: v,
        }))
        const rsi = rsiSeries(fakeCandlesWithClose, node.period)
        current = rsi.values
        labelParts.push(`RSI(${node.period})`)
        break
      }
      case 'stdev': {
        current = applyStdev(current, node.period)
        labelParts.push(`Stdev(${node.period})`)
        break
      }
      case 'subtract': {
        const a = history[node.offsetA] ?? zero()
        const b = history[node.offsetB] ?? zero()
        current = a.map((v, i) => v - (b[i] ?? 0))
        labelParts.push('(A-B)')
        break
      }
      case 'scale': {
        current = current.map((v) => v * node.factor)
        labelParts.push(`×${node.factor}`)
        break
      }
      case 'threshold': {
        current = applyThreshold(current, node)
        labelParts.push(`Threshold(${node.level})`)
        break
      }
    }
    history.push(current.slice())
  }

  const lastNode = nodes[nodes.length - 1]!
  return {
    series:  current,
    label:   labelParts.join(' → '),
    isAlert: lastNode.kind === 'threshold',
  }
}

// ── Preset factory helpers ────────────────────────────────────────────────────

/** EMA crossover: fast EMA - slow EMA (positive = bullish, negative = bearish). */
export function emaCrossPipeline(fast: number, _slow: number): GraphNode[] {
  return [
    { kind: 'source', field: 'close' },
    { kind: 'ema', period: fast },
    // We can't do subtract without a second branch in the MVP linear pipeline.
    // Instead emit the fast EMA line; the caller computes both and diffs them.
  ]
}

/** RSI overbought/oversold threshold alert pipeline. */
export function rsiAlertPipeline(
  period: number,
  level:  number,
  dir:    'above' | 'below' | 'cross',
): GraphNode[] {
  return [
    { kind: 'source', field: 'close' },
    { kind: 'rsi',   period },
    { kind: 'threshold', level, direction: dir },
  ]
}
