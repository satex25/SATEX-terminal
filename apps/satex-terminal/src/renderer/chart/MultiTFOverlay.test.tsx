// @vitest-environment jsdom
/**
 * SATEX — MultiTFOverlay characterization suite (P-129 chart-jsdom-harness wave 2,
 * closing the program).
 *
 * The heaviest of the wave-2 subjects: mounts a REAL `lightweight-charts`
 * instance and a REAL `NavController`, so both are mocked at the module
 * boundary (file-scoped `vi.mock`, import-after-mock — matches the
 * auto-update.test.ts / FootprintLayer.test.tsx precedent). Pins: secondary
 * chart creation + candlestick series + initial data load, the
 * no-remount candle-refresh effect, the primary->secondary crosshair sync
 * (incl. the close-over-value price-extraction fallback), the
 * ResizeObserver->chart.resize bridge, the shared-Y toggle, and the full
 * four-part cleanup (unsubscribe, NavController.destroy, ResizeObserver
 * .disconnect, chart.remove).
 *
 * Subject `MultiTFOverlay.tsx` is READ-ONLY here (byte-unchanged). jsdom env.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Candle } from '@shared/types'
import type { IChartApi, MouseEventParams } from 'lightweight-charts'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

// ── lightweight-charts module mock ──────────────────────────────────────────────
interface MockChartApi {
  addSeries: ReturnType<typeof vi.fn>
  resize: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
  setCrosshairPosition: ReturnType<typeof vi.fn>
  priceScale: ReturnType<typeof vi.fn>
  _priceScaleApi: { applyOptions: ReturnType<typeof vi.fn>; getVisibleRange: ReturnType<typeof vi.fn> }
  _series: { setData: ReturnType<typeof vi.fn> }
}
const chartInstances: MockChartApi[] = []
function makeChartApi(): MockChartApi {
  const series = { setData: vi.fn() }
  const priceScaleApi = { applyOptions: vi.fn(), getVisibleRange: vi.fn(() => null) }
  const api: MockChartApi = {
    addSeries: vi.fn(() => series),
    resize: vi.fn(),
    remove: vi.fn(),
    setCrosshairPosition: vi.fn(),
    priceScale: vi.fn(() => priceScaleApi),
    _priceScaleApi: priceScaleApi,
    _series: series,
  }
  return api
}

vi.mock('lightweight-charts', () => ({
  createChart: vi.fn(() => {
    const api = makeChartApi()
    chartInstances.push(api)
    return api
  }),
  CandlestickSeries: 'CandlestickSeries-marker',
}))

// ── NavController module mock ───────────────────────────────────────────────────
const navInstances: Array<{ chart: unknown; el: HTMLElement; destroy: ReturnType<typeof vi.fn> }> = []
vi.mock('./nav/NavController', () => ({
  NavController: vi.fn().mockImplementation(function (chart: unknown, el: HTMLElement) {
    const inst = { chart, el, destroy: vi.fn() }
    navInstances.push(inst)
    return inst
  }),
}))

// Imported AFTER the mocks are declared so the module sees the stubs.
import { MultiTFOverlay, type MultiTFOverlayProps } from './MultiTFOverlay'
import { createChart } from 'lightweight-charts'
import { NavController } from './nav/NavController'

// ── ResizeObserver double ────────────────────────────────────────────────────────
class MockResizeObserver {
  static instances: MockResizeObserver[] = []
  disconnected = false
  constructor(public cb: ResizeObserverCallback) { MockResizeObserver.instances.push(this) }
  observe() {}
  unobserve() {}
  disconnect() { this.disconnected = true }
}

function candle(over: Partial<Candle> = {}): Candle {
  return { time: 1, open: 1, high: 2, low: 0, close: 1.5, volume: 10, ...over }
}

function makePrimaryChart() {
  const priceScaleApi = { getVisibleRange: vi.fn(() => null) }
  return {
    subscribeCrosshairMove: vi.fn(),
    unsubscribeCrosshairMove: vi.fn(),
    priceScale: vi.fn(() => priceScaleApi),
    _priceScaleApi: priceScaleApi,
  } as unknown as IChartApi & { subscribeCrosshairMove: ReturnType<typeof vi.fn>; unsubscribeCrosshairMove: ReturnType<typeof vi.fn>; priceScale: ReturnType<typeof vi.fn> }

}

function baseProps(over: Partial<MultiTFOverlayProps> = {}): MultiTFOverlayProps {
  return {
    primaryChart: makePrimaryChart(),
    candles: [],
    timeframe: '5m' as MultiTFOverlayProps['timeframe'],
    onClose: vi.fn(),
    darkMode: true,
    ...over,
  }
}

function mount(props: MultiTFOverlayProps) {
  const container = document.createElement('div')
  const root = createRoot(container)
  act(() => { root.render(createElement(MultiTFOverlay, props)) })
  return {
    container,
    rerender: (next: MultiTFOverlayProps) => act(() => { root.render(createElement(MultiTFOverlay, next)) }),
    unmount: () => act(() => { root.unmount() }),
  }
}

beforeEach(() => {
  chartInstances.length = 0
  navInstances.length = 0
  MockResizeObserver.instances = []
  vi.stubGlobal('ResizeObserver', MockResizeObserver)
  vi.mocked(createChart).mockClear()
  vi.mocked(NavController).mockClear()
})

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('MultiTFOverlay — mount: chart + series + nav + subscriptions', () => {
  it('creates exactly one secondary chart sized to the container and (height - 32px header)', () => {
    const h = mount(baseProps({ height: 300 }))
    expect(createChart).toHaveBeenCalledTimes(1)
    const [, opts] = vi.mocked(createChart).mock.calls[0]!
    expect((opts as { height: number }).height).toBe(268)
    h.unmount()
  })

  it('applies dark-mode colors when darkMode=true, light-mode colors when false', () => {
    const dark = mount(baseProps({ darkMode: true }))
    const darkOpts = vi.mocked(createChart).mock.calls[0]![1] as { layout: { background: { color: string } } }
    expect(darkOpts.layout.background.color).toBe('#0d0f14')
    dark.unmount()

    vi.mocked(createChart).mockClear()
    const light = mount(baseProps({ darkMode: false }))
    const lightOpts = vi.mocked(createChart).mock.calls[0]![1] as { layout: { background: { color: string } } }
    expect(lightOpts.layout.background.color).toBe('#f5f5f5')
    light.unmount()
  })

  it('adds a candlestick series and loads initial candles when non-empty', () => {
    // Both the mount effect AND the candle-refresh effect ([candles] dep) fire on
    // the initial commit, so a non-empty initial `candles` loads twice — real,
    // harmless behavior (identical payload both times), pinned as observed.
    const candles = [candle({ time: 1 }), candle({ time: 2 })]
    const h = mount(baseProps({ candles }))
    const api = chartInstances[0]!
    expect(api.addSeries).toHaveBeenCalledWith('CandlestickSeries-marker', expect.objectContaining({ upColor: '#26a69a', downColor: '#ef5350' }))
    expect(api._series.setData).toHaveBeenCalledTimes(2)
    expect(api._series.setData.mock.calls[0]![0]).toHaveLength(2)
    expect(api._series.setData.mock.calls[1]![0]).toHaveLength(2)
    h.unmount()
  })

  it('does not call setData on mount when candles is empty', () => {
    const h = mount(baseProps({ candles: [] }))
    expect(chartInstances[0]!._series.setData).not.toHaveBeenCalled()
    h.unmount()
  })

  it('constructs one NavController bound to the secondary chart + container', () => {
    const h = mount(baseProps())
    expect(NavController).toHaveBeenCalledTimes(1)
    expect(navInstances[0]!.chart).toBe(chartInstances[0]!)
    h.unmount()
  })

  it('subscribes to the primary chart\'s crosshair exactly once', () => {
    const props = baseProps()
    const h = mount(props)
    expect(props.primaryChart.subscribeCrosshairMove).toHaveBeenCalledTimes(1)
    h.unmount()
  })

  it('observes the chart container via ResizeObserver', () => {
    const h = mount(baseProps())
    expect(MockResizeObserver.instances.length).toBe(1)
    h.unmount()
  })
})

describe('MultiTFOverlay — candle refresh without remount', () => {
  it('feeds new candles to the existing series without recreating the chart', () => {
    // Keep primaryChart/darkMode/height IDENTITY-stable across the rerender —
    // the mount effect's deps are [primaryChart, darkMode, height]; a fresh
    // primaryChart object (as a naive baseProps() re-call would produce) would
    // trigger a full remount, defeating the point of this test.
    const props = baseProps({ candles: [candle({ time: 1 })] })
    const h = mount(props)
    expect(createChart).toHaveBeenCalledTimes(1)
    const setData = chartInstances[0]!._series.setData
    setData.mockClear()
    h.rerender({ ...props, candles: [candle({ time: 1 }), candle({ time: 2 }), candle({ time: 3 })] })
    expect(createChart).toHaveBeenCalledTimes(1) // still just the one instance
    expect(setData).toHaveBeenCalledTimes(1)
    expect(setData.mock.calls[0]![0]).toHaveLength(3)
    h.unmount()
  })

  it('does not call setData again when the new candles array is empty', () => {
    const props = baseProps({ candles: [candle()] })
    const h = mount(props)
    const setData = chartInstances[0]!._series.setData
    setData.mockClear()
    h.rerender({ ...props, candles: [] })
    expect(setData).not.toHaveBeenCalled()
    h.unmount()
  })
})

describe('MultiTFOverlay — crosshair sync from primary', () => {
  function getHandler(props: MultiTFOverlayProps): (p: MouseEventParams) => void {
    return (props.primaryChart as unknown as { subscribeCrosshairMove: { mock: { calls: unknown[][] } } })
      .subscribeCrosshairMove.mock.calls[0]![0] as (p: MouseEventParams) => void
  }

  it('does nothing when time is undefined (cursor left the primary chart)', () => {
    const props = baseProps()
    const h = mount(props)
    const handler = getHandler(props)
    act(() => { handler({ time: undefined, seriesData: new Map(), point: undefined, logical: undefined, hoveredSeries: undefined, hoveredObjectId: undefined, sourceEvent: undefined } as unknown as MouseEventParams) })
    expect(chartInstances[0]!.setCrosshairPosition).not.toHaveBeenCalled()
    h.unmount()
  })

  it('extracts price via .close when present, falls back to .value, else 0', () => {
    const props = baseProps()
    const h = mount(props)
    const handler = getHandler(props)
    const seriesData = new Map([['s1', { close: 42, value: 99 }]])
    act(() => { handler({ time: 100, seriesData } as unknown as MouseEventParams) })
    expect(chartInstances[0]!.setCrosshairPosition).toHaveBeenCalledWith(42, 100, chartInstances[0]!._series)

    const valueOnly = new Map([['s1', { value: 77 }]])
    act(() => { handler({ time: 200, seriesData: valueOnly } as unknown as MouseEventParams) })
    expect(chartInstances[0]!.setCrosshairPosition).toHaveBeenLastCalledWith(77, 200, chartInstances[0]!._series)

    act(() => { handler({ time: 300, seriesData: new Map() } as unknown as MouseEventParams) })
    expect(chartInstances[0]!.setCrosshairPosition).toHaveBeenLastCalledWith(0, 300, chartInstances[0]!._series)
    h.unmount()
  })
})

describe('MultiTFOverlay — ResizeObserver bridge', () => {
  it('resizes the secondary chart to the observed contentRect width', () => {
    const h = mount(baseProps({ height: 300 }))
    const ro = MockResizeObserver.instances[0]!
    act(() => { ro.cb([{ contentRect: { width: 640 } }] as unknown as ResizeObserverEntry[], ro as unknown as ResizeObserver) })
    expect(chartInstances[0]!.resize).toHaveBeenCalledWith(640, 268)
    h.unmount()
  })

  it('does not resize when the entry list is empty', () => {
    const h = mount(baseProps())
    const ro = MockResizeObserver.instances[0]!
    act(() => { ro.cb([] as unknown as ResizeObserverEntry[], ro as unknown as ResizeObserver) })
    expect(chartInstances[0]!.resize).not.toHaveBeenCalled()
    h.unmount()
  })
})

describe('MultiTFOverlay — shared-Y sync', () => {
  it('applies autoScale:true on the secondary price scale by default (sharedY=false)', () => {
    const h = mount(baseProps({ sharedY: false }))
    expect(chartInstances[0]!._priceScaleApi.applyOptions).toHaveBeenCalledWith({ autoScale: true })
    h.unmount()
  })

  it('clicking "Sync Y" reads the primary visible range and locks the secondary autoScale off', () => {
    const props = baseProps({ sharedY: false })
    ;(props.primaryChart as unknown as { _priceScaleApi: { getVisibleRange: ReturnType<typeof vi.fn> } })
      ._priceScaleApi.getVisibleRange.mockReturnValue({ from: 1, to: 2 })
    const h = mount(props)
    const syncBtn = h.container.querySelector('button')! // "Sync Y" is the first button
    chartInstances[0]!._priceScaleApi.applyOptions.mockClear()
    act(() => { syncBtn.click() })
    expect(chartInstances[0]!._priceScaleApi.applyOptions).toHaveBeenCalledWith({ autoScale: false })
    h.unmount()
  })

  it('does not touch autoScale when toggled on but the primary has no visible range yet', () => {
    const props = baseProps({ sharedY: false }) // primary getVisibleRange defaults to null
    const h = mount(props)
    const syncBtn = h.container.querySelector('button')!
    chartInstances[0]!._priceScaleApi.applyOptions.mockClear()
    act(() => { syncBtn.click() })
    expect(chartInstances[0]!._priceScaleApi.applyOptions).not.toHaveBeenCalled()
    h.unmount()
  })
})

describe('MultiTFOverlay — header + controls', () => {
  it('shows "<timeframe> Overlay" in the header', () => {
    const h = mount(baseProps({ timeframe: '15m' as MultiTFOverlayProps['timeframe'] }))
    expect(h.container.textContent).toContain('15m Overlay')
    h.unmount()
  })

  it('the close button calls onClose and carries an accessible label', () => {
    const onClose = vi.fn()
    const h = mount(baseProps({ onClose }))
    const closeBtn = h.container.querySelector('button[aria-label="Close overlay"]') as HTMLButtonElement
    act(() => { closeBtn.click() })
    expect(onClose).toHaveBeenCalledTimes(1)
    h.unmount()
  })
})

describe('MultiTFOverlay — cleanup', () => {
  it('unsubscribes crosshair, destroys NavController, disconnects the observer, and removes the chart', () => {
    const props = baseProps()
    const h = mount(props)
    const chart = chartInstances[0]!
    const nav = navInstances[0]!
    const ro = MockResizeObserver.instances[0]!
    const handler = (props.primaryChart as unknown as { subscribeCrosshairMove: { mock: { calls: unknown[][] } } })
      .subscribeCrosshairMove.mock.calls[0]![0]
    h.unmount()
    expect(props.primaryChart.unsubscribeCrosshairMove).toHaveBeenCalledWith(handler)
    expect(nav.destroy).toHaveBeenCalledTimes(1)
    expect(ro.disconnected).toBe(true)
    expect(chart.remove).toHaveBeenCalledTimes(1)
  })

  it('a full remount (primaryChart identity change) tears down the old chart and builds a fresh one', () => {
    const props = baseProps()
    const h = mount(props)
    const firstChart = chartInstances[0]!
    h.rerender(baseProps())
    expect(firstChart.remove).toHaveBeenCalledTimes(1)
    expect(createChart).toHaveBeenCalledTimes(2)
    h.unmount()
  })
})
