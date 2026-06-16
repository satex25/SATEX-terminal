# SATEX — Funded Account: Master Execution Plan
> **Branch:** `feat/l1d-funded-compliance` · **Date:** 2026-06-14  
> **Status:** Active implementation sprint  
> **Gate baseline:** 763 / 64 green (post B1-B3 bug fixes)

---

## ◉ LEGEND

| Symbol | Meaning |
|--------|---------|
| ✅ | Shipped & committed |
| 🔧 | In-progress this sprint |
| ⚠️ | CRITICAL — live-capital path, requires human sign-off |
| 🟡 | High priority — autonomous implementation |
| 🟢 | Medium / low — backlog |
| 🔒 | OPERATOR ONLY — cannot be autonomous |

---

## ◉ PHASE 0 — Previously Completed (B1–B3)

| # | Item | Status |
|---|------|--------|
| B1 | `broadcast()` passed `equity=0` — mllBuffer always wrong in push events | ✅ |
| B2 | `MLL_BUFFER` gauge shared `TRAILING_MAXDD` pct/status instead of own vars | ✅ |
| B3 | `fundedTick()` had 60 s boot blind window before first interval fires | ✅ |

---

## ◉ PHASE 1 — Current Sprint: All Remaining Funded-Account Fixes

### P0-A · Gate 3: `dailyLossLimit` is Dead Code ⚠️ CRITICAL COMPLIANCE
- **File:** `src/main/services/order-manager.ts` (Gate 3 block, ~line 248)
- **Bug:** Gate 3 enforces `sessionStartEquity × DAILY_LOSS_LIMIT_PCT` only. `profile.dailyLossLimit` is stored but never read. A $100K session start with a $1K DLL profile allows a $2K daily loss — direct Topstep rule violation.
- **Fix:** `effectiveDll = min(sessionStartEquity × pct, profile.dailyLossLimit)` when funded profile active.
- **Test:** `order-manager.test.ts` — funded profile DLL tighter than pct limit wins; session-only pct still enforced without profile.

```typescript
// BEFORE (Gate 3):
const dailyLoss = this.sessionStartEquity - this.account.equity
if (dailyLoss >= this.sessionStartEquity * this.account.dailyLossLimitPct)

// AFTER:
const dailyLoss = this.sessionStartEquity - this.account.equity
const pctLimit = this.sessionStartEquity * this.account.dailyLossLimitPct
const absoluteLimit = ctx?.fundedProfile?.dailyLossLimit ?? Infinity
const effectiveDll = Math.min(pctLimit, absoluteLimit)
if (dailyLoss >= effectiveDll) {
  const reason = absoluteLimit < pctLimit
    ? `Daily loss limit reached — funded cap $${absoluteLimit.toFixed(0)}`
    : `Daily loss limit reached (${(this.account.dailyLossLimitPct * 100).toFixed(1)}%)`
  return { ok: false, reason, gate: 'daily-loss' }
}
```

---

### P0-B · Gate 9: Inverted Stop Passes with Wrong Worst-Case ⚠️ CRITICAL
- **File:** `src/main/core/trading-engine.ts` (submitOrder context assembly, ~line 1001)
- **Bug:** `Math.abs((quote.last - req.stopLoss) * req.quantity)` — if a BUY order has `stopLoss > quote.last` (stop above price), `Math.abs` makes the number positive and Gate 9 sees a tiny "loss" that passes. The real loss is unbounded.
- **Fix:** Validate stop direction first; omit `worstCaseLossDollar` when stop is inverted (Gate 9 falls back to raw equity check, which is safe).

```typescript
// Extract before the ctx spread:
let worstCaseLossDollar: number | undefined
if (this.fundedAccount.getProfile() && req.stopLoss != null && quote) {
  const stopValid = req.side === 'buy'
    ? req.stopLoss < quote.last
    : req.stopLoss > quote.last
  if (stopValid) {
    worstCaseLossDollar = Math.abs((quote.last - req.stopLoss) * req.quantity)
  } else {
    log.warn('funded: stop direction inverted — omitting worst-case projection', {
      symbol: req.symbol, side: req.side, stop: req.stopLoss, last: quote.last,
    })
  }
}
// Then in ctx spread:
...(worstCaseLossDollar !== undefined ? { worstCaseLossDollar } : {}),
```

---

### P0-C · EOD Re-Flatten on App Restart 🟡 HIGH
- **Files:** `eod-flatten.ts`, `funded-account-store.ts`, `funded-account.ts`
- **Bug:** `EodFlattenService.lastFiredDate` is in-memory only. With the Bug-B3 fix (immediate fundedTick at boot), restarting SATEX after 16:10 ET triggers the flatten callback again. Positions are already closed so it's a no-op, but it re-arms the kill switch noisily and will cause confusion.
- **Fix:** Persist `lastFiredDate` in `FundedAccountStore`; hydrate into `EodFlattenService` on boot.

**Schema change** (`FundedAccountStored`):
```typescript
lastEodFiredDate: string | null  // ADD — YYYY-MM-DD in profile tz
```

