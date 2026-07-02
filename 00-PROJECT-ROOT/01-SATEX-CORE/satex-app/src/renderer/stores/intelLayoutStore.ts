/**
 * SATEX — Intel grid layout store (Zustand).
 *
 * Owns the live module placement for the composable Intel workspace + the
 * edit-mode flag. Every mutation runs through the pure `grid-layout` reducer
 * (reject-if-overlap), then write-through-persists to its OWN
 * `Vault/Settings/intel-layout.md` via the `intelLayout` IPC bridge (decoupled
 * from workspace state — no schema migration). Hydrate sanitizes the persisted
 * layout against the live module registry so a removed module can't wedge the
 * grid. Scoped to the Intel tab only; no other workspace gains drag/resize.
 */
import { create } from 'zustand'
import type { IntelModuleId, ModulePlacement } from '@shared/types'
import {
  DEFAULT_GRID_COLS,
  addModule as addM,
  removeModule as removeM,
  moveModule as moveM,
  resizeModule as resizeM,
  sanitizeLayout,
} from '../lib/grid-layout'
import {
  CURATED_DEFAULT_LAYOUT,
  KNOWN_MODULE_IDS,
  defaultSizeOf,
  minSizeOf,
} from '../panels/intel/intel-modules'

const COLS = DEFAULT_GRID_COLS

interface IntelLayoutState {
  layout: ModulePlacement[]
  editMode: boolean
  hydrated: boolean
  hydrate: () => Promise<void>
  setEditMode: (on: boolean) => void
  add: (id: IntelModuleId) => void
  remove: (id: IntelModuleId) => void
  move: (id: IntelModuleId, x: number, y: number) => void
  resize: (id: IntelModuleId, w: number, h: number) => void
  reset: () => void
}

function persist(layout: ModulePlacement[]): void {
  // Fire-and-forget — local store is the source of truth; disk is best effort.
  window.satex?.intelLayout?.set(layout).catch((err: unknown) => {
    console.warn('[intel-layout] failed to persist', err)
  })
}

function sanitize(raw: readonly ModulePlacement[]): ModulePlacement[] {
  return sanitizeLayout(raw, KNOWN_MODULE_IDS, COLS, minSizeOf)
}

/** Apply a reducer result: store it and write through. */
function commit(set: (p: Partial<IntelLayoutState>) => void, layout: ModulePlacement[]): void {
  set({ layout })
  persist(layout)
}

export const useIntelLayoutStore = create<IntelLayoutState>((set, get) => ({
  layout: CURATED_DEFAULT_LAYOUT.map((m) => ({ ...m })),
  editMode: false,
  hydrated: false,

  hydrate: async () => {
    try {
      const fromDisk = await window.satex?.intelLayout?.get()
      if (Array.isArray(fromDisk)) {
        const clean = sanitize(fromDisk)
        set({ layout: clean.length > 0 ? clean : CURATED_DEFAULT_LAYOUT.map((m) => ({ ...m })), hydrated: true })
      } else {
        set({ hydrated: true })
      }
    } catch (err) {
      console.warn('[intel-layout] hydrate failed — using default layout', err)
      set({ hydrated: true })
    }
  },

  setEditMode: (on) => set({ editMode: on }),

  add: (id) => commit(set, addM(get().layout, id, defaultSizeOf(id), COLS)),
  remove: (id) => commit(set, removeM(get().layout, id)),
  move: (id, x, y) => commit(set, moveM(get().layout, id, x, y, COLS)),
  resize: (id, w, h) => commit(set, resizeM(get().layout, id, w, h, COLS, minSizeOf(id))),
  reset: () => commit(set, CURATED_DEFAULT_LAYOUT.map((m) => ({ ...m }))),
}))
