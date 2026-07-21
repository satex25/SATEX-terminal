/**
 * SATEX — Regime snapshot store characterization coverage.
 *
 * Pins the REGIME_UPDATE reducer: snapshot starts null until the first push,
 * and setSnapshot replaces by reference. Display-only state (routes no order).
 */
import { beforeEach, describe, expect, it } from 'vitest'
import type { RegimeSnapshot } from '@shared/types'
import { useRegimeStore } from './regimeStore'

function snapshot(symbol = 'AAPL'): RegimeSnapshot {
  const metric = { v: 0.5, label: 'mid', trend: 0 }
  return {
    state: 'EXPANSION · LONDON LIQUIDITY',
    session: 'LONDON',
    symbol,
    liquidity: metric,
    spread: metric,
    volatility: metric,
    trend: metric,
    hmm: [{ name: 'EXPANSION', p: 1 }],
    lastSwitchUtc: null,
    computedAt: 0,
  }
}

beforeEach(() => {
  useRegimeStore.setState(useRegimeStore.getInitialState(), true)
})

describe('regimeStore', () => {
  it('seeds a null snapshot (nothing until the first push)', () => {
    expect(useRegimeStore.getState().snapshot).toBeNull()
  })

  it('setSnapshot stores the snapshot by reference', () => {
    const s = snapshot()
    useRegimeStore.getState().setSnapshot(s)
    expect(useRegimeStore.getState().snapshot).toBe(s)
  })

  it('a second setSnapshot replaces the previous', () => {
    const a = snapshot('AAPL')
    const b = snapshot('MSFT')
    useRegimeStore.getState().setSnapshot(a)
    useRegimeStore.getState().setSnapshot(b)
    expect(useRegimeStore.getState().snapshot).toBe(b)
  })
})
