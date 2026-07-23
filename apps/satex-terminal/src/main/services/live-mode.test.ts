/**
 * Characterization coverage for the live-mode arming interlock (P-094).
 *
 * live-mode.ts is the live-capital arming interlock named explicitly in
 * CONSTITUTION §2.4: `setLiveMode()` re-validates the structural interlocks
 * (kill switch disarmed, daily-loss threshold, notional-cap range) before it
 * flips `enabled:true`, so a direct caller cannot sidestep them. Adding tests
 * here is human-gated perimeter work — this suite ships behind an explicit
 * operator sign-off (blueprint: docs/superpowers/specs/
 * 2026-07-22-live-mode-tactics-coverage-ultraplan.md). It observes the existing
 * behavior only; it changes no threshold, cap, or predicate. The subject is
 * byte-unchanged.
 *
 * What this suite locks in:
 *   1. getLiveModeStatus ENDPOINT OVERRIDE — a paper endpoint forces
 *      `enabled:false` even when the armed flag is set (`state.enabled &&
 *      !paperOnly`), the safe direction; a live endpoint reports the raw flag.
 *   2. DISABLE IS ALWAYS ALLOWED — `!req.enabled` returns ok regardless of any
 *      interlock ctx (it is the safe direction; only ARMING is gated).
 *   3. ENABLE INTERLOCKS — kill-switch-armed, daily-loss-breached, and
 *      out-of-range notional-cap each refuse; the guards fire in source order
 *      (kill switch before daily loss); the daily-loss boundary is strict `<`
 *      (exactly-at-limit is NOT blocked); the notional cap is inclusive at the
 *      50,000 hard cap.
 *   4. ENABLE SUCCESS — a valid arm flips isLive(), sets getNotionalCap(), and
 *      round-trips JSON with a fresh numeric updatedAt.
 *   5. PERSISTENCE / DEGENERATE INPUTS — absent/corrupt/partial state reads as
 *      the disabled default (never a silent false-live); write failure is
 *      swallowed, never thrown.
 *   6. STATUS OBJECT SEMANTICS — getLiveModeStatus returns a fresh object per
 *      call (it crosses the IPC boundary; a shared mutable would be the
 *      P-061/P-074 aliased-default class), and isLive() (raw armed flag) and
 *      getLiveModeStatus (endpoint-adjusted) DIVERGE by design — a divergence
 *      four trading-engine gates depend on.
 *
 * Harness: mirrors alpaca-mode.test.ts / self-eval-store.test.ts exactly —
 * `state` is an import-time module singleton (`let state = load()`), not
 * dependency-injectable, so each case runs `vi.resetModules()` then
 * `await import('./live-mode')` so `load()` re-executes against a freshly
 * seeded (or absent) file. Only `electron` is mocked (for `app.getPath`);
 * real `fs` against a per-test temp dir exercises the actual JSON I/O.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

const ctx = vi.hoisted(() => ({ userData: '' }))
vi.mock('electron', () => ({ app: { getPath: (_k: string) => ctx.userData } }))

const PAPER_URL = 'https://paper-api.alpaca.markets'
const LIVE_URL = 'https://api.alpaca.markets'

/** A ctx that passes every enable interlock — 2% of $100k, flat P&L, kill disarmed. */
const okCtx = { killArmed: false, equity: 100_000, dailyPnl: 0, dailyLossLimitPct: 0.02 }

const LIVE_MODE_JSON = () => path.join(ctx.userData, 'live-mode.json')
function seed(obj: unknown) { fs.writeFileSync(LIVE_MODE_JSON(), JSON.stringify(obj), 'utf8') }
function readFile() { return JSON.parse(fs.readFileSync(LIVE_MODE_JSON(), 'utf8')) }

async function loadModule() {
  vi.resetModules()
  return import('./live-mode')
}

beforeEach(() => {
  ctx.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'satex-lm-'))
})

afterEach(() => {
  try { fs.rmSync(ctx.userData, { recursive: true, force: true }) } catch { /* noop */ }
  vi.restoreAllMocks()
})

