# L1.D Deep Review — Improvement & Upgrade Brainstorm
**Date:** 2026-06-14  
**Scope:** All files added or modified by `feat/l1d-funded-compliance`  
**Branch tip reviewed:** `b2fc769` (post 3-bug-fix commit)  
**Reviewer:** SATEX internal audit cycle  
**Gate status at review:** 763 / 64 green

---

## Already Fixed (this branch)

| # | File | Bug |
|---|------|-----|
| B1 | `funded-account.ts` | `broadcast()` passed `equity=0` → mllBuffer always wrong in push events |
| B2 | `risk-gates.ts` | `MLL_BUFFER` gauge shared `trailingMaxDdPct/Status` instead of own vars |
| B3 | `trading-engine.ts` | `fundedTick()` had 60 s boot blind window before first interval fires |

---

## P0 — Compliance / Live-Capital Blockers

These must be resolved before any funded-account feature ships to a real Topstep account.

### P0-A · `dailyLossLimit` field is completely ignored (dead code)

**File:** `src/shared/funded/topstep-50k-xfa.ts`, `src/main/services/order-manager.ts`

Gate 3 enforces `DAILY_LOSS_LIMIT_PCT × sessionStartEquity` (a percentage of starting equity), ignoring `profile.dailyLossLimit` entirely. For a $100 K session start with `dailyLossLimit: 1_000`, Gate 3 would allow a $2 K daily loss — a direct Topstep rule violation.

**Fix:** In Gate 3, when a funded profile is active, enforce `min(sessionStartEquity × pct, profile.dailyLossLimit)`. The funded-account profile's absolute DLL always wins when tighter.

```typescript
// order-manager.ts Gate 3
const pctLimit = sessionStartEquity * DAILY_LOSS_LIMIT_PCT
const absoluteLimit = fundedProfile ? fundedProfile.dailyLossLimit : Infinity
const effectiveDll = Math.min(pctLimit, absoluteLimit)
if (-account.dailyPnl >= effectiveDll) ...
```

---

### P0-B · `worstCaseLossDollar` stop direction not validated

**File:** `src/main/core/trading-engine.ts` (lines ~999–1002)

```typescript
worstCaseLossDollar: Math.abs((quote.last - req.stopLoss) * req.quantity)
```

If a buy order has `stopLoss > quote.last` (user input error — stop above current price), `(quote.last - stopLoss)` is negative. `Math.abs` silently makes it positive, creating a fake "small loss" that Gate 9 passes. The result: a position opens with an inverted stop, risking the full MLL with no gate enforcement.

**Fix:** Add stop-direction validation before the gate context assembly:
```typescript
const stopValid = req.stopLoss != null
  && (req.side === 'buy'  ? req.stopLoss < (quote?.last ?? Infinity)
                          : req.stopLoss > (quote?.last ?? 0))
const worstCase = stopValid && quote
  ? Math.abs((quote.last - req.stopLoss!) * req.quantity)
  : undefined // undefined → Gate 9 uses undefined path (no stop protection)
```

When `worstCase` is undefined Gate 9 currently passes (no `ctx.worstCaseLossDollar`). A stricter policy: reject the order when no valid stop is provided and a funded profile is active.

---

### P0-C · EOD flatten repeats on app restart past cutoff

**File:** `src/main/services/eod-flatten.ts`, `src/main/services/funded-account-store.ts`

`EodFlattenService.lastFiredDate` is in-memory only (resets to `null` on each process restart). With Bug 3's fix (`fundedTick()` fires immediately at boot), if the user restarts SATEX at 16:11 ET, the immediate tick fires `onEodFlatten()` again. Positions are already closed so `flattenAllPositions` is a no-op, but `armKillSwitch()` fires again, logging noise and adding confusion.

**Fix:** Persist `lastFiredDate` in `FundedAccountStore`:

```typescript
// FundedAccountStored — add:
lastEodFiredDate: string | null

// EodFlattenService — inject store reference; on hydrate:
this.lastFiredDate = stored.lastEodFiredDate ?? null

// FundedAccountStore — add to sanitize(), save() schema
```

This also prevents spurious flattens during rapid dev restarts.

---

## P1 — High: Correctness Bugs

### P1-A · `recordEod` fires on every post-cutoff fill (N persist calls per EOD flatten)

**File:** `src/main/core/trading-engine.ts` (lines ~373–381)

