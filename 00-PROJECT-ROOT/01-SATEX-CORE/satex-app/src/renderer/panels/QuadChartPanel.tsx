/**
 * SATEX — Quad Chart Panel (Phase 10 · Black Box)
 *
 * 2×2 synchronized candle charts with linked crosshair across all panes,
 * EMA9/EMA21 + VWAP overlays, RSI strip in each pane header, click-to-focus
 * expansion. Ports satex-charts.jsx:ChartCanvas + :QuadChart verbatim and
 * wires inputs to the real candle store + indicators IPC.
 *
 * Strategy:
 *   - 4 symbols (configurable via QUAD_SYMBOLS env eventually; default
 *     NVDA / SPY / ES / BTC).
 *   - Each pane reads candles from useMarketStore and locally computes
 *     EMA9, EMA21, VWAP for plotting + RSI14 for the sub-header tile.
 *   - Shared `hover: number | null` in [0, 1] X-fraction so the crosshair
 *     ghosts at the same X-index across every pane.
 *   - Click a pane's header → setExpandedIdx; renders only that pane filling
 *     the parent. "RESTORE QUAD" returns.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMarketStore, selectCandles } from '../stores/marketStore'
import { useChartOpts } from '../hooks/useChartOpts'
import { useIndicatorStore } from '../stores/indicatorStore'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { ema, vwap as vwapFn, rsi } from '@shared/indicators'
import { findUniverseEntry, UNIVERSE } from '@shared/constants'
import type { Candle } from '@shared/types'

const THEMES = {
  classic: { up: '#21c97a', down: '#ff4655', ema9: '#f5c46a', ema21: '#b48cff' },
  mono:    { up: '#dddde2', down: '#5a5a62', ema9: '#9aa1ad', ema21: '#5f6470' },
  cyan:    { up: '#00d4ff', down: '#ff7a48', ema9: '#9bf0ff', ema21: '#ffb887' },
} as const

interface PaneData {
  sym:      string
  name:     string
  exchange: string
  tf:       string
  series:   Candle[]
  /** EMA series keyed by period. Driven by useIndicatorStore — when "ema" is
   *  disabled this map is empty. */
  emas:     Map<number, number[]>
  vwap:     number[]
  rsi14:    number
}

/** EMA series (per-bar, not just last) used for plotting. */
function emaSeries(closes: number[], period: number): number[] {
  if (closes.length === 0) return []
  const k = 2 / (period + 1)
  let prev = closes[0]!
  const out: number[] = [prev]
  for (let i = 1; i < closes.length; i++) {
    prev = closes[i]! * k + prev * (1 - k)
    out.push(prev)
  }
  return out
}

/** Rolling VWAP series. */
function vwapSeries(candles: Candle[]): number[] {
  let pv = 0, vv = 0
  return candles.map(c => {
    const typ = (c.high + c.low + c.close) / 3
    pv += typ * c.volume
    vv += c.volume
    return vv === 0 ? typ : pv / vv
  })
}

function exchangeFor(symbol: string): string {
  if (symbol === 'NVDA' || symbol === 'AAPL' || symbol === 'MSFT') return 'NASDAQ'
  if (symbol === 'SPY' || symbol === 'IWM') return 'NYSE'
  if (symbol === 'ES' || symbol === 'NQ' || symbol === 'GC' || symbol === 'CL') return 'CME'
  if (symbol === 'BTC' || symbol === 'ETH' || symbol === 'SOL') return 'CBSE'
  return 'EQTY'
}

