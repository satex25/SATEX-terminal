/**
 * intelLayoutStore contract tests (P-052).
 *
 * Pins the store-level contracts of the composable Intel grid (P-048 Phase B):
 * hydrate's sanitize → adopt / fall-back-to-curated-default / warn-on-failure
 * paths, write-through persistence to the `intelLayout` IPC bridge on every
 * mutation, reducer-mediated add/remove/move/resize (reject-if-overlap is the
 * grid engine's law — pinned here through the store surface), reset's fresh
 * default copies, and the fire-and-forget persist failure warning. The pure
 * reducer internals are covered by `grid-layout.test.ts`; this file covers the
 * store wiring only. Store source is byte-for-byte unchanged.
 *
 * Convention mirrors `dataSourceStore.test.ts`: `vi.stubGlobal('window', …)` +
 * `useIntelLayoutStore.setState(…)` reset per test.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useIntelLayoutStore } from './intelLayoutStore'
import { CURATED_DEFAULT_LAYOUT, defaultSizeOf, minSizeOf } from '../panels/intel/intel-modules'
import type { ModulePlacement } from '@shared/types'

function freshDefault(): ModulePlacement[] {
  return CURATED_DEFAULT_LAYOUT.map((m) => ({ ...m }))
}

function stubBridge(overrides: { get?: ReturnType<typeof vi.fn>; set?: ReturnType<typeof vi.fn> } = {}) {
  const get = overrides.get ?? vi.fn().mockResolvedValue(undefined)
  const set = overrides.set ?? vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('window', { satex: { intelLayout: { get, set } } })
  return { get, set }
}

beforeEach(() => {
  useIntelLayoutStore.setState({ layout: freshDefault(), editMode: false, hydrated: false })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('intelLayoutStore.hydrate', () => {
  it('adopts a valid persisted layout (sanitized) and flags hydrated', async () => {
    const persisted: ModulePlacement[] = [{ id: 'regime', x: 0, y: 0, w: 4, h: 3 }]
    stubBridge({ get: vi.fn().mockResolvedValue(persisted) })
    await useIntelLayoutStore.getState().hydrate()
    const s = useIntelLayoutStore.getState()
    expect(s.layout).toEqual(persisted)
    expect(s.hydrated).toBe(true)
  })

  it('keeps the curated default when the bridge returns a non-array', async () => {
    stubBridge({ get: vi.fn().mockResolvedValue(undefined) })
    await useIntelLayoutStore.getState().hydrate()
    const s = useIntelLayoutStore.getState()
    expect(s.layout).toEqual(CURATED_DEFAULT_LAYOUT)
    expect(s.hydrated).toBe(true)
  })

  it('falls back to the curated default when everything sanitizes away', async () => {
    const junk = [{ id: 'not-a-module', x: 0, y: 0, w: 2, h: 2 }] as unknown as ModulePlacement[]
    stubBridge({ get: vi.fn().mockResolvedValue(junk) })
    await useIntelLayoutStore.getState().hydrate()
    const s = useIntelLayoutStore.getState()
    expect(s.layout).toEqual(CURATED_DEFAULT_LAYOUT)
    expect(s.hydrated).toBe(true)
  })

  it('warns and keeps the default when the bridge rejects', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    stubBridge({ get: vi.fn().mockRejectedValue(new Error('bridge down')) })
    await useIntelLayoutStore.getState().hydrate()
    const s = useIntelLayoutStore.getState()
    expect(warn).toHaveBeenCalled()
    expect(s.layout).toEqual(CURATED_DEFAULT_LAYOUT)
    expect(s.hydrated).toBe(true)
  })

  it('tolerates a missing bridge (no satex) — defaults, hydrated', async () => {
    vi.stubGlobal('window', {})
    await useIntelLayoutStore.getState().hydrate()
    const s = useIntelLayoutStore.getState()
    expect(s.layout).toEqual(CURATED_DEFAULT_LAYOUT)
    expect(s.hydrated).toBe(true)
  })
})

describe('intelLayoutStore mutations (write-through)', () => {
  it('add places a missing module at its default size and persists', () => {
    const { set } = stubBridge()
    useIntelLayoutStore.setState({ layout: freshDefault().filter((m) => m.id !== 'macro') })
    useIntelLayoutStore.getState().add('macro')
    const placed = useIntelLayoutStore.getState().layout.find((m) => m.id === 'macro')
    expect(placed).toBeDefined()
    expect({ w: placed!.w, h: placed!.h }).toEqual(defaultSizeOf('macro'))
    expect(set).toHaveBeenCalledTimes(1)
    expect(set).toHaveBeenCalledWith(useIntelLayoutStore.getState().layout)
  })

  it('add is placement-unique — an already-placed id changes nothing', () => {
    stubBridge()
    const before = useIntelLayoutStore.getState().layout.map((m) => ({ ...m }))
    useIntelLayoutStore.getState().add('regime')
    expect(useIntelLayoutStore.getState().layout).toEqual(before)
  })

  it('remove drops the module and persists', () => {
    const { set } = stubBridge()
    useIntelLayoutStore.getState().remove('macro')
    const s = useIntelLayoutStore.getState()
    expect(s.layout.some((m) => m.id === 'macro')).toBe(false)
    expect(s.layout).toHaveLength(CURATED_DEFAULT_LAYOUT.length - 1)
    expect(set).toHaveBeenCalledTimes(1)
  })

  it('move adopts a collision-free move and persists', () => {
    const { set } = stubBridge()
    useIntelLayoutStore.getState().move('macro', 0, 10)
    const moved = useIntelLayoutStore.getState().layout.find((m) => m.id === 'macro')!
    expect({ x: moved.x, y: moved.y }).toEqual({ x: 0, y: 10 })
    expect(set).toHaveBeenCalledTimes(1)
  })

  it('move is rejected when it would overlap another module', () => {
    stubBridge()
    const before = useIntelLayoutStore.getState().layout.map((m) => ({ ...m }))
    useIntelLayoutStore.getState().move('macro', 0, 0) // reliability lives at (0,0)
    expect(useIntelLayoutStore.getState().layout).toEqual(before)
  })

  it('resize adopts growth into free space and persists', () => {
    const { set } = stubBridge()
    useIntelLayoutStore.getState().resize('microstructure', 6, 5) // grows down into empty rows
    const resized = useIntelLayoutStore.getState().layout.find((m) => m.id === 'microstructure')!
    expect({ w: resized.w, h: resized.h }).toEqual({ w: 6, h: 5 })
    expect(set).toHaveBeenCalledTimes(1)
  })

  it('resize is rejected when it would overlap another module', () => {
    stubBridge()
    const before = useIntelLayoutStore.getState().layout.map((m) => ({ ...m }))
    useIntelLayoutStore.getState().resize('correlation', 12, 4) // would sweep into macro's row band
    expect(useIntelLayoutStore.getState().layout).toEqual(before)
  })

  it('resize clamps up to the module minimum size', () => {
    stubBridge()
    useIntelLayoutStore.getState().resize('regime', 0, 0)
    const r = useIntelLayoutStore.getState().layout.find((m) => m.id === 'regime')!
    expect({ w: r.w, h: r.h }).toEqual(minSizeOf('regime'))
  })

  it('reset restores the curated default as fresh copies and persists', () => {
    const { set } = stubBridge()
    useIntelLayoutStore.getState().remove('macro')
    useIntelLayoutStore.getState().reset()
    const s = useIntelLayoutStore.getState()
    expect(s.layout).toEqual(CURATED_DEFAULT_LAYOUT)
    expect(s.layout[0]).not.toBe(CURATED_DEFAULT_LAYOUT[0]) // copies, not the registry objects
    expect(set).toHaveBeenCalledTimes(2) // remove + reset both write through
  })
})

describe('intelLayoutStore persistence failure', () => {
  it('warns on a failed write-through; the local layout stays authoritative', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    stubBridge({ set: vi.fn().mockRejectedValue(new Error('disk full')) })
    useIntelLayoutStore.getState().remove('macro')
    await vi.waitFor(() => expect(warn).toHaveBeenCalled())
    expect(useIntelLayoutStore.getState().layout.some((m) => m.id === 'macro')).toBe(false)
  })
})

describe('intelLayoutStore.setEditMode', () => {
  it('flips the edit-mode flag', () => {
    useIntelLayoutStore.getState().setEditMode(true)
    expect(useIntelLayoutStore.getState().editMode).toBe(true)
    useIntelLayoutStore.getState().setEditMode(false)
    expect(useIntelLayoutStore.getState().editMode).toBe(false)
  })
})
