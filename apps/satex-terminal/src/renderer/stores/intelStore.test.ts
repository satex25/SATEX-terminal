/**
 * intelStore contract tests (P-052).
 *
 * Pins the research-symbol + snapshot lifecycle of the Intel analytics store:
 * uppercase normalization, the case-insensitive no-op short-circuit, and the
 * stale-snapshot-clearing invariant — changing the analysis symbol must clear
 * the previous symbol's snapshot so an Intel module never renders another
 * symbol's numbers for a frame. Store source is byte-for-byte unchanged.
 *
 * Convention mirrors `dataSourceStore.test.ts`: direct
 * `useIntelStore.setState(...)` reset per test; the store is pure (no IPC).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useIntelStore } from './intelStore'
import type { IntelSnapshot } from '@shared/types'

function makeSnapshot(symbol: string): IntelSnapshot {
  return {
    symbol,
    computedAt: 1_000,
    calibration: null,
    regime: null,
    macro: null,
    attribution: null,
    weightDrift: null,
    correlation: null,
    microstructure: null,
    scenario: null,
  }
}

beforeEach(() => {
  useIntelStore.setState({ symbol: 'NVDA', snapshot: null, lastUpdated: 0 })
})
afterEach(() => vi.restoreAllMocks())

describe('intelStore initial contract', () => {
  it('starts on NVDA with no snapshot and lastUpdated 0', () => {
    const s = useIntelStore.getState()
    expect(s.symbol).toBe('NVDA')
    expect(s.snapshot).toBeNull()
    expect(s.lastUpdated).toBe(0)
  })
})

describe('intelStore.setSymbol', () => {
  it('uppercases and adopts a new symbol', () => {
    useIntelStore.getState().setSymbol('spy')
    expect(useIntelStore.getState().symbol).toBe('SPY')
  })

  it('clears the stale snapshot and lastUpdated when the symbol changes', () => {
    useIntelStore.setState({ snapshot: makeSnapshot('NVDA'), lastUpdated: 42 })
    useIntelStore.getState().setSymbol('TSLA')
    const s = useIntelStore.getState()
    expect(s.symbol).toBe('TSLA')
    expect(s.snapshot).toBeNull()
    expect(s.lastUpdated).toBe(0)
  })

  it('no-ops on the same symbol — the snapshot survives', () => {
    const snap = makeSnapshot('NVDA')
    useIntelStore.setState({ snapshot: snap, lastUpdated: 42 })
    useIntelStore.getState().setSymbol('NVDA')
    const s = useIntelStore.getState()
    expect(s.snapshot).toBe(snap)
    expect(s.lastUpdated).toBe(42)
  })

  it('the no-op is case-insensitive (lowercase input, same symbol)', () => {
    const snap = makeSnapshot('NVDA')
    useIntelStore.setState({ snapshot: snap, lastUpdated: 42 })
    useIntelStore.getState().setSymbol('nvda')
    const s = useIntelStore.getState()
    expect(s.symbol).toBe('NVDA')
    expect(s.snapshot).toBe(snap)
  })
})

describe('intelStore.setSnapshot', () => {
  it('stores the snapshot and stamps lastUpdated with Date.now()', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000)
    const snap = makeSnapshot('NVDA')
    useIntelStore.getState().setSnapshot(snap)
    const s = useIntelStore.getState()
    expect(s.snapshot).toBe(snap)
    expect(s.lastUpdated).toBe(1_700_000)
  })

  it('accepts null (poll gap) and still stamps lastUpdated', () => {
    useIntelStore.setState({ snapshot: makeSnapshot('NVDA'), lastUpdated: 42 })
    vi.spyOn(Date, 'now').mockReturnValue(2_000_000)
    useIntelStore.getState().setSnapshot(null)
    const s = useIntelStore.getState()
    expect(s.snapshot).toBeNull()
    expect(s.lastUpdated).toBe(2_000_000)
  })
})
