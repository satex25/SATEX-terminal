/**
 * SATEX — Sub-second prefs file-store tests (A1 Sprint 2, v0.4.4).
 *
 * Round-trips through a real tmpdir so the markdown-render + JSON-fence-parse
 * cycle is end-to-end exercised. Mirrors the kill-switch-store.test.ts pattern
 * (mkdtempSync per test, rmSync teardown). Verifies:
 *   • Empty initial state when no file exists.
 *   • Round-trip: setOne writes file, fresh service reads back the same pref.
 *   • Crypto-only filter at the sanitizer (non-crypto symbols never reach disk).
 *   • Out-of-range value rejected by sanitizer.
 *   • Corruption recovery: garbage file → empty prefs + warn, doesn't throw.
 *   • Markdown structure is parseable and the human-readable preamble is intact
 *     so analysts hand-inspecting the vault file see what they expect.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { SubsecondPrefsService } from './subsecond-prefs'

let tmpdir: string
let settingsPath: string

beforeEach(() => {
  tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'satex-ssprefs-'))
  settingsPath = path.join(tmpdir, 'Vault', 'Settings', 'subsecond-prefs.md')
})

afterEach(() => {
  try { fs.rmSync(tmpdir, { recursive: true, force: true }) } catch { /* OS reaps */ }
})

describe('SubsecondPrefsService — empty state', () => {
  it('returns empty prefs when no file exists', () => {
    const svc = new SubsecondPrefsService(tmpdir)
    expect(svc.get()).toEqual({ version: 1, prefs: {} })
    // get() must not create the file as a side-effect — only setOne / replaceAll
    // write to disk. This matters because vault writes can fail (read-only fs,
    // permission denied), and the get() path is on the renderer-mount hot path.
    expect(fs.existsSync(settingsPath)).toBe(false)
  })
})

describe('SubsecondPrefsService — round-trip', () => {
  it('setOne writes a markdown file with a parseable JSON fence', () => {
    const svc = new SubsecondPrefsService(tmpdir)
    const result = svc.setOne('BTC', 500)
    expect(result).toEqual({ version: 1, prefs: { BTC: 500 } })

    const raw = fs.readFileSync(settingsPath, 'utf8')
    expect(raw).toContain('# SATEX — Sub-second Candle Preferences')
    expect(raw).toContain('```json')
    expect(raw).toContain('"BTC": 500')
  })

  it('a fresh service instance reads back the previous writer\'s prefs', () => {
    const writer = new SubsecondPrefsService(tmpdir)
    writer.setOne('BTC', 500)
    writer.setOne('ETH', 250)

    // Fresh instance — proves the cache isn't masking a broken read path.
    const reader = new SubsecondPrefsService(tmpdir)
    expect(reader.get()).toEqual({ version: 1, prefs: { BTC: 500, ETH: 250 } })
  })

  it('setOne overwrites the prior value for the same symbol', () => {
    const svc = new SubsecondPrefsService(tmpdir)
    svc.setOne('BTC', 500)
    svc.setOne('BTC', 250)
    expect(svc.get().prefs).toEqual({ BTC: 250 })
  })

  it('setOne preserves prefs for OTHER symbols (no clobber)', () => {
    const svc = new SubsecondPrefsService(tmpdir)
    svc.setOne('BTC', 500)
    svc.setOne('ETH', 250)
    svc.setOne('BTC', 250) // change only BTC
    expect(svc.get().prefs).toEqual({ BTC: 250, ETH: 250 })
  })
})

