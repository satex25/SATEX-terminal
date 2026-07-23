// @vitest-environment jsdom
/**
 * SATEX — CrosshairReadout characterization suite (P-129 chart-jsdom-harness wave 2).
 *
 * Pins the crosshair-move handler branches (no-time clear, string/number
 * time coercion, non-finite guard, empty-candles clear), the nearest-candle
 * binary search, the rAF commit throttle (a rapid second move cancels the
 * first's pending commit), and the OHLCV strip render incl. pos/neg styling.
 * `requestAnimationFrame`/`cancelAnimationFrame` are stubbed with an
 * explicit, cancel-aware queue (matches the DrawingLayer.test.tsx precedent).
 * `fmt` is the real formatter (deterministic, not mocked).
 *
 * Subject `CrosshairReadout.tsx` is READ-ONLY here (byte-unchanged). jsdom env.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { CrosshairReadout } from './CrosshairReadout'
import type { Candle } from '@shared/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

// ── Cancel-aware rAF stub ────────────────────────────────────────────────────────
let rafId = 0
let rafCallbacks: Map<number, FrameRequestCallback>
function flushRaf() {
  const cbs = [...rafCallbacks.values()]
  rafCallbacks.clear()
  act(() => { cbs.forEach(cb => cb(0)) })
}

beforeEach(() => {
  rafId = 0
  rafCallbacks = new Map()
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { const id = ++rafId; rafCallbacks.set(id, cb); return id })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { rafCallbacks.delete(id) })
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

function makeChart() {
  return { subscribeCrosshairMove: vi.fn(), unsubscribeCrosshairMove: vi.fn() }
}

function mount(chart: unknown, candles: readonly Candle[], dp?: number) {
  const container = document.createElement('div')
  const root = createRoot(container)
  act(() => { root.render(createElement(CrosshairReadout, { chart, candles, dp })) })
  return {
    container,
    rerender: (nextCandles: readonly Candle[]) => act(() => { root.render(createElement(CrosshairReadout, { chart, candles: nextCandles, dp })) }),
    unmount: () => act(() => { root.unmount() }),
  }
}

const CANDLES: Candle[] = [
  { time: 100, open: 10, high: 12, low: 9, close: 11, volume: 1000 },
  { time: 200, open: 20, high: 25, low: 18, close: 15, volume: 25000 }, // negative bar (close<open)
  { time: 300, open: 30, high: 35, low: 28, close: 33, volume: 300 },
]

describe('CrosshairReadout — subscription lifecycle', () => {
  it('does not subscribe and renders nothing when chart is null', () => {
    const h = mount(null, CANDLES)
    expect(h.container.innerHTML).toBe('')
    h.unmount()
  })

  it('subscribes exactly once on mount, unsubscribes on unmount', () => {
    const chart = makeChart()
    const h = mount(chart, CANDLES)
    expect(chart.subscribeCrosshairMove).toHaveBeenCalledTimes(1)
    h.unmount()
    expect(chart.unsubscribeCrosshairMove).toHaveBeenCalledWith(chart.subscribeCrosshairMove.mock.calls[0]![0])
  })

  it('cancels a pending rAF and does not throw if unsubscribe itself throws (disposed chart)', () => {
    const chart = { subscribeCrosshairMove: vi.fn(), unsubscribeCrosshairMove: vi.fn(() => { throw new Error('disposed') }) }
    const h = mount(chart, CANDLES)
    const handler = chart.subscribeCrosshairMove.mock.calls[0]![0] as (p: { time?: number }) => void
    act(() => { handler({ time: 100 }) }) // schedule a pending commit, never flushed
    expect(() => h.unmount()).not.toThrow()
  })

  it('re-subscribes with a fresh handler when the candles array reference changes', () => {
    const chart = makeChart()
    const h = mount(chart, CANDLES)
    const first = chart.subscribeCrosshairMove.mock.calls[0]![0]
    h.rerender([...CANDLES])
    expect(chart.unsubscribeCrosshairMove).toHaveBeenCalledWith(first)
    expect(chart.subscribeCrosshairMove).toHaveBeenCalledTimes(2)
    h.unmount()
  })
})

describe('CrosshairReadout — handler branches', () => {
  it('clears the readout when time is absent (crosshair left the chart)', () => {
    const chart = makeChart()
    const h = mount(chart, CANDLES)
    const handler = chart.subscribeCrosshairMove.mock.calls[0]![0] as (p: { time?: number }) => void
    act(() => { handler({ time: 100 }) })
    flushRaf()
    expect(h.container.querySelector('.chart-crosshair-readout')).not.toBeNull()
    act(() => { handler({}) })
    flushRaf()
    expect(h.container.querySelector('.chart-crosshair-readout')).toBeNull()
    h.unmount()
  })

  it('time: 0 is a valid bar time, not treated as "left the chart"', () => {
    const chart = makeChart()
    const zeroCandles: Candle[] = [{ time: 0, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 }]
    const h = mount(chart, zeroCandles)
    const handler = chart.subscribeCrosshairMove.mock.calls[0]![0] as (p: { time?: number | string }) => void
    act(() => { handler({ time: 0 }) })
    flushRaf()
    expect(h.container.querySelector('.chart-crosshair-readout')).not.toBeNull()
    h.unmount()
  })

  it('coerces a string time to a number before the nearest-candle lookup', () => {
    const chart = makeChart()
    const h = mount(chart, CANDLES)
    const handler = chart.subscribeCrosshairMove.mock.calls[0]![0] as (p: { time?: number | string }) => void
    act(() => { handler({ time: '200' }) })
    flushRaf()
    expect(h.container.querySelector('.cr-item b')!.textContent).toBe(fmtExpect(20))
    h.unmount()
  })

  it('clears the readout when the coerced time is non-finite', () => {
    const chart = makeChart()
    const h = mount(chart, CANDLES)
    const handler = chart.subscribeCrosshairMove.mock.calls[0]![0] as (p: { time?: number | string }) => void
    act(() => { handler({ time: 'not-a-number' }) })
    flushRaf()
    expect(h.container.querySelector('.chart-crosshair-readout')).toBeNull()
    h.unmount()
  })

  it('clears the readout when candles is empty (nearestCandle returns null)', () => {
    const chart = makeChart()
    const h = mount(chart, [])
    const handler = chart.subscribeCrosshairMove.mock.calls[0]![0] as (p: { time?: number }) => void
    act(() => { handler({ time: 100 }) })
    flushRaf()
    expect(h.container.querySelector('.chart-crosshair-readout')).toBeNull()
    h.unmount()
  })
})

function fmtExpect(v: number, dp = 2): string {
  return v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })
}

describe('CrosshairReadout — nearest-candle + render', () => {
  it('renders the exact-match candle OHLCV with correct formatting', () => {
    const chart = makeChart()
    const h = mount(chart, CANDLES)
    const handler = chart.subscribeCrosshairMove.mock.calls[0]![0] as (p: { time?: number }) => void
    act(() => { handler({ time: 100 }) })
    flushRaf()
    const text = h.container.querySelector('.chart-crosshair-readout')!.textContent!
    expect(text).toContain(fmtExpect(10)) // open
    expect(text).toContain(fmtExpect(12)) // high
    expect(text).toContain(fmtExpect(9))  // low
    expect(text).toContain(fmtExpect(11)) // close
    expect(text).toContain('1.0K')        // volume via fmt.k
    h.unmount()
  })

  it('picks the closer neighbour when time falls between two candles', () => {
    const chart = makeChart()
    const h = mount(chart, CANDLES)
    const handler = chart.subscribeCrosshairMove.mock.calls[0]![0] as (p: { time?: number }) => void
    act(() => { handler({ time: 120 }) }) // 20 from t=100, 80 from t=200 -> nearest is t=100
    flushRaf()
    expect(h.container.querySelector('.cr-item b')!.textContent).toBe(fmtExpect(10))
    h.unmount()
  })

  it('positive bar: cr-pos class, "+" prefix on change/changePct', () => {
    const chart = makeChart()
    const h = mount(chart, CANDLES)
    const handler = chart.subscribeCrosshairMove.mock.calls[0]![0] as (p: { time?: number }) => void
    act(() => { handler({ time: 100 }) }) // open 10, close 11 -> +1 (+10.00%)
    flushRaf()
    const closeEl = h.container.querySelector('.cr-item:nth-of-type(4) b')!
    expect(closeEl.className).toBe('cr-pos')
    const deltaEl = h.container.querySelector('.cr-delta b')!
    expect(deltaEl.textContent).toBe(`+${fmtExpect(1)} (+10.00%)`)
    h.unmount()
  })

  it('negative bar: cr-neg class, no "+" prefix', () => {
    const chart = makeChart()
    const h = mount(chart, CANDLES)
    const handler = chart.subscribeCrosshairMove.mock.calls[0]![0] as (p: { time?: number }) => void
    act(() => { handler({ time: 200 }) }) // open 20, close 15 -> -5 (-25.00%)
    flushRaf()
    const closeEl = h.container.querySelector('.cr-item:nth-of-type(4) b')!
    expect(closeEl.className).toBe('cr-neg')
    const deltaEl = h.container.querySelector('.cr-delta b')!
    expect(deltaEl.textContent).toBe(`${fmtExpect(-5)} (-25.00%)`)
    h.unmount()
  })

  it('changePct is 0 (not NaN/Infinity) when the bar opened at exactly 0', () => {
    const chart = makeChart()
    const zeroOpen: Candle[] = [{ time: 5, open: 0, high: 1, low: 0, close: 0.5, volume: 1 }]
    const h = mount(chart, zeroOpen)
    const handler = chart.subscribeCrosshairMove.mock.calls[0]![0] as (p: { time?: number }) => void
    act(() => { handler({ time: 5 }) })
    flushRaf()
    const deltaEl = h.container.querySelector('.cr-delta b')!
    expect(deltaEl.textContent).toBe(`+${fmtExpect(0.5)} (+0.00%)`)
    h.unmount()
  })

  it('honours a custom dp for price formatting', () => {
    const chart = makeChart()
    const h = mount(chart, CANDLES, 4)
    const handler = chart.subscribeCrosshairMove.mock.calls[0]![0] as (p: { time?: number }) => void
    act(() => { handler({ time: 100 }) })
    flushRaf()
    expect(h.container.querySelector('.cr-item b')!.textContent).toBe(fmtExpect(10, 4))
    h.unmount()
  })

  it('a rapid second move before the frame commits cancels the first, only the latest renders', () => {
    const chart = makeChart()
    const h = mount(chart, CANDLES)
    const handler = chart.subscribeCrosshairMove.mock.calls[0]![0] as (p: { time?: number }) => void
    act(() => { handler({ time: 100 }) }) // schedules commit A (open 10)
    expect(rafCallbacks.size).toBe(1)
    act(() => { handler({ time: 300 }) }) // cancels A, schedules commit B (open 30)
    expect(rafCallbacks.size).toBe(1)
    flushRaf()
    expect(h.container.querySelector('.cr-item b')!.textContent).toBe(fmtExpect(30))
    h.unmount()
  })
})
