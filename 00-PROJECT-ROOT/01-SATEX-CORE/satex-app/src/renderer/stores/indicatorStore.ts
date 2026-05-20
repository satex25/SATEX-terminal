/**
 * SATEX — Chart-indicator toggle store (Phase 11).
 *
 * Live state for the 6 chart indicators. Hydrates from the main process on
 * mount (reads Vault/Settings/indicator-toggles.md), persists every change
 * back through the IPC.INDICATOR_SETTINGS_SET handler so manual edits and
 * app restarts stay in sync.
 *
 * Consumers read enabled flags + period configs from this store and decide
 * what to draw. The actual chart-rendering integration is a separate concern
 * — this store is intentionally rendering-agnostic.
 */
import { create } from 'zustand'
import {
  DEFAULT_INDICATOR_SETTINGS,
  INDICATOR_IDS,
  type EmaPeriod,
  type IndicatorId,
  type IndicatorSettings,
} from '@shared/chart-indicators'

interface IndicatorStoreState {
  settings: IndicatorSettings
  hydrated: boolean
  /** Set true once we've at least tried to hydrate from disk — UI uses this
   *  to render an "unknown" vs "no" state for toggles before mount completes. */
  setSettings: (next: IndicatorSettings) => void
  setEnabled:  (id: IndicatorId, enabled: boolean) => void
  toggleEmaPeriod: (p: EmaPeriod) => void
  setRsiPeriod:    (n: number) => void
  setFibLookback:  (n: number) => void
  /** Show/hide the chart-overlay indicator legend without affecting which
   *  indicators are computing. Persists to disk via the same write-through
   *  pipe as the other settings. */
  setLegendVisible: (v: boolean) => void
  /** Hydrate from the main process via window.satex.indicators.getSettings. */
  hydrate: () => Promise<void>
  /** Manually persist current state (most setters auto-persist; this is the
   *  escape hatch for batch edits). */
  flush: () => Promise<void>
}

function persist(s: IndicatorSettings): void {
  // Fire-and-forget — the store source of truth is local; persistence is best
  // effort. Failures log to the renderer console.
  window.satex?.indicators?.setSettings(s).catch((err: unknown) => {
    console.warn('[indicators] failed to persist settings', err)
  })
}

export const useIndicatorStore = create<IndicatorStoreState>((set, get) => ({
  settings: { ...DEFAULT_INDICATOR_SETTINGS, enabled: { ...DEFAULT_INDICATOR_SETTINGS.enabled } },
  hydrated: false,

  setSettings: (next) => {
    set({ settings: next })
    persist(next)
  },

  setEnabled: (id, enabled) => {
    const cur = get().settings
    if (!INDICATOR_IDS.includes(id)) return
    if (cur.enabled[id] === enabled) return
    const next: IndicatorSettings = {
      ...cur,
      enabled: { ...cur.enabled, [id]: enabled },
    }
    set({ settings: next })
    persist(next)
  },

  toggleEmaPeriod: (p) => {
    const cur = get().settings
    const has = cur.emaPeriods.includes(p)
    const periods = has
      ? cur.emaPeriods.filter(x => x !== p)
      : [...cur.emaPeriods, p].sort((a, b) => a - b) as EmaPeriod[]
    const next: IndicatorSettings = { ...cur, emaPeriods: periods }
    set({ settings: next })
    persist(next)
  },

  setRsiPeriod: (n) => {
    const cur = get().settings
    const clamped = Math.max(2, Math.min(200, Math.round(n)))
    if (clamped === cur.rsiPeriod) return
    const next: IndicatorSettings = { ...cur, rsiPeriod: clamped }
    set({ settings: next })
    persist(next)
  },

  setFibLookback: (n) => {
    const cur = get().settings
    const clamped = Math.max(5, Math.min(1000, Math.round(n)))
    if (clamped === cur.fibLookback) return
    const next: IndicatorSettings = { ...cur, fibLookback: clamped }
    set({ settings: next })
    persist(next)
  },

  setLegendVisible: (v) => {
    const cur = get().settings
    if (cur.legendVisible === v) return
    const next: IndicatorSettings = { ...cur, legendVisible: v }
    set({ settings: next })
    persist(next)
  },

  hydrate: async () => {
    try {
      const fromDisk = await window.satex?.indicators?.getSettings()
      if (fromDisk) set({ settings: fromDisk, hydrated: true })
      else set({ hydrated: true })
    } catch (err) {
      console.warn('[indicators] hydrate failed — using defaults', err)
      set({ hydrated: true })
    }
  },

  flush: async () => {
    const s = get().settings
    try {
      await window.satex?.indicators?.setSettings(s)
    } catch (err) {
      console.warn('[indicators] flush failed', err)
    }
  },
}))
