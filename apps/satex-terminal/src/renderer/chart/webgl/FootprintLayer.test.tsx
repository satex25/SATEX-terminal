// @vitest-environment jsdom
/**
 * SATEX — FootprintLayer characterization suite (P-129 chart-jsdom-harness wave 2).
 *
 * Pins the React lifecycle bridge to WebGLRenderer: create-on-mount (guarded
 * by `enabled` + a live container), destroy-on-unmount/dep-change, and the
 * MVP tint `paint` callback. `WebGLRenderer` is mocked at the module boundary
 * (file-scoped, matches auto-update.test.ts precedent) — this suite does not
 * exercise real WebGL.
 *
 * Subject `FootprintLayer.tsx` is READ-ONLY here (byte-unchanged). jsdom env.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { RefObject } from 'react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

const instances: Array<{ host: HTMLElement; opts: Record<string, unknown>; destroy: ReturnType<typeof vi.fn> }> = []

vi.mock('./WebGLRenderer', () => ({
  // Regular function (not arrow) — must be constructible, FootprintLayer calls `new WebGLRenderer(...)`.
  WebGLRenderer: vi.fn().mockImplementation(function (host: HTMLElement, opts: Record<string, unknown>) {
    const inst = { host, opts, destroy: vi.fn() }
    instances.push(inst)
    return inst
  }),
}))

// Imported AFTER the mock is declared so the module sees the stub.
import { FootprintLayer } from './FootprintLayer'
import { WebGLRenderer } from './WebGLRenderer'

function renderHook(el: React.ReactElement) {
  const container = document.createElement('div')
  const root = createRoot(container)
  act(() => { root.render(el) })
  return {
    rerender: (next: React.ReactElement) => act(() => { root.render(next) }),
    unmount: () => act(() => { root.unmount() }),
  }
}

function makeContainerRef(host: HTMLElement | null): RefObject<HTMLElement | null> {
  return { current: host }
}

beforeEach(() => {
  instances.length = 0
  vi.mocked(WebGLRenderer).mockClear()
})
afterEach(() => { vi.restoreAllMocks() })

describe('FootprintLayer — mount guards', () => {
  it('does not construct a renderer when enabled is false', () => {
    const host = document.createElement('div')
    const h = renderHook(createElement(FootprintLayer, { containerRef: makeContainerRef(host), enabled: false }))
    expect(WebGLRenderer).not.toHaveBeenCalled()
    h.unmount()
  })

  it('does not construct a renderer when the container ref is empty', () => {
    const h = renderHook(createElement(FootprintLayer, { containerRef: makeContainerRef(null), enabled: true }))
    expect(WebGLRenderer).not.toHaveBeenCalled()
    h.unmount()
  })

  it('renders nothing (null)', () => {
    const host = document.createElement('div')
    const container = document.createElement('div')
    const root = createRoot(container)
    act(() => { root.render(createElement(FootprintLayer, { containerRef: makeContainerRef(host), enabled: true })) })
    expect(container.innerHTML).toBe('')
    act(() => { root.unmount() })
  })
})

describe('FootprintLayer — create/destroy lifecycle', () => {
  it('constructs exactly one WebGLRenderer against the container host, zIndex 13', () => {
    const host = document.createElement('div')
    const h = renderHook(createElement(FootprintLayer, { containerRef: makeContainerRef(host), enabled: true }))
    expect(WebGLRenderer).toHaveBeenCalledTimes(1)
    expect(instances[0]!.host).toBe(host)
    expect(instances[0]!.opts.zIndex).toBe(13)
    expect(typeof instances[0]!.opts.paint).toBe('function')
    expect(typeof instances[0]!.opts.onContextRestored).toBe('function')
    h.unmount()
  })

  it('destroys the renderer exactly once on unmount', () => {
    const host = document.createElement('div')
    const h = renderHook(createElement(FootprintLayer, { containerRef: makeContainerRef(host), enabled: true }))
    const inst = instances[0]!
    h.unmount()
    expect(inst.destroy).toHaveBeenCalledTimes(1)
  })

  it('tears down and recreates when enabled toggles false -> true', () => {
    const host = document.createElement('div')
    const h = renderHook(createElement(FootprintLayer, { containerRef: makeContainerRef(host), enabled: true }))
    const first = instances[0]!
    h.rerender(createElement(FootprintLayer, { containerRef: makeContainerRef(host), enabled: false }))
    expect(first.destroy).toHaveBeenCalledTimes(1)
    expect(WebGLRenderer).toHaveBeenCalledTimes(1) // still just the one from mount

    h.rerender(createElement(FootprintLayer, { containerRef: makeContainerRef(host), enabled: true }))
    expect(WebGLRenderer).toHaveBeenCalledTimes(2)
    h.unmount()
    expect(instances[1]!.destroy).toHaveBeenCalledTimes(1)
  })

  it('recreates the renderer when the containerRef object identity changes', () => {
    const hostA = document.createElement('div')
    const hostB = document.createElement('div')
    const h = renderHook(createElement(FootprintLayer, { containerRef: makeContainerRef(hostA), enabled: true }))
    h.rerender(createElement(FootprintLayer, { containerRef: makeContainerRef(hostB), enabled: true }))
    expect(WebGLRenderer).toHaveBeenCalledTimes(2)
    expect(instances[0]!.destroy).toHaveBeenCalledTimes(1)
    expect(instances[1]!.host).toBe(hostB)
    h.unmount()
  })
})

describe('FootprintLayer — MVP tint paint callback', () => {
  it('clears the viewport with the translucent neutral tint', () => {
    const host = document.createElement('div')
    const h = renderHook(createElement(FootprintLayer, { containerRef: makeContainerRef(host), enabled: true }))
    const paint = instances[0]!.opts.paint as (gl: unknown, w: number, h: number) => void
    const gl = {
      viewport: vi.fn(), clearColor: vi.fn(), clear: vi.fn(), COLOR_BUFFER_BIT: 16384,
    }
    paint(gl, 400, 300)
    expect(gl.viewport).toHaveBeenCalledWith(0, 0, 400, 300)
    expect(gl.clearColor).toHaveBeenCalledWith(0.05, 0.45, 0.95, 0.04)
    expect(gl.clear).toHaveBeenCalledWith(gl.COLOR_BUFFER_BIT)
    h.unmount()
  })

  it('onContextRestored is a no-arg no-op that does not throw', () => {
    const host = document.createElement('div')
    const h = renderHook(createElement(FootprintLayer, { containerRef: makeContainerRef(host), enabled: true }))
    const onContextRestored = instances[0]!.opts.onContextRestored as () => void
    expect(() => onContextRestored()).not.toThrow()
    h.unmount()
  })
})
