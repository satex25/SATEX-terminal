/**
 * SATEX — Indicator-settings file-store tests (P-060 · 2026-07-02;
 * P-061 regression appended same day — defaults-aliasing fix).
 *
 * Round-trips through a real tmpdir so the markdown-render + JSON-fence-parse
 * cycle is end-to-end exercised. Mirrors the subsecond-prefs.test.ts /
 * kill-switch-store.test.ts pattern (mkdtempSync per test, rmSync teardown).
 * Verifies:
 *   • Defaults when no file exists; get() never writes as a side-effect.
 *   • Round-trip: set() writes the file, a fresh service reads it back.
 *   • Cache contract (get() holds) and the reload() manual-edit escape hatch.
 *   • Sanitizer: unknown/mistyped enabled flags, non-member EMA periods,
 *     clamped + rounded numeric fields, legendVisible backward-compat,
 *     version pinning, tolerant partial hydrate.
 *   • Corruption recovery: no fence / corrupt JSON → defaults, no throw.
 *   • Written markdown stays hand-inspectable and is sanitized BEFORE write.
 *   • P-061: every defaults-fallback path (no file / no fence / read-error)
 *     returns a fresh object — never a live reference into the shared
 *     DEFAULT_INDICATOR_SETTINGS module constant.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { IndicatorSettingsService } from './indicator-settings'
import {
  DEFAULT_INDICATOR_SETTINGS, INDICATOR_IDS, type IndicatorSettings,
} from '@shared/chart-indicators'

let tmpdir: string
let settingsPath: string

beforeEach(() => {
  tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'satex-indtoggles-'))
  settingsPath = path.join(tmpdir, 'Vault', 'Settings', 'indicator-toggles.md')
})

afterEach(() => {
  try { fs.rmSync(tmpdir, { recursive: true, force: true }) } catch { /* OS reaps */ }
})

/** Writes an arbitrary document at the settings path (no fence unless given one). */
function writeRawFile(content: string): void {
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true })
  fs.writeFileSync(settingsPath, content, 'utf8')
}

/** Wraps a raw JSON string in a minimal hand-written markdown fixture. */
function writeSettingsFile(fenceBody: string): void {
  writeRawFile(['# hand-written fixture', '', '```json', fenceBody, '```', ''].join('\n'))
}

/** A fully valid, non-default settings object (sanitize-stable). */
function customSettings(): IndicatorSettings {
  return {
    version: 1,
    enabled: {
      'ema':           true,
      'rsi':           true,
      'double-top':    false,
      'double-bottom': false,
      'fibonacci':     false,
      'pivot-points':  false,
    },
    emaPeriods:    [50, 200],
    rsiPeriod:     21,
    fibLookback:   100,
    legendVisible: false,
  }
}

describe('IndicatorSettingsService — empty state', () => {
  it('returns defaults when no file exists, without creating the file', () => {
    const svc = new IndicatorSettingsService(tmpdir)
    expect(svc.get()).toEqual(DEFAULT_INDICATOR_SETTINGS)
    // get() must not create the file as a side-effect — vault writes can fail
    // (read-only fs, permission denied) and get() is on the boot hot path.
    expect(fs.existsSync(settingsPath)).toBe(false)
  })
})

describe('IndicatorSettingsService — round-trip', () => {
  it('a fresh service instance reads back the previous writer\'s settings', () => {
    const writer = new IndicatorSettingsService(tmpdir)
    writer.set(customSettings())
    const reader = new IndicatorSettingsService(tmpdir)
    expect(reader.get()).toEqual(customSettings())
  })

  it('set() echoes the sanitized settings it wrote', () => {
    const svc = new IndicatorSettingsService(tmpdir)
    expect(svc.set(customSettings())).toEqual(customSettings())
  })
})

describe('IndicatorSettingsService — cache and reload', () => {
  it('get() serves the cached result even after the file changes on disk', () => {
    const svc = new IndicatorSettingsService(tmpdir)
    const first = svc.get() // defaults — no file yet
    writeSettingsFile(JSON.stringify(customSettings()))
    expect(svc.get()).toEqual(first) // documented cache contract
  })

  it('reload() picks up manual on-disk edits', () => {
    const svc = new IndicatorSettingsService(tmpdir)
    expect(svc.get()).toEqual(DEFAULT_INDICATOR_SETTINGS)
    writeSettingsFile(JSON.stringify(customSettings()))
    expect(svc.reload()).toEqual(customSettings())
    expect(svc.get()).toEqual(customSettings()) // reload also refreshes the cache
  })
})

