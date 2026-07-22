/**
 * SATEX — drawing-renderer characterization suite (P-129 chart-jsdom-harness wave 1).
 *
 * Pins the pure canvas `renderDrawing` switch against a mock CanvasRenderingContext2D.
 * No jsdom needed — the subject is a pure function; a spy-object ctx + identity
 * ViewportTransform make the expected pixel math trivial to hand-verify.
 *
 * Subject `drawing-renderer.ts` is READ-ONLY here (byte-unchanged). Node env.
 */
import { describe, it, expect, vi } from 'vitest'
import { renderDrawing } from './drawing-renderer'
import { fibLevels } from './DrawingModel'
import type {
  LineDraw, HLineDraw, VLineDraw, RectDraw, FibDraw, AnnotationDraw,
} from './DrawingModel'
import type { ViewportTransform } from '../overlay/ViewportTransform'

// ── Mock ctx: spy methods + assignment-logging accessor props ──────────────────
function makeCtx() {
  const alphaLog: number[] = []
  let alpha = 1
  const ctx = {
    beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
    fillText: vi.fn(), fillRect: vi.fn(), strokeRect: vi.fn(), arc: vi.fn(),
    fill: vi.fn(), save: vi.fn(), restore: vi.fn(),
    strokeStyle: '', fillStyle: '', lineWidth: 0, font: '',
    alphaLog,
  } as Record<string, unknown>
  Object.defineProperty(ctx, 'globalAlpha', {
    get() { return alpha },
    set(v: number) { alpha = v; alphaLog.push(v) },
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ctx as any
}

// Identity transform: timeToX(t)=t, priceToY(p)=p — expected coords == raw anchor values.
function makeTransform(over: Partial<ViewportTransform> = {}): ViewportTransform {
  return {
    timeToX: (t: number) => t,
    priceToY: (p: number) => p,
    yToPrice: (y: number) => y,
    xToTime: (x: number) => x,
    rect: { left: 0, top: 0, width: 800, height: 600 },
    isLog: false,
    ...over,
  }
}

const BASE = { symbol: 'BTCUSD', selected: false, locked: false } as const

function lineCoords(ctx: ReturnType<typeof makeCtx>): number[] {
  return [...ctx.moveTo.mock.calls, ...ctx.lineTo.mock.calls].flat() as number[]
}

describe('renderDrawing — common frame (save/restore, color, lineWidth)', () => {
  const hline: HLineDraw = { ...BASE, id: 'h1', kind: 'hline', color: '#123456', lineWidth: 2, price: 100 }

  it('balances save/restore exactly once each', () => {
    const ctx = makeCtx()
    renderDrawing(ctx, hline, makeTransform(), 1, '#accent')
    expect(ctx.save).toHaveBeenCalledTimes(1)
    expect(ctx.restore).toHaveBeenCalledTimes(1)
  })

  it('unselected uses drawing.color and scales lineWidth by dpr', () => {
    const ctx = makeCtx()
    renderDrawing(ctx, hline, makeTransform(), 2, '#accent')
    expect(ctx.strokeStyle).toBe('#123456')
    expect(ctx.fillStyle).toBe('#123456')
    expect(ctx.lineWidth).toBe(4) // (lineWidth 2) * (dpr 2)
  })

  it('falls back to DEFAULT_COLOR when color is undefined', () => {
    const ctx = makeCtx()
    renderDrawing(ctx, { ...hline, color: undefined }, makeTransform(), 1, '#accent')
    expect(ctx.strokeStyle).toBe('#e0e0e0')
  })

  it('selected uses the accent color, ignoring drawing.color', () => {
    const ctx = makeCtx()
    renderDrawing(ctx, { ...hline, selected: true }, makeTransform(), 1, '#ff0')
    expect(ctx.strokeStyle).toBe('#ff0')
    expect(ctx.fillStyle).toBe('#ff0')
  })

  it('defaults lineWidth to 1 when unset, scaled by dpr', () => {
    const ctx = makeCtx()
    renderDrawing(ctx, { ...hline, lineWidth: undefined }, makeTransform(), 3, '#accent')
    expect(ctx.lineWidth).toBe(3) // (default 1) * (dpr 3)
  })
})

describe('renderDrawing — line', () => {
  const line: LineDraw = {
    ...BASE, id: 'l1', kind: 'line',
    a: { time: 10, price: 20 }, b: { time: 30, price: 40 }, extend: false,
  }

  it('plain segment draws A→B at dpr-scaled coords', () => {
    const ctx = makeCtx()
    renderDrawing(ctx, line, makeTransform(), 1, '#a')
    expect(ctx.moveTo).toHaveBeenCalledWith(10, 20)
    expect(ctx.lineTo).toHaveBeenCalledWith(30, 40)
    expect(ctx.stroke).toHaveBeenCalledTimes(1)
  })

  it('dpr scales every line coordinate', () => {
    const ctx = makeCtx()
    renderDrawing(ctx, line, makeTransform(), 2, '#a')
    expect(ctx.moveTo).toHaveBeenCalledWith(20, 40)
    expect(ctx.lineTo).toHaveBeenCalledWith(60, 80)
  })

  it('extend (non-vertical) projects the slope to canvas edges x=0..width', () => {
    const ctx = makeCtx()
    // slope = (40-20)/((30-10)||1) = 1; yAt0 = 20 - 1*10 = 10; yAtW = 10 + 1*800 = 810
    renderDrawing(ctx, { ...line, extend: true }, makeTransform(), 1, '#a')
    expect(ctx.moveTo).toHaveBeenCalledWith(0, 10)
    expect(ctx.lineTo).toHaveBeenCalledWith(800, 810)
  })

  it('extend VERTICAL (x1==x2) hits the (x2-x1)||1 guard — no NaN/Infinity coord', () => {
    const ctx = makeCtx()
    const vertical: LineDraw = { ...line, a: { time: 50, price: 20 }, b: { time: 50, price: 40 }, extend: true }
    renderDrawing(ctx, vertical, makeTransform(), 1, '#a')
    const coords = lineCoords(ctx)
    expect(coords.length).toBeGreaterThan(0)
    expect(coords.every(Number.isFinite)).toBe(true) // guard replaces /0 with /1
  })
})

describe('renderDrawing — hline / vline label conditionals', () => {
  it('hline with a label draws the line and the label text', () => {
    const ctx = makeCtx()
    const h: HLineDraw = { ...BASE, id: 'h', kind: 'hline', price: 100, label: 'R1' }
    renderDrawing(ctx, h, makeTransform(), 1, '#a')
    expect(ctx.moveTo).toHaveBeenCalledWith(0, 100)
    expect(ctx.lineTo).toHaveBeenCalledWith(800, 100)
    expect(ctx.fillText).toHaveBeenCalledWith('R1', 4, 97) // 4*dpr, (100-3)*dpr
  })

  it('hline without a label draws no text', () => {
    const ctx = makeCtx()
    renderDrawing(ctx, { ...BASE, id: 'h', kind: 'hline', price: 100 } as HLineDraw, makeTransform(), 1, '#a')
    expect(ctx.fillText).not.toHaveBeenCalled()
  })

  it('vline with a label draws the vertical line and the label', () => {
    const ctx = makeCtx()
    const v: VLineDraw = { ...BASE, id: 'v', kind: 'vline', time: 50, label: 'news' }
    renderDrawing(ctx, v, makeTransform(), 1, '#a')
    expect(ctx.moveTo).toHaveBeenCalledWith(50, 0)
    expect(ctx.lineTo).toHaveBeenCalledWith(50, 600)
    expect(ctx.fillText).toHaveBeenCalledWith('news', 53, 14) // (50+3)*dpr, 14*dpr
  })

  it('vline without a label draws no text', () => {
    const ctx = makeCtx()
    renderDrawing(ctx, { ...BASE, id: 'v', kind: 'vline', time: 50 } as VLineDraw, makeTransform(), 1, '#a')
    expect(ctx.fillText).not.toHaveBeenCalled()
  })
})

describe('renderDrawing — rect', () => {
  it('sets globalAlpha to fillOpacity then restores to 1 (fill then stroke)', () => {
    const ctx = makeCtx()
    const r: RectDraw = {
      ...BASE, id: 'r', kind: 'rect',
      topLeft: { time: 10, price: 200 }, bottomRight: { time: 60, price: 100 }, fillOpacity: 0.3,
    }
    renderDrawing(ctx, r, makeTransform(), 1, '#a')
    expect(ctx.alphaLog).toEqual([0.3, 1])
    expect(ctx.fillRect).toHaveBeenCalledWith(10, 200, 50, -100) // (x1, y1, (x2-x1)*dpr, (y2-y1)*dpr)
    expect(ctx.strokeRect).toHaveBeenCalledWith(10, 200, 50, -100)
  })
})

describe('renderDrawing — fibonacci', () => {
  const fib: FibDraw = {
    ...BASE, id: 'f', kind: 'fibonacci',
    high: { time: 5, price: 110 }, low: { time: 25, price: 100 },
  }

  it('draws one line + one label per fib level, colored by level', () => {
    const ctx = makeCtx()
    const levels = fibLevels(fib)
    expect(levels.length).toBe(7)
    renderDrawing(ctx, fib, makeTransform(), 1, '#a')
    expect(ctx.stroke).toHaveBeenCalledTimes(levels.length)
    expect(ctx.fillText).toHaveBeenCalledTimes(levels.length)
    // levels are price-ascending; final level is 100.0% → FIB_COLORS['100.0%'] = '#888888'
    expect(ctx.strokeStyle).toBe('#888888')
  })

  it('selected fib uses accent for every level', () => {
    const ctx = makeCtx()
    renderDrawing(ctx, { ...fib, selected: true }, makeTransform(), 1, '#ff0')
    expect(ctx.strokeStyle).toBe('#ff0')
    expect(ctx.fillStyle).toBe('#ff0')
  })

  it('degenerate hi==lo yields zero levels → nothing drawn (empty-array guard)', () => {
    const ctx = makeCtx()
    const flat: FibDraw = { ...fib, high: { time: 5, price: 100 }, low: { time: 25, price: 100 } }
    expect(fibLevels(flat)).toEqual([])
    renderDrawing(ctx, flat, makeTransform(), 1, '#a')
    expect(ctx.stroke).not.toHaveBeenCalled()
    expect(ctx.fillText).not.toHaveBeenCalled()
    expect(ctx.save).toHaveBeenCalledTimes(1) // frame still opened/closed
    expect(ctx.restore).toHaveBeenCalledTimes(1)
  })
})

describe('renderDrawing — annotation', () => {
  it('draws an anchor dot (arc+fill) and the text, honoring fontSize default', () => {
    const ctx = makeCtx()
    const a: AnnotationDraw = { ...BASE, id: 'a', kind: 'annotation', anchor: { time: 15, price: 250 }, text: 'hi' }
    renderDrawing(ctx, a, makeTransform(), 1, '#a')
    expect(ctx.arc).toHaveBeenCalledWith(15, 250, 3, 0, Math.PI * 2)
    expect(ctx.fill).toHaveBeenCalledTimes(1)
    expect(ctx.fillText).toHaveBeenCalledWith('hi', 21, 246) // (15+6)*dpr, (250-4)*dpr
    expect(ctx.font).toBe("12px 'JetBrains Mono', monospace") // default fontSize 12 * dpr 1
  })

  it('annotation honors an explicit fontSize scaled by dpr', () => {
    const ctx = makeCtx()
    const a: AnnotationDraw = { ...BASE, id: 'a', kind: 'annotation', anchor: { time: 0, price: 0 }, text: 'x', fontSize: 20 }
    renderDrawing(ctx, a, makeTransform(), 2, '#a')
    expect(ctx.font).toBe("40px 'JetBrains Mono', monospace") // 20 * dpr 2
  })
})
