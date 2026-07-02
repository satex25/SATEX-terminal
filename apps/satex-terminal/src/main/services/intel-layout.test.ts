/**
 * SATEX — Intel layout persistence tests (P-059).
 *
 * Round-trips `IntelLayoutService` through a real tmpdir so the markdown-render +
 * JSON-fence-parse cycle is exercised end-to-end — the subsecond-prefs.test.ts /
 * kill-switch-store.test.ts pattern (mkdtempSync per test, rmSync teardown).
 * Pins the service contracts the Intel workspace (P-048) depends on:
 *   • get() is read-only: no file → [] and no side-effect write.
 *   • set()/get() round-trip through a fresh instance (cache can't mask the read path).
 *   • The documented in-instance cache (intel-layout.ts get()).
 *   • sanitizeShape: unknown ids, duplicate ids, non-object entries, and non-finite
 *     geometry are dropped on load — a hand-edited file can never crash the app.
 *   • Corruption recovery: no fence / bad JSON / non-array fence → [] (renderer then
 *     falls back to the curated default layout).
 *   • The written markdown stays hand-inspectable (preamble + parseable fence).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import type { ModulePlacement } from '@shared/types'
import { IntelLayoutService } from './intel-layout'

let tmpdir: string
let settingsPath: string

beforeEach(() => {
  tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'satex-intel-layout-'))
  settingsPath = path.join(tmpdir, 'Vault', 'Settings', 'intel-layout.md')
})

afterEach(() => {
  try { fs.rmSync(tmpdir, { recursive: true, force: true }) } catch { /* OS reaps */ }
})

const RELIABILITY: ModulePlacement = { id: 'reliability', x: 0, y: 0, w: 4, h: 3 }
const REGIME: ModulePlacement      = { id: 'regime',      x: 4, y: 0, w: 4, h: 3 }

/** Hand-write a settings file the way an operator (or a stale app) would. */
function writeRawFile(lines: string[]): void {
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true })
  fs.writeFileSync(settingsPath, lines.join('\n'), 'utf8')
}

function writeFenceJson(payload: unknown): void {
  writeRawFile(['# Hand-edited test', '', '```json', JSON.stringify(payload, null, 2), '```', ''])
}

describe('IntelLayoutService — empty state', () => {
  it('returns [] when no file exists and does NOT create the file', () => {
    const svc = new IntelLayoutService(tmpdir)
    expect(svc.get()).toEqual([])
    // get() must stay read-only — only set() writes. The renderer treats [] as
    // "use the curated default layout"; a side-effect write would freeze that
    // default onto disk before the operator ever placed a module.
    expect(fs.existsSync(settingsPath)).toBe(false)
  })
})

describe('IntelLayoutService — round-trip', () => {
  it('set() persists and a FRESH instance reads the same placements back', () => {
    const writer = new IntelLayoutService(tmpdir)
    writer.set([RELIABILITY, REGIME])

    const reader = new IntelLayoutService(tmpdir)
    expect(reader.get()).toEqual([RELIABILITY, REGIME])
  })

  it('set() echoes the sanitized array it wrote', () => {
    const svc = new IntelLayoutService(tmpdir)
    expect(svc.set([REGIME])).toEqual([REGIME])
  })

  it('empty-array round-trip: set([]) persists an explicit empty layout', () => {
    const svc = new IntelLayoutService(tmpdir)
    svc.set([])
    expect(fs.existsSync(settingsPath)).toBe(true)
    const reader = new IntelLayoutService(tmpdir)
    expect(reader.get()).toEqual([])
  })

  it('get() serves the in-instance cache after the first read', () => {
    writeFenceJson([RELIABILITY])
    const svc = new IntelLayoutService(tmpdir)
    expect(svc.get()).toEqual([RELIABILITY])

    // Mutate the file behind the service's back — the same instance must keep
    // serving its cached layout (documented contract; main/index.ts relies on
    // it to keep INTEL_LAYOUT_GET off the fs hot path).
    writeFenceJson([REGIME])
    expect(svc.get()).toEqual([RELIABILITY])
  })
})

describe('IntelLayoutService — sanitizeShape on load', () => {
  it('drops entries with unknown module ids, keeps known siblings', () => {
    writeFenceJson([RELIABILITY, { id: 'not-a-module', x: 0, y: 3, w: 4, h: 3 }])
    const svc = new IntelLayoutService(tmpdir)
    expect(svc.get()).toEqual([RELIABILITY])
  })

  it('drops duplicate ids — first placement wins', () => {
    writeFenceJson([RELIABILITY, { ...RELIABILITY, x: 8 }])
    const svc = new IntelLayoutService(tmpdir)
    expect(svc.get()).toEqual([RELIABILITY])
  })

  it('drops non-object entries, keeps valid siblings', () => {
    writeFenceJson([null, 42, 'reliability', REGIME])
    const svc = new IntelLayoutService(tmpdir)
    expect(svc.get()).toEqual([REGIME])
  })

  it('drops entries with non-finite or non-numeric geometry', () => {
    writeFenceJson([
      { id: 'reliability', x: 0, y: 0, w: Number.NaN, h: 3 },
      { id: 'attribution', x: 0, y: 0, w: 4, h: Number.POSITIVE_INFINITY },
      { id: 'macro', x: '0', y: 0, w: 4, h: 3 },
      REGIME,
    ])
    const svc = new IntelLayoutService(tmpdir)
    expect(svc.get()).toEqual([REGIME])
  })

  it('a fence holding a non-array (object) yields []', () => {
    writeFenceJson({ id: 'reliability', x: 0, y: 0, w: 4, h: 3 })
    const svc = new IntelLayoutService(tmpdir)
    expect(svc.get()).toEqual([])
  })
})

describe('IntelLayoutService — corruption recovery', () => {
  it('file with no json fence yields [] without throwing', () => {
    writeRawFile(['# Not a layout file', '', 'just prose'])
    const svc = new IntelLayoutService(tmpdir)
    expect(svc.get()).toEqual([])
  })

  it('corrupt JSON inside the fence yields [] without throwing', () => {
    writeRawFile(['```json', '{ this is not json ]', '```'])
    const svc = new IntelLayoutService(tmpdir)
    expect(svc.get()).toEqual([])
  })
})

describe('IntelLayoutService — written artifact', () => {
  it('set() sanitizes BEFORE writing: unknown ids never reach disk', () => {
    const svc = new IntelLayoutService(tmpdir)
    svc.set([RELIABILITY, { id: 'bogus', x: 0, y: 3, w: 4, h: 3 } as unknown as ModulePlacement])

    const raw = fs.readFileSync(settingsPath, 'utf8')
    expect(raw).not.toContain('bogus')
    const fence = /```json\s*\n([\s\S]*?)\n```/.exec(raw)
    expect(fence).not.toBeNull()
    expect(JSON.parse(fence![1]!)).toEqual([RELIABILITY])
  })

  it('written markdown keeps the hand-inspectable preamble and a parseable fence', () => {
    const svc = new IntelLayoutService(tmpdir)
    svc.set([RELIABILITY])

    const raw = fs.readFileSync(settingsPath, 'utf8')
    expect(raw).toContain('# SATEX — Intel Workspace Layout')
    expect(raw).toContain('```json')
    const fence = /```json\s*\n([\s\S]*?)\n```/.exec(raw)
    expect(JSON.parse(fence![1]!)).toEqual([RELIABILITY])
  })
})
