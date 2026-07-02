/**
 * SATEX — Logger rotation unit tests.
 *
 * Locks down adversarial finding C5 (2026-05-16): rotation must shift slots
 * down (oldest dropped, newest at .1) instead of looping-then-recycling
 * slot 1. Previously after the first N rotations, slots .2..N were frozen
 * with their first contents while slot .1 got overwritten on every rotation.
 *
 * We exercise the pure `rotateSlots` helper with fake filesystem callbacks
 * so the test is fast and deterministic (no real I/O).
 */
import { describe, expect, it } from 'vitest'
import { rotateSlots } from './logger'

interface FakeFs {
  files: Set<string>
  ops: Array<{ kind: 'rename'; from: string; to: string } | { kind: 'remove'; path: string }>
}

function newFakeFs(initialFiles: string[] = []): FakeFs {
  return { files: new Set(initialFiles), ops: [] }
}

function fakeBindings(fs: FakeFs) {
  return {
    exists: (p: string) => fs.files.has(p),
    rename: (from: string, to: string) => {
      fs.files.delete(to) // overwrite semantics for renames
      fs.files.delete(from)
      fs.files.add(to)
      fs.ops.push({ kind: 'rename', from, to })
    },
    remove: (p: string) => { fs.files.delete(p); fs.ops.push({ kind: 'remove', path: p }) },
  }
}

const BASE = '/tmp/satex.log'
const MAX = 7

describe('rotateSlots — canonical shift-down (adversarial finding C5)', () => {
  it('empty rotation set: current → .1, no other slots created', () => {
    const fs = newFakeFs([BASE])
    rotateSlots({ ...fakeBindings(fs), basePath: BASE, maxSlots: MAX })
    expect(fs.files.has(BASE)).toBe(false)
    expect(fs.files.has(`${BASE}.1`)).toBe(true)
    for (let i = 2; i <= MAX; i++) expect(fs.files.has(`${BASE}.${i}`)).toBe(false)
  })

  it('partial: existing .1..3, current → .1, prior .1→.2, .2→.3, .3→.4', () => {
    const initial = [BASE, `${BASE}.1`, `${BASE}.2`, `${BASE}.3`]
    const fs = newFakeFs(initial)
    rotateSlots({ ...fakeBindings(fs), basePath: BASE, maxSlots: MAX })
    expect(fs.files.has(BASE)).toBe(false)
    expect(fs.files.has(`${BASE}.1`)).toBe(true)
    expect(fs.files.has(`${BASE}.2`)).toBe(true)
    expect(fs.files.has(`${BASE}.3`)).toBe(true)
    expect(fs.files.has(`${BASE}.4`)).toBe(true)
    expect(fs.files.has(`${BASE}.5`)).toBe(false)
  })

  it('full set: oldest (.7) dropped, .6→.7, .5→.6, …, .1→.2, current→.1', () => {
    const initial = [BASE, ...Array.from({ length: MAX }, (_, i) => `${BASE}.${i + 1}`)]
    const fs = newFakeFs(initial)
    rotateSlots({ ...fakeBindings(fs), basePath: BASE, maxSlots: MAX })
    // Oldest gone
    expect(fs.ops[0]).toEqual({ kind: 'remove', path: `${BASE}.${MAX}` })
    // All slots still present after shift
    expect(fs.files.has(BASE)).toBe(false)
    for (let i = 1; i <= MAX; i++) {
      expect(fs.files.has(`${BASE}.${i}`)).toBe(true)
    }
  })

  it('preserves the last MAX rotations across 2 × MAX cycles (regression for the bug)', () => {
    // Pre-fix the loop-then-recycle scheme would leave .2..MAX containing
    // only the FIRST MAX rotations forever, with .1 cycling. Post-fix, after
    // 2*MAX rotations the surviving slots are rotations [MAX+1 .. 2*MAX].
    const fs = newFakeFs()
    const tagged: string[] = [] // record which "rotation number" was renamed where
    const bindings = fakeBindings(fs)
    for (let r = 1; r <= MAX * 2; r++) {
      // "create" the current log file with a distinct tag so we can assert
      // which rotation each slot ended up holding.
      const tag = `${BASE}@r=${r}`
      fs.files.add(BASE)
      tagged.push(tag)
      // We model identity via the rename op log instead of file contents.
      rotateSlots({ ...bindings, basePath: BASE, maxSlots: MAX })
    }
    // After 14 rotations, slot .1 should hold rotation 14, .2 should hold
    // rotation 13, …, .7 should hold rotation 8. Rotations 1..7 are all
    // dropped (overwritten when they aged past slot 7). Pre-fix, slots
    // .2..7 would still hold the contents from rotations 1..6 because they
    // were never touched after the first 7 cycles.
    //
    // We don't actually track file contents in fakeFs, but we can confirm
    // the algorithmic property: at every step, slot .{MAX} got removed
    // before the shift — meaning the OLDEST surviving rotation IS being
    // dropped. Count remove ops on slot .{MAX}: should equal max(0, total -
    // MAX) = 7 for 14 cycles.
    const removesOfOldest = fs.ops.filter(
      (op) => op.kind === 'remove' && op.path === `${BASE}.${MAX}`,
    ).length
    expect(removesOfOldest).toBe(MAX * 2 - MAX) // 7
    // And every slot is occupied at the end
    for (let i = 1; i <= MAX; i++) {
      expect(fs.files.has(`${BASE}.${i}`)).toBe(true)
    }
  })

  it('does not remove a non-existent oldest slot (no-op on cold start)', () => {
    const fs = newFakeFs([BASE])
    rotateSlots({ ...fakeBindings(fs), basePath: BASE, maxSlots: MAX })
    const removes = fs.ops.filter((op) => op.kind === 'remove')
    expect(removes).toHaveLength(0)
  })

  it('rename order goes high → low so we never overwrite a slot we still need', () => {
    const fs = newFakeFs([BASE, `${BASE}.1`, `${BASE}.2`])
    const { rename: realRename, exists: realExists, remove: realRemove } = fakeBindings(fs)
    // Wrap rename to capture order of operations
    const renameOrder: Array<[string, string]> = []
    rotateSlots({
      exists: realExists,
      rename: (from, to) => { renameOrder.push([from, to]); realRename(from, to) },
      remove: realRemove,
      basePath: BASE,
      maxSlots: MAX,
    })
    // First non-current rename must be from a HIGHER slot than the second
    const nonCurrent = renameOrder.filter(([from]) => from !== BASE)
    if (nonCurrent.length >= 2) {
      const firstSlot = Number(nonCurrent[0]![0].split('.').pop()!)
      const secondSlot = Number(nonCurrent[1]![0].split('.').pop()!)
      expect(firstSlot).toBeGreaterThan(secondSlot)
    }
    // Last rename is always current → .1
    expect(renameOrder[renameOrder.length - 1]).toEqual([BASE, `${BASE}.1`])
  })
})