```typescript
this.om.onOrderFill((order, position) => {
  ...
  if (profile && isPastFlatBy(now, profile.flatBy)) {
    this.fundedAccount.recordEod(this.om.getAccount().equity, now)
  }
})
```

The EOD flatten calls `cancelAllOrders()` + `flattenAllPositions()`. Each position close triggers `onOrderFill`, each of which calls `recordEod()` → `EquityHWMService.recordEod()` → `persist()` → `writeFileSync`. For 5 open positions, that's 5 synchronous disk writes in rapid succession.

`EquityHWMService.recordEod()` is idempotent per trading-day key (it overwrites the entry), so the final ledger state is correct. The only harm is N unnecessary I/O calls plus N `broadcast()` calls flooding listeners with intermediate equity values.

**Fix:** Debounce the record-EOD trigger. Either:
1. Record once in `onEodFlatten()` after all closes complete, not per fill. 
2. Or add a `pendingEodRecord` flag cleared once per day.

Option 1 is cleanest:
```typescript
private onEodFlatten(reason: string): void {
  const cancelled = this.om.cancelAllOrders()
  const flattened = this.om.flattenAllPositions(...)
  this.om.armKillSwitch(...)
  // Record once, after all fills have settled
  this.fundedAccount.recordEod(this.om.getAccount().equity, new Date())
  log.warn('EOD flatten executed', { reason, cancelled, flattened })
}
```

And remove the `onOrderFill` recordEod hook entirely (or scope it to non-flatten fills only).

---

### P1-B · `broadcast()` is not called from `tick()`

**File:** `src/main/services/funded-account.ts`

`FundedAccountService.tick()` delegates to `EodFlattenService.tick()` but never calls `this.broadcast()`. This means the renderer's `msToFlatBy` countdown field in the funded panel only refreshes when a profile is set or EOD is recorded — not on each 60-second engine tick. The countdown appears frozen.

**Fix:**
```typescript
tick(now: Date): void {
  this.eod.tick(now)
  this.broadcast() // refresh msToFlatBy countdown every tick
}
```

This is cheap — `broadcast()` is already called on other state changes.

---

### P1-C · `setProfile()` switch doesn't reset `EodFlattenService.lastFiredDate`

**File:** `src/main/services/funded-account.ts`

