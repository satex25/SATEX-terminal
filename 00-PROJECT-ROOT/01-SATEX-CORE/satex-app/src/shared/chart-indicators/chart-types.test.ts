/**
 * SATEX — chart-types unit tests (CHART-15)
 *
 * Tests Renko, Line Break, and Kagi transforms with known fixtures.
 * Pure: no DOM, no LWC, no network.
 */
import { describe, it, expect } from 'vitest'
import { renkoTransform, lineBreakTransform, kagiTransform } from './chart-types'
import type { Candle } from '../types'

function c(close: number, time = close * 1000): Candle {
  return { time, open: close, high: close + 1, low: close - 1, close, volume: 100 }
}

describe('renkoTransform', () => {
  it('returns [] for empty input', () => {
    expect(renkoTransform([], { brickSize: 10 })).toEqual([])
  })

  it('returns [] for brickSize <= 0', () => {
    expect(renkoTransform([c(100)], { brickSize: 0 })).toEqual([])
    expect(renkoTransform([c(100)], { brickSize: -5 })).toEqual([])
  })

  it('emits no bricks if price never moves a full brickSize', () => {
    expect(renkoTransform([c(100), c(105), c(108)], { brickSize: 10 })).toHaveLength(0)
  })

  it('emits one up-brick on exact brickSize move', () => {
    const bricks = renkoTransform([c(100), c(110)], { brickSize: 10 })
    expect(bricks).toHaveLength(1)
    expect(bricks[0]?.bull).toBe(true)
    expect(bricks[0]?.open).toBe(100)
    expect(bricks[0]?.close).toBe(110)
  })

  it('emits one down-brick on exact downward move', () => {
    const bricks = renkoTransform([c(110), c(100)], { brickSize: 10 })
    expect(bricks).toHaveLength(1)
    expect(bricks[0]?.bull).toBe(false)
  })

  it('emits multiple bricks when price moves 2x brickSize', () => {
    const bricks = renkoTransform([c(100), c(120)], { brickSize: 10 })
    expect(bricks).toHaveLength(2)
    expect(bricks.every((b) => b.bull)).toBe(true)
  })

  it('handles up then down (both directions)', () => {
    const bricks = renkoTransform([c(100), c(120), c(100)], { brickSize: 10 })
    expect(bricks.filter((b) => b.bull).length).toBeGreaterThan(0)
    expect(bricks.filter((b) => !b.bull).length).toBeGreaterThan(0)
  })

  it('up-brick high equals close', () => {
    const bricks = renkoTransform([c(100), c(110)], { brickSize: 10 })
    expect(bricks[0]?.high).toBe(bricks[0]?.close)
  })

  it('down-brick low equals close', () => {
    const bricks = renkoTransform([c(110), c(100)], { brickSize: 10 })
    expect(bricks[0]?.low).toBe(bricks[0]?.close)
  })
})

describe('lineBreakTransform', () => {
  it('returns [] for empty input', () => {
    expect(lineBreakTransform([], {})).toEqual([])
  })

  it('returns seed line for single candle', () => {
    expect(lineBreakTransform([c(100)], {})).toHaveLength(1)
  })

  it('creates up-line when close breaks above prior 3', () => {
    const lines = lineBreakTransform([c(100), c(90), c(80), c(70), c(200)], { lineCount: 3 })
    expect(lines[lines.length - 1]?.bull).toBe(true)
    expect(lines[lines.length - 1]?.close).toBe(200)
  })

  it('creates down-line when close breaks below prior 3', () => {
    const lines = lineBreakTransform([c(100), c(110), c(120), c(130), c(10)], { lineCount: 3 })
    expect(lines[lines.length - 1]?.bull).toBe(false)
    expect(lines[lines.length - 1]?.close).toBe(10)
  })

  it('flat price produces only the seed line', () => {
    expect(lineBreakTransform([c(100), c(100), c(100), c(100)], { lineCount: 3 })).toHaveLength(1)
  })

  it('lineCount=1 creates new line on any different close', () => {
    const lines = lineBreakTransform([c(100), c(110), c(120)], { lineCount: 1 })
    expect(lines.length).toBeGreaterThanOrEqual(3)
  })
})

describe('kagiTransform', () => {
  it('returns [] for empty input', () => {
    expect(kagiTransform([], {})).toEqual([])
  })

  it('returns [] for reversalAmt <= 0', () => {
    expect(kagiTransform([c(100)], { reversalAmt: 0 })).toEqual([])
    expect(kagiTransform([c(100)], { reversalAmt: -1 })).toEqual([])
  })

  it('emits at least one line for single candle', () => {
    expect(kagiTransform([c(100)], { reversalAmt: 5 })).toHaveLength(1)
  })

  it('emits reversal line when price falls by reversalAmt', () => {
    const lines = kagiTransform([c(100), c(100), c(90), c(85)], { reversalAmt: 10 })
    expect(lines.filter((l) => !l.bull).length).toBeGreaterThan(0)
  })

  it('last line closes at the final extreme price', () => {
    const lines = kagiTransform([c(100), c(110), c(120)], { reversalAmt: 20 })
    expect(lines[lines.length - 1]?.close).toBe(120)
  })

  it('all lines have high >= low', () => {
    const lines = kagiTransform([c(100), c(120), c(90), c(130), c(80)], { reversalAmt: 15 })
    for (const line of lines) {
      expect(line.high).toBeGreaterThanOrEqual(line.low)
    }
  })
})

describe('kagiTransform — reversalPct & negative-price reversal magnitude (P-038)', () => {
  it('reversalPct path emits a reversal line on a real reversal', () => {
    // first-ever reversalPct coverage: 100 -> 110, then a drop past 5%% of lineStart (5) to 104
    const lines = kagiTransform([c(100), c(110), c(104)], { reversalPct: 0.05 })
    expect(lines.filter((l) => !l.bull).length).toBeGreaterThan(0)
  })

  it('reversalPct does not reverse on moves smaller than the threshold', () => {
    // gentle 1-unit drift; threshold is 5%% of 100 = 5 -> no reversal, only the final line
    const lines = kagiTransform([c(100), c(101), c(102), c(103), c(104), c(103), c(102)], { reversalPct: 0.05 })
    expect(lines).toHaveLength(1)
    expect(lines[0]?.bull).toBe(true)
  })

  it('negative-priced series does not spuriously reverse (CL crude; |lineStart| magnitude)', () => {
    // pre-P-038 the signed threshold (lineStart * pct < 0) made every non-extreme candle reverse
    const lines = kagiTransform([c(-100), c(-101), c(-102), c(-103), c(-104), c(-103), c(-102)], { reversalPct: 0.05 })
    expect(lines).toHaveLength(1)
    expect(lines[0]?.bull).toBe(true)
  })

  it('reversal count is sign-agnostic for mirrored positive/negative prices', () => {
    const pos = kagiTransform([c(100), c(101), c(102), c(103), c(104), c(103), c(102)], { reversalPct: 0.05 })
    const neg = kagiTransform([c(-100), c(-101), c(-102), c(-103), c(-104), c(-103), c(-102)], { reversalPct: 0.05 })
    expect(neg.length).toBe(pos.length)
  })
})