describe('IndicatorSettingsService — sanitize: enabled flags', () => {
  it('drops unknown indicator ids and non-boolean values, honors valid ones', () => {
    writeSettingsFile(JSON.stringify({
      enabled: {
        'macd':       true,    // unknown id — must never reach the output
        'rsi':        'true',  // string, not boolean — default (false) wins
        'ema':        1,       // number, not boolean — default (true) wins
        'fibonacci':  true,    // valid override
        'double-top': null,    // null — default (false) wins
      },
    }))
    const s = new IndicatorSettingsService(tmpdir).get()
    expect(Object.keys(s.enabled).sort()).toEqual([...INDICATOR_IDS].sort())
    expect(s.enabled['rsi']).toBe(false)
    expect(s.enabled['ema']).toBe(true)
    expect(s.enabled['fibonacci']).toBe(true)
    expect(s.enabled['double-top']).toBe(false)
  })
})

describe('IndicatorSettingsService — sanitize: EMA periods', () => {
  it('filters non-member and mistyped periods, keeps valid ones in order', () => {
    writeSettingsFile('{"emaPeriods": [9, 7, 50, "21", null]}')
    expect(new IndicatorSettingsService(tmpdir).get().emaPeriods).toEqual([9, 50])
  })

  it('falls back to a fresh copy of the default periods when none survive', () => {
    writeSettingsFile('{"emaPeriods": []}')
    const periods = new IndicatorSettingsService(tmpdir).get().emaPeriods
    expect(periods).toEqual(DEFAULT_INDICATOR_SETTINGS.emaPeriods)
    // Pins the `[...]` copy in sanitize — mutating the result must not be able
    // to corrupt the shared module constant.
    expect(periods).not.toBe(DEFAULT_INDICATOR_SETTINGS.emaPeriods)
  })
})

describe('IndicatorSettingsService — sanitize: numeric clamps', () => {
  it('clamps and rounds rsiPeriod into [2, 200], defaulting non-numbers', () => {
    const cases: Array<[string, number]> = [
      ['{"rsiPeriod": 1}',     2],   // below lo
      ['{"rsiPeriod": 999}',   200], // above hi
      ['{"rsiPeriod": 14.6}',  15],  // rounded
      ['{"rsiPeriod": "abc"}', 14],  // string → default
      ['{"rsiPeriod": null}',  14],  // null → default
    ]
    for (const [fence, expected] of cases) {
      writeSettingsFile(fence)
      expect(new IndicatorSettingsService(tmpdir).get().rsiPeriod).toBe(expected)
    }
  })

  it('clamps fibLookback into [5, 1000], defaulting non-numbers', () => {
    const cases: Array<[string, number]> = [
      ['{"fibLookback": 2}',    5],    // below lo
      ['{"fibLookback": 5000}', 1000], // above hi
      ['{"fibLookback": null}', 50],   // null → default
    ]
    for (const [fence, expected] of cases) {
      writeSettingsFile(fence)
      expect(new IndicatorSettingsService(tmpdir).get().fibLookback).toBe(expected)
    }
  })
})

describe('IndicatorSettingsService — backward-compat and version', () => {
  it('defaults legendVisible to true when absent, honors an explicit false', () => {
    writeSettingsFile('{"rsiPeriod": 14}') // pre-legendVisible persisted shape
    expect(new IndicatorSettingsService(tmpdir).get().legendVisible).toBe(true)

    writeSettingsFile('{"legendVisible": false}')
    expect(new IndicatorSettingsService(tmpdir).get().legendVisible).toBe(false)
  })

  it('pins the schema version to 1 regardless of the persisted value', () => {
    writeSettingsFile('{"version": 99}')
    expect(new IndicatorSettingsService(tmpdir).get().version).toBe(1)
  })

  it('tolerantly hydrates a partial file, defaulting every missing field', () => {
    writeSettingsFile('{"rsiPeriod": 21}')
    const s = new IndicatorSettingsService(tmpdir).get()
    expect(s.rsiPeriod).toBe(21)
    expect(s.enabled).toEqual(DEFAULT_INDICATOR_SETTINGS.enabled)
    expect(s.emaPeriods).toEqual(DEFAULT_INDICATOR_SETTINGS.emaPeriods)
    expect(s.fibLookback).toBe(DEFAULT_INDICATOR_SETTINGS.fibLookback)
    expect(s.legendVisible).toBe(DEFAULT_INDICATOR_SETTINGS.legendVisible)
    expect(s.version).toBe(1)
  })
})

