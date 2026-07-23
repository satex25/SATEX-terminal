// @vitest-environment jsdom
/**
 * SATEX — DrawingToolbar characterization suite (P-129 chart-jsdom-harness wave 2).
 *
 * Renders real DOM (buttons) against the REAL `drawingStore` (Zustand) — no
 * mocking, following the useIPC.test.tsx precedent of spying on a real
 * store's actions. Pins tool selection, aria-pressed reflection, and the
 * undo/redo/clear button wiring including the disabled-state gates.
 *
 * Subject `DrawingToolbar.tsx` is READ-ONLY here (byte-unchanged). jsdom env.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { useDrawingStore } from './drawingStore'
import { DrawingToolbar } from './DrawingToolbar'
import type { LineDraw } from './DrawingModel'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

const SYMBOL = 'BTCUSD'

function line(id: string): LineDraw {
  return {
    id, kind: 'line', symbol: SYMBOL, selected: false, locked: false, extend: false,
    a: { time: 1, price: 1 }, b: { time: 2, price: 2 },
  }
}

function mount() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => { root.render(createElement(DrawingToolbar, { symbol: SYMBOL })) })
  return {
    container,
    unmount: () => { act(() => { root.unmount() }); container.remove() },
  }
}

function reset() {
  useDrawingStore.setState({ drawings: {}, activeTool: 'select', undoSymbol: '', undoStack: [], redoStack: [] })
}

beforeEach(reset)
afterEach(() => { vi.restoreAllMocks() })

describe('DrawingToolbar — structure', () => {
  it('renders a labelled toolbar with all 7 tool buttons + undo/redo/clear', () => {
    const { container, unmount } = mount()
    const toolbar = container.querySelector('[role="toolbar"]')
    expect(toolbar).not.toBeNull()
    expect(toolbar!.getAttribute('aria-label')).toBe('Chart drawing tools')
    const buttons = container.querySelectorAll('button')
    expect(buttons.length).toBe(10) // 7 tools + undo + redo + clear
    unmount()
  })

  it('marks the active tool aria-pressed=true and all others false', () => {
    useDrawingStore.setState({ activeTool: 'hline' })
    const { container, unmount } = mount()
    const hlineBtn = container.querySelector('button[title="Horizontal line"]')!
    const lineBtn  = container.querySelector('button[title="Trend line"]')!
    expect(hlineBtn.getAttribute('aria-pressed')).toBe('true')
    expect(lineBtn.getAttribute('aria-pressed')).toBe('false')
    unmount()
  })
})

describe('DrawingToolbar — tool selection', () => {
  it('clicking a tool button calls setActiveTool with that key', () => {
    const setActiveTool = vi.spyOn(useDrawingStore.getState(), 'setActiveTool')
    const { container, unmount } = mount()
    const fibBtn = container.querySelector('button[title="Fibonacci retracement"]') as HTMLButtonElement
    act(() => { fibBtn.click() })
    expect(setActiveTool).toHaveBeenCalledWith('fibonacci')
    unmount()
  })

  it('reflects the store change back into aria-pressed after a real click', () => {
    const { container, unmount } = mount()
    const rectBtn = container.querySelector('button[title="Rectangle"]') as HTMLButtonElement
    expect(rectBtn.getAttribute('aria-pressed')).toBe('false')
    act(() => { rectBtn.click() })
    expect(rectBtn.getAttribute('aria-pressed')).toBe('true')
    expect(useDrawingStore.getState().activeTool).toBe('rect')
    unmount()
  })
})

describe('DrawingToolbar — undo/redo gating', () => {
  it('undo/redo are disabled when there is nothing to undo/redo for this symbol', () => {
    const { container, unmount } = mount()
    const undoBtn = container.querySelector('button[title="Undo last drawing action"]') as HTMLButtonElement
    const redoBtn = container.querySelector('button[title="Redo"]') as HTMLButtonElement
    expect(undoBtn.disabled).toBe(true)
    expect(redoBtn.disabled).toBe(true)
    unmount()
  })

  it('enables undo after an action on this symbol; clicking it invokes undo(symbol)', () => {
    useDrawingStore.getState().addDrawing(SYMBOL, line('l1'))
    const undo = vi.spyOn(useDrawingStore.getState(), 'undo')
    const { container, unmount } = mount()
    const undoBtn = container.querySelector('button[title="Undo last drawing action"]') as HTMLButtonElement
    expect(undoBtn.disabled).toBe(false)
    act(() => { undoBtn.click() })
    expect(undo).toHaveBeenCalledWith(SYMBOL)
    unmount()
  })

  it('does not gate undo/redo on a different symbol\'s history (per-symbol via undoSymbol)', () => {
    useDrawingStore.getState().addDrawing('OTHER_SYMBOL', line('l1'))
    const { container, unmount } = mount() // mounted for SYMBOL
    const undoBtn = container.querySelector('button[title="Undo last drawing action"]') as HTMLButtonElement
    expect(undoBtn.disabled).toBe(true)
    unmount()
  })

  it('enables redo after an undo, and clicking it invokes redo(symbol)', () => {
    useDrawingStore.getState().addDrawing(SYMBOL, line('l1'))
    useDrawingStore.getState().undo(SYMBOL)
    const redo = vi.spyOn(useDrawingStore.getState(), 'redo')
    const { container, unmount } = mount()
    const redoBtn = container.querySelector('button[title="Redo"]') as HTMLButtonElement
    expect(redoBtn.disabled).toBe(false)
    act(() => { redoBtn.click() })
    expect(redo).toHaveBeenCalledWith(SYMBOL)
    unmount()
  })
})

describe('DrawingToolbar — clear', () => {
  it('the clear button is always enabled and invokes clearSymbol(symbol)', () => {
    const clearSymbol = vi.spyOn(useDrawingStore.getState(), 'clearSymbol')
    const { container, unmount } = mount()
    const clearBtn = container.querySelector('button[title="Clear all drawings for this symbol"]') as HTMLButtonElement
    expect(clearBtn.disabled).toBe(false)
    act(() => { clearBtn.click() })
    expect(clearSymbol).toHaveBeenCalledWith(SYMBOL)
    unmount()
  })

  it('clearing actually empties this symbol\'s drawings in the real store', () => {
    useDrawingStore.getState().addDrawing(SYMBOL, line('l1'))
    const { container, unmount } = mount()
    const clearBtn = container.querySelector('button[title="Clear all drawings for this symbol"]') as HTMLButtonElement
    act(() => { clearBtn.click() })
    expect(useDrawingStore.getState().getDrawings(SYMBOL)).toEqual([])
    unmount()
  })
})
