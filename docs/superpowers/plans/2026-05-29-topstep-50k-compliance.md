# Topstep $50K Tier-1 Compliance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the funded-account rule overlay so SATEX enforces Topstep $50K Express Funded Account (XFA) rules end-to-end — trailing MaxDD, daily-loss, max contracts, news blackout, end-of-day flat — usable as a safety overlay on Alpaca paper today and ready to drop into a Rithmic/Tradovate broker port later.

**Architecture:** A `FundedAccountProfile` abstraction with the Topstep $50K XFA preset as the v1 instance. Five new services (`EquityHWMService`, `BlackoutWindow`, `EodFlattenService`, `FundedAccountService`, plus extensions to `MacroCalendarService`). Five new pre-trade gates (9–13) bolted into `OrderManager.validate`. Five new display gauges added to `RiskGatesService` so the existing renderer panels light up without any UI changes for v1. Persistence to `userData/funded-account.json` for active profile + equity HWM ledger.

**Tech Stack:** TypeScript strict · Vitest · Node 20.19 · electron-vite · Zod (existing IPC schemas) · better-sqlite3 (existing for daily-PnL ledger) · `Intl.DateTimeFormat` for IANA-aware EOD scheduling. No new runtime dependencies.

**Scope-out (explicit, do not pull in):**
- No Rithmic / Tradovate broker layer (separate later phase — strategy concepts port; broker layer is fresh build)
- No real Topstep account connection — this is a *simulation* overlay on the existing Alpaca paper path
- No multi-account / multi-profile concurrency (single active profile in v1)
- No consistency-rule tracker (Topstep XFA Combine doesn't enforce; only matters at funded-payout time — deferred Phase D-2)
- No min-trading-days / profit-target *state machine* (Topstep XFA has no minimum; deferred to D-2 when other profiles need it)

**Important context the engineer needs to internalize:** Topstep is futures (ES, NQ, RTY, YM, CL, GC and their micros). SATEX's existing broker integration is Alpaca (US equities + crypto). For v1 this plan implements the rule *abstraction* so the gates enforce correctly when (a) you treat Alpaca paper as a "Topstep simulation" for discipline practice, (b) the broker port eventually lands. `maxContracts` config is keyed by symbol and interpreted per-product — for equity symbols this is effectively max shares; for futures it's contracts. The same gate logic applies either way.

---

## File Structure

**New files:**

| Path | Responsibility |
|---|---|
| `src/shared/funded/types.ts` | `FundedAccountProfile`, `FundedAccountSnapshot`, `EvaluationPhase`, `EquityHwmLedgerEntry` |
| `src/shared/funded/topstep-50k-xfa.ts` | `TOPSTEP_50K_XFA` profile constant + invariant tests |
| `src/shared/funded/index.ts` | Barrel: exports + `getProfile(id)` lookup |
| `src/main/services/equity-hwm.ts` | `EquityHWMService` — tracks daily-high equity + EOD ledger + computes the Topstep trailing-MaxDD MLL |
| `src/main/services/equity-hwm.test.ts` | Unit tests for HWM tracking, EOD rollover, MLL lock semantics |
| `src/main/services/blackout-window.ts` | Pure `isInBlackout(now, events, impacts, windowMs)` function |
| `src/main/services/blackout-window.test.ts` | Tests for blackout edge cases (entry-into / exit-from window, impact filtering) |
| `src/main/services/eod-flatten.ts` | `EodFlattenService` — IANA-tz aware scheduler that fires a callback at the configured cutoff |
| `src/main/services/eod-flatten.test.ts` | Tests for tz handling, fire-once-per-day semantics, manual `triggerNow` for tests |
| `src/main/services/funded-account.ts` | `FundedAccountService` — orchestrator owning the active profile + dependencies |
| `src/main/services/funded-account.test.ts` | Tests for activation, deactivation, profile swap, snapshot output |
| `src/main/services/funded-account-store.ts` | Persistence layer for `userData/funded-account.json` (active profile id + HWM ledger) |
| `src/main/services/funded-account-store.test.ts` | Tests for round-trip persistence + sanitization |
| `src/main/services/macro-calendar.test.ts` | NEW — exercises the existing service plus the new `isInBlackout` method |

**Files modified:**

| Path | Change |
|---|---|
| `src/shared/types.ts` | Add `FundedAccountSnapshot` re-export + new `RiskGate` keys |
| `src/main/services/macro-calendar.ts` | Add `isInBlackout(now, impacts, windowMs)` method |
| `src/main/services/order-manager.ts` | Gates 9 (trailing-MaxDD) · 10 (news-blackout) · 11 (max-contracts) · 12 (eod-flat) · 13 (allowed-asset-class) |
| `src/main/services/order-manager.test.ts` | New test blocks for each gate |
| `src/main/services/risk-gates.ts` | New display gates: TRAILING_MAXDD · MLL_BUFFER · NEWS_BLACKOUT · MAX_CONTRACTS · EOD_COUNTDOWN |
| `src/main/services/risk-gates.test.ts` | Tests for the new display gates |
| `src/main/core/trading-engine.ts` | Instantiate `EquityHWMService` + `EodFlattenService` + `FundedAccountService` at boot; wire EOD-flatten callback to `cancelAllOrders` + `flattenAllPositions`; provide `OrderValidationContext` extension fields to OM |
| `src/main/services/order-manager.ts` | Add `cancelAllOrders()` + `flattenAllPositions(getQuote)` public methods (used by EOD service) |
| `src/shared/ipc-channels.ts` | New channels: `FUNDED_ACCOUNT_GET` · `FUNDED_ACCOUNT_SET_PROFILE` · `FUNDED_ACCOUNT_CLEAR` |
| `src/shared/ipc-schemas.ts` | Zod schemas for the new IPC payloads |
| `src/preload/index.ts` | Expose `getFundedAccount` · `setFundedAccountProfile` · `clearFundedAccount` |

**Files NOT touched:** `brain.ts` (strategy logic unchanged), `autonomous-trader.ts` (already side-aware after Phase B), the entire `renderer/` tree (existing `RiskGatePanel` consumes whatever gates the snapshot contains — no UI code changes for v1).

---

## Topstep $50K XFA Rule Reference

The rules this plan implements (with citations to the Topstep docs as of the 2026 ruleset):

| Rule | Numeric value | Code location |
|---|---|---|
| Initial account balance | $50,000 | `TOPSTEP_50K_XFA.initialBalance` |
| Daily Loss Limit (DLL) | $1,000 from previous EOD | Existing Gate 3 (already in OM) + new MLL_BUFFER display |
| Maximum Loss Limit (MLL, trailing) | $2,000 below highest EOD balance | `EquityHWMService.computeMLL` + new Gate 9 |
| MLL lock threshold | Highest EOD ≥ $51,000 ($50k + DLL) → MLL becomes static at $50k | `EquityHWMService.computeMLL` branch |
| Max contracts per product | ES: 5 · MES: 50 · NQ: 3 · MNQ: 30 · RTY: 5 · M2K: 50 · YM: 5 · MYM: 50 · CL: 2 · MCL: 20 · GC: 2 · MGC: 20 | `TOPSTEP_50K_XFA.maxContracts` + new Gate 11 |
| EOD flat | 4:10 PM ET on every trading day | `EodFlattenService` (16:10 America/New_York) + new Gate 12 |
| News blackout | ±60 s of high-impact macro events | `MacroCalendarService.isInBlackout` + new Gate 10 |
| Profit target | $3,000 (informational, no hard gate) | `TOPSTEP_50K_XFA.profitTarget` (read-only field; no enforcement) |
| Consistency rule | Not enforced during XFA Combine | `consistencyMaxDayFraction: 0` (informational) |
| Min trading days | 0 for XFA | `minTradingDays: 0` |
| Allowed products | Futures only IRL; profile permissive for the Alpaca overlay | `allowedAssetClasses: ['equity', 'future', 'crypto']` |

---

## Task D.1 — Funded Account Types + Topstep $50K XFA Preset

**Files:**
- Create: `src/shared/funded/types.ts`
- Create: `src/shared/funded/topstep-50k-xfa.ts`
- Create: `src/shared/funded/topstep-50k-xfa.test.ts`
- Create: `src/shared/funded/index.ts`

- [ ] **Step 1: Write the types file**

`src/shared/funded/types.ts`:

```ts
/**
 * SATEX — Funded Account types.
 * Pluggable rule profile for prop-firm-funded accounts (Topstep, Apex, FTMO,
 * etc.). v1 ships the Topstep $50K XFA preset; later profiles are added by
 * dropping new constants into shared/funded/ and registering in index.ts.
 *
 * Tier-1 from docs/audits/2026-05-28-evidence-audit.md.
 */
import type { AssetClass } from '@shared/types'

/** Evaluation lifecycle stages a funded account can be in. Topstep XFA has
 *  three: Combine (paying for the eval), Funded (post-pass), Activated
 *  (post-first-payout, sometimes with relaxed rules). v1 doesn't drive any
 *  behavior off this field — it's read-only metadata for display. */
export type EvaluationPhase = 'combine' | 'funded' | 'activated'

/** EOD cutoff specified in an IANA timezone — the EodFlattenService converts
 *  to UTC once per day. The (hour, minute) pair is local clock time. */
export interface FlatByConfig {
  hour: number
  minute: number
  /** IANA tz name, e.g. 'America/New_York'. Topstep's cutoff is in ET. */
  tz: string
}

export interface FundedAccountProfile {
  /** kebab-case unique id. Persisted; used as the lookup key. */
  id: string
  /** Display name for the UI ('Topstep $50K Express Funded'). */
  name: string
  /** Source firm — 'topstep' | 'apex' | 'ftmo' | etc. Display-only. */
  firm: string
  /** Current evaluation phase. Read-only; v1 doesn't transition. */
  phase: EvaluationPhase

  // ── Capital ─────────────────────────────────────────────────────────────
  /** Starting account balance in USD. */
  initialBalance: number

  // ── Loss limits ─────────────────────────────────────────────────────────
  /** Daily Loss Limit in dollars (positive number — the cap, not a delta). */
  dailyLossLimit: number
  /** Trailing Maximum Loss Limit (MLL) in dollars below the highest EOD
   *  balance. e.g. Topstep $50K = 2000. */
  trailingMaxDrawdown: number
  /** Profit level (above initialBalance, in dollars) at which the MLL
   *  converts from trailing to STATIC at initialBalance. e.g. Topstep
   *  locks once highestEod >= initialBalance + 1000. Set to Infinity to
   *  disable the lock (pure trailing forever). */
  trailingMaxDrawdownLockAt: number

  // ── Position size ───────────────────────────────────────────────────────
  /** Per-symbol max contract / share count. Symbols not in the map fall
   *  through to defaultMaxContracts. */
  maxContracts: Record<string, number>
  /** Cap for any symbol not explicitly listed in maxContracts. */
  defaultMaxContracts: number

  // ── Session boundaries ──────────────────────────────────────────────────
  /** End-of-day flatten time. Positions are force-closed and pending orders
   *  cancelled at this clock time in the given tz, every weekday. */
  flatBy: FlatByConfig

  // ── News ────────────────────────────────────────────────────────────────
  /** Impact levels that trigger the blackout. Empty array = no blackout. */
  newsBlackoutImpacts: ('high' | 'med' | 'low')[]
  /** Half-window in ms — orders refused if any event of matched impact is
   *  within ±this much of now. */
  newsBlackoutWindowMs: number

  // ── Eval bookkeeping (informational in v1) ──────────────────────────────
  profitTarget: number
  minTradingDays: number
  /** Consistency Rule — fraction of total profit allowed in the single
   *  largest profitable day. 0 = no rule (Topstep XFA Combine). 0.5 =
   *  largest day must be ≤ 50% of total profit (Topstep Funded payout). */
  consistencyMaxDayFraction: number

  // ── Allowed instruments ─────────────────────────────────────────────────
  /** Asset classes a Topstep-real account would actually trade
   *  (futures only IRL). The Alpaca overlay sets this permissive so paper
   *  practice on equity symbols doesn't trip Gate 13. */
  allowedAssetClasses: AssetClass[]
}

/** Single entry in the EOD equity ledger — recorded by EquityHWMService each
 *  trading day at the configured flat-by time (or immediately on first boot
 *  for the activation balance). */
export interface EquityHwmLedgerEntry {
  /** Trading-day key — 'YYYY-MM-DD' in the profile's tz. */
  date: string
  /** Account equity at end-of-day in dollars. */
  equity: number
  /** ts at which this entry was recorded. */
  recordedAt: number
}

/** Snapshot the renderer reads. Includes everything needed to display the
 *  rule panel + the current MLL buffer for the rail. */
export interface FundedAccountSnapshot {
  active: boolean
  profile: FundedAccountProfile | null
  /** Highest end-of-day balance observed across all entries. */
  highestEodBalance: number
  /** Current MLL value in dollars. */
  currentMll: number
  /** Has the MLL locked to static (i.e. highestEod crossed lock threshold)? */
  mllLocked: boolean
  /** Distance from current equity to current MLL — positive = OK, negative = busted. */
  mllBuffer: number
  /** Today's date key (YYYY-MM-DD in profile.tz). */
  today: string
  /** ms until the next EOD flatten fires (clamps to 0 if past). */
  msToFlatBy: number
  /** Ledger of every recorded EOD balance, oldest first. */
  ledger: EquityHwmLedgerEntry[]
  computedAt: number
}
```

- [ ] **Step 2: Write the Topstep $50K XFA preset**

`src/shared/funded/topstep-50k-xfa.ts`:

```ts
/**
 * SATEX — Topstep $50K Express Funded Account (XFA) preset.
 *
 * Numbers cross-referenced against Topstep's published ruleset as of
 * 2026-05. Update if Topstep changes the contract.
 *
 * Notes on the Alpaca overlay (since SATEX trades Alpaca today, not
 * Rithmic/Tradovate):
 *   - allowedAssetClasses is permissive (equity + future + crypto) so paper
 *     practice on AAPL / SPY / BTC / etc. doesn't trip Gate 13.
 *   - maxContracts maps Topstep's actual futures symbols. For non-listed
 *     equity symbols the fallback (defaultMaxContracts) applies. v2 will
 *     introduce notional-aware sizing for equities; v1 treats "contracts"
 *     and "shares" as the same axis.
 */
import type { FundedAccountProfile } from './types'

export const TOPSTEP_50K_XFA: FundedAccountProfile = {
  id: 'topstep-50k-xfa',
  name: 'Topstep $50K Express Funded Account',
  firm: 'topstep',
  phase: 'combine',

  initialBalance: 50_000,

  dailyLossLimit: 1_000,
  trailingMaxDrawdown: 2_000,
  trailingMaxDrawdownLockAt: 1_000, // locks once highestEod ≥ $51,000

  maxContracts: {
    // E-mini index futures
    ES:  5,  MES:  50,
    NQ:  3,  MNQ:  30,
    RTY: 5,  M2K:  50,
    YM:  5,  MYM:  50,
    // Energy
    CL:  2,  MCL:  20,
    QM:  2,
    // Metals
    GC:  2,  MGC:  20,
    SI:  2,  SIL:  20,
    // Bonds / rates
    ZB:  3,  ZN:  3, ZF: 3, ZT: 3,
    // FX
    '6E': 5, '6J': 5, '6B': 5, '6A': 5,
  },
  defaultMaxContracts: 1,

  flatBy: { hour: 16, minute: 10, tz: 'America/New_York' }, // 4:10 PM ET

  newsBlackoutImpacts: ['high'],
  newsBlackoutWindowMs: 60_000, // ±60s — Topstep is more permissive than FTMO

  profitTarget: 3_000,
  minTradingDays: 0,           // XFA has no minimum
  consistencyMaxDayFraction: 0, // not enforced in XFA Combine

  allowedAssetClasses: ['equity', 'future', 'crypto'],
}
```

- [ ] **Step 3: Write the barrel + getProfile lookup**

`src/shared/funded/index.ts`:

```ts
/**
 * SATEX — Funded account registry.
 * v1 exposes the Topstep $50K XFA preset. New profiles register here.
 */
import { TOPSTEP_50K_XFA } from './topstep-50k-xfa'
import type { FundedAccountProfile } from './types'

export * from './types'
export { TOPSTEP_50K_XFA }

const REGISTRY: Record<string, FundedAccountProfile> = {
  [TOPSTEP_50K_XFA.id]: TOPSTEP_50K_XFA,
}

/** Look up a profile by id. Returns null if unknown — caller decides whether
 *  to default to "no profile active" or to error. */
export function getProfile(id: string): FundedAccountProfile | null {
  return REGISTRY[id] ?? null
}

/** All known profile ids (for the renderer's profile picker). */
export function listProfileIds(): string[] {
  return Object.keys(REGISTRY)
}
```

- [ ] **Step 4: Write invariant tests for the Topstep preset**

`src/shared/funded/topstep-50k-xfa.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { TOPSTEP_50K_XFA } from './topstep-50k-xfa'
import { getProfile, listProfileIds } from './index'

describe('Topstep $50K XFA preset', () => {
  it('locks the MLL once you cross initialBalance + dailyLossLimit', () => {
    expect(TOPSTEP_50K_XFA.trailingMaxDrawdownLockAt).toBe(1_000)
    expect(TOPSTEP_50K_XFA.initialBalance + TOPSTEP_50K_XFA.trailingMaxDrawdownLockAt).toBe(51_000)
  })

  it('caps daily loss at $1k and trailing drawdown at $2k', () => {
    expect(TOPSTEP_50K_XFA.dailyLossLimit).toBe(1_000)
    expect(TOPSTEP_50K_XFA.trailingMaxDrawdown).toBe(2_000)
  })

  it('flats at 4:10 PM ET', () => {
    expect(TOPSTEP_50K_XFA.flatBy.hour).toBe(16)
    expect(TOPSTEP_50K_XFA.flatBy.minute).toBe(10)
    expect(TOPSTEP_50K_XFA.flatBy.tz).toBe('America/New_York')
  })

  it('enforces only high-impact news blackouts in a ±60s window', () => {
    expect(TOPSTEP_50K_XFA.newsBlackoutImpacts).toEqual(['high'])
    expect(TOPSTEP_50K_XFA.newsBlackoutWindowMs).toBe(60_000)
  })

  it('caps ES at 5 contracts and MES at 50', () => {
    expect(TOPSTEP_50K_XFA.maxContracts.ES).toBe(5)
    expect(TOPSTEP_50K_XFA.maxContracts.MES).toBe(50)
  })

  it('falls through to defaultMaxContracts (1) for unknown symbols', () => {
    expect(TOPSTEP_50K_XFA.maxContracts.AAPL).toBeUndefined()
    expect(TOPSTEP_50K_XFA.defaultMaxContracts).toBe(1)
  })

  it('does not enforce consistency or min-days in the XFA Combine', () => {
    expect(TOPSTEP_50K_XFA.consistencyMaxDayFraction).toBe(0)
    expect(TOPSTEP_50K_XFA.minTradingDays).toBe(0)
  })

  it('exposes a $3,000 profit target', () => {
    expect(TOPSTEP_50K_XFA.profitTarget).toBe(3_000)
  })
})

describe('Profile registry', () => {
  it('lists topstep-50k-xfa', () => {
    expect(listProfileIds()).toContain('topstep-50k-xfa')
  })

  it('looks up by id', () => {
    expect(getProfile('topstep-50k-xfa')?.firm).toBe('topstep')
  })

  it('returns null for unknown ids', () => {
    expect(getProfile('nonsense')).toBeNull()
  })
})
```

- [ ] **Step 5: Run tests**

```powershell
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app test -- topstep
```
Expected: 11 PASS.

- [ ] **Step 6: Commit**

```bash
git add 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/shared/funded/
git commit -m "feat(funded): FundedAccountProfile abstraction + Topstep \$50K XFA preset"
```

---

## Task D.2 — EquityHWMService + Trailing MaxDD Computation

The heart of the prop-firm overlay. Tracks the daily-high equity, accumulates an EOD ledger keyed by trading day, and computes the Maximum Loss Limit (MLL) per the Topstep semantics:

- **Trailing phase:** `MLL = max(initialBalance, highestEodBalance) - trailingMaxDrawdown`
- **Locked phase:** Once `highestEodBalance >= initialBalance + trailingMaxDrawdownLockAt`, `MLL = initialBalance` (static forever).

The bust check is `currentEquity >= MLL` at all times — INTRADAY as well as EOD. Drops below MLL → kill switch + immediate flatten.

**Files:**
- Create: `src/main/services/equity-hwm.ts`
- Create: `src/main/services/equity-hwm.test.ts`

- [ ] **Step 1: Write the service**

```ts
/**
 * SATEX — Equity High-Water-Mark Service.
 *
 * Owns three pieces of state for the funded-account rule overlay:
 *   1. `highestEodBalance` — the rolling max of every recorded EOD balance.
 *   2. `ledger` — per-trading-day EOD balance entries, persisted via the
 *      FundedAccountStore so the HWM survives app restarts.
 *   3. `recordEod(equity, now)` — append a fresh ledger entry, update
 *      highestEodBalance. Idempotent on the same trading-day key.
 *
 * `computeMll(profile)` is the pure decision function that turns the current
 * HWM into a dollar MLL. Branches on the lock threshold:
 *
 *   if highestEodBalance >= initialBalance + lockAt
 *     return initialBalance              // locked forever at original equity
 *   else
 *     return max(initialBalance, highestEodBalance) - trailingMaxDrawdown
 *
 * The max() guard means a brand-new account (highestEodBalance = 0 because
 * no EOD has been recorded yet) still gets MLL = initialBalance - trailing.
 *
 * G-2 from docs/audits/2026-05-28-evidence-audit.md.
 */
import type {
  EquityHwmLedgerEntry, FundedAccountProfile, FlatByConfig,
} from '@shared/funded/types'
import { createLogger } from './logger'

const log = createLogger('equity-hwm')

/** Format a Date in the given IANA tz as 'YYYY-MM-DD'. Exported so other
 *  services (EodFlattenService, FundedAccountService) compute the same
 *  day key without duplicating timezone logic. */
export function tradingDayKey(now: Date, tz: string): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
  })
  // en-CA renders YYYY-MM-DD natively; cheap path.
  return fmt.format(now)
}

export interface EquityHwmDeps {
  /** Reads the active profile id (for tz + lock threshold). null = no
   *  active funded profile, in which case the service is a no-op. */
  getProfile: () => FundedAccountProfile | null
  /** Persistence callback — invoked after every ledger mutation. */
  persist: (ledger: EquityHwmLedgerEntry[]) => void
}

export class EquityHWMService {
  private ledger: EquityHwmLedgerEntry[] = []
  private cachedHwm = 0

  constructor(private readonly deps: EquityHwmDeps) {}

  /** Restore ledger from disk at boot. Recomputes the cached HWM. */
  hydrate(ledger: EquityHwmLedgerEntry[]): void {
    this.ledger = [...ledger].sort((a, b) => a.date.localeCompare(b.date))
    this.cachedHwm = 0
    for (const entry of this.ledger) {
      if (entry.equity > this.cachedHwm) this.cachedHwm = entry.equity
    }
    log.info('equity-hwm hydrated', { entries: this.ledger.length, hwm: this.cachedHwm })
  }

  getLedger(): EquityHwmLedgerEntry[] {
    return [...this.ledger]
  }

  getHighestEodBalance(): number {
    return this.cachedHwm
  }

  /** Append (or overwrite) today's EOD entry. Caller passes the equity
   *  snapshot to record and the `now` clock; tz comes from the active
   *  profile. No-ops if no profile is active.
   *
   *  Idempotent on the same date key — repeated calls overwrite the
   *  existing entry, which lets the EodFlattenService re-record after a
   *  manual late-trade close-out without doubling up. */
  recordEod(equity: number, now: Date): void {
    const profile = this.deps.getProfile()
    if (!profile) return
    if (!Number.isFinite(equity) || equity <= 0) {
      log.warn('refusing to record non-positive / non-finite equity', { equity })
      return
    }
    const date = tradingDayKey(now, profile.flatBy.tz)
    const existing = this.ledger.findIndex(e => e.date === date)
    const entry: EquityHwmLedgerEntry = { date, equity, recordedAt: now.getTime() }
    if (existing >= 0) {
      this.ledger[existing] = entry
    } else {
      this.ledger.push(entry)
      this.ledger.sort((a, b) => a.date.localeCompare(b.date))
    }
    if (equity > this.cachedHwm) this.cachedHwm = equity
    this.deps.persist(this.getLedger())
    log.info('eod recorded', { date, equity, hwm: this.cachedHwm })
  }

  /** Compute the current MLL (Maximum Loss Limit) in dollars. Returns
   *  initialBalance - trailingMaxDrawdown for a brand-new account whose
   *  HWM is still 0; the max() guard ensures we never report an MLL
   *  greater than initialBalance during the trailing phase. */
  computeMll(profile: FundedAccountProfile): number {
    const lockThreshold = profile.initialBalance + profile.trailingMaxDrawdownLockAt
    if (this.cachedHwm >= lockThreshold) {
      return profile.initialBalance
    }
    const base = Math.max(profile.initialBalance, this.cachedHwm)
    return base - profile.trailingMaxDrawdown
  }

  /** True once the lock threshold has been crossed. */
  isLocked(profile: FundedAccountProfile): boolean {
    return this.cachedHwm >= profile.initialBalance + profile.trailingMaxDrawdownLockAt
  }

  /** Wipe state — used when the user clears the active profile. */
  reset(): void {
    this.ledger = []
    this.cachedHwm = 0
  }
}
```

- [ ] **Step 2: Write the tests**

```ts
/**
 * SATEX — EquityHWMService tests.
 * The core decision is computeMll() — Topstep's trailing-then-locked
 * semantic. Every test pins one piece of the truth table.
 */
import { describe, expect, it } from 'vitest'
import { EquityHWMService, tradingDayKey } from './equity-hwm'
import { TOPSTEP_50K_XFA } from '@shared/funded/topstep-50k-xfa'
import type { EquityHwmLedgerEntry } from '@shared/funded/types'

function buildService(): { svc: EquityHWMService; persisted: EquityHwmLedgerEntry[][] } {
  const persisted: EquityHwmLedgerEntry[][] = []
  const svc = new EquityHWMService({
    getProfile: () => TOPSTEP_50K_XFA,
    persist: (l) => { persisted.push(l) },
  })
  return { svc, persisted }
}

describe('tradingDayKey', () => {
  it('formats as YYYY-MM-DD in the given tz', () => {
    // 2026-05-29 14:00 UTC = 2026-05-29 10:00 ET (during EDT)
    const d = new Date('2026-05-29T14:00:00Z')
    expect(tradingDayKey(d, 'America/New_York')).toBe('2026-05-29')
  })

  it('rolls the day at midnight in the target tz, not UTC', () => {
    // 2026-05-30 03:00 UTC = 2026-05-29 23:00 ET (during EDT)
    const d = new Date('2026-05-30T03:00:00Z')
    expect(tradingDayKey(d, 'America/New_York')).toBe('2026-05-29')
  })
})

describe('EquityHWMService — trailing phase (highestEod < lock threshold)', () => {
  it('starts with initialBalance - trailingMaxDrawdown = $48,000', () => {
    const { svc } = buildService()
    expect(svc.computeMll(TOPSTEP_50K_XFA)).toBe(48_000)
    expect(svc.isLocked(TOPSTEP_50K_XFA)).toBe(false)
  })

  it('trails as the HWM climbs but stays below the lock threshold', () => {
    const { svc } = buildService()
    svc.recordEod(50_500, new Date('2026-05-29T20:10:00Z')) // EOD $50,500
    expect(svc.getHighestEodBalance()).toBe(50_500)
    // MLL = 50,500 - 2,000 = $48,500
    expect(svc.computeMll(TOPSTEP_50K_XFA)).toBe(48_500)
    expect(svc.isLocked(TOPSTEP_50K_XFA)).toBe(false)
  })

  it('uses max(initial, hwm) so a single-day dip below initial does not regress MLL', () => {
    const { svc } = buildService()
    // Bad day — equity ended at $49,500. HWM stays at $0 initially.
    svc.recordEod(49_500, new Date('2026-05-29T20:10:00Z'))
    // HWM bumps to $49,500, but MLL uses max(initial=50k, hwm=49.5k) = 50k.
    // MLL = 50,000 - 2,000 = $48,000.
    expect(svc.computeMll(TOPSTEP_50K_XFA)).toBe(48_000)
  })
})

describe('EquityHWMService — locked phase (highestEod >= lock threshold)', () => {
  it('locks once HWM crosses initialBalance + dailyLossLimit = $51,000', () => {
    const { svc } = buildService()
    svc.recordEod(51_000, new Date('2026-05-29T20:10:00Z'))
    expect(svc.isLocked(TOPSTEP_50K_XFA)).toBe(true)
    expect(svc.computeMll(TOPSTEP_50K_XFA)).toBe(50_000) // locked at initial
  })

  it('keeps MLL static at initialBalance even as HWM climbs higher', () => {
    const { svc } = buildService()
    svc.recordEod(51_000, new Date('2026-05-29T20:10:00Z'))
    svc.recordEod(55_000, new Date('2026-05-30T20:10:00Z'))
    svc.recordEod(80_000, new Date('2026-06-15T20:10:00Z'))
    expect(svc.computeMll(TOPSTEP_50K_XFA)).toBe(50_000)
  })

  it('stays locked even if a later EOD dips back below the threshold', () => {
    const { svc } = buildService()
    svc.recordEod(51_500, new Date('2026-05-29T20:10:00Z'))
    expect(svc.isLocked(TOPSTEP_50K_XFA)).toBe(true)
    // Lose half the gains the next day.
    svc.recordEod(50_500, new Date('2026-05-30T20:10:00Z'))
    expect(svc.isLocked(TOPSTEP_50K_XFA)).toBe(true) // HWM still 51,500
    expect(svc.computeMll(TOPSTEP_50K_XFA)).toBe(50_000)
  })
})

describe('EquityHWMService — ledger persistence', () => {
  it('persists after every recordEod', () => {
    const { svc, persisted } = buildService()
    svc.recordEod(50_500, new Date('2026-05-29T20:10:00Z'))
    svc.recordEod(51_000, new Date('2026-05-30T20:10:00Z'))
    expect(persisted).toHaveLength(2)
    expect(persisted[1]).toHaveLength(2)
  })

  it('overwrites a same-day entry rather than appending', () => {
    const { svc } = buildService()
    svc.recordEod(50_500, new Date('2026-05-29T20:10:00Z'))
    svc.recordEod(50_700, new Date('2026-05-29T20:30:00Z')) // late re-record
    expect(svc.getLedger()).toHaveLength(1)
    expect(svc.getLedger()[0]!.equity).toBe(50_700)
  })

  it('rejects non-positive / non-finite equity', () => {
    const { svc } = buildService()
    svc.recordEod(0,       new Date('2026-05-29T20:10:00Z'))
    svc.recordEod(-100,    new Date('2026-05-29T20:10:00Z'))
    svc.recordEod(NaN,     new Date('2026-05-29T20:10:00Z'))
    svc.recordEod(Infinity, new Date('2026-05-29T20:10:00Z'))
    expect(svc.getLedger()).toHaveLength(0)
  })
})

describe('EquityHWMService — hydration', () => {
  it('rebuilds HWM from a persisted ledger', () => {
    const { svc } = buildService()
    svc.hydrate([
      { date: '2026-05-27', equity: 50_200, recordedAt: 0 },
      { date: '2026-05-28', equity: 50_800, recordedAt: 0 },
      { date: '2026-05-29', equity: 50_400, recordedAt: 0 },
    ])
    expect(svc.getHighestEodBalance()).toBe(50_800)
  })

  it('sorts the ledger by date even if hydrate is fed out of order', () => {
    const { svc } = buildService()
    svc.hydrate([
      { date: '2026-05-29', equity: 50_400, recordedAt: 0 },
      { date: '2026-05-27', equity: 50_200, recordedAt: 0 },
      { date: '2026-05-28', equity: 50_800, recordedAt: 0 },
    ])
    const dates = svc.getLedger().map(e => e.date)
    expect(dates).toEqual(['2026-05-27', '2026-05-28', '2026-05-29'])
  })
})

describe('EquityHWMService — reset', () => {
  it('clears state to baseline', () => {
    const { svc } = buildService()
    svc.recordEod(52_000, new Date('2026-05-29T20:10:00Z'))
    svc.reset()
    expect(svc.getHighestEodBalance()).toBe(0)
    expect(svc.getLedger()).toHaveLength(0)
    expect(svc.computeMll(TOPSTEP_50K_XFA)).toBe(48_000)
  })
})

describe('EquityHWMService — no active profile', () => {
  it('recordEod is a no-op when getProfile() returns null', () => {
    const persisted: EquityHwmLedgerEntry[][] = []
    const svc = new EquityHWMService({
      getProfile: () => null,
      persist: (l) => { persisted.push(l) },
    })
    svc.recordEod(50_000, new Date('2026-05-29T20:10:00Z'))
    expect(svc.getLedger()).toHaveLength(0)
    expect(persisted).toHaveLength(0)
  })
})
```

- [ ] **Step 3: Run tests**

```powershell
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app test -- equity-hwm
```
Expected: 16 PASS.

- [ ] **Step 4: Commit**

```bash
git add 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/services/equity-hwm.ts 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/services/equity-hwm.test.ts
git commit -m "feat(funded): EquityHWMService — trailing MaxDD with Topstep lock semantics"
```

---

## Task D.3 — News-Blackout Check

Two pieces:
1. **Pure decision** — `isInBlackout(now, events, impacts, windowMs)` in a standalone file. No state, no I/O. Unit-tested against canned event lists.
2. **MacroCalendarService method** — thin wrapper around the pure function that pulls events from the service's existing snapshot.

The pure split matters because the OrderManager pre-trade gate calls this on every order — it needs to be fast and predictable, and we want to assert behavior without spinning up the whole MacroCalendarService.

**Files:**
- Create: `src/main/services/blackout-window.ts`
- Create: `src/main/services/blackout-window.test.ts`
- Modify: `src/main/services/macro-calendar.ts` — add `isInBlackout` method
- Create: `src/main/services/macro-calendar.test.ts` (this service had no tests before)

- [ ] **Step 1: Write the pure check function**

`src/main/services/blackout-window.ts`:

```ts
/**
 * SATEX — News-blackout window check.
 *
 * Pure function — given a clock, a list of macro events, the impact levels
 * that trip the blackout, and a half-window in ms, returns whether any
 * matching event falls inside [now - window, now + window].
 *
 * G-4 from docs/audits/2026-05-28-evidence-audit.md.
 */
import type { MacroEvent, MacroImpact } from '@shared/types'

export interface BlackoutResult {
  inBlackout: boolean
  /** If inBlackout, the matched event closest to now. Null otherwise. */
  triggeringEvent: MacroEvent | null
  /** Signed ms from now to the triggering event's ts. Negative = past. */
  msToEvent: number | null
}

/** Pure decision function. Caller supplies events + clock + config. */
export function isInBlackout(
  nowMs: number,
  events: MacroEvent[],
  impacts: MacroImpact[],
  windowMs: number,
): BlackoutResult {
  if (impacts.length === 0 || windowMs <= 0) {
    return { inBlackout: false, triggeringEvent: null, msToEvent: null }
  }
  const impactSet = new Set(impacts)
  let bestDelta = Number.POSITIVE_INFINITY
  let bestEvent: MacroEvent | null = null
  for (const evt of events) {
    if (!impactSet.has(evt.impact)) continue
    const evtMs = Date.parse(evt.tsUtc)
    if (Number.isNaN(evtMs)) continue
    const delta = evtMs - nowMs
    if (Math.abs(delta) <= windowMs && Math.abs(delta) < Math.abs(bestDelta)) {
      bestDelta = delta
      bestEvent = evt
    }
  }
  if (bestEvent === null) {
    return { inBlackout: false, triggeringEvent: null, msToEvent: null }
  }
  return { inBlackout: true, triggeringEvent: bestEvent, msToEvent: bestDelta }
}
```

- [ ] **Step 2: Write the pure-function tests**

`src/main/services/blackout-window.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { isInBlackout } from './blackout-window'
import type { MacroEvent } from '@shared/types'

const now = Date.parse('2026-05-29T12:30:00Z')

function evt(offsetSec: number, impact: 'high' | 'med' | 'low' = 'high', id = 'e'): MacroEvent {
  return {
    id, label: id, cons: '—', actual: '—', impact,
    tsUtc: new Date(now + offsetSec * 1000).toISOString(),
  }
}

describe('isInBlackout', () => {
  it('returns false when no events are in the window', () => {
    const r = isInBlackout(now, [evt(300)], ['high'], 60_000)
    expect(r.inBlackout).toBe(false)
    expect(r.triggeringEvent).toBeNull()
  })

  it('returns true when a high-impact event is in the future window', () => {
    const r = isInBlackout(now, [evt(30)], ['high'], 60_000)
    expect(r.inBlackout).toBe(true)
    expect(r.triggeringEvent?.id).toBe('e')
    expect(r.msToEvent).toBe(30_000)
  })

  it('returns true when a high-impact event was within the past window', () => {
    const r = isInBlackout(now, [evt(-30)], ['high'], 60_000)
    expect(r.inBlackout).toBe(true)
    expect(r.msToEvent).toBe(-30_000)
  })

  it('filters by impact — med events do not trigger a high-only blackout', () => {
    const r = isInBlackout(now, [evt(10, 'med'), evt(20, 'med')], ['high'], 60_000)
    expect(r.inBlackout).toBe(false)
  })

  it('picks the closest event when multiple are inside the window', () => {
    const r = isInBlackout(now, [evt(50, 'high', 'far'), evt(10, 'high', 'near')], ['high'], 60_000)
    expect(r.triggeringEvent?.id).toBe('near')
  })

  it('treats events exactly at the window boundary as INSIDE', () => {
    // ±60s window, event at +60s → boundary inclusive (Math.abs(60000) <= 60000).
    const r = isInBlackout(now, [evt(60)], ['high'], 60_000)
    expect(r.inBlackout).toBe(true)
  })

  it('treats events just outside the window as OUTSIDE', () => {
    const r = isInBlackout(now, [evt(61)], ['high'], 60_000)
    expect(r.inBlackout).toBe(false)
  })

  it('returns false when the impacts array is empty (blackout disabled)', () => {
    const r = isInBlackout(now, [evt(0)], [], 60_000)
    expect(r.inBlackout).toBe(false)
  })

  it('returns false when windowMs is 0', () => {
    const r = isInBlackout(now, [evt(0)], ['high'], 0)
    expect(r.inBlackout).toBe(false)
  })

  it('multi-impact triggers on any matching impact', () => {
    const high = evt(10, 'high', 'h')
    const med = evt(20, 'med', 'm')
    const r = isInBlackout(now, [high, med], ['high', 'med'], 60_000)
    expect(r.inBlackout).toBe(true)
    expect(r.triggeringEvent?.id).toBe('h') // closer one
  })

  it('skips events with malformed tsUtc', () => {
    const malformed: MacroEvent = {
      id: 'bad', label: '', cons: '—', actual: '—', impact: 'high', tsUtc: 'not-a-date',
    }
    const r = isInBlackout(now, [malformed], ['high'], 60_000)
    expect(r.inBlackout).toBe(false)
  })
})
```

- [ ] **Step 3: Add the wrapper method to MacroCalendarService**

In `src/main/services/macro-calendar.ts`, add the import and the new method:

```ts
// At the top of the file with the other imports:
import { isInBlackout, type BlackoutResult } from './blackout-window'
import type { MacroImpact } from '@shared/types'
```

```ts
// Inside the MacroCalendarService class, alongside get() and reportActual():

  /** True iff any event of the given impact levels falls inside ±windowMs
   *  of `nowMs`. Pure delegation to blackout-window — wrapped here so
   *  consumers don't need to know the MacroCalendarService's internal
   *  snapshot shape. */
  checkBlackout(nowMs: number, impacts: MacroImpact[], windowMs: number): BlackoutResult {
    if (!this.snapshot) this.recompute()
    return isInBlackout(nowMs, this.snapshot!.events, impacts, windowMs)
  }
```

- [ ] **Step 4: Write the MacroCalendarService test file (didn't exist before)**

`src/main/services/macro-calendar.test.ts`:

```ts
/**
 * SATEX — MacroCalendarService tests.
 * Pre-existing service had no tests — covered just enough here to lock the
 * new checkBlackout method's wiring + the snapshot contract used by the
 * blackout caller path.
 */
import { describe, expect, it } from 'vitest'
import { MacroCalendarService } from './macro-calendar'

describe('MacroCalendarService.checkBlackout', () => {
  it('forwards to the pure isInBlackout — empty impacts → never in blackout', () => {
    const svc = new MacroCalendarService()
    const r = svc.checkBlackout(Date.now(), [], 60_000)
    expect(r.inBlackout).toBe(false)
  })

  it('returns a structured BlackoutResult shape (matches blackout-window API)', () => {
    const svc = new MacroCalendarService()
    const r = svc.checkBlackout(Date.now(), ['high'], 60_000)
    expect(r).toHaveProperty('inBlackout')
    expect(r).toHaveProperty('triggeringEvent')
    expect(r).toHaveProperty('msToEvent')
  })

  it('get() returns a populated snapshot after construction', () => {
    const svc = new MacroCalendarService()
    const snap = svc.get()
    expect(snap.events.length).toBeGreaterThan(0)
    expect(snap.horizonHours).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 5: Run tests**

```powershell
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app test -- blackout
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app test -- macro-calendar
```
Expected: 11 PASS in blackout-window.test.ts + 3 PASS in macro-calendar.test.ts.

- [ ] **Step 6: Commit**

```bash
git add 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/services/blackout-window.ts 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/services/blackout-window.test.ts 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/services/macro-calendar.ts 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/services/macro-calendar.test.ts
git commit -m "feat(funded): news-blackout check (pure fn + MacroCalendarService method)"
```

---

## Task D.4 — EodFlattenService

IANA-tz-aware service that fires a callback at the configured flat-by time every weekday. The callback is wired (in D.9) to `OrderManager.cancelAllOrders() + OrderManager.flattenAllPositions()`.

Design:
- **`computeMsToFlatBy(now, flatBy)`** — pure function returning ms until the next occurrence of the configured local clock time in the configured tz. DST-safe via `Intl.DateTimeFormat`. Skips weekends (next Mon if Fri after cutoff).
- **`EodFlattenService.tick(now)`** — idempotent check fired once per minute. If `now` is past today's flatBy AND today hasn't fired yet → invoke the callback, mark today as fired.
- **`triggerNow(now)`** — manual fire path for tests + the "Flatten Now" panic button in the future UI.
- **`isPastFlatBy(now, flatBy)`** — exported helper for the OrderManager Gate 12 (refuse new entries inside the last few minutes before flat-by, configurable).

**Files:**
- Create: `src/main/services/eod-flatten.ts`
- Create: `src/main/services/eod-flatten.test.ts`

- [ ] **Step 1: Write the service**

```ts
/**
 * SATEX — End-of-Day Flatten Service.
 *
 * Fires once per trading day at the configured flat-by clock time
 * (e.g. 16:10 America/New_York for Topstep). The wired callback cancels
 * all open orders and flattens all open positions — keeps the account
 * from holding overnight, which is an instant Topstep rule violation.
 *
 * v1 is tick-driven: caller invokes `tick(now)` from a setInterval (1 min
 * cadence is plenty since the cutoff has minute-level granularity). This
 * keeps the service deterministic and testable without setTimeout state.
 *
 * G-5 from docs/audits/2026-05-28-evidence-audit.md.
 */
import type { FlatByConfig } from '@shared/funded/types'
import { tradingDayKey } from './equity-hwm'
import { createLogger } from './logger'

const log = createLogger('eod-flatten')

/** Renderer-side parts of a Date in a specific tz. Used internally by
 *  computeMsToFlatBy to avoid timezone math by hand. */
interface TzParts {
  year: number
  month: number   // 1-12
  day: number     // 1-31
  hour: number    // 0-23
  minute: number  // 0-59
  weekday: number // 0=Sun..6=Sat (matches Date.getDay())
}

function partsIn(date: Date, tz: string): TzParts {
  // Intl returns ja-JP-style 24h numerals for these fields. en-CA gives
  // us YYYY/MM/DD and HH:MM; weekday comes via `weekday: 'short'`.
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
    weekday: 'short',
  })
  const parts = fmt.formatToParts(date)
  const grab = (type: string): string => parts.find(p => p.type === type)?.value ?? ''
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return {
    year:    parseInt(grab('year'),    10),
    month:   parseInt(grab('month'),   10),
    day:     parseInt(grab('day'),     10),
    hour:    parseInt(grab('hour'),    10) % 24, // en-CA may emit '24' for midnight in some locales
    minute:  parseInt(grab('minute'),  10),
    weekday: weekdayMap[grab('weekday')] ?? 0,
  }
}

