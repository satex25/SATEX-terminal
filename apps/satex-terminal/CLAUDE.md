# SATEX — App Facts

**What the app is.** *How to work it* lives in the root `AGENTS.md` (gate bar, branch→PR
flow, trading-safety guardrails). *What changed when* lives in `CHANGELOG.md`. This file is
the durable architecture truth an agent needs before touching `satex-app/` — invariants,
contracts, and where things live. Keep it durable: per-release detail goes in the CHANGELOG,
not here.

Windows-only Electron + React 18 + TypeScript trading terminal — TradingView Lightweight
Charts v5, **Zustand** (not Redux), better-sqlite3, Zod-validated IPC, `ws`. Node ≥ 20.19.
It has a **live-capital path via Alpaca**: treat it as production financial software.

## The four gates (run from this directory)

| Gate | Command | What it is |
|---|---|---|
| Types | `npm run typecheck` | `tsc` on `tsconfig.node.json` + `tsconfig.web.json`, `--noEmit` |
| Lint | `npm run lint` | `eslint src tests` |
| Tests | `npm test` | `vitest run` |
| Dead code | `npm run knip` | unused files / exports / deps |

Nothing commits or merges unless **all four** pass. CI (`.github/workflows/ci.yml`, Ubuntu
Node 20.19) enforces **all four gates** (typecheck, lint, knip, vitest) on every push/PR.
A strict `.husky/pre-commit` runs typecheck + lint and blocks the commit on failure. Report
**real** results (exit codes, counts) — never assert them.

## Load-bearing invariants — do not break

- **State is Zustand, not Redux.** No direct cross-store coupling; go through stores / IPC.
- Equity is **`DEFAULT_EQUITY`**, never reintroduce a `STARTING_EQUITY` symbol. Risk gates
  read the live session-start equity, not a constant.
- **SIM / SUB badges render only from the canonical gates** (`isSyntheticFeed`, `showSub`) —
  never from inline logic duplicated at a call-site.
- The **sub-second aggregator is fed only from `alpaca.onTick`, and only while the live
  feed is selected** (`onCryptoTick` early-returns unless `dataSource === 'live'`, P-111) —
  no other path. In simulator mode it is intentionally fed nothing (the sim emits 20 Hz
  quote batches, not `'t'` trade ticks, so it cannot coherently populate the SUB view).
- **Broker equity + account WS lifecycle goes through `AlpacaBrokerSession.connect()` /
  `.disconnect()`** at the three engine construction call-sites (cold boot, data-feed switch,
  reconnect) — not bare `market.start()` / per-stream disconnects. Crypto WS is still
  engine-owned (not part of the session today).
