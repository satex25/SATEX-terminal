/**
 * SATEX — Quad Chart Panel (Phase 10 · Black Box; rebuilt 2026-05-25)
 *
 * 2×2 grid of independent lightweight-charts panes (QuadPaneChart) — one per
 * symbol, each on its own timeline (native drag-pan + wheel-zoom). Replaces the
 * hand-drawn SVG renderer + the stale-seed stub that produced flat fake-price
 * lines. Preserves the per-pane symbol-swap picker and click-to-expand focus.
 * Symbols persist to Vault/Settings/workspace-state.md via the workspace store.
 * See docs/design/2026-05-25-quad-chart-navigation.md.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useIndicatorStore } from '../stores/indicatorStore'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { UNIVERSE } from '@shared/constants'
import { QuadPaneChart } from './QuadPaneChart'

export function QuadChartPanel() {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)
  /** Which pane's swap-picker is open. null = none. */
  const [pickerIdx, setPickerIdx] = useState<number | null>(null)

  // EMA periods from the indicator store — empty when the indicator is off so
  // each pane stops drawing EMAs. Capped to the smallest two so the small panes
  // stay legible.
  const emaEnabled = useIndicatorStore(s => s.settings.enabled.ema)
  const emaPeriodsSetting = useIndicatorStore(s => s.settings.emaPeriods)
  const emaPeriods = useMemo(
    () => (emaEnabled ? [...emaPeriodsSetting].sort((a, b) => a - b).slice(0, 2) : []),
    [emaEnabled, emaPeriodsSetting],
  )

  // Quad pane symbols (persisted). setQuadSymbolAt enforces uniqueness.
  const quadSymbols     = useWorkspaceStore(s => s.state.quadSymbols)
  const setQuadSymbolAt = useWorkspaceStore(s => s.setQuadSymbolAt)
  const syms = [
    quadSymbols[0] ?? 'NVDA',
    quadSymbols[1] ?? 'SPY',
    quadSymbols[2] ?? 'ES',
    quadSymbols[3] ?? 'BTC',
  ]

  if (expandedIdx != null) {
    const sym = syms[expandedIdx]!
    return (
      <div className="bb-quad-focus">
        <div className="bb-quad-focus-head">
          <span className="bb-quad-focus-eyebrow">● FOCUS</span>
          <span className="bb-quad-focus-meta">1 of 4 · independent timeline</span>
          <span style={{ flex: 1 }} />
          <button type="button" className="bb-quad-restore" onClick={() => setExpandedIdx(null)}>↤ RESTORE QUAD</button>
        </div>
        <div className="bb-quad-focus-canvas">
          <QuadPaneChart key={sym} symbol={sym} emaPeriods={emaPeriods} />
        </div>
      </div>
    )
  }

  return (
    <div className="bb-quad-grid">
      {syms.map((sym, i) => (
        <div key={`cell-${i}`} className={`bb-quad-cell bb-quad-cell-${i}`}>
          {/* Keyed by symbol so a swap remounts a fresh, isolated chart. */}
          <QuadPaneChart key={sym} symbol={sym} emaPeriods={emaPeriods} />
          {/* Hover-revealed actions: expand to focus, or swap the symbol. */}
          <div className="bb-quad-cell-actions">
            <button
              type="button"
              className="bb-quad-act"
              title="Expand to focus"
              onClick={() => setExpandedIdx(i)}
            >⤢</button>
            <button
              type="button"
              className="bb-quad-act"
              title={`Change symbol (currently ${sym})`}
              onClick={(e) => { e.stopPropagation(); setPickerIdx(pickerIdx === i ? null : i) }}
            >⇄</button>
          </div>
          {pickerIdx === i && (
            <QuadSymbolPicker
              current={sym}
              taken={syms}
              onPick={(next) => { setQuadSymbolAt(i as 0 | 1 | 2 | 3, next); setPickerIdx(null) }}
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
  /** All 4 currently-shown symbols — excluded from the list (except `current`,
   *  which is highlighted). */
  taken: readonly string[]
  onPick: (sym: string) => void
  onClose: () => void
}

function QuadSymbolPicker({ current, taken, onPick, onClose }: PickerProps) {
  const [filter, setFilter] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const rootRef  = useRef<HTMLDivElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

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