describe('SubsecondPrefsService — crypto-only sanitizer', () => {
  it('setOne SILENTLY rejects non-crypto symbols', () => {
    const svc = new SubsecondPrefsService(tmpdir)
    const result = svc.setOne('NVDA', 250) // equity — must not persist
    expect(result.prefs).toEqual({})
    // File may or may not exist — implementation writes the (empty) sanitized
    // state through on every setOne. Either way the on-disk content must not
    // contain the rejected symbol.
    if (fs.existsSync(settingsPath)) {
      expect(fs.readFileSync(settingsPath, 'utf8')).not.toContain('NVDA')
    }
  })

  it('reading a hand-edited file with non-crypto entries drops them at parse', () => {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true })
    fs.writeFileSync(settingsPath, [
      '# Hand-edited test',
      '',
      '```json',
      JSON.stringify({
        version: 1,
        prefs: { BTC: 500, NVDA: 250, ES: 500, ETH: 250 },
      }, null, 2),
      '```',
      '',
    ].join('\n'), 'utf8')

    const svc = new SubsecondPrefsService(tmpdir)
    expect(svc.get().prefs).toEqual({ BTC: 500, ETH: 250 })
  })

  it('reading a hand-edited file with out-of-range bucket values drops them', () => {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true })
    fs.writeFileSync(settingsPath, [
      '```json',
      JSON.stringify({
        version: 1,
        prefs: { BTC: 100, ETH: 250, DOGE: 'fast' },
      }),
      '```',
    ].join('\n'), 'utf8')

    const svc = new SubsecondPrefsService(tmpdir)
    // BTC=100 dropped (not in {250,500}); DOGE dropped (not a crypto symbol
    // in UNIVERSE, also string value); ETH=250 kept.
    expect(svc.get().prefs).toEqual({ ETH: 250 })
  })
})

describe('SubsecondPrefsService — corruption recovery', () => {
  it('garbage file → empty prefs, no throw', () => {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true })
    fs.writeFileSync(settingsPath, 'this is not valid markdown or JSON', 'utf8')

    const svc = new SubsecondPrefsService(tmpdir)
    expect(() => svc.get()).not.toThrow()
    expect(svc.get().prefs).toEqual({})
  })

  it('file with no JSON fence → empty prefs', () => {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true })
    fs.writeFileSync(settingsPath, '# Just a title\n\nNo code block here.\n', 'utf8')

    const svc = new SubsecondPrefsService(tmpdir)
    expect(svc.get().prefs).toEqual({})
  })

  it('file with invalid JSON inside the fence → empty prefs', () => {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true })
    fs.writeFileSync(settingsPath, '```json\n{ this is not json\n```\n', 'utf8')

    const svc = new SubsecondPrefsService(tmpdir)
    expect(svc.get().prefs).toEqual({})
  })

  it('subsequent setOne after recovering from corruption writes a CLEAN file', () => {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true })
    fs.writeFileSync(settingsPath, 'garbage', 'utf8')

    const svc = new SubsecondPrefsService(tmpdir)
    svc.setOne('BTC', 500)
    // The corrupt content is overwritten with a clean rendering.
    const raw = fs.readFileSync(settingsPath, 'utf8')
    expect(raw).toContain('```json')
    expect(raw).toContain('"BTC": 500')
    expect(raw).not.toContain('garbage')
  })
})

describe('SubsecondPrefsService — replaceAll', () => {
  it('replaceAll wholesale overwrites and sanitizes', () => {
    const svc = new SubsecondPrefsService(tmpdir)
    svc.setOne('BTC', 500)
    svc.setOne('ETH', 250)
    const result = svc.replaceAll({
      version: 1,
      prefs: {
        BTC: 250,
        NVDA: 500 as const, // dropped — non-crypto
      },
    })
    expect(result.prefs).toEqual({ BTC: 250 }) // ETH gone (not in payload), NVDA dropped, BTC overwritten
  })

  it('replaceAll with null / undefined yields empty prefs', () => {
    const svc = new SubsecondPrefsService(tmpdir)
    svc.setOne('BTC', 500)
    // @ts-expect-error — testing runtime tolerance of a malformed input
    svc.replaceAll(null)
    expect(svc.get().prefs).toEqual({})
  })
})

describe('SubsecondPrefsService — reload', () => {
  it('reload picks up an external file edit', () => {
    const svc = new SubsecondPrefsService(tmpdir)
    svc.setOne('BTC', 500)
    expect(svc.get().prefs).toEqual({ BTC: 500 })

    // Simulate an analyst hand-editing the vault file between reads.
    const raw = fs.readFileSync(settingsPath, 'utf8')
    const edited = raw.replace('"BTC": 500', '"BTC": 250')
    fs.writeFileSync(settingsPath, edited, 'utf8')

    // get() still returns the cached value because the cache hasn't been busted.
    expect(svc.get().prefs).toEqual({ BTC: 500 })

    // reload() forces a fresh read.
    svc.reload()
    expect(svc.get().prefs).toEqual({ BTC: 250 })
  })
})