**`EodFlattenDeps` additions** (optional so tests don't break):
```typescript
setLastFiredDate?: (date: string) => void
```

**`EodFlattenService` additions**:
```typescript
hydrate(date: string | null): void { this.lastFiredDate = date }
getLastFiredDate(): string | null   { return this.lastFiredDate }
```

**`FundedAccountService.hydrate()`** calls `this.eod.hydrate(stored.lastEodFiredDate ?? null)`  
**`persist()`** saves `lastEodFiredDate: this.eod.getLastFiredDate()`

---

### P1-A · `recordEod` Fires N×/EOD (One Per Position Close) 🟡 HIGH
- **File:** `src/main/core/trading-engine.ts` (onOrderFill hook + onEodFlatten)
- **Bug:** Each `flattenAllPositions` close triggers `onOrderFill` → `recordEod()` → `persist()` → `writeFileSync`. 5 positions = 5 sync disk writes + 5 broadcast events with intermediate equity values.
- **Fix:** Remove recordEod from onOrderFill entirely. Call it exactly once in `onEodFlatten()` after all positions are settled.

```typescript
// REMOVE from onOrderFill:
if (profile && isPastFlatBy(now, profile.flatBy)) {
  this.fundedAccount.recordEod(this.om.getAccount().equity, now)
}

// ADD to onEodFlatten() (after flattenAllPositions):
if (this.fundedAccount.getProfile()) {
  this.fundedAccount.recordEod(this.om.getAccount().equity, new Date())
}
```

---

### P1-B · `tick()` Never Calls `broadcast()` — Frozen Countdown 🟡 HIGH (1 line)
- **File:** `src/main/services/funded-account.ts` (tick method)
- **Bug:** `msToFlatBy` countdown in the renderer only refreshes when a profile is set or EOD recorded. It never refreshes during the 60-second engine tick cycle. The countdown appears frozen.
- **Fix:** `this.broadcast()` at the end of `tick()`.

```typescript
tick(now: Date): void {
  this.eod.tick(now)
  this.broadcast()  // ADD: refresh msToFlatBy display every 60s tick
}
```

---

### P2-A · `FundedAccountStore.save()` Not Atomic 🟡 HIGH
- **File:** `src/main/services/funded-account-store.ts` (defaultDeps.writeFile)
- **Bug:** `writeFileSync` is not atomic — a crash mid-write corrupts the JSON. On next boot, `sanitize()` returns empty state, HWM resets to 0, MLL computes from scratch. The user's carefully built HWM ledger is silently lost.
- **Fix:** Write to `.tmp` first, then `renameSync` over the target. On NTFS, rename-over is atomic.

```typescript
writeFile: (path, data) => {
  const tmp = `${path}.tmp`
  writeFileSync(tmp, data, 'utf8')
  renameSync(tmp, path)
},
```
Add `renameSync` to the `node:fs` import.

---

### P2-B · `cancelAllOrders()` Doesn't Cancel Alpaca-Side Orders ⚠️ CRITICAL (live)
- **File:** `src/main/core/trading-engine.ts` (onEodFlatten)
- **Bug:** `om.cancelAllOrders()` only updates local OM state — it never sends cancel requests to Alpaca. In live mode, Alpaca-side orders remain open and could fill post-EOD, reopening positions that were just flattened. Paper mode: no effect (no real orders). Live mode: high risk.
- **Fix:** Fire-and-forget `session.orders.cancel(id)` for each pending order before local OM cleanup. Keep `onEodFlatten` synchronous — the local state cleanup proceeds regardless of broker response timing.

```typescript
private onEodFlatten(reason: string): void {
  // Live mode: fire broker cancels before local state cleanup.
  // Paper/sim: this.session is null, skip.
  if (this.session) {
    const pendingIds = this.om.getOrders()
      .filter(o => o.status === 'pending')
      .map(o => o.id)
    for (const id of pendingIds) {
      this.session.orders.cancel(id).catch((err: unknown) => {
        log.warn('EOD flatten: broker cancel failed', { id, err: String(err) })
      })
    }
  }
  const cancelled = this.om.cancelAllOrders()
  const flattened = this.om.flattenAllPositions(...)
  if (this.fundedAccount.getProfile()) {         // ← from P1-A
    this.fundedAccount.recordEod(...)
  }
  this.om.armKillSwitch(`eod-flatten:${reason}`)
  log.warn('EOD flatten executed', { reason, cancelled, flattened })
}
```

---

### P-028 · `phase: 'combine'` Wrong for Funded Account (Metadata Fix) 🟢
- **File:** `src/shared/funded/topstep-50k-xfa.ts`
- **Bug:** XFA = "Express **Funded** Account" — directly funded, not a Combine evaluation. `phase: 'combine'` is wrong metadata and will break any future code that branches on phase.
- **Fix:** `phase: 'funded'`

---

## ◉ PHASE 2 — Test Coverage Gaps (7 tests)

| # | Test | File |
|---|------|------|
| T1 | `broadcast()` passes non-zero mllBuffer to listener | `funded-account.test.ts` |
| T2 | `tick()` calls broadcast() — listener receives updated snapshot | `funded-account.test.ts` |
| T3 | Restart-past-cutoff: hydrated lastFiredDate prevents re-flatten | `eod-flatten.test.ts` |
| T4 | `computeMsToFlatBy` accuracy for non-mod-5 cutoff (e.g. 16:13) | `eod-flatten.test.ts` |
| T5 | Gate 3 funded DLL: absolute limit enforced when tighter than pct | `order-manager.test.ts` |
| T6 | `recordEod` fires exactly once per EOD day (not once per fill) | `funded-account-integration.test.ts` |
| T7 | `FundedAccountStore` persists and hydrates `lastEodFiredDate` | `funded-account-store.test.ts` |

---

## ◉ PHASE 3 — Future (Deferred, Next PR)

| ID | Item | Priority |
|----|------|----------|
| P1-C | `setProfile()` switch: open position audit vs new profile limits | MEDIUM |
| P1-D | `cachedBlackout` 60s stale vs live order-gate | MEDIUM |
| P2-C | `computeMsToFlatBy` 5-min probe → 1-min for display accuracy | LOW |
| P2-E | `fundedAccount.onUpdate()` leak on engine destroy | MEDIUM |
| P3-B | `msToFlatBy=0` ambiguous on weekends — add sentinel null | LOW |
| P3-C | Activation-balance ledger seeding (show $50K not $0 on first open) | LOW |
| P3-D | HWM ledger history view in renderer | MEDIUM |
| P3-F | NEWS_BLACKOUT: show time-to-resume after event fires | LOW |
| P4-* | `profitTarget`, `minTradingDays`, `consistencyMaxDayFraction` enforcement | MEDIUM |
| P6-* | Multi-broker ComplianceLayer + profile registry versioning | FUTURE |

---

## ◉ MASTER CHECKLIST

```
PHASE 1 — IMPLEMENTATION
─────────────────────────────────────────────────────────────────
[ ] P0-A  Gate 3: enforce profile.dailyLossLimit via min(pct, abs)
[ ] P0-B  Gate 9: validate stop direction before worstCaseLossDollar
[ ] P0-C  Persist lastFiredDate across restarts
          [ ] FundedAccountStored.lastEodFiredDate field
          [ ] funded-account-store.ts: sanitize + save
          [ ] eod-flatten.ts: hydrate() + getLastFiredDate() + setLastFiredDate? dep
          [ ] funded-account.ts: hydrate() + persist() wiring
[ ] P1-A  Move recordEod: remove from onOrderFill, add to onEodFlatten
[ ] P1-B  tick() → broadcast() (1 line)
[ ] P2-A  Atomic store write: writeFileSync(.tmp) + renameSync
[ ] P2-B  onEodFlatten: fire-and-forget broker cancels (live mode)
[ ] P-028 phase: 'combine' → 'funded' in topstep-50k-xfa.ts

PHASE 2 — TEST COVERAGE
─────────────────────────────────────────────────────────────────
[ ] T1  broadcast() mllBuffer regression test
[ ] T2  tick() triggers broadcast, listener gets updated msToFlatBy
[ ] T3  Restart-past-cutoff: hydrate(lastFiredDate) prevents re-flatten
[ ] T4  computeMsToFlatBy non-mod-5 cutoff accuracy
[ ] T5  Gate 3 funded DLL compliance: abs cap < pct cap wins
[ ] T6  recordEod fires exactly once per EOD (not N×)
[ ] T7  FundedAccountStore persists/hydrates lastEodFiredDate

VERIFICATION
─────────────────────────────────────────────────────────────────
[ ] npm test -- --run → 770+ tests green (all 64 files)
[ ] git commit: feat(funded): P0-A/B/C + P1-A/B + P2-A/B + P-028 + 7 tests
[ ] git push to mount → operator pull from Windows
[ ] Operator: push to GitHub, open PR, DoD sign-off
```

---

## ◉ COMPLIANCE SIGN-OFF MATRIX

| Gate | Rule | Enforced After This Sprint |
|------|------|---------------------------|
| Gate 3 | Daily Loss Limit (absolute $) | ✅ Yes — min(pct, profile.dailyLossLimit) |
| Gate 9 | Trailing MaxDD — stop direction | ✅ Yes — inverted stops blocked |
| Gate 10 | News blackout ±60s | ✅ Yes (original) |
| Gate 11 | Max contracts per symbol | ✅ Yes (original) |
| Gate 12 | Post-EOD flatten | ✅ Yes + restart-safe (P0-C) |
| Gate 13 | Asset class restriction | ✅ Yes (original) |
| EOD flatten | No Alpaca-side fill after flatten | ✅ Yes (P2-B, fire-and-forget) |
| HWM ledger | Survives app restart | ✅ Yes (P0-C + P2-A atomic write) |

---

*Document generated by SATEX internal audit — 2026-06-14*  
*Next review: 500 paper trades or PR merge, whichever comes first*