/** True if `now` is at or past today's flat-by clock time in the given tz. */
export function isPastFlatBy(now: Date, flatBy: FlatByConfig): boolean {
  const p = partsIn(now, flatBy.tz)
  if (p.hour > flatBy.hour) return true
  if (p.hour < flatBy.hour) return false
  return p.minute >= flatBy.minute
}

/** True if `now` falls on a weekend in the given tz. */
export function isWeekend(now: Date, tz: string): boolean {
  const wd = partsIn(now, tz).weekday
  return wd === 0 || wd === 6
}

/** Returns the next time the EOD flat will fire, in ms from now. Skips
 *  weekends (Fri after-cutoff → Mon at cutoff). Always positive. */
export function computeMsToFlatBy(now: Date, flatBy: FlatByConfig): number {
  // Binary search-ish: probe forward in 5-min increments. Pure-JS without
  // a date library makes "next occurrence of HH:MM in tz Y" surprisingly
  // tricky; this brute-force search is O(288) max (24 h × 12 per hr) per
  // day and runs at most ~3 days ahead — bounded, fast, easy to reason about.
  const STEP_MS = 5 * 60_000
  const MAX_PROBES = (3 * 24 * 60 / 5) // ≤ 3 calendar days
  for (let i = 1; i <= MAX_PROBES; i++) {
    const probe = new Date(now.getTime() + i * STEP_MS)
    if (isWeekend(probe, flatBy.tz)) continue
    const p = partsIn(probe, flatBy.tz)
    if (p.hour === flatBy.hour && p.minute >= flatBy.minute && p.minute < flatBy.minute + 5) {
      return probe.getTime() - now.getTime()
    }
  }
  // Should never hit unless STEP_MS or MAX_PROBES is misconfigured.
  return 0
}