When switching profiles mid-session, `hwm.reset()` and `eod.reset()` are called. `eod.reset()` wipes `lastFiredDate` to null. Good. BUT: when switching to a new profile with a different `flatBy.tz`, the `lastFiredDate` key format (`YYYY-MM-DD` in the OLD profile's tz) may not match the new profile's tz, silently skipping or double-firing EOD.

**Fix:** Always normalize `lastFiredDate` using the *current* profile's tz when comparing, not the tz at the time the date was recorded. Or, simpler: `eod.reset()` unconditionally on any profile change (already done), AND log the tz mismatch as a warning.

Additionally: switching profiles with open positions that exceed the new profile's `maxContracts` will not be caught until the next order submission. Add a post-switch position audit:
```typescript
setProfile(id: string | null): { ok: boolean; reason?: string } {
  ...
  // Audit open positions against new profile limits — log warnings
  if (next) this.auditPositionLimits(next)
  ...
}
```

---

### P1-D · `cachedBlackout` in `RiskGatesService` lags 60 seconds behind order-gate

**File:** `src/main/core/trading-engine.ts` (`fundedTick`), `src/main/services/risk-gates.ts`

`fundedTick()` (now running immediately at boot + every 60s) computes and caches the blackout result in `this.cachedBlackout`. `RiskGatesService.get()` reads this cached value for the NEWS_BLACKOUT display gauge.

Meanwhile, Gate 10 in `OrderManager.validate()` calls `isInBlackout(nowMs, ctx.macroEvents, ...)` at submission time — always fresh.

The result: a user can see "NEWS_BLACKOUT: clear" in the display while having an order rejected for blackout. The display is up to 60s stale relative to the gate.

**Fix option A (cheap):** Reduce `fundedTick` interval from 60s to 5s. 5s is still way under the 60s blackout window.

**Fix option B (correct):** `RiskGatesService` reads `getBlackout` at render time instead of from a 60s-stale cache. Thread `getBlackout: () => this.computeBlackout()` as a live dep into RiskGatesService (same pattern as `getFundedSnapshot`). The engine would expose a `computeBlackout()` method.

Option B is cleaner but requires removing `cachedBlackout` from engine state entirely.

---

## P2 — Medium: Architecture & Robustness

### P2-A · `FundedAccountStore.save()` is not atomic

**File:** `src/main/services/funded-account-store.ts`

```typescript
writeFile: (path, data) => writeFileSync(path, data, 'utf8'),
```

A crash or power-loss mid-write corrupts the JSON file. On next boot, `sanitize()` silently returns empty state — the ledger is lost. This means the HWM resets to 0, and `computeMll()` falls back to `initialBalance - trailingMaxDrawdown`, potentially allowing trades that would violate the true MLL.

**Fix:** Use temp-file-rename atomic write (same pattern as kill-switch-store should use):
```typescript
writeFile: (path, data) => {
  const tmp = path + '.tmp'
  writeFileSync(tmp, data, 'utf8')
  renameSync(tmp, path)
}
```

On Windows, `renameSync` over an existing file succeeds atomically (NTFS replace). The store already has crash-recovery via `sanitize()`, but atomic write eliminates the failure mode entirely.

---

### P2-B · `cancelAllOrders()` in live Alpaca mode only cancels local OM state

**File:** `src/main/services/order-manager.ts`, `src/main/core/trading-engine.ts` `onEodFlatten`

`om.cancelAllOrders()` sets local order status to 'canceled' and fires fill callbacks — it does NOT send cancel requests to Alpaca. In live mode, Alpaca-side orders remain open and could fill after the EOD flatten, reopening positions that were just closed. This is the highest-risk live-capital gap in the funded implementation.

**Fix:** In `onEodFlatten()`, route cancels through the broker session's `OrderRouter`:
```typescript
private async onEodFlatten(reason: string): Promise<void> {
  // Cancel live broker orders first
  if (this.session) {
    const liveOrders = this.om.getOpenOrders().map(o => o.orderId)
    await Promise.all(liveOrders.map(id => this.session!.router.cancel(id)))
  }
  // Then local state cleanup
  const cancelled = this.om.cancelAllOrders()
  ...
}
```

This requires making `onEodFlatten` async and updating the wiring in `FundedAccountDeps`.

---

### P2-C · `computeMsToFlatBy` 5-minute probe step gives display inaccuracy

**File:** `src/main/services/eod-flatten.ts`

```typescript
for (let i = 1; i <= MAX_PROBES; i++) {
  const probe = new Date(now.getTime() + i * STEP_MS) // STEP_MS = 5 min
  ...
  if (p.hour === flatBy.hour && p.minute >= flatBy.minute && p.minute < flatBy.minute + 5) {
```

For a 16:10 cutoff, probes at 16:05, 16:10, 16:15 (in local time). The match window `[minute, minute+5)` catches 16:10–16:14, so the display could show a countdown that's off by up to 5 minutes (early by up to 5 minutes).

**Fix:** Use 1-minute probe steps. `MAX_PROBES = 3 * 24 * 60` (3 days × 60 min). Still ~4320 iterations — negligible for a display-only function called at 60s cadence.

Alternatively, compute analytically: find the next occurrence of `(hour, minute)` in the given tz by computing the next day that's a weekday and constructing the exact UTC timestamp.

---

### P2-D · `FundedAccountService.broadcast()` called with stale equity on `setProfile()`

`setProfile()` calls `this.broadcast()` at the end. With Bug 1 fixed, `broadcast()` calls `this.deps.getEquity()`. But `getEquity` returns `this.om.getAccount().equity` — the real-time equity from OrderManager. On a profile CLEAR (`id=null`), the snapshot returns `active:false` with all zeros, so no equity issue. On a profile SET, the snapshot IS computed with live equity. This is fine.

However: if `setProfile()` is called before `EquityHWMService.hydrate()` has run (e.g., a race condition in boot sequence), `cachedHwm` = 0 and `computeMll()` returns `initialBalance - trailingMaxDrawdown`. The broadcast would show a stale MLL until the next tick. Not critical — the engine calls `hydrate()` before `onUpdate()`, so no real race in practice.

**Document:** Add a comment in `trading-engine.ts` noting the boot-order dependency: `new FundedAccountService()` → `hydrate()` → `onUpdate()`.

---

### P2-E · `FundedAccountService` not cleaned up on engine destroy

**File:** `src/main/core/trading-engine.ts`

The engine has a shutdown path (stop replay, disconnect session, clear timers). `fundedTickTimer` is cleared in `clearInterval(this.fundedTickTimer)` (need to verify). The `fundedAccount.onUpdate()` listener is registered but the returned cleanup function is not captured.

**Audit required:** Confirm `clearInterval(this.fundedTickTimer)` exists in the shutdown path. If not, add it. Also capture and call the `onUpdate` unsubscribe function on shutdown.

---

## P3 — Low: Polish, Display, UX

### P3-A · `phase: 'combine'` wrong for funded account metadata

**File:** `src/shared/funded/topstep-50k-xfa.ts`

The profile is named "Topstep $50K **Express Funded** Account" but has `phase: 'combine'`. The XFA (Express Funded Account) is a directly-funded vehicle — not a Combine evaluation. It should be `phase: 'funded'`.

**Fix:** Change `phase: 'combine'` → `phase: 'funded'`. This is display-only in v1 but sets up correct behavior for future code that branches on phase.

---

### P3-B · `msToFlatBy` returns `0` on weekends — indistinguishable from "EOD passed"

**File:** `src/main/services/eod-flatten.ts`

`computeMsToFlatBy()` returns `0` when `MAX_PROBES` are exhausted (shouldn't happen) and also when no probe matches (weekend with no upcoming cutoff found). The renderer displays "EOD passed (16:10 America/New_York)" which is misleading on a Saturday.

**Fix:** Return a sentinel value (e.g., `null` or `-1`) when no next flat-by is found within the probe window, and handle it distinctly in `FundedAccountSnapshot.msToFlatBy`. Add a `nextFlatByDate: string | null` field to the snapshot for the renderer.

---

### P3-C · No "activation balance" ledger seeding

When a funded profile is activated for the first time (e.g., user receives their $50K account and sets the profile), there are 0 ledger entries. `computeMll()` uses `max(initialBalance, cachedHwm) - trailingMaxDrawdown = max(50000, 0) - 2000 = 48000`. Correct.

But: the `highestEodBalance` in the snapshot shows `0`, which is confusing in the UI ("Highest EOD Balance: $0.00"). The user expects to see `$50,000`.

**Fix:** On `setProfile(id)`, if the ledger is empty, seed it with a synthetic entry at `initialBalance` dated to today. This gives the UI a sensible starting point without affecting the MLL calculation (which already uses `max(initialBalance, hwm)`).

---

### P3-D · Ledger history not visible in any renderer panel

The `FundedAccountSnapshot.ledger` field carries the full EOD history but no renderer component displays it. Users have no visibility into their HWM progression.

**Enhancement:** Add a collapsible "HWM Ledger" table to the funded account panel showing date, equity, and distance to MLL per day. This is especially useful for debugging rule violations and understanding lock threshold proximity.

---

### P3-E · `MLL_BUFFER` label ambiguity

The gauge label "MLL BUFFER" is unclear. A trader unfamiliar with prop firm terminology may not know what MLL means or what "buffer" refers to.

**Fix:** Consider label "MLL BUFFER ($)" or tooltip text: "Dollar distance from current equity to your Maximum Loss Limit. Reaches $0 = trading halted."

---

### P3-F · NEWS_BLACKOUT value doesn't show time-to-resume when in blackout

When `inBlackout` is true, the gauge shows `"US CPI · 30s before"` (time until event) but doesn't show when trading resumes (time until the end of the blackout window on the other side of the event).

**Enhancement:** Post-event (blackout triggered by event that already fired), show `"US CPI · resumes in 30s"` by computing `windowMs - |msToEvent|`.

---

## P4 — Future: Unimplemented Profile Fields

These `FundedAccountProfile` fields are defined but not enforced in v1:

| Field | Current state | Required for |
|-------|--------------|-------------|
| `profitTarget` | stored, not enforced | Displaying progress-to-target in UI |
| `minTradingDays` | stored, not enforced | Combine pass gate (XFA = 0, standard Combine = 5) |
| `consistencyMaxDayFraction` | stored, not enforced | Topstep payout consistency rule (funded phase only) |

None of these affect the Topstep XFA Combine account (all set to 0), but they will be needed before adding a Topstep standard Combine or funded-phase profile.

**Roadmap item:** Implement as Gate 14 (profit target / min days / consistency) gated by `profile.minTradingDays > 0 || profile.consistencyMaxDayFraction > 0`.

---

## P5 — Testing Gaps

| Gap | Test to add |
|-----|------------|
| `broadcast()` listener receives non-zero `mllBuffer` (Bug 1 regression test) | `funded-account.test.ts`: subscribe via `onUpdate`, call `setProfile()`, assert snap.mllBuffer > 0 |
| Restart-past-cutoff double-flatten (P0-C) | `eod-flatten.test.ts`: tick → fires → reset lastFiredDate (simulate restart) → tick again → should NOT fire second time with persisted date |
| `cancelAllOrders` with live broker orders (P2-B) | Broker-session integration test with stub router |
| `computeMsToFlatBy` accuracy for non-mod-5 cutoff times (P2-C) | `eod-flatten.test.ts`: `{ hour: 16, minute: 13, tz: 'America/New_York' }` |
| `setProfile` with positions over new-profile cap logs warning (P1-C) | `funded-account.test.ts`: activate profile A (cap=5), then switch to profile B (cap=1) with open position of qty=3 → warning |
| `recordEod` N-fires per EOD flatten (P1-A) | Verify `persist()` called exactly once per EOD day, not per fill |
| `tick()` triggers `broadcast()` so msToFlatBy countdown refreshes | `funded-account.test.ts`: call `tick()`, assert listener receives updated msToFlatBy |

---

## P6 — Architecture: Multi-Profile + Live Capital Path

### Multi-broker funded compliance

The current architecture assumes Topstep + Alpaca paper. For live capital via Rithmic or Tradovate, the `OrderRouter` interface (in `@shared/broker/`) would need:

- Native order rejection propagation (Rithmic has server-side contract limits)
- Futures notional sizing (different from equity "shares" model)
- Exchange-specific session times (CME Globex hours ≠ NYSE)

**Design recommendation:** Move funded compliance to the `@shared/broker/` abstraction layer as a `ComplianceLayer` middleware that wraps any `OrderRouter`. This prevents duplicating funded logic per broker.

### Profile registry versioning

Currently: `registryGet('topstep-50k-xfa')` returns the current hardcoded object. If Topstep changes their rules (e.g., newsBlackoutWindowMs from 60s to 90s), stored sessions silently upgrade.

**Fix:** Store a `profileVersion` field alongside `activeProfileId` in `FundedAccountStored`. On mismatch at hydrate, log a warning and force user to re-confirm the active profile.

---

## Summary Priority Matrix

| ID | Item | Priority | Effort |
|----|------|----------|--------|
| P0-A | dailyLossLimit dead code / compliance gap | CRITICAL | S |
| P0-B | Stop direction not validated in worstCaseLoss | CRITICAL | S |
| P0-C | EOD re-flatten on restart past cutoff | HIGH | M |
| P1-A | recordEod N-fires per EOD flatten | HIGH | S |
| P1-B | tick() not calling broadcast() — frozen countdown | HIGH | XS |
| P1-C | setProfile switch missing position audit | MEDIUM | S |
| P1-D | cachedBlackout 60s stale vs live order gate | MEDIUM | M |
| P2-A | FundedAccountStore non-atomic write | HIGH | S |
| P2-B | cancelAllOrders doesn't cancel Alpaca-side orders | CRITICAL (live) | L |
| P2-C | computeMsToFlatBy 5-min probe inaccuracy | LOW | S |
| P2-D | Boot-order dependency not documented | LOW | XS |
| P2-E | fundedAccount onUpdate leak on engine destroy | MEDIUM | XS |
| P3-A | phase: 'combine' wrong for XFA funded | LOW | XS |
| P3-B | msToFlatBy=0 ambiguous on weekends | LOW | S |
| P3-C | No activation-balance ledger seeding | LOW | S |
| P3-D | Ledger history not shown in renderer | MEDIUM | M |
| P3-E | MLL_BUFFER label ambiguity | LOW | XS |
| P3-F | NEWS_BLACKOUT doesn't show time-to-resume | LOW | S |
| P4-* | Unimplemented profile fields (profitTarget, minDays, consistency) | MEDIUM | L |
| P5-* | 7 test coverage gaps | HIGH | M |
| P6-* | Multi-broker / registry versioning | FUTURE | XL |

**Effort key:** XS = 1 line, S = <1h, M = half-day, L = 1+ day, XL = multi-sprint

