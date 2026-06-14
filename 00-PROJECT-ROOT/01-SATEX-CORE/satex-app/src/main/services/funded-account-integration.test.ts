/**
 * SATEX — L1.D multi-day funded-account integration test.
 *
 * Wires OrderManager + EquityHWMService + TOPSTEP_50K_XFA profile across
 * three simulated trading days. This is the only test that drives the full
 * gates-9-through-13 path end-to-end with real inter-service state — not
 * mocked pieces in isolation.
 *
 * Clock schedule (all UTC; New_York = UTC-4 during EDT on these dates):
 *   Day 1 — 2026-06-02 (Mon): normal trading, EOD flatten fires at 20:10Z (16:10 ET)
 *   Day 2 — 2026-06-03 (Tue): HWM updated, news blackout, max-contracts gate
 *   Day 3 — 2026-06-04 (Wed): MLL static-lock fires, equity breach, asset-class gate
 *
 * Wall-clock: < 50 ms (deterministic — every timestamp is injected, no real timers).
 * Tagged "nightly" in the plan for the optional long-soak variant
 * (SATEX_SIMULATOR_24_7=true + accelerated engine clock).
 */
import { describe, expect, it } from 'vitest'
import { OrderManager } from './order-manager'
import { EquityHWMService } from './equity-hwm'
import { TOPSTEP_50K_XFA } from '@shared/funded/topstep-50k-xfa'
import type { MacroEvent, OrderRequest } from '@shared/types'
import type { OrderValidationContext } from './order-manager'

// ── Deterministic clock ──────────────────────────────────────────────────────
// Day 1 — 2026-06-02 (Monday, EDT = UTC-4)
const D1_MORNING  = new Date('2026-06-02T13:30:00Z').getTime() // 09:30 ET — market open
const D1_FLAT_OFF = new Date('2026-06-02T20:09:00Z').getTime() // 16:09 ET — 1 min before flat-by
const D1_FLAT_ON  = new Date('2026-06-02T20:11:00Z').getTime() // 16:11 ET — 1 min past flat-by
const D1_EOD_REC  = new Date('2026-06-02T20:15:00Z')           // record-EOD time Day 1

// Day 2 — 2026-06-03 (Tuesday, EDT = UTC-4)
// NFP scheduled 09:30 ET = 13:30Z; ±60s window = [13:29Z, 13:31Z]
const D2_NFP_UTC  = '2026-06-03T13:30:00.000Z'
const D2_BEFORE   = new Date('2026-06-03T13:29:30Z').getTime() // 30s before NFP → inside window
const D2_AT       = new Date('2026-06-03T13:30:00Z').getTime() // exactly at NFP
const D2_AFTER_BL = new Date('2026-06-03T13:31:01Z').getTime() // 61s after → window cleared
const D2_EOD_REC  = new Date('2026-06-03T20:15:00Z')           // record-EOD time Day 2

// Day 3 — 2026-06-04 (Wednesday)
const D3_MORNING  = new Date('2026-06-04T13:30:00Z').getTime() // 09:30 ET

// ── Profile constant ─────────────────────────────────────────────────────────
const PROFILE = TOPSTEP_50K_XFA  // initial balance $50K, MDD $2K, lockAt $1K above initial

// ── NFP macro event ──────────────────────────────────────────────────────────
const NFP: MacroEvent = {
  id:     'nfp-2026-06-03',
  tsUtc:  D2_NFP_UTC,
  label:  'Non-Farm Payrolls',
  cons:   '185K',
  actual: '',
  impact: 'high',
}

// ── Fixture helpers ──────────────────────────────────────────────────────────
/** Create a fresh HWM service with the Topstep profile and a no-op persister. */
function makeHwm(): EquityHWMService {
  return new EquityHWMService({
    getProfile: () => PROFILE,
    persist:    () => {},
  })
}

/** Create an OrderManager seeded at the given equity. */
function makeOm(equity = 50_000): OrderManager {
  return new OrderManager(equity)
}

/** Build an OrderValidationContext with sensible defaults for funded-gate testing.
 *  liveMode=false skips Gates 0 (quote-freshness), 2 (market-closed), 7 (notional).
 *  Only the funded-gate-relevant fields need overrides per test. */
function ctx(overrides: {
  nowMs?:         number
  mll?:           number
  worstCaseLoss?: number
  existingQty?:   number
  macroEvents?:   MacroEvent[]
  assetClass?:    OrderValidationContext['assetClass']
} = {}): OrderValidationContext {
  return {
    refPrice:            100,
    liveMode:            false,
    notionalCap:         999_999,
    fundedProfile:       PROFILE,
    fundedMll:           overrides.mll           ?? 48_000, // fresh account MLL
    nowMs:               overrides.nowMs          ?? D1_MORNING,
    macroEvents:         overrides.macroEvents    ?? [],
    assetClass:          overrides.assetClass     ?? 'future',
    currentPositionQty:  overrides.existingQty    ?? 0,
    worstCaseLossDollar: overrides.worstCaseLoss  ?? 0,
  }
}