export interface EodFlattenDeps {
  /** Active flat-by config. Returns null when no profile is active —
   *  the service goes inert. */
  getFlatBy: () => FlatByConfig | null
  /** Fire callback invoked when the cutoff triggers. The wired
   *  implementation cancels all pending orders + flattens positions. */
  onFlat: (reason: string) => void
}

export class EodFlattenService {
  /** Date key (YYYY-MM-DD in profile tz) of the most recent fire. Resets
   *  every new day. Prevents a single cutoff from firing repeatedly when
   *  the tick interval is shorter than the post-cutoff window. */
  private lastFiredDate: string | null = null

  constructor(private readonly deps: EodFlattenDeps) {}

  /** Caller hooks this to a setInterval (e.g. once per minute). No-ops
   *  when no profile is active. */
  tick(now: Date): void {
    const flatBy = this.deps.getFlatBy()
    if (!flatBy) return
    if (isWeekend(now, flatBy.tz)) return
    if (!isPastFlatBy(now, flatBy)) return
    const today = tradingDayKey(now, flatBy.tz)
    if (this.lastFiredDate === today) return
    this.lastFiredDate = today
    log.warn('EOD flatten fired', { date: today, flatBy })
    this.deps.onFlat(`eod-${today}`)
  }

  /** Manual trigger — used by tests and (eventually) a UI "Flatten Now"
   *  button. Bypasses the time check; still marks today as fired so the
   *  scheduled tick won't double-fire. */
  triggerNow(now: Date, reason: string): void {
    const flatBy = this.deps.getFlatBy()
    if (!flatBy) return
    const today = tradingDayKey(now, flatBy.tz)
    this.lastFiredDate = today
    log.warn('EOD flatten manually triggered', { date: today, reason })
    this.deps.onFlat(reason)
  }

  /** ms from `now` to today's flat-by (negative if past). For the
   *  RiskGatesService EOD_COUNTDOWN display. */
  msToFlatBy(now: Date): number {
    const flatBy = this.deps.getFlatBy()
    if (!flatBy) return 0
    return computeMsToFlatBy(now, flatBy)
  }

  /** True if today's flat-by has already fired (post-tick) for today. */
  hasFiredToday(now: Date): boolean {
    const flatBy = this.deps.getFlatBy()
    if (!flatBy) return false
    return this.lastFiredDate === tradingDayKey(now, flatBy.tz)
  }

  /** Wipe state — used by the funded-account-clear path. */
  reset(): void {
    this.lastFiredDate = null
  }
}
```

- [ ] **Step 2: Write the tests**

```ts
import { describe, expect, it } from 'vitest'
import { EodFlattenService, computeMsToFlatBy, isPastFlatBy, isWeekend } from './eod-flatten'
import type { FlatByConfig } from '@shared/funded/types'

const TOPSTEP: FlatByConfig = { hour: 16, minute: 10, tz: 'America/New_York' }

// 2026-05-29 is a Friday during EDT (UTC-4).
//   2026-05-29 20:10:00Z = 16:10 New_York → exactly at flat-by
//   2026-05-29 19:00:00Z = 15:00 New_York → before flat-by
//   2026-05-29 21:00:00Z = 17:00 New_York → after flat-by
//   2026-05-30 (Saturday), 2026-05-31 (Sunday) — weekend
//   2026-06-01 (Monday) — next trading day

