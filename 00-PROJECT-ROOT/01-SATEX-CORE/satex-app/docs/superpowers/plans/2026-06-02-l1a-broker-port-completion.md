# L1.A — F.1 Broker-Port Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the 19 remaining `this.alpaca.*` direct call-sites in `trading-engine.ts` (13) and `historical-importer.ts` (6) to the `BrokerSession` facets, so `git grep -n "this.alpaca\." -- src/` returns only matches inside `live-market.ts` (the LiveMarket MarketDataSource concrete itself). End state: master gains complete F.1 broker abstraction; downstream Lane 1 sub-projects (L1.B–L1.G) can rebase onto clean facets.

**Architecture:** Extend `MarketDataSource` interface with 5 broker-data methods (`getBars`, `getCryptoBars`, `getClock`, `isConnected`, `msSinceLastTick`); implement on `LiveMarket` as delegates to the underlying `AlpacaClient`; rewire `trading-engine` + `historical-importer` to consume the session facets (`session.orders.{submit,cancel,onUpdate}`, `session.account.getSnapshot`, `session.data.{getBars,getCryptoBars,getClock,isConnected,msSinceLastTick}`, `session.state`) and the existing `Position[]` translation. Migrate `shutdown()` from sync `disconnect*()` calls to async `session.disconnect()`, propagate `await` to the Electron `before-quit` handler.

**Tech Stack:** TypeScript 5.x · Electron · Vitest · ESLint · Knip · TradingView Lightweight Charts (downstream consumer of `MarketDataSource`, not modified here).

**Trading-safety perimeter:** This plan touches `OrderManager`-adjacent code paths (`submitOrder`, `cancelOrder`, `syncFromAlpaca`). Per `AGENTS.md`, the PR closing this plan **requires explicit human sign-off**. No autonomous merge. Every intermediate commit must pass all four gates (`typecheck`, `lint`, `test`, `knip`).

---

## Spec reference

- Program spec: `docs/superpowers/specs/2026-06-02-topstep-eval-capable-program-design.md` §5.1 L1.A
- F.1 design spec: `docs/superpowers/specs/2026-06-01-alpaca-broker-session-design.md`
- AGENTS.md trading-safety guardrails: `AGENTS.md` §TRADING-SAFETY GUARDRAILS

## Verified migration surface (2026-06-02)

`Grep "this\.alpaca\."` over `src/` returns 24 matches across 3 files:

| File | Site count | Migrate? | Reason |
|---|---|---|---|
| `src/main/services/live-market.ts` | 5 | **No — stays** | This IS the LiveMarket / MarketDataSource concrete. `this.alpaca` is its private dependency. |
| `src/main/core/trading-engine.ts` | 13 | **Yes** | All 13 sites covered in this plan |
| `src/main/services/historical-importer.ts` | 6 | **Yes** | All 6 sites covered in this plan |

## Pre-flight: branch + base state

- [ ] **Step P.1:** Verify on `feat/f1-broker-adapter-impl` and gates are green at branch tip.

```bash
git rev-parse --abbrev-ref HEAD
# Expected: feat/f1-broker-adapter-impl

cd 00-PROJECT-ROOT/01-SATEX-CORE/satex-app
npm run typecheck
npm run lint
npm test
npm run knip
```

Expected: all four pass. If any fail, STOP — fix before starting L1.A.

- [ ] **Step P.2:** Confirm verified site count.

```bash
cd 00-PROJECT-ROOT/01-SATEX-CORE/satex-app
git grep -n "this\.alpaca\." -- src/ | wc -l
# Expected: 24
git grep -n "this\.alpaca\." -- src/main/services/live-market.ts | wc -l
# Expected: 5  (stays — LiveMarket concrete)
git grep -n "this\.alpaca\." -- src/main/core/trading-engine.ts | wc -l
# Expected: 13
git grep -n "this\.alpaca\." -- src/main/services/historical-importer.ts | wc -l
# Expected: 6
```

If counts differ, the codebase moved underneath the plan — STOP and re-verify migration map before proceeding.

---

## Phase 0 — Lock implementation decisions (human sign-off required)

L1.A involves four implementation decisions that the spec explicitly required surfacing rather than assuming. **All four must be signed off before Phase 1 starts.** Recommended defaults are given; the executor proposes, the human signs off.

### Task 0.1 — D1: `onTradeUpdate` migration shape

The engine calls `this.alpaca.onTradeUpdate(u => this.onAlpacaTradeUpdate(u))` at three construction sites (cold-boot L455, data-feed switch L1046, reconnect L1119). `onAlpacaTradeUpdate` expects Alpaca's raw `trade_update` shape; `OrderRouter.onUpdate` emits the canonical `OrderEvent` union. Two options:

| Option | Migration | Consequence |
|---|---|---|
| **D1.A (recommended)** | Replace `onAlpacaTradeUpdate(u)` with a handler that consumes the canonical `OrderEvent` type from `orders.onUpdate(fn)` | Cleaner long-term — engine code becomes broker-agnostic. AlpacaOrderRouter already translates. |
| D1.B | Keep `onAlpacaTradeUpdate` consuming Alpaca-native trade_updates and leave the subscription on `this.alpaca` directly | Means a `this.alpaca.onTradeUpdate` reference survives at the construction sites, violating DoD §2 #1. Rejected. |

**Recommendation: D1.A.** Engine handler is refactored to consume `OrderEvent`. Tests reflect the new signature.

- [ ] **Step 0.1.1:** Surface the decision to the human, recommending D1.A. Wait for sign-off.

### Task 0.2 — D2: `clientOrderId` provenance for `submit`

`OrderRouter.submit` requires `clientOrderId` from the caller (per `OrderRouter` spec). Today `AlpacaClient.submitOrder` generates `clientOrderId` internally. Two options:

| Option | Migration | Consequence |
|---|---|---|
| **D2.A (recommended)** | Engine generates `clientOrderId = crypto.randomUUID()` immediately before `session.orders.submit(...)` and includes it in the `OrderRequest`. The order's `id` (existing engine-side identifier) and `clientOrderId` are distinct. | Matches the F.1 design (`AlpacaOrderRouter` pre-REST dedup keys off caller-supplied id). Order journaling stays sane. |
| D2.B | Push generation down into `AlpacaOrderRouter` and accept partial signature compatibility | Violates the `OrderRouter` interface contract. Rejected. |

**Recommendation: D2.A.** Engine generates UUIDv4 at the submit call-site.

- [ ] **Step 0.2.1:** Surface the decision, recommending D2.A. Wait for sign-off.

### Task 0.3 — D3: Extend `MarketDataSource` with broker-data methods

The remaining migrations (`getBars`, `getCryptoBars`, `getClock`, `isMarketConnected`, `msSinceLastTick`) have no facet placement today. Two options:

