/**
 * SATEX — Intel grid layout persistence.
 *
 * Reads + writes `<project-root>/Vault/Settings/intel-layout.md` — the composable
 * Intel workspace's module placement, kept in its OWN file (decoupled from
 * workspace-state.md, so no schema migration touches the existing record). Same
 * JSON-in-markdown trick as workspace-state.ts / indicator-settings.ts so the
 * operator can inspect or hand-edit the grid in Obsidian.
 *
 * The renderer sends Zod-validated placements (IntelLayoutSetReq), and re-runs
 * the geometric sanitizer (overlap/clamp, with real per-module min sizes) on
 * hydrate. This service therefore does light shape-and-id validation only, so a
 * hand-edited or stale file can never crash the app — it always returns a valid
 * ModulePlacement[] (empty when absent/corrupt, which the renderer fills with
 * the curated default layout).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { INTEL_MODULE_IDS, type IntelModuleId, type ModulePlacement } from '@shared/types'
import { createLogger } from './logger'

const log = createLogger('intel-layout')

const VAULT_SUBDIR    = 'Vault'
const SETTINGS_SUBDIR = 'Settings'
const SETTINGS_FILE   = 'intel-layout.md'

const KNOWN_IDS = new Set<string>(INTEL_MODULE_IDS as readonly string[])

export class IntelLayoutService {
  private projectRoot: string
  private cache: ModulePlacement[] | null = null

  constructor(projectRoot: string) {
    this.projectRoot = resolve(projectRoot)
  }

  get(): ModulePlacement[] {
    if (this.cache) return this.cache
    this.cache = this.readFromDisk()
    return this.cache
  }

  set(next: ModulePlacement[]): ModulePlacement[] {
    const clean = sanitizeShape(next)
    this.writeToDisk(clean)
    this.cache = clean
    return clean
  }

  // ── internal ────────────────────────────────────────────────────────────

  private settingsPath(): string {
    return join(this.projectRoot, VAULT_SUBDIR, SETTINGS_SUBDIR, SETTINGS_FILE)
  }

  private readFromDisk(): ModulePlacement[] {
    const path = this.settingsPath()
    if (!existsSync(path)) {
      log.info('no intel-layout.md yet — renderer will use the default layout', { path })
      return []
    }
    try {
      const raw = readFileSync(path, 'utf8')
      const parsed = parseJsonFence(raw)
      return parsed ? sanitizeShape(parsed) : []
    } catch (e) {
      log.warn('failed to read intel-layout.md', { path, err: String(e) })
      return []
    }
  }

  private writeToDisk(layout: ModulePlacement[]): void {
    const path = this.settingsPath()
    const dir = join(this.projectRoot, VAULT_SUBDIR, SETTINGS_SUBDIR)
    mkdirSync(dir, { recursive: true })
    const body = renderMarkdown(layout)
    writeFileSync(path, body, 'utf8')
    log.debug('intel-layout.md written', { path, modules: layout.length })
  }
}

// ── helpers ────────────────────────────────────────────────────────────────

function renderMarkdown(layout: ModulePlacement[]): string {
  const json = JSON.stringify(layout, null, 2)
  return [
    '# SATEX — Intel Workspace Layout',
    '',
    'Auto-managed by the SATEX app. Persists on every Edit-Modules change in the',
    'Intel tab. Hand-edit the JSON below and restart to override; unknown modules',
    'and overlaps are dropped on load.',
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

function parseJsonFence(raw: string): unknown {
  const match = raw.match(JSON_FENCE_RE)
  if (!match) return null
  try {
    return JSON.parse(match[1]!)
  } catch {
    return null
  }
}

/** Light shape + id guard. Drops anything that is not a well-formed placement
 *  for a known module id. Geometry (overlap/clamp) is the renderer's job. */
function sanitizeShape(input: unknown): ModulePlacement[] {
  if (!Array.isArray(input)) return []
  const out: ModulePlacement[] = []
  const seen = new Set<string>()
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    if (typeof r.id !== 'string' || !KNOWN_IDS.has(r.id)) continue
    if (seen.has(r.id)) continue
    const nums = [r.x, r.y, r.w, r.h]
    if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n))) continue
    seen.add(r.id)
    out.push({
      id: r.id as IntelModuleId,
      x: r.x as number, y: r.y as number,
      w: r.w as number, h: r.h as number,
    })
  }
  return out
}
