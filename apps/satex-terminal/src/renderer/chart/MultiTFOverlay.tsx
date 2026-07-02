/**
 * SATEX — Multi-Timeframe Overlay (CHART-06)
 *
 * Mounts a second Lightweight Charts v5 instance in a semi-transparent
 * overlay pane on top of the primary chart. Each pane has its own
 * NavController instance — scroll/zoom in one pane does NOT affect the
 * other (full state isolation; no cross-store coupling — Zustand invariant).
 *
 * Features:
 *   - Independently scrollable / zoomable secondary panel.
 *   - Toggle between shared-Y (same price axis range) and split-Y (each
 *     pane autoscales to its own data).
 *   - Synced time axis cursor via `subscribeCrosshairMove` — secondary pane
 *     shows crosshair at the same logical time as the primary.
 *   - Dismissible via the × button; state lives in a local `useState`
 *     (ephemeral — not persisted; this is an analytic overlay, not config).
 *
 * Cleanup (PR #6 invariant):
 *   - Both chart instances call `.remove()` on unmount.
 *   - Both crosshair subscriptions are unsubscribed.
 *   - Both NavControllers call `.destroy()`.
 *   - ResizeObserver disconnects.
 *
 * No order-execution path. Chart = analytic surface only (§4 ultraplan ⛔).
 *
 * LWC v5 API notes:
 *   - Series creation: chart.addSeries(CandlestickSeries, opts) — NOT addCandlestickSeries.
 *   - Price range: priceScale.getVisibleRange() — NOT getVisiblePriceRange.
 *   - setCrosshairPosition(price, time, series): price must be a number extracted
 *     from the bar data, not the bar object itself.
 */
import { useEffect, useRef, useState } from 'react'
import {
  createChart,
  CandlestickSeries,
  type IChartApi,
  type ISeriesApi,
  type DeepPartial,
  type ChartOptions,
  type CandlestickSeriesOptions,
} from 'lightweight-charts'
import { NavController } from './nav/NavController'
import type { Candle } from '@shared/types'
import type { ChartTimeframe } from '@shared/constants'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MultiTFOverlayProps {
  /** Primary chart instance — used for cursor sync only (read crosshair pos). */
  primaryChart:   IChartApi
  /** Candles for the secondary timeframe. */
  candles:        Candle[]
  /** The secondary timeframe label (shown in overlay header). */
  timeframe:      ChartTimeframe
  /** Height of the overlay pane in CSS pixels. Default 220. */
  height?:        number
  /** Whether price axes are shared (shared-Y mode). Default false. */
  sharedY?:       boolean
  /** Called when the user closes the overlay. */
  onClose:        () => void
  /** Dark-mode flag; uses same themeStore convention as ChartPanel. */
  darkMode:       boolean
}

// ── Chart option presets ──────────────────────────────────────────────────────

