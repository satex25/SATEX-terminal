/**
 * SATEX — drawingStore (CHART-03 · CHART-09)
 *
 * Zustand store managing all chart drawings.
 *
 * Design decisions (§3.4 / D4):
 *  - Drawings keyed by symbol: clearing/loading one symbol does not disturb others.
 *  - Undo/redo is an immutable snapshot stack, capped at UNDO_DEPTH = 100.
 *  - "Ephemeral-first" (D4): drawings live in memory; explicit operator-save
 *    triggers the IPC `CHART_DRAWINGS_SET` channel.
 *  - Active drawing tool (CHART-03 toolbar) lives here too; ChartPanel reads it
 *    to decide pointer-event routing.
 *
 * Constitutional invariants:
 *  - State is Zustand, not Redux (CLAUDE.md).
 *  - No cross-store coupling — consumers read via hooks.
 */
import { create } from 'zustand'
import type { Drawing, DrawingTool } from './DrawingModel'

// ── Config ────────────────────────────────────────────────────────────────────

const UNDO_DEPTH = 100

// ── Types ─────────────────────────────────────────────────────────────────────

/** Per-symbol drawing collection (the unit that goes into undo snapshots). */
export type SymbolDrawings = Map<string, Drawing>

/** One undo-stack frame: a full snapshot of drawings for the active symbol. */
type UndoFrame = readonly Drawing[]

interface DrawingStoreState {
  /** symbol -> drawings. Outer Map mutated only via store actions. */
  drawings:   Record<string, Drawing[]>
  /** Currently active drawing tool (CHART-03). */
  activeTool: DrawingTool
  /** Symbol whose undo stack is active. */
  undoSymbol: string
  /** Undo history (past states). Front = most recent. */
  undoStack:  UndoFrame[]
  /** Redo history (states that were undone). */
  redoStack:  UndoFrame[]

  // ── Actions ──────────────────────────────────────────────────────────────

  /** Return all drawings for a symbol (or []). */
  getDrawings: (symbol: string) => Drawing[]

  /** Add a drawing for a symbol (pushes undo frame). */
  addDrawing:  (symbol: string, drawing: Drawing) => void

  /** Update a drawing by id (pushes undo frame). */
  updateDrawing: (symbol: string, id: string, patch: Partial<Drawing>) => void

  /** Remove a drawing by id (pushes undo frame). */
  removeDrawing: (symbol: string, id: string) => void

  /** Select a drawing by id (deselects all others). Does NOT push undo. */
  selectDrawing: (symbol: string, id: string | null) => void

  /** Clear all drawings for a symbol (pushes undo frame). */
  clearSymbol: (symbol: string) => void

  /** Set the active drawing tool (CHART-03). */
  setActiveTool: (tool: DrawingTool) => void

  /** Undo last action for the active symbol. */
  undo: (symbol: string) => void

  /** Redo last undone action for the active symbol. */
  redo: (symbol: string) => void

  /** Replace drawings for a symbol without pushing undo (used on IPC restore). */
  loadDrawings: (symbol: string, drawings: Drawing[]) => void

  /** Return true if undo is available for symbol. */
  canUndo: (symbol: string) => boolean

