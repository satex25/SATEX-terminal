# Topstep $50K Phase D-2 — Payout Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add the Topstep funded-account payout-time rules (consistency, profit target, min trading days) + an evaluation-phase state machine, all as **soft trackers + display gauges** — never block orders, since the XFA Combine doesn't enforce these.

**Architecture:** New `DailyPnlLedger` service persists daily P&L sums (one entry per trading day). `FundedAccountService.snapshot()` extends with a `payoutMetrics` object computed from the ledger + current profile. `RiskGatesService` gains four new display gauges. Phase transitions (`combine → funded → activated`) advance manually via new IPC.

**Scope-out:** No order-blocking gates (these are advisory). No automated phase transitions (Topstep's eval pass is decided server-side; we just reflect what the user tells us).

---

## File Structure

**New:**
- `src/main/services/daily-pnl-ledger.ts` — persistent daily P&L sums keyed by trading-day in profile tz
- `src/main/services/daily-pnl-ledger.test.ts`
- `src/shared/funded/payout-metrics.ts` — pure functions: consistency / profit-target / min-trading-days computation
- `src/shared/funded/payout-metrics.test.ts`

**Modified:**
- `src/shared/funded/types.ts` — extend `FundedAccountSnapshot` with `payoutMetrics`
- `src/main/services/funded-account-store.ts` — persist the daily P&L ledger + phase
- `src/main/services/funded-account.ts` — own DailyPnlLedger; recordClosedTrade hook; advancePhase + resetPhase
- `src/main/services/funded-account.test.ts` — new tests for ledger + phase + payoutMetrics
- `src/main/services/risk-gates.ts` — 4 new display gauges
- `src/main/services/risk-gates.test.ts` — tests for the 4 new gauges
- `src/main/core/trading-engine.ts` — call `fundedAccount.recordClosedTrade(t)` on every ClosedTrade event
- `src/shared/ipc-channels.ts` + `src/shared/ipc-schemas.ts` — `FUNDED_ACCOUNT_ADVANCE_PHASE` + `FUNDED_ACCOUNT_RESET_PHASE`
- `src/main/index.ts` + `src/preload/index.ts` — IPC handler + preload surface

---

## Task F.1 — DailyPnlLedger

Persists one P&L entry per trading day (in profile tz). Used by consistency rule (largest day / total) and min-trading-days (count of days with non-zero P&L).

**Files:**
- Create: `src/main/services/daily-pnl-ledger.ts`
- Create: `src/main/services/daily-pnl-ledger.test.ts`

- [ ] **Step 1: Implementation**

```ts
/**
 * SATEX — Daily P&L Ledger.
 *
 * One entry per trading day (YYYY-MM-DD in profile tz) accumulating realized
 * P&L sums. Used by FundedAccountService for the Topstep payout rules
 * (consistency, profit target, min trading days).
 *
 * Tier-1 Phase D-2 Task F.1.
 */
import type { ClosedTrade } from '@shared/types'
import { tradingDayKey } from './equity-hwm'
import { createLogger } from './logger'

const log = createLogger('daily-pnl')

export interface DailyPnlEntry {
  date: string        // YYYY-MM-DD in profile tz
  realizedPnl: number // signed dollar sum of all trades closed this day
  tradeCount: number
  /** ts of the most recent recordClosedTrade for this day. */
  updatedAt: number
}

export interface DailyPnlLedgerDeps {
  getTimezone: () => string | null
  persist: (entries: DailyPnlEntry[]) => void
}

export class DailyPnlLedger {
  private entries: DailyPnlEntry[] = []

  constructor(private readonly deps: DailyPnlLedgerDeps) {}

  hydrate(entries: DailyPnlEntry[]): void {
    this.entries = [...entries].sort((a, b) => a.date.localeCompare(b.date))
    log.info('daily-pnl hydrated', { entries: this.entries.length })
  }

  /** Append the trade's realized PnL to the entry for the trade's closedAt
   *  trading-day in the active profile's tz. No-ops if no profile active. */
  recordClosedTrade(trade: ClosedTrade): void {
    const tz = this.deps.getTimezone()
    if (!tz) return
    const date = tradingDayKey(new Date(trade.closedAt), tz)
    const idx = this.entries.findIndex(e => e.date === date)
    if (idx >= 0) {
      this.entries[idx]!.realizedPnl += trade.pnl
      this.entries[idx]!.tradeCount += 1
      this.entries[idx]!.updatedAt = Date.now()
    } else {
      this.entries.push({ date, realizedPnl: trade.pnl, tradeCount: 1, updatedAt: Date.now() })
      this.entries.sort((a, b) => a.date.localeCompare(b.date))
    }
    this.deps.persist([...this.entries])
  }

  getEntries(): DailyPnlEntry[] { return [...this.entries] }

  reset(): void {
    this.entries = []
  }
}
```

- [ ] **Step 2: Tests**

```ts
import { describe, expect, it } from 'vitest'
import { DailyPnlLedger, type DailyPnlEntry } from './daily-pnl-ledger'
import type { ClosedTrade } from '@shared/types'

function trade(pnl: number, closedAt: number, id = 'x'): ClosedTrade {
  return {
    id, symbol: 'NVDA', side: 'long', quantity: 100,
    entryPrice: 100, exitPrice: 101, pnl, pnlPct: 0.01,
    holdMs: 60_000, closedAt,
    triggeredBy: null, source: 'backtest',
    tags: [], conviction: null, regimeAtEntry: null,
  }
}

function build(tz: string | null = 'America/New_York') {
  const persisted: DailyPnlEntry[][] = []
  const ledger = new DailyPnlLedger({
    getTimezone: () => tz,
    persist: (es) => persisted.push(es),
  })
  return { ledger, persisted }
}

describe('DailyPnlLedger', () => {
  it('records a closed trade into a per-day bucket', () => {
    const { ledger } = build()
    // 2026-05-29 19:00 UTC = 15:00 NY → day key 2026-05-29
    ledger.recordClosedTrade(trade(500, Date.parse('2026-05-29T19:00:00Z')))
    expect(ledger.getEntries()).toHaveLength(1)
    expect(ledger.getEntries()[0]!.date).toBe('2026-05-29')
    expect(ledger.getEntries()[0]!.realizedPnl).toBe(500)
    expect(ledger.getEntries()[0]!.tradeCount).toBe(1)
  })

  it('accumulates same-day trades', () => {
    const { ledger } = build()
    ledger.recordClosedTrade(trade(300, Date.parse('2026-05-29T15:00:00Z')))
    ledger.recordClosedTrade(trade(-100, Date.parse('2026-05-29T18:00:00Z')))
    ledger.recordClosedTrade(trade(200, Date.parse('2026-05-29T19:00:00Z')))
    expect(ledger.getEntries()).toHaveLength(1)
    expect(ledger.getEntries()[0]!.realizedPnl).toBe(400)
    expect(ledger.getEntries()[0]!.tradeCount).toBe(3)
  })

  it('separates different days', () => {
    const { ledger } = build()
    ledger.recordClosedTrade(trade(300, Date.parse('2026-05-29T19:00:00Z')))
    ledger.recordClosedTrade(trade(500, Date.parse('2026-05-30T19:00:00Z')))
    expect(ledger.getEntries()).toHaveLength(2)
  })

  it('no-ops without an active timezone', () => {
    const { ledger, persisted } = build(null)
    ledger.recordClosedTrade(trade(300, Date.now()))
    expect(ledger.getEntries()).toHaveLength(0)
    expect(persisted).toHaveLength(0)
  })

  it('persists every recordClosedTrade', () => {
    const { ledger, persisted } = build()
    ledger.recordClosedTrade(trade(100, Date.parse('2026-05-29T19:00:00Z')))
    ledger.recordClosedTrade(trade(200, Date.parse('2026-05-30T19:00:00Z')))
    expect(persisted).toHaveLength(2)
    expect(persisted[1]!).toHaveLength(2)
  })

  it('hydrate restores entries sorted by date', () => {
    const { ledger } = build()
    ledger.hydrate([
      { date: '2026-05-30', realizedPnl: 200, tradeCount: 1, updatedAt: 0 },
      { date: '2026-05-29', realizedPnl: 100, tradeCount: 1, updatedAt: 0 },
    ])
    expect(ledger.getEntries().map(e => e.date)).toEqual(['2026-05-29', '2026-05-30'])
  })

  it('reset clears state', () => {
    const { ledger } = build()
    ledger.recordClosedTrade(trade(100, Date.parse('2026-05-29T19:00:00Z')))
    ledger.reset()
    expect(ledger.getEntries()).toHaveLength(0)
  })
})
```

- [ ] **Step 3: Commit**

```bash
git add 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/services/daily-pnl-ledger.ts 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/services/daily-pnl-ledger.test.ts
git commit -m "feat(funded-d2): DailyPnlLedger — per-day P&L accumulation"
```

---

## Task F.2 — Payout-Rule Metrics (Pure)

Pure functions over the ledger that produce the four payout metrics: consistency, profit-target progress, min-trading-days satisfied, evaluation phase progress.

**Files:**
- Create: `src/shared/funded/payout-metrics.ts`
- Create: `src/shared/funded/payout-metrics.test.ts`
- Modify: `src/shared/funded/types.ts` — extend `FundedAccountSnapshot` with `payoutMetrics`

- [ ] **Step 1: Extend FundedAccountSnapshot**

In `src/shared/funded/types.ts`, add to `FundedAccountSnapshot`:

```ts
import type { DailyPnlEntry } from '@shared/funded/payout-metrics' // forward ref
// NOTE: keep the DailyPnlEntry type in payout-metrics so the shared module
// owns it. types.ts re-imports it solely for the snapshot shape.

export interface PayoutMetrics {
  /** Sum of all realized daily PnL on profitable days. */
  totalProfit: number
  /** Largest single profitable day. */
  largestProfitableDay: number
  /** largestProfitableDay / totalProfit (0 when no profit yet). */
  consistencyRatio: number
  /** True if the consistency rule is satisfied at payout time. Always true
   *  when consistencyMaxDayFraction is 0 (no enforcement, e.g. XFA Combine). */
  consistencyOk: boolean
  /** Progress toward profitTarget as a fraction in [0,1]. */
  profitTargetProgress: number
  /** True if totalProfit >= profitTarget. */
  profitTargetReached: boolean
  /** Count of distinct trading days with at least one closed trade. */
  tradingDaysCount: number
  /** True if tradingDaysCount >= minTradingDays. */
  minDaysSatisfied: boolean
  /** Evaluation phase ('combine' | 'funded' | 'activated'). */
  phase: string
  /** Daily P&L history for display + future analysis. */
  dailyHistory: DailyPnlEntry[]
}
```

Then add to `FundedAccountSnapshot`:

```ts
export interface FundedAccountSnapshot {
  // ... existing fields ...
  /** Tier-1 Phase D-2 — payout-time rule metrics (advisory, never block orders). */
  payoutMetrics: PayoutMetrics
}
```

- [ ] **Step 2: Pure metric module**

```ts
/**
 * SATEX — Funded-account payout metrics (pure).
 *
 * Computes consistency / profit-target / min-trading-days / phase from a
 * DailyPnlEntry[] + the active profile. All advisory — no order blocks.
 *
 * Tier-1 Phase D-2 Task F.2.
 */
import type { FundedAccountProfile } from './types'

export interface DailyPnlEntry {
  date: string
  realizedPnl: number
  tradeCount: number
  updatedAt: number
}

export interface PayoutMetrics {
  totalProfit: number
  largestProfitableDay: number
  consistencyRatio: number
  consistencyOk: boolean
  profitTargetProgress: number
  profitTargetReached: boolean
  tradingDaysCount: number
  minDaysSatisfied: boolean
  phase: string
  dailyHistory: DailyPnlEntry[]
}

export function computePayoutMetrics(
  entries: DailyPnlEntry[],
  profile: FundedAccountProfile,
): PayoutMetrics {
  let totalProfit = 0
  let largestDay = 0
  let tradingDays = 0
  for (const e of entries) {
    if (e.tradeCount > 0) tradingDays += 1
    if (e.realizedPnl > 0) {
      totalProfit += e.realizedPnl
      if (e.realizedPnl > largestDay) largestDay = e.realizedPnl
    }
  }
  const consistencyRatio = totalProfit > 0 ? largestDay / totalProfit : 0
  const consistencyOk = profile.consistencyMaxDayFraction === 0
    || consistencyRatio <= profile.consistencyMaxDayFraction
  const profitTargetProgress = profile.profitTarget > 0
    ? Math.min(1, Math.max(0, totalProfit) / profile.profitTarget)
    : 0
  return {
    totalProfit,
    largestProfitableDay: largestDay,
    consistencyRatio,
    consistencyOk,
    profitTargetProgress,
    profitTargetReached: totalProfit >= profile.profitTarget,
    tradingDaysCount: tradingDays,
    minDaysSatisfied: tradingDays >= profile.minTradingDays,
    phase: profile.phase,
    dailyHistory: [...entries],
  }
}

export const EMPTY_PAYOUT_METRICS: PayoutMetrics = {
  totalProfit: 0,
  largestProfitableDay: 0,
  consistencyRatio: 0,
  consistencyOk: true,
  profitTargetProgress: 0,
  profitTargetReached: false,
  tradingDaysCount: 0,
  minDaysSatisfied: true,
  phase: 'combine',
  dailyHistory: [],
}
```

- [ ] **Step 3: Tests**

```ts
import { describe, expect, it } from 'vitest'
import { computePayoutMetrics, EMPTY_PAYOUT_METRICS, type DailyPnlEntry } from './payout-metrics'
import { TOPSTEP_50K_XFA } from './topstep-50k-xfa'

function entry(date: string, pnl: number, tradeCount = 1): DailyPnlEntry {
  return { date, realizedPnl: pnl, tradeCount, updatedAt: 0 }
}

describe('computePayoutMetrics', () => {
  it('returns zeroed metrics for empty ledger', () => {
    const m = computePayoutMetrics([], TOPSTEP_50K_XFA)
    expect(m.totalProfit).toBe(0)
    expect(m.consistencyRatio).toBe(0)
    expect(m.profitTargetReached).toBe(false)
    expect(m.tradingDaysCount).toBe(0)
  })

  it('sums only profitable days into totalProfit', () => {
    const m = computePayoutMetrics([
      entry('2026-05-27', 500),
      entry('2026-05-28', -200),  // loss excluded
      entry('2026-05-29', 700),
    ], TOPSTEP_50K_XFA)
    expect(m.totalProfit).toBe(1200)
    expect(m.largestProfitableDay).toBe(700)
  })

  it('consistencyRatio = largestDay / totalProfit', () => {
    const m = computePayoutMetrics([
      entry('2026-05-27', 500),
      entry('2026-05-28', 1500),
    ], TOPSTEP_50K_XFA)
    expect(m.consistencyRatio).toBeCloseTo(1500 / 2000, 4)
  })

  it('consistencyOk always true when profile.consistencyMaxDayFraction == 0 (XFA Combine)', () => {
    const m = computePayoutMetrics([entry('2026-05-27', 5000)], TOPSTEP_50K_XFA)
    expect(m.consistencyOk).toBe(true)
  })

  it('profitTargetProgress in [0,1]; profitTargetReached at boundary', () => {
    const m = computePayoutMetrics([entry('2026-05-29', 3000)], TOPSTEP_50K_XFA)
    expect(m.profitTargetProgress).toBe(1)
    expect(m.profitTargetReached).toBe(true)
  })

  it('counts trading days as entries with tradeCount > 0', () => {
    const m = computePayoutMetrics([
      entry('2026-05-27', 100, 1),
      entry('2026-05-28', 0,   0), // not a trading day
      entry('2026-05-29', 200, 3),
    ], TOPSTEP_50K_XFA)
    expect(m.tradingDaysCount).toBe(2)
  })

  it('minDaysSatisfied always true for Topstep XFA (minTradingDays=0)', () => {
    const m = computePayoutMetrics([], TOPSTEP_50K_XFA)
    expect(m.minDaysSatisfied).toBe(true)
  })

  it('exports EMPTY_PAYOUT_METRICS constant', () => {
    expect(EMPTY_PAYOUT_METRICS.totalProfit).toBe(0)
  })
})
```

- [ ] **Step 4: Commit**

```bash
git add 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/shared/funded/payout-metrics.ts 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/shared/funded/payout-metrics.test.ts 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/shared/funded/types.ts
git commit -m "feat(funded-d2): payout metrics (consistency / profit-target / min-days)"
```

---

## Task F.3 — FundedAccountService Integration + RiskGates Display Gauges

Wires DailyPnlLedger + payoutMetrics into FundedAccountService.snapshot, and adds 4 new display gauges to RiskGatesService.

**Files:**
- Modify: `src/main/services/funded-account-store.ts` — persist daily P&L ledger + active phase
- Modify: `src/main/services/funded-account.ts` — own DailyPnlLedger, recordClosedTrade hook, advancePhase / resetPhase methods, snapshot returns payoutMetrics
- Modify: `src/main/services/funded-account.test.ts` — new tests
- Modify: `src/main/services/risk-gates.ts` — 4 new gauges: CONSISTENCY, PROFIT_TARGET, MIN_TRADING_DAYS, EVAL_PHASE
- Modify: `src/main/services/risk-gates.test.ts` — tests for the 4 gauges
- Modify: `src/main/core/trading-engine.ts` — wire on-trade-closed to `fundedAccount.recordClosedTrade`

The integration tasks have full code in the executing-plans session. Each commit closes one cohesive subsystem.

- [ ] **Commit:** `feat(funded-d2): wire DailyPnlLedger + payoutMetrics into FundedAccountService`

---

## Task F.4 — Evaluation Phase IPC

- New IPC channels: `FUNDED_ACCOUNT_ADVANCE_PHASE` + `FUNDED_ACCOUNT_RESET_PHASE`
- Zod schemas: `FundedAccountAdvancePhaseReq` (target: 'combine' | 'funded' | 'activated')
- Preload exposes `advanceFundedPhase` + `resetFundedPhase`

The plan is "live" — implemented during the executing-plans session below.

- [ ] **Commit:** `feat(funded-d2): evaluation phase IPC + preload surface`