/** Hook: pull the last N candles for a symbol and derive ema/vwap/rsi for plotting. */
function usePaneData(symbol: string, bars: number, emaPeriods: readonly number[]): PaneData {
  const candles = useMarketStore(selectCandles(symbol))
  const entry = findUniverseEntry(symbol)
  const name = entry?.name ?? symbol
  const sliced = useMemo(() => candles.slice(-bars), [candles, bars])
  const closes = useMemo(() => sliced.map(c => c.close), [sliced])

  const emas = useMemo(() => {
    const m = new Map<number, number[]>()
    if (closes.length === 0) return m
    for (const p of emaPeriods) m.set(p, emaSeries(closes, p))
    return m
  }, [closes, emaPeriods])

  // Initial-empty defense — return a one-bar baseline so the SVG min/max math
  // doesn't NaN out before the engine emits the first candle.
  if (sliced.length === 0) {
    const seed = entry?.seed ?? 100
    const stub: Candle = { time: Math.floor(Date.now() / 1000), open: seed, high: seed, low: seed, close: seed, volume: 1 }
    const stubMap = new Map<number, number[]>()
    for (const p of emaPeriods) stubMap.set(p, [seed, seed])
    return {
      sym: symbol, name, exchange: exchangeFor(symbol), tf: '1s',
      series: [stub, stub],
      emas: stubMap,
      vwap: [seed, seed],
      rsi14: 50,
    }
  }

  return {
    sym:      symbol,
    name,
    exchange: exchangeFor(symbol),
    tf:       '1s',
    series:   sliced,
    emas,
    vwap:     vwapSeries(sliced),
    rsi14:    rsi(closes, 14),
  }
}

interface ChartCanvasProps {
  data:        PaneData
  hover:       number | null
  onHover:     (v: number | null) => void
  onClickHeader?: () => void
  expanded?:   boolean
  accent:      string
}

