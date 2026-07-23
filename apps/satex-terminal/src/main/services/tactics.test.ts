/**
 * SATEX — MAY-TACTICS engine tests.
 *
 * Locks in the 2026-07-20 graduation rebuild (docs/superpowers/specs/
 * 2026-07-20-tactics-graduation-significance-ultraplan.md):
 *   - the retired `seedFromOrders` no longer fabricates/duplicates history;
 *   - graduation requires n≥30 ∧ expectancy>0 ∧ winRate≥0.45, all from metrics();
 *   - the versioned store resets pre-version poison once, preserving `graduated`;
 *   - the boot-time drawdown veto is reconstructed in the constructor;
 *   - raising the sample floor never disarms an already-graduated gate;
 *   - `graduationEligible` matches `graduate()`'s verdict, and the record that
 *     arms the gate also clears it (the headline invariant).
 *
 * Harness mirrors self-eval-store.test.ts: only `electron` is mocked (for
 * `app.getPath`); real `fs` against a per-test temp dir exercises the JSON I/O.
 * `TacticsEngine` reads the file in its field initializer, so each test seeds
 * the file then constructs a fresh engine.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

const ctx = vi.hoisted(() => ({ userData: '' }))
vi.mock('electron', () => ({ app: { getPath: (_k: string) => ctx.userData } }))

import { TacticsEngine } from './tactics'

const FILE = () => path.join(ctx.userData, 'tactics.json')
function seed(obj: unknown) { fs.writeFileSync(FILE(), JSON.stringify(obj), 'utf8') }
function readFile() { return JSON.parse(fs.readFileSync(FILE(), 'utf8')) }
function trade(pnl: number) { return { pnl, ts: Date.now(), symbol: 'TEST' } }
function repeat(n: number, pnl: number) { return Array.from({ length: n }, () => trade(pnl)) }
/** 30 trades: 20 wins of +10 then 10 losses of −1 → winRate 0.667, expectancy 6.3,
 *  maxDrawdown 0.05 (< 6% veto floor). Clears the bar with no drawdown veto. */
function eligibleHistory() { return [...repeat(20, 10), ...repeat(10, -1)] }

beforeEach(() => { ctx.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'satex-tac-')) })
afterEach(() => { try { fs.rmSync(ctx.userData, { recursive: true, force: true }) } catch { /* noop */ } })

describe('tactics — versioned store migration (T1.3 / finding 2a)', () => {
  it('a pre-version file resets history (drops seeded poison) but preserves graduated', () => {
    // Legacy shape: no `version`, history full of seeded pnl:0 rows + a real one.
    seed({ history: [...repeat(8, 0), trade(5)], graduated: true })
    const eng = new TacticsEngine()
    const s = eng.status()
    expect(s.tradesObserved).toBe(0)          // poison-contaminated history cleared
    expect(s.state).toBe('armed')             // graduation flag survived the reset
    expect(readFile().version).toBe(1)        // re-persisted at the current version
  })

  it('a current-version file keeps its history verbatim (no double-count, no reseed)', () => {
    seed({ version: 1, history: [trade(1), trade(-1), trade(2), trade(3), trade(-2)], graduated: false })
    expect(new TacticsEngine().status().tradesObserved).toBe(5)
  })
})

