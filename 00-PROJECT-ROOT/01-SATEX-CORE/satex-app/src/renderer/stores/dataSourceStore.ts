import { create } from 'zustand'
import type { DataSource } from '@shared/types'

interface DataSourceState {
  source:        DataSource
  liveAvailable: boolean
  switching:     boolean
  /** Pull the current source/availability from the engine (call on mount). */
  hydrate:   () => Promise<void>
  /** Request a feed switch. Optimistically flips `switching`; adopts the
   *  engine-confirmed source on success, stays put + returns the reason on refusal. */
  setSource: (target: DataSource) => Promise<{ ok: boolean; reason?: string }>
}

export const useDataSourceStore = create<DataSourceState>((set, get) => ({
  source: 'simulator',
  liveAvailable: false,
  switching: false,

  hydrate: async () => {
    const s = await window.satex.getDataSource()
    set({ source: s.source, liveAvailable: s.liveAvailable, switching: s.switching })
  },

  setSource: async (target) => {
    if (get().switching || get().source === target) return { ok: true }
    set({ switching: true })
    try {
      const res = await window.satex.setDataSource({ target })
      set(res.ok && res.source ? { source: res.source, switching: false } : { switching: false })
      return { ok: res.ok, reason: res.reason }
    } catch (e) {
      set({ switching: false })
      return { ok: false, reason: String(e) }
    }
  },
}))