function buyEs(qty = 1): OrderRequest {
  return { symbol: 'ES', side: 'buy', type: 'market', quantity: qty }
}
function sellEs(qty = 1): OrderRequest {
  return { symbol: 'ES', side: 'sell', type: 'market', quantity: qty }
}

// =============================================================================
// DAY 1 — Normal trading, then EOD flatten gate fires
// =============================================================================
describe('Day 1 — normal trading hours (gate baseline)', () => {
  it('buy 3 ES (within cap of 5) passes all funded gates', () => {
    const om = makeOm()
    expect(om.validate(buyEs(3), ctx({ nowMs: D1_MORNING }))).toMatchObject({ ok: true })
  })

  it('equity well above MLL ($50K > $48K) — Gate 9 passes', () => {
    const om = makeOm(50_000)
    expect(om.validate(buyEs(1), ctx({ nowMs: D1_MORNING, mll: 48_000 }))).toMatchObject({ ok: true })
  })

  it('funded gates are skipped entirely when no profile is present', () => {
    const om = makeOm()
    const result = om.validate(buyEs(1), {
      refPrice: 100, liveMode: false, notionalCap: 999_999,
      nowMs: D1_FLAT_ON,
    })
    expect(result.ok).toBe(true)
  })
})

describe('Day 1 — EOD flatten gate (Gate 12, 16:10 ET)', () => {
  it('ENTRY is allowed 1 min before flat-by (16:09 ET)', () => {
    const om = makeOm()
    expect(om.validate(buyEs(1), ctx({ nowMs: D1_FLAT_OFF }))).toMatchObject({ ok: true })
  })

  it('ENTRY (existingQty=0) is blocked at 16:11 ET — Gate 12 funded-eod', () => {
    const om = makeOm()
    const r = om.validate(buyEs(1), ctx({ nowMs: D1_FLAT_ON, existingQty: 0 }))
    expect(r.ok).toBe(false)
    expect(r.gate).toBe('funded-eod')
    expect(r.reason).toMatch(/Post-EOD cutoff/)
  })

  it('ENTRY into same-side add (existingQty=2, buy again) blocked post flat-by', () => {
    const om = makeOm()
    const r = om.validate(buyEs(1), ctx({ nowMs: D1_FLAT_ON, existingQty: 2 }))
    expect(r.ok).toBe(false)
    expect(r.gate).toBe('funded-eod')
  })

  it('CLOSE (reducing long position) is allowed post flat-by', () => {
    const om = makeOm()
    const r = om.validate(sellEs(1), ctx({ nowMs: D1_FLAT_ON, existingQty: 2 }))
    expect(r.ok).toBe(true)
  })

  it('full close of short position (buy) is allowed post flat-by', () => {
    const om = makeOm()
    const r = om.validate(buyEs(3), ctx({ nowMs: D1_FLAT_ON, existingQty: -3 }))
    expect(r.ok).toBe(true)
  })
})

// =============================================================================
// DAY 1 TO DAY 2: HWM state carries over; MLL rises
// =============================================================================
describe('HWM carries over Day 1 to Day 2 and raises the MLL', () => {
  it('HWM starts at zero before first EOD record', () => {
    const hwm = makeHwm()
    expect(hwm.getHighestEodBalance()).toBe(0)
    expect(hwm.computeMll(PROFILE)).toBe(48_000)
  })

  it('after Day 1 EOD record at $50,500, MLL rises to $48,500', () => {
    const hwm = makeHwm()
    hwm.recordEod(50_500, D1_EOD_REC)
    expect(hwm.getHighestEodBalance()).toBe(50_500)
    expect(hwm.computeMll(PROFILE)).toBe(48_500)
  })

  it('raised MLL ($48,500) used in Gate 9 — equity $49,000 still passes', () => {
    const hwm = makeHwm()
    hwm.recordEod(50_500, D1_EOD_REC)
    const mll = hwm.computeMll(PROFILE)

    const om = makeOm(49_000)
    expect(om.validate(buyEs(1), ctx({ nowMs: D2_AT, mll }))).toMatchObject({ ok: true })
  })

  it('raised MLL ($48,500) used in Gate 9 — equity $48,400 is rejected', () => {
    const hwm = makeHwm()
    hwm.recordEod(50_500, D1_EOD_REC)
    const mll = hwm.computeMll(PROFILE)

    const om = makeOm(48_400)
    const r = om.validate(buyEs(1), ctx({ nowMs: D2_AT, mll }))
    expect(r.ok).toBe(false)
    expect(r.gate).toBe('funded-mll')
  })
})