describe('tactics — graduation criterion (T2.3)', () => {
  it('30 trades clearing expectancy + win-rate graduates', () => {
    seed({ version: 1, history: eligibleHistory(), graduated: false })
    const eng = new TacticsEngine()
    expect(eng.status().graduationEligible).toBe(true)
    expect(eng.graduate()).toEqual({ ok: true })
    expect(eng.status().state).toBe('armed')
  })

  it('29 trades is refused on the trade-count clause', () => {
    seed({ version: 1, history: [...repeat(20, 10), ...repeat(9, -1)], graduated: false })
    const res = new TacticsEngine().graduate()
    expect(res.ok).toBe(false)
    expect(res.reason).toMatch(/30 closed trades/)
  })

  it('non-positive expectancy is refused on the expectancy clause', () => {
    // 20 wins of +0.1, 10 losses of −1 → winRate 0.667 but expectancy −0.27.
    seed({ version: 1, history: [...repeat(20, 0.1), ...repeat(10, -1)], graduated: false })
    const res = new TacticsEngine().graduate()
    expect(res.ok).toBe(false)
    expect(res.reason).toMatch(/[Ee]xpectancy/)
  })

  it('win-rate below floor is refused on the win-rate clause (expectancy still positive)', () => {
    // 13 wins of +10, 17 losses of −1 → winRate 0.433 (<0.45), expectancy +3.77.
    seed({ version: 1, history: [...repeat(13, 10), ...repeat(17, -1)], graduated: false })
    const res = new TacticsEngine().graduate()
    expect(res.ok).toBe(false)
    expect(res.reason).toMatch(/[Ww]in rate/)
  })

  it('graduationEligible tracks graduate(): false when below the bar', () => {
    seed({ version: 1, history: [...repeat(13, 10), ...repeat(17, -1)], graduated: false })
    expect(new TacticsEngine().status().graduationEligible).toBe(false)
  })
})

describe('tactics — graduate→gate invariant (T4.2, the headline)', () => {
  it('the record that arms the gate also clears its pre-trade check', () => {
    seed({ version: 1, history: eligibleHistory(), graduated: false })
    const eng = new TacticsEngine()
    expect(eng.graduate().ok).toBe(true)
    // A high-confidence entry passes the now-active gate (no self-inflicted veto).
    expect(eng.preTradeGate(0.9)).toEqual({ ok: true })
  })
})

describe('tactics — boot-time drawdown veto reconstruction (T4.3 / finding 2b)', () => {
  it('a drawn-down persisted history boots with the veto active, before any new close', () => {
    // +100 then −11 → peak 100, equity 89, drawdown 11% (> 6% floor).
    seed({ version: 1, history: [trade(100), trade(-11)], graduated: true })
    const s = new TacticsEngine().status()
    expect(s.vetoActive).toBe(true)
    expect(s.state).toBe('veto')
  })
})

describe('tactics — legacy graduate is not de-armed by the raised floor (T4.4 / finding 5)', () => {
  it('graduated=true with <30 trades stays armed and still gates entries', () => {
    seed({ version: 1, history: repeat(20, 5), graduated: true })   // 20 winning trades
    const eng = new TacticsEngine()
    expect(eng.status().state).toBe('armed')                 // not reverted to calibrating
    expect(eng.preTradeGate(0.1).ok).toBe(false)             // gate is live: weak signal vetoed
  })
})

describe('tactics — null-safety', () => {
  it('empty history is not eligible and graduate() refuses without throwing', () => {
    seed({ version: 1, history: [], graduated: false })
    const eng = new TacticsEngine()
    expect(eng.status().graduationEligible).toBe(false)
    expect(eng.graduate().ok).toBe(false)
  })

  it('an absent file constructs a fresh calibrating engine', () => {
    const s = new TacticsEngine().status()
    expect(s.state).toBe('calibrating')
    expect(s.tradesObserved).toBe(0)
    expect(s.tradesRequired).toBe(30)
  })
})

/**
 * Gap-fill on the P-121 suite (P-094 human-gated remainder). The 12 tests above
 * all SEED the file and construct fresh; none drives recordOutcome, the 500-cap
 * FIFO, live veto activation, veto stickiness, or post-graduation clause drift.
 * Blueprint: docs/superpowers/specs/2026-07-22-live-mode-tactics-coverage-ultraplan.md.
 */
