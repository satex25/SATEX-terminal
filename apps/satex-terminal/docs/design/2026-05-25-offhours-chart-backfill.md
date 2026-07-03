# Off-hours chart backfill — stop the auto-replay workspace hijack

**Date:** 2026-05-25
**Branch:** `fix/offhours-chart-backfill-no-hijack`
**Status:** design → implementing

## Symptom

On launch, the app shows the **Replay** workspace (scrubber/timeline) instead of the
user's persisted **Quad** workspace.

## Root cause (confirmed from the live main log)

Three independently-reasonable pieces collide:

1. **`App.tsx:82`** — `effectiveWs = replayActive ? 'Replay' : workspace`. Any active
   replay force-overrides the chosen workspace (so the scrubber can't be hidden
   mid-tape). Intentional for *user-initiated* replays.
2. **`ChartPanel.tsx` off-hours auto-load effect** (added 2026-05-17) — on mount, when
   the US market is closed **and Alpaca credentials exist**, it calls
   `loadHistoricalDayForDate()` → `replay.start()` to default the chart to the last
   completed NY session instead of (synthetic) simulator data.
3. The auto-started replay flips `replayActive` → the workspace is forced to `Replay`.

**Why it surfaced now:** the effect is credential-gated. Until the data-feed-switch work
(where the user stored Alpaca **paper** keys), `getCredentialsMasked()` reported no creds,
so the effect always hit the "skip — no creds" branch and did nothing. With keys present,
the guard passes and the off-hours launch auto-starts a replay for the first time.

**Smoking gun** — main log, ~8 s after a dev boot:
```
{"ns":"engine","msg":"replay started","data":{"sessionId":"hist_2026-05-22_1min_aapl-amd-…-spy-tsla"}}
```
The `hist_` prefix + 12-symbol watchlist set is the exact signature of
`loadHistoricalDayForDate`; the ~8 s gap matches its `getCredentialsMasked()` +
`importHistorical()` awaits. No replay was started by the user.

**Time-dependence (corroborates):** the effect short-circuits during US RTH
(`ChartPanel.tsx:296`). Launching on a weekday 09:30–16:00 ET lands on Quad correctly;
only an off-hours/holiday/overnight launch triggers the hijack.

This is a **latent pre-existing bug exposed by adding credentials**, not caused by the
feed-switch code itself.

## Decision

Chosen behavior (user): **silent chart backfill.** The app must always launch on the
user's chosen workspace. Off-hours, the chart quietly fills with the last completed NY
session's bars — **without** the replay machinery (no scrubber takeover, no `replayActive`,
no trading lock). Preserves the 2026-05-17 feature's intent (chart shows real recent data
off-hours) while removing the workspace side-effect.

## Design

A new **replay-free** data path: fetch the day's 1-minute bars and bulk-replace the chart
symbol's candle history directly.

### Main / shared
- **`historical-importer.ts`** — add `fetchDayBars(symbol, date, tf='1Min')` returning
  `{ ok, bars?, reason? }`. Reuses `validateDate` + a newly-extracted `sessionWindowIso(date)`
  helper (DRY with `import()`). Calls `alpaca.getBars(...)` and returns the `Candle[]` — no
  tick expansion, no DB write, no session row.
- **`trading-engine.ts`** — add `getHistoricalBars(req)`:
  `(this.alpaca ?? this.buildRestOnlyAlpacaClient())` → `new HistoricalImporter(alpaca).fetchDayBars(...)`.
  Touches nothing on `this.replay` / `this.market` / wiring / `dataSource`.
- **`ipc-channels.ts`** — `MARKET_HISTORICAL_BARS: 'satex:market:historicalBars'`.
- **`ipc-schemas.ts`** — `HistoricalBarsReq = z.object({ symbol, date, timeframe? }).strict()`.
- **`types.ts`** — `HistoricalBarsRequest`, `HistoricalBarsResult` (`{ ok, bars?: Candle[], reason? }`).
- **`index.ts`** — `register(IPC.MARKET_HISTORICAL_BARS, validated(HistoricalBarsReq, req => engine.getHistoricalBars(req)))`.
- **`preload/index.ts`** — top-level `getHistoricalBars(req) => invoke(IPC.MARKET_HISTORICAL_BARS, req)`.

### Renderer (the fix)
- **`lib/chart-backfill.ts`** (new) — pure `planLastSessionBackfill(deps)`. Holds ALL the
  decision logic (in-replay / RTH / no-creds / fetch). **`replay` is not a dependency**, so
  the auto-load path *cannot* start a replay. Returns a discriminated result:
  - `{ action: 'skipped', reason: 'in-replay' | 'rth' | 'no-creds' }`
  - `{ action: 'backfilled', date, bars }`
  - `{ action: 'no-bars', date, reason? }`
- **`ChartPanel.tsx`** — the off-hours effect becomes: latch → `planLastSessionBackfill(...)`
  → on `'backfilled'`, `useMarketStore.getState().bulkReplaceCandles(symbol, bars)` + a soft
  info badge (`Showing last session (<date>) · US market closed`); on `no-creds`, keep the
  existing dismissible Settings nudge. **No `replay.start`, no workspace force.** The manual
  date-picker buttons keep their existing replay-based `loadHistoricalDayForDate` path
  (user-initiated review is allowed to enter Replay).

## Tests (Vitest, Node env — no jsdom)
- **`lib/chart-backfill.test.ts`** — RTH → `skipped/rth` (no fetch call); off-hours+no-creds
  → `skipped/no-creds` (no fetch); off-hours+creds+bars → `backfilled` with the bars;
  off-hours+creds+in-replay → `skipped/in-replay`. The absence of any `replay` dependency is
  the structural regression guard.
- **`historical-importer.test.ts`** (new) — `fetchDayBars`: no-creds → `ok:false`;
  weekend/future date → `ok:false` (validateDate); configured + bars → `ok:true` with the
  bars passed through; getBars throw → `ok:false` with reason.

## Out of scope
- The manual chart date-picker and the Replay-tab import/play paths are unchanged
  (user-initiated replay is correct behavior).
- Deferred QA from PR #4 (a successful →live switch with real keys) is unrelated.