describe('live-mode — getLiveModeStatus endpoint override', () => {
  it('a paper endpoint forces enabled:false even when the armed flag is set', async () => {
    seed({ enabled: true, notionalCap: 1000, updatedAt: 1 })
    const m = await loadModule()
    const s = m.getLiveModeStatus(PAPER_URL)
    expect(s.paperOnly).toBe(true)
    expect(s.enabled).toBe(false)     // state.enabled && !paperOnly → false
    expect(s.notionalCap).toBe(1000)
    expect(s.endpoint).toBe(PAPER_URL)
  })

  it('a live endpoint with the armed flag set reports enabled:true, paperOnly:false', async () => {
    seed({ enabled: true, notionalCap: 1000, updatedAt: 1 })
    const m = await loadModule()
    const s = m.getLiveModeStatus(LIVE_URL)
    expect(s.enabled).toBe(true)
    expect(s.paperOnly).toBe(false)
  })

  it('a live endpoint with the flag unset reports enabled:false, paperOnly:false', async () => {
    const m = await loadModule()   // absent file → default disabled
    const s = m.getLiveModeStatus(LIVE_URL)
    expect(s.enabled).toBe(false)
    expect(s.paperOnly).toBe(false)
  })

  it('notionalCap and endpoint pass through from state / argument', async () => {
    seed({ enabled: false, notionalCap: 1234, updatedAt: 1 })
    const m = await loadModule()
    const s = m.getLiveModeStatus('https://some.custom.endpoint')
    expect(s.notionalCap).toBe(1234)
    expect(s.endpoint).toBe('https://some.custom.endpoint')
    expect(s.paperOnly).toBe(false)
  })
})

describe('live-mode — disable is always allowed', () => {
  it('disabling succeeds even under a hostile ctx (kill armed + deep loss)', async () => {
    seed({ enabled: true, notionalCap: 500, updatedAt: 1 })
    const m = await loadModule()
    expect(m.isLive()).toBe(true)
    const res = m.setLiveMode(
      { enabled: false, notionalCap: 9999 },
      { killArmed: true, equity: 1000, dailyPnl: -99999, dailyLossLimitPct: 0.02 },
    )
    expect(res).toEqual({ ok: true })
    expect(m.isLive()).toBe(false)
    expect(readFile().enabled).toBe(false)
  })

  it('disabling refreshes updatedAt to a fresh timestamp', async () => {
    seed({ enabled: true, notionalCap: 500, updatedAt: 1 })
    const m = await loadModule()
    const before = Date.now()
    m.setLiveMode({ enabled: false, notionalCap: 500 }, okCtx)
    const onDisk = readFile()
    expect(typeof onDisk.updatedAt).toBe('number')
    expect(onDisk.updatedAt).toBeGreaterThanOrEqual(before)
  })
})

describe('live-mode — enable interlocks', () => {
  it('refuses when the kill switch is armed, and does not persist enabled', async () => {
    const m = await loadModule()
    const res = m.setLiveMode({ enabled: true, notionalCap: 1000 }, { ...okCtx, killArmed: true })
    expect(res.ok).toBe(false)
    expect(res.reason).toMatch(/Kill switch is armed/)
    expect(m.isLive()).toBe(false)
  })

  it('refuses when the daily loss limit is breached, naming both operands', async () => {
    const equity = 100_000, pct = 0.02, dailyPnl = -2500
    const threshold = -(equity * pct)   // same expression the subject uses
    const m = await loadModule()
    const res = m.setLiveMode(
      { enabled: true, notionalCap: 1000 },
      { killArmed: false, equity, dailyPnl, dailyLossLimitPct: pct },
    )
    expect(res.ok).toBe(false)
    expect(res.reason).toMatch(/Daily loss limit reached/)
    expect(res.reason).toContain(dailyPnl.toFixed(2))
    expect(res.reason).toContain(threshold.toFixed(2))
    expect(m.isLive()).toBe(false)
  })

  it('exactly AT the daily-loss threshold is NOT blocked (strict < boundary)', async () => {
    const equity = 100_000, pct = 0.02
    const threshold = -(equity * pct)   // bit-identical operands → threshold < threshold === false
    const m = await loadModule()
    const res = m.setLiveMode(
      { enabled: true, notionalCap: 1000 },
      { killArmed: false, equity, dailyPnl: threshold, dailyLossLimitPct: pct },
    )
    expect(res).toEqual({ ok: true })
    expect(m.isLive()).toBe(true)
  })

  it('refuses a notional cap of 0 or negative', async () => {
    const m = await loadModule()
    expect(m.setLiveMode({ enabled: true, notionalCap: 0 }, okCtx).ok).toBe(false)
    const neg = m.setLiveMode({ enabled: true, notionalCap: -5 }, okCtx)
    expect(neg.ok).toBe(false)
    expect(neg.reason).toMatch(/Notional cap/)
    expect(m.isLive()).toBe(false)
  })

  it('allows a notional cap exactly at the 50,000 hard cap (inclusive boundary)', async () => {
    const m = await loadModule()
    const res = m.setLiveMode({ enabled: true, notionalCap: 50_000 }, okCtx)
    expect(res).toEqual({ ok: true })
    expect(m.getNotionalCap()).toBe(50_000)
  })

  it('refuses a notional cap one dollar over the hard cap', async () => {
    const m = await loadModule()
    const res = m.setLiveMode({ enabled: true, notionalCap: 50_001 }, okCtx)
    expect(res.ok).toBe(false)
    expect(res.reason).toMatch(/Notional cap/)
    expect(m.isLive()).toBe(false)
  })
})

