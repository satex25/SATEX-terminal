// @vitest-environment jsdom
/**
 * SATEX — useChartOpts characterization suite (P-129 chart-jsdom-harness wave 2).
 *
 * Pins the localStorage-backed load/save round-trip (default fallback on
 * absent/malformed state, partial-state merge, quota-exceeded swallow) and
 * the setOpt updater contract. Hand-rolled `renderHook` (react-dom/client +
 * act, no @testing-library — matches useIPC.test.tsx precedent), extended
 * here to capture the hook's return value across renders.
 *
 * Subject `useChartOpts.ts` is READ-ONLY here (byte-unchanged). jsdom env.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, createElement, type FC } from 'react'
import { createRoot } from 'react-dom/client'
import { useChartOpts, type ChartOpts } from './useChartOpts'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

const LS_KEY = 'satex.chartOpts.v1'

const DEFAULTS: ChartOpts = {
  candleStyle: 'classic',
  showEMA9: true,
  showEMA21: true,
  showVWAP: true,
  chartGrid: 'minimal',
  tickRate: '1s',
}

// ── Hand-rolled renderHook, capturing the latest returned value ────────────────
function renderHook<T>(hook: () => T) {
  const container = document.createElement('div')
  const root = createRoot(container)
  let value!: T
  const Probe: FC = () => { value = hook(); return null }
  act(() => { root.render(createElement(Probe)) })
  return {
    get value() { return value },
    rerender: () => act(() => { root.render(createElement(Probe)) }),
    unmount: () => act(() => { root.unmount() }),
  }
}

beforeEach(() => { localStorage.clear() })
afterEach(() => { vi.restoreAllMocks() })

describe('useChartOpts — load on mount', () => {
  it('returns the built-in defaults when localStorage is empty', () => {
    const h = renderHook(() => useChartOpts())
    const [opts] = h.value
    expect(opts).toEqual(DEFAULTS)
    h.unmount()
  })

  it('merges a partial persisted state over the defaults', () => {
    localStorage.setItem(LS_KEY, JSON.stringify({ candleStyle: 'mono', tickRate: '5s' }))
    const h = renderHook(() => useChartOpts())
    const [opts] = h.value
    expect(opts).toEqual({ ...DEFAULTS, candleStyle: 'mono', tickRate: '5s' })
    h.unmount()
  })

  it('falls back to defaults when the persisted JSON is malformed', () => {
    localStorage.setItem(LS_KEY, '{not-json')
    const h = renderHook(() => useChartOpts())
    const [opts] = h.value
    expect(opts).toEqual(DEFAULTS)
    h.unmount()
  })

  it('persists the loaded (or default) opts back to storage on mount', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const h = renderHook(() => useChartOpts())
    expect(setItem).toHaveBeenCalledWith(LS_KEY, JSON.stringify(DEFAULTS))
    h.unmount()
  })
})

describe('useChartOpts — setOpt updater', () => {
  it('updates only the targeted key, preserving the rest', () => {
    const h = renderHook(() => useChartOpts())
    act(() => { h.value[1]('showVWAP', false) })
    h.rerender()
    const [opts] = h.value
    expect(opts).toEqual({ ...DEFAULTS, showVWAP: false })
    h.unmount()
  })

  it('applies sequential updates to different keys independently', () => {
    const h = renderHook(() => useChartOpts())
    act(() => { h.value[1]('chartGrid', 'dense') })
    h.rerender()
    act(() => { h.value[1]('tickRate', '500ms') })
    h.rerender()
    const [opts] = h.value
    expect(opts).toEqual({ ...DEFAULTS, chartGrid: 'dense', tickRate: '500ms' })
    h.unmount()
  })

  it('persists every update via the save effect', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const h = renderHook(() => useChartOpts())
    setItem.mockClear() // drop the mount-time save
    act(() => { h.value[1]('candleStyle', 'cyan') })
    h.rerender()
    expect(setItem).toHaveBeenCalledWith(LS_KEY, JSON.stringify({ ...DEFAULTS, candleStyle: 'cyan' }))
    h.unmount()
  })

  it('swallows a quota-exceeded setItem failure without throwing, state still updates', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota exceeded', 'QuotaExceededError')
    })
    const h = renderHook(() => useChartOpts())
    expect(() => act(() => { h.value[1]('showEMA9', false) })).not.toThrow()
    h.rerender()
    const [opts] = h.value
    expect(opts.showEMA9).toBe(false)
    h.unmount()
  })

  it('keeps a stable setOpt identity across re-renders (empty-deps useCallback)', () => {
    const h = renderHook(() => useChartOpts())
    const first = h.value[1]
    act(() => { h.value[1]('showEMA21', false) })
    h.rerender()
    expect(h.value[1]).toBe(first)
    h.unmount()
  })
})