describe('isPastFlatBy', () => {
  it('false when local time is before flat-by hour', () => {
    expect(isPastFlatBy(new Date('2026-05-29T15:00:00Z'), TOPSTEP)).toBe(false)
  })
  it('false when local time is same hour but earlier minute', () => {
    expect(isPastFlatBy(new Date('2026-05-29T20:09:00Z'), TOPSTEP)).toBe(false)
  })
  it('true exactly at flat-by minute', () => {
    expect(isPastFlatBy(new Date('2026-05-29T20:10:00Z'), TOPSTEP)).toBe(true)
  })
  it('true after flat-by', () => {
    expect(isPastFlatBy(new Date('2026-05-29T21:00:00Z'), TOPSTEP)).toBe(true)
  })
})

describe('isWeekend', () => {
  it('Saturday (Sat in NY) → true', () => {
    expect(isWeekend(new Date('2026-05-30T15:00:00Z'), 'America/New_York')).toBe(true)
  })
  it('Sunday → true', () => {
    expect(isWeekend(new Date('2026-05-31T15:00:00Z'), 'America/New_York')).toBe(true)
  })
  it('Friday → false', () => {
    expect(isWeekend(new Date('2026-05-29T15:00:00Z'), 'America/New_York')).toBe(false)
  })
})

describe('computeMsToFlatBy', () => {
  it('returns positive ms to today\'s flat-by when before cutoff', () => {
    // 15:00 NY → flat at 16:10 NY → 70 min away.
    const now = new Date('2026-05-29T19:00:00Z')
    const ms = computeMsToFlatBy(now, TOPSTEP)
    expect(ms).toBeGreaterThan(60 * 60_000) // > 1 hour
    expect(ms).toBeLessThan(80 * 60_000)    // < 80 min
  })

  it('skips weekends — Fri after cutoff returns Mon at cutoff', () => {
    // Fri 17:00 NY (after cutoff) → next is Mon 16:10 NY → ~71h away.
    const now = new Date('2026-05-29T21:00:00Z')
    const ms = computeMsToFlatBy(now, TOPSTEP)
    expect(ms).toBeGreaterThan(60 * 60 * 60_000)  // > 60 h
    expect(ms).toBeLessThan(80 * 60 * 60_000)     // < 80 h
  })
})

describe('EodFlattenService.tick', () => {
  function build() {
    const calls: string[] = []
    let active = true
    const svc = new EodFlattenService({
      getFlatBy: () => active ? TOPSTEP : null,
      onFlat: (reason) => calls.push(reason),
    })
    return {
      svc, calls,
      deactivate: () => { active = false },
    }
  }

  it('fires when ticked past flat-by', () => {
    const { svc, calls } = build()
    svc.tick(new Date('2026-05-29T20:15:00Z')) // 16:15 NY, past 16:10
    expect(calls).toHaveLength(1)
    expect(calls[0]).toBe('eod-2026-05-29')
  })

  it('does NOT fire twice in the same day', () => {
    const { svc, calls } = build()
    svc.tick(new Date('2026-05-29T20:15:00Z'))
    svc.tick(new Date('2026-05-29T20:20:00Z'))
    svc.tick(new Date('2026-05-29T22:00:00Z'))
    expect(calls).toHaveLength(1)
  })

  it('does NOT fire before flat-by', () => {
    const { svc, calls } = build()
    svc.tick(new Date('2026-05-29T19:00:00Z'))
    expect(calls).toHaveLength(0)
  })

  it('does NOT fire on weekends', () => {
    const { svc, calls } = build()
    svc.tick(new Date('2026-05-30T20:30:00Z')) // Sat past cutoff
    svc.tick(new Date('2026-05-31T20:30:00Z')) // Sun past cutoff
    expect(calls).toHaveLength(0)
  })

  it('fires again on a new trading day', () => {
    const { svc, calls } = build()
    svc.tick(new Date('2026-05-29T20:15:00Z')) // Fri fire
    svc.tick(new Date('2026-06-01T20:15:00Z')) // Mon fire
    expect(calls).toHaveLength(2)
  })

  it('no-ops when no profile is active', () => {
    const { svc, calls, deactivate } = build()
    deactivate()
    svc.tick(new Date('2026-05-29T20:15:00Z'))
    expect(calls).toHaveLength(0)
  })
})

describe('EodFlattenService.triggerNow', () => {
  it('fires immediately regardless of time', () => {
    const calls: string[] = []
    const svc = new EodFlattenService({
      getFlatBy: () => TOPSTEP,
      onFlat: (r) => calls.push(r),
    })
    svc.triggerNow(new Date('2026-05-29T10:00:00Z'), 'panic-button')
    expect(calls).toEqual(['panic-button'])
  })

  it('marks today as fired so a subsequent tick at cutoff does not double-fire', () => {
    const calls: string[] = []
    const svc = new EodFlattenService({
      getFlatBy: () => TOPSTEP,
      onFlat: (r) => calls.push(r),
    })
    svc.triggerNow(new Date('2026-05-29T10:00:00Z'), 'panic')
    svc.tick(new Date('2026-05-29T20:15:00Z'))
    expect(calls).toEqual(['panic'])
  })
})

describe('EodFlattenService.reset', () => {
  it('clears the "fired today" memory so the next tick can fire again', () => {
    const calls: string[] = []
    const svc = new EodFlattenService({
      getFlatBy: () => TOPSTEP,
      onFlat: (r) => calls.push(r),
    })
    svc.tick(new Date('2026-05-29T20:15:00Z'))
    svc.reset()
    svc.tick(new Date('2026-05-29T20:30:00Z'))
    expect(calls).toHaveLength(2)
  })
})
```

- [ ] **Step 3: Run tests**

```powershell
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app test -- eod-flatten
```
Expected: 16 PASS.

- [ ] **Step 4: Commit**

```bash
git add 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/services/eod-flatten.ts 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/services/eod-flatten.test.ts
git commit -m "feat(funded): EodFlattenService — IANA-tz-aware end-of-day cancel + flatten"
```

---

## Task D.5 — Max-Contracts Gate (Pure Check)

A small pure function that the OrderManager gate 11 calls. Checks whether a proposed order would push the absolute position size above the per-symbol cap (with fallback to `defaultMaxContracts`).

**Files:**
- Create: `src/shared/funded/checks.ts`
- Create: `src/shared/funded/checks.test.ts`

- [ ] **Step 1: Write the check**

```ts
/**
 * SATEX — Funded-account pre-trade checks.
 * Pure functions called by OrderManager gates 11 (max-contracts) and 13
 * (allowed-asset-class). No state, no I/O.
 */
import type { AssetClass, OrderSide } from '@shared/types'
import type { FundedAccountProfile } from './types'

export interface MaxContractsCheckResult {
  ok: boolean
  cap: number
  /** Absolute size of the position AFTER this order would execute. */
  resultingAbs: number
}

/** True iff the proposed order keeps the absolute resulting position size
 *  at or below the symbol's contract cap (or the profile's default cap when
 *  the symbol isn't in the map).
 *
 *  `currentPositionQty` is signed: positive = long, negative = short.
 *  Order side determines whether qty adds to or subtracts from the
 *  signed position. The gate then checks `abs(resulting) <= cap`. */
export function checkMaxContracts(
  symbol: string,
  side: OrderSide,
  qty: number,
  currentPositionQty: number,
  profile: FundedAccountProfile,
): MaxContractsCheckResult {
  const cap = profile.maxContracts[symbol] ?? profile.defaultMaxContracts
  const signedDelta = side === 'buy' ? qty : -qty
  const resulting = currentPositionQty + signedDelta
  const resultingAbs = Math.abs(resulting)
  return { ok: resultingAbs <= cap, cap, resultingAbs }
}

/** True iff the asset class is in the profile's allowedAssetClasses list. */
export function checkAllowedAssetClass(
  assetClass: AssetClass,
  profile: FundedAccountProfile,
): boolean {
  return profile.allowedAssetClasses.includes(assetClass)
}
```

- [ ] **Step 2: Write the tests**

```ts
import { describe, expect, it } from 'vitest'
import { checkAllowedAssetClass, checkMaxContracts } from './checks'
import { TOPSTEP_50K_XFA } from './topstep-50k-xfa'

describe('checkMaxContracts — known symbol (ES, cap 5)', () => {
  it('flat → buy 5 → OK (resulting +5)', () => {
    const r = checkMaxContracts('ES', 'buy', 5, 0, TOPSTEP_50K_XFA)
    expect(r.ok).toBe(true)
    expect(r.cap).toBe(5)
    expect(r.resultingAbs).toBe(5)
  })

  it('flat → buy 6 → REJECT (resulting +6 > 5)', () => {
    const r = checkMaxContracts('ES', 'buy', 6, 0, TOPSTEP_50K_XFA)
    expect(r.ok).toBe(false)
    expect(r.cap).toBe(5)
    expect(r.resultingAbs).toBe(6)
  })

  it('long 3 → buy 2 → OK (resulting +5)', () => {
    expect(checkMaxContracts('ES', 'buy', 2, 3, TOPSTEP_50K_XFA).ok).toBe(true)
  })

  it('long 5 (max) → buy 1 → REJECT (resulting +6)', () => {
    expect(checkMaxContracts('ES', 'buy', 1, 5, TOPSTEP_50K_XFA).ok).toBe(false)
  })

  it('long 5 → sell 1 (partial close) → OK (resulting +4)', () => {
    const r = checkMaxContracts('ES', 'sell', 1, 5, TOPSTEP_50K_XFA)
    expect(r.ok).toBe(true)
    expect(r.resultingAbs).toBe(4)
  })

  it('long 5 → sell 10 (flip to short 5) → OK (resulting abs 5)', () => {
    const r = checkMaxContracts('ES', 'sell', 10, 5, TOPSTEP_50K_XFA)
    expect(r.ok).toBe(true)
    expect(r.resultingAbs).toBe(5)
  })

  it('long 5 → sell 11 (flip to short 6) → REJECT', () => {
    const r = checkMaxContracts('ES', 'sell', 11, 5, TOPSTEP_50K_XFA)
    expect(r.ok).toBe(false)
    expect(r.resultingAbs).toBe(6)
  })

  it('short 5 → buy 1 (partial cover) → OK', () => {
    expect(checkMaxContracts('ES', 'buy', 1, -5, TOPSTEP_50K_XFA).ok).toBe(true)
  })

  it('short 5 → sell 1 (add) → REJECT', () => {
    expect(checkMaxContracts('ES', 'sell', 1, -5, TOPSTEP_50K_XFA).ok).toBe(false)
  })
})

describe('checkMaxContracts — unknown symbol falls through to defaultMaxContracts', () => {
  it('AAPL (not in map) → buy 1 → OK at default cap of 1', () => {
    const r = checkMaxContracts('AAPL', 'buy', 1, 0, TOPSTEP_50K_XFA)
    expect(r.ok).toBe(true)
    expect(r.cap).toBe(1)
  })

  it('AAPL → buy 2 → REJECT at default cap of 1', () => {
    expect(checkMaxContracts('AAPL', 'buy', 2, 0, TOPSTEP_50K_XFA).ok).toBe(false)
  })
})

describe('checkAllowedAssetClass', () => {
  it('Topstep profile is permissive in the Alpaca overlay (equity / future / crypto allowed)', () => {
    expect(checkAllowedAssetClass('equity', TOPSTEP_50K_XFA)).toBe(true)
    expect(checkAllowedAssetClass('future', TOPSTEP_50K_XFA)).toBe(true)
    expect(checkAllowedAssetClass('crypto', TOPSTEP_50K_XFA)).toBe(true)
  })

  it('index asset class is not in the default allowed list → REJECT', () => {
    expect(checkAllowedAssetClass('index', TOPSTEP_50K_XFA)).toBe(false)
  })
})
```

- [ ] **Step 3: Run tests**

```powershell
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app test -- checks
```
Expected: 13 PASS.

- [ ] **Step 4: Commit**

```bash
git add 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/shared/funded/checks.ts 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/shared/funded/checks.test.ts
git commit -m "feat(funded): pure max-contracts + allowed-asset-class checks"
```

---

## Task D.6 — FundedAccountStore (Persistence)

File persistence for the active profile id + the EquityHWM ledger. Same pattern as the existing `kill-switch-store.ts` — single JSON file at `userData/funded-account.json` with a strict shape, atomic write, silent recovery.

**Files:**
- Create: `src/main/services/funded-account-store.ts`
- Create: `src/main/services/funded-account-store.test.ts`

- [ ] **Step 1: Write the store**

```ts
/**
 * SATEX — Funded account persistence.
 * Stores the active profile id + the EquityHWM ledger to
 * `userData/funded-account.json`. Same atomic-write / silent-recovery
 * pattern as kill-switch-store.ts so a corrupted file never crashes boot.
 *
 * The deps shape (read/write functions injected) keeps the test surface
 * pure — no electron `app.getPath` calls in unit tests.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { app } from 'electron'
import { join } from 'node:path'
import type { EquityHwmLedgerEntry } from '@shared/funded/types'
import { createLogger } from './logger'

const log = createLogger('funded-store')

export interface FundedAccountStored {
  activeProfileId: string | null
  ledger: EquityHwmLedgerEntry[]
  updatedAt: number
}

const EMPTY: FundedAccountStored = {
  activeProfileId: null,
  ledger: [],
  updatedAt: 0,
}

export interface FundedAccountStoreDeps {
  readFile: (path: string) => string | null
  writeFile: (path: string, data: string) => void
  resolvePath: () => string
}

function defaultDeps(): FundedAccountStoreDeps {
  return {
    readFile: (path) => existsSync(path) ? readFileSync(path, 'utf8') : null,
    writeFile: (path, data) => writeFileSync(path, data, 'utf8'),
    resolvePath: () => join(app.getPath('userData'), 'funded-account.json'),
  }
}

function isLedgerEntry(x: unknown): x is EquityHwmLedgerEntry {
  if (!x || typeof x !== 'object') return false
  const e = x as Record<string, unknown>
  return typeof e.date === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(e.date as string)
    && typeof e.equity === 'number'
    && Number.isFinite(e.equity as number)
    && (e.equity as number) > 0
    && typeof e.recordedAt === 'number'
}

function sanitize(raw: unknown): FundedAccountStored {
  if (!raw || typeof raw !== 'object') return { ...EMPTY }
  const r = raw as Record<string, unknown>
  const activeProfileId = typeof r.activeProfileId === 'string' ? r.activeProfileId : null
  const rawLedger = Array.isArray(r.ledger) ? r.ledger : []
  const ledger = rawLedger.filter(isLedgerEntry) as EquityHwmLedgerEntry[]
  const updatedAt = typeof r.updatedAt === 'number' ? r.updatedAt : 0
  return { activeProfileId, ledger, updatedAt }
}

export class FundedAccountStore {
  private readonly deps: FundedAccountStoreDeps
  constructor(deps?: Partial<FundedAccountStoreDeps>) {
    const defaults = deps?.resolvePath ? deps as FundedAccountStoreDeps : defaultDeps()
    this.deps = { ...defaults, ...deps }
  }

  load(): FundedAccountStored {
    try {
      const raw = this.deps.readFile(this.deps.resolvePath())
      if (raw === null) return { ...EMPTY }
      return sanitize(JSON.parse(raw))
    } catch (e) {
      log.warn('funded-account load failed — falling back to empty', { err: String(e) })
      return { ...EMPTY }
    }
  }

  save(state: FundedAccountStored): void {
    try {
      const payload: FundedAccountStored = { ...state, updatedAt: Date.now() }
      this.deps.writeFile(this.deps.resolvePath(), JSON.stringify(payload, null, 2))
    } catch (e) {
      log.error('funded-account save failed', { err: String(e) })
    }
  }
}
```

- [ ] **Step 2: Write the tests**

```ts
import { describe, expect, it } from 'vitest'
import { FundedAccountStore, type FundedAccountStored } from './funded-account-store'

function buildStore(initial: string | null = null) {
  const fs: { last: string | null } = { last: initial }
  const path = '/tmp/funded-test.json'
  const store = new FundedAccountStore({
    readFile: () => fs.last,
    writeFile: (_p, d) => { fs.last = d },
    resolvePath: () => path,
  })
  return { store, fs }
}

describe('FundedAccountStore.load', () => {
  it('returns empty when file is missing', () => {
    const { store } = buildStore(null)
    const s = store.load()
    expect(s.activeProfileId).toBeNull()
    expect(s.ledger).toEqual([])
  })

  it('round-trips a saved state', () => {
    const { store } = buildStore()
    const written: FundedAccountStored = {
      activeProfileId: 'topstep-50k-xfa',
      ledger: [{ date: '2026-05-29', equity: 50_500, recordedAt: 0 }],
      updatedAt: 0,
    }
    store.save(written)
    const back = store.load()
    expect(back.activeProfileId).toBe('topstep-50k-xfa')
    expect(back.ledger).toHaveLength(1)
    expect(back.ledger[0]!.equity).toBe(50_500)
  })

  it('returns empty on corrupted JSON', () => {
    const { store } = buildStore('{not json at all')
    const s = store.load()
    expect(s.activeProfileId).toBeNull()
    expect(s.ledger).toEqual([])
  })

  it('drops malformed ledger entries during sanitize', () => {
    const { store, fs } = buildStore()
    fs.last = JSON.stringify({
      activeProfileId: 'topstep-50k-xfa',
      ledger: [
        { date: '2026-05-29', equity: 50_500, recordedAt: 0 }, // good
        { date: 'not-a-date', equity: 50_000, recordedAt: 0 }, // bad date
        { date: '2026-05-30', equity: -100,    recordedAt: 0 }, // negative
        { date: '2026-05-31', equity: NaN,     recordedAt: 0 }, // NaN
        { date: '2026-06-01' },                                 // missing fields
      ],
      updatedAt: 0,
    })
    const back = store.load()
    expect(back.ledger).toHaveLength(1)
    expect(back.ledger[0]!.date).toBe('2026-05-29')
  })

  it('drops a non-string activeProfileId', () => {
    const { store, fs } = buildStore()
    fs.last = JSON.stringify({ activeProfileId: 42, ledger: [], updatedAt: 0 })
    expect(store.load().activeProfileId).toBeNull()
  })
})

describe('FundedAccountStore.save', () => {
  it('writes pretty JSON', () => {
    const { store, fs } = buildStore()
    store.save({ activeProfileId: 'x', ledger: [], updatedAt: 0 })
    expect(fs.last).toContain('  ')
    expect(fs.last).toContain('"activeProfileId": "x"')
  })

  it('stamps updatedAt on every save', () => {
    const { store, fs } = buildStore()
    store.save({ activeProfileId: 'x', ledger: [], updatedAt: 0 })
    const parsed = JSON.parse(fs.last!)
    expect(parsed.updatedAt).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 3: Run tests**

```powershell
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app test -- funded-account-store
```
Expected: 7 PASS.

- [ ] **Step 4: Commit**

```bash
git add 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/services/funded-account-store.ts 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/services/funded-account-store.test.ts
git commit -m "feat(funded): FundedAccountStore — atomic JSON persistence + sanitization"
```

---

## Task D.7 — FundedAccountService (Orchestrator)

The single public surface the trading-engine wires to. Owns the active profile, holds the `EquityHWMService` + `EodFlattenService` instances, and produces a `FundedAccountSnapshot` for the renderer.

Responsibilities:
- `setProfile(id)` — activate a profile from the registry (or `null` to deactivate)
- `recordEod(equity, now)` — proxy to `EquityHWMService.recordEod` so callers don't reach past
- `tick(now)` — fires `EodFlattenService.tick`
- `snapshot(currentEquity, now)` — builds the `FundedAccountSnapshot` for IPC push
- `isMllBreached(currentEquity)` — convenience for OrderManager Gate 9
- Persistence wiring — load on construction, save on every profile change + recordEod

**Files:**
- Create: `src/main/services/funded-account.ts`
- Create: `src/main/services/funded-account.test.ts`

- [ ] **Step 1: Write the service**

```ts
/**
 * SATEX — Funded Account Service.
 * Single entry point the trading-engine wires to. Holds the active profile,
 * delegates HWM tracking to EquityHWMService, EOD flatten scheduling to
 * EodFlattenService, and produces the snapshot the renderer reads.
 *
 * Tier-1 Task D.7 from docs/audits/2026-05-28-evidence-audit.md.
 */
