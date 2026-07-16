/**
 * Characterization coverage for the Alpaca endpoint-mode store (P-094).
 *
 * alpaca-mode.ts persists ONE fact — which Alpaca REST base URL (paper vs
 * live) the engine targets — to `<userData>/alpaca-mode.json`, defaulting to
 * 'paper'. It is explicitly NOT the live-capital arming interlock: the
 * subject's own header comment says the actual flip to live still requires
 * live-mode.ts's typed-phrase + notional-cap + kill-switch-disarmed check.
 * This module only chooses a URL string, so it is off the trading-safety
 * perimeter and a safe autonomous coverage target (CONSTITUTION §2.4).
 *
 * What this suite locks in:
 *   1. DEFAULT-PAPER — absent/corrupt/partial state reads as 'paper', never
 *      silently 'live' (a false-live default is the dangerous direction).
 *   2. STORED 'live' IS HONORED — round-trips through getAlpacaMode() and
 *      resolveBaseUrl().
 *   3. resolveBaseUrl OVERRIDE PRECEDENCE — the module's own inline comment
 *      documents a real 2026-05-13T17:27 production bug where treating the
 *      canonical paper URL as an "override" made the persisted mode never
 *      win. This suite pins both directions: a canonical-URL override is
 *      NOT an override (falls through to persisted mode), a non-canonical
 *      override (e.g. a staging proxy) DOES win outright.
 *   4. setAlpacaMode ROUND-TRIPS — persists JSON with a fresh numeric
 *      updatedAt and returns { ok:true, baseUrl } matching the new mode.
 *   5. WRITE-FAILURE IS SWALLOWED — a save that throws must not crash the
 *      caller; the in-memory mode still reflects the set.
 *
 * Harness: mirrors self-eval-store.test.ts exactly — `state` is an
 * import-time module singleton (`let state = load()`), not
 * dependency-injectable, so each case runs `vi.resetModules()` then
 * `await import('./alpaca-mode')` so `load()` re-executes against a freshly
 * seeded (or absent) file. Only `electron` is mocked (for `app.getPath`);
 * real `fs` against a per-test temp dir exercises the actual JSON I/O.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

const ctx = vi.hoisted(() => ({ userData: '' }))
vi.mock('electron', () => ({ app: { getPath: (_k: string) => ctx.userData } }))

const PAPER_BASE_URL = 'https://paper-api.alpaca.markets'
const LIVE_BASE_URL = 'https://api.alpaca.markets'

const ALPACA_MODE_JSON = () => path.join(ctx.userData, 'alpaca-mode.json')

async function loadModule() {
  vi.resetModules()
  return import('./alpaca-mode')
}

beforeEach(() => {
  ctx.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'satex-am-'))
})

afterEach(() => {
  try { fs.rmSync(ctx.userData, { recursive: true, force: true }) } catch { /* noop */ }
  vi.restoreAllMocks()
})

describe('alpaca-mode — default-paper contract', () => {
  it('absent file reads as paper', async () => {
    const m = await loadModule()
    expect(m.getAlpacaMode()).toBe('paper')
    expect(m.resolveBaseUrl()).toBe(PAPER_BASE_URL)
  })

  it('malformed JSON on disk falls back to paper (disk-poison guard)', async () => {
    fs.writeFileSync(ALPACA_MODE_JSON(), '{ not valid json', 'utf8')
    const m = await loadModule()
    expect(m.getAlpacaMode()).toBe('paper')
  })

  it('a stored object missing mode coerces to paper', async () => {
    fs.writeFileSync(ALPACA_MODE_JSON(), JSON.stringify({ updatedAt: 42 }), 'utf8')
    const m = await loadModule()
    expect(m.getAlpacaMode()).toBe('paper')
  })

  it('an unrecognized mode string coerces to paper, not a passthrough', async () => {
    fs.writeFileSync(ALPACA_MODE_JSON(), JSON.stringify({ mode: 'staging', updatedAt: 1 }), 'utf8')
    const m = await loadModule()
    expect(m.getAlpacaMode()).toBe('paper')
  })
})

describe('alpaca-mode — stored live is honored', () => {
  it('reads a stored mode:live', async () => {
    fs.writeFileSync(ALPACA_MODE_JSON(), JSON.stringify({ mode: 'live', updatedAt: 5 }), 'utf8')
    const m = await loadModule()
    expect(m.getAlpacaMode()).toBe('live')
    expect(m.resolveBaseUrl()).toBe(LIVE_BASE_URL)
  })

  it('reads a stored mode:paper explicitly', async () => {
    fs.writeFileSync(ALPACA_MODE_JSON(), JSON.stringify({ mode: 'paper', updatedAt: 5 }), 'utf8')
    const m = await loadModule()
    expect(m.getAlpacaMode()).toBe('paper')
  })
})