// =============================================================================
// DAY 2 — News blackout gate (Gate 10)
// =============================================================================
describe('Day 2 — news blackout ±60 s window (Gate 10)', () => {
  it('blocks trade 30s BEFORE high-impact NFP (inside window)', () => {
    const om = makeOm()
    const r = om.validate(buyEs(1), ctx({ nowMs: D2_BEFORE, macroEvents: [NFP] }))
    expect(r.ok).toBe(false)
    expect(r.gate).toBe('funded-blackout')
    expect(r.reason).toMatch(/News blackout/)
    expect(r.reason).toMatch(/Non-Farm Payrolls/)
  })

  it('blocks trade AT the event (t=0)', () => {
    const om = makeOm()
    const r = om.validate(buyEs(1), ctx({ nowMs: D2_AT, macroEvents: [NFP] }))
    expect(r.ok).toBe(false)
    expect(r.gate).toBe('funded-blackout')
  })

  it('clears 61s after event — trade allowed', () => {
    const om = makeOm()
    const r = om.validate(buyEs(1), ctx({ nowMs: D2_AFTER_BL, macroEvents: [NFP] }))
    expect(r.ok).toBe(true)
  })

  it('med-impact event does NOT trigger blackout (profile only blocks high)', () => {
    const om = makeOm()
    const medEvent: MacroEvent = { ...NFP, id: 'med-1', impact: 'med' }
    const r = om.validate(buyEs(1), ctx({ nowMs: D2_AT, macroEvents: [medEvent] }))
    expect(r.ok).toBe(true)
  })

  it('empty macroEvents list never triggers blackout', () => {
    const om = makeOm()
    expect(om.validate(buyEs(1), ctx({ nowMs: D2_AT, macroEvents: [] }))).toMatchObject({ ok: true })
  })
})

// =============================================================================
// DAY 2 — Max-contracts gate (Gate 11)
// =============================================================================
describe('Day 2 — max-contracts gate (Gate 11)', () => {
  it('ES cap is 5 — buying 5 from flat passes', () => {
    const om = makeOm()
    expect(om.validate(buyEs(5), ctx({ nowMs: D2_AT }))).toMatchObject({ ok: true })
  })

  it('ES cap is 5 — buying 6 from flat is rejected', () => {
    const om = makeOm()
    const r = om.validate(buyEs(6), ctx({ nowMs: D2_AT }))
    expect(r.ok).toBe(false)
    expect(r.gate).toBe('funded-max-contracts')
  })

  it('adding 1 to an existing long 5 (max) is rejected — resulting abs 6', () => {
    const om = makeOm()
    const r = om.validate(buyEs(1), ctx({ nowMs: D2_AT, existingQty: 5 }))
    expect(r.ok).toBe(false)
    expect(r.gate).toBe('funded-max-contracts')
  })

  it('selling 1 from long 5 (partial close) passes — resulting abs 4', () => {
    const om = makeOm()
    expect(om.validate(sellEs(1), ctx({ nowMs: D2_AT, existingQty: 5 }))).toMatchObject({ ok: true })
  })

  it('AAPL (unknown symbol) falls through to defaultMaxContracts=1 — qty 2 rejected', () => {
    const om = makeOm()
    const r = om.validate(
      { symbol: 'AAPL', side: 'buy', type: 'market', quantity: 2 },
      ctx({ nowMs: D2_AT, assetClass: 'equity' }),
    )
    expect(r.ok).toBe(false)
    expect(r.gate).toBe('funded-max-contracts')
  })

  it('AAPL qty 1 at defaultMaxContracts=1 passes', () => {
    const om = makeOm()
    expect(om.validate(
      { symbol: 'AAPL', side: 'buy', type: 'market', quantity: 1 },
      ctx({ nowMs: D2_AT, assetClass: 'equity' }),
    )).toMatchObject({ ok: true })
  })
})

// =============================================================================
// DAY 2 TO DAY 3: trailing MLL LOCKS once HWM >= initialBalance + lockAt
// =============================================================================
describe('Day 2 to Day 3: MLL static-lock transition', () => {
  it('Day 2 EOD at $51,000 crosses the lock threshold ($51,000 = $50K + $1K)', () => {
    const hwm = makeHwm()
    hwm.recordEod(50_500, D1_EOD_REC)
    hwm.recordEod(51_000, D2_EOD_REC)

    expect(hwm.getHighestEodBalance()).toBe(51_000)
    expect(hwm.isLocked(PROFILE)).toBe(true)
    expect(hwm.computeMll(PROFILE)).toBe(50_000)
  })

  it('HWM below lock threshold ($50,800) — MLL is still trailing at $48,800', () => {
    const hwm = makeHwm()
    hwm.recordEod(50_800, D1_EOD_REC)
    expect(hwm.isLocked(PROFILE)).toBe(false)
    expect(hwm.computeMll(PROFILE)).toBe(48_800)
  })

  it('HWM at exactly lockAt ($51,000) triggers the lock', () => {
    const hwm = makeHwm()
    hwm.recordEod(51_000, D1_EOD_REC)
    expect(hwm.isLocked(PROFILE)).toBe(true)
    expect(hwm.computeMll(PROFILE)).toBe(50_000)
  })
})

