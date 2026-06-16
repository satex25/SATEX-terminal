/**
 * SATEX — indicator graph builder unit tests (CHART-18)
 * Pure: no DOM, no network.
 */
import { describe, it, expect } from 'vitest'
import {
  evalPipeline,
  rsiAlertPipeline,
  type GraphNode,
} from './indicator-graph'
import type { Candle } from '../types'

function c(close: number, i: number): Candle {
  return { time: i * 60, open: close, high: close + 1, low: close - 1, close, volume: 100 }
}

const CANDLES = Array.from({ length: 50 }, (_, i) => c(100 + Math.sin(i * 0.5) * 10, i))

describe('evalPipeline', () => {
  it('returns error label when no nodes', () => {
    const r = evalPipeline(CANDLES, [])
    expect(r.label).toContain('invalid')
    expect(r.series.every((v) => v === 0)).toBe(true)
  })

  it('returns error label when first node is not source', () => {
    const nodes: GraphNode[] = [{ kind: 'ema', period: 9 }]
    expect(evalPipeline(CANDLES, nodes).label).toContain('invalid')
  })

  it('source-only pipeline returns close prices', () => {
    const nodes: GraphNode[] = [{ kind: 'source', field: 'close' }]
    const r = evalPipeline(CANDLES, nodes)
    expect(r.series[0]).toBe(CANDLES[0]!.close)
    expect(r.series).toHaveLength(CANDLES.length)
  })

  it('source → ema pipeline returns same-length series with label', () => {
    const nodes: GraphNode[] = [
      { kind: 'source', field: 'close' },
      { kind: 'ema', period: 9 },
    ]
    const r = evalPipeline(CANDLES, nodes)
    expect(r.series).toHaveLength(CANDLES.length)
    expect(r.label).toContain('EMA(9)')
    expect(r.isAlert).toBe(false)
  })

  it('hl2 source returns (high+low)/2', () => {
    const nodes: GraphNode[] = [{ kind: 'source', field: 'hl2' }]
    const r = evalPipeline(CANDLES, nodes)
    expect(r.series[0]).toBeCloseTo((CANDLES[0]!.high + CANDLES[0]!.low) / 2, 10)
  })

  it('threshold node sets isAlert=true', () => {
    const nodes: GraphNode[] = [
      { kind: 'source', field: 'close' },
      { kind: 'threshold', level: 100, direction: 'above' },
    ]
    expect(evalPipeline(CANDLES, nodes).isAlert).toBe(true)
  })

  it('threshold above: 1 when value >= level, 0 otherwise (index 0 always 0)', () => {
    const nodes: GraphNode[] = [
      { kind: 'source', field: 'close' },
      { kind: 'threshold', level: 80, direction: 'above' },
    ]
    const r = evalPipeline(CANDLES, nodes)
    // Closes are all ~100 > 80
    expect(r.series.slice(1).every((v) => v === 1)).toBe(true)
  })

  it('scale node multiplies series by factor', () => {
    const nodes: GraphNode[] = [
      { kind: 'source', field: 'close' },
      { kind: 'scale', factor: 2 },
    ]
    const r = evalPipeline(CANDLES, nodes)
    expect(r.series[0]).toBeCloseTo(CANDLES[0]!.close * 2, 10)
  })

  it('stdev node returns non-negative values', () => {
    const nodes: GraphNode[] = [
      { kind: 'source', field: 'close' },
      { kind: 'stdev', period: 10 },
    ]
    expect(evalPipeline(CANDLES, nodes).series.every((v) => v >= 0)).toBe(true)
  })

  it('rsiAlertPipeline produces alert series with RSI label', () => {
    const nodes = rsiAlertPipeline(14, 70, 'above')
    const r = evalPipeline(CANDLES, nodes)
    expect(r.isAlert).toBe(true)
    expect(r.label).toContain('RSI')
  })
})
