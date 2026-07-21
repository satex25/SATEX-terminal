/**
 * SATEX — L2 depth snapshot store characterization coverage.
 *
 * Pins the DEPTH_UPDATE reducer: snapshot starts null until the first push, and
 * setSnapshot replaces by reference. Display-only state (routes no order).
 */
import { beforeEach, describe, expect, it } from 'vitest'
import type { DepthSnapshot } from '@shared/types'
import { useDepthStore } from './depthStore'

function snapshot(symbol = 'AAPL'): DepthSnapshot {
  return {
    symbol,
    mid: 100,
    spread: 0.02,
    vpin: 0.1,
    asks: [{ p: 100.01, size: 10, tot: 10 }],
    bids: [{ p: 99.99, size: 10, tot: 10 }],
    computedAt: 0,
  }
}

beforeEach(() => {
  useDepthStore.setState(useDepthStore.getInitialState(), true)
})

describe('depthStore', () => {
  it('seeds a null snapshot (nothing until the first push)', () => {
    expect(useDepthStore.getState().snapshot).toBeNull()
  })

  it('setSnapshot stores the snapshot by reference', () => {
    const s = snapshot()
    useDepthStore.getState().setSnapshot(s)
    expect(useDepthStore.getState().snapshot).toBe(s)
  })

  it('a second setSnapshot replaces the previous', () => {
    const a = snapshot('AAPL')
    const b = snapshot('MSFT')
    useDepthStore.getState().setSnapshot(a)
    useDepthStore.getState().setSnapshot(b)
    expect(useDepthStore.getState().snapshot).toBe(b)
  })
})