describe('alpaca-mode — resolveBaseUrl override precedence', () => {
  it('no override follows persisted paper mode', async () => {
    const m = await loadModule()
    expect(m.resolveBaseUrl(undefined)).toBe(PAPER_BASE_URL)
  })

  it('no override follows persisted live mode', async () => {
    fs.writeFileSync(ALPACA_MODE_JSON(), JSON.stringify({ mode: 'live', updatedAt: 1 }), 'utf8')
    const m = await loadModule()
    expect(m.resolveBaseUrl(undefined)).toBe(LIVE_BASE_URL)
  })

  it('an override equal to the canonical PAPER url is NOT treated as an override — persisted live mode still wins (the 2026-05-13 bug class)', async () => {
    fs.writeFileSync(ALPACA_MODE_JSON(), JSON.stringify({ mode: 'live', updatedAt: 1 }), 'utf8')
    const m = await loadModule()
    expect(m.resolveBaseUrl(PAPER_BASE_URL)).toBe(LIVE_BASE_URL)
  })

  it('an override equal to the canonical LIVE url is NOT treated as an override — persisted paper mode still wins', async () => {
    const m = await loadModule()
    expect(m.resolveBaseUrl(LIVE_BASE_URL)).toBe(PAPER_BASE_URL)
  })

  it('an empty-string override is falsy and treated as no override', async () => {
    fs.writeFileSync(ALPACA_MODE_JSON(), JSON.stringify({ mode: 'live', updatedAt: 1 }), 'utf8')
    const m = await loadModule()
    expect(m.resolveBaseUrl('')).toBe(LIVE_BASE_URL)
  })

  it('a non-canonical override (e.g. a staging proxy) wins outright, regardless of persisted mode', async () => {
    fs.writeFileSync(ALPACA_MODE_JSON(), JSON.stringify({ mode: 'live', updatedAt: 1 }), 'utf8')
    const m = await loadModule()
    expect(m.resolveBaseUrl('https://staging-proxy.example.internal')).toBe('https://staging-proxy.example.internal')
  })
})

describe('alpaca-mode — setAlpacaMode persists and round-trips', () => {
  it('setAlpacaMode("live") flips the getter, persists JSON with a fresh updatedAt, and returns the live baseUrl', async () => {
    const before = Date.now()
    const m = await loadModule()
    const result = m.setAlpacaMode('live')
    expect(result).toEqual({ ok: true, baseUrl: LIVE_BASE_URL })
    expect(m.getAlpacaMode()).toBe('live')
    const onDisk = JSON.parse(fs.readFileSync(ALPACA_MODE_JSON(), 'utf8'))
    expect(onDisk.mode).toBe('live')
    expect(typeof onDisk.updatedAt).toBe('number')
    expect(onDisk.updatedAt).toBeGreaterThanOrEqual(before)
  })

  it('setAlpacaMode("paper") after a disk live round-trips paper', async () => {
    fs.writeFileSync(ALPACA_MODE_JSON(), JSON.stringify({ mode: 'live', updatedAt: 1 }), 'utf8')
    const m = await loadModule()
    expect(m.getAlpacaMode()).toBe('live')
    const result = m.setAlpacaMode('paper')
    expect(result).toEqual({ ok: true, baseUrl: PAPER_BASE_URL })
    expect(m.getAlpacaMode()).toBe('paper')
    expect(JSON.parse(fs.readFileSync(ALPACA_MODE_JSON(), 'utf8')).mode).toBe('paper')
  })
})

describe('alpaca-mode — write failure is swallowed, never thrown', () => {
  it('a save that cannot write to disk does not throw and keeps the in-memory mode', async () => {
    const m = await loadModule()
    // Point userData at a regular file so path.join(file, "alpaca-mode.json")
    // is an ENOTDIR write target — writeFileSync throws, source must swallow it.
    const asFile = path.join(os.tmpdir(), `satex-am-file-${Date.now()}`)
    fs.writeFileSync(asFile, 'x', 'utf8')
    ctx.userData = asFile
    expect(() => m.setAlpacaMode('live')).not.toThrow()
    expect(m.getAlpacaMode()).toBe('live')
    try { fs.rmSync(asFile, { force: true }) } catch { /* noop */ }
  })
})