| Option | Migration | Consequence |
|---|---|---|
| **D3.A (recommended)** | Extend `MarketDataSource` with five new methods. Implement on `LiveMarket` (delegate to `AlpacaClient`). Other implementations (`MarketSimulator`, `ReplaySource`) get safe-default implementations. | Achieves DoD §2 #1. Future Tradovate adapter implements the same shape. |
| D3.B | Add a new `HistoricalBars` + `MarketClock` facet to `BrokerSession`. | More surface, more decisions, no clear payoff vs D3.A. Rejected. |

**Recommendation: D3.A.** New surface on `MarketDataSource`:

```typescript
// @shared/broker/market-data-source.ts — additions
import type { HistoricalTimeframe } from '@shared/types'

export interface MarketClockSnapshot {
  isOpen:    boolean
  nextOpen:  number  // unix ms
  nextClose: number  // unix ms
}

export interface MarketDataSource {
  // ... existing methods ...

  /** Pull historical bars for an equity/index symbol over `[startIso, endIso?]`.
   *  Empty array on no-data (closed day, too-recent for free feed). Throws on
   *  network / auth failure. */
  getBars(symbol: string, tf: HistoricalTimeframe, startIso: string, endIso?: string): Promise<Candle[]>

  /** Same shape as getBars, scoped to crypto symbols (no session boundaries). */
  getCryptoBars(symbol: string, tf: HistoricalTimeframe, startIso: string, endIso?: string): Promise<Candle[]>

  /** Broker-reported market clock. Implementations without a clock (simulator,
   *  replay) synthesize from local wall-clock + universe trading hours. */
  getClock(): Promise<MarketClockSnapshot>

  /** True iff the data source's primary market WS is currently open. Simulator
   *  + ReplaySource always return `true` (they're never "disconnected"). */
  isConnected(): boolean

  /** Milliseconds since the most recent tick was processed. 0 if never. */
  msSinceLastTick(): number
}
```

- [ ] **Step 0.3.1:** Surface the decision + interface diff, recommending D3.A. Wait for sign-off.

### Task 0.4 — D4: `syncFromAlpaca` signature

`OrderManager.syncFromAlpaca` currently takes a raw Alpaca-shaped snapshot:

```typescript
syncFromAlpaca(snap: { equity: number; cash: number; buyingPower: number }, alpacaPositions: Position[]): void
```

The engine calls it with:

```typescript
const [snap, positions] = await Promise.all([this.alpaca.getAccount(), this.alpaca.getPositions()])
const satexPositions = positions.map(p => AlpacaClient.toSatexPosition(p, Date.now()))
this.om.syncFromAlpaca(snap, satexPositions)
```

After migration `session.account.getSnapshot()` returns canonical `AccountSnapshot` ({ equity, cash, buyingPower, positions, observedAt }). Two options:

| Option | Migration | Consequence |
|---|---|---|
| **D4.A (recommended)** | Rename `syncFromAlpaca` → `syncFromSnapshot`. Signature accepts `AccountSnapshot` directly. Engine call becomes `this.om.syncFromSnapshot(await this.session.account.getSnapshot())`. `AlpacaClient.toSatexPosition` migrates into `AlpacaAccountSyncer` (already there per F.1 design). | Cleaner. Knip will catch stale callers. |
| D4.B | Keep `syncFromAlpaca` name, accept `AccountSnapshot`, internal destructuring | Saves a rename but locks Alpaca name into broker-agnostic surface. Rejected. |

**Recommendation: D4.A.** Method renamed; signature canonical; rest of code updated.

- [ ] **Step 0.4.1:** Surface the decision, recommending D4.A. Wait for sign-off.

### Task 0.5 — Confirm decisions in plan + commit

- [ ] **Step 0.5.1:** Once all four decisions signed off, amend this plan file with a "Decisions locked" block in §Phase 0 noting the four choices (D1.A / D2.A / D3.A / D4.A or whatever was chosen).

- [ ] **Step 0.5.2:** Commit the amended plan.

```bash
git add 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/docs/superpowers/plans/2026-06-02-l1a-broker-port-completion.md
git commit -m "$(cat <<'EOF'
docs(plans): L1.A decisions locked (D1-D4)

D1: onTradeUpdate -> orders.onUpdate (canonical OrderEvent)
D2: engine generates clientOrderId at submit call-site
D3: extend MarketDataSource with getBars/getCryptoBars/getClock/isConnected/msSinceLastTick
D4: rename syncFromAlpaca -> syncFromSnapshot, accept AccountSnapshot

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

Expected: pre-commit gates green; new commit on the branch.

---

## Phase 1 — Interface extension + concrete implementations

Assumes Phase 0 decisions all signed off (D1.A / D2.A / D3.A / D4.A). If not, STOP.

### Task 1.1 — Extend `MarketDataSource` interface

**Files:**
- Modify: `src/shared/broker/market-data-source.ts`
- Modify: `src/shared/types.ts` (if `HistoricalTimeframe` not already exported there — verify before adding)

- [ ] **Step 1.1.1:** Confirm `HistoricalTimeframe` is exported from `@shared/types`.

```bash
grep -n "export type HistoricalTimeframe\|export.*HistoricalTimeframe" 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/shared/types.ts
```

Expected: at least one match. If none, add `export type HistoricalTimeframe = '1Min' | '1Hour'` (matches the existing usage in `historical-importer.ts`).

- [ ] **Step 1.1.2:** Add `MarketClockSnapshot` type + 5 new methods to `MarketDataSource`.

```typescript
// src/shared/broker/market-data-source.ts — append after existing interface

export interface MarketClockSnapshot {
  isOpen:    boolean
  nextOpen:  number  // unix ms
  nextClose: number  // unix ms
}
```

Add to existing `MarketDataSource` interface (after `getCandles`):

```typescript
  // ── F.1 L1.A extension: broker-data methods previously on AlpacaClient ────
  /** Pull historical bars over `[startIso, endIso?]`. Empty array on no-data. */
  getBars(symbol: string, tf: HistoricalTimeframe, startIso: string, endIso?: string): Promise<Candle[]>
  /** Crypto-scoped bars; no session boundaries. */
  getCryptoBars(symbol: string, tf: HistoricalTimeframe, startIso: string, endIso?: string): Promise<Candle[]>
  /** Broker-reported market clock snapshot. */
  getClock(): Promise<MarketClockSnapshot>
  /** True iff primary data WS is currently open. Simulator + Replay always return true. */
  isConnected(): boolean
  /** Milliseconds since the most-recent tick was processed. 0 if never. */
  msSinceLastTick(): number
