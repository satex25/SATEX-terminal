/**
 * SATEX — Intel workspace grid layout (pure, headless).
 *
 * All placement math for the composable Intel grid lives here with zero DOM and
 * zero React, so it is fully unit-testable and the same logic drives both the
 * live editor and the on-load sanitizer. Modules are placed on a fixed-column
 * grid in column/row UNITS (not pixels); the renderer maps units to CSS-grid
 * spans. This is the zero-dependency grid engine (D2) — no react-grid-layout.
 *
 * v1 collision policy is **reject-if-overlap** (deterministic, no surprise
 * reflow): a move/resize that would overlap another module is refused and the
 * caller keeps the prior layout. Bounded push-down compaction is a documented
 * follow-up, intentionally out of v1 scope.
 */
import type { IntelModuleId, ModulePlacement } from '@shared/types'

export const DEFAULT_GRID_COLS = 12

/** A width/height in grid units. */
export interface GridSize {
  w: number
  h: number
}

/** Minimum size lookup for a module id. The reducer stays headless by taking
 *  this as a parameter (the renderer passes the registry's lookup) rather than
 *  importing the module registry. Defaults to 1x1 when not supplied. */
export type MinSizeOf = (id: IntelModuleId) => GridSize

const ONE_BY_ONE: GridSize = { w: 1, h: 1 }
const defaultMinSize: MinSizeOf = () => ONE_BY_ONE

/** True when two axis-aligned rectangles overlap (touching edges do not count). */
export function rectsOverlap(a: ModulePlacement, b: ModulePlacement): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

/** True when `p` fits entirely inside a `cols`-wide grid with positive size. */
export function isWithinBounds(p: ModulePlacement, cols: number): boolean {
  return p.x >= 0 && p.y >= 0 && p.w >= 1 && p.h >= 1 && p.x + p.w <= cols
}

/** Clamp a placement into bounds and to its minimum size. Width is capped at the
 *  grid width; the x origin is pulled left so the module always fits. */
export function clampPlacement(
  p: ModulePlacement,
  cols: number,
  minSize: GridSize = ONE_BY_ONE,
): ModulePlacement {
  const w = Math.max(minSize.w, Math.min(p.w, cols))
  const h = Math.max(minSize.h, p.h)
  const x = Math.max(0, Math.min(p.x, cols - w))
  const y = Math.max(0, p.y)
  return { ...p, x, y, w, h }
}

/** Does `candidate` collide with any module in `layout` other than itself? */
export function hasCollision(
  layout: readonly ModulePlacement[],
  candidate: ModulePlacement,
): boolean {
  return layout.some((m) => m.id !== candidate.id && rectsOverlap(m, candidate))
}

/** Lowest non-overlapping {x,y} for a `w`x`h` rectangle, scanning row-major.
 *  Always terminates: the search ceiling is one row past the current stack. */
export function findFreeSlot(
  layout: readonly ModulePlacement[],
  size: GridSize,
  cols: number,
): { x: number; y: number } {
  const w = Math.min(Math.max(1, size.w), cols)
  const h = Math.max(1, size.h)
  const maxY = layout.reduce((acc, m) => Math.max(acc, m.y + m.h), 0) + 1
  for (let y = 0; y <= maxY; y++) {
    for (let x = 0; x + w <= cols; x++) {
      const probe: ModulePlacement = { id: '__probe__' as IntelModuleId, x, y, w, h }
      if (!hasCollision(layout, probe)) return { x, y }
    }
  }
  // Unreachable in practice (maxY guarantees a clear row), but stay total.
  return { x: 0, y: maxY }
}

/** Add a module at the first free slot. No-op (returns the same array) if the id
 *  is already placed — placement is unique per module. */
export function addModule(
  layout: readonly ModulePlacement[],
  id: IntelModuleId,
  size: GridSize,
  cols: number,
): ModulePlacement[] {
  if (layout.some((m) => m.id === id)) return [...layout]
  const w = Math.min(Math.max(1, size.w), cols)
  const h = Math.max(1, size.h)
  const { x, y } = findFreeSlot(layout, { w, h }, cols)
  return [...layout, { id, x, y, w, h }]
}

/** Remove a module by id. */
export function removeModule(
  layout: readonly ModulePlacement[],
  id: IntelModuleId,
): ModulePlacement[] {
  return layout.filter((m) => m.id !== id)
}

/** Move a module to (x,y). Clamps into bounds, then REJECTS the move if it would
 *  overlap another module (returns the layout unchanged). */
export function moveModule(
  layout: readonly ModulePlacement[],
  id: IntelModuleId,
  x: number,
  y: number,
  cols: number,
): ModulePlacement[] {
  const cur = layout.find((m) => m.id === id)
  if (!cur) return [...layout]
  const candidate = clampPlacement({ ...cur, x, y }, cols)
  if (hasCollision(layout, candidate)) return [...layout]
  return layout.map((m) => (m.id === id ? candidate : m))
}

/** Resize a module to (w,h). Clamps to the module's minimum size and grid
 *  bounds, then REJECTS the resize if it would overlap (returns unchanged). */
export function resizeModule(
  layout: readonly ModulePlacement[],
  id: IntelModuleId,
  w: number,
  h: number,
  cols: number,
  minSize: GridSize = ONE_BY_ONE,
): ModulePlacement[] {
  const cur = layout.find((m) => m.id === id)
  if (!cur) return [...layout]
  const candidate = clampPlacement({ ...cur, w, h }, cols, minSize)
  if (hasCollision(layout, candidate)) return [...layout]
  return layout.map((m) => (m.id === id ? candidate : m))
}

/**
 * Normalize a possibly-corrupt or stale layout into a valid, overlap-free one.
 * Drops placements whose id is not in `knownIds` (a module removed from the
 * registry), clamps each survivor into bounds + its min size, and drops any that
 * still overlap an already-accepted placement (first-wins, deterministic). This
 * is the on-load guard mirroring the subsecond-prefs sanitizer.
 */
export function sanitizeLayout(
  placements: readonly ModulePlacement[],
  knownIds: ReadonlySet<IntelModuleId>,
  cols: number = DEFAULT_GRID_COLS,
  minSizeOf: MinSizeOf = defaultMinSize,
): ModulePlacement[] {
  const accepted: ModulePlacement[] = []
  const seen = new Set<IntelModuleId>()
  for (const raw of placements) {
    if (!raw || typeof raw.id !== 'string') continue
    if (!knownIds.has(raw.id)) continue
    if (seen.has(raw.id)) continue
    if (![raw.x, raw.y, raw.w, raw.h].every((n) => typeof n === 'number' && Number.isFinite(n))) continue
    const clamped = clampPlacement(raw, cols, minSizeOf(raw.id))
    if (hasCollision(accepted, clamped)) continue
    seen.add(raw.id)
    accepted.push(clamped)
  }
  return accepted
}
