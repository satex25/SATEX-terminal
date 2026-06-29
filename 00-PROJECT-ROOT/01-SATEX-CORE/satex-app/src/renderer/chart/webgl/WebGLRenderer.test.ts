// @vitest-environment jsdom
/**
 * SATEX — WebGLRenderer base lifecycle tests (CHART-10)
 *
 * Pins the PR #6 "clean up what you create" invariant: the overlay canvas and
 * its context-loss listeners are created on construct and fully torn down on
 * destroy(); the rAF loop is cancellable and destroy-guarded; paint errors never
 * crash the loop; and context loss/restore re-acquires the GL context. JSDOM
 * supplies createElement/dispatchEvent; the WebGL2 context and
 * requestAnimationFrame are stubbed so the loop is driven deterministically.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { WebGLRenderer } from './WebGLRenderer'

interface FakeGL {
  COLOR_BUFFER_BIT: number
  viewport:    ReturnType<typeof vi.fn>
  clearColor:  ReturnType<typeof vi.fn>
  clear:       ReturnType<typeof vi.fn>
  getExtension: ReturnType<typeof vi.fn>
  __lose:      ReturnType<typeof vi.fn>
}

function makeFakeGL(): FakeGL {
  const lose = vi.fn()
  return {
    COLOR_BUFFER_BIT: 0x4000,
    viewport:    vi.fn(),
    clearColor:  vi.fn(),
    clear:       vi.fn(),
    getExtension: vi.fn((name: string) =>
      name === 'WEBGL_lose_context' ? { loseContext: lose } : null,
    ),
    __lose: lose,
  }
}

let rafCb: (() => void) | null
let rafId: number
let rafCalls: number
let cancelled: number[]

beforeEach(() => {
  rafCb = null
  rafId = 0
  rafCalls = 0
  cancelled = []
  vi.stubGlobal('requestAnimationFrame', (cb: () => void): number => {
    rafCb = cb
    rafCalls++
    return ++rafId
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number): void => {
    cancelled.push(id)
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function mountContainer(w = 800, h = 600): HTMLElement {
  const el = document.createElement('div')
  Object.defineProperty(el, 'clientWidth',  { value: w, configurable: true })
  Object.defineProperty(el, 'clientHeight', { value: h, configurable: true })
  document.body.appendChild(el)
  return el
}

function stubGL(gl: FakeGL | null): void {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(gl as never)
}

describe('WebGLRenderer — construction', () => {
  it('creates and positions an overlay canvas inside the container', () => {
    stubGL(makeFakeGL())
    const c = mountContainer()
    const r = new WebGLRenderer(c, { paint: vi.fn() })
    const canvas = r.getCanvas()
    expect(canvas).toBeInstanceOf(HTMLCanvasElement)
    expect(canvas.parentElement).toBe(c)
    expect(canvas.style.position).toBe('absolute')
    expect(canvas.style.zIndex).toBe('15')
    expect(canvas.style.pointerEvents).toBe('none')
    r.destroy()
  })

  it('honors a custom zIndex', () => {
    stubGL(makeFakeGL())
    const c = mountContainer()
    const r = new WebGLRenderer(c, { paint: vi.fn(), zIndex: 42 })
    expect(r.getCanvas().style.zIndex).toBe('42')
    r.destroy()
  })

  it('starts the rAF loop on construct', () => {
    stubGL(makeFakeGL())
    const c = mountContainer()
    const r = new WebGLRenderer(c, { paint: vi.fn() })
    expect(rafCalls).toBe(1)
    expect(rafCb).toBeTypeOf('function')
    r.destroy()
  })
})

describe('WebGLRenderer — frame loop', () => {
  it('invokes paint with the gl context and pixel dims, then reschedules', () => {
    const gl = makeFakeGL()
    stubGL(gl)
    const c = mountContainer(800, 600)
    const paint = vi.fn()
    const r = new WebGLRenderer(c, { paint })
    expect(rafCalls).toBe(1)
    rafCb!()
    expect(gl.viewport).toHaveBeenCalled()
    expect(gl.clear).toHaveBeenCalledWith(gl.COLOR_BUFFER_BIT)
    expect(paint).toHaveBeenCalledWith(gl, 800, 600) // devicePixelRatio falls back to 1
    expect(rafCalls).toBe(2)                          // loop rescheduled itself
    r.destroy()
  })

  it('swallows paint errors so the loop survives and reschedules', () => {
    const gl = makeFakeGL()
    stubGL(gl)
    const c = mountContainer()
    const r = new WebGLRenderer(c, {
      paint: () => { throw new Error('boom') },
    })
    expect(() => rafCb!()).not.toThrow()
    expect(rafCalls).toBe(2)
    r.destroy()
  })

  it('skips paint when no gl context is available', () => {
    stubGL(null)
    const c = mountContainer()
    const paint = vi.fn()
    const r = new WebGLRenderer(c, { paint })
    rafCb!()
    expect(paint).not.toHaveBeenCalled()
    r.destroy()
  })
})

describe('WebGLRenderer — invalidate', () => {
  it('forces a synchronous frame', () => {
    const gl = makeFakeGL()
    stubGL(gl)
    const c = mountContainer()
    const paint = vi.fn()
    const r = new WebGLRenderer(c, { paint })
    r.invalidate()
    expect(paint).toHaveBeenCalledTimes(1)
    r.destroy()
  })

  it('is a no-op after destroy()', () => {
    const gl = makeFakeGL()
    stubGL(gl)
    const c = mountContainer()
    const paint = vi.fn()
    const r = new WebGLRenderer(c, { paint })
    r.destroy()
    paint.mockClear()
    r.invalidate()
    expect(paint).not.toHaveBeenCalled()
  })
})

describe('WebGLRenderer — context loss / restore', () => {
  it('on contextlost: preventDefault, stop painting, cancel the loop', () => {
    const gl = makeFakeGL()
    stubGL(gl)
    const c = mountContainer()
    const paint = vi.fn()
    const r = new WebGLRenderer(c, { paint })
    const ev = new Event('webglcontextlost', { cancelable: true })
    r.getCanvas().dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)
    expect(cancelled.length).toBeGreaterThan(0)
    paint.mockClear()
    rafCb!()                              // a stale tick after loss: gl is null
    expect(paint).not.toHaveBeenCalled()
    r.destroy()
  })

  it('on contextrestored: re-acquires gl, fires onContextRestored, resumes', () => {
    const gl = makeFakeGL()
    stubGL(gl)
    const c = mountContainer()
    const onContextRestored = vi.fn()
    const paint = vi.fn()
    const r = new WebGLRenderer(c, { paint, onContextRestored })
    const canvas = r.getCanvas()
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
    const before = rafCalls
    canvas.dispatchEvent(new Event('webglcontextrestored'))
    expect(onContextRestored).toHaveBeenCalledTimes(1)
    expect(rafCalls).toBeGreaterThan(before) // loop restarted
    rafCb!()
    expect(paint).toHaveBeenCalled()         // painting resumed
    r.destroy()
  })
})

describe('WebGLRenderer — destroy (PR #6 leak invariant)', () => {
  it('removes the canvas, cancels the loop, and frees the GL context', () => {
    const gl = makeFakeGL()
    stubGL(gl)
    const c = mountContainer()
    const r = new WebGLRenderer(c, { paint: vi.fn() })
    const canvas = r.getCanvas()
    r.destroy()
    expect(canvas.parentElement).toBeNull()
    expect(c.contains(canvas)).toBe(false)
    expect(cancelled.length).toBeGreaterThan(0)
    expect(gl.__lose).toHaveBeenCalledTimes(1) // WEBGL_lose_context.loseContext()
  })

  it('removes the context-loss listeners (post-destroy events are inert)', () => {
    const gl = makeFakeGL()
    stubGL(gl)
    const c = mountContainer()
    const onContextRestored = vi.fn()
    const r = new WebGLRenderer(c, { paint: vi.fn(), onContextRestored })
    const canvas = r.getCanvas()
    r.destroy()
    canvas.dispatchEvent(new Event('webglcontextrestored'))
    expect(onContextRestored).not.toHaveBeenCalled()
  })

  it('is idempotent — a second destroy() does not throw', () => {
    stubGL(makeFakeGL())
    const c = mountContainer()
    const r = new WebGLRenderer(c, { paint: vi.fn() })
    r.destroy()
    expect(() => r.destroy()).not.toThrow()
  })

  it('guards the rAF tick after destroy (a stale callback is inert)', () => {
    const gl = makeFakeGL()
    stubGL(gl)
    const c = mountContainer()
    const paint = vi.fn()
    const r = new WebGLRenderer(c, { paint })
    const tick = rafCb!
    r.destroy()
    paint.mockClear()
    const callsBefore = rafCalls
    expect(() => tick()).not.toThrow()
    expect(paint).not.toHaveBeenCalled()  // destroyed guard short-circuits
    expect(rafCalls).toBe(callsBefore)    // did not reschedule
  })
})