```

Also add the import:

```typescript
import type { Candle, HistoricalTimeframe, NewsItem, Quote, Trade } from '@shared/types'
```

- [ ] **Step 1.1.3:** Run typecheck to confirm the interface extension causes existing implementations (LiveMarket, MarketSimulator, ReplaySource) to fail to compile.

```bash
cd 00-PROJECT-ROOT/01-SATEX-CORE/satex-app && npm run typecheck 2>&1 | head -40
```

Expected: errors at the 3 concrete classes for "does not implement MarketDataSource — missing method `getBars` / `getCryptoBars` / `getClock` / `isConnected` / `msSinceLastTick`". This is the failing-test signal.

- [ ] **Step 1.1.4:** DO NOT commit yet — Phase 1 keeps the working tree dirty until 1.7 lands the safe-default stubs. Move directly to 1.2.

### Task 1.2 — Implement `LiveMarket.getBars` + `getCryptoBars` (TDD)

**Files:**
- Test: `src/main/services/live-market.test.ts`
- Modify: `src/main/services/live-market.ts`

- [ ] **Step 1.2.1:** Add failing tests.

```typescript
// src/main/services/live-market.test.ts — append inside the existing describe block
describe('LiveMarket — broker-data delegates (F.1 L1.A)', () => {
  it('getBars delegates to AlpacaClient.getBars', async () => {
    const calls: unknown[] = []
    const fakeAlpaca = {
      getBars: async (s: string, tf: string, start: string, end?: string) => {
        calls.push([s, tf, start, end])
        return [{ time: 1, open: 1, high: 1, low: 1, close: 1, volume: 0 }]
      },
    } as unknown as AlpacaClient
    const lm = new LiveMarket(fakeAlpaca, ['AAPL'])
    const bars = await lm.getBars('AAPL', '1Min', '2026-06-02T13:00:00Z')
    expect(bars).toHaveLength(1)
    expect(calls[0]).toEqual(['AAPL', '1Min', '2026-06-02T13:00:00Z', undefined])
  })

  it('getCryptoBars delegates to AlpacaClient.getCryptoBars', async () => {
    const fakeAlpaca = {
      getCryptoBars: async (_s: string) => [{ time: 2, open: 2, high: 2, low: 2, close: 2, volume: 0 }],
    } as unknown as AlpacaClient
    const lm = new LiveMarket(fakeAlpaca, ['BTC'])
    const bars = await lm.getCryptoBars('BTC', '1Min', '2026-06-02T00:00:00Z')
    expect(bars).toHaveLength(1)
    expect(bars[0]!.close).toBe(2)
  })
})
```

- [ ] **Step 1.2.2:** Run and verify these two tests fail (method missing on LiveMarket).

```bash
cd 00-PROJECT-ROOT/01-SATEX-CORE/satex-app && npx vitest run src/main/services/live-market.test.ts 2>&1 | tail -30
```

Expected: 2 failures referencing missing methods.

- [ ] **Step 1.2.3:** Implement on LiveMarket.

```typescript
// src/main/services/live-market.ts — add inside the class
async getBars(symbol: string, tf: HistoricalTimeframe, startIso: string, endIso?: string): Promise<Candle[]> {
  return this.alpaca.getBars(symbol, tf, startIso, endIso)
}

async getCryptoBars(symbol: string, tf: HistoricalTimeframe, startIso: string, endIso?: string): Promise<Candle[]> {
  return this.alpaca.getCryptoBars(symbol, tf, startIso, endIso)
}
```

Add `HistoricalTimeframe` to the existing type imports at the top.

- [ ] **Step 1.2.4:** Re-run; expect the two new tests to pass.

```bash
npx vitest run src/main/services/live-market.test.ts 2>&1 | tail -10
```

### Task 1.3 — Implement `LiveMarket.getClock` (TDD)

- [ ] **Step 1.3.1:** Add failing test.

```typescript
it('getClock delegates to AlpacaClient.getClock', async () => {
  const fakeAlpaca = {
    getClock: async () => ({ isOpen: true, nextOpen: 100, nextClose: 200 }),
  } as unknown as AlpacaClient
  const lm = new LiveMarket(fakeAlpaca, ['AAPL'])
  const clock = await lm.getClock()
  expect(clock.isOpen).toBe(true)
  expect(clock.nextClose).toBe(200)
})
```

- [ ] **Step 1.3.2:** Run, verify failure. `npx vitest run src/main/services/live-market.test.ts`

- [ ] **Step 1.3.3:** Implement.

```typescript
async getClock(): Promise<MarketClockSnapshot> {
  return this.alpaca.getClock()
}
```

Add `MarketClockSnapshot` to the imports from `@shared/broker/market-data-source`. If `AlpacaClient.getClock()` returns a shape that differs from `MarketClockSnapshot`, add a translation (verify shape; if it differs, use `{ isOpen, nextOpen: nextOpen.getTime(), nextClose: nextClose.getTime() }`-style mapping).

- [ ] **Step 1.3.4:** Re-run; expect pass.

### Task 1.4 — Implement `LiveMarket.isConnected` + `msSinceLastTick` (TDD)

- [ ] **Step 1.4.1:** Add failing tests.

```typescript
it('isConnected delegates to AlpacaClient.isMarketConnected', () => {
  const fakeAlpaca = { isMarketConnected: true } as unknown as AlpacaClient
  const lm = new LiveMarket(fakeAlpaca, ['AAPL'])
  expect(lm.isConnected()).toBe(true)
})

it('msSinceLastTick delegates to AlpacaClient.msSinceLastTick', () => {
  const fakeAlpaca = { msSinceLastTick: 42 } as unknown as AlpacaClient
  const lm = new LiveMarket(fakeAlpaca, ['AAPL'])
  expect(lm.msSinceLastTick()).toBe(42)
})
```

- [ ] **Step 1.4.2:** Run, verify failure.

- [ ] **Step 1.4.3:** Implement.

```typescript
isConnected(): boolean { return this.alpaca.isMarketConnected }
msSinceLastTick(): number { return this.alpaca.msSinceLastTick }
```

- [ ] **Step 1.4.4:** Re-run; expect pass.

### Task 1.5 — Safe-default stubs on `MarketSimulator` + `ReplaySource`

**Files:**
- Modify: `src/main/services/market-data.ts` (`MarketSimulator` class)
- Modify: `src/main/services/replay-source.ts` (`ReplaySource` class)

`MarketSimulator` and `ReplaySource` must implement the extended interface but have no real broker behind them. Safe defaults:

- `getBars` / `getCryptoBars`: return `[]` (caller is expected to fall back to the synthetic universe path).
- `getClock`: synthesize from local clock — simulator/replay always report `isOpen: true` with `nextOpen: 0, nextClose: Number.MAX_SAFE_INTEGER`.
- `isConnected`: always `true` (the sim is never "disconnected" — its data is internally generated).
- `msSinceLastTick`: track inside the sim from the last `setTimeout` tick boundary; for replay, from the last `Tick` event consumed.

- [ ] **Step 1.5.1:** Add tests for both classes covering the safe defaults.

```typescript
// src/main/services/market-data.test.ts (new file or append to existing)
import { describe, it, expect } from 'vitest'
import { MarketSimulator } from './market-data'