  /** Return true if redo is available for symbol. */
  canRedo: (symbol: string) => boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pushUndo(
  undoStack: UndoFrame[],
  _redoStack: UndoFrame[],
  snapshot: Drawing[],
): { undoStack: UndoFrame[]; redoStack: UndoFrame[] } {
  const next = [snapshot as UndoFrame, ...undoStack].slice(0, UNDO_DEPTH)
  return { undoStack: next, redoStack: [] }  // new action clears redo
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useDrawingStore = create<DrawingStoreState>((set, get) => ({
  drawings:   {},
  activeTool: 'select',
  undoSymbol: '',
  undoStack:  [],
  redoStack:  [],

  getDrawings: (symbol) => get().drawings[symbol] ?? [],

  addDrawing: (symbol, drawing) => {
    const state    = get()
    const existing = state.drawings[symbol] ?? []
    const { undoStack, redoStack } = pushUndo(state.undoStack, state.redoStack, existing)
    set({
      drawings:  { ...state.drawings, [symbol]: [...existing, drawing] },
      undoSymbol: symbol,
      undoStack,
      redoStack,
    })
  },

  updateDrawing: (symbol, id, patch) => {
    const state    = get()
    const existing = state.drawings[symbol] ?? []
    const { undoStack, redoStack } = pushUndo(state.undoStack, state.redoStack, existing)
    set({
      drawings: {
        ...state.drawings,
        [symbol]: existing.map((d) => d.id === id ? { ...d, ...patch } as Drawing : d),
      },
      undoSymbol: symbol,
      undoStack,
      redoStack,
    })
  },

  removeDrawing: (symbol, id) => {
    const state    = get()
    const existing = state.drawings[symbol] ?? []
    const { undoStack, redoStack } = pushUndo(state.undoStack, state.redoStack, existing)
    set({
      drawings:   { ...state.drawings, [symbol]: existing.filter((d) => d.id !== id) },
      undoSymbol: symbol,
      undoStack,
      redoStack,
    })
  },

  selectDrawing: (symbol, id) => {
    const state    = get()
    const existing = state.drawings[symbol] ?? []
    set({
      drawings: {
        ...state.drawings,
        [symbol]: existing.map((d) => ({ ...d, selected: d.id === id })),
      },
    })
  },

  clearSymbol: (symbol) => {
    const state    = get()
    const existing = state.drawings[symbol] ?? []
    const { undoStack, redoStack } = pushUndo(state.undoStack, state.redoStack, existing)
    set({
      drawings:   { ...state.drawings, [symbol]: [] },
      undoSymbol: symbol,
      undoStack,
      redoStack,
    })
  },

  setActiveTool: (tool) => set({ activeTool: tool }),

  undo: (symbol) => {
    const state = get()
    if (state.undoStack.length === 0) return
    const [prev, ...rest] = state.undoStack
    const current = state.drawings[symbol] ?? []
    set({
      drawings:  { ...state.drawings, [symbol]: [...(prev ?? [])] },
      undoSymbol: symbol,
      undoStack:  rest,
      redoStack:  [current as UndoFrame, ...state.redoStack].slice(0, UNDO_DEPTH),
    })
  },

  redo: (symbol) => {
    const state = get()
    if (state.redoStack.length === 0) return
    const [next, ...rest] = state.redoStack
    const current = state.drawings[symbol] ?? []
    set({
      drawings:  { ...state.drawings, [symbol]: [...(next ?? [])] },
      undoSymbol: symbol,
      undoStack:  [current as UndoFrame, ...state.undoStack].slice(0, UNDO_DEPTH),
      redoStack:  rest,
    })
  },

  loadDrawings: (symbol, drawings) => {
    const state = get()
    set({ drawings: { ...state.drawings, [symbol]: drawings } })
  },

  canUndo: (symbol) => {
    const { undoSymbol, undoStack } = get()
    return undoStack.length > 0 && undoSymbol === symbol
  },

  canRedo: (symbol) => {
    const { undoSymbol, redoStack } = get()
    return redoStack.length > 0 && undoSymbol === symbol
  },
}))

// ── Selectors ───────────────────────────────────────────────────────────────────
//
// useSyncExternalStore (Zustand v5) requires selectors to return stable references for
// the same state — `?? []` mints a new array on every call and breaks the snapshot-cache
// invariant, causing infinite render loops (same pitfall solved by EMPTY_CANDLES in
// marketStore). Subscribe via this selector so an empty symbol yields one frozen array.

const EMPTY_DRAWINGS: readonly Drawing[] = Object.freeze([])

/** Stable per-symbol drawings selector for React subscriptions. */
export const selectDrawings = (symbol: string) => (s: DrawingStoreState): readonly Drawing[] =>
  s.drawings[symbol] ?? EMPTY_DRAWINGS