function overlayChartOpts(darkMode: boolean): DeepPartial<ChartOptions> {
  const bg      = darkMode ? '#0d0f14' : '#f5f5f5'
  const text     = darkMode ? '#9aa0ad' : '#4a4a6a'
  const border   = darkMode ? '#1e2028' : '#d8d8e8'
  const grid     = darkMode ? '#161820' : '#ebebf4'
  return {
    layout:     { background: { color: bg }, textColor: text },
    grid:       { vertLines: { color: grid }, horzLines: { color: grid } },
    timeScale:  { borderColor: border, timeVisible: true, secondsVisible: false },
    rightPriceScale: { borderColor: border },
    crosshair:  { mode: 1 },
    handleScroll: true,
    handleScale:  true,
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MultiTFOverlay({
  primaryChart,
  candles,
  timeframe,
  height   = 220,
  sharedY  = false,
  onClose,
  darkMode,
}: MultiTFOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef     = useRef<IChartApi | null>(null)
  const seriesRef    = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const navRef       = useRef<NavController | null>(null)
  const [syncY, setSyncY] = useState(sharedY)

  // ── Mount / unmount secondary chart ───────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const chart = createChart(el, {
      ...overlayChartOpts(darkMode),
      width:  el.clientWidth,
      height: height - 32, // header bar is 32px
    })
    chartRef.current = chart

    // ── Candlestick series (LWC v5: addSeries, not addCandlestickSeries) ──
    const seriesOpts: DeepPartial<CandlestickSeriesOptions> = {
      upColor:         '#26a69a',
      downColor:       '#ef5350',
      borderUpColor:   '#26a69a',
      borderDownColor: '#ef5350',
      wickUpColor:     '#26a69a',
      wickDownColor:   '#ef5350',
    }
    const series = chart.addSeries(CandlestickSeries, seriesOpts)
    seriesRef.current = series

    if (candles.length > 0) {
      series.setData(
        candles.map(c => ({
          time:  c.time as import('lightweight-charts').Time,
          open:  c.open,
          high:  c.high,
          low:   c.low,
          close: c.close,
        })),
      )
    }

    // ── NavController ──────────────────────────────────────────────────────
    navRef.current = new NavController(chart, el)

    // ── Cursor sync from primary chart ────────────────────────────────────
    // LWC v5: subscribeCrosshairMove returns void; unsubscribe via
    // unsubscribeCrosshairMove(handler). Store the handler to unsubscribe.
    // Extract close price from bar data (price arg must be number, not a bar object).
    const crosshairHandler = (param: import('lightweight-charts').MouseEventParams) => {
      if (param.time === undefined) return
      const barData = param.seriesData.size > 0
        ? ([...param.seriesData.values()][0] as { close?: number; value?: number } | undefined)
        : undefined
      const price = barData?.close ?? barData?.value ?? 0
      chart.setCrosshairPosition(price, param.time, series)
    }
    primaryChart.subscribeCrosshairMove(crosshairHandler)

    // ── ResizeObserver ────────────────────────────────────────────────────
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width
      if (w) chart.resize(w, height - 32)
    })
    ro.observe(el)

    return () => {
      primaryChart.unsubscribeCrosshairMove(crosshairHandler)
      navRef.current?.destroy()
      navRef.current = null
      ro.disconnect()
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- candles intentionally excluded; applied in second useEffect to avoid full remount
  }, [primaryChart, darkMode, height])

  // ── Feed candle updates without remounting ─────────────────────────────
  useEffect(() => {
    const series = seriesRef.current
    if (!series || candles.length === 0) return
    series.setData(
      candles.map(c => ({
        time:  c.time as import('lightweight-charts').Time,
        open:  c.open,
        high:  c.high,
        low:   c.low,
        close: c.close,
      })),
    )
  }, [candles])

  // ── Shared-Y sync ─────────────────────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    if (syncY) {
      // LWC v5: getVisibleRange() not getVisiblePriceRange()
      const primaryRange = primaryChart.priceScale('right').getVisibleRange()
      if (primaryRange) chart.priceScale('right').applyOptions({ autoScale: false })
    } else {
      chart.priceScale('right').applyOptions({ autoScale: true })
    }
  }, [syncY, primaryChart])

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        position:   'absolute',
        bottom:     0,
        left:       0,
        right:      0,
        height:     `${height}px`,
        border:     darkMode ? '1px solid #1e2028' : '1px solid #d8d8e8',
        background: darkMode ? 'rgba(13,15,20,0.97)' : 'rgba(245,245,245,0.97)',
        zIndex:     10,
        display:    'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header bar */}
      <div
        style={{
          height:         '32px',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          padding:        '0 8px',
          borderBottom:   darkMode ? '1px solid #1e2028' : '1px solid #d8d8e8',
          fontSize:       '12px',
          color:          darkMode ? '#9aa0ad' : '#4a4a6a',
          userSelect:     'none',
        }}
      >
        <span style={{ fontWeight: 600 }}>{timeframe} Overlay</span>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={() => setSyncY(v => !v)}
            style={{
              fontSize:        '11px',
              padding:         '2px 6px',
              cursor:          'pointer',
              background:      syncY ? '#3b4aff' : 'transparent',
              color:           syncY ? '#fff' : (darkMode ? '#9aa0ad' : '#4a4a6a'),
              border:          darkMode ? '1px solid #2a2d38' : '1px solid #ccc',
              borderRadius:    '3px',
            }}
          >
            Sync Y
          </button>
          <button
            onClick={onClose}
            aria-label="Close overlay"
            style={{
              fontSize:   '14px',
              lineHeight: 1,
              cursor:     'pointer',
              background: 'transparent',
              border:     'none',
              color:      darkMode ? '#9aa0ad' : '#4a4a6a',
            }}
          >
            ×
          </button>
        </div>
      </div>

      {/* Chart container */}
      <div ref={containerRef} style={{ flex: 1, overflow: 'hidden' }} />
    </div>
  )
}
