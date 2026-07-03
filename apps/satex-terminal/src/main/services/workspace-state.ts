/**
 * SATEX — Workspace state persistence (Phase 12 · 2026-05-15).
 *
 * Reads + writes `<project-root>/Vault/Settings/workspace-state.md`. Sibling
 * of indicator-settings.ts — same JSON-in-markdown trick so users can inspect
 * or hand-edit the file in Obsidian. Defaults boot the app to Quad workspace
 * with NVDA/SPY/ES/BTC, which the renderer then restores via IPC.
 *
 * Sanitize on read AND write so corrupt files (or future schema drift) never
 * crash the app — we always return a valid WorkspaceState shape.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  DEFAULT_WORKSPACE_STATE,
  RAIL_IDS,
  WORKSPACE_TABS,
  type RailId,
  type Workspace,
  type WorkspaceState,
} from '@shared/types'
import { UNIVERSE_SYMBOLS } from '@shared/constants'
import { createLogger } from './logger'

const log = createLogger('workspace')

const VAULT_SUBDIR    = 'Vault'
const SETTINGS_SUBDIR = 'Settings'
const SETTINGS_FILE   = 'workspace-state.md'

export type { WorkspaceState }
const DEFAULT_STATE = DEFAULT_WORKSPACE_STATE

export class WorkspaceStateService {
  private projectRoot: string
  private cache: WorkspaceState | null = null

  constructor(projectRoot: string) {
    this.projectRoot = resolve(projectRoot)
  }

  get(): WorkspaceState {
    if (this.cache) return this.cache
    this.cache = this.readFromDisk()
    return this.cache
  }

  set(next: WorkspaceState): WorkspaceState {
    const sanitized = sanitize(next)
    this.writeToDisk(sanitized)
    this.cache = sanitized
    return sanitized
  }

  // ── internal ────────────────────────────────────────────────────────────

  private settingsPath(): string {
    return join(this.projectRoot, VAULT_SUBDIR, SETTINGS_SUBDIR, SETTINGS_FILE)
  }

  private readFromDisk(): WorkspaceState {
    const path = this.settingsPath()
    if (!existsSync(path)) {
      log.info('no workspace-state.md yet — using defaults', { path })
      return { ...DEFAULT_STATE, quadSymbols: [...DEFAULT_STATE.quadSymbols], collapsedRails: [...DEFAULT_STATE.collapsedRails] }
    }
    try {
      const raw = readFileSync(path, 'utf8')
      const parsed = parseJsonFence(raw)
      if (!parsed) {
        log.warn('workspace-state.md present but no parseable json fence', { path })
        return { ...DEFAULT_STATE, quadSymbols: [...DEFAULT_STATE.quadSymbols], collapsedRails: [...DEFAULT_STATE.collapsedRails] }
      }
      return sanitize(parsed)
    } catch (e) {
      log.warn('failed to read workspace-state.md', { path, err: String(e) })
      return { ...DEFAULT_STATE, quadSymbols: [...DEFAULT_STATE.quadSymbols], collapsedRails: [...DEFAULT_STATE.collapsedRails] }
    }
  }

  private writeToDisk(s: WorkspaceState): void {
    const path = this.settingsPath()
    const dir = join(this.projectRoot, VAULT_SUBDIR, SETTINGS_SUBDIR)
    mkdirSync(dir, { recursive: true })
    const body = renderMarkdown(s)
    writeFileSync(path, body, 'utf8')
    log.debug('workspace-state.md written', { path, bytes: body.length })
  }
}

// ── helpers ────────────────────────────────────────────────────────────────

function renderMarkdown(s: WorkspaceState): string {
  const json = JSON.stringify(s, null, 2)
  return [
    '# SATEX — Workspace State',
    '',
    'Auto-managed by the SATEX app. Changes persist on every workspace switch',
    'and every Quad-symbol swap. Hand-edit the JSON below and restart to',
    'override.',
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

function parseJsonFence(raw: string): Partial<WorkspaceState> | null {
  const match = raw.match(JSON_FENCE_RE)
  if (!match) return null
  try {
    return JSON.parse(match[1]!) as Partial<WorkspaceState>
  } catch {
    return null
  }
}

const UNIVERSE_SET = new Set<string>(UNIVERSE_SYMBOLS as readonly string[])

function isWorkspace(v: unknown): v is Workspace {
  return typeof v === 'string' && (WORKSPACE_TABS as readonly string[]).includes(v)
}

function isRailId(v: unknown): v is RailId {
  return typeof v === 'string' && (RAIL_IDS as readonly string[]).includes(v)
}

/** Normalize a possibly-partial input into a valid WorkspaceState. Each
 *  field falls back to its default when invalid. quadSymbols is padded /
 *  trimmed to exactly 4 entries and filtered to symbols in UNIVERSE so a
 *  removed-from-codebase ticker can't break the chart. */
function sanitize(input: Partial<WorkspaceState>): WorkspaceState {
  const workspace: Workspace = isWorkspace(input.workspace)
    ? input.workspace
    : DEFAULT_STATE.workspace

  const seen = new Set<string>()
  const validQuad: string[] = []
  if (Array.isArray(input.quadSymbols)) {
    for (const s of input.quadSymbols) {
      if (typeof s !== 'string') continue
      const up = s.toUpperCase()
      if (!UNIVERSE_SET.has(up)) continue
      if (seen.has(up)) continue
      seen.add(up); validQuad.push(up)
      if (validQuad.length === 4) break
    }
  }
  // Pad with defaults if user accidentally trimmed the list short.
  for (const fallback of DEFAULT_STATE.quadSymbols) {
    if (validQuad.length === 4) break
    if (!seen.has(fallback)) { seen.add(fallback); validQuad.push(fallback) }
  }

  const chartSymbol =
    typeof input.chartSymbol === 'string'
      && UNIVERSE_SET.has(input.chartSymbol.toUpperCase())
    ? input.chartSymbol.toUpperCase()
    : DEFAULT_STATE.chartSymbol

  // Additive field (no version bump): a record written before landingWorkspace
  // existed simply lacks it, so fall back to the default.
  const landingWorkspace: Workspace = isWorkspace(input.landingWorkspace)
    ? input.landingWorkspace
    : DEFAULT_STATE.landingWorkspace

  // Additive field (no version bump): a record written before collapsedRails
  // existed simply lacks it → defaults to nothing collapsed. Unknown ids
  // (a rail removed in a future build) are dropped, valid ids deduped.
  const collapsedRails: RailId[] = []
  if (Array.isArray(input.collapsedRails)) {
    const seenRail = new Set<RailId>()
    for (const r of input.collapsedRails) {
      if (!isRailId(r) || seenRail.has(r)) continue
      seenRail.add(r); collapsedRails.push(r)
    }
  }

  return { version: 1, workspace, quadSymbols: validQuad, chartSymbol, landingWorkspace, collapsedRails }
}
