import { describe, it, expect } from 'vitest'
import type { IntelModuleId, ModulePlacement } from '@shared/types'
import {
  rectsOverlap,
  isWithinBounds,
  clampPlacement,
  hasCollision,
  findFreeSlot,
  addModule,
  removeModule,
  moveModule,
  resizeModule,
  sanitizeLayout,
  DEFAULT_GRID_COLS,
} from './grid-layout'

const p = (id: string, x: number, y: number, w: number, h: number): ModulePlacement =>
  ({ id: id as IntelModuleId, x, y, w, h })

describe('rectsOverlap', () => {
  it('detects overlap and treats touching edges as non-overlapping', () => {
    expect(rectsOverlap(p('a', 0, 0, 2, 2), p('b', 1, 1, 2, 2))).toBe(true)
    expect(rectsOverlap(p('a', 0, 0, 2, 2), p('b', 2, 0, 2, 2))).toBe(false) // edge-adjacent
    expect(rectsOverlap(p('a', 0, 0, 2, 2), p('b', 0, 2, 2, 2))).toBe(false) // stacked
  })
})

describe('isWithinBounds / clampPlacement', () => {
  it('flags out-of-bounds and clamps width + x back inside the grid', () => {
    expect(isWithinBounds(p('a', 10, 0, 4, 2), 12)).toBe(false) // 10+4 > 12
    const c = clampPlacement(p('a', 10, -3, 20, 0), 12, { w: 2, h: 2 })
    expect(c.w).toBe(12)           // capped at grid width
    expect(c.x).toBe(0)            // pulled left to fit
    expect(c.y).toBe(0)            // negative y clamped
    expect(c.h).toBe(2)            // min height enforced
  })

  it('enforces the minimum size on a too-small placement', () => {
    const c = clampPlacement(p('a', 0, 0, 1, 1), 12, { w: 3, h: 2 })
    expect(c.w).toBe(3)
    expect(c.h).toBe(2)
  })
})

describe('hasCollision / findFreeSlot', () => {
  it('ignores the module itself and finds the first row-major free slot', () => {
    const layout = [p('a', 0, 0, 6, 2)]
    expect(hasCollision(layout, p('a', 0, 0, 6, 2))).toBe(false) // same id ignored
    expect(hasCollision(layout, p('b', 3, 0, 6, 2))).toBe(true)
    const slot = findFreeSlot(layout, { w: 6, h: 2 }, 12)
    expect(slot).toEqual({ x: 6, y: 0 }) // fits beside 'a' on row 0
  })

  it('drops to the next row when the current one is full', () => {
    const layout = [p('a', 0, 0, 12, 2)]
    expect(findFreeSlot(layout, { w: 6, h: 2 }, 12)).toEqual({ x: 0, y: 2 })
  })
})

describe('addModule / removeModule', () => {
  it('adds at a free slot and is a no-op for a duplicate id', () => {
    let layout: ModulePlacement[] = []
    layout = addModule(layout, 'regime' as IntelModuleId, { w: 4, h: 3 }, 12)
    expect(layout).toHaveLength(1)
    const again = addModule(layout, 'regime' as IntelModuleId, { w: 4, h: 3 }, 12)
    expect(again).toHaveLength(1) // no duplicate
  })

  it('removes by id', () => {
    const layout = [p('regime', 0, 0, 4, 2), p('macro', 4, 0, 4, 2)]
    expect(removeModule(layout, 'regime').map(m => m.id)).toEqual(['macro'])
  })
})

describe('moveModule — reject-if-overlap', () => {
  it('commits a move into free space', () => {
    const layout = [p('regime', 0, 0, 4, 2), p('macro', 4, 0, 4, 2)]
    const next = moveModule(layout, 'regime', 0, 2, 12)
    expect(next.find(m => m.id === 'regime')).toMatchObject({ x: 0, y: 2 })
  })

  it('rejects a move that would overlap (layout unchanged)', () => {
    const layout = [p('regime', 0, 0, 4, 2), p('macro', 4, 0, 4, 2)]
    const next = moveModule(layout, 'regime', 4, 0, 12) // onto macro
    expect(next.find(m => m.id === 'regime')).toMatchObject({ x: 0, y: 0 }) // unchanged
  })
})

describe('resizeModule — clamp min + reject-if-overlap', () => {
  it('clamps to the minimum size', () => {
    const layout = [p('regime', 0, 0, 4, 3)]
    const next = resizeModule(layout, 'regime', 1, 1, 12, { w: 2, h: 2 })
    expect(next.find(m => m.id === 'regime')).toMatchObject({ w: 2, h: 2 })
  })

  it('rejects a resize that would overlap a neighbour', () => {
    const layout = [p('regime', 0, 0, 4, 2), p('macro', 4, 0, 4, 2)]
    const next = resizeModule(layout, 'regime', 8, 2, 12) // would cover macro
    expect(next.find(m => m.id === 'regime')).toMatchObject({ w: 4 }) // unchanged
  })
})

describe('sanitizeLayout', () => {
  const known = new Set<IntelModuleId>(['regime', 'reliability', 'macro'] as IntelModuleId[])

  it('drops unknown module ids', () => {
    const dirty = [p('regime', 0, 0, 4, 2), p('ghost-module', 4, 0, 4, 2)]
    const clean = sanitizeLayout(dirty, known, 12)
    expect(clean.map(m => m.id)).toEqual(['regime'])
  })

  it('drops duplicates and overlaps (first-wins) and non-finite entries', () => {
    const dirty = [
      p('regime', 0, 0, 6, 2),
      p('regime', 0, 0, 6, 2),        // duplicate id
      p('reliability', 3, 0, 6, 2),   // overlaps the accepted regime
      p('macro', NaN, 0, 4, 2),       // non-finite coord
    ]
    const clean = sanitizeLayout(dirty, known, 12)
    expect(clean.map(m => m.id)).toEqual(['regime'])
  })

  it('clamps survivors into bounds and keeps a valid non-overlapping set', () => {
    const dirty = [p('regime', 10, 0, 8, 2), p('macro', 0, 3, 4, 2)]
    const clean = sanitizeLayout(dirty, known, 12)
    expect(clean).toHaveLength(2)
    for (const m of clean) expect(isWithinBounds(m, 12)).toBe(true)
  })

  it('returns [] for an all-invalid layout (no throw)', () => {
    const dirty = [p('ghost', 0, 0, 2, 2)]
    expect(sanitizeLayout(dirty, known, DEFAULT_GRID_COLS)).toEqual([])
  })
})