import type {
  FundedAccountProfile, FundedAccountSnapshot, EquityHwmLedgerEntry, FlatByConfig,
} from '@shared/funded/types'
import { getProfile as registryGet } from '@shared/funded'
import { EquityHWMService, tradingDayKey } from './equity-hwm'
import { EodFlattenService } from './eod-flatten'
import { FundedAccountStore } from './funded-account-store'
import { createLogger } from './logger'

const log = createLogger('funded-account')

export interface FundedAccountListener {
  (snap: FundedAccountSnapshot): void
}

export interface FundedAccountDeps {
  /** Trading-engine-owned callback that cancels every pending order
   *  and market-flattens every open position. EOD service fires this. */
  onFlatten: (reason: string) => void
  /** Optional store injection for tests. Production uses default file path. */
  store?: FundedAccountStore
}

export class FundedAccountService {
  private profile: FundedAccountProfile | null = null
  private readonly hwm: EquityHWMService
  private readonly eod: EodFlattenService
  private readonly store: FundedAccountStore
  private listeners = new Set<FundedAccountListener>()

  constructor(private readonly deps: FundedAccountDeps) {
    this.store = deps.store ?? new FundedAccountStore()
    this.hwm = new EquityHWMService({
      getProfile: () => this.profile,
      persist: (ledger) => this.persist(ledger),
    })
    this.eod = new EodFlattenService({
      getFlatBy: (): FlatByConfig | null => this.profile?.flatBy ?? null,
      onFlat: (reason) => this.deps.onFlatten(reason),
    })
  }

  /** Restore active profile + ledger from disk. Idempotent. */
  hydrate(): void {
    const stored = this.store.load()
    if (stored.activeProfileId) {
      this.profile = registryGet(stored.activeProfileId)
      if (!this.profile) {
        log.warn('stored profile id no longer exists in registry', { id: stored.activeProfileId })
      }
    }
    this.hwm.hydrate(stored.ledger)
    log.info('funded-account hydrated', {
      profile: this.profile?.id ?? null,
      ledgerEntries: stored.ledger.length,
    })
  }

  /** Activate a profile by id (null to clear). Persists immediately. */
  setProfile(id: string | null): { ok: boolean; reason?: string } {
    if (id === null) {
      this.profile = null
      this.hwm.reset()
      this.eod.reset()
      this.persist(this.hwm.getLedger())
      log.warn('funded-account deactivated')
      this.broadcast()
      return { ok: true }
    }
    const next = registryGet(id)
    if (!next) return { ok: false, reason: `unknown profile id: ${id}` }
    this.profile = next
    this.persist(this.hwm.getLedger())
    log.warn('funded-account activated', { profile: next.id, firm: next.firm })
    this.broadcast()
    return { ok: true }
  }

  /** Return the active profile or null. */
  getProfile(): FundedAccountProfile | null { return this.profile }

  /** Append today's EOD equity to the ledger. No-op when no profile. */
  recordEod(equity: number, now: Date): void {
    this.hwm.recordEod(equity, now)
    this.broadcast()
  }

  /** Tick callback for the per-minute schedule. Drives the EOD service. */
  tick(now: Date): void {
    this.eod.tick(now)
  }

  /** Manual flatten — used by panic button + tests. */
  triggerFlatten(now: Date, reason: string): void {
    this.eod.triggerNow(now, reason)
  }

  /** True when current equity is below the MLL. */
  isMllBreached(currentEquity: number): boolean {
    if (!this.profile) return false
    return currentEquity < this.hwm.computeMll(this.profile)
  }

  /** Snapshot for the renderer push. */
  snapshot(currentEquity: number, now: Date): FundedAccountSnapshot {
    if (!this.profile) {
      return {
        active: false, profile: null,
        highestEodBalance: 0, currentMll: 0, mllLocked: false, mllBuffer: 0,
        today: tradingDayKey(now, 'America/New_York'),
        msToFlatBy: 0, ledger: [], computedAt: now.getTime(),
      }
    }
    const mll = this.hwm.computeMll(this.profile)
    return {
      active: true,
      profile: this.profile,
      highestEodBalance: this.hwm.getHighestEodBalance(),
      currentMll: mll,
      mllLocked: this.hwm.isLocked(this.profile),
      mllBuffer: currentEquity - mll,
      today: tradingDayKey(now, this.profile.flatBy.tz),
      msToFlatBy: this.eod.msToFlatBy(now),
      ledger: this.hwm.getLedger(),
      computedAt: now.getTime(),
    }
  }

