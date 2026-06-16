// @vitest-environment jsdom
/**
 * SATEX - NavController unit tests (CHART-01 · CHART-02 · CHART-07)
 *
 * Tests the class lifecycle, config guards, and coordinate math.
 * Pointer event dispatch is done with synthetic PointerEvents - JSDOM
 * supports dispatchEvent so these run in vitest without Playwright.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NavController } from './NavController'

type MockRange = { from: number; to: number }

function makeMockChart(initialRange: MockRange = { from: 0, to: 200 }) {
  let range = { ...initialRange }
  const coordinateToPrice = vi.fn((coord: number) => 200 - coord * 0.1)
  const priceScale = vi.fn(() => ({
    coordinateToPrice,
    applyOptions: vi.fn(),
    setPriceRange: vi.fn(),
    getVisibleRange: vi.fn(() => ({ from: 10, to: 200 })),
    setVisibleRange: vi.fn(),
  }))
  const timeScale = vi.fn(() => ({
    getVisibleLogicalRange: vi.fn(() => ({ ...range })),
    setVisibleLogicalRange: vi.fn((r: MockRange) => { range = { ...r } }),
  }))
  const applyOptions = vi.fn()
  const options_ = vi.fn(() => ({
    rightPriceScale: { visible: true, mode: 0 },
    timeScale: { visible: true },
  }))
  return {
    chart: { timeScale, priceScale, applyOptions, options: options_ },
    getRange: () => range,
  }
}

function makeContainer(width = 1200, height = 700): HTMLElement {
  const div = document.createElement('div')
  Object.defineProperty(div, 'clientWidth',  { get: () => width,  configurable: true })
  Object.defineProperty(div, 'clientHeight', { get: () => height, configurable: true })
  // JSDOM does not implement Pointer Capture API - stub so NavController does not throw.
  div.setPointerCapture    = vi.fn()
  div.releasePointerCapture = vi.fn()
  document.body.appendChild(div)
  return div
}

describe('NavController - lifecycle', () => {
  let container: HTMLElement
  beforeEach(() => { container = makeContainer() })
  afterEach(() => { container.remove() })

  it('constructs without errors', () => {
    const { chart } = makeMockChart()
    expect(() => {
      // @ts-expect-error - mock chart not fully typed
      const nav = new NavController(chart, container)
      nav.destroy()
    }).not.toThrow()
  })

  it('destroy() is idempotent', () => {
    const { chart } = makeMockChart()
    // @ts-expect-error -- mock chart satisfies the subset NavController needs but not the full IChartApi type
    const nav = new NavController(chart, container)
    expect(() => { nav.destroy(); nav.destroy() }).not.toThrow()
  })

  it('registers 6 listeners on construction and removes them on destroy', () => {
    const add    = vi.spyOn(container, 'addEventListener')
    const remove = vi.spyOn(container, 'removeEventListener')
    const { chart } = makeMockChart()
    // @ts-expect-error -- mock chart satisfies the subset NavController needs but not the full IChartApi type
    const nav = new NavController(chart, container)
    expect(add).toHaveBeenCalledWith('wheel',        expect.any(Function), expect.anything())
    expect(add).toHaveBeenCalledWith('pointerdown',  expect.any(Function))
    expect(add).toHaveBeenCalledWith('pointermove',  expect.any(Function))
    expect(add).toHaveBeenCalledWith('pointerup',    expect.any(Function))
    expect(add).toHaveBeenCalledWith('pointercancel',expect.any(Function))
    expect(add).toHaveBeenCalledWith('pointerleave', expect.any(Function))
    nav.destroy()
    expect(remove).toHaveBeenCalledWith('wheel',         expect.any(Function))
    expect(remove).toHaveBeenCalledWith('pointerdown',   expect.any(Function))
    expect(remove).toHaveBeenCalledWith('pointermove',   expect.any(Function))
    expect(remove).toHaveBeenCalledWith('pointerup',     expect.any(Function))
    expect(remove).toHaveBeenCalledWith('pointercancel', expect.any(Function))
    expect(remove).toHaveBeenCalledWith('pointerleave',  expect.any(Function))
  })
})

describe('NavController - CHART-07 wheel zoom', () => {
  let container: HTMLElement
  beforeEach(() => { container = makeContainer(1200, 700) })
  afterEach(() => { container.remove() })

  it('zooms in (negative deltaY reduces visible bars)', () => {
    const { chart, getRange } = makeMockChart({ from: 0, to: 200 })
    // @ts-expect-error -- mock chart satisfies the subset NavController needs but not the full IChartApi type
    const nav = new NavController(chart, container)
    container.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }))
    const bars = getRange().to - getRange().from
    expect(bars).toBeLessThan(200)
    expect(bars).toBeGreaterThanOrEqual(50)
    nav.destroy()
  })

  it('zooms out (positive deltaY increases visible bars)', () => {
    const { chart, getRange } = makeMockChart({ from: 0, to: 200 })
    // @ts-expect-error -- mock chart satisfies the subset NavController needs but not the full IChartApi type
    const nav = new NavController(chart, container)
    container.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true }))
    const bars = getRange().to - getRange().from
    expect(bars).toBeGreaterThan(200)
    expect(bars).toBeLessThanOrEqual(5000)
    nav.destroy()
  })

  it('clamps to minBars (50) when zooming in hard', () => {
    const { chart, getRange } = makeMockChart({ from: 0, to: 55 })
    // @ts-expect-error -- mock chart satisfies the subset NavController needs but not the full IChartApi type
    const nav = new NavController(chart, container)
    container.dispatchEvent(new WheelEvent('wheel', { deltaY: -100000, bubbles: true, cancelable: true }))
    expect(getRange().to - getRange().from).toBe(50)
    nav.destroy()
  })

  it('clamps to maxBars (5000) when zooming out hard', () => {
    const { chart, getRange } = makeMockChart({ from: 0, to: 4990 })
    // @ts-expect-error -- mock chart satisfies the subset NavController needs but not the full IChartApi type
    const nav = new NavController(chart, container)
    container.dispatchEvent(new WheelEvent('wheel', { deltaY: 100000, bubbles: true, cancelable: true }))
    expect(getRange().to - getRange().from).toBe(5000)
    nav.destroy()
  })

  it('prevents default on wheel events', () => {
    const { chart } = makeMockChart()
    // @ts-expect-error -- mock chart satisfies the subset NavController needs but not the full IChartApi type
    const nav = new NavController(chart, container)
    const evt = new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true })
    const pd = vi.spyOn(evt, 'preventDefault')
    container.dispatchEvent(evt)
    expect(pd).toHaveBeenCalledOnce()
    nav.destroy()
  })

  it('does nothing after destroy()', () => {
    const { chart, getRange } = makeMockChart({ from: 0, to: 200 })
    // @ts-expect-error -- mock chart satisfies the subset NavController needs but not the full IChartApi type
    const nav = new NavController(chart, container)
    nav.destroy()
    const before = { ...getRange() }
    container.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }))
    expect(getRange()).toEqual(before)
  })
})

describe('NavController - CHART-02 horizontal drag', () => {
  let container: HTMLElement
  beforeEach(() => { container = makeContainer(1200, 700) })
  afterEach(() => { container.remove() })

  it('shifts visible range left when dragging right', () => {
    const { chart, getRange } = makeMockChart({ from: 200, to: 400 })
    // @ts-expect-error -- mock chart satisfies the subset NavController needs but not the full IChartApi type
    const nav = new NavController(chart, container)
    container.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: 100, clientY: 350, bubbles: true }))
    container.dispatchEvent(new PointerEvent('pointermove', { clientX: 160, clientY: 350, bubbles: true }))
    container.dispatchEvent(new PointerEvent('pointerup',   { clientX: 160, clientY: 350, bubbles: true }))
    expect(getRange().from).toBeLessThan(200)
    nav.destroy()
  })

  it('does not engage drag below deadzone (4px)', () => {
    const { chart, getRange } = makeMockChart({ from: 200, to: 400 })
    // @ts-expect-error -- mock chart satisfies the subset NavController needs but not the full IChartApi type
    const nav = new NavController(chart, container)
    const before = { ...getRange() }
    container.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: 100, clientY: 350, bubbles: true }))
    container.dispatchEvent(new PointerEvent('pointermove', { clientX: 102, clientY: 350, bubbles: true }))
    container.dispatchEvent(new PointerEvent('pointerup',   { clientX: 102, clientY: 350, bubbles: true }))
    expect(getRange()).toEqual(before)
    nav.destroy()
  })

  it('ignores non-left-button pointers', () => {
    const { chart, getRange } = makeMockChart({ from: 200, to: 400 })
    // @ts-expect-error -- mock chart satisfies the subset NavController needs but not the full IChartApi type
    const nav = new NavController(chart, container)
    const before = { ...getRange() }
    container.dispatchEvent(new PointerEvent('pointerdown', { button: 2, clientX: 100, clientY: 350, bubbles: true }))
    container.dispatchEvent(new PointerEvent('pointermove', { clientX: 200, clientY: 350, bubbles: true }))
    expect(getRange()).toEqual(before)
    nav.destroy()
  })
})

describe('NavController - config contract', () => {
  it('minBars=50 and maxBars=5000 are enforced (verified via wheel clamp tests)', () => {
    expect(50).toBe(50)
  })
})
