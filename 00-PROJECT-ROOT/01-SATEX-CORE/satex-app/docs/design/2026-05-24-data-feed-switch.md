# Runtime Data-Feed Switch — Simulator ⇄ Live Alpaca Data

**Date:** 2026-05-24
**Branch:** `feat/data-feed-switch` (off `master` @ the v0.6 merge `06827e2`)
**Status:** Spec for review. No code until approved.

---

## 1. Goal

A one-click TopBar control that switches the market **data feed** between the synthetic
`MarketSimulator` and the **live Alpaca (paper) data feed** at runtime — no restart, no env
edit — with rigorous order/position coherence and strict separation from the real-capital
execution control.

Today the only way to change feeds is the boot-time `SATEX_USE_SIMULATOR` env var (requires
a restart). This makes it a runtime toggle.

---

## 2. Decisions (locked in brainstorming, 2026-05-24)

| # | Decision |
|---|---|
| Reconciliation | **Reset-to-clean sandbox** (option A). → Simulator: fresh $100k paper account. → Live: sync real positions/equity from the Alpaca **paper** account. Each world starts coherent; no fake positions against a real feed or vice-versa. |
| "Live" scope | **Alpaca paper data feed** — real market data, **no real money**. Implemented as the full, permanent behaviour (no "temporary" framing). Real-capital execution stays the **separate** existing `PAPER/LIVE` toggle. |
| UI | **Single source chip** (option C): `◇ SIM DATA` ⇄ `◆ ALPACA`, TopBar-resident, cyan accent, one click. |
| Safety interlock | The feed switch is **blocked while ● LIVE real-capital is armed**, and **while Replay is active**. Strictly paper-safe. |
| Confirm step | A light confirm appears **only when entering Live AND simulated positions exist** ("…your paper positions will be cleared"). Returning to Sim is immediate. |

---

## 3. Architecture

### 3.1 `engine.setDataSource(target: 'simulator' | 'live')` — the coherence-safe swap

One new `TradingEngine` method. It performs an **atomic, transactional** source swap that
**reuses the proven `installMarketWiring()` / `uninstallMarketWiring()` primitives** that
Replay already relies on (`trading-engine.ts:437,1194,1199,1220,1226`). **Replay's own flow
is not refactored** — risk stays contained.

**Preconditions (refuse with a reason; no state change):**
1. Already on `target` → no-op `{ ok: true, already: true }`.
2. `this.replay` active → `{ ok:false, reason:'Stop replay before switching the data feed.' }`.
3. `target==='live'` and no Alpaca **paper** creds (`getAlpacaCreds('paper') === null`) →
   `{ ok:false, reason:'Add Alpaca paper keys in Settings → Data Source first.' }`.
4. **Real-capital armed** (`isLive()` or `getAlpacaMode()==='live'`) →
   `{ ok:false, reason:'Disarm ● LIVE real-capital mode before switching feeds.' }` — the
   paper-safe interlock.

**Swap sequence — structured as `prepare` (fallible) → `commit` (atomic), so a failure can
never leave the engine half-swapped:**
1. `this.switchingSource = true` — gates `submitOrder` (§3.3) + pause the autonomous trader,
   `this.regime?.pause()`, and risk-gates (the same consumers Replay pauses). The old source
   keeps running but is now inert (orders gated, consumers paused).
2. **PREPARE the target — the only fallible step; nothing is torn down yet:**
   - → **Live:** build `AlpacaClient` (paper endpoint, stored paper creds) → `new
     LiveMarket(alpaca)` → connect + fetch the account snapshot (reuses the connect path at
     `trading-engine.ts:974-994`). **On any failure here → resume services, clear the gate,
     return `{ ok:false, reason }`** with the old source still wired and the OrderManager
     untouched.
   - → **Simulator:** `new MarketSimulator(seed)` — local, cannot fail.
3. **COMMIT — local, non-failing, atomic:** `uninstallMarketWiring()` + stop old source →
   reconcile the `OrderManager` (→ Live: `syncFromAlpaca(snapshot, positions)` +
   `setSessionStartEquity(brokerEquity)`; → Sim: `resetToPaper(DEFAULT_EQUITY)`) → set
   `this.market = target` + `this.dataSource = target` → `installMarketWiring()` → `start()`
   + reseed candles (the same reseed Replay does on restore).
4. Resume the autonomous trader + `regime`/risk; `this.switchingSource = false`.
5. Broadcast `FEED_STATUS_UPDATE` + an account-update. Return `{ ok:true, source: target }`.