function ChartCanvas({ data, hover, onHover, onClickHeader, expanded, accent }: ChartCanvasProps) {
  const [opts] = useChartOpts()
  const W = expanded ? 1400 : 668
  const H = expanded ? 720  : 320
  const PAD = { l: 8, r: 56, t: 50, b: 22 }
  const innerW = W - PAD.l - PAD.r
  const innerH = H - PAD.t - PAD.b
  const theme = THEMES[opts.candleStyle]
  // Phase 11: ChartOpts global EMA toggles still respected for chrome-level
  // hide, but the actual periods come from the indicator store. Each pane
  // honors the store, capped to two periods (the smallest two) so the quad
  // grid stays legible at 668×320 per cell.
  const showVWAP  = opts.showVWAP
  const gridMode  = opts.chartGrid
  const showEmasOpt = opts.showEMA9 || opts.showEMA21

  const { series, emas, vwap, sym, exchange, tf, rsi14 } = data
  // Take at most 2 EMA periods (smallest first) to avoid clutter in the small panes.
  const emaEntries = Array.from(emas.entries()).sort((a, b) => a[0] - b[0]).slice(0, 2)
  const emaPalette = [theme.ema9, theme.ema21]
  const n = series.length
  const allEmaValues: number[] = []
  for (const [, vals] of emaEntries) for (const v of vals) allEmaValues.push(v)
  const allMins = [...series.map(b => b.low), ...allEmaValues]
  const allMaxs = [...series.map(b => b.high), ...allEmaValues]
  const minVal = Math.min(...allMins)
  const maxVal = Math.max(...allMaxs)
  const pad = Math.max(0.01, (maxVal - minVal) * 0.08)
  const yMin = minVal - pad, yMax = maxVal + pad
  const yScale = (v: number) => PAD.t + (1 - (v - yMin) / Math.max(1e-9, yMax - yMin)) * innerH
  const xScale = (i: number) => PAD.l + (i + 0.5) * (innerW / Math.max(1, n))
  const cw = (innerW / Math.max(1, n)) * 0.66

  const last = series[n - 1]!
  const first = series[0]!
  const chg = last.close - first.close
  const pct = first.close === 0 ? 0 : (chg / first.close) * 100

  // grid: 5 horizontal lines
  const gridY: { v: number; y: number }[] = []
  for (let i = 0; i <= 4; i++) {
    const v = yMin + (yMax - yMin) * (i / 4)
    gridY.push({ v, y: yScale(v) })
  }

  const hoverI = hover != null ? Math.round(hover * (n - 1)) : null
  const hoverBar = hoverI != null ? series[hoverI] : null

  return (
    <svg
      width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
      style={{ display: 'block' }}
      onMouseMove={(e) => {
        const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
        const px = e.clientX - r.left
        const t = (px - PAD.l) / innerW
        if (t >= 0 && t <= 1) onHover(t)
      }}
      onMouseLeave={() => onHover(null)}
    >
      {/* header strip */}
      <g onClick={onClickHeader} style={{ cursor: onClickHeader ? 'pointer' : 'default' }}>
        <rect x="0" y="0" width={W} height="22" fill="transparent" />
        <text x="10" y="15" fill="#d6d6d8" fontSize="11" fontWeight="600" letterSpacing="0.04em">{sym}</text>
        <text x={10 + sym.length * 7.8 + 8} y="15" fill="#4a4a52" fontSize="9.5">{exchange} · {tf}</text>
        <text x={W - 84} y="15" fill={chg >= 0 ? 'var(--bb-pos)' : 'var(--bb-neg)'} fontSize="11.5" fontWeight="700" textAnchor="end">{last.close.toFixed(2)}</text>
        <text x={W - 6} y="15" fill={chg >= 0 ? 'var(--bb-pos)' : 'var(--bb-neg)'} fontSize="10" textAnchor="end">{chg >= 0 ? '+' : ''}{chg.toFixed(2)} · {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%</text>
      </g>

      {/* sub-header: H/L/V/RSI */}
      <g>
        <text x="10" y="38" fill="#4a4a52" fontSize="9.5">
          <tspan fill="#4a4a52">H</tspan> <tspan fill="#7a7a83">{Math.max(...series.map(b => b.high)).toFixed(2)}</tspan>
          <tspan dx="8" fill="#4a4a52">L</tspan> <tspan fill="#7a7a83">{Math.min(...series.map(b => b.low)).toFixed(2)}</tspan>
          <tspan dx="8" fill="#4a4a52">VOL</tspan> <tspan fill="#7a7a83">{(series.reduce((a, b) => a + b.volume, 0) / 1e6).toFixed(1)}M</tspan>
          <tspan dx="8" fill="#4a4a52">RSI</tspan> <tspan fill={rsi14 > 70 ? 'var(--bb-neg)' : rsi14 < 30 ? 'var(--bb-pos)' : '#7a7a83'}>{rsi14.toFixed(0)}</tspan>
        </text>
      </g>

      <line x1="0" x2={W} y1="22" y2="22" stroke="rgba(255,255,255,0.05)" />

      {/* grid */}
      {gridMode !== 'off' && gridY.map((g, i) => (
        <g key={i}>
          <line x1={PAD.l} x2={W - PAD.r} y1={g.y} y2={g.y} stroke="rgba(255,255,255,0.04)" strokeDasharray={gridMode === 'dense' ? '1 2' : '2 4'} />
          <text x={W - PAD.r + 4} y={g.y + 3} fill="#4a4a52" fontSize="9.5">{g.v.toFixed(2)}</text>
        </g>
      ))}

      {/* VWAP */}
      {showVWAP && vwap.length === series.length && (
        <polyline
          fill="none" stroke={accent} strokeOpacity="0.45" strokeWidth="1" strokeDasharray="3 3"
          points={vwap.map((v, i) => `${xScale(i)},${yScale(v)}`).join(' ')}
        />
      )}
      {/* EMA series — dynamic count from useIndicatorStore.emaPeriods, painted
          back-to-front so the shortest period (most reactive) lands on top. */}
      {showEmasOpt && [...emaEntries].reverse().map(([period, vals], idx) => {
        const reverseIdx = emaEntries.length - 1 - idx
        if (vals.length !== series.length) return null
        return (
          <polyline
            key={`ema-${period}`}
            fill="none"
            stroke={emaPalette[reverseIdx] ?? theme.ema21}
            strokeOpacity={reverseIdx === 0 ? 0.95 : 0.85}
            strokeWidth="1.2"
            points={vals.map((v, i) => `${xScale(i)},${yScale(v)}`).join(' ')}
          />
        )
      })}

      {/* candles */}
      {series.map((b, i) => {
        const up = b.close >= b.open
        const x = xScale(i)
        const yo = yScale(b.open), yc = yScale(b.close)
        const yh = yScale(b.high), yl = yScale(b.low)
        const fill = up ? theme.up : theme.down
        return (
          <g key={i}>
            <line x1={x} x2={x} y1={yh} y2={yl} stroke={fill} strokeWidth="1" />
            <rect
              x={x - cw / 2} y={Math.min(yo, yc)}
              width={cw} height={Math.max(1, Math.abs(yc - yo))}
              fill={fill}
            />
          </g>
        )
      })}

      {/* last price tag */}
      <g>
        <line x1={PAD.l} x2={W - PAD.r} y1={yScale(last.close)} y2={yScale(last.close)} stroke={chg >= 0 ? theme.up : theme.down} strokeOpacity="0.35" strokeDasharray="2 3" />
        <rect x={W - PAD.r + 0.5} y={yScale(last.close) - 8} width={PAD.r - 2} height="16" fill={chg >= 0 ? theme.up : theme.down} />
        <text x={W - 4} y={yScale(last.close) + 4} fill="#000" fontSize="10.5" fontWeight="700" textAnchor="end">{last.close.toFixed(2)}</text>
      </g>

      {/* synced crosshair */}
      {hoverI != null && hoverBar != null && (
        <g pointerEvents="none">
          <line x1={xScale(hoverI)} x2={xScale(hoverI)} y1={PAD.t} y2={H - PAD.b} stroke={accent} strokeOpacity="0.55" strokeDasharray="2 3" />
          <rect x={PAD.l + 4} y={PAD.t + 4} width="174" height="14" fill="rgba(6,6,7,0.85)" />
          <text x={PAD.l + 8} y={PAD.t + 14} fill="#d6d6d8" fontSize="10">
            O {hoverBar.open.toFixed(2)}  H {hoverBar.high.toFixed(2)}  L {hoverBar.low.toFixed(2)}  C {hoverBar.close.toFixed(2)}
          </text>
        </g>
      )}

      {/* legend — one chip per active EMA period, then VWAP */}
      <g transform={`translate(${W - PAD.r - 168}, 38)`}>
        {showEmasOpt && emaEntries.map(([period], i) => (
          <g key={`legend-ema-${period}`} transform={`translate(${i * 58}, 0)`}>
            <rect x="0" y="-8" width="3" height="9" fill={emaPalette[i] ?? theme.ema21} />
            <text x="6" y="0" fill="#7a7a83" fontSize="9.5">EMA {period}</text>
          </g>
        ))}
        {showVWAP && (
          <g transform={`translate(${emaEntries.length * 58 + 8}, 0)`}>
            <rect x="0" y="-8" width="3" height="9" fill={accent} fillOpacity="0.6" />
            <text x="6" y="0" fill="#7a7a83" fontSize="9.5">VWAP</text>
          </g>
        )}
      </g>
    </svg>
  )
}

export function QuadChartPanel() {
  const [hover, setHover] = useState<number | null>(null)
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)
  /** Which pane's swap-picker is currently open. null = no picker. */
  const [pickerIdx, setPickerIdx] = useState<number | null>(null)
  const accent = '#00c8ff'

  // EMA periods come from the indicator store. When the indicator is off we
  // pass an empty array so each pane stops drawing EMAs altogether. ChartOpts
  // still gates the visibility separately (existing Tweaks panel behavior).
  const emaEnabled = useIndicatorStore(s => s.settings.enabled.ema)
  const emaPeriodsSetting = useIndicatorStore(s => s.settings.emaPeriods)
  const emaPeriods = useMemo(
    () => (emaEnabled ? [...emaPeriodsSetting].sort((a, b) => a - b) : []),
    [emaEnabled, emaPeriodsSetting],
  )

  // Quad pane symbols come from the workspace store — persisted across
  // sessions to Vault/Settings/workspace-state.md. setQuadSymbolAt also
  // enforces uniqueness so a user can't put NVDA in two panes.
  const quadSymbols    = useWorkspaceStore(s => s.state.quadSymbols)
  const setQuadSymbolAt = useWorkspaceStore(s => s.setQuadSymbolAt)
  // Safe-access — falls back to defaults if the store hydration hasn't
  // finished yet (the bare empty-defense in usePaneData handles it anyway).
  const sym0 = quadSymbols[0] ?? 'NVDA'
  const sym1 = quadSymbols[1] ?? 'SPY'
  const sym2 = quadSymbols[2] ?? 'ES'
  const sym3 = quadSymbols[3] ?? 'BTC'

  const data0 = usePaneData(sym0, 140, emaPeriods)
  const data1 = usePaneData(sym1, 140, emaPeriods)
  const data2 = usePaneData(sym2, 140, emaPeriods)
  const data3 = usePaneData(sym3, 140, emaPeriods)
  const panes = [data0, data1, data2, data3]

  // Use the synthetic-data references so TypeScript doesn't complain about
  // unused imports for `ema`/`vwapFn` (we use the per-bar variants above).
  useEffect(() => { void ema; void vwapFn }, [])

  if (expandedIdx != null) {
    const p = panes[expandedIdx]!
    return (
      <div className="bb-quad-focus">
        <div className="bb-quad-focus-head">
          <span className="bb-quad-focus-eyebrow">● FOCUS</span>
          <span className="bb-quad-focus-meta">1 of 4 · synced timebase preserved</span>
          <span style={{ flex: 1 }} />
          <button type="button" className="bb-quad-restore" onClick={() => setExpandedIdx(null)}>↤ RESTORE QUAD</button>
        </div>
        <div className="bb-quad-focus-canvas">
          <ChartCanvas data={p} hover={hover} onHover={setHover} accent={accent} expanded />
        </div>
      </div>
    )
  }

  return (
    <div className="bb-quad-grid">
      {panes.map((p, i) => (
        <div key={`pane-${i}`} className={`bb-quad-cell bb-quad-cell-${i}`}>
          <ChartCanvas
            data={p}
            hover={hover}
            onHover={setHover}
            onClickHeader={() => setExpandedIdx(i)}
            accent={accent}
          />
          {/* Phase 12: swap-symbol affordance — HTML overlay on the SVG
              header. Sits above the SVG so it doesn't compete with the
              expand-on-header click. Clicking opens a small inline picker. */}
          <button
            type="button"
            className="bb-quad-swap"
            title={`Change symbol (currently ${p.sym})`}
            onClick={(e) => {
              e.stopPropagation()
              setPickerIdx(pickerIdx === i ? null : i)
            }}
          >⇄</button>
          {pickerIdx === i && (
            <QuadSymbolPicker
              current={p.sym}
              taken={quadSymbols}
              onPick={(next) => {
                setQuadSymbolAt(i as 0 | 1 | 2 | 3, next)
                setPickerIdx(null)
              }}
              onClose={() => setPickerIdx(null)}
            />
          )}
        </div>
      ))}
    </div>
  )
}

