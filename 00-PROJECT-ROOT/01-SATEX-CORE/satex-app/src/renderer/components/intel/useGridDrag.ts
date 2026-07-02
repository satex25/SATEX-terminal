/**
 * SATEX — Intel grid drag/resize hook (pointer events, leak-safe).
 *
 * Drives both move and resize for the Edit-Modules grid. Window-level
 * `pointermove`/`pointerup` listeners are attached on drag start and removed on
 * pointerup AND on unmount via a ref-held cleanup — the PR #6 "clean up what
 * you create" invariant (the same setState-after-unmount class as P-043/P-046).
 * The live candidate is mirrored in a ref so the pointerup commit reads the
 * latest placement without depending on a stale React closure.
 */
import { useEffect, useRef, useState } from 'react'
import type { IntelModuleId, ModulePlacement } from '@shared/types'
import { clampPlacement, type GridSize } from '../../lib/grid-layout'

type DragMode = 'move' | 'resize'

interface DragState {
  id: IntelModuleId
  mode: DragMode
  /** Live candidate placement (preview) while dragging. */
  placement: ModulePlacement
}

interface DragContext {
  id: IntelModuleId
  mode: DragMode
  origin: ModulePlacement
  startX: number
  startY: number
  strideX: number
  strideY: number
  latest: ModulePlacement
  onMove: (e: PointerEvent) => void
  onUp: (e: PointerEvent) => void
}

export interface UseGridDragArgs {
  cols: number
  /** Pixels per grid cell (including gap) — measured at drag start. */
  getStride: () => { x: number; y: number }
  minSizeOf: (id: IntelModuleId) => GridSize
  findPlacement: (id: IntelModuleId) => ModulePlacement | undefined
  /** Commit the final candidate (the reducer rejects an overlap → no-op). */
  onCommit: (mode: DragMode, id: IntelModuleId, placement: ModulePlacement) => void
}

export interface UseGridDrag {
  drag: DragState | null
  startDrag: (e: React.PointerEvent, id: IntelModuleId, mode: DragMode) => void
}

export function useGridDrag(args: UseGridDragArgs): UseGridDrag {
  const { cols, getStride, minSizeOf, findPlacement, onCommit } = args
  const [drag, setDrag] = useState<DragState | null>(null)
  const ctxRef = useRef<DragContext | null>(null)

  const detach = (): void => {
    const ctx = ctxRef.current
    if (ctx) {
      window.removeEventListener('pointermove', ctx.onMove)
      window.removeEventListener('pointerup', ctx.onUp)
      window.removeEventListener('pointercancel', ctx.onUp)
      ctxRef.current = null
    }
  }

  // Hard teardown on unmount — never leave a window listener firing setState
  // into a dead component (PR #6).
  useEffect(() => detach, [])

  const startDrag = (e: React.PointerEvent, id: IntelModuleId, mode: DragMode): void => {
    const origin = findPlacement(id)
    if (!origin) return
    e.preventDefault()
    e.stopPropagation()
    detach() // never stack two drags

    const stride = getStride()
    const onMove = (ev: PointerEvent): void => {
      const ctx = ctxRef.current
      if (!ctx) return
      const dx = Math.round((ev.clientX - ctx.startX) / ctx.strideX)
      const dy = Math.round((ev.clientY - ctx.startY) / ctx.strideY)
      const candidate =
        ctx.mode === 'move'
          ? clampPlacement({ ...ctx.origin, x: ctx.origin.x + dx, y: ctx.origin.y + dy }, cols)
          : clampPlacement({ ...ctx.origin, w: ctx.origin.w + dx, h: ctx.origin.h + dy }, cols, minSizeOf(id))
      ctx.latest = candidate
      setDrag({ id, mode: ctx.mode, placement: candidate })
    }
    const onUp = (): void => {
      const ctx = ctxRef.current
      detach()
      setDrag(null)
      if (ctx) onCommit(ctx.mode, ctx.id, ctx.latest)
    }

    ctxRef.current = {
      id, mode, origin,
      startX: e.clientX, startY: e.clientY,
      strideX: stride.x || 1, strideY: stride.y || 1,
      latest: origin, onMove, onUp,
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    setDrag({ id, mode, placement: origin })
  }

  return { drag, startDrag }
}
