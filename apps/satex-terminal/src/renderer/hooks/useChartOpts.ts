/**
 * SATEX — useChartOpts hook (Phase 10 · Black Box)
 *
 * Persistent chart display options driven by the floating TweaksPanel.
 * Wraps a useState + localStorage round-trip so QuadChart panes pick up
 * changes immediately, and reload-restoration is automatic.
 */
import { useCallback, useEffect, useState } from 'react'

export type CandleStyle = 'classic' | 'mono' | 'cyan'
export type ChartGridMode = 'minimal' | 'dense' | 'off'
export type TickRate = '500ms' | '1s' | '5s'

export interface ChartOpts {
  candleStyle: CandleStyle
  showEMA9:    boolean
  showEMA21:   boolean
  showVWAP:    boolean
  chartGrid:   ChartGridMode
  tickRate:    TickRate
}

const DEFAULT_CHART_OPTS: ChartOpts = {
  candleStyle: 'classic',
  showEMA9:    true,
  showEMA21:   true,
  showVWAP:    true,
  chartGrid:   'minimal',
  tickRate:    '1s',
}

const LS_KEY = 'satex.chartOpts.v1'

function load(): ChartOpts {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return DEFAULT_CHART_OPTS
    const parsed = JSON.parse(raw) as Partial<ChartOpts>
    return { ...DEFAULT_CHART_OPTS, ...parsed }
  } catch {
    return DEFAULT_CHART_OPTS
  }
}

function save(opts: ChartOpts): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(opts)) } catch { /* quota */ }
}

export function useChartOpts(): [ChartOpts, <K extends keyof ChartOpts>(key: K, value: ChartOpts[K]) => void] {
  const [opts, setOpts] = useState<ChartOpts>(load)

  useEffect(() => { save(opts) }, [opts])

  const setOpt = useCallback(<K extends keyof ChartOpts>(key: K, value: ChartOpts[K]) => {
    setOpts(prev => ({ ...prev, [key]: value }))
  }, [])

  return [opts, setOpt]
}