describe('live-mode — enable success', () => {
  it('a valid arm flips isLive(), sets the cap, and round-trips JSON with a fresh updatedAt', async () => {
    const m = await loadModule()
    const before = Date.now()
    const res = m.setLiveMode({ enabled: true, notionalCap: 2500 }, okCtx)
    expect(res).toEqual({ ok: true })
    expect(m.isLive()).toBe(true)
    expect(m.getNotionalCap()).toBe(2500)
    const onDisk = readFile()
    expect(onDisk.enabled).toBe(true)
    expect(onDisk.notionalCap).toBe(2500)
    expect(typeof onDisk.updatedAt).toBe('number')
    expect(onDisk.updatedAt).toBeGreaterThanOrEqual(before)
  })

  it('guards run in source order — kill switch reason wins over a simultaneous loss breach', async () => {
    const m = await loadModule()
    const res = m.setLiveMode(
      { enabled: true, notionalCap: 1000 },
      { killArmed: true, equity: 100_000, dailyPnl: -99999, dailyLossLimitPct: 0.02 },
    )
    expect(res.ok).toBe(false)
    expect(res.reason).toMatch(/Kill switch is armed/)   // not the daily-loss reason
  })
})

describe('live-mode — persistence + degenerate inputs', () => {
  it('an absent file reads as the disabled default (cap 500)', async () => {
    const m = await loadModule()
    expect(m.isLive()).toBe(false)
    expect(m.getNotionalCap()).toBe(500)
  })

  it('malformed JSON on disk falls back to the disabled default, no throw', async () => {
    fs.writeFileSync(LIVE_MODE_JSON(), '{ not valid json', 'utf8')
    const m = await loadModule()
    expect(m.isLive()).toBe(false)
    expect(m.getNotionalCap()).toBe(500)
  })

  it('a partial file coerces missing fields (enabled preserved, cap defaults to 500)', async () => {
    seed({ enabled: true })   // notionalCap / updatedAt absent
    const m = await loadModule()
    expect(m.isLive()).toBe(true)          // !!parsed.enabled
    expect(m.getNotionalCap()).toBe(500)   // parsed.notionalCap || 500
  })

  it('a write failure is swallowed and the in-memory arm still reflects the set', async () => {
    const m = await loadModule()
    // Point userData at a regular file so path.join(file, "live-mode.json")
    // is an ENOTDIR write target — writeFileSync throws, source must swallow it.
    const asFile = path.join(os.tmpdir(), `satex-lm-file-${Date.now()}`)
    fs.writeFileSync(asFile, 'x', 'utf8')
    ctx.userData = asFile
    expect(() => m.setLiveMode({ enabled: true, notionalCap: 1000 }, okCtx)).not.toThrow()
    expect(m.isLive()).toBe(true)
    try { fs.rmSync(asFile, { force: true }) } catch { /* noop */ }
  })
})

describe('live-mode — status object semantics', () => {
  it('getLiveModeStatus returns a fresh object each call (no shared mutable across the IPC boundary)', async () => {
    const m = await loadModule()
    const a = m.getLiveModeStatus(LIVE_URL)
    const b = m.getLiveModeStatus(LIVE_URL)
    expect(a).toEqual(b)
    expect(a).not.toBe(b)
  })

  it('isLive() (raw armed flag) and getLiveModeStatus (endpoint-adjusted) diverge by design', async () => {
    const m = await loadModule()
    expect(m.setLiveMode({ enabled: true, notionalCap: 1000 }, okCtx)).toEqual({ ok: true })
    // Armed flag is set regardless of endpoint...
    expect(m.isLive()).toBe(true)
    // ...but the effective status against a paper endpoint reads disabled...
    const paper = m.getLiveModeStatus(PAPER_URL)
    expect(paper.enabled).toBe(false)
    expect(paper.paperOnly).toBe(true)
    // ...while against a live endpoint it reads enabled.
    expect(m.getLiveModeStatus(LIVE_URL).enabled).toBe(true)
  })
})