describe('MarketSimulator — F.1 L1.A interface compliance', () => {
  it('getBars returns []', async () => {
    const sim = new MarketSimulator()
    expect(await sim.getBars('AAPL', '1Min', '2026-06-02T13:00:00Z')).toEqual([])
  })
  it('getCryptoBars returns []', async () => {
    const sim = new MarketSimulator()
    expect(await sim.getCryptoBars('BTC', '1Min', '2026-06-02T00:00:00Z')).toEqual([])
  })
  it('getClock reports isOpen=true', async () => {
    const sim = new MarketSimulator()
    expect((await sim.getClock()).isOpen).toBe(true)
  })
  it('isConnected is always true', () => {
    const sim = new MarketSimulator()
    expect(sim.isConnected()).toBe(true)
  })
})
```

Mirror the test structure for `ReplaySource` in `src/main/services/replay-source.test.ts`.

- [ ] **Step 1.5.2:** Implement the safe defaults on both classes.

```typescript
// MarketSimulator — add to class body
async getBars(): Promise<Candle[]> { return [] }
async getCryptoBars(): Promise<Candle[]> { return [] }
async getClock(): Promise<MarketClockSnapshot> {
  return { isOpen: true, nextOpen: 0, nextClose: Number.MAX_SAFE_INTEGER }
}
isConnected(): boolean { return true }
msSinceLastTick(): number { return this.lastTickAt > 0 ? Date.now() - this.lastTickAt : 0 }
```

(Note: if `MarketSimulator` doesn't track `lastTickAt`, add a small private field updated wherever the sim emits a tick.) Same pattern for `ReplaySource` — `lastTickAt` is likely already tracked there.

- [ ] **Step 1.5.3:** Run vitest; expect all new tests pass + typecheck no longer flags the interface conformance failures.

```bash
npm run typecheck && npx vitest run src/main/services/
```

### Task 1.6 — Commit Phase 1 interface + concretes

- [ ] **Step 1.6.1:** Commit.

```bash
git add src/shared/broker/market-data-source.ts \
        src/main/services/live-market.ts \
        src/main/services/live-market.test.ts \
        src/main/services/market-data.ts \
        src/main/services/market-data.test.ts \
        src/main/services/replay-source.ts \
        src/main/services/replay-source.test.ts
# Add src/shared/types.ts only if you modified it in 1.1.1
git commit -m "$(cat <<'EOF'
feat(broker): extend MarketDataSource with broker-data methods (F.1 L1.A)

Adds getBars, getCryptoBars, getClock, isConnected, msSinceLastTick to
the MarketDataSource interface so the trading-engine and historical-
importer can stop talking directly to AlpacaClient.

- LiveMarket delegates to its underlying AlpacaClient
- MarketSimulator + ReplaySource return safe defaults (empty bars,
  always-open clock, always-connected)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

Expected: pre-commit gates green; ~7 files committed.

### Task 1.7 — Add `syncFromSnapshot` to `OrderManager` (additive, gates stay green)

**Files:**
- Modify: `src/main/services/order-manager.ts`
- Modify: `src/main/services/order-manager.test.ts`

**Strategy:** Add the new method ADDITIVELY. The old `syncFromAlpaca(snap, positions)` stays as a thin forwarder so existing callers (and the trading-engine call-site in Phase 2.7) keep compiling. After 2.7 migrates the call-site, Knip flags `syncFromAlpaca` as unused and we delete it in Task 4.1. No `--no-verify` required at any commit.

- [ ] **Step 1.7.1:** Confirm caller surface.

```bash
grep -rn "syncFromAlpaca" 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/ 2>&1
```

Expected: 1 production caller (`trading-engine.ts` ~line 1983), plus test references.

- [ ] **Step 1.7.2:** Add failing test for the new method.

```typescript
// src/main/services/order-manager.test.ts — new test
it('syncFromSnapshot accepts AccountSnapshot directly', () => {
  const om = makeOrderManager() // existing helper
  const snap = { equity: 50_000, cash: 50_000, buyingPower: 100_000, positions: [], observedAt: Date.now() }
  om.syncFromSnapshot(snap)
  expect(om.equity).toBe(50_000)
})
```

- [ ] **Step 1.7.3:** Run, verify failure (method missing).

- [ ] **Step 1.7.4:** Implement additively. The new method takes `AccountSnapshot`; the old `syncFromAlpaca` keeps its existing signature and forwards.

```typescript
// src/main/services/order-manager.ts
import type { AccountSnapshot } from '@shared/broker/account-syncer'

// NEW canonical method
syncFromSnapshot(snap: AccountSnapshot): void {
  // Move the existing syncFromAlpaca body here, substituting:
  //   `snap.positions` for the old `alpacaPositions` parameter
  //   `snap.observedAt` is available if needed for staleness checks
  this.equity = snap.equity
  this.cash = snap.cash
  this.buyingPower = snap.buyingPower
  // ... apply snap.positions
}

// LEGACY wrapper — deletes in Task 4.1 once Knip confirms unused
/** @deprecated Use syncFromSnapshot. Removed in L1.A Task 4.1. */
syncFromAlpaca(
  snap: { equity: number; cash: number; buyingPower: number },
  alpacaPositions: Position[],
): void {
  this.syncFromSnapshot({ ...snap, positions: alpacaPositions, observedAt: Date.now() })
}
```

- [ ] **Step 1.7.5:** Run full test + typecheck.

```bash
npm run typecheck && npx vitest run src/main/services/order-manager.test.ts
```

Expected: green. Both methods coexist; existing caller (engine) still compiles via the legacy wrapper.

- [ ] **Step 1.7.6:** Commit.

```bash
git add src/main/services/order-manager.ts src/main/services/order-manager.test.ts
git commit -m "$(cat <<'EOF'
feat(om): add syncFromSnapshot accepting canonical AccountSnapshot (F.1 L1.A)

Adds OrderManager.syncFromSnapshot(snap: AccountSnapshot) per L1.A
decision D4.A. The legacy syncFromAlpaca(snap, positions) signature
stays as a thin forwarder so the trading-engine call-site (migrated
in Task 2.7) keeps compiling. Knip flags syncFromAlpaca as unused
after Task 2.7; deleted in Task 4.1.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

Expected: pre-commit gates green.

---

## Phase 2 — Migrate `trading-engine.ts` (13 call-sites)

Each task targets one call pattern. Each commit keeps all four gates green. After each task, the matching `git grep "this.alpaca.<method>" -- src/main/core/trading-engine.ts` should return zero results.

### Task 2.1 — Migrate `onTradeUpdate` × 3 → `orders.onUpdate` (D1.A)

**Files:**
- Modify: `src/main/core/trading-engine.ts` lines 455, 1046, 1119 + the `onAlpacaTradeUpdate` handler
- Modify: `src/main/core/trading-engine.test.ts` (if it has tests covering the trade-update flow)

- [ ] **Step 2.1.1:** Locate `onAlpacaTradeUpdate` handler.

```bash
grep -n "onAlpacaTradeUpdate\|private.*onAlpacaTradeUpdate" 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/core/trading-engine.ts | head -5
```

- [ ] **Step 2.1.2:** Refactor handler to consume canonical `OrderEvent`.

```typescript
// src/main/core/trading-engine.ts
import type { OrderEvent } from '@shared/broker/order-router'

