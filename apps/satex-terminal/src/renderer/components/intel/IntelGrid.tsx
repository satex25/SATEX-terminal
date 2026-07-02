/**
 * SATEX — Intel composable grid renderer.
 *
 * Paints the live module layout on a fixed-column CSS grid. In read mode it is
 * a clean dashboard; in edit mode each module grows a drag handle, an SE resize
 * grip, and a remove (×) — the iPhone-jiggle / desktop-window editor. Drag math
 * is the leak-safe `useGridDrag` hook; placement math is the pure `grid-layout`
 * reducer (reject-if-overlap). Each module body is isolated in its own
 * `ErrorBoundary` so one module's throw can never blank the workspace (the
 * P-044 idiom).
 */
import { useRef } from 'react'
import { ErrorBoundary } from '../ErrorBoundary'
import { DEFAULT_GRID_COLS } from '../../lib/grid-layout'
import { MODULE_META } from '../../panels/intel/intel-modules'
import { IntelModuleBody } from '../../panels/intel/intel-registry'
import { minSizeOf } from '../../panels/intel/intel-modules'
import { useIntelLayoutStore } from '../../stores/intelLayoutStore'
import { useGridDrag } from './useGridDrag'

const COLS = DEFAULT_GRID_COLS
const ROW_H = 56 // px — keep in sync with --bb-intel-row-h in globals.css
const GAP = 8 // px — keep in sync with the grid gap in globals.css

export function IntelGrid() {
  const layout = useIntelLayoutStore((s) => s.layout)
  const editMode = useIntelLayoutStore((s) => s.editMode)
  const move = useIntelLayoutStore((s) => s.move)
  const resize = useIntelLayoutStore((s) => s.resize)
  const remove = useIntelLayoutStore((s) => s.remove)

  const gridRef = useRef<HTMLDivElement | null>(null)

  const getStride = (): { x: number; y: number } => {
    const w = gridRef.current?.getBoundingClientRect().width ?? COLS * (ROW_H + GAP)
    return { x: (w + GAP) / COLS, y: ROW_H + GAP }
  }

  const { drag, startDrag } = useGridDrag({
    cols: COLS,
    getStride,
    minSizeOf,
    findPlacement: (id) => layout.find((m) => m.id === id),
    onCommit: (mode, id, p) => {
      if (mode === 'move') move(id, p.x, p.y)
      else resize(id, p.w, p.h)
    },
  })

  if (layout.length === 0) {
    return (
      <div className="bb-intel-empty">
        <div className="bb-intel-empty-title">No modules placed</div>
        <div className="bb-intel-empty-hint">
          {editMode ? 'Add modules from the palette above.' : 'Press “Edit Modules” to compose this workspace.'}
        </div>
      </div>
    )
  }

  return (
    <div ref={gridRef} className={`bb-intel-grid${editMode ? ' is-editing' : ''}`}>
      {layout.map((m) => {
        const live = drag && drag.id === m.id ? drag.placement : m
        const meta = MODULE_META[m.id]
        const dragging = drag?.id === m.id
        return (
          <section
            key={m.id}
            className={`bb-intel-mod${dragging ? ' is-dragging' : ''}`}
            style={{
              gridColumn: `${live.x + 1} / span ${live.w}`,
              gridRow: `${live.y + 1} / span ${live.h}`,
            }}
            aria-label={meta.title}
          >
            <header
              className="bb-intel-mod-head"
              onPointerDown={editMode ? (e) => startDrag(e, m.id, 'move') : undefined}
              style={editMode ? { cursor: 'grab' } : undefined}
            >
              <span className="bb-intel-mod-title">{meta.title}</span>
              {editMode && (
                <button
                  type="button"
                  className="bb-intel-mod-remove"
                  aria-label={`Remove ${meta.title}`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => remove(m.id)}
                >
                  ×
                </button>
              )}
            </header>
            <div className="bb-intel-mod-content">
              <ErrorBoundary
                fallback={(err) => (
                  <div className="bb-intel-mod-error" role="alert">
                    <strong>{meta.title} failed</strong>
                    <span>{err.message}</span>
                  </div>
                )}
              >
                <IntelModuleBody id={m.id} />
              </ErrorBoundary>
            </div>
            {editMode && (
              <span
                className="bb-intel-mod-resize"
                aria-hidden="true"
                onPointerDown={(e) => startDrag(e, m.id, 'resize')}
              />
            )}
          </section>
        )
      })}
    </div>
  )
}
