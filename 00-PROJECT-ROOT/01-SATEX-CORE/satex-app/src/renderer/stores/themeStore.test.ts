/**
 * SATEX — Theme store tests (v0.6 Phase 1 · Phase 5 hardening).
 *
 * Pins the live-switchable Black Box theme palette store: the THEMES catalog
 * the Settings picker renders from, the setTheme guards (valid switch, unknown
 * id ignored, redundant set skipped), localStorage persistence, and the
 * boot-time read of a persisted preference (default Classic, restore valid,
 * reject corrupt, survive a sandboxed/throwing localStorage).
 *
 * Harness note (matches update-store.test.ts): vitest runs in the default node
 * env — no jsdom — so `window` is absent. The store guards every localStorage
 * access in try/catch, so the default path works headless; the persistence and
 * boot paths stub `window` explicitly. readPersistedTheme() runs at module load,
 * so the boot cases re-import the module fresh after stubbing window.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { THEMES, useThemeStore, type ThemeId } from './themeStore'

beforeEach(() => {
  // Zustand stores are singletons within a vitest worker — reset to the boot
  // default. setState shallow-merges, so the setTheme action is preserved.
  useThemeStore.setState({ theme: 'classic' })
})

describe('useThemeStore — THEMES catalog', () => {
  it('ships exactly the three Black Box palettes in stable order', () => {
    expect(THEMES.map((t) => t.id)).toEqual(['classic', 'mono', 'bluyel'])
  })

  it('gives every palette a non-empty label + description for the picker', () => {
    for (const t of THEMES) {
      expect(t.label.length).toBeGreaterThan(0)
      expect(t.description.length).toBeGreaterThan(0)
    }
  })

  it('boots Classic by default (matches the :root token block in globals.css)', () => {
    expect(useThemeStore.getState().theme).toBe('classic')
  })
})

describe('useThemeStore — setTheme guards', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('switches to a valid theme', () => {
    useThemeStore.getState().setTheme('mono')
    expect(useThemeStore.getState().theme).toBe('mono')
  })

  it('ignores an unknown theme id (state unchanged, no crash)', () => {
    useThemeStore.getState().setTheme('neon' as ThemeId)
    expect(useThemeStore.getState().theme).toBe('classic')
  })

  it('is a no-op when re-selecting the already-active theme (no redundant persist)', () => {
    useThemeStore.setState({ theme: 'bluyel' })
    const setItem = vi.fn()
    vi.stubGlobal('window', { localStorage: { getItem: vi.fn(), setItem } })

    useThemeStore.getState().setTheme('bluyel')

    expect(setItem).not.toHaveBeenCalled()
    expect(useThemeStore.getState().theme).toBe('bluyel')
  })
})

describe('useThemeStore — persistence', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('writes the selected theme to localStorage under satex.theme', () => {
    const setItem = vi.fn()
    vi.stubGlobal('window', { localStorage: { getItem: vi.fn(), setItem } })

    useThemeStore.getState().setTheme('mono')

    expect(setItem).toHaveBeenCalledWith('satex.theme', 'mono')
  })

  it('best-effort persistence: a throwing localStorage does not break the state update', () => {
    vi.stubGlobal('window', {
      localStorage: { getItem: vi.fn(), setItem: () => { throw new Error('quota exceeded') } },
    })

    expect(() => useThemeStore.getState().setTheme('mono')).not.toThrow()
    expect(useThemeStore.getState().theme).toBe('mono')
  })
})

describe('useThemeStore — boot read of persisted preference', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  async function bootWith(getItem: () => string | null): Promise<ThemeId> {
    vi.stubGlobal('window', { localStorage: { getItem, setItem: vi.fn() } })
    vi.resetModules()
    const fresh = await import('./themeStore')
    return fresh.useThemeStore.getState().theme
  }

  it('boots Classic when nothing is stored', async () => {
    expect(await bootWith(() => null)).toBe('classic')
  })

  it('restores a valid stored preference', async () => {
    expect(await bootWith(() => 'bluyel')).toBe('bluyel')
  })

  it('rejects a corrupt stored value and falls back to Classic', async () => {
    expect(await bootWith(() => 'rainbow')).toBe('classic')
  })

  it('survives a localStorage that throws on read (sandboxed renderer)', async () => {
    expect(await bootWith(() => { throw new Error('access denied') })).toBe('classic')
  })
})
