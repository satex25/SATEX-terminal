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
