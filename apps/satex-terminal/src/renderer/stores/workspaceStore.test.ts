/**
 * workspaceStore contract tests (P-050).
 *
 * Pins the pure setter/hydrate logic of the workspace-state store: tab
 * validation against WORKSPACE_TABS (incl. the P-048 'Intel' tab), the
 * Quad-pane uniqueness-swap invariant, uppercase normalization, no-op
 * short-circuits (no redundant persist), the additive `landingWorkspace`
 * field (P-048), and hydrate's fall-back-to-defaults behavior on empty or
 * failing IPC. Store source is byte-for-byte unchanged by this test.
 *
 * Convention mirrors `dataSourceStore.test.ts`: `vi.stubGlobal('window', …)`
 * + `useWorkspaceStore.setState(…)` reset per test.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useWorkspaceStore } from './workspaceStore'
import { DEFAULT_WORKSPACE_STATE, type Workspace, type WorkspaceState } from '@shared/types'

function freshDefaults(): WorkspaceState {
  return {
    ...DEFAULT_WORKSPACE_STATE,
    quadSymbols: [...DEFAULT_WORKSPACE_STATE.quadSymbols],
    collapsedRails: [...DEFAULT_WORKSPACE_STATE.collapsedRails],
  }
}

function stubSatex(overrides: { getState?: ReturnType<typeof vi.fn> } = {}) {
  const setState = vi.fn().mockResolvedValue(undefined)
  const getState = overrides.getState ?? vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('window', { satex: { workspace: { setState, getState } } })
  return { setState, getState }
}

beforeEach(() => {
  useWorkspaceStore.setState({ state: freshDefaults(), hydrated: false })
})
afterEach(() => vi.unstubAllGlobals())

describe('workspaceStore.setWorkspace', () => {
  it('adopts a valid tab and persists the next state', () => {
    const { setState } = stubSatex()
    useWorkspaceStore.getState().setWorkspace('Focus')
    expect(useWorkspaceStore.getState().state.workspace).toBe('Focus')
    expect(setState).toHaveBeenCalledTimes(1)
    expect(setState).toHaveBeenCalledWith(expect.objectContaining({ workspace: 'Focus' }))
  })

  it('rejects a tab not in WORKSPACE_TABS (no change, no persist)', () => {
    const { setState } = stubSatex()
    useWorkspaceStore.getState().setWorkspace('Bogus' as Workspace)
    expect(useWorkspaceStore.getState().state.workspace).toBe(DEFAULT_WORKSPACE_STATE.workspace)
    expect(setState).not.toHaveBeenCalled()
  })

  it('no-ops when already on the target tab (no persist)', () => {
    const { setState } = stubSatex()
    useWorkspaceStore.getState().setWorkspace(DEFAULT_WORKSPACE_STATE.workspace)
    expect(setState).not.toHaveBeenCalled()
  })
})

describe('workspaceStore.setQuadSymbols', () => {
  it('rejects an array that is not exactly 4 symbols', () => {
    const { setState } = stubSatex()
    useWorkspaceStore.getState().setQuadSymbols(['AAPL', 'MSFT'])
    expect(useWorkspaceStore.getState().state.quadSymbols).toEqual(DEFAULT_WORKSPACE_STATE.quadSymbols)
    expect(setState).not.toHaveBeenCalled()
  })

  it('rejects non-array input', () => {
    const { setState } = stubSatex()
    useWorkspaceStore.getState().setQuadSymbols('AAPL' as unknown as string[])
    expect(useWorkspaceStore.getState().state.quadSymbols).toEqual(DEFAULT_WORKSPACE_STATE.quadSymbols)
    expect(setState).not.toHaveBeenCalled()
  })

  it('uppercases all four symbols and persists', () => {
    const { setState } = stubSatex()
    useWorkspaceStore.getState().setQuadSymbols(['aapl', 'msft', 'tsla', 'amzn'])
    expect(useWorkspaceStore.getState().state.quadSymbols).toEqual(['AAPL', 'MSFT', 'TSLA', 'AMZN'])
    expect(setState).toHaveBeenCalledTimes(1)
  })

  it('no-ops when the cleaned set equals the current set (case-insensitive)', () => {
    const { setState } = stubSatex()
    const lower = DEFAULT_WORKSPACE_STATE.quadSymbols.map(s => s.toLowerCase())
    useWorkspaceStore.getState().setQuadSymbols(lower)
    expect(setState).not.toHaveBeenCalled()
  })
})

describe('workspaceStore.setQuadSymbolAt — uniqueness invariant', () => {
  it('no-ops when the pane already shows the symbol (case-insensitive)', () => {
    const { setState } = stubSatex()
    useWorkspaceStore.getState().setQuadSymbolAt(0, 'nvda')
    expect(setState).not.toHaveBeenCalled()
    expect(useWorkspaceStore.getState().state.quadSymbols).toEqual(DEFAULT_WORKSPACE_STATE.quadSymbols)
  })

  it('replaces the pane with a new unique symbol, uppercased', () => {
    const { setState } = stubSatex()
    useWorkspaceStore.getState().setQuadSymbolAt(3, 'eth')
    expect(useWorkspaceStore.getState().state.quadSymbols).toEqual(['NVDA', 'SPY', 'ES', 'ETH'])
    expect(setState).toHaveBeenCalledTimes(1)
  })

  it('swaps panes when the symbol already lives in another pane (never loses a slot)', () => {
    const { setState } = stubSatex()
    // Default quad: ['NVDA','SPY','ES','BTC'] — putting SPY into pane 0 must
    // move NVDA into SPY's old pane rather than duplicating SPY.
    useWorkspaceStore.getState().setQuadSymbolAt(0, 'SPY')
    expect(useWorkspaceStore.getState().state.quadSymbols).toEqual(['SPY', 'NVDA', 'ES', 'BTC'])
    expect(setState).toHaveBeenCalledTimes(1)
  })
})

describe('workspaceStore.setChartSymbol', () => {
  it('uppercases and persists a new symbol; no-ops on the same symbol', () => {
    const { setState } = stubSatex()
    useWorkspaceStore.getState().setChartSymbol('sol')
    expect(useWorkspaceStore.getState().state.chartSymbol).toBe('SOL')
    expect(setState).toHaveBeenCalledTimes(1)
    useWorkspaceStore.getState().setChartSymbol('SOL')
    expect(setState).toHaveBeenCalledTimes(1) // unchanged — second call was a no-op
  })
})

describe('workspaceStore.setLandingWorkspace (P-048 additive field)', () => {
  it("accepts the P-048 'Intel' tab and persists", () => {
    const { setState } = stubSatex()
    useWorkspaceStore.getState().setLandingWorkspace('Intel')
    expect(useWorkspaceStore.getState().state.landingWorkspace).toBe('Intel')
    expect(setState).toHaveBeenCalledWith(expect.objectContaining({ landingWorkspace: 'Intel' }))
  })

  it('rejects an invalid tab and no-ops on the current value', () => {
    const { setState } = stubSatex()
    useWorkspaceStore.getState().setLandingWorkspace('Nope' as Workspace)
    expect(useWorkspaceStore.getState().state.landingWorkspace).toBe(DEFAULT_WORKSPACE_STATE.landingWorkspace)
    useWorkspaceStore.getState().setLandingWorkspace(DEFAULT_WORKSPACE_STATE.landingWorkspace)
    expect(setState).not.toHaveBeenCalled()
  })
})

describe('workspaceStore.hydrate', () => {
  it('adopts the state returned from disk and flags hydrated', async () => {
    const fromDisk: WorkspaceState = {
      version: 1,
      workspace: 'Markets',
      quadSymbols: ['A', 'B', 'C', 'D'],
      chartSymbol: 'GC',
      landingWorkspace: 'Intel',
      collapsedRails: ['exec', 'news'],
    }
    stubSatex({ getState: vi.fn().mockResolvedValue(fromDisk) })
    await useWorkspaceStore.getState().hydrate()
    expect(useWorkspaceStore.getState().state).toEqual(fromDisk)
    expect(useWorkspaceStore.getState().hydrated).toBe(true)
  })

  it('keeps defaults but still flags hydrated when disk returns nothing', async () => {
    stubSatex({ getState: vi.fn().mockResolvedValue(undefined) })
    await useWorkspaceStore.getState().hydrate()
    expect(useWorkspaceStore.getState().state).toEqual(DEFAULT_WORKSPACE_STATE)
    expect(useWorkspaceStore.getState().hydrated).toBe(true)
  })

  it('keeps defaults and flags hydrated when the IPC read throws (no crash)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    stubSatex({ getState: vi.fn().mockRejectedValue(new Error('bridge down')) })
    await useWorkspaceStore.getState().hydrate()
    expect(useWorkspaceStore.getState().state).toEqual(DEFAULT_WORKSPACE_STATE)
    expect(useWorkspaceStore.getState().hydrated).toBe(true)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('workspaceStore.toggleRail', () => {
  it('collapses a rail not yet in collapsedRails and persists the next state', () => {
    const { setState } = stubSatex()
    useWorkspaceStore.getState().toggleRail('depth')
    expect(useWorkspaceStore.getState().state.collapsedRails).toEqual(['depth'])
    expect(setState).toHaveBeenCalledTimes(1)
    expect(setState).toHaveBeenCalledWith(expect.objectContaining({ collapsedRails: ['depth'] }))
  })

  it('re-expands a rail already collapsed (toggle is symmetric)', () => {
    const { setState } = stubSatex()
    useWorkspaceStore.getState().toggleRail('depth')
    useWorkspaceStore.getState().toggleRail('depth')
    expect(useWorkspaceStore.getState().state.collapsedRails).toEqual([])
    expect(setState).toHaveBeenCalledTimes(2)
  })

  it('tracks multiple independently-collapsed rails without disturbing each other', () => {
    stubSatex()
    useWorkspaceStore.getState().toggleRail('depth')
    useWorkspaceStore.getState().toggleRail('news')
    useWorkspaceStore.getState().toggleRail('health')
    expect(useWorkspaceStore.getState().state.collapsedRails).toEqual(['depth', 'news', 'health'])
    useWorkspaceStore.getState().toggleRail('news')
    expect(useWorkspaceStore.getState().state.collapsedRails).toEqual(['depth', 'health'])
  })

  it('never mutates the shared DEFAULT_WORKSPACE_STATE.collapsedRails reference (P-061 aliasing class)', () => {
    stubSatex()
    useWorkspaceStore.getState().toggleRail('risk')
    expect(DEFAULT_WORKSPACE_STATE.collapsedRails).toEqual([])
  })
})
