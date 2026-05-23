/**
 * SATEX — Theme store (v0.6 Phase 1).
 *
 * Live-switchable theme palette for the Black Box terminal. Defaults to the
 * Classic palette (cyan accent / green-red pos-neg / urushi black bg) which
 * matches the existing `:root` token block in `globals.css` — so an existing
 * install that doesn't write the localStorage key sees no visual change.
 *
 * Persistence is renderer-side only (`localStorage`). Theme is a presentation
 * concern: no Vault file, no main-process IPC, no Electron userData write.
 * Future v0.6 phases may upgrade this to a Vault-persisted preference once
 * theming touches more surfaces (e.g. per-workspace theme overrides).
 *
 * The store does NOT apply the theme to the DOM itself — that's the job of
 * the `useThemeBodyClass` hook (wired in `App.tsx`). Keeping the side effect
 * out of the store means subscribing components stay rendering-agnostic.
 */
import { create } from 'zustand'

export const THEMES = [
  {
    id:          'classic',
    label:       'Classic',
    description: 'Cyan accent · green/red P&L · urushi black',
  },
  {
    id:          'mono',
    label:       'Mono',
    description: 'Monochrome — bone whites + greys, accent removed',
  },
  {
    id:          'bluyel',
    label:       'Blue / Yellow',
    description: 'Color-blind friendly · blue gains · yellow losses',
  },
] as const

export type ThemeId = (typeof THEMES)[number]['id']
const THEME_IDS: readonly ThemeId[] = THEMES.map((t) => t.id)
const DEFAULT_THEME: ThemeId = 'classic'
const STORAGE_KEY = 'satex.theme'

function readPersistedTheme(): ThemeId {
  try {
    const raw = window.localStorage?.getItem(STORAGE_KEY)
    if (raw && (THEME_IDS as readonly string[]).includes(raw)) return raw as ThemeId
  } catch { /* SSR or sandboxed renderer — fall through to default */ }
  return DEFAULT_THEME
}

function persistTheme(id: ThemeId): void {
  try { window.localStorage?.setItem(STORAGE_KEY, id) }
  catch { /* persistence is best-effort; in-memory state is the source of truth */ }
}

interface ThemeStoreState {
  theme: ThemeId
  setTheme: (id: ThemeId) => void
}

export const useThemeStore = create<ThemeStoreState>((set, get) => ({
  theme: readPersistedTheme(),
  setTheme: (id) => {
    if (!(THEME_IDS as readonly string[]).includes(id)) return
    if (get().theme === id) return
    set({ theme: id })
    persistTheme(id)
  },
}))