describe('tactics — recordOutcome mutation + persistence', () => {
  it('appends a trade and persists it to disk', () => {
    seed({ version: 1, history: [], graduated: false })
    const eng = new TacticsEngine()
    eng.recordOutcome('AAPL', 12.5)
    expect(eng.status().tradesObserved).toBe(1)
    const onDisk = readFile()
    expect(onDisk.history).toHaveLength(1)
    expect(onDisk.history[0].pnl).toBe(12.5)
    expect(onDisk.history[0].symbol).toBe('AAPL')
  })

  it('trims the OLDEST row when history exceeds the 500 cap (FIFO)', () => {
    // 'OLDEST' at index 0, then 499 'TEST' rows = 500 at the ceiling.
    seed({ version: 1, history: [{ pnl: 1, ts: 1, symbol: 'OLDEST' }, ...repeat(499, 1)], graduated: false })
    const eng = new TacticsEngine()
    expect(eng.status().tradesObserved).toBe(500)
    eng.recordOutcome('NEW', 2)
    const onDisk = readFile()
    expect(onDisk.history).toHaveLength(500)          // push→501 then shift→500
    expect(onDisk.history[0].symbol).toBe('TEST')     // 'OLDEST' shifted off the front
    expect(onDisk.history[499].symbol).toBe('NEW')    // newest appended to the back
  })
})

describe('tactics — drawdown veto activation vs stickiness (finding F-1)', () => {
  it('recordOutcome activates the drawdown veto mid-session, not only at boot', () => {
    seed({ version: 1, history: [trade(100)], graduated: true })   // peak==equity, no drawdown
    const eng = new TacticsEngine()
    expect(eng.status().vetoActive).toBe(false)
    eng.recordOutcome('X', -10)                                    // equity 90, peak 100 → 10% drawdown
    const s = eng.status()
    expect(s.vetoActive).toBe(true)
    expect(s.state).toBe('veto')
  })

  it('is STICKY — a winning streak does NOT lift the veto within a session', () => {
    // maxDrawdown is a running max over the retained buffer (metrics(), tactics.ts:191),
    // so appended winners can never lower it — the veto-lift branch is unreachable this way
    // (finding F-1). Pin the true behavior so any future windowed-drawdown refactor turns red.
    seed({ version: 1, history: [trade(100), trade(-11)], graduated: true })   // 11% drawdown at boot
    const eng = new TacticsEngine()
    expect(eng.status().vetoActive).toBe(true)
    for (let i = 0; i < 50; i++) eng.recordOutcome('WIN', 100)
    const s = eng.status()
    expect(s.vetoActive).toBe(true)
    expect(s.state).toBe('veto')
  })
})

describe('tactics — post-graduation preTradeGate clause drift', () => {
  it('refuses on the win-rate clause when a graduated engine drifts below the floor', () => {
    // 20 losses then 13 wins, all ±1: winRate 13/33 ≈ 0.39 (<0.45), trades ≥30.
    // Ordered under water so cumulative equity never goes positive → peak stays 0 and
    // metrics()' denominator is 1000 (tactics.ts:191), keeping drawdown below the veto
    // floor so the win-rate clause — not the veto — is what fires.
    seed({ version: 1, history: [...repeat(20, -1), ...repeat(13, 1)], graduated: true })
    const eng = new TacticsEngine()
    expect(eng.status().vetoActive).toBe(false)
    const res = eng.preTradeGate(0.9)   // high confidence isolates the win-rate clause
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toMatch(/[Ww]in rate/)
  })

  it('refuses on the expectancy clause when win-rate holds but expectancy goes negative', () => {
    // 15 losses of -2 then 15 wins of +1: winRate 0.5 (passes the win-rate floor),
    // expectancy -0.5 (<0). Under water throughout → no veto short-circuit.
    seed({ version: 1, history: [...repeat(15, -2), ...repeat(15, 1)], graduated: true })
    const eng = new TacticsEngine()
    expect(eng.status().vetoActive).toBe(false)
    const res = eng.preTradeGate(0.9)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toMatch(/[Ee]xpectancy/)
  })
})