- **Clean up what you create:** disconnect observers, clear timers, cancel in-flight async on
  unmount. A real `ResizeObserver` leak shipped once (PR #6) — don't repeat it.
- **IPC payloads stay Zod-validated; API keys stay in `safeStorage`** — never plaintext in
  `userData` or logs.
- **No macOS build target. Ever.**

## Broker abstraction (`@shared/broker/`)

The broker-agnostic execution contract the trading engine talks to. `AlpacaBrokerSession`
composes four facets under one connect / disconnect lifecycle:

| Facet | Interface | Alpaca concrete |
|---|---|---|
| Order routing | `OrderRouter` (submit / cancel / onUpdate / failUnacked) | `AlpacaOrderRouter` |
| Market data | `MarketDataSource` (start / stop / on{Quotes,Candle,Trades,News}) | `LiveMarket` |
| Account snapshot | `AccountSyncer` (getSnapshot / onUpdate) | `AlpacaAccountSyncer` |
| Symbol mapping | `SymbolResolver` (toBrokerSymbol / toCanonical / isSupported) | `AlpacaSymbolResolver` |

- **State machine** — `SessionState`: `DISCONNECTED → CONNECTING → CONNECTED → RECONNECTING →
  FAILED`, synthesized from `AlpacaClient.onConnectionStateChange(fn)` (dedup'd snapshots at
  every WS open / close / reconnect-timer transition across equity, account, crypto). Crypto
  is informational only — it does **not** block trading-ready.
- **Construction** — prod: `AlpacaBrokerSession.create(client, market)`; tests: four facets
  via DI (`src/main/services/alpaca/broker-session.test.ts`).
- **Engine integration** (`trading-engine.ts`): `this.session: AlpacaBrokerSession | null`
  (null in simulator / replay); driven via `session.connect()` / `.disconnect()`;
  `private teardownSession()` centralizes the session-or-fallback teardown shared by the
  data-feed switch and reconnect paths.
- **`OrderRouter.failUnacked(reason)`** synthesizes a REJECT for every order still tracked as
  in-progress (acked, no terminal seen) and clears the in-flight index. Broker-side orders are
  **not** canceled — reconciliation is the engine's job via `AccountSyncer`.
- **Facet migration is complete** (verified 2026-06-10): no `this.alpaca.submitOrder` /
  `.getAccount` / `.cancelOrder` call-sites remain in `trading-engine.ts`. Remaining
  `this.alpaca` uses are construction (`new AlpacaClient` → `LiveMarket` →
  `AlpacaBrokerSession.create`) and the engine-owned crypto-WS lifecycle
  (`disconnectCryptoStream`), both intentional. New brokers (Rithmic / Tradovate)
  implement the `@shared/broker/` interfaces and slot in via the same shape.

Design + locked decisions:
`docs/superpowers/specs/2026-06-01-alpaca-broker-session-design.md`.

## Data-feed switch (Simulator ⇄ Live Alpaca)

Runtime market-data toggle in the TopBar: `FeedSwitch.tsx → dataSourceStore → IPC
DATA_SOURCE_SET → engine.setDataSource`. Reconciliation is **reset-to-clean** (OrderManager
`resetToPaper` on →Sim; `syncFromAlpaca` on →Live). Interlock logic is the pure, unit-tested
`data-source-guard.ts`. **Paper-safe** — blocked while real-capital armed or replay active.
The live→sim teardown runs through `AlpacaBrokerSession.disconnect()`, draining in-flight
orders via `failUnacked('broker-session-disconnected')` and closing the account WS.
Design: `docs/design/2026-05-24-data-feed-switch.md`.

## Sub-second crypto candles

Engine surface (`subsecond-aggregator.ts`), crypto-only:

- `setPreferredBucket(symbol, ms)` — silently rejects non-crypto; fires `onPreferenceChanged`.
- `getPreferredBucket(symbol)` — defaults to **250**.
- `hydratePreferredBuckets(prefs)` — bulk restore on boot (**REPLACES**, doesn't merge).
- `getAllPreferredBuckets()` — fresh snapshot for IPC (mutation-safe).
- `getCandleResolutionMs(symbol)` — returns **1000** for non-crypto so 1 s consumers keep
  their contract.

Persistence: `Vault/Settings/subsecond-prefs.md` (markdown + JSON fence, hand-editable; a
sanitizer drops bad entries on load). IPC: `SUBSECOND_PREFS_GET` / `SUBSECOND_PREFS_SET`
(Zod `SubsecondPrefsSetReq`, `.strict()`, `{250|500}` literal-union). The chart **SUB badge**
gates on `showSub = isSubsecondTimeframe(tf) && isCryptoSymbol` (same single-source pattern as
the SIM badge); auto-snap on crypto symbol focus is a no-op for non-crypto / no-pref.

## Renderer perf canary (opt-in, not in CI)

Frame-budget E2E to run before a renderer-heavy release (CI stays typecheck + vitest only):

```powershell
npm run build
$env:SATEX_E2E_PERF='1'; npx playwright test tests/e2e/renderer-perf.spec.ts
```

Boots isolated + offscreen (throwaway `--user-data-dir` / `SATEX_VAULT_ROOT`,
`SATEX_SIMULATOR_24_7=true` — inert since P-111 but harmless; the simulator now streams
24/7 by default), drives the Trade `ChartPanel`, and
asserts a p50 ≤ 16 ms frame budget under symbol-rotation + tick-stream load (full p50/p95
thresholds in the design doc). The percentile math + profiler lifecycle are unit-tested in
`src/renderer/lib/perf.test.ts` (runs in CI).
Design + diagnosis trail: `docs/design/2026-05-22-renderer-perf-budget.md`.

## Known release blocker — Authenticode signing

Shipping a signed Windows installer is gated on a code-signing cert (unavoidably
user-action: pick CA → pay → submit identity docs → wait 3–15 business days). The CSR is at
`certs/satex-codesign.csr`; `electron-builder.yml` auto-picks up `CSC_LINK` +
`CSC_KEY_PASSWORD`, so once a `.pfx` lands on the build machine, `npm run pack:win` produces a
signed installer with zero code changes. Workflow: `certs/HANDOFF.md`.

## Pointers

- **How to work this repo / guardrails** → root `AGENTS.md`
- **Release history** → `CHANGELOG.md`
- **Design docs / specs** → `docs/design/`, `docs/superpowers/specs/`
