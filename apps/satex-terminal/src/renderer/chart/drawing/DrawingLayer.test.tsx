// @vitest-environment jsdom
/**
 * SATEX — DrawingLayer characterization suite (P-129 chart-jsdom-harness wave 2).
 *
 * Pins the rAF-scheduled frame: viewport-window derivation from the
 * ViewportTransform, frustum culling via the REAL `drawingInView` (not
 * mocked — this is the wiring under test), and the render call-out per
 * in-view drawing. `renderDrawing` (already pinned by drawing-renderer.test.ts,
 * P-130) is mocked at the module boundary so this suite only asserts the
 * wiring, not pixel math. `requestAnimationFrame`/`cancelAnimationFrame` are
 * stubbed with an explicit, cancel-aware queue so scheduling/cancellation can
 * be asserted precisely (no reliance on jsdom's own rAF shim).
 *
 * Subject `DrawingLayer.tsx` is READ-ONLY here (byte-unchanged). jsdom env.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { useDrawingStore } from './drawingStore'
import type { LineDraw, HLineDraw, VLineDraw } from './DrawingModel'
import type { ViewportTransform } from '../overlay/ViewportTransform'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('./drawing-renderer', () => ({ renderDrawing: vi.fn() }))

// Imported AFTER the mock is declared so the module sees the stub.
import { DrawingLayer } from './DrawingLayer'
import { renderDrawing } from './drawing-renderer'

// ── Cancel-aware rAF stub ────────────────────────────────────────────────────────
let rafId = 0
let rafCallbacks: Map<number, FrameRequestCallback>
function flushRaf() {
  const cbs = [...rafCallbacks.values()]
  rafCallbacks.clear()
  act(() => { cbs.forEach(cb => cb(0)) })
}

function renderHook(el: React.ReactElement) {
  const container = document.createElement('div')
  const root = createRoot(container)
  act(() => { root.render(el) })
  return {
    rerender: (next: React.ReactElement) => act(() => { root.render(next) }),
    unmount: () => act(() => { root.unmount() }),
  }
}

// View window: time in [0,100], price in [0,100] (yToPrice inverted like a real chart y-axis).
function makeTransform(): ViewportTransform {
  return {
    timeToX: (t: number) => t,
    priceToY: (p: number) => 100 - p,
    yToPrice: (y: number) => 100 - y,
    xToTime:  (x: number) => x,
    rect: { left: 0, top: 0, width: 100, height: 100 },
    isLog: false,
  }
}

function makeCanvas() {
  const ctx = { clearRect: vi.fn() }
  const canvas = { width: 800, height: 600, getContext: vi.fn(() => ctx) }
  return { canvas: canvas as unknown as HTMLCanvasElement, ctx }
}

const SYMBOL = 'BTCUSD'
const BASE = { symbol: SYMBOL, selected: false, locked: false } as const

const hlineAny: HLineDraw = { ...BASE, id: 'h1', kind: 'hline', price: 9999 } // hline ignores price bounds
const vlineIn: VLineDraw  = { ...BASE, id: 'v1', kind: 'vline', time: 50 }
const vlineOut: VLineDraw = { ...BASE, id: 'v2', kind: 'vline', time: 150 }
const lineIn: LineDraw    = { ...BASE, id: 'l1', kind: 'line', extend: false, a: { time: 10, price: 10 }, b: { time: 200, price: 200 } }
const lineOut: LineDraw   = { ...BASE, id: 'l2', kind: 'line', extend: false, a: { time: 200, price: 200 }, b: { time: 300, price: 300 } }

beforeEach(() => {
  rafId = 0
  rafCallbacks = new Map()
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { const id = ++rafId; rafCallbacks.set(id, cb); return id })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { rafCallbacks.delete(id) })
  Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true })
  useDrawingStore.setState({ drawings: {}, activeTool: 'select', undoSymbol: '', undoStack: [], redoStack: [] })
  vi.mocked(renderDrawing).mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('DrawingLayer — mount guards', () => {
  it('schedules no frame when canvas is null', () => {
    const h = renderHook(createElement(DrawingLayer, { transform: makeTransform(), symbol: SYMBOL, canvas: null }))
    expect(rafCallbacks.size).toBe(0)
    h.unmount()
  })

  it('schedules no frame when transform is null', () => {
    const { canvas } = makeCanvas()
    const h = renderHook(createElement(DrawingLayer, { transform: null, symbol: SYMBOL, canvas }))
    expect(rafCallbacks.size).toBe(0)
    h.unmount()
  })

  it('schedules no frame when getContext(2d) returns null', () => {
    const canvas = { width: 1, height: 1, getContext: vi.fn(() => null) } as unknown as HTMLCanvasElement
    const h = renderHook(createElement(DrawingLayer, { transform: makeTransform(), symbol: SYMBOL, canvas }))
    expect(rafCallbacks.size).toBe(0)
    h.unmount()
  })

  it('renders nothing (null)', () => {
    const { canvas } = makeCanvas()
    const container = document.createElement('div')
    const root = createRoot(container)
    act(() => { root.render(createElement(DrawingLayer, { transform: makeTransform(), symbol: SYMBOL, canvas })) })
    expect(container.innerHTML).toBe('')
    act(() => { root.unmount() })
  })
})

describe('DrawingLayer — frame: clear + frustum-culled render', () => {
  it('clears the full canvas and draws only in-view drawings, out-of-view ones skipped', () => {
    useDrawingStore.setState({ drawings: { [SYMBOL]: [hlineAny, vlineIn, vlineOut, lineIn, lineOut] } })
    const { canvas, ctx } = makeCanvas()
    const h = renderHook(createElement(DrawingLayer, { transform: makeTransform(), symbol: SYMBOL, canvas }))
    flushRaf()
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, canvas.width, canvas.height)
    expect(renderDrawing).toHaveBeenCalledTimes(3) // hlineAny, vlineIn, lineIn — vlineOut/lineOut culled
    const drawn = vi.mocked(renderDrawing).mock.calls.map(c => (c[1] as { id: string }).id)
    expect(drawn).toEqual(['h1', 'v1', 'l1'])
    h.unmount()
  })

  it('passes the transform, dpr, and accentColor through to renderDrawing (default accent)', () => {
    useDrawingStore.setState({ drawings: { [SYMBOL]: [hlineAny] } })
    const { canvas } = makeCanvas()
    Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true })
    const transform = makeTransform()
    const h = renderHook(createElement(DrawingLayer, { transform, symbol: SYMBOL, canvas }))
    flushRaf()
    expect(renderDrawing).toHaveBeenCalledWith(expect.anything(), hlineAny, transform, 2, '#e94b3c')
    h.unmount()
  })

  it('honours a custom accentColor prop', () => {
    useDrawingStore.setState({ drawings: { [SYMBOL]: [hlineAny] } })
    const { canvas } = makeCanvas()
    const h = renderHook(createElement(DrawingLayer, { transform: makeTransform(), symbol: SYMBOL, canvas, accentColor: '#00ff00' }))
    flushRaf()
    expect(renderDrawing).toHaveBeenCalledWith(expect.anything(), hlineAny, expect.anything(), 1, '#00ff00')
    h.unmount()
  })

  it('defaults devicePixelRatio to 1 when unset/falsy', () => {
    useDrawingStore.setState({ drawings: { [SYMBOL]: [hlineAny] } })
    const { canvas } = makeCanvas()
    Object.defineProperty(window, 'devicePixelRatio', { value: 0, configurable: true })
    const h = renderHook(createElement(DrawingLayer, { transform: makeTransform(), symbol: SYMBOL, canvas }))
    flushRaf()
    expect(renderDrawing).toHaveBeenCalledWith(expect.anything(), hlineAny, expect.anything(), 1, expect.anything())
    h.unmount()
  })

  it('only renders drawings for the active symbol', () => {
    useDrawingStore.setState({ drawings: { [SYMBOL]: [hlineAny], OTHER: [vlineIn] } })
    const { canvas } = makeCanvas()
    const h = renderHook(createElement(DrawingLayer, { transform: makeTransform(), symbol: SYMBOL, canvas }))
    flushRaf()
    expect(renderDrawing).toHaveBeenCalledTimes(1)
    h.unmount()
  })
})

describe('DrawingLayer — rAF scheduling + cleanup', () => {
  it('cancels a pending (unflushed) frame when a dep changes before it fires', () => {
    useDrawingStore.setState({ drawings: { [SYMBOL]: [hlineAny] } })
    const { canvas } = makeCanvas()
    const h = renderHook(createElement(DrawingLayer, { transform: makeTransform(), symbol: SYMBOL, canvas }))
    expect(rafCallbacks.size).toBe(1)
    h.rerender(createElement(DrawingLayer, { transform: makeTransform(), symbol: SYMBOL, canvas, accentColor: '#123456' }))
    // the stale frame was cancelled and a fresh one scheduled — still exactly one pending
    expect(rafCallbacks.size).toBe(1)
    flushRaf()
    expect(renderDrawing).toHaveBeenCalledTimes(1) // not 2 — the stale frame never fired
    h.unmount()
  })

  it('cancels the pending frame on unmount', () => {
    useDrawingStore.setState({ drawings: { [SYMBOL]: [hlineAny] } })
    const { canvas } = makeCanvas()
    const h = renderHook(createElement(DrawingLayer, { transform: makeTransform(), symbol: SYMBOL, canvas }))
    expect(rafCallbacks.size).toBe(1)
    h.unmount()
    expect(rafCallbacks.size).toBe(0)
  })
})
