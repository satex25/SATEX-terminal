/**
 * SATEX — drawingStore unit tests (CHART-03 · CHART-09)
 *
 * Tests undo/redo, CRUD operations, and symbol isolation.
 * Uses Zustand directly (no DOM required).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useDrawingStore, selectDrawings } from './drawingStore'
import type { Drawing, LineDraw } from './DrawingModel'

function line(id: string, symbol = 'AAPL'): LineDraw {
  return {
    id, kind: 'line', symbol,
    a: { time: 1000, price: 150 },
    b: { time: 2000, price: 160 },
    extend: false, selected: false, locked: false,
  }
}

describe('drawingStore - CRUD', () => {
  beforeEach(() => {
    useDrawingStore.setState({
      drawings: {}, activeTool: 'select',
      undoSymbol: '', undoStack: [], redoStack: [],
    })
  })

  it('getDrawings returns [] for unknown symbol', () => {
    expect(useDrawingStore.getState().getDrawings('TSLA')).toEqual([])
  })

  it('addDrawing appends to symbol slice', () => {
    useDrawingStore.getState().addDrawing('AAPL', line('d1'))
    expect(useDrawingStore.getState().getDrawings('AAPL')).toHaveLength(1)
  })

  it('addDrawing does not affect other symbols', () => {
    useDrawingStore.getState().addDrawing('AAPL', line('d1'))
    expect(useDrawingStore.getState().getDrawings('MSFT')).toEqual([])
  })

  it('removeDrawing removes by id', () => {
    useDrawingStore.getState().addDrawing('AAPL', line('d1'))
    useDrawingStore.getState().addDrawing('AAPL', line('d2'))
    useDrawingStore.getState().removeDrawing('AAPL', 'd1')
    const result = useDrawingStore.getState().getDrawings('AAPL')
    expect(result).toHaveLength(1)
    expect(result[0]?.id).toBe('d2')
  })

  it('updateDrawing patches a drawing by id', () => {
    useDrawingStore.getState().addDrawing('AAPL', line('d1'))
    useDrawingStore.getState().updateDrawing('AAPL', 'd1', { color: '#ff0000' })
    const result = useDrawingStore.getState().getDrawings('AAPL')
    expect(result[0]?.color).toBe('#ff0000')
    expect(result[0]?.id).toBe('d1')
  })

  it('selectDrawing deselects all others', () => {
    useDrawingStore.getState().addDrawing('AAPL', line('d1'))
    useDrawingStore.getState().addDrawing('AAPL', line('d2'))
    useDrawingStore.getState().selectDrawing('AAPL', 'd1')
    const [a, b] = useDrawingStore.getState().getDrawings('AAPL')
    expect(a?.selected).toBe(true)
    expect(b?.selected).toBe(false)
  })

  it('clearSymbol removes all drawings for symbol', () => {
    useDrawingStore.getState().addDrawing('AAPL', line('d1'))
    useDrawingStore.getState().addDrawing('AAPL', line('d2'))
    useDrawingStore.getState().clearSymbol('AAPL')
    expect(useDrawingStore.getState().getDrawings('AAPL')).toEqual([])
  })

  it('setActiveTool updates activeTool', () => {
    useDrawingStore.getState().setActiveTool('line')
    expect(useDrawingStore.getState().activeTool).toBe('line')
  })

  it('loadDrawings replaces without pushing undo', () => {
    const drawings: Drawing[] = [line('d1')]
    useDrawingStore.getState().loadDrawings('AAPL', drawings)
    expect(useDrawingStore.getState().getDrawings('AAPL')).toHaveLength(1)
    expect(useDrawingStore.getState().undoStack).toHaveLength(0)
  })
})

describe('drawingStore - undo/redo (CHART-09)', () => {
  beforeEach(() => {
    useDrawingStore.setState({
      drawings: {}, activeTool: 'select',
      undoSymbol: '', undoStack: [], redoStack: [],
    })
  })

  it('undo reverts addDrawing', () => {
    useDrawingStore.getState().addDrawing('AAPL', line('d1'))
    expect(useDrawingStore.getState().getDrawings('AAPL')).toHaveLength(1)
    useDrawingStore.getState().undo('AAPL')
    expect(useDrawingStore.getState().getDrawings('AAPL')).toHaveLength(0)
  })

  it('redo re-applies undone addDrawing', () => {
    useDrawingStore.getState().addDrawing('AAPL', line('d1'))
    useDrawingStore.getState().undo('AAPL')
    useDrawingStore.getState().redo('AAPL')
    expect(useDrawingStore.getState().getDrawings('AAPL')).toHaveLength(1)
  })

  it('new action after undo clears the redo stack', () => {
    useDrawingStore.getState().addDrawing('AAPL', line('d1'))
    useDrawingStore.getState().undo('AAPL')
    useDrawingStore.getState().addDrawing('AAPL', line('d2'))
    expect(useDrawingStore.getState().redoStack).toHaveLength(0)
  })

  it('undo is a no-op when stack is empty', () => {
    expect(() => useDrawingStore.getState().undo('AAPL')).not.toThrow()
  })

  it('redo is a no-op when stack is empty', () => {
    expect(() => useDrawingStore.getState().redo('AAPL')).not.toThrow()
  })

  it('canUndo returns true after addDrawing', () => {
    useDrawingStore.getState().addDrawing('AAPL', line('d1'))
    expect(useDrawingStore.getState().canUndo('AAPL')).toBe(true)
  })

  it('canRedo returns true after undo', () => {
    useDrawingStore.getState().addDrawing('AAPL', line('d1'))
    useDrawingStore.getState().undo('AAPL')
    expect(useDrawingStore.getState().canRedo('AAPL')).toBe(true)
  })

  it('undo stack does not exceed UNDO_DEPTH=100', () => {
    for (let i = 0; i < 110; i++) {
      useDrawingStore.getState().addDrawing('AAPL', line(`d${i}`))
    }
    expect(useDrawingStore.getState().undoStack.length).toBeLessThanOrEqual(100)
  })

  it('multi-level undo/redo round-trips correctly', () => {
    useDrawingStore.getState().addDrawing('AAPL', line('d1'))
    useDrawingStore.getState().addDrawing('AAPL', line('d2'))
    useDrawingStore.getState().addDrawing('AAPL', line('d3'))
    useDrawingStore.getState().undo('AAPL')
    useDrawingStore.getState().undo('AAPL')
    expect(useDrawingStore.getState().getDrawings('AAPL')).toHaveLength(1)
    useDrawingStore.getState().redo('AAPL')
    expect(useDrawingStore.getState().getDrawings('AAPL')).toHaveLength(2)
  })
})

describe('drawingStore - selectDrawings snapshot stability', () => {
  beforeEach(() => {
    useDrawingStore.setState({
      drawings: {}, activeTool: 'select',
      undoSymbol: '', undoStack: [], redoStack: [],
    })
  })

  // Regression: an inline `s.drawings[symbol] ?? []` selector mints a fresh
  // array each call, breaking the useSyncExternalStore snapshot-cache invariant
  // and looping <DrawingLayer> into "Maximum update depth exceeded" on every
  // boot (default symbol has no drawings). selectDrawings must return a stable
  // reference for an empty symbol so React sees an unchanged snapshot.
  it('returns a stable reference for an empty symbol across calls', () => {
    const state = useDrawingStore.getState()
    const a = selectDrawings('TSLA')(state)
    const b = selectDrawings('TSLA')(state)
    expect(a).toBe(b)
    expect(a).toEqual([])
  })

  it('returns the same stable empty reference across distinct empty symbols', () => {
    const state = useDrawingStore.getState()
    expect(selectDrawings('TSLA')(state)).toBe(selectDrawings('NVDA')(state))
  })

  it('returns the live array when the symbol has drawings', () => {
    useDrawingStore.getState().addDrawing('AAPL', line('d1'))
    const state = useDrawingStore.getState()
    const result = selectDrawings('AAPL')(state)
    expect(result).toHaveLength(1)
    expect(result).toBe(state.drawings['AAPL'])
  })
})