// =============================================================================
// DAY 3 — Trailing MaxDD breach with locked MLL (Gate 9)
// =============================================================================
describe('Day 3 — trailing MaxDD / locked-MLL enforcement (Gate 9)', () => {
  it('equity below locked MLL ($49,500 < $50,000) — Gate 9 rejects', () => {
    const om = makeOm(49_500)
    const r = om.validate(buyEs(1), ctx({ nowMs: D3_MORNING, mll: 50_000 }))
    expect(r.ok).toBe(false)
    expect(r.gate).toBe('funded-mll')
    expect(r.reason).toMatch(/Trailing MaxDD breach/)
  })

  it('worstCaseLoss pushes projected equity below locked MLL — Gate 9 rejects', () => {
    const om = makeOm(50_300)
    const r = om.validate(buyEs(1), ctx({
      nowMs: D3_MORNING, mll: 50_000, worstCaseLoss: 400,
    }))
    expect(r.ok).toBe(false)
    expect(r.gate).toBe('funded-mll')
  })

  it('worstCaseLoss still above MLL — passes Gate 9', () => {
    const om = makeOm(50_300)
    expect(om.validate(buyEs(1), ctx({
      nowMs: D3_MORNING, mll: 50_000, worstCaseLoss: 200,
    }))).toMatchObject({ ok: true })
  })

  it('no fundedMll supplied — Gate 9 is skipped entirely', () => {
    const om = makeOm(1)
    const c: OrderValidationContext = {
      ...ctx({ nowMs: D3_MORNING }),
      fundedMll: undefined,
    }
    const r = om.validate(buyEs(1), c)
    expect(r.gate).not.toBe('funded-mll')
  })
})

// =============================================================================
// DAY 3 — Asset-class gate (Gate 13)
// =============================================================================
describe('Day 3 — asset-class gate (Gate 13)', () => {
  it("'index' is not in Topstep XFA allowed list — Gate 13 rejects", () => {
    const om = makeOm()
    const r = om.validate(buyEs(1), ctx({ nowMs: D3_MORNING, assetClass: 'index' }))
    expect(r.ok).toBe(false)
    expect(r.gate).toBe('funded-asset-class')
    expect(r.reason).toMatch(/Asset class 'index' not allowed/)
  })

  it("Alpaca overlay: 'equity', 'future', 'crypto' all pass Gate 13", () => {
    const om = makeOm()
    for (const cls of ['equity', 'future', 'crypto'] as const) {
      const r = om.validate(
        { symbol: 'AAPL', side: 'buy', type: 'market', quantity: 1 },
        ctx({ nowMs: D3_MORNING, assetClass: cls }),
      )
      expect(r.ok, `expected Gate 13 pass for assetClass '${cls}'`).toBe(true)
    }
  })
})

// =============================================================================
// CROSS-DAY PIPELINE: EquityHWMService -> computeMll -> OrderManager gate 9
// Verifies the full multi-service chain end-to-end across 3 trading days.
// =============================================================================
describe('Full pipeline: EquityHWMService -> MLL -> OrderManager gate 9', () => {
  it('3-day scenario — equity drop on Day 3 caught once MLL is locked', () => {
    const hwm = makeHwm()

    // Day 1 EOD: profitable, HWM updates
    hwm.recordEod(50_500, D1_EOD_REC)
    expect(hwm.computeMll(PROFILE)).toBe(48_500)

    // Day 2 EOD: crosses lock threshold
    hwm.recordEod(51_000, D2_EOD_REC)
    expect(hwm.isLocked(PROFILE)).toBe(true)
    const lockedMll = hwm.computeMll(PROFILE)
    expect(lockedMll).toBe(50_000)

    // Day 3: equity dropped to $49,800
    const om = makeOm(49_800)
    const blocked = om.validate(buyEs(1), ctx({ nowMs: D3_MORNING, mll: lockedMll }))
    expect(blocked.ok).toBe(false)
    expect(blocked.gate).toBe('funded-mll')

    // Same equity passes WITHOUT funded overlay
    const allowed = om.validate(buyEs(1), {
      refPrice: 100, liveMode: false, notionalCap: 999_999,
    })
    expect(allowed.gate).not.toBe('funded-mll')
  })
})
