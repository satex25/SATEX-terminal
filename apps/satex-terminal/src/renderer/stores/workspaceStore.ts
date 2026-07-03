/**
 * SATEX — Workspace state store (Phase 12 · 2026-05-15).
 *
 * Sibling of indicatorStore — hydrates from main on App mount, persists every
 * change back to Vault/Settings/workspace-state.md. Source of truth for:
 *   - the active workspace tab (Trade/Focus/Markets/Replay/Quad)
 *   - the four QuadChartPanel pane symbols
 *   - the active single-chart symbol in Trade/Focus
 *
 * Auto-persist on every setter — never blocks the UI.
 */
import { create } from 'zustand'
import {
  DEFAULT_WORKSPACE_STATE,
  WORKSPACE_TABS,
  type RailId,
  type Workspace,
  type WorkspaceState,
} from '@shared/types'

interface WorkspaceStoreState {
  state: WorkspaceState
  hydrated: boolean
  setWorkspace:    (ws: Workspace) => void
  setQuadSymbols:  (syms: string[]) => void
  /** Swap a single pane (0..3). No-op if the symbol is already shown in
   *  another pane — Quad enforces uniqueness so each pane gets its own series. */
  setQuadSymbolAt: (paneIndex: 0 | 1 | 2 | 3, sym: string) => void
  setChartSymbol:  (sym: string) => void
  /** Startup landing page — the workspace opened once after the intro. */
  setLandingWorkspace: (ws: Workspace) => void
  /** Toggle a side-rail panel's fully-collapsed state. View state only —
   *  routes no order (Constitution off-perimeter). */
  toggleRail:      (id: RailId) => void
  hydrate:         () => Promise<void>
}

function persist(s: WorkspaceState): void {
  window.satex?.workspace?.setState(s).catch((err: unknown) => {
    console.warn('[workspace] failed to persist state', err)
  })
}

export const useWorkspaceStore = create<WorkspaceStoreState>((set, get) => ({
  state: {
    ...DEFAULT_WORKSPACE_STATE,
    quadSymbols: [...DEFAULT_WORKSPACE_STATE.quadSymbols],
    collapsedRails: [...DEFAULT_WORKSPACE_STATE.collapsedRails],
  },
  hydrated: false,

  setWorkspace: (ws) => {
    if (!(WORKSPACE_TABS as readonly string[]).includes(ws)) return
    const cur = get().state
    if (cur.workspace === ws) return
    const next: WorkspaceState = { ...cur, workspace: ws }
    set({ state: next })
    persist(next)
  },

  setQuadSymbols: (syms) => {
    if (!Array.isArray(syms) || syms.length !== 4) return
    const cur = get().state
    const cleaned = syms.map(s => s.toUpperCase())
    if (cleaned.every((s, i) => s === cur.quadSymbols[i])) return
    const next: WorkspaceState = { ...cur, quadSymbols: cleaned }
    set({ state: next })
    persist(next)
  },

  setQuadSymbolAt: (paneIndex, sym) => {
    const up = sym.toUpperCase()
    const cur = get().state
    if (cur.quadSymbols[paneIndex] === up) return
    // Enforce uniqueness — if the new symbol already exists in another pane,
    // swap it with that pane (so we never lose a slot, just reorder).
    const nextQuad = [...cur.quadSymbols]
    const existingAt = nextQuad.indexOf(up)
    if (existingAt >= 0 && existingAt !== paneIndex) {
      nextQuad[existingAt] = nextQuad[paneIndex]!
    }
    nextQuad[paneIndex] = up
    const next: WorkspaceState = { ...cur, quadSymbols: nextQuad }
    set({ state: next })
    persist(next)
  },

  setChartSymbol: (sym) => {
    const up = sym.toUpperCase()
    const cur = get().state
    if (cur.chartSymbol === up) return
    const next: WorkspaceState = { ...cur, chartSymbol: up }
    set({ state: next })
    persist(next)
  },

  setLandingWorkspace: (ws) => {
    if (!(WORKSPACE_TABS as readonly string[]).includes(ws)) return
    const cur = get().state
    if (cur.landingWorkspace === ws) return
    const next: WorkspaceState = { ...cur, landingWorkspace: ws }
    set({ state: next })
    persist(next)
  },

  toggleRail: (id) => {
    const cur = get().state
    const isCollapsed = cur.collapsedRails.includes(id)
    const collapsedRails = isCollapsed
      ? cur.collapsedRails.filter((r) => r !== id)
      : [...cur.collapsedRails, id]
    const next: WorkspaceState = { ...cur, collapsedRails }
    set({ state: next })
    persist(next)
  },

  hydrate: async () => {
    try {
      const fromDisk = await window.satex?.workspace?.getState()
      if (fromDisk) set({ state: fromDisk, hydrated: true })
      else set({ hydrated: true })
    } catch (err) {
      console.warn('[workspace] hydrate failed — using defaults', err)
      set({ hydrated: true })
    }
  },
}))
