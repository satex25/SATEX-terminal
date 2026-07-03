/**
 * wireStore contract tests (P-054).
 *
 * THE WIRE's push mirror (WIRE_UPDATE → NewsDeskPanel). Pins the display
 * contract: initial-null, store-exact-object, replace on next push.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useWireStore } from './wireStore'
import type { WireSnapshot } from '@shared/types'

function makeSnap(generatedAt: number): WireSnapshot {
  return { enabled: true, items: [], sources: [], generatedAt }
}

beforeEach(() => {
  useWireStore.setState({ snap: null })
})

describe('wireStore (push mirror)', () => {
  it('starts with no snapshot', () => {
    expect(useWireStore.getState().snap).toBeNull()
  })

  it('stores the pushed snapshot verbatim', () => {
    const snap = makeSnap(1_000)
    useWireStore.getState().setSnap(snap)
    expect(useWireStore.getState().snap).toBe(snap)
  })

  it('replaces the snapshot on the next push', () => {
    useWireStore.getState().setSnap(makeSnap(1_000))
    const next = makeSnap(2_000)
    useWireStore.getState().setSnap(next)
    expect(useWireStore.getState().snap).toBe(next)
  })
})
