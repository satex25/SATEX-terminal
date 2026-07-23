// @vitest-environment jsdom
/**
 * SATEX — CanvasOverlay characterization suite (P-129 chart-jsdom-harness wave 2).
 *
 * Pins the DPR-aware sizing, the ResizeObserver-driven resync, the
 * self-rescheduling rAF paint loop, the "always call the latest onDraw"
 * stable-closure pattern, and the imperative `redraw()` handle. `2d` canvas
 * context is stubbed via `HTMLCanvasElement.prototype.getContext` (the real
 * <canvas> DOM node stays real so refs/ResizeObserver.observe work normally —
 * unlike export.test.ts, `document.createElement` itself is NOT intercepted
 * here because React creates this element internally). `ResizeObserver` and
 * `requestAnimationFrame`/`cancelAnimationFrame` are stubbed with explicit,
 * controllable doubles (cancel-aware rAF queue, matches the
 * DrawingLayer/CrosshairReadout precedent).
 *
 * Subject `CanvasOverlay.tsx` is READ-ONLY here (byte-unchanged). jsdom env.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, createElement, createRef } from 'react'
import { createRoot } from 'react-dom/client'
import { CanvasOverlay, type CanvasOverlayHandle, type DrawCallback } from './CanvasOverlay'
import type { RefObject } from 'react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

// ── Cancel-aware rAF stub ────────────────────────────────────────────────────────
let rafId = 0
let rafCallbacks: Map<number, FrameRequestCallback>
function flushOneFrame() {
  const cbs = [...rafCallbacks.values()]
  rafCallbacks.clear()
  act(() => { cbs.forEach(cb => cb(0)) })
}

// ── Controllable ResizeObserver double ───────────────────────────────────────────
class MockResizeObserver {
  static instances: MockResizeObserver[] = []
  disconnected = false
  observed: Element[] = []
  constructor(public cb: ResizeObserverCallback) { MockResizeObserver.instances.push(this) }
  observe(el: Element) { this.observed.push(el) }
  unobserve() {}
  disconnect() { this.disconnected = true }
}

// ── 2D context stub (real <canvas> element, fake context) ────────────────────────
function makeCtx() {
  return { clearRect: vi.fn(), save: vi.fn(), restore: vi.fn(), scale: vi.fn() }
}

beforeEach(() => {
  rafId = 0
  rafCallbacks = new Map()
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { const id = ++rafId; rafCallbacks.set(id, cb); return id })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { rafCallbacks.delete(id) })
  MockResizeObserver.instances = []
  vi.stubGlobal('ResizeObserver', MockResizeObserver)
  Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function makeContainer(clientWidth: number, clientHeight: number): RefObject<HTMLElement | null> {
  const el = document.createElement('div')
  Object.defineProperty(el, 'clientWidth', { value: clientWidth, configurable: true })
  Object.defineProperty(el, 'clientHeight', { value: clientHeight, configurable: true })
  return { current: el }
}

function mount(props: {
  containerRef: RefObject<HTMLElement | null>
  onDraw: DrawCallback
  zIndex?: number
  enabled?: boolean
  pointerEvents?: 'none' | 'auto'
}) {
  const container = document.createElement('div')
  const root = createRoot(container)
  const ref = createRef<CanvasOverlayHandle>()
  act(() => { root.render(createElement(CanvasOverlay, { ...props, ref })) })
  const canvas = container.querySelector('canvas')!
  return {
    container, ref, canvas,
    rerender: (next: typeof props) => act(() => { root.render(createElement(CanvasOverlay, { ...next, ref })) }),
    unmount: () => act(() => { root.unmount() }),
  }
}

describe('CanvasOverlay — render output', () => {
  it('renders a single absolutely-positioned, pointer-transparent canvas with defaults', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(makeCtx() as unknown as CanvasRenderingContext2D)
    const h = mount({ containerRef: makeContainer(100, 50), onDraw: vi.fn() })
    expect(h.canvas.style.position).toBe('absolute')
    expect(h.canvas.style.pointerEvents).toBe('none')
    expect(h.canvas.style.zIndex).toBe('10')
    expect(h.canvas.getAttribute('aria-hidden')).toBe('true')
    h.unmount()
  })

  it('honours custom zIndex and pointerEvents', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(makeCtx() as unknown as CanvasRenderingContext2D)
    const h = mount({ containerRef: makeContainer(100, 50), onDraw: vi.fn(), zIndex: 42, pointerEvents: 'auto' })
    expect(h.canvas.style.zIndex).toBe('42')
    expect(h.canvas.style.pointerEvents).toBe('auto')
    h.unmount()
  })
})

describe('CanvasOverlay — enabled=false: no side effects', () => {
  it('constructs no ResizeObserver and schedules no rAF frame when disabled', () => {
    const h = mount({ containerRef: makeContainer(100, 50), onDraw: vi.fn(), enabled: false })
    expect(MockResizeObserver.instances.length).toBe(0)
    expect(rafCallbacks.size).toBe(0)
    h.unmount()
  })

  it('imperative redraw() is a no-op when disabled', () => {
    const onDraw = vi.fn()
    const h = mount({ containerRef: makeContainer(100, 50), onDraw, enabled: false })
    act(() => { h.ref.current!.redraw() })
    expect(onDraw).not.toHaveBeenCalled()
    h.unmount()
  })
})

describe('CanvasOverlay — mount: sizing + ResizeObserver + rAF loop', () => {
  it('sizes the canvas to container*dpr and observes the container for resize', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(makeCtx() as unknown as CanvasRenderingContext2D)
    Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true })
    const containerRef = makeContainer(200, 100)
    const h = mount({ containerRef, onDraw: vi.fn() })
    expect(h.canvas.width).toBe(400)
    expect(h.canvas.height).toBe(200)
    expect(h.canvas.style.width).toBe('200px')
    expect(h.canvas.style.height).toBe('100px')
    expect(MockResizeObserver.instances.length).toBe(1)
    expect(MockResizeObserver.instances[0]!.observed).toEqual([containerRef.current])
    h.unmount()
  })

  it('does nothing (no crash, no observer) when getContext(2d) returns null', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    const h = mount({ containerRef: makeContainer(100, 50), onDraw: vi.fn() })
    expect(MockResizeObserver.instances.length).toBe(0)
    expect(rafCallbacks.size).toBe(0)
    h.unmount()
  })

  it('re-syncs size when the ResizeObserver callback fires', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(makeCtx() as unknown as CanvasRenderingContext2D)
    const containerRef = makeContainer(100, 50)
    const h = mount({ containerRef, onDraw: vi.fn() })
    Object.defineProperty(containerRef.current!, 'clientWidth', { value: 300, configurable: true })
    Object.defineProperty(containerRef.current!, 'clientHeight', { value: 150, configurable: true })
    act(() => { MockResizeObserver.instances[0]!.cb([] as unknown as ResizeObserverEntry[], MockResizeObserver.instances[0]! as unknown as ResizeObserver) })
    expect(h.canvas.width).toBe(300)
    expect(h.canvas.height).toBe(150)
    h.unmount()
  })

  it('the paint loop clears + scales by dpr + calls onDraw + reschedules', () => {
    const ctx = makeCtx()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
    Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true })
    const onDraw = vi.fn()
    const h = mount({ containerRef: makeContainer(200, 100), onDraw })
    // jsdom does no layout: the frame loop reads clientWidth/Height off the
    // <canvas> itself (post-CSS-sizing), so pin what a real browser would report.
    Object.defineProperty(h.canvas, 'clientWidth', { value: 200, configurable: true })
    Object.defineProperty(h.canvas, 'clientHeight', { value: 100, configurable: true })
    expect(rafCallbacks.size).toBe(1)
    flushOneFrame()
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, h.canvas.width, h.canvas.height)
    expect(ctx.save).toHaveBeenCalledTimes(1)
    expect(ctx.scale).toHaveBeenCalledWith(2, 2)
    expect(onDraw).toHaveBeenCalledWith(ctx, 200, 100, 2)
    expect(ctx.restore).toHaveBeenCalledTimes(1)
    expect(rafCallbacks.size).toBe(1) // frame rescheduled itself
    h.unmount()
  })

  it('always calls the LATEST onDraw prop without re-running the mount effect (stable-closure pattern)', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(makeCtx() as unknown as CanvasRenderingContext2D)
    const containerRef = makeContainer(100, 50)
    const onDrawA = vi.fn()
    const onDrawB = vi.fn()
    const h = mount({ containerRef, onDraw: onDrawA })
    expect(MockResizeObserver.instances.length).toBe(1)
    h.rerender({ containerRef, onDraw: onDrawB })
    expect(MockResizeObserver.instances.length).toBe(1) // mount effect did NOT re-run
    flushOneFrame()
    expect(onDrawA).not.toHaveBeenCalled()
    expect(onDrawB).toHaveBeenCalledTimes(1)
    h.unmount()
  })
})

describe('CanvasOverlay — cleanup', () => {
  it('disconnects the observer and cancels the pending frame on unmount', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(makeCtx() as unknown as CanvasRenderingContext2D)
    const h = mount({ containerRef: makeContainer(100, 50), onDraw: vi.fn() })
    const observer = MockResizeObserver.instances[0]!
    expect(rafCallbacks.size).toBe(1)
    h.unmount()
    expect(observer.disconnected).toBe(true)
    expect(rafCallbacks.size).toBe(0)
  })
})

describe('CanvasOverlay — imperative redraw()', () => {
  it('performs an immediate clear+scale+draw+restore outside the rAF loop', () => {
    const ctx = makeCtx()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
    Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true })
    const onDraw = vi.fn()
    const h = mount({ containerRef: makeContainer(80, 40), onDraw })
    onDraw.mockClear() // drop any mount-time loop calls we haven't flushed anyway
    act(() => { h.ref.current!.redraw() })
    expect(ctx.clearRect).toHaveBeenCalled()
    expect(onDraw).toHaveBeenCalledTimes(1)
    expect(ctx.restore).toHaveBeenCalled()
    h.unmount()
  })

  it('exposes the live canvas element on the handle', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(makeCtx() as unknown as CanvasRenderingContext2D)
    const h = mount({ containerRef: makeContainer(80, 40), onDraw: vi.fn() })
    expect(h.ref.current!.canvas).toBe(h.canvas)
    h.unmount()
  })
})
