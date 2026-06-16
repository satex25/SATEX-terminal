/**
 * SATEX — DrawingModel unit tests (CHART-03 · CHART-04 · CHART-09)
 *
 * Pure model: no DOM, no React, no LWC.
 */
import { describe, it, expect } from 'vitest'
import {
  fibLevels,
  anchorInView,
  drawingInView,
  nextDrawingId,
  FIB_RATIOS,
} from './DrawingModel'
import type {
  FibDraw,
  LineDraw,
  HLineDraw,
  VLineDraw,
  RectDraw,
  AnnotationDraw,
  PriceTimeAnchor,
} from './DrawingModel'

// ── helpers ───────────────────────────────────────────────────────────────────

function anchor(time: number, price: number): PriceTimeAnchor {
  return { time, price }
}

function baseDraw() {
  return { symbol: 'AAPL', selected: false, locked: false }
}

// ── fibLevels ─────────────────────────────────────────────────────────────────

describe('fibLevels', () => {
  const fibDraw: FibDraw = {
    ...baseDraw(),
    id: 'd1', kind: 'fibonacci',
    high: anchor(1000, 200),
    low:  anchor(900,  100),
  }

  it('returns 7 levels (one per standard ratio)', () => {
    expect(fibLevels(fibDraw)).toHaveLength(FIB_RATIOS.length)
  })

  it('levels are sorted ascending by price', () => {
    const levels = fibLevels(fibDraw)
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i]!.price).toBeGreaterThanOrEqual(levels[i - 1]!.price)
    }
  })

  it('0% level equals the low price', () => {
    const levels = fibLevels(fibDraw)
    const zero = levels.find((l) => l.ratio === 0)
    expect(zero?.price).toBe(100)
  })

  it('100% level equals the high price', () => {
    const levels = fibLevels(fibDraw)
    const full = levels.find((l) => l.ratio === 1)
    expect(full?.price).toBe(200)
  })

  it('50% level is at midpoint', () => {
    const levels = fibLevels(fibDraw)
    const half = levels.find((l) => l.ratio === 0.5)
    expect(half?.price).toBeCloseTo(150, 5)
  })

  it('handles swapped high/low anchors (price normalised)', () => {
    const flipped: FibDraw = {
      ...fibDraw,
      high: anchor(1000, 100),
      low:  anchor(900,  200),
    }
    const levels = fibLevels(flipped)
    const zero = levels.find((l) => l.ratio === 0)
    const full = levels.find((l) => l.ratio === 1)
    expect(zero?.price).toBe(100)
    expect(full?.price).toBe(200)
  })

  it('returns [] when high === low (degenerate range)', () => {
    const flat: FibDraw = {
      ...fibDraw,
      high: anchor(1000, 100),
      low:  anchor(900,  100),
    }
    expect(fibLevels(flat)).toEqual([])
  })

  it('label contains the ratio as a percentage', () => {
    const levels = fibLevels(fibDraw)
    const l382 = levels.find((l) => l.ratio === 0.382)
    expect(l382?.label).toBe('38.2%')
  })
})

// ── anchorInView ──────────────────────────────────────────────────────────────

describe('anchorInView', () => {
  const vp = { fromTime: 1000, toTime: 2000, minPrice: 100, maxPrice: 200 }

  it('returns true for anchor fully inside viewport', () => {
    expect(anchorInView(anchor(1500, 150), vp.fromTime, vp.toTime, vp.minPrice, vp.maxPrice)).toBe(true)
  })

  it('returns false for anchor outside time range (left)', () => {
    expect(anchorInView(anchor(999, 150), vp.fromTime, vp.toTime, vp.minPrice, vp.maxPrice)).toBe(false)
  })

  it('returns false for anchor outside time range (right)', () => {
    expect(anchorInView(anchor(2001, 150), vp.fromTime, vp.toTime, vp.minPrice, vp.maxPrice)).toBe(false)
  })

  it('returns false for anchor outside price range (below)', () => {
    expect(anchorInView(anchor(1500, 99), vp.fromTime, vp.toTime, vp.minPrice, vp.maxPrice)).toBe(false)
  })

  it('returns false for anchor outside price range (above)', () => {
    expect(anchorInView(anchor(1500, 201), vp.fromTime, vp.toTime, vp.minPrice, vp.maxPrice)).toBe(false)
  })

  it('returns true on boundary (inclusive)', () => {
    expect(anchorInView(anchor(1000, 100), vp.fromTime, vp.toTime, vp.minPrice, vp.maxPrice)).toBe(true)
    expect(anchorInView(anchor(2000, 200), vp.fromTime, vp.toTime, vp.minPrice, vp.maxPrice)).toBe(true)
  })
})

// ── drawingInView ─────────────────────────────────────────────────────────────

describe('drawingInView', () => {
  const vp = [1000, 2000, 100, 200] as const  // fromTime, toTime, minPrice, maxPrice

  it('hline is always in view', () => {
    const h: HLineDraw = { ...baseDraw(), id: 'd2', kind: 'hline', price: 999 }
    expect(drawingInView(h, ...vp)).toBe(true)
  })

  it('vline inside time range is in view', () => {
    const v: VLineDraw = { ...baseDraw(), id: 'd3', kind: 'vline', time: 1500 }
    expect(drawingInView(v, ...vp)).toBe(true)
  })

  it('vline outside time range is not in view', () => {
    const v: VLineDraw = { ...baseDraw(), id: 'd4', kind: 'vline', time: 3000 }
    expect(drawingInView(v, ...vp)).toBe(false)
  })

  it('line with one anchor in view is in view', () => {
    const l: LineDraw = {
      ...baseDraw(), id: 'd5', kind: 'line', extend: false,
      a: anchor(1500, 150),  // in view
      b: anchor(3000, 300),  // out of view
    }
    expect(drawingInView(l, ...vp)).toBe(true)
  })

  it('line with both anchors out of view is not in view', () => {
    const l: LineDraw = {
      ...baseDraw(), id: 'd6', kind: 'line', extend: false,
      a: anchor(3000, 300),
      b: anchor(4000, 400),
    }
    expect(drawingInView(l, ...vp)).toBe(false)
  })

  it('annotation anchor in view is in view', () => {
    const a_: AnnotationDraw = {
      ...baseDraw(), id: 'd7', kind: 'annotation',
      anchor: anchor(1500, 150), text: 'note',
    }
    expect(drawingInView(a_, ...vp)).toBe(true)
  })

  it('rect with both anchors out of view is not in view', () => {
    const r: RectDraw = {
      ...baseDraw(), id: 'd8', kind: 'rect', fillOpacity: 0.1,
      topLeft:     anchor(3000, 300),
      bottomRight: anchor(4000, 400),
    }
    expect(drawingInView(r, ...vp)).toBe(false)
  })
})

// ── nextDrawingId ─────────────────────────────────────────────────────────────

describe('nextDrawingId', () => {
  it('returns a non-empty string', () => {
    expect(typeof nextDrawingId()).toBe('string')
    expect(nextDrawingId().length).toBeGreaterThan(0)
  })

  it('returns unique ids on sequential calls', () => {
    const a = nextDrawingId()
    const b = nextDrawingId()
    expect(a).not.toBe(b)
  })
})
