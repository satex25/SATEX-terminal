/**
 * Characterization coverage for the Self-eval toggle store (P-094).
 *
 * self-eval-store.ts persists ONE fact — whether the nightly self-eval study
 * runs — to `<userData>/self-eval.json`, defaulting to ENABLED (the study is
 * the learning loop's heartbeat; opting out is the explicit action). Self-eval
 * is strictly observational (CONSTITUTION §3.6 invariant 3): it feeds no gate,
 * size, multiplier, or autonomous decision, so this store is OFF the
 * trading-safety perimeter and a safe autonomous coverage target.
 *
 * What this suite locks in:
 *   1. DEFAULT-ENABLED — absent/corrupt/partial state reads as `true`, never
 *      silently `false` (a false default would mute the learning loop).
 *   2. EXPLICIT OPT-OUT — an on-disk `{enabled:false}` is honored and round-trips.
 *   3. WRITE-FAILURE IS SWALLOWED — a save that throws must not crash the
 *      caller; the in-memory toggle still reflects the set.
 *
 * Harness: `state` is an import-time module singleton (`let state = load()`),
 * so it cannot be dependency-injected. Each case runs `vi.resetModules()` then
 * `await import('./self-eval-store')` so `load()` re-executes against a freshly
 * seeded (or absent) file — mirroring the re-import discipline in
 * auto-update.test.ts. Only `electron` is mocked (for `app.getPath`); real `fs`
 * against a per-test temp dir exercises the actual JSON I/O. Module mocks are
 * file-scoped in vitest, so sibling suites are unaffected.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

// vi.mock factories are hoisted above imports; the mutable userData ref must
// live in a vi.hoisted block so the factory can close over it.
const ctx = vi.hoisted(() => ({ userData: '' }))
vi.mock('electron', () => ({ app: { getPath: (_k: string) => ctx.userData } }))

const SELF_EVAL_JSON = () => path.join(ctx.userData, 'self-eval.json')

async function loadModule() {
  vi.resetModules()
  return import('./self-eval-store')
}

beforeEach(() => {
  ctx.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'satex-se-'))
})

afterEach(() => {
  try { fs.rmSync(ctx.userData, { recursive: true, force: true }) } catch { /* noop */ }
  vi.restoreAllMocks()
})

describe('self-eval-store — default-enabled contract', () => {
  it('absent file reads as enabled (the heartbeat default)', async () => {
    const m = await loadModule()
    expect(m.getSelfEvalEnabled()).toBe(true)
  })

  it('malformed JSON on disk falls back to enabled (disk-poison guard)', async () => {
    fs.writeFileSync(SELF_EVAL_JSON(), '{ not valid json', 'utf8')
    const m = await loadModule()
    expect(m.getSelfEvalEnabled()).toBe(true)
  })

  it('a stored object missing the enabled key coerces to enabled', async () => {
    fs.writeFileSync(SELF_EVAL_JSON(), JSON.stringify({ updatedAt: 123 }), 'utf8')
    const m = await loadModule()
    expect(m.getSelfEvalEnabled()).toBe(true)
  })
})

describe('self-eval-store — explicit opt-out is honored', () => {
  it('reads a stored enabled:false', async () => {
    fs.writeFileSync(SELF_EVAL_JSON(), JSON.stringify({ enabled: false, updatedAt: 5 }), 'utf8')
    const m = await loadModule()
    expect(m.getSelfEvalEnabled()).toBe(false)
  })

  it('reads a stored enabled:true', async () => {
    fs.writeFileSync(SELF_EVAL_JSON(), JSON.stringify({ enabled: true, updatedAt: 5 }), 'utf8')
    const m = await loadModule()
    expect(m.getSelfEvalEnabled()).toBe(true)
  })
})

describe('self-eval-store — set persists and round-trips', () => {
  it('setSelfEvalEnabled(false) flips the getter and writes enabled:false with a fresh timestamp', async () => {
    const before = Date.now()
    const m = await loadModule()
    m.setSelfEvalEnabled(false)
    expect(m.getSelfEvalEnabled()).toBe(false)
    const onDisk = JSON.parse(fs.readFileSync(SELF_EVAL_JSON(), 'utf8'))
    expect(onDisk.enabled).toBe(false)
    expect(typeof onDisk.updatedAt).toBe('number')
    expect(onDisk.updatedAt).toBeGreaterThanOrEqual(before)
  })

  it('setSelfEvalEnabled(true) after a disk false round-trips true', async () => {
    fs.writeFileSync(SELF_EVAL_JSON(), JSON.stringify({ enabled: false, updatedAt: 1 }), 'utf8')
    const m = await loadModule()
    expect(m.getSelfEvalEnabled()).toBe(false)
    m.setSelfEvalEnabled(true)
    expect(m.getSelfEvalEnabled()).toBe(true)
    expect(JSON.parse(fs.readFileSync(SELF_EVAL_JSON(), 'utf8')).enabled).toBe(true)
  })
})

describe('self-eval-store — write failure is swallowed, never thrown', () => {
  it('a save that cannot write to disk does not throw and keeps the in-memory toggle', async () => {
    const m = await loadModule()
    // Point userData at a regular file so path.join(file, "self-eval.json")
    // is an ENOTDIR write target — writeFileSync throws, source must swallow it.
    const asFile = path.join(os.tmpdir(), `satex-se-file-${Date.now()}`)
    fs.writeFileSync(asFile, 'x', 'utf8')
    ctx.userData = asFile
    expect(() => m.setSelfEvalEnabled(false)).not.toThrow()
    expect(m.getSelfEvalEnabled()).toBe(false)
    try { fs.rmSync(asFile, { force: true }) } catch { /* noop */ }
  })
})