private onOrderEvent(e: OrderEvent): void {
  // Map by execType. Replace old onAlpacaTradeUpdate switch on Alpaca event
  // strings with the canonical execType values.
  switch (e.execType) {
    case 'FILL':         this.om.fillOrder(e.orderId, e.avgPrice); break
    case 'PARTIAL_FILL': /* engine-side accounting if any */ break
    case 'REJECT':       this.om.rejectOrder(e.orderId, e.reason); break
    case 'CANCEL':       this.om.cancelOrder(e.orderId); break
    case 'EXPIRE':       this.om.cancelOrder(e.orderId); break
    case 'ACK':          /* no-op — order accepted */ break
  }
}
```

The exact mapping mirrors what `onAlpacaTradeUpdate` was doing. Read the existing handler carefully; preserve every side-effect.

- [ ] **Step 2.1.3:** Replace the three subscription sites.

```typescript
// Lines 455, 1046, 1119 — replace
this.alpaca.onTradeUpdate((u) => this.onAlpacaTradeUpdate(u))
// with
this.session.orders.onUpdate((e) => this.onOrderEvent(e))
```

(If `this.session` is potentially null at any of those sites, gate with `if (this.session)`. Verify by re-reading the construction blocks at L444-470, L1040-1060, L1110-1125.)

- [ ] **Step 2.1.4:** Delete the old `onAlpacaTradeUpdate` handler.

- [ ] **Step 2.1.5:** Run tests + typecheck.

```bash
npm run typecheck && npx vitest run 2>&1 | tail -20
```

Expected: green. If any test asserted on the old Alpaca shape, update the assertion to the canonical OrderEvent shape.

- [ ] **Step 2.1.6:** Commit.

```bash
git add src/main/core/trading-engine.ts src/main/core/trading-engine.test.ts
git commit -m "$(cat <<'EOF'
feat(broker): trading-engine consumes OrderRouter.onUpdate (F.1 L1.A 2.1)

Migrates the 3 onTradeUpdate subscriptions (cold-boot, data-feed switch,
reconnect) from this.alpaca.onTradeUpdate -> session.orders.onUpdate.
Handler renamed onAlpacaTradeUpdate -> onOrderEvent and refactored to
consume the canonical OrderEvent union. AlpacaOrderRouter already
translates the wire-format trade_updates to OrderEvent.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

### Task 2.2 — Migrate `isMarketConnected` × 2 → `session.state === 'CONNECTED'`

- [ ] **Step 2.2.1:** Replace line 774.

```typescript
// before:
const result = (this.alpaca && this.dataSource === 'live') ? (this.alpaca.isMarketConnected ? 'live' : 'off') : 'sim'
// after:
const result = (this.session && this.dataSource === 'live') ? (this.session.state === 'CONNECTED' ? 'live' : 'off') : 'sim'
```

(Verify the actual surrounding code at L774 in the current state — pattern match may differ slightly.)

- [ ] **Step 2.2.2:** Replace line 1737.

```typescript
// before:
connected: this.alpaca ? this.alpaca.isMarketConnected : true,
// after:
connected: this.session ? this.session.state === 'CONNECTED' : true,
```

- [ ] **Step 2.2.3:** Run gates + commit.