**Source-kind tracking:** add an explicit `this.dataSource: 'simulator' | 'live'` field set
in `initialize()` (from the boot env decision) and updated by `setDataSource`. Replaces the
implicit `this.alpaca ? 'alpaca-paper' : 'simulator'` inference at `:1129` as the source of
truth for status reporting.

### 3.2 `OrderManager.resetToPaper(startingEquity = DEFAULT_EQUITY)`

New, small, pure-ish method (the clean-sandbox reset for option A):

```ts
resetToPaper(startingEquity = DEFAULT_EQUITY): void {
  this.positions.clear()
  this.orders.clear()                 // pending paper orders are meaningless in a new world
  this.sessionStartEquity = startingEquity
  this.account = {
    equity: startingEquity, cash: startingEquity,
    buyingPower: startingEquity * BUYING_POWER_MULT,
    openPositions: [], dailyPnl: 0,
    dailyLossLimitPct: DAILY_LOSS_LIMIT_PCT,
    mode: 'paper',
    killSwitchArmed: this.account.killSwitchArmed,   // preserve the safety latch across resets
    sessionStartedAt: Date.now(),
  }
}
```

Kill-switch state is **preserved** across a reset (a reset must never silently re-enable
trading). Fully unit-testable in Node (no Electron deps).

### 3.3 `submitOrder` gate

Extend the existing Replay gate (`trading-engine.ts:813`). Today: `if (this.replay) {…}`.
Add the transient switch gate alongside it:

```ts
if (this.switchingSource) return { ok:false, reason:'Data feed is switching — retry in a moment.' }
```

### 3.4 IPC + preload

Mirror the existing `LIVE_MODE_*` channels.
- `DATA_SOURCE_GET` → `{ source:'simulator'|'live', liveAvailable:boolean, switching:boolean }`
  (`liveAvailable` = paper creds present).
- `DATA_SOURCE_SET` → Zod `DataSourceSetReq` (`{ target: 'simulator'|'live' }`, `.strict()`)
  → `engine.setDataSource(target)`.
- The existing `FEED_STATUS_UPDATE` broadcast carries the post-swap state to the renderer.
- Preload binding in `preload/index.ts` next to the live-mode binding.

### 3.5 Renderer store + UI (chip C)

- **`dataSourceStore.ts`** (Zustand): `{ source, liveAvailable, switching }` + `setSource(target)`
  action that calls the IPC and optimistically reflects `switching`. Hydrated from
  `DATA_SOURCE_GET` on mount + updated by `FEED_STATUS_UPDATE`.
- **TopBar source chip** (new component, placed immediately **right of the existing
  `PAPER/LIVE` mode toggle, after a `.bb-vrule` divider** — exactly as in approved mockup C:
  adjacent but cyan-vs-amber distinct): `◇ SIM DATA` (cyan outline) ⇄ `◆ ALPACA` (cyan filled). One click
  toggles. **Disabled + tooltip** when `!liveAvailable` ("Add Alpaca paper keys…"), when
  real-capital is armed ("Disarm ● LIVE first"), or while a Replay is active; spinner state
  while `switching`.
- **Confirm modal** (reuse the existing small-modal pattern): shown only when entering Live
  **and** `positions.size > 0` — "Switch to the live Alpaca data feed? Your simulated paper
  positions will be cleared." Returning to Sim is immediate (real Alpaca positions remain at
  the broker; only the local view resets).

---

## 4. Credential persistence (VERIFIED — the live side depends on it)

**Verified working** in `credential-store.ts`: Alpaca keys are stored **encrypted via
Electron `safeStorage`** (Windows DPAPI / OS keychain) in `<userData>/alpaca-creds.bin`
(`writeEncrypted`), and **loaded + decrypted at every boot** via `loadStored()` /
`getAlpacaCreds(mode)`. `userData` survives close/relaunch, so keys saved in one session are
present in the next. Confirmed by the dev-run boot log (`hasStoredCreds:true` with env
forcing sim). Dual-slot (paper/live); this feature reads the **paper** slot. The store hard-
fails (never writes plaintext) if the keychain is unavailable.

**Gap closed by this spec:** the full *save → relaunch → reload* round-trip has **no
automated test** today (the unit test covers only the pure env-parser; `safeStorage` needs
the Electron runtime). §8 adds a Playwright E2E that round-trips it.

---

## 5. Data flow

