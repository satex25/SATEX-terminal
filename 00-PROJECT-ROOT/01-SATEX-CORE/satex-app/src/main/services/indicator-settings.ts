/**
 * SATEX — Chart-indicator toggle persistence (Phase 11 · 2026-05-15).
 *
 * Reads + writes `<project-root>/Vault/Settings/indicator-toggles.md`. The
 * settings live in a single ```json``` fenced code block inside an
 * Obsidian-friendly markdown document — easy for humans to inspect or edit,
 * trivial for the app to parse (no YAML dep). On read errors or missing
 * file the service returns DEFAULT_SETTINGS so the app always has a valid
 * shape to render against.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  DEFAULT_INDICATOR_SETTINGS,
  EMA_PERIODS, INDICATOR_IDS,
  type EmaPeriod, type IndicatorId, type IndicatorSettings,
} from '@shared/chart-indicators'
import { createLogger } from './logger'

const log = createLogger('indicators')

const VAULT_SUBDIR    = 'Vault'
const SETTINGS_SUBDIR = 'Settings'
const SETTINGS_FILE   = 'indicator-toggles.md'

export type { IndicatorSettings }
export const DEFAULT_SETTINGS = DEFAULT_INDICATOR_SETTINGS

export class IndicatorSettingsService {
  private projectRoot: string
  private cache: IndicatorSettings | null = null

  constructor(projectRoot: string) {
    this.projectRoot = resolve(projectRoot)
  }

  /** Returns cached settings, hydrating from disk on first call. */
  get(): IndicatorSettings {
    if (this.cache) return this.cache
    this.cache = this.readFromDisk()
    return this.cache
  }

  /** Writes settings to disk and updates the cache. Throws on IO failure
   *  so the caller can surface the error to the renderer. */
  set(next: IndicatorSettings): IndicatorSettings {
    const sanitized = sanitize(next)
    this.writeToDisk(sanitized)
    this.cache = sanitized
    return sanitized
  }

  /** Force-reload from disk. Useful after manual edits. */
  reload(): IndicatorSettings {
    this.cache = this.readFromDisk()
    return this.cache
  }

  // ── internal ────────────────────────────────────────────────────────────

  private settingsPath(): string {
    return join(this.projectRoot, VAULT_SUBDIR, SETTINGS_SUBDIR, SETTINGS_FILE)
  }

  private readFromDisk(): IndicatorSettings {
    const path = this.settingsPath()
    if (!existsSync(path)) {
      log.info('no indicator-toggles.md yet — using defaults', { path })
      return { ...DEFAULT_SETTINGS }
    }
    try {
      const raw = readFileSync(path, 'utf8')
      const parsed = parseJsonFence(raw)
      if (!parsed) {
        log.warn('indicator-toggles.md present but no parseable json fence', { path })
        return { ...DEFAULT_SETTINGS }
      }
      return sanitize(parsed)
    } catch (e) {
      log.warn('failed to read indicator-toggles.md', { path, err: String(e) })
      return { ...DEFAULT_SETTINGS }
    }
  }

  private writeToDisk(s: IndicatorSettings): void {
    const path = this.settingsPath()
    const dir = join(this.projectRoot, VAULT_SUBDIR, SETTINGS_SUBDIR)
    mkdirSync(dir, { recursive: true })
    const body = renderMarkdown(s)
    writeFileSync(path, body, 'utf8')
    log.debug('indicator-toggles.md written', { path, bytes: body.length })
  }
}

// ── helpers ────────────────────────────────────────────────────────────────

function renderMarkdown(s: IndicatorSettings): string {
  const json = JSON.stringify(s, null, 2)
  return [
    '# SATEX — Chart Indicator Settings',
    '',
    'Auto-managed by the SATEX app. Toggle via **Cmd+Shift+I** in the app, or',
    'edit the JSON block below by hand and restart — the app will pick it up.',
    '',
    `_Last written: ${new Date().toISOString()}_`,
    '',
    '```json',
    json,
    '```',
    '',
  ].join('\n')
}

const JSON_FENCE_RE = /```json\s*\n([\s\S]*?)\n```/

function parseJsonFence(raw: string): Partial<IndicatorSettings> | null {
  const match = raw.match(JSON_FENCE_RE)
  if (!match) return null
  try {
    return JSON.parse(match[1]!) as Partial<IndicatorSettings>
  } catch {
    return null
  }
}

/** Normalizes a possibly-partial input into a valid IndicatorSettings,
 *  filling in defaults for any missing or out-of-range field. */
function sanitize(input: Partial<IndicatorSettings>): IndicatorSettings {
  const enabled: Record<IndicatorId, boolean> = { ...DEFAULT_SETTINGS.enabled }
  if (input.enabled && typeof input.enabled === 'object') {
    for (const id of INDICATOR_IDS) {
      const v = input.enabled[id]
      if (typeof v === 'boolean') enabled[id] = v
    }
  }
  const validPeriods: EmaPeriod[] = []
  if (Array.isArray(input.emaPeriods)) {
    for (const p of input.emaPeriods) {
      if (typeof p === 'number' && (EMA_PERIODS as readonly number[]).includes(p)) {
        validPeriods.push(p as EmaPeriod)
      }
    }
  }
  const rsiPeriod = clampInt(input.rsiPeriod, DEFAULT_SETTINGS.rsiPeriod, 2, 200)
  const fibLookback = clampInt(input.fibLookback, DEFAULT_SETTINGS.fibLookback, 5, 1000)

  return {
    version: 1,
    enabled,
    emaPeriods:  validPeriods.length > 0 ? validPeriods : [...DEFAULT_SETTINGS.emaPeriods],
    rsiPeriod,
    fibLookback,
  }
}

function clampInt(v: unknown, fallback: number, lo: number, hi: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback
  return Math.max(lo, Math.min(hi, Math.round(v)))
}

/** True if the settings file currently exists on disk. */
export function indicatorSettingsExists(projectRoot: string): boolean {
  const path = join(resolve(projectRoot), VAULT_SUBDIR, SETTINGS_SUBDIR, SETTINGS_FILE)
  return existsSync(path) && statSync(path).isFile()
}
