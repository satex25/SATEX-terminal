/**
 * SATEX — Intel workspace (the composable quant-intelligence tab).
 *
 * The only user-composable surface in SATEX. The header carries the research
 * symbol selector (analyze any symbol independent of the chart focus) + the
 * Edit Modules toggle; edit mode reveals the Add-module palette and a Reset
 * escape hatch. The grid + drag/resize lives in `IntelGrid`. This component owns
 * the leak-safe poll of the read-only `IntelSnapshot`; modules read it from
 * `intelStore`. Layout hydrates from its own `intel-layout.md` and persists on
 * every committed edit.
 */
import { useEffect, useRef, useState } from 'react'
import { INTEL_MODULE_IDS, type IntelModuleId } from '@shared/types'
import { UNIVERSE } from '@shared/constants'
import { useIntelLayoutStore } from '../../stores/intelLayoutStore'
import { useIntelStore } from '../../stores/intelStore'
import { useMarketStore } from '../../stores/marketStore'
import { MODULE_META } from '../../panels/intel/intel-modules'
import { IntelGrid } from './IntelGrid'

const POLL_MS = 2500

export function IntelWorkspace() {
  const layout = useIntelLayoutStore((s) => s.layout)
  const editMode = useIntelLayoutStore((s) => s.editMode)
  const setEditMode = useIntelLayoutStore((s) => s.setEditMode)
  const add = useIntelLayoutStore((s) => s.add)
  const reset = useIntelLayoutStore((s) => s.reset)
  const hydrate = useIntelLayoutStore((s) => s.hydrate)

  const symbol = useIntelStore((s) => s.symbol)
  const setSymbol = useIntelStore((s) => s.setSymbol)
  const setSnapshot = useIntelStore((s) => s.setSnapshot)
  const lastUpdated = useIntelStore((s) => s.lastUpdated)
  const marketSymbol = useMarketStore((s) => s.symbol)

  // Bumped on failed polls so the `live` dot re-derives from `lastUpdated`
  // and decays even when no snapshot state changes — a dead intel feed must
  // never leave a frozen green dot (Constitution §3.2: degrade loudly).
  // Successful polls already re-render via setSnapshot.
  const [, notePollFailure] = useState(0)

  // Hydrate the composed layout once.
  useEffect(() => { void hydrate() }, [hydrate])

  // On first mount, sync the analysis symbol to the chart's focused symbol so
  // the workspace opens on what the operator was already looking at. One-shot —
  // afterwards the research-mode selector drives it independently.
  const syncedRef = useRef(false)
  useEffect(() => {
    if (syncedRef.current) return
    syncedRef.current = true
    if (marketSymbol) setSymbol(marketSymbol)
  }, [marketSymbol, setSymbol])

  // Poll the read-only Intel snapshot for the analysis symbol. Leak-safe: the
  // interval is cleared and any in-flight result is dropped on unmount / symbol
  // change (the PR #6 "clean up what you create" invariant).
  useEffect(() => {
    const api = window.satex
    if (!api?.getIntel) return
    let cancelled = false
    const pull = (): void => {
      api.getIntel(symbol)
        .then((snap) => { if (!cancelled) setSnapshot(snap) })
        .catch(() => {
          // Transient — keep the last snapshot, but re-render so the `live`
          // freshness dot re-derives and decays instead of freezing green.
          if (!cancelled) notePollFailure((n) => n + 1)
        })
    }
    pull()
    const id = setInterval(pull, POLL_MS)
    return () => { cancelled = true; clearInterval(id) }
  }, [symbol, setSnapshot])

  // Esc exits edit mode — the explicit "Done" path's keyboard twin.
  useEffect(() => {
    if (!editMode) return
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setEditMode(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editMode, setEditMode])

  const placed = new Set<IntelModuleId>(layout.map((m) => m.id))
  const available = INTEL_MODULE_IDS.filter((id) => !placed.has(id))
  const live = lastUpdated > 0 && Date.now() - lastUpdated < POLL_MS * 2

  return (
    <div className={`bb-intel-workspace${editMode ? ' is-editing' : ''}`}>
      <header className="bb-intel-head">
        <div className="bb-intel-head-titles">
          <h2 className="bb-intel-title">Quant Intelligence</h2>
          <span className="bb-intel-subtitle">
            {editMode ? 'Drag to rearrange · drag a corner to resize · × to remove' : 'Composable analytics workspace'}
          </span>
        </div>
        <div className="bb-intel-head-actions">
          <label className="bb-intel-symsel" title="Analysis symbol">
            <span className={`bb-intel-live${live ? ' is-live' : ''}`} aria-hidden="true" />
            <select
              className="bb-intel-select"
              aria-label="Analysis symbol"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
            >
              {UNIVERSE.map((u) => <option key={u.symbol} value={u.symbol}>{u.symbol}</option>)}
            </select>
          </label>
          {editMode && (
            <button type="button" className="bb-intel-btn bb-intel-btn-ghost" onClick={() => reset()}>
              Reset layout
            </button>
          )}
          <button
            type="button"
            className={`bb-intel-btn${editMode ? ' bb-intel-btn-active' : ''}`}
            onClick={() => setEditMode(!editMode)}
          >
            {editMode ? 'Done' : 'Edit Modules'}
          </button>
        </div>
      </header>

      {editMode && (
        <div className="bb-intel-palette" role="group" aria-label="Add module">
          {available.length === 0 ? (
            <span className="bb-intel-palette-empty">All modules placed.</span>
          ) : (
            available.map((id) => (
              <button key={id} type="button" className="bb-intel-palette-chip" onClick={() => add(id)}>
                <span className="bb-intel-palette-chip-title">+ {MODULE_META[id].title}</span>
                <span className="bb-intel-palette-chip-blurb">{MODULE_META[id].blurb}</span>
              </button>
            ))
          )}
        </div>
      )}

      <div className="bb-intel-grid-wrap"><IntelGrid /></div>
    </div>
  )
}
