/**
 * SATEX — Sub-second crypto candle per-symbol preference store (A1 Sprint 2).
 *
 * Reads + writes `<project-root>/Vault/Settings/subsecond-prefs.md`. Mirrors the
 * Phase 11 IndicatorSettingsService pattern: an Obsidian-friendly markdown
 * document with a single ```json``` fenced block. Easy for an analyst to
 * inspect or hand-edit (the file lives in the same vault tree as their notes);
 * trivial to parse with the stdlib alone.
 *
 * What it stores
 * --------------
 * The user's preferred default sub-second bucket per crypto symbol. Read by
 * the engine at boot (hydrates SubSecondCandleAggregator.preferredBucketBySymbol)
 * and on every renderer-initiated set. The aggregator still maintains BOTH
 * the 250ms and 500ms buckets for every crypto symbol regardless — the pref
 * only changes which bucket the renderer picks as the default chart timeframe
 * and which stride downstream consumers (tactics, pattern-learner) see from
 * aggregator.getCandleResolutionMs(symbol).
 *
 * Crypto-only by construction
 * ---------------------------
 * Equities + futures have no sub-second feed (IEX caps snapshots at 1/s);
 * a non-crypto symbol in the prefs map would never be consulted but the
 * sanitizer drops them defensively so the file never accretes stale entries.
 *
 * Failure modes
 * -------------
 * Missing file → empty prefs (aggregator falls back to its 250ms default).
 * Corrupted file (bad JSON, missing fence, wrong shape) → empty prefs +
 * warn log. Crash during write → previous file remains intact (writeFileSync
 * truncates atomically on Windows / POSIX for files < pipe-buf size, which
 * this comfortably is).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { findUniverseEntry } from '@shared/constants'
import { createLogger } from './logger'

const log = createLogger('subsecond-prefs')

const VAULT_SUBDIR    = 'Vault'
const SETTINGS_SUBDIR = 'Settings'
const SETTINGS_FILE   = 'subsecond-prefs.md'

/** Allowed bucket values — must stay in sync with PreferredBucket in
 *  subsecond-aggregator.ts and the literal union in SubsecondPrefsSetReq. */
export type PreferredBucketMs = 250 | 500

export interface SubsecondPrefsFile {
  version: 1
  /** Symbol → preferred bucket in ms. Sanitizer drops any non-crypto symbol
   *  or out-of-range value. Empty when the user has not configured anything. */
  prefs: Record<string, PreferredBucketMs>
}

const DEFAULT_FILE: SubsecondPrefsFile = { version: 1, prefs: {} }

export class SubsecondPrefsService {
  private readonly projectRoot: string
  private cache: SubsecondPrefsFile | null = null

  constructor(projectRoot: string) {
    this.projectRoot = resolve(projectRoot)
  }

  /** Returns cached prefs, hydrating from disk on first call. The returned
   *  object is a shallow copy — callers can mutate without poisoning the cache. */
  get(): SubsecondPrefsFile {
    if (!this.cache) this.cache = this.readFromDisk()
    return { version: 1, prefs: { ...this.cache.prefs } }
  }

  /** Replace one symbol's pref. Drops the entry entirely when the symbol is
   *  non-crypto (defense-in-depth — handlers already validate). Returns the
   *  full file post-update so the caller can echo back to the renderer. */
  setOne(symbol: string, bucketMs: PreferredBucketMs): SubsecondPrefsFile {
    const cur = this.cache ?? this.readFromDisk()
    const entry = findUniverseEntry(symbol)
    const next: SubsecondPrefsFile = { version: 1, prefs: { ...cur.prefs } }
    if (entry?.assetClass !== 'crypto') {
      log.warn('refusing to set sub-second pref for non-crypto symbol', { symbol, bucketMs })
      // Idempotent: returning current state with the unwanted symbol stripped
      // if it had somehow snuck in (a future code path adds a symbol then
      // changes its asset class — defensive).
      delete next.prefs[symbol]
    } else {
      next.prefs[symbol] = bucketMs
    }
    this.writeToDisk(next)
    this.cache = next
    return { version: 1, prefs: { ...next.prefs } }
  }