describe('IndicatorSettingsService — corruption recovery', () => {
  it('returns defaults when the file has no json fence', () => {
    writeRawFile('# no fence here\n\njust prose, no settings block\n')
    expect(new IndicatorSettingsService(tmpdir).get()).toEqual(DEFAULT_INDICATOR_SETTINGS)
  })

  it('returns defaults when the fence contains corrupt JSON', () => {
    writeSettingsFile('{not valid json at all')
    expect(new IndicatorSettingsService(tmpdir).get()).toEqual(DEFAULT_INDICATOR_SETTINGS)
  })
})

describe('IndicatorSettingsService — defaults are never aliased (P-061)', () => {
  it('every defaults-fallback path returns a fresh object, never a reference into DEFAULT_INDICATOR_SETTINGS', () => {
    // Path A (readFromDisk: no file at all — indicator-settings.ts:69).
    const noFile = new IndicatorSettingsService(tmpdir).get()
    expect(noFile.enabled).not.toBe(DEFAULT_INDICATOR_SETTINGS.enabled)
    expect(noFile.emaPeriods).not.toBe(DEFAULT_INDICATOR_SETTINGS.emaPeriods)

    // Path B (readFromDisk: file exists, no parseable json fence — :76).
    writeRawFile('# no fence here\n\njust prose, no settings block\n')
    const noFence = new IndicatorSettingsService(tmpdir).get()
    expect(noFence.enabled).not.toBe(DEFAULT_INDICATOR_SETTINGS.enabled)
    expect(noFence.emaPeriods).not.toBe(DEFAULT_INDICATOR_SETTINGS.emaPeriods)

    // Path C (readFromDisk: readFileSync itself throws — :81). Force EISDIR
    // by making the settings path a directory instead of a file.
    fs.rmSync(settingsPath, { force: true })
    fs.mkdirSync(settingsPath, { recursive: true })
    const readError = new IndicatorSettingsService(tmpdir).get()
    expect(readError.enabled).not.toBe(DEFAULT_INDICATOR_SETTINGS.enabled)
    expect(readError.emaPeriods).not.toBe(DEFAULT_INDICATOR_SETTINGS.emaPeriods)

    // The actual hazard (P-061): mutating a returned defaults object must never
    // corrupt the shared module constant for the next caller in this process.
    noFile.enabled['ema'] = false
    noFile.emaPeriods.push(999 as never)
    expect(DEFAULT_INDICATOR_SETTINGS.enabled['ema']).toBe(true)
    expect(DEFAULT_INDICATOR_SETTINGS.emaPeriods).not.toContain(999)
  })
})

describe('IndicatorSettingsService — write hygiene', () => {
  it('writes hand-inspectable markdown whose fence is sanitized BEFORE write', () => {
    const svc = new IndicatorSettingsService(tmpdir)
    // Junk in: a non-member EMA period, NaN rsi, Infinity fib. NaN/Infinity are
    // number-typed, so only the period array needs the escape-hatch cast.
    svc.set({
      ...customSettings(),
      emaPeriods:  [7],
      rsiPeriod:   NaN,
      fibLookback: Infinity,
    } as unknown as IndicatorSettings)

    const raw = fs.readFileSync(settingsPath, 'utf8')
    expect(raw).toContain('# SATEX — Chart Indicator Settings') // analyst preamble
    const fence = /```json\s*\n([\s\S]*?)\n```/.exec(raw)
    expect(fence).not.toBeNull()
    const persisted = JSON.parse(fence![1]!) as IndicatorSettings
    // Sanitized values hit the disk — never the junk.
    expect(persisted.emaPeriods).toEqual(DEFAULT_INDICATOR_SETTINGS.emaPeriods)
    expect(persisted.rsiPeriod).toBe(DEFAULT_INDICATOR_SETTINGS.rsiPeriod)
    expect(persisted.fibLookback).toBe(DEFAULT_INDICATOR_SETTINGS.fibLookback)
  })
})