  onUpdate(fn: FundedAccountListener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private broadcast(): void {
    // Listeners read currentEquity from the engine's snapshot; here we
    // just signal "state changed, re-snapshot please".
    for (const fn of this.listeners) {
      try { fn(this.snapshot(0, new Date())) }
      catch (e) { log.warn('funded listener threw', { err: String(e) }) }
    }
  }

  private persist(ledger: EquityHwmLedgerEntry[]): void {
    this.store.save({
      activeProfileId: this.profile?.id ?? null,
      ledger,
      updatedAt: Date.now(),
    })
  }
}
```

- [ ] **Step 2: Write the tests**

```ts
import { describe, expect, it } from 'vitest'
import { FundedAccountService } from './funded-account'
import { FundedAccountStore, type FundedAccountStored } from './funded-account-store'

function inMemoryStore(initial?: FundedAccountStored) {
  const state: { value: FundedAccountStored | null } = { value: initial ?? null }
  const store = new FundedAccountStore({
    readFile: () => state.value ? JSON.stringify(state.value) : null,
    writeFile: (_p, d) => { state.value = JSON.parse(d) as FundedAccountStored },
    resolvePath: () => '/tmp/funded.json',
  })
  return { store, state }
}

function buildService(opts?: { initial?: FundedAccountStored }) {
  const flattens: string[] = []
  const { store, state } = inMemoryStore(opts?.initial)
  const svc = new FundedAccountService({
    onFlatten: (r) => flattens.push(r),
    store,
  })
  return { svc, flattens, state }
}

describe('FundedAccountService — activation', () => {
  it('starts with no active profile', () => {
    const { svc } = buildService()
    expect(svc.getProfile()).toBeNull()
  })

  it('activates the Topstep $50K XFA preset by id', () => {
    const { svc } = buildService()
    expect(svc.setProfile('topstep-50k-xfa').ok).toBe(true)
    expect(svc.getProfile()?.id).toBe('topstep-50k-xfa')
  })

  it('rejects unknown profile ids', () => {
    const { svc } = buildService()
    const r = svc.setProfile('nonsense')
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('unknown')
  })

  it('deactivates on setProfile(null), resetting HWM + EOD memory', () => {
    const { svc } = buildService()
    svc.setProfile('topstep-50k-xfa')
    svc.recordEod(51_500, new Date('2026-05-29T20:10:00Z'))
    svc.setProfile(null)
    expect(svc.getProfile()).toBeNull()
    // Re-activating yields a fresh slate.
    svc.setProfile('topstep-50k-xfa')
    const snap = svc.snapshot(50_000, new Date('2026-05-29T20:10:00Z'))
    expect(snap.highestEodBalance).toBe(0)
  })
})

describe('FundedAccountService — hydration', () => {
  it('restores active profile + ledger from store', () => {
    const { svc } = buildService({
      initial: {
        activeProfileId: 'topstep-50k-xfa',
        ledger: [
          { date: '2026-05-27', equity: 50_400, recordedAt: 0 },
          { date: '2026-05-28', equity: 50_900, recordedAt: 0 },
        ],
        updatedAt: 0,
      },
    })
    svc.hydrate()
    expect(svc.getProfile()?.id).toBe('topstep-50k-xfa')
    const snap = svc.snapshot(50_700, new Date('2026-05-29T15:00:00Z'))
    expect(snap.highestEodBalance).toBe(50_900)
  })

  it('survives a stored profile id that no longer exists', () => {
    const { svc } = buildService({
      initial: { activeProfileId: 'retired-profile-id', ledger: [], updatedAt: 0 },
    })
    svc.hydrate()
    expect(svc.getProfile()).toBeNull()
  })
})

describe('FundedAccountService — persistence', () => {
  it('persists activation', () => {
    const { svc, state } = buildService()
    svc.setProfile('topstep-50k-xfa')
    expect(state.value?.activeProfileId).toBe('topstep-50k-xfa')
  })

  it('persists every recordEod', () => {
    const { svc, state } = buildService()
    svc.setProfile('topstep-50k-xfa')
    svc.recordEod(51_000, new Date('2026-05-29T20:10:00Z'))
    expect(state.value?.ledger).toHaveLength(1)
    expect(state.value?.ledger[0]!.equity).toBe(51_000)
  })
})

describe('FundedAccountService — MLL breach + snapshot', () => {
  it('isMllBreached false when equity is above MLL', () => {
    const { svc } = buildService()
    svc.setProfile('topstep-50k-xfa')
    // Brand-new: MLL = 50k - 2k = 48k. Equity 49k > MLL.
    expect(svc.isMllBreached(49_000)).toBe(false)
  })

  it('isMllBreached true when equity drops below MLL', () => {
    const { svc } = buildService()
    svc.setProfile('topstep-50k-xfa')
    expect(svc.isMllBreached(47_999)).toBe(true)
  })

  it('snapshot reflects locked MLL once HWM crosses threshold', () => {
    const { svc } = buildService()
    svc.setProfile('topstep-50k-xfa')
    svc.recordEod(51_500, new Date('2026-05-29T20:10:00Z'))
    const snap = svc.snapshot(51_500, new Date('2026-05-29T20:15:00Z'))
    expect(snap.mllLocked).toBe(true)
    expect(snap.currentMll).toBe(50_000)
    expect(snap.mllBuffer).toBe(1_500)
  })

  it('snapshot includes today date key in profile tz', () => {
    const { svc } = buildService()
    svc.setProfile('topstep-50k-xfa')
    const snap = svc.snapshot(50_000, new Date('2026-05-29T20:15:00Z'))
    expect(snap.today).toBe('2026-05-29')
  })

  it('snapshot returns inert shape when no profile is active', () => {
    const { svc } = buildService()
    const snap = svc.snapshot(50_000, new Date('2026-05-29T15:00:00Z'))
    expect(snap.active).toBe(false)
    expect(snap.profile).toBeNull()
  })
})

describe('FundedAccountService — EOD wiring', () => {
  it('tick at cutoff fires the wired onFlatten callback', () => {
    const { svc, flattens } = buildService()
    svc.setProfile('topstep-50k-xfa')
    svc.tick(new Date('2026-05-29T20:15:00Z')) // 16:15 ET, past Topstep cutoff
    expect(flattens).toHaveLength(1)
    expect(flattens[0]).toBe('eod-2026-05-29')
  })

  it('triggerFlatten fires immediately with the supplied reason', () => {
    const { svc, flattens } = buildService()
    svc.setProfile('topstep-50k-xfa')
    svc.triggerFlatten(new Date('2026-05-29T10:00:00Z'), 'panic')
    expect(flattens).toEqual(['panic'])
  })

  it('no flatten when no profile is active', () => {
    const { svc, flattens } = buildService()
    svc.tick(new Date('2026-05-29T20:15:00Z'))
    expect(flattens).toHaveLength(0)
  })
})
```

- [ ] **Step 3: Run tests**

```powershell
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app test -- funded-account
```
Expected: 14 PASS in funded-account.test.ts (+ 7 already from funded-account-store).

- [ ] **Step 4: Commit**

```bash
git add 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/services/funded-account.ts 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/services/funded-account.test.ts
git commit -m "feat(funded): FundedAccountService — orchestrator + snapshot for the renderer"
```

---

## Task D.8 — OrderManager Integration (Gates 9–13)

Extends `OrderValidationContext` with funded-account fields and adds five new gates inside `OrderManager.validate`. Existing 9 gates are unchanged — Gate ordering matters; new gates fire **after** the existing risk checks (so a fresh-account stale-quote / kill-switch still wins) but **before** notional cap / tactics (so a Topstep rule trips with the specific Topstep reason).

Final gate order:
0. quote freshness · 1. kill switch · 2. market closed · 3. daily-loss · 4. max positions · 5. concentration · 6. buying power · **9. trailing MaxDD** · **10. news blackout** · **11. max contracts** · **12. post-EOD-flat** · **13. allowed asset class** · 7. notional cap · 8. tactics.

(Renumbered conceptually — keep the existing "gate" string identifiers for backwards compatibility.)

**Files:**
- Modify: `src/main/services/order-manager.ts`
- Modify: `src/main/services/order-manager.test.ts`

- [ ] **Step 1: Extend OrderValidationContext**

In `src/main/services/order-manager.ts`, replace the existing `OrderValidationContext` interface with this version (additions marked `// NEW (Tier-1)`):

```ts
import type { FundedAccountProfile } from '@shared/funded/types'
import type { MacroEvent, MacroImpact } from '@shared/types'
import { checkAllowedAssetClass, checkMaxContracts } from '@shared/funded/checks'
import { isInBlackout } from './blackout-window'
import { isPastFlatBy } from './eod-flatten'

export interface OrderValidationContext {
  refPrice: number
  refPriceAge?: number
  liveMode: boolean
  notionalCap: number
  tacticsGate?: (signalConfidence: number) => { ok: boolean; reason?: string }
  signalConfidence?: number
  assetClass?: 'equity' | 'index' | 'future' | 'crypto'
  // ── NEW (Tier-1, 2026-05-29) ────────────────────────────────────────────
  /** Active funded-account profile. Undefined = no overlay → gates 9-13
   *  skipped. */
  fundedProfile?: FundedAccountProfile
  /** Current Maximum Loss Limit in dollars (from EquityHWMService.computeMll). */
  fundedMll?: number
  /** Worst-case loss if this order's stop-loss is hit, in dollars. The
   *  trading-engine computes (entryPrice - stopLoss) × qty for longs,
   *  mirror for shorts; if no stop is set, this is undefined and Gate 9
   *  falls back to checking current equity only. */
  worstCaseLossDollar?: number
  /** Signed quantity of the EXISTING position in this symbol (positive
   *  long, negative short, 0 flat). Used by Gate 11. */
  currentPositionQty?: number
  /** Latest macro events (from MacroCalendarService.get().events). Gate 10
   *  filters by profile.newsBlackoutImpacts. */
  macroEvents?: MacroEvent[]
  /** Wall-clock used for tz-aware checks (blackout, EOD). Defaults to
   *  Date.now() in the validator when undefined. */
  nowMs?: number
}
```

- [ ] **Step 2: Add the five new gates inside `validate()`**

In `OrderManager.validate`, AFTER Gate 6 (buying power) and BEFORE Gate 7 (live-mode notional cap), insert the five new gates. The full updated section:

```ts
    if (req.side === 'buy' || req.side === 'sell') {
      const refPrice = ctx?.refPrice && ctx.refPrice > 0 ? ctx.refPrice : (this.account.equity / Math.max(1, req.quantity))
      const notional = refPrice * req.quantity

      // Existing gates 4-6 (max-positions, concentration, buying-power) only
      // run for buys. Tier-1 gates 9-13 run for BOTH sides because Topstep
      // counts losses + positions regardless of direction.
      if (req.side === 'buy') {
        // Gate 4: max open positions
        const openCount = this.positions.size
        if (openCount >= MAX_OPEN_POSITIONS && !this.positions.has(req.symbol))
          return { ok: false, reason: `Max open positions (${MAX_OPEN_POSITIONS}) reached`, gate: 'max-positions' }

        // Gate 5: concentration
        const concentration = notional / Math.max(1, this.account.equity)
        if (concentration > MAX_POSITION_CONCENTRATION)
          return { ok: false, reason: `Position concentration ${(concentration * 100).toFixed(1)}% > ${(MAX_POSITION_CONCENTRATION * 100).toFixed(0)}%`, gate: 'concentration' }

        // Gate 6: buying power
        if (notional > this.account.buyingPower)
          return { ok: false, reason: 'Insufficient buying power', gate: 'buying-power' }
      }

      // ── Tier-1 funded-account gates (9-13) ──────────────────────────────
      if (ctx?.fundedProfile) {
        const profile = ctx.fundedProfile
        const nowMs = ctx.nowMs ?? Date.now()

        // Gate 9: trailing MaxDD. If the worst-case stop loss would drop
        // equity below MLL, refuse. When worstCaseLossDollar is missing,
        // fall back to checking current equity directly (a bare market
        // order with no stop is risk-unbounded; trading-engine attaches
        // worstCase whenever a stop is present).
        if (typeof ctx.fundedMll === 'number') {
          const projectedEquity = this.account.equity - (ctx.worstCaseLossDollar ?? 0)
          if (projectedEquity < ctx.fundedMll) {
            return {
              ok: false,
              reason: `Trailing MaxDD breach — would drop equity to ${projectedEquity.toFixed(0)} vs MLL ${ctx.fundedMll.toFixed(0)}`,
              gate: 'funded-mll',
            }
          }
        }

        // Gate 10: news blackout
        if (ctx.macroEvents && profile.newsBlackoutImpacts.length > 0) {
          const bl = isInBlackout(nowMs, ctx.macroEvents, profile.newsBlackoutImpacts, profile.newsBlackoutWindowMs)
          if (bl.inBlackout) {
            const direction = (bl.msToEvent ?? 0) >= 0 ? 'before' : 'after'
            const seconds = Math.abs(Math.round((bl.msToEvent ?? 0) / 1000))
            return {
              ok: false,
              reason: `News blackout — ${bl.triggeringEvent?.label ?? 'event'} (${seconds}s ${direction})`,
              gate: 'funded-blackout',
            }
          }
        }

        // Gate 11: max contracts. Existing position quantity defaults to
        // OrderManager's own position state when ctx doesn't supply it.
        const existingQty = ctx.currentPositionQty ?? (this.positions.get(req.symbol)?.quantity ?? 0)
        const mc = checkMaxContracts(req.symbol, req.side, req.quantity, existingQty, profile)
        if (!mc.ok) {
          return {
            ok: false,
            reason: `Position size cap — ${req.symbol} resulting abs ${mc.resultingAbs} > cap ${mc.cap}`,
            gate: 'funded-max-contracts',
          }
        }

        // Gate 12: post-EOD-flat. No NEW entries after the configured
        // flat-by time. Closing trades are still allowed even after the
        // cutoff (they reduce risk; cap not relevant).
        const opening = existingQty === 0
          || (existingQty > 0 && req.side === 'buy')
          || (existingQty < 0 && req.side === 'sell')
        if (opening && isPastFlatBy(new Date(nowMs), profile.flatBy)) {
          return {
            ok: false,
            reason: `Post-EOD cutoff — flat-by ${profile.flatBy.hour}:${String(profile.flatBy.minute).padStart(2, '0')} ${profile.flatBy.tz} passed`,
            gate: 'funded-eod',
          }
        }

        // Gate 13: asset class allowed
        if (ctx.assetClass && !checkAllowedAssetClass(ctx.assetClass, profile)) {
          return {
            ok: false,
            reason: `Asset class '${ctx.assetClass}' not allowed by ${profile.name}`,
            gate: 'funded-asset-class',
          }
        }
      }

      // Gate 7: live-mode notional cap (only on buys, preserving prior shape)
      if (req.side === 'buy' && ctx?.liveMode && ctx.notionalCap > 0 && notional > ctx.notionalCap)
        return { ok: false, reason: `Notional $${notional.toFixed(0)} exceeds live cap $${ctx.notionalCap}`, gate: 'notional-cap' }

      // Gate 8: MAY-TACTICS (entry orders only)
      if (req.side === 'buy' && ctx?.tacticsGate) {
        const verdict = ctx.tacticsGate(ctx.signalConfidence ?? 0.5)
        if (!verdict.ok) return { ok: false, reason: verdict.reason ?? 'Tactics veto', gate: 'tactics' }
      }
    }

    return { ok: true }
```

- [ ] **Step 3: Add `cancelAllOrders` + `flattenAllPositions` public methods**

Inside the `OrderManager` class, after the existing `cancelOrder` method:

```ts
  /** Cancel every pending order. Used by the EOD flatten and the panic
   *  button. Each cancelled order fires the fill-callback with `null`
   *  position so listeners can update accordingly. */
  cancelAllOrders(): number {
    let count = 0
    for (const order of Array.from(this.orders.values())) {
      if (order.status !== 'pending') continue
      order.status = 'canceled'
      log.info('order canceled by cancelAll', { id: order.id, traceId: order.traceId })
      for (const cb of this.fillCbs) cb(order, null)
      count++
    }
    return count
  }

  /** Market-flatten every open position. Caller supplies a getQuote so the
   *  fill price reflects the current market. Each fill triggers applyFill
   *  exactly as a normal close would. Returns the number of positions
   *  flattened. */
  flattenAllPositions(getQuote: (symbol: string) => { last: number } | undefined): number {
    let count = 0
    for (const pos of Array.from(this.positions.values())) {
      const quote = getQuote(pos.symbol)
      const fillPrice = quote?.last ?? pos.avgPrice
      const side: 'buy' | 'sell' = pos.quantity > 0 ? 'sell' : 'buy'
      const qty = Math.abs(pos.quantity)
      // Build a synthetic close order — same path as a normal exit.
      const closeOrder = this.createOrder(
        { symbol: pos.symbol, side, type: 'market', quantity: qty, source: 'eod-flatten' },
        'pending',
      )
      this.fillOrder(closeOrder.id, fillPrice)
      count++
    }
    return count
  }
```

- [ ] **Step 4: Write the new-gate tests**

In `src/main/services/order-manager.test.ts`, append a new `describe` block:

```ts
import { TOPSTEP_50K_XFA } from '@shared/funded/topstep-50k-xfa'
import type { MacroEvent } from '@shared/types'

describe('OrderManager — Tier-1 Topstep gates (D.8)', () => {
  function fundedCtx(over?: Partial<OrderValidationContext>): OrderValidationContext {
    return {
      refPrice: 100,
      refPriceAge: 100,
      liveMode: false,
      notionalCap: 1_000_000,
      assetClass: 'equity',
      fundedProfile: TOPSTEP_50K_XFA,
      fundedMll: 48_000, // baseline for a brand-new $50K account
      worstCaseLossDollar: 0,
      currentPositionQty: 0,
      macroEvents: [],
      nowMs: Date.parse('2026-05-29T15:00:00Z'), // 11am ET, before cutoff
      ...over,
    }
  }

  describe('Gate 9 — trailing MaxDD', () => {
    it('passes when worst-case loss keeps equity above MLL', () => {
      const om = new OrderManager(50_000)
      om.setMarketOpen(true)
      const ctx = fundedCtx({ worstCaseLossDollar: 1_000 }) // 50k - 1k = 49k > 48k MLL
      expect(om.validate(baseBuy(), ctx).ok).toBe(true)
    })

    it('rejects when worst-case loss would breach MLL', () => {
      const om = new OrderManager(50_000)
      om.setMarketOpen(true)
      const ctx = fundedCtx({ worstCaseLossDollar: 2_500 }) // 50k - 2.5k = 47.5k < 48k MLL
      const r = om.validate(baseBuy(), ctx)
      expect(r.ok).toBe(false)
      expect(r.gate).toBe('funded-mll')
    })
  })

  describe('Gate 10 — news blackout', () => {
    const nowMs = Date.parse('2026-05-29T13:30:00Z')
    function evt(offsetSec: number, impact: 'high' | 'med' = 'high'): MacroEvent {
      return {
        id: 'cpi', label: 'US CPI', cons: '+0.2%', actual: '—', impact,
        tsUtc: new Date(nowMs + offsetSec * 1000).toISOString(),
      }
    }

    it('passes when no events are in the ±60s window', () => {
      const om = new OrderManager(50_000)
      om.setMarketOpen(true)
      const ctx = fundedCtx({ nowMs, macroEvents: [evt(300)] })
      expect(om.validate(baseBuy(), ctx).ok).toBe(true)
    })

    it('rejects when a high-impact event is inside the window', () => {
      const om = new OrderManager(50_000)
      om.setMarketOpen(true)
      const ctx = fundedCtx({ nowMs, macroEvents: [evt(30)] })
      const r = om.validate(baseBuy(), ctx)
      expect(r.ok).toBe(false)
      expect(r.gate).toBe('funded-blackout')
      expect(r.reason).toContain('CPI')
    })

    it('ignores med-impact events for the Topstep profile (high-only blackout)', () => {
      const om = new OrderManager(50_000)
      om.setMarketOpen(true)
      const ctx = fundedCtx({ nowMs, macroEvents: [evt(30, 'med')] })
      expect(om.validate(baseBuy(), ctx).ok).toBe(true)
    })
  })

  describe('Gate 11 — max contracts', () => {
    it('AAPL (unlisted) → buy 1 → OK at default cap', () => {
      const om = new OrderManager(50_000)
      om.setMarketOpen(true)
      expect(om.validate(baseBuy({ symbol: 'AAPL', quantity: 1 }), fundedCtx()).ok).toBe(true)
    })

    it('AAPL → buy 2 → REJECT (default cap = 1)', () => {
      const om = new OrderManager(50_000)
      om.setMarketOpen(true)
      const r = om.validate(baseBuy({ symbol: 'AAPL', quantity: 2 }), fundedCtx())
      expect(r.ok).toBe(false)
      expect(r.gate).toBe('funded-max-contracts')
    })

    it('ES (cap 5) → buy 5 → OK', () => {
      const om = new OrderManager(50_000)
      om.setMarketOpen(true)
      expect(om.validate(baseBuy({ symbol: 'ES', quantity: 5 }), fundedCtx()).ok).toBe(true)
    })

    it('ES → buy 6 → REJECT', () => {
      const om = new OrderManager(50_000)
      om.setMarketOpen(true)
      expect(om.validate(baseBuy({ symbol: 'ES', quantity: 6 }), fundedCtx()).gate).toBe('funded-max-contracts')
    })
  })

  describe('Gate 12 — post-EOD-flat', () => {
    it('rejects new BUY entries after 4:10 PM ET', () => {
      const om = new OrderManager(50_000)
      om.setMarketOpen(true)
      const ctx = fundedCtx({ nowMs: Date.parse('2026-05-29T20:15:00Z') }) // 16:15 ET
      const r = om.validate(baseBuy({ symbol: 'ES' }), ctx)
      expect(r.ok).toBe(false)
      expect(r.gate).toBe('funded-eod')
    })

    it('allows closing SELL (long → exit) after the cutoff', () => {
      const om = new OrderManager(50_000)
      om.setMarketOpen(true)
      const ctx = fundedCtx({
        nowMs: Date.parse('2026-05-29T20:15:00Z'),
        currentPositionQty: 3, // long 3
      })
      expect(om.validate(baseSell({ symbol: 'ES', quantity: 3 }), ctx).ok).toBe(true)
    })

    it('rejects new SELL (short opening) after the cutoff', () => {
      const om = new OrderManager(50_000)
      om.setMarketOpen(true)
      const ctx = fundedCtx({
        nowMs: Date.parse('2026-05-29T20:15:00Z'),
        currentPositionQty: 0, // flat → sell would open short
      })
      const r = om.validate(baseSell({ symbol: 'ES', quantity: 1 }), ctx)
      expect(r.ok).toBe(false)
      expect(r.gate).toBe('funded-eod')
    })
  })

  describe('Gate 13 — allowed asset class', () => {
    it('equity allowed (overlay default)', () => {
      const om = new OrderManager(50_000)
      om.setMarketOpen(true)
      expect(om.validate(baseBuy(), fundedCtx({ assetClass: 'equity' })).ok).toBe(true)
    })

    it('index rejected (not in Topstep overlay list)', () => {
      const om = new OrderManager(50_000)
      om.setMarketOpen(true)
      const r = om.validate(baseBuy(), fundedCtx({ assetClass: 'index' }))
      expect(r.ok).toBe(false)
      expect(r.gate).toBe('funded-asset-class')
    })
  })

  describe('No-profile bypass', () => {
    it('skips every Tier-1 gate when fundedProfile is undefined', () => {
      const om = new OrderManager(50_000)
      om.setMarketOpen(true)
      const ctx: OrderValidationContext = {
        refPrice: 100, refPriceAge: 100, liveMode: false,
        notionalCap: 1_000_000, assetClass: 'equity',
        // No fundedProfile — every Tier-1 gate must be inert.
      }
      expect(om.validate(baseBuy({ symbol: 'AAPL', quantity: 999 }), ctx).ok).toBe(true)
    })
  })
})

describe('OrderManager — cancelAllOrders + flattenAllPositions', () => {
  it('cancelAllOrders cancels every pending order and reports the count', () => {
    const om = new OrderManager(100_000)
    om.createOrder({ symbol: 'NVDA', side: 'buy', type: 'market', quantity: 1 })
    om.createOrder({ symbol: 'AAPL', side: 'buy', type: 'market', quantity: 1 })
    const n = om.cancelAllOrders()
    expect(n).toBe(2)
    for (const o of om.getOrders()) expect(o.status).toBe('canceled')
  })

  it('flattenAllPositions market-closes every open position', () => {
    const om = new OrderManager(100_000)
    // Open via the normal fill path so position state is consistent.
    const buy = om.createOrder({ symbol: 'NVDA', side: 'buy', type: 'market', quantity: 10 })
    om.fillOrder(buy.id, 100)
    expect(om.getAccount().openPositions).toHaveLength(1)
    const n = om.flattenAllPositions(() => ({ last: 102 }))
    expect(n).toBe(1)
    expect(om.getAccount().openPositions).toHaveLength(0)
  })
})
```

- [ ] **Step 5: Run tests**

```powershell
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app test -- order-manager
```
Expected: existing OM tests still pass + ~18 new Tier-1 tests.

- [ ] **Step 6: Commit**

```bash
git add 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/services/order-manager.ts 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/services/order-manager.test.ts
git commit -m "feat(funded): OrderManager gates 9-13 + cancelAll/flattenAll"
```

---

## Task D.9 — RiskGatesService Display Gates

The existing `RiskGatesService` produces a `RiskGatesSnapshot { gates: RiskGate[] }`. The renderer's `RiskGatePanel` iterates the array and renders each gate's `label`, `pct`, `status`, `value` — completely data-driven. So adding new gates here lights up the panel with zero UI changes.

Five new gates:
- `TRAILING_MAXDD` — distance from current equity to MLL as a fraction of `trailingMaxDrawdown` (1.0 = exactly AT MLL = breach)
- `MLL_BUFFER` — same data, dollar value for the panel string
- `NEWS_BLACKOUT` — 1.0 if blackout active, 0.0 otherwise; value shows the next/last event + time
- `MAX_CONTRACTS` — across all open positions, the worst (current/cap) ratio
- `EOD_COUNTDOWN` — fraction of trading-day complete based on flat-by; value shows countdown

When no profile is active these five gates render with `status: 'OK'` and `value: 'n/a · no profile'` (similar to the existing CORRELATION pattern when there's not enough data).

**Files:**
- Modify: `src/main/services/risk-gates.ts`
- Modify: `src/main/services/risk-gates.test.ts`
- Modify: `src/shared/types.ts` — extend `RiskGate.key` union

- [ ] **Step 1: Extend the RiskGate key union**

In `src/shared/types.ts`, find `export type RiskGateKey = '...'` (or wherever the gate keys are typed; if it's a string literal union inside `RiskGate`, extend that). Add the five new key strings:

```ts
// New keys to add to whatever union currently lists DAILY_LOSS_LIMIT, POSITION_COUNT, etc.:
//   'TRAILING_MAXDD'
//   'MLL_BUFFER'
//   'NEWS_BLACKOUT'
//   'MAX_CONTRACTS'
//   'EOD_COUNTDOWN'
```

Concrete edit — locate the existing `key` field on `RiskGate` and update to:

```ts
export type RiskGateKey =
  | 'DAILY_LOSS_LIMIT' | 'POSITION_COUNT' | 'CONCENTRATION'
  | 'GROSS_LEVERAGE'   | 'CORRELATION'    | 'SESSION_VAR'
  | 'TRAILING_MAXDD'   | 'MLL_BUFFER'     | 'NEWS_BLACKOUT'
  | 'MAX_CONTRACTS'    | 'EOD_COUNTDOWN'

export interface RiskGate {
  key:    RiskGateKey
  label:  string
  pct:    number
  status: RiskGateStatus
  value:  string
}
```

(If `RiskGateKey` doesn't exist as a named alias yet — the field is just `key: string` — replace `key: string` with `key: RiskGateKey` and add the alias as shown.)

- [ ] **Step 2: Extend the RiskGatesService deps interface**

In `src/main/services/risk-gates.ts`, extend the `RiskGatesDeps` interface:

```ts
import type { FundedAccountSnapshot } from '@shared/funded/types'
import type { BlackoutResult } from './blackout-window'

export interface RiskGatesDeps {
  getAccount:    () => Account
  getQuote:      (symbol: string) => Quote | undefined
  getCandles:    (symbol: string, limit?: number) => Candle[]
  getPnlSnapshots: () => PnlSnapshot[]
  getSessionStartEquity: () => number
  // ── NEW (Tier-1) ────────────────────────────────────────────────────────
  /** Active funded account snapshot, or null if no profile active.
   *  Computed by FundedAccountService.snapshot(currentEquity, now). */
  getFundedSnapshot?: (currentEquity: number, now: Date) => FundedAccountSnapshot | null
  /** Current news-blackout result, or null if no profile.
   *  Computed by MacroCalendarService.checkBlackout with the active
   *  profile's impacts + window. */
  getBlackout?: () => BlackoutResult | null
}
```

- [ ] **Step 3: Extend the compute() method with the five new gates**

Inside `RiskGatesService.compute()`, AFTER the SESSION_VAR gate construction and BEFORE the `const gates: RiskGate[] = [...]` assembly, add:

```ts
    // ── Tier-1 funded-account display gates ──────────────────────────────
    const fundedSnap = this.deps.getFundedSnapshot?.(account.equity, new Date()) ?? null
    const blackout   = this.deps.getBlackout?.() ?? null

    let trailingMaxDdPct = 0
    let trailingMaxDdStatus: RiskGateStatus = 'OK'
    let trailingMaxDdValue = 'n/a · no profile'
    let mllBufferValue = 'n/a · no profile'
    let newsBlackoutPct = 0
    let newsBlackoutStatus: RiskGateStatus = 'OK'
    let newsBlackoutValue = 'n/a · no profile'
    let maxContractsPct = 0
    let maxContractsStatus: RiskGateStatus = 'OK'
    let maxContractsValue = 'n/a · no profile'
    let eodCountdownPct = 0
    let eodCountdownStatus: RiskGateStatus = 'OK'
    let eodCountdownValue = 'n/a · no profile'

    if (fundedSnap?.active && fundedSnap.profile) {
      const profile = fundedSnap.profile

      // TRAILING_MAXDD: pct of the trailingMaxDrawdown buffer that's been used.
      // buffer used = trailingMaxDrawdown − (currentEquity − MLL)
      const buffer = fundedSnap.mllBuffer
      const drawdownAllowance = profile.trailingMaxDrawdown
      const used = Math.max(0, drawdownAllowance - buffer)
      trailingMaxDdPct = Math.min(1, used / Math.max(1, drawdownAllowance))
      trailingMaxDdStatus = statusForPct(trailingMaxDdPct, 0.5, 0.9)
      trailingMaxDdValue = `−$${used.toFixed(0)} / $${drawdownAllowance.toFixed(0)} buf${fundedSnap.mllLocked ? ' · locked' : ''}`

      // MLL_BUFFER: literal dollar buffer.
      mllBufferValue = buffer >= 0
        ? `$${Math.round(buffer).toLocaleString()} above MLL ($${Math.round(fundedSnap.currentMll).toLocaleString()})`
        : `BREACHED — $${Math.round(-buffer).toLocaleString()} below MLL`

      // NEWS_BLACKOUT: 1.0 when in blackout, 0.0 otherwise.
      if (blackout?.inBlackout) {
        newsBlackoutPct = 1
        newsBlackoutStatus = 'BREACH'
        const direction = (blackout.msToEvent ?? 0) >= 0 ? 'before' : 'after'
        const seconds = Math.abs(Math.round((blackout.msToEvent ?? 0) / 1000))
        newsBlackoutValue = `${blackout.triggeringEvent?.label ?? 'event'} · ${seconds}s ${direction}`
      } else {
        newsBlackoutValue = `clear · ${profile.newsBlackoutImpacts.join('+') || '∅'} impact · ±${Math.round(profile.newsBlackoutWindowMs / 1000)}s`
      }

      // MAX_CONTRACTS: worst current/cap ratio across all open positions.
      let worstRatio = 0
      let worstSymbol = '—'
      for (const p of account.openPositions) {
        const cap = profile.maxContracts[p.symbol] ?? profile.defaultMaxContracts
        const ratio = Math.abs(p.quantity) / Math.max(1, cap)
        if (ratio > worstRatio) {
          worstRatio = ratio
          worstSymbol = p.symbol
        }
      }
      maxContractsPct = Math.min(1, worstRatio)
      maxContractsStatus = statusForPct(maxContractsPct, 0.8, 1.0)
      maxContractsValue = account.openPositions.length === 0
        ? `0 / — (no positions)`
        : `${worstSymbol} ${Math.round(worstRatio * 100)}% of cap`

      // EOD_COUNTDOWN: ms-to-flatby normalized against the session length.
      const ms = fundedSnap.msToFlatBy
      const totalSessionMs = 6.5 * 3600_000 // standard US equity session length as a normalization base
      eodCountdownPct = Math.max(0, Math.min(1, 1 - (ms / totalSessionMs)))
      eodCountdownStatus = ms < 15 * 60_000 ? 'BREACH'
                         : ms < 60 * 60_000 ? 'WATCH'
                         : 'OK'
      eodCountdownValue = ms <= 0
        ? `EOD passed (${profile.flatBy.hour}:${String(profile.flatBy.minute).padStart(2, '0')} ${profile.flatBy.tz})`
        : `T-${Math.floor(ms / 60_000)}m to ${profile.flatBy.hour}:${String(profile.flatBy.minute).padStart(2, '0')}`
    }
```

Then update the `gates` array literal to append the five new gates:

```ts
    const gates: RiskGate[] = [
      // existing 6 gates: DAILY_LOSS_LIMIT, POSITION_COUNT, CONCENTRATION,
      // GROSS_LEVERAGE, CORRELATION, SESSION_VAR — unchanged.
      { key: 'DAILY_LOSS_LIMIT', label: 'DAILY LOSS LIMIT',  pct: dailyLossPct,  status: dailyLossStatus, value: dailyLossValue },
      { key: 'POSITION_COUNT',   label: 'POSITION COUNT',    pct: posPct,        status: posStatus,       value: posValue },
      { key: 'CONCENTRATION',    label: 'CONCENTRATION',     pct: concPct,       status: concStatus,      value: concValue },
      { key: 'GROSS_LEVERAGE',   label: 'GROSS LEVERAGE',    pct: grossPct,      status: grossStatus,     value: grossValue },
      { key: 'CORRELATION',      label: 'CORRELATION ρ̄',    pct: corrPct,       status: corrStatus,      value: corrValue },
      { key: 'SESSION_VAR',      label: 'SESSION VAR (95%)', pct: varPct,        status: varStatus,       value: varValue },
      // ── Tier-1 funded-account gates ─────────────────────────────────────
      { key: 'TRAILING_MAXDD',   label: 'TRAILING MaxDD',    pct: trailingMaxDdPct, status: trailingMaxDdStatus, value: trailingMaxDdValue },
      { key: 'MLL_BUFFER',       label: 'MLL BUFFER',        pct: trailingMaxDdPct, status: trailingMaxDdStatus, value: mllBufferValue },
      { key: 'NEWS_BLACKOUT',    label: 'NEWS BLACKOUT',     pct: newsBlackoutPct,  status: newsBlackoutStatus,  value: newsBlackoutValue },
      { key: 'MAX_CONTRACTS',    label: 'MAX CONTRACTS',     pct: maxContractsPct,  status: maxContractsStatus,  value: maxContractsValue },
      { key: 'EOD_COUNTDOWN',    label: 'EOD COUNTDOWN',     pct: eodCountdownPct,  status: eodCountdownStatus,  value: eodCountdownValue },
    ]
```

- [ ] **Step 4: Extend the test file**

Append to `src/main/services/risk-gates.test.ts`:

```ts
import { TOPSTEP_50K_XFA } from '@shared/funded/topstep-50k-xfa'

describe('RiskGatesService — Tier-1 display gates', () => {
  function build(over?: {
    fundedSnap?: ReturnType<typeof makeFundedSnap> | null
    blackout?: { inBlackout: boolean; triggeringEvent: { label: string } | null; msToEvent: number | null } | null
  }) {
    return new RiskGatesService({
      getAccount: () => ({
        equity: 50_500, cash: 50_500, buyingPower: 200_000,
        openPositions: [], dailyPnl: 500, dailyLossLimitPct: 0.02,
        mode: 'paper' as const, killSwitchArmed: false, sessionStartedAt: 0,
      }),
      getQuote: () => undefined,
      getCandles: () => [],
      getPnlSnapshots: () => [],
      getSessionStartEquity: () => 50_000,
      getFundedSnapshot: over?.fundedSnap === null ? undefined : (() => over?.fundedSnap ?? makeFundedSnap()),
      getBlackout: over?.blackout === null ? undefined : (() => over?.blackout ?? { inBlackout: false, triggeringEvent: null, msToEvent: null }),
    })
  }

  function makeFundedSnap(over?: Partial<ReturnType<typeof base>>) {
    function base() {
      return {
        active: true, profile: TOPSTEP_50K_XFA,
        highestEodBalance: 50_000, currentMll: 48_000, mllLocked: false,
        mllBuffer: 2_500,
        today: '2026-05-29',
        msToFlatBy: 4 * 3600_000, // 4 hours away
        ledger: [], computedAt: Date.now(),
      }
    }
    return { ...base(), ...over }
  }

  it('emits all 11 gates (6 existing + 5 new)', () => {
    const svc = build()
    const snap = svc.get()
    expect(snap.gates).toHaveLength(11)
    const keys = snap.gates.map(g => g.key)
    expect(keys).toContain('TRAILING_MAXDD')
    expect(keys).toContain('MLL_BUFFER')
    expect(keys).toContain('NEWS_BLACKOUT')
    expect(keys).toContain('MAX_CONTRACTS')
    expect(keys).toContain('EOD_COUNTDOWN')
  })

  it('TRAILING_MAXDD pct reflects buffer used / drawdown allowance', () => {
    const snap = build({ fundedSnap: makeFundedSnap({ mllBuffer: 500 }) }).get()
    const t = snap.gates.find(g => g.key === 'TRAILING_MAXDD')!
    // used = 2000 - 500 = 1500. pct = 1500/2000 = 0.75.
    expect(t.pct).toBeCloseTo(0.75, 4)
    expect(t.status).toBe('WATCH')
  })

  it('NEWS_BLACKOUT pct=1 + BREACH status when in blackout', () => {
    const snap = build({
      blackout: { inBlackout: true, triggeringEvent: { label: 'US CPI' }, msToEvent: 30_000 },
    }).get()
    const n = snap.gates.find(g => g.key === 'NEWS_BLACKOUT')!
    expect(n.pct).toBe(1)
    expect(n.status).toBe('BREACH')
    expect(n.value).toContain('US CPI')
    expect(n.value).toContain('30s before')
  })

  it('MLL_BUFFER shows BREACHED string when buffer is negative', () => {
    const snap = build({ fundedSnap: makeFundedSnap({ mllBuffer: -500 }) }).get()
    const m = snap.gates.find(g => g.key === 'MLL_BUFFER')!
    expect(m.value).toContain('BREACHED')
  })

  it('EOD_COUNTDOWN flips to BREACH inside last 15 min', () => {
    const snap = build({ fundedSnap: makeFundedSnap({ msToFlatBy: 10 * 60_000 }) }).get()
    const e = snap.gates.find(g => g.key === 'EOD_COUNTDOWN')!
    expect(e.status).toBe('BREACH')
    expect(e.value).toContain('T-10m')
  })

  it('all 5 funded gates show "n/a · no profile" when fundedSnap is null', () => {
    const svc = new RiskGatesService({
      getAccount: () => ({
        equity: 50_000, cash: 50_000, buyingPower: 200_000,
        openPositions: [], dailyPnl: 0, dailyLossLimitPct: 0.02,
        mode: 'paper' as const, killSwitchArmed: false, sessionStartedAt: 0,
      }),
      getQuote: () => undefined,
      getCandles: () => [],
      getPnlSnapshots: () => [],
      getSessionStartEquity: () => 50_000,
      getFundedSnapshot: () => null,
    })
    const snap = svc.get()
    for (const key of ['TRAILING_MAXDD', 'MLL_BUFFER', 'NEWS_BLACKOUT', 'MAX_CONTRACTS', 'EOD_COUNTDOWN'] as const) {
      const g = snap.gates.find(g2 => g2.key === key)!
      expect(g.value).toContain('n/a')
    }
  })
})
```

- [ ] **Step 5: Run tests**

```powershell
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app test -- risk-gates
```
Expected: existing 10 risk-gates tests + 6 new = 16 PASS.

- [ ] **Step 6: Commit**

```bash
git add 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/services/risk-gates.ts 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/services/risk-gates.test.ts 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/shared/types.ts
git commit -m "feat(funded): RiskGatesService display gates (TRAILING_MAXDD / MLL_BUFFER / NEWS_BLACKOUT / MAX_CONTRACTS / EOD_COUNTDOWN)"
```

---

## Task D.10 — Trading-Engine + IPC + Preload Wiring

Stitches everything together so the rules actually fire at runtime. Construct `FundedAccountService` at boot, hydrate from disk, populate `OrderValidationContext` with funded fields on every `submitOrder`, wire the EOD callback to `OrderManager.cancelAllOrders + flattenAllPositions`, expose IPC for the renderer to read/set the active profile.

**Files:**
- Modify: `src/main/core/trading-engine.ts`
- Modify: `src/main/index.ts` (IPC handler registration)
- Modify: `src/shared/ipc-channels.ts`
- Modify: `src/shared/ipc-schemas.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Add IPC channel constants**

In `src/shared/ipc-channels.ts`, add the three new channels (alongside the existing Phase 10 channels):

```ts
export const IPC = {
  // … all existing channels …

  // ── Tier-1 funded-account compliance ───────────────────────────────────
  FUNDED_ACCOUNT_GET:         'funded-account:get',
  FUNDED_ACCOUNT_SET_PROFILE: 'funded-account:set-profile',
  FUNDED_ACCOUNT_CLEAR:       'funded-account:clear',
  FUNDED_ACCOUNT_TRIGGER_FLAT:'funded-account:trigger-flat',
  FUNDED_ACCOUNT_UPDATE:      'funded-account:update', // server→renderer push
} as const
```

- [ ] **Step 2: Add Zod schemas**

In `src/shared/ipc-schemas.ts`:

```ts
import { z } from 'zod'

// Set-profile request — payload is the profile id (or null to deactivate).
export const FundedAccountSetProfileReq = z.object({
  profileId: z.string().min(1).max(64).nullable(),
}).strict()
export type FundedAccountSetProfileReq = z.infer<typeof FundedAccountSetProfileReq>

// Trigger-flat request — caller-supplied reason for the journal.
export const FundedAccountTriggerFlatReq = z.object({
  reason: z.string().min(1).max(120),
}).strict()
export type FundedAccountTriggerFlatReq = z.infer<typeof FundedAccountTriggerFlatReq>
```

- [ ] **Step 3: Wire FundedAccountService into trading-engine.ts**

In `src/main/core/trading-engine.ts`:

```ts
// In the import block:
import { FundedAccountService } from '../services/funded-account'
import type { FundedAccountSnapshot } from '@shared/funded/types'
import type { BlackoutResult } from '../services/blackout-window'

// Add to TradingEngine private fields, near the other services:
private fundedAccount!: FundedAccountService
/** Cached most-recent blackout result. Updated every 5s by the
 *  fundedTickTimer; consumed by RiskGatesService and submitOrder ctx. */
private cachedBlackout: BlackoutResult = { inBlackout: false, triggeringEvent: null, msToEvent: null }
private fundedTickTimer: NodeJS.Timeout | null = null
```

Inside `initialize()`, after `this.macro = new MacroCalendarService()` and before `this.regime.start()`:

```ts
    // Funded-account overlay. Hydrate from disk; activates whichever profile
    // the user last selected (null if first run). The EOD callback drives
    // cancel-all + flatten-all on the order manager.
    this.fundedAccount = new FundedAccountService({
      onFlatten: (reason) => this.onEodFlatten(reason),
    })
    this.fundedAccount.hydrate()
    this.fundedAccount.onUpdate(() => this.broadcastFundedAccount())

    // Per-minute tick: drive the EOD scheduler + refresh cached blackout.
    this.fundedTickTimer = setInterval(() => this.fundedTick(), 60_000)
```

Add the new private methods inside the class:

```ts
  private fundedTick(): void {
    const now = new Date()
    this.fundedAccount.tick(now)
    const profile = this.fundedAccount.getProfile()
    if (profile && profile.newsBlackoutImpacts.length > 0) {
      this.cachedBlackout = this.macro.checkBlackout(
        now.getTime(),
        profile.newsBlackoutImpacts,
        profile.newsBlackoutWindowMs,
      )
    } else {
      this.cachedBlackout = { inBlackout: false, triggeringEvent: null, msToEvent: null }
    }
  }

  /** Wired into FundedAccountService.deps.onFlatten. Cancels every pending
   *  order then market-flattens every open position. The kill switch is
   *  auto-armed afterwards so manual trading is paused — the user must
   *  explicitly disarm to start the next session. */
  private onEodFlatten(reason: string): void {
    const cancelled = this.om.cancelAllOrders()
    const flattened = this.om.flattenAllPositions((symbol) => this.market.getQuote(symbol))
    this.om.armKillSwitch(`eod-flatten:${reason}`)
    log.warn('EOD flatten executed', { reason, cancelled, flattened })
  }

  private broadcastFundedAccount(): void {
    const snap = this.fundedAccount.snapshot(this.om.getAccount().equity, new Date())
    // Reuse the IPC broadcast helper that all the other Phase 10 services use.
    // (Replace `pushToRenderer` with whatever the existing engine method is —
    // see how regime/risk-gates/macro broadcast their updates.)
    this.pushToRenderer(IPC.FUNDED_ACCOUNT_UPDATE, snap)
  }

  /** Public read for IPC handler. */
  getFundedAccount(): FundedAccountSnapshot {
    return this.fundedAccount.snapshot(this.om.getAccount().equity, new Date())
  }

  setFundedAccountProfile(profileId: string | null): { ok: boolean; reason?: string } {
    const r = this.fundedAccount.setProfile(profileId)
    if (r.ok) this.broadcastFundedAccount()
    return r
  }

  triggerFundedFlat(reason: string): void {
    this.fundedAccount.triggerFlatten(new Date(), reason)
  }
```

Update `submitOrder` (lines ~821-933) to populate the funded fields on `OrderValidationContext`. Add inside the existing `ctx` object literal:

```ts
    const profile = this.fundedAccount.getProfile()
    const ctx: OrderValidationContext = {
      refPrice,
      ...(refPriceAge !== undefined ? { refPriceAge } : {}),
      liveMode: isLive(),
      notionalCap: getNotionalCap(),
      assetClass: quote?.assetClass ?? 'equity',
      signalConfidence: opts?.signalConfidence ?? 0.6,
      tacticsGate: req.side === 'buy'
        ? (sc) => this.tactics.preTradeGate(sc)
        : undefined,
      // ── Tier-1 funded-account fields ────────────────────────────────────
      ...(profile ? { fundedProfile: profile } : {}),
      ...(profile ? { fundedMll: this.fundedAccount.snapshot(this.om.getAccount().equity, new Date()).currentMll } : {}),
      ...(profile && req.stopLoss && quote
          ? { worstCaseLossDollar: Math.abs((quote.last - req.stopLoss) * req.quantity) }
          : {}),
      currentPositionQty: this.om.getAccount().openPositions.find(p => p.symbol === req.symbol)?.quantity ?? 0,
      macroEvents: profile && profile.newsBlackoutImpacts.length > 0 ? this.macro.get().events : [],
      nowMs: Date.now(),
    }
```

Wire RiskGatesService deps in `initialize()`:

```ts
    this.riskGates = new RiskGatesService({
      getAccount: () => this.om.getAccount(),
      getQuote: (s) => this.market.getQuote(s),
      getCandles: (s, n) => this.market.getCandles(s, n),
      getPnlSnapshots: () => db.listPnlSnapshots(this.currentSessionId),
      getSessionStartEquity: () => this.om.getSessionStartEquity(),
      // ── NEW (Tier-1) ──
      getFundedSnapshot: (eq, now) => {
        if (!this.fundedAccount.getProfile()) return null
        return this.fundedAccount.snapshot(eq, now)
      },
      getBlackout: () => this.cachedBlackout,
    })
```

In `shutdown()`, clear the funded tick timer:

```ts
  shutdown(): void {
    // … existing shutdown logic …
    if (this.fundedTickTimer) { clearInterval(this.fundedTickTimer); this.fundedTickTimer = null }
  }
```

Hook EOD-driven equity recording — every time an order fills (which moves equity), record an EOD entry IF we're past the flat-by. This keeps the ledger up to date without a separate timer. Add to the existing `onOrderFill` handler in trading-engine:

```ts
  private onOrderFill(_order: Order, _position: Position | null): void {
    // … existing logic …
    // Tier-1: record EOD equity if we're past cutoff and haven't fired
    // today. The flatten side fires separately via fundedTick.
    const profile = this.fundedAccount.getProfile()
    if (profile) {
      const now = new Date()
      if (isPastFlatBy(now, profile.flatBy)) {
        this.fundedAccount.recordEod(this.om.getAccount().equity, now)
      }
    }
  }
```

(Import `isPastFlatBy` from `'../services/eod-flatten'` at the top of the file.)

- [ ] **Step 4: Add IPC handlers in main/index.ts**

In `src/main/index.ts`, alongside the other Phase 10 IPC registrations:

```ts
import { FundedAccountSetProfileReq, FundedAccountTriggerFlatReq } from '@shared/ipc-schemas'

// Register handlers (the existing helper that wraps ipcMain.handle with the
// error envelope and Zod parsing — pattern match the existing Phase 10
// service registrations):
registerIpcHandler(IPC.FUNDED_ACCOUNT_GET, async () => {
  return engine.getFundedAccount()
})

registerIpcHandler(IPC.FUNDED_ACCOUNT_SET_PROFILE, async (raw) => {
  const req = FundedAccountSetProfileReq.parse(raw)
  return engine.setFundedAccountProfile(req.profileId)
})

registerIpcHandler(IPC.FUNDED_ACCOUNT_CLEAR, async () => {
  return engine.setFundedAccountProfile(null)
})

registerIpcHandler(IPC.FUNDED_ACCOUNT_TRIGGER_FLAT, async (raw) => {
  const req = FundedAccountTriggerFlatReq.parse(raw)
  engine.triggerFundedFlat(req.reason)
  return { ok: true }
})
```

- [ ] **Step 5: Add the preload surface**

In `src/preload/index.ts`, append to the `satex` object literal:

```ts
import type { FundedAccountSnapshot } from '@shared/funded/types'

// Inside the satex object:
  getFundedAccount: ()                                => ipcRenderer.invoke(IPC.FUNDED_ACCOUNT_GET) as Promise<FundedAccountSnapshot>,
  setFundedAccountProfile: (profileId: string | null) => ipcRenderer.invoke(IPC.FUNDED_ACCOUNT_SET_PROFILE, { profileId }) as Promise<{ ok: boolean; reason?: string }>,
  clearFundedAccount: ()                              => ipcRenderer.invoke(IPC.FUNDED_ACCOUNT_CLEAR) as Promise<{ ok: boolean }>,
  triggerFundedFlat: (reason: string)                 => ipcRenderer.invoke(IPC.FUNDED_ACCOUNT_TRIGGER_FLAT, { reason }) as Promise<{ ok: boolean }>,
  onFundedAccountUpdate: (handler: (snap: FundedAccountSnapshot) => void) =>
    subscribe<FundedAccountSnapshot>(IPC.FUNDED_ACCOUNT_UPDATE, handler),
```

(The exact pattern depends on how the existing preload structures subscribe helpers — match the `onRiskGatesUpdate` / `onMacroUpdate` shape.)

- [ ] **Step 6: Run the full health stack**

```powershell
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app run typecheck
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app run lint
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app test
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app run knip
```

Expected: all four exit 0; the existing test count goes from 451 (Phase A+B+C end) to roughly **451 + 11 (D.1) + 16 (D.2) + 14 (D.3) + 16 (D.4) + 13 (D.5) + 7 (D.6) + 14 (D.7) + 18 (D.8) + 6 (D.9) ≈ 566** passing.

- [ ] **Step 7: Smoke-test manually with the dev build**

```powershell
$env:SATEX_VAULT_ROOT = (Resolve-Path .).Path
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app run dev
```

Inside the app:
1. Open the existing RiskGate panel — confirm 5 new gauges visible: TRAILING MaxDD, MLL BUFFER, NEWS BLACKOUT, MAX CONTRACTS, EOD COUNTDOWN.
2. Without activating any profile, all 5 should display "n/a · no profile".
3. From the DevTools console, activate: `await window.satex.setFundedAccountProfile('topstep-50k-xfa')`.
4. Confirm gauges populate: MLL BUFFER should read "$2,000 above MLL ($48,000)" for the default $50K paper account; EOD COUNTDOWN should show "T-Xm to 16:10".
5. Attempt to enter an order outside `allowedAssetClasses` (e.g., an index symbol) — confirm rejection with `gate: 'funded-asset-class'`.
6. Attempt to enter 2 shares of AAPL → confirm rejection with `gate: 'funded-max-contracts'` (default cap 1).
7. Set system clock or override `nowMs` via test affordance to 17:00 ET; attempt a new entry → confirm `gate: 'funded-eod'`.

- [ ] **Step 8: Commit**

```bash
git add 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/core/trading-engine.ts 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/index.ts 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/shared/ipc-channels.ts 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/shared/ipc-schemas.ts 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/preload/index.ts
git commit -m "feat(funded): wire FundedAccountService into engine + IPC + preload"
```

---

## Self-Review (Tier-1 plan)

**Spec coverage check:**
- ✅ Rule profile abstraction (G-1) — Task D.1 (`FundedAccountProfile` + Topstep $50K XFA preset)
- ✅ Trailing MaxDD gate (G-2) — Task D.2 (EquityHWMService) + Task D.8 Gate 9 (OrderManager wiring) + Task D.9 (TRAILING_MAXDD display gate)
- ✅ News-blackout Gate 9 (G-3 from audit; numbered "Gate 10" in OM here) — Task D.3 (pure check + MacroCalendarService method) + Task D.8 Gate 10 (OM wiring) + Task D.9 (NEWS_BLACKOUT display gate)
- ✅ Max-overall-loss vs initial balance (G-4) — implicit in the trailing MaxDD calculation: `max(initialBalance, highestEodBalance)` baseline ensures equity can never drop more than `trailingMaxDrawdown` below the initial balance even on day one
- ✅ EOD / Friday flat enforcement (G-5) — Task D.4 (EodFlattenService) + Task D.8 Gate 12 (post-EOD-flat in OM) + Task D.9 (EOD_COUNTDOWN display) + Task D.10 (onEodFlatten wiring)
- ⚠️ Consistency-rule tracker (G-6) — **deferred Phase D-2** per scope-out at top; the `consistencyMaxDayFraction` field is in the profile type so it's a forward-compatible addition
- ⚠️ Profit-target / min-trading-days state machine (G-7) — **deferred Phase D-2** per scope-out; profile carries the numeric targets as informational fields

**Placeholder scan:** Every step has real code or real commands. The one "match the existing pattern" instruction (preload `subscribe` helper, IPC error-envelope wrapper) refers to in-repo conventions the engineer can grep for — `onRegimeUpdate` and the wrapper at `main/index.ts:659` (which the prior audit doc identified) — not generic "wire it up" placeholders.

**Type consistency:**
- `FundedAccountProfile` defined in D.1, consumed identically by D.2 (`computeMll`), D.5 (`checkMaxContracts` / `checkAllowedAssetClass`), D.7 (`FundedAccountService`), D.8 (`OrderValidationContext.fundedProfile`), D.9 (`RiskGatesDeps.getFundedSnapshot`).
- `FundedAccountSnapshot` defined in D.1, returned by `FundedAccountService.snapshot` (D.7), consumed by `RiskGatesService.compute` (D.9), broadcast via IPC `FUNDED_ACCOUNT_UPDATE` (D.10).
- `EquityHwmLedgerEntry` defined in D.1, owned by `EquityHWMService` (D.2), persisted via `FundedAccountStore` (D.6), hydrated through `FundedAccountService.hydrate` (D.7).
- `BlackoutResult` defined in D.3, returned by `MacroCalendarService.checkBlackout` (D.3), cached on the trading-engine (D.10), consumed by `RiskGatesService` (D.9).
- `tradingDayKey(now, tz)` defined in D.2's `equity-hwm.ts`, imported by `eod-flatten.ts` (D.4) and `funded-account.ts` (D.7) — single source of truth.
- `isPastFlatBy` exported from D.4 (`eod-flatten.ts`), imported by D.8 (OM Gate 12) and D.10 (trading-engine `onOrderFill` EOD record).
- Gate string identifiers (`'funded-mll'`, `'funded-blackout'`, `'funded-max-contracts'`, `'funded-eod'`, `'funded-asset-class'`) defined in D.8, no consumers reference these strings outside the test assertions in D.8 — safe.
- `RiskGateKey` union extended in D.9; the renderer's `RiskGatePanel` currently iterates `gates` without typing keys — no breakage.

**Cross-task references:**
- D.10 imports `FundedAccountService` (D.7), which transitively pulls in `EquityHWMService` (D.2), `EodFlattenService` (D.4), `FundedAccountStore` (D.6), and the registry from D.1.
- D.10 imports `isPastFlatBy` (D.4) for the post-fill EOD ledger trigger.
- D.10 wires `RiskGatesService.deps` (extended in D.9) to read from `FundedAccountService` and `cachedBlackout`.

---

## Execution Handoff

**Plan complete and saved to** `docs/superpowers/plans/2026-05-29-topstep-50k-compliance.md`.

10 tasks. Estimated 5–8 days of focused work. Each task ends with its own commit; tasks D.1 through D.9 produce independently-shippable subsystems, and D.10 is the integration that makes everything fire end-to-end.

Two execution options:

1. **Subagent-Driven** — dispatch a fresh subagent per task (D.1 → D.10), review between tasks. Lower-context approach; faster wall-clock if the subagents run in parallel for independent tasks (D.1, D.5 don't depend on each other).

2. **Inline Execution (recommended for this session)** — execute tasks in the same conversation on a fresh `feat/topstep-50k-compliance` branch off master so the work lands as one cohesive PR. Continues the same harness pattern that worked for Phases A + B + C.
