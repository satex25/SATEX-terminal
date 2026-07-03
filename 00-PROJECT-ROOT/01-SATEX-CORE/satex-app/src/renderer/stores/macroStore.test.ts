/**
 * macroStore contract tests (P-054).
 *
 * Macro calendar push mirror (MACRO_UPDATE). Pins the display contract:
 * initial-null, store-exact-object, replace on next push.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useMacroStore } from './macroStore'
import type { MacroSnapshot } from '@shared/types'

function makeSnap(computedAt: number): MacroSnapshot {
  return { events: [], horizonHours: 24, computedAt }
}

beforeEach(() => {
  useMacroStore.setState({ snapshot: null })
})

describe('macroStore (push mirror)', () => {
  it('starts with no snapshot', () => {
    expect(useMacroStore.getState().snapshot).toBeNull()
  })

  it('stores the pushed snapshot verbatim', () => {
    const snap = makeSnap(1_000)
    useMacroStore.getState().setSnapshot(snap)
    expect(useMacroStore.getState().snapshot).toBe(snap)
  })

  it('replaces the snapshot on the next push', () => {
    useMacroStore.getState().setSnapshot(makeSnap(1_000))
    const next = makeSnap(2_000)
    useMacroStore.getState().setSnapshot(next)
    expect(useMacroStore.getState().snapshot).toBe(next)
  })
})