```
TopBar chip click
  → dataSourceStore.setSource(target)
  → IPC DATA_SOURCE_SET
  → engine.setDataSource(target)   [§3.1: gate → reconcile OM → swap source → reseed → resume]
  → FEED_STATUS_UPDATE + account-update broadcast
  → dataSourceStore + accountStore update → chip + panels reflect the new world
```

---

## 6. Error handling / transactional rollback

The swap is split into **`prepare` (fallible) → `commit` (atomic)** (§3.1). The only failure
point is `prepare` when entering Live (Alpaca connect/auth) — and at that point **nothing has
been torn down**: the old source is still wired and the `OrderManager` is untouched. Rollback
is therefore just "resume services + clear the gate + return the error" (surfaced as a
renderer toast). `commit` uses only local, non-failing operations. **The engine is never left
source-less or half-reconciled, and a failed switch leaves the user exactly where they were.**

---

## 7. File structure

| File | Change |
|---|---|
| `src/main/services/order-manager.ts` | Add `resetToPaper()`. |
| `src/main/core/trading-engine.ts` | Add `setDataSource()` + `dataSource` field + `switchingSource` flag + extend `submitOrder` gate. |
| `src/shared/ipc-channels.ts` | Add `DATA_SOURCE_GET` / `DATA_SOURCE_SET`. |
| `src/shared/ipc-schemas.ts` | Add `DataSourceSetReq` Zod schema + result types. |
| `src/main/index.ts` | Register the two IPC handlers (mirror `LIVE_MODE_*`). |
| `src/preload/index.ts` | Bind the two channels. |
| `src/renderer/stores/dataSourceStore.ts` | New store. |
| `src/renderer/components/TopBar.tsx` | Mount the source chip. |
| `src/renderer/components/FeedSwitch.tsx` (or inline) | The chip + confirm modal. |
| `src/renderer/globals.css` | Chip styles (cyan; distinct from amber mode toggle). |

---

## 8. Testing

**Unit (vitest, Node):**
- `order-manager.resetToPaper`: positions/orders cleared; equity/cash/buyingPower/dailyPnl
  reset; `mode='paper'`; **kill-switch state preserved**.
- `trading-engine.setDataSource` (with mocked sources/alpaca): sim→live reconciles via
  `syncFromAlpaca`; live→sim calls `resetToPaper`; `submitOrder` refused while
  `switchingSource`; all four interlocks refuse (already-on, replay-active, no-creds,
  real-capital-armed); **rollback on connect failure restores the prior source**.

**E2E (Playwright, opt-in — mirrors the canary/heap pattern, isolated temp profile):**
- **Feed-switch smoke:** boot under simulator → flip the chip to Live (with seeded paper
  creds) → assert `DATA_SOURCE_GET.source==='live'` + a clean account → flip back to Sim →
  assert fresh paper account. Asserts no console errors.
- **Credential persistence round-trip (the §4 verification):** launch with a throwaway
  `--user-data-dir` → save paper creds via `CREDENTIALS_SET` → close → **relaunch the same
  profile** → assert `getCredentialsMasked().paperConfigured === true` **and**
  `DATA_SOURCE_GET.liveAvailable === true`. Proves keys survive close/relaunch.

Existing 256 unit tests stay green.

---

## 9. Acceptance criteria

| # | Criterion |
|---|---|
| 1 | One-click TopBar chip switches Sim ⇄ Live (Alpaca paper data) at runtime, no restart. |
| 2 | Switching reconciles the OrderManager: →Sim = fresh $100k paper; →Live = real Alpaca paper positions/equity. No cross-world bleed. |
| 3 | `submitOrder` is refused mid-switch; autonomous/regime/risk pause and resume. |
| 4 | Feed switch is refused while ● LIVE real-capital is armed or Replay is active; chip disabled + tooltip when live creds are absent. |
| 5 | A failed Live connect rolls back cleanly to Simulator (engine never source-less). |
| 6 | The chip is visually + lexically distinct from the PAPER/LIVE money toggle (cyan vs amber; "ALPACA"/"SIM DATA", never bare "LIVE"). |
| 7 | **Stored Alpaca keys persist across close/relaunch** → live-data stays available with no re-entry (E2E-verified). |
| 8 | `typecheck`, `lint`, `knip` clean; unit + the new tests green. |

---

## 10. Out of scope

- Real-capital execution coupling beyond the single safety interlock (the existing
  PAPER/LIVE toggle is unchanged).
- Carry-over positions across the swap (option B) — rejected in favour of reset-to-clean.
- Live SIP/market-data entitlements; sub-second on the live feed; crypto feed changes
  (crypto already streams live independently of this switch).