  /** Wholesale replace — used when migrating or for test fixtures. Sanitizes
   *  before write so a hand-edited file with garbage values is normalized. */
  replaceAll(next: Partial<SubsecondPrefsFile>): SubsecondPrefsFile {
    const sanitized = sanitize(next)
    this.writeToDisk(sanitized)
    this.cache = sanitized
    return { version: 1, prefs: { ...sanitized.prefs } }
  }

  /** Force-reload from disk. Useful after a hand-edit. */
  reload(): SubsecondPrefsFile {
    this.cache = this.readFromDisk()
    return { version: 1, prefs: { ...this.cache.prefs } }
  }

  // ── internal ────────────────────────────────────────────────────────────

  private settingsPath(): string {
    return join(this.projectRoot, VAULT_SUBDIR, SETTINGS_SUBDIR, SETTINGS_FILE)
  }

  private readFromDisk(): SubsecondPrefsFile {
    const path = this.settingsPath()
    if (!existsSync(path)) {
      log.info('no subsecond-prefs.md yet — using empty prefs', { path })
      return { ...DEFAULT_FILE }
    }
    try {
      const raw = readFileSync(path, 'utf8')
      const parsed = parseJsonFence(raw)
      if (!parsed) {
        log.warn('subsecond-prefs.md present but no parseable json fence', { path })
        return { ...DEFAULT_FILE }
      }
      return sanitize(parsed)
    } catch (e) {
      log.warn('failed to read subsecond-prefs.md', { path, err: String(e) })
      return { ...DEFAULT_FILE }
    }
  }

  private writeToDisk(file: SubsecondPrefsFile): void {
    const path = this.settingsPath()
    const dir = join(this.projectRoot, VAULT_SUBDIR, SETTINGS_SUBDIR)
    mkdirSync(dir, { recursive: true })
    const body = renderMarkdown(file)
    writeFileSync(path, body, 'utf8')
    log.debug('subsecond-prefs.md written', { path, bytes: body.length, symbols: Object.keys(file.prefs).length })
  }
}

// ── helpers ────────────────────────────────────────────────────────────────

function renderMarkdown(s: SubsecondPrefsFile): string {
  const json = JSON.stringify(s, null, 2)
  return [
    '# SATEX — Sub-second Candle Preferences',
    '',
    'Auto-managed by the SATEX app. Edit via **Settings → Sub-second Candles**',
    'or hand-edit the JSON below (restart to pick up changes).',
    '',
    'Each entry is `"SYMBOL": <250 | 500>` — the preferred default bucket in',
    'milliseconds for that crypto symbol. The aggregator maintains both 250',
    'and 500 buckets for every crypto symbol regardless; this preference only',
    'changes which one the chart picks as the default and which stride',
    'downstream consumers (tactics, pattern-learner) read for the symbol.',
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
    return JSON.parse(match[1]!) as unknown
  } catch {
    return null
  }
}

/** Normalize a possibly-malformed input into a valid SubsecondPrefsFile.
 *  Drops non-crypto symbols, drops out-of-range bucket values, drops keys
 *  whose symbol contains characters outside the universe naming rules.
 *  Empty input → empty prefs (not a synthesized "default" pref — the engine
 *  has its own 250ms fallback). */
function sanitize(input: unknown): SubsecondPrefsFile {
  if (!input || typeof input !== 'object') return { ...DEFAULT_FILE }
  const obj = input as Record<string, unknown>
  const rawPrefs = obj['prefs']
  if (!rawPrefs || typeof rawPrefs !== 'object') return { ...DEFAULT_FILE }

  const prefs: Record<string, PreferredBucketMs> = {}
  for (const [symbol, value] of Object.entries(rawPrefs as Record<string, unknown>)) {
    if (typeof symbol !== 'string' || symbol.length === 0) continue
    const entry = findUniverseEntry(symbol)
    if (entry?.assetClass !== 'crypto') continue
    if (value === 250 || value === 500) prefs[symbol] = value
    // Anything else (NaN, strings, 100, 1000) is silently dropped.
  }
  return { version: 1, prefs }
}