// ── Symbol picker dropdown (Phase 12) ────────────────────────────────────────

interface PickerProps {
  current: string
  /** All 4 currently-shown symbols — these are excluded from the picker
   *  list (except the one matching `current`, which is highlighted). */
  taken: readonly string[]
  onPick: (sym: string) => void
  onClose: () => void
}

function QuadSymbolPicker({ current, taken, onPick, onClose }: PickerProps) {
  const [filter, setFilter] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const rootRef  = useRef<HTMLDivElement>(null)

  // Autofocus the filter on open so the user can type immediately.
  useEffect(() => { inputRef.current?.focus() }, [])

  // Click-outside + Escape to close. Keeps the picker lightweight without
  // a full modal-backdrop layer.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current) return
      if (!rootRef.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const takenSet = useMemo(() => new Set<string>(taken), [taken])
  const filtered = useMemo(() => {
    const q = filter.trim().toUpperCase()
    return UNIVERSE.filter(u => {
      if (takenSet.has(u.symbol) && u.symbol !== current) return false
      if (!q) return true
      return u.symbol.includes(q) || u.name.toUpperCase().includes(q)
    }).slice(0, 60)
  }, [filter, current, takenSet])

  return (
    <div ref={rootRef} className="bb-quad-picker" role="listbox">
      <input
        ref={inputRef}
        type="text"
        className="bb-quad-picker-filter"
        placeholder="filter…"
        value={filter}
        onChange={e => setFilter(e.currentTarget.value)}
      />
      <div className="bb-quad-picker-list">
        {filtered.map(u => (
          <button
            key={u.symbol}
            type="button"
            className={`bb-quad-picker-row${u.symbol === current ? ' on' : ''}`}
            onClick={() => onPick(u.symbol)}
          >
            <span className="sym">{u.symbol}</span>
            <span className="name">{u.name}</span>
            <span className="cls">{u.assetClass}</span>
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="bb-quad-picker-empty">no matches</div>
        )}
      </div>
    </div>
  )
}