```bash
npm run typecheck && npx vitest run
git add src/main/core/trading-engine.ts
git commit -m "feat(broker): trading-engine reads isMarketConnected via session.state (F.1 L1.A 2.2)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

### Task 2.3 — Migrate `submitOrder` → `orders.submit` with caller-supplied `clientOrderId` (D2.A)

**Files:**
- Modify: `src/main/core/trading-engine.ts` around L919-935

- [ ] **Step 2.3.1:** Replace L919-921 region.

```typescript
// before:
if (this.alpaca) {
  try {
    const result = await this.alpaca.submitOrder(req)
    // ...
// after:
if (this.session) {
  try {
    const clientOrderId = crypto.randomUUID()
    const ack = await this.session.orders.submit({ ...req, clientOrderId })
    // The fill data now comes via OrderRouter.onUpdate (handled by onOrderEvent),
    // not synchronously from submit. ack returns brokerOrderId + clientOrderId +
    // acceptedAt; the FILL event arrives async.
    log.info('order acknowledged', { brokerOrderId: ack.brokerOrderId, clientOrderId })
```

**Important:** the prior code accessed `result.filledAvgPrice` SYNCHRONOUSLY off submitOrder's return. The canonical `OrderAck` does NOT include fill price — fill arrives async via `onUpdate` (FILL event). The slippage capture block at L922-929 must move into `onOrderEvent` (Task 2.1's handler) and execute when a FILL event arrives.

- [ ] **Step 2.3.2:** Move the slippage capture block.

```typescript
// In onOrderEvent (added in 2.1) — handle FILL:
case 'FILL': {
  this.om.fillOrder(e.orderId, e.avgPrice)
  // S1-6 slippage capture — moved from the submit call-site
  const ef = this.entryFeatures.get(e.orderId)
  if (ef && ef.quoteAtSubmit != null && ef.quoteAtSubmit > 0) {
    ef.entrySlippageBps = (e.avgPrice - ef.quoteAtSubmit) / ef.quoteAtSubmit * 10_000
  }
  break
}
```

The `order.fillPrice = result.filledAvgPrice` assignment at the call-site is removed — `fillOrder` (called from the FILL handler) already records the fill price.

- [ ] **Step 2.3.3:** Run integration tests covering order submission.

```bash
npx vitest run src/main/core/trading-engine.test.ts src/main/services/order-manager.test.ts 2>&1 | tail -20
```

Expected: green. If tests previously asserted synchronous fillPrice off submit, update to assert on the async path (drive the fake `orders.onUpdate` listener manually).

- [ ] **Step 2.3.4:** Commit.

```bash
git add src/main/core/trading-engine.ts src/main/core/trading-engine.test.ts
git commit -m "$(cat <<'EOF'
feat(broker): trading-engine submits via OrderRouter.submit (F.1 L1.A 2.3)

Engine generates clientOrderId (crypto.randomUUID) at the call-site per
F.1 L1.A D2.A; AlpacaOrderRouter's pre-REST dedup keys off that id.
Slippage capture moves from the synchronous submit return path to the
async FILL handler in onOrderEvent (the canonical OrderAck does not
carry fill price).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

### Task 2.4 — Migrate `cancelOrder` → `orders.cancel`

- [ ] **Step 2.4.1:** Replace L950.

```typescript
// before:
if (this.alpaca) { try { await this.alpaca.cancelOrder(id) } catch (e) { log.warn('cancel failed', { id, err: String(e) }) } }
// after:
if (this.session) { try { await this.session.orders.cancel(id) } catch (e) { log.warn('cancel failed', { id, err: String(e) }) } }
```

- [ ] **Step 2.4.2:** Run gates + commit.

```bash
npm run typecheck && npx vitest run
git add src/main/core/trading-engine.ts
git commit -m "feat(broker): trading-engine cancels via OrderRouter.cancel (F.1 L1.A 2.4)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

### Task 2.5 — Migrate `getBars` × 2 → `session.data.getBars`

- [ ] **Step 2.5.1:** Replace L1591 (in `getPriorDayHlc`).

```typescript
// before:
if (!this.alpaca) return null
// ...
const bars = await this.alpaca.getBars(sym, '1Day', startIso)
// after:
if (!this.session) return null
// ...
const bars = await this.session.data.getBars(sym, '1Day', startIso)
```

**Wait — '1Day' is not in the `HistoricalTimeframe` union (`'1Min' | '1Hour'`).** Either expand the union to include '1Day' (preferred, since the engine uses it) or keep this one call on `this.alpaca` direct.

- [ ] **Step 2.5.2:** Expand the union.

```typescript
// src/shared/types.ts
export type HistoricalTimeframe = '1Min' | '1Hour' | '1Day'
```

Confirm `AlpacaClient.getBars` already accepts `'1Day'` (the engine calls it that way today). Confirm `live-market.test.ts` tests still pass.

- [ ] **Step 2.5.3:** Replace L2188 (in the backfill region).

```typescript
// before:
if (isAlpacaServable && this.alpaca?.isConfigured) {
  try {
    const fetched = await this.alpaca.getBars(sym, '1Min', startIso)
// after:
if (isAlpacaServable && this.session) {
  try {
    const fetched = await this.session.data.getBars(sym, '1Min', startIso)
```

Note: `isConfigured` becomes `session !== null` here. The semantic is "is the broker side reachable?" — `session !== null` covers that.

- [ ] **Step 2.5.4:** Run gates + commit.

```bash
npm run typecheck && npx vitest run
git add src/shared/types.ts src/main/core/trading-engine.ts src/main/services/live-market.ts src/main/services/live-market.test.ts
git commit -m "$(cat <<'EOF'
feat(broker): trading-engine fetches bars via session.data.getBars (F.1 L1.A 2.5)

Migrates L1591 (prior-day HLC) and L2188 (backfill region). Expands
HistoricalTimeframe to include '1Day' to support the prior-day HLC
path; LiveMarket delegate now covers all three timeframes.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

### Task 2.6 — Migrate `msSinceLastTick` → `session.data.msSinceLastTick`

- [ ] **Step 2.6.1:** Replace L1740.

```typescript
// before:
latencyMs: this.alpaca ? this.alpaca.msSinceLastTick : 0,
// after:
latencyMs: this.session ? this.session.data.msSinceLastTick() : 0,
```

- [ ] **Step 2.6.2:** Run gates + commit.

```bash
npm run typecheck && npx vitest run
git add src/main/core/trading-engine.ts
git commit -m "feat(broker): trading-engine reads msSinceLastTick via session.data (F.1 L1.A 2.6)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

### Task 2.7 — Migrate `getClock` + `getAccount` + `getPositions`

- [ ] **Step 2.7.1:** Replace `syncMarketClock` body (L1768-1776).

```typescript
// before:
if (!this.alpaca) return
try {
  const clock = await this.alpaca.getClock()
  this.om.setMarketOpen(clock.isOpen)
} catch (err) { log.warn('clock sync failed', { err: String(err) }) }
// after:
if (!this.session) return
try {
  const clock = await this.session.data.getClock()
  this.om.setMarketOpen(clock.isOpen)
} catch (err) { log.warn('clock sync failed', { err: String(err) }) }
```

- [ ] **Step 2.7.2:** Replace `syncAlpacaAccount` body (L1973-1984).

```typescript
// before:
if (!this.alpaca) return
try {
  const [snap, positions] = await Promise.all([this.alpaca.getAccount(), this.alpaca.getPositions()])
  const satexPositions = positions.map(p => AlpacaClient.toSatexPosition(p, Date.now()))
  this.om.syncFromAlpaca(snap, satexPositions)
// after:
if (!this.session) return
try {
  const snap = await this.session.account.getSnapshot()
  this.om.syncFromSnapshot(snap)
```

Also rename the method `syncAlpacaAccount` → `syncBrokerAccount` for clarity (and update the timer that calls it). Use Edit with `replace_all: true` for the rename.

- [ ] **Step 2.7.3:** Run gates + commit.

```bash
npm run typecheck && npx vitest run
git add src/main/core/trading-engine.ts
git commit -m "$(cat <<'EOF'
feat(broker): trading-engine reads clock + account via session facets (F.1 L1.A 2.7)

- syncMarketClock now calls session.data.getClock()
- syncAlpacaAccount renamed to syncBrokerAccount; calls
  session.account.getSnapshot() and OrderManager.syncFromSnapshot()
- AlpacaClient.toSatexPosition translation no longer needed at the
  call-site (AlpacaAccountSyncer does it internally)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

### Task 2.8 — Verify zero residual `this.alpaca.*` in `trading-engine.ts`

- [ ] **Step 2.8.1:** Grep.

```bash
git grep -n "this\.alpaca\." 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/core/trading-engine.ts
```

Expected: **zero results.** If any survive, identify which task missed them and fix (likely a `this.cryptoAlpaca ?? this.alpaca` site at ~L1728 — the crypto WS path which is out of scope per spec §7 #3; this MAY need to migrate too if it shows in the grep). Re-read trading-engine.ts:1725-1750 carefully and decide:
- If only `this.cryptoAlpaca` matches remain — those are crypto WS engine-owned and are NOT covered by F.1 (per spec §7 #3). Reword the residual grep to exclude `cryptoAlpaca`.
- If a `this.alpaca` (without `crypto`) remains — that's a migration miss. Fix and re-grep.

The DoD grep semantics: only `live-market.ts` should match `this.alpaca.X` where `.X` accesses Alpaca-client API. Crypto WS surface is allowed because it's engine-owned and the spec says so.

- [ ] **Step 2.8.2:** If the crypto WS reference is the only one remaining, document it inline.

```typescript
// trading-engine.ts ~L1728 — add comment
// F.1 L1.A: this.alpaca reference here is the cryptoAlpaca fallback —
// crypto WS is engine-owned (not part of BrokerSession today, per
// program-design.md §7 #3). Migrating crypto WS into a session facet
// is a follow-up. The DoD grep in §2 #1 of the program design refers
// to engine-side BROKER calls, not the crypto-fallback ternary.
const cryptoClient = this.cryptoAlpaca ?? this.alpaca
```

- [ ] **Step 2.8.3:** Commit if comment added.

```bash
git add src/main/core/trading-engine.ts
git commit -m "docs(broker): clarify cryptoAlpaca-fallback exception (F.1 L1.A 2.8)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 3 — Migrate `historical-importer.ts` (6 call-sites)

### Task 3.1 — Refactor constructor to take `MarketDataSource`

**Files:**
- Modify: `src/main/services/historical-importer.ts`
- Modify: `src/main/services/historical-importer.test.ts`
- Modify: callers (find via grep)

- [ ] **Step 3.1.1:** Find construction sites.

```bash
grep -rn "new HistoricalImporter\|HistoricalImporter(" 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/ 2>&1
```

- [ ] **Step 3.1.2:** Update constructor signature.

```typescript
// src/main/services/historical-importer.ts
import type { MarketDataSource } from '@shared/broker/market-data-source'

export class HistoricalImporter {
  constructor(private readonly data: MarketDataSource | null) {}
  // ...
```

(Replace `private readonly alpaca: AlpacaClient | null` with `private readonly data: MarketDataSource | null`.)

- [ ] **Step 3.1.3:** Update construction site in trading-engine.

```bash
grep -n "new HistoricalImporter" 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/core/trading-engine.ts
```

For each match, pass `this.market` (the LiveMarket or sim/replay source) instead of `this.alpaca`. If passed `null` today (sim mode), can still pass `this.market` — it's not null even in sim mode.

- [ ] **Step 3.1.4:** Update tests that constructed with `AlpacaClient`-like fake to pass a `MarketDataSource`-like fake instead.

### Task 3.2 — Replace `isConfigured` checks × 3 → `this.data !== null`

**Decision note:** `isConfigured` meant "Alpaca credentials are present." With the constructor taking `MarketDataSource`, the equivalent is "we have a data source" (`this.data !== null`). A simulator data source DOES NOT support historical Alpaca bars — but `MarketSimulator.getBars()` returns `[]`, so the importer gracefully reports no bars rather than failing.

- [ ] **Step 3.2.1:** Replace L60.

```typescript
// before:
if (!this.alpaca || !this.alpaca.isConfigured) {
  return { ok: false, reason: 'No Alpaca credentials — open Settings and paste your paper key/secret first.' }
}
// after:
if (!this.data) {
  return { ok: false, reason: 'No data source available — open Settings and paste your paper key/secret first.' }
}
```

(The error message stays Alpaca-flavored only if we're confident the importer only fires when Alpaca is the broker. If multi-broker becomes a concern, drop the "paper key/secret" hint and use a broker-agnostic message.)

- [ ] **Step 3.2.2:** Replace L209 + L239 the same way.

### Task 3.3 — Replace `getBars` × 2 + `getCryptoBars` × 1 → `this.data.{getBars,getCryptoBars}`

- [ ] **Step 3.3.1:** Replace L105, L221, L250.

```typescript
// L105:
const bars = await this.data.getBars(symbol, tf, startIso, endIso)
// L221:
const bars = await this.data.getBars(symbol.trim().toUpperCase(), tf, startIso, endIso)
// L250:
const bars = await this.data.getCryptoBars(symbol.trim().toUpperCase(), tf, startIso, endIso)
```

- [ ] **Step 3.3.2:** Run gates.

```bash
cd 00-PROJECT-ROOT/01-SATEX-CORE/satex-app && npm run typecheck && npx vitest run src/main/services/historical-importer.test.ts
```

Expected: green. If tests assumed AlpacaClient construction, updated by 3.1.4 to use a `MarketDataSource` fake.

- [ ] **Step 3.3.3:** Verify zero residual `this.alpaca.*` in historical-importer.

```bash
git grep -n "this\.alpaca\." 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/services/historical-importer.ts
```

Expected: zero results.

- [ ] **Step 3.3.4:** Commit.

```bash
git add src/main/services/historical-importer.ts src/main/services/historical-importer.test.ts src/main/core/trading-engine.ts
git commit -m "$(cat <<'EOF'
feat(broker): HistoricalImporter consumes MarketDataSource (F.1 L1.A 3)

- Constructor now takes MarketDataSource | null (was AlpacaClient | null)
- isConfigured checks become null-checks on the data source
- getBars / getCryptoBars route through MarketDataSource delegates
- trading-engine construction site passes this.market to the importer

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4 — Async `shutdown()` migration

The current `engine.shutdown()` is synchronous; `app.on('before-quit', () => engine.shutdown())` in `main/index.ts:1059` does NOT await. After F.1 L1.A, `session.disconnect()` is async, so `shutdown()` should become async to await it, AND `before-quit` needs the standard `event.preventDefault()` + `await` + `app.quit()` pattern.

### Task 4.1 — Refactor `engine.shutdown()` to async + await `session.disconnect()`

**Files:**
- Modify: `src/main/core/trading-engine.ts` line 645
- Modify: `src/main/index.ts` lines 170, 1055, 1059
- Modify: `src/main/services/order-manager.ts` — DELETE the legacy `syncFromAlpaca` wrapper added in 1.7.4 (Knip should flag it now)

- [ ] **Step 4.1.1:** Verify Knip flags `syncFromAlpaca`.

```bash
cd 00-PROJECT-ROOT/01-SATEX-CORE/satex-app && npm run knip 2>&1 | grep syncFromAlpaca
```

Expected: knip flags `syncFromAlpaca` as unused export/member. If not flagged, the production caller in Phase 2.7 didn't migrate — go back and verify.

- [ ] **Step 4.1.2:** Delete `syncFromAlpaca` wrapper + its tests.

```typescript
// src/main/services/order-manager.ts — remove the @deprecated wrapper
```

Update any test references.

- [ ] **Step 4.1.3:** Add failing test for async shutdown.

```typescript
// src/main/core/trading-engine.test.ts
it('shutdown awaits session.disconnect()', async () => {
  const engine = makeEngine() // existing helper
  let disconnected = false
  engine['session'] = { disconnect: async () => { await new Promise(r => setTimeout(r, 5)); disconnected = true } } as any
  await engine.shutdown()
  expect(disconnected).toBe(true)
})
```

- [ ] **Step 4.1.4:** Refactor `shutdown()` to async.

```typescript
// trading-engine.ts:645
async shutdown(): Promise<void> {
  // ... all the existing sync cleanup ...
  if (this.session) {
    try { await this.session.disconnect() } catch (e) { log.warn('session disconnect failed', { err: String(e) }) }
  }
}
```

- [ ] **Step 4.1.5:** Update `main/index.ts:170` and `:1055`.

```typescript
// :170
try { await engine.shutdown() } catch (e) { /* ... */ }
// (the containing function must be async — likely already is in a top-level cleanup)

// :1055
await engine.shutdown()
```

- [ ] **Step 4.1.6:** Update `main/index.ts:1059` with the proper before-quit pattern.

```typescript
// :1059
let isQuitting = false
app.on('before-quit', (event) => {
  if (isQuitting) return
  event.preventDefault()
  isQuitting = true
  engine.shutdown()
    .catch((e) => log.warn('engine shutdown failed', { err: String(e) }))
    .finally(() => app.quit())
})
```

- [ ] **Step 4.1.7:** Run gates + electron-launch test (if one exists) + commit.

```bash
npm run typecheck && npm run lint && npx vitest run && npm run knip
git add src/main/core/trading-engine.ts src/main/core/trading-engine.test.ts src/main/index.ts src/main/services/order-manager.ts src/main/services/order-manager.test.ts
git commit -m "$(cat <<'EOF'
feat(broker): async shutdown awaits session.disconnect (F.1 L1.A 4)

- engine.shutdown() returns Promise<void> and awaits session.disconnect()
- main/index before-quit handler uses event.preventDefault() + await
  pattern so Electron actually waits for clean session teardown
- main/index :170 / :1055 callers updated to await
- OrderManager.syncFromAlpaca legacy wrapper removed (Knip-flagged)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 5 — DoD verification + PR

### Task 5.1 — Final DoD grep

- [ ] **Step 5.1.1:** Run the program-spec DoD #1 grep.

```bash
cd 00-PROJECT-ROOT/01-SATEX-CORE/satex-app
git grep -n "this\.alpaca\." -- src/
```

Expected output: ONLY matches inside `src/main/services/live-market.ts` (the 5 LiveMarket sites) and the one documented `this.cryptoAlpaca ?? this.alpaca` fallback in `trading-engine.ts:~1728` (with the comment added in 2.8.2).

If ANY other `this.alpaca.*` survives, that's a migration miss — fix before continuing.

- [ ] **Step 5.1.2:** Document the exception explicitly.

The DoD allows `live-market.ts` matches (it IS the LiveMarket concrete). The cryptoAlpaca fallback is a documented exception. Total expected: 5 (live-market) + 1 (crypto fallback). Anything beyond that is a defect.

### Task 5.2 — Run all four gates fully

- [ ] **Step 5.2.1:**

```bash
npm run typecheck
npm run lint
npm test
npm run knip
```

Each must pass. Capture the test count + any warnings. Expected: 423+ tests (existing F.1 baseline) + the new tests added in Phase 1.2-1.5, 1.7, 2.1, 4.1.

### Task 5.3 — Self-review the diff

- [ ] **Step 5.3.1:** Review the full branch diff.

```bash
git diff master...HEAD --stat
git diff master...HEAD -- src/main/core/trading-engine.ts | head -200
```

Check for:
- Accidental whitespace-only changes
- Lost log statements
- Lost side-effects (the slippage capture migration in 2.3 is the highest-risk transformation — re-read it)
- Any TODO / FIXME markers introduced

- [ ] **Step 5.3.2:** Re-read trading-engine.ts around the order-submission path (~L900-960) and confirm the new path emits log statements matching the pre-migration semantics. Differences are acceptable but should be intentional.

### Task 5.4 — Open PR + request human sign-off

- [ ] **Step 5.4.1:** Push branch.

```bash
git push -u origin feat/f1-broker-adapter-impl
```

- [ ] **Step 5.4.2:** Open PR.

```bash
gh pr create --title "F.1 L1.A: broker-port completion — 19 sites migrated" --body "$(cat <<'EOF'
## Summary

Completes F.1 by migrating the 19 remaining `this.alpaca.*` direct call-sites in `trading-engine.ts` (13) and `historical-importer.ts` (6) to the `BrokerSession` facets. Closes program spec §5.1 L1.A.

Per AGENTS.md trading-safety guardrails, this PR touches `OrderManager`-adjacent paths (submit / cancel / account sync) and **requires explicit human sign-off**.

## Changes by phase

- **Phase 0:** Locked 4 decisions (D1.A canonical OrderEvent, D2.A caller-supplied clientOrderId, D3.A MarketDataSource extension, D4.A syncFromSnapshot)
- **Phase 1:** Extended `MarketDataSource` with `getBars`/`getCryptoBars`/`getClock`/`isConnected`/`msSinceLastTick`; implemented on `LiveMarket` (delegate), `MarketSimulator` + `ReplaySource` (safe defaults). Added `OrderManager.syncFromSnapshot(AccountSnapshot)`.
- **Phase 2:** Migrated 13 engine call-sites: order subscriptions, isMarketConnected, submitOrder (with new clientOrderId provenance + async slippage capture), cancelOrder, getBars × 2, msSinceLastTick, getClock, getAccount + getPositions.
- **Phase 3:** `HistoricalImporter` constructor now takes `MarketDataSource | null`; all 6 sites migrated.
- **Phase 4:** `engine.shutdown()` async; Electron `before-quit` uses preventDefault + await + app.quit pattern; deleted legacy `OrderManager.syncFromAlpaca` (Knip-flagged).
- **Phase 5:** DoD grep returns only the expected `live-market.ts` + documented `cryptoAlpaca` fallback matches; 4 gates green.

## Trading-safety blast radius

- `submitOrder` path — changed from synchronous fill capture to async via `OrderRouter.onUpdate` FILL event. Slippage capture moved with it; semantics preserved.
- `cancelOrder` path — direct delegate; no semantic change.
- `OrderManager.syncFromSnapshot` — new method; consumes canonical `AccountSnapshot`. Old `syncFromAlpaca` wrapper deleted in Phase 4.
- Kill-switch + live-mode interlock + MAY-TACTICS interlock: **NOT touched.**
- IPC payload Zod validation: **NOT touched.**
- safeStorage credentials handling: **NOT touched.**

## Test plan

- [ ] Reviewer runs all four gates locally — confirms green
- [ ] Reviewer reads the new `onOrderEvent` handler (replaces `onAlpacaTradeUpdate`) and confirms every prior side-effect is preserved
- [ ] Reviewer reads the new slippage-capture path inside `onOrderEvent` FILL handler and confirms entry-features semantic matches the prior synchronous capture
- [ ] Reviewer reads `before-quit` handler and confirms the await-then-app.quit() pattern is non-blocking on the renderer
- [ ] Reviewer confirms the DoD grep result matches expected (live-market.ts only + documented crypto fallback)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5.4.3:** Wait for CI green + explicit human sign-off comment on the PR. **Do not merge autonomously.**

- [ ] **Step 5.4.4:** Once approved: `gh pr merge <N> --merge`. Verify head SHA in master. Pull `master` locally.

```bash
gh pr merge --merge
git checkout master && git pull --ff-only
git log --oneline -3
# Expect: the L1.A merge commit at the tip
```

L1.A complete. Master gains complete F.1 broker abstraction. Downstream L1.B unblocked.

---

## Appendix — Verification commands quick-reference

| What | Command |
|---|---|
| DoD §2 #1 grep | `git grep -n "this\.alpaca\." -- src/` |
| All four gates | `npm run typecheck && npm run lint && npm test && npm run knip` |
| Branch ahead count | `git rev-list --count master..HEAD` |
| Branch diff stat | `git diff master...HEAD --stat` |

## Appendix — Rollback procedure (per phase)

If a phase regresses gates or surfaces unexpected behavior:

1. Identify the offending commit: `git log --oneline master..HEAD`
2. Revert it: `git revert <sha> --no-edit`
3. Verify gates: `npm run typecheck && npm test`
4. Push the revert: `git push origin feat/f1-broker-adapter-impl`
5. Document in PR comment what was reverted and why
6. Re-plan the affected task before re-attempting
