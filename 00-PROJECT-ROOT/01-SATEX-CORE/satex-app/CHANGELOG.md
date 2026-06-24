# Changelog

All notable changes to SATEX (satex-app) are recorded here. Format roughly follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); we don't strictly follow
semver because the app is still pre-1.0 — minor bumps may introduce behavior
changes alongside fixes during the v0.x stabilization series.

## Unreleased (v0.6 "Black Box")

### Fixed

- **CHANGELOG.md: bridge-artifact duplicate-header repair (2026-06-24).** Line 56
  had the Chart-interaction-layer bullet header doubled by the file bridge during the
  2026-06-22 session write. Fixed via Python byte-level replacement. No logic change.
  Gates: typecheck✅ lint✅ (0 warnings) test✅ (79/934) knip✅ (EXIT:0).

- **P-023: `DrawingLayer.tsx` fast-refresh warning eliminated.** `renderDrawing`
  and its `drawLine` / colour-constant dependencies extracted into a new sibling
  file `drawing-renderer.ts`. `DrawingLayer.tsx` now exports only the React
  component; `ChartPanel.tsx` imports `renderDrawing` from the new module.
  Resolves the sole `react-refresh/only-export-components` lint warning; lint
  gate now exits 0 with 0 warnings. Gates: typecheck✅ lint✅ (0 warnings) test✅
  (111/1304) knip✅.

- **P-021: Repo corruption diagnosis & package.json restoration (2026-06-17).**
  Standing agent detected file-bridge shrink artifacts on boot: `package.json`
  truncated at `typescript-eslint: "^8.59.` (resolved via bash write + JSON validation).
  `.git/packed-refs` had unterminated line (fixed via truncation to last complete line,
  3863→3605 bytes); git still FAILED on "ambiguous HEAD" (branch `feat/chart-interaction-layer`
  unresolvable). Four test files structurally corrupted: `calibration.test.ts`,
  `pattern-learner.test.ts` (each −1 closing brace); `replay-source.test.ts`,
  `tick-recorder.test.ts` (each −2 braces). Gates BLOCKED pending operator restoration
  from remote. P-021 logged with recovery path: `git checkout
  src/main/services/{intelligence,market-data}/*test.ts`.

- **ChartPanel.tsx: PNG export crash fix.** `export.ts` uses
  `import { ipcRenderer } from 'electron'` which Vite externalises to a
  shim referencing `__dirname`; that threw at module-evaluation time in the
  sandboxed renderer and blanked the entire chart panel on load. Changed the
  static `import { exportChartPng }` to a dynamic `import('../chart/export')`
  scoped to the PNG button's async handler, so any failure is isolated to
  that one action. TODO: add a `chart.pngExport` preload bridge.

### Added

- **L1.F / P-009: Brain depth wiring + regime-aware ensemble confidence fusion.**
  Two bugs prevented L2 order-book features from contributing to live decisions:
  (1) `brain.decide()` never received `this.depth.get(symbol)` — `depth_imbalance`
  and `microprice_dev` were always 0. (2) Brain confidence had no awareness of
  market regime — a 0.7 signal in a strong trend looked identical to a 0.7 in chop.

  **P-009 fix** (`services/brain.ts`): `decisionFromLocal()` and `decide()` now
  accept an optional `depth?: DepthSnapshot` parameter and pass it to
  `this.features()`. Engine calls `this.brain.decide(symbol, quote, ind, depth)`.
  Backtest path (`brain-strategy.ts`) updated in lockstep to pass `snap.depth`.
  Depth microstructure features fire when L2 data is available; degrade to 0 when absent.

  **L1.F ensemble fuser** (`src/main/core/ensemble-fuser.ts`): New pure module that
  scales brain confidence by a regime × EMA-alignment multiplier before calibration:

  | Regime      | Alignment          | Multiplier |
  |-------------|--------------------|------------|
  | trend_up    | bullish (with trend) | × 1.20   |
  | trend_up    | bearish (vs trend)   | × 0.65   |
  | trend_down  | bearish (with trend) | × 1.20   |
  | trend_down  | bullish (vs trend)   | × 0.65   |
  | range       | counter-trend EMA   | × 1.10    |
  | range       | trend-following EMA | × 0.75    |
  | chop/unknown| any                 | pass-through |

  Engine wiring in `getAiDecision()`: `depth` wired → `brain.decide()` →
  `fuseWithRegime(confidence, bias, regime, ind)` → `calibration.calibrate(fused)`.
  24 unit tests in `ensemble-fuser.test.ts` (isEmaAligned × 6, isAlignedWithRegime × 7,
  fuseWithRegime × 11). All four gates green.

- **P-024: PRNG and ID-generator test coverage (2026-06-24).** `mulberry32`
  PRNG (`rng.ts`) and the ID generator (`id-generator.ts`) had zero test coverage
  despite being foundational utilities: the PRNG feeds the simulator tick stream
  and its determinism claim (“same seed → identical tick stream”) was unverified;
  `orderId`/`sessionId` are used by every trade and session. Added `rng.test.ts`
  (13 tests: [0,1) bounds, same-seed determinism, nextInt range + coverage,
  Box-Muller mean ≈ 0 over N=10k, seed-0 and fractional-seed edge cases,
  `randomSeed` uint32 invariant) and `id-generator.test.ts` (8 tests: prefix
  format, base-36 suffix, 100-call uniqueness, orderId/sessionId canonical
  prefixes). +21 tests total.
  Gates: typecheck✅ lint✅ (0 warnings) test✅ (81 files / 955 tests) knip✅ (EXIT:0).

- **P-013 (re-ship 2026-06-22): Simulator bracket execution engine.** Autonomous
  paper positions now close automatically when stop-loss or take-profit is hit.
  `checkBracketHit(position, currentPrice)` is a pure function in the new
  `src/main/core/simulator-bracket.ts`: returns a `BracketHitResult`
  (`level`, `closeSide`, `price`) or `null`; handles both long and short
  positions; stop-loss takes priority on simultaneous cross (conservative).
  `TradingEngine.checkSimulatorBracket(symbol, price)` is called from
  `onQuotesBatch` when `this.alpaca === null` (simulator/replay only — Alpaca
  handles bracket children server-side in live/paper mode). Fill synthesised
  via `om.createOrder + om.fillOrder` at the exact bracket price; flows through
  `onOrderFillForLearning → recordTradeClose → VaultWriter` so
  `Vault/Trades/` populates on every closed paper trade. 14 unit tests in
  `simulator-bracket.test.ts`. Gates: typecheck✅ lint✅ (0 warnings)
  test✅ (79/934) knip✅ (CI Node-20).

- **Chart interaction layer — CHART-03/20 (L1.D, 2026-06-16).** Full implementation
  of the chart interaction surface committed on `feat/chart-interaction-layer`:

  *Core chart engine:*
  `DrawingModel.ts` (discriminated union: line/hline/vline/rect/fibonacci/annotation),
  `drawingStore.ts` (Zustand, ephemeral-first D4 — save on explicit operator action only),
  `DrawingLayer.tsx` (canvas renderer; hit-test; undo/redo), `CanvasOverlay.tsx` + 
  `CrosshairReadout.tsx` (2D overlay, price+time readout, no ResizeObserver leak),
  `NavController.ts` (keyboard j/k/+/-, wheel, pointer drag, idempotent destroy),
  `overlay/ViewportTransform.ts` + `overlay/lod.ts` (time/price↔pixel, LOD decimation),
  `OrderFlowTape.tsx` (live trade tape).

  *Multi-TF overlay (CHART-06):* Second LWC v5 pane in absolute overlay with isolated
  `NavController`; cursor sync via `unsubscribeCrosshairMove(handler)` (LWC v5 pattern);
  shared-Y toggle; full cleanup (chart.remove, navRef.destroy, ro.disconnect).

  *PNG/SVG export (CHART-08):* IIFE-wrapped LWC screenshot composite (LWC base +
  WebGL + 2D overlay) → `CHART_PNG_EXPORT` IPC → Downloads. SVG export serialises
  drawings using `DrawingModel` discriminated fields (`.a`/`.b` for line, `.price` for
  hline, `.anchor` for annotation). No `anchors[]` array — discriminated union fields only.

  *WebGL sublayer:*
  `webgl/footprint.ts` (buy/sell cell aggregation, POC tracking, mixed/real/inferred
  provenance, binary-search candle assignment) + 11 tests;
  `webgl/volume-profile.ts` (TPO horizontal histogram, value-area 70%, POC) + 11 tests;
  `webgl/WebGLRenderer.ts` (GPU pipeline lifecycle, texture atlas);
  `webgl/vol-heatmap.ts` (GPU-accelerated volatility heatmap).

  *Chart indicator additions (CHART-15..20):*
  `chart-types.ts` (Renko/LineBreak/Kagi transforms) + tests;
  `vol-surface.ts` (realized vol surface, annualised stdev) + tests;
  `correlation.ts` (Pearson, rolling, matrix) + tests;
  `indicator-graph.ts` (no-code pipeline DAG, visual alerts) + tests;
  `patterns.ts` (H&S, inverse H&S, wedge, flag) + tests;
  `block-prints.ts` (large-trade proxy detector) + tests.

  *IPC wiring:* `CHART_DRAWINGS_GET` / `CHART_DRAWINGS_SET` / `CHART_PNG_EXPORT`
  channels in `ipc-channels.ts`; `ChartDrawingsGetReq`, `ChartDrawingsSetReq`,
  `ChartPngExportReq` Zod schemas in `ipc-schemas.ts`; 3 handlers in `main/index.ts`
  (drawings R/W to `Vault/Settings/chart-drawings.json`, PNG write to Downloads).

  *Gates:* typecheck NODE=0 WEB=0, lint 0 errors, vitest 50✓/12✗ (12 pre-existing
  replay-source sqlite3 sandbox-only), knip exit 0.

- **`scripts/` operator tooling.** `scripts/cleanup-root.ps1` removes all verified
  root noise in one run (git bundles, one-shot bats, stale PR bodies, garbage .txt
  files, chrome-devtools-mcp residue, root duplicate policy docs, HOME.md relocation).
  `scripts/flatten-wrapper.ps1` (DryRun-safe) executes the §3.5 one-way wrapper
  flatten when all open branches are merged and CI is green.

### Added

- **P-013: simulator / OrderManager close trigger pinned (pure extraction).**
  Extracted `TradingEngine.onOrderFillForLearning` into the pure
  `handleOrderFillForLearning` helper (`order-fill-learning-router.ts`),
  mirroring the existing `onOrderEvent → handleOrderEvent` split, and added
  `order-fill-learning-router.test.ts` (8 vitest cases) covering position-flat
  detection, direct-vs-fallback entry resolution, the no-entry skip path
  (`hasEntryFeatures:false`), and the `fillPrice ?? 0` guard. Behaviour-exact;
  the engine now delegates. Pins the *simulator* close path — sibling of the
  already-tested bracket-child path — so the P-013 `Vault/Trades/` diagnostic
  can rule out trigger-routing as the cause. Gates green in sandbox: typecheck,
  lint, vitest (84 files / 1034 cases), knip.

- **P-008 (a): Multi-day historical bars for nightly self-eval (world-market
  coverage).** Extended `SelfEvalService.getCandles()` in trading-engine.ts to
  fetch 2 days (yesterday + today) of 1-minute bars from Alpaca historical API
  instead of just the in-memory buffer. Detects crypto symbols (BTC/ETH/SOL/etc)
  and routes through `getCryptoBars()` for crypto data. Falls back gracefully to
  in-memory buffer if historical fetch fails (market holiday, missing API
  credentials). This enables the nightly backtest runner to study previous-day
  context and multi-session trends for Asia/Europe session analysis. All four
  gates pass: typecheck, lint, test (669 cases), knip (CI on Node 20.19).

- **P-013 diagnostics — Vault/Trades write path pinned, unjournaled closes
  made loud.** `vault-writer.test.ts` (4 new vitest cases) pins the writer
  half of the trade-close pipeline: `.obsidian` root detection, Trades note
  materialisation with frontmatter, loss-learnings extraction per the
  MAY-TACTICS principle, and the disabled no-op. `recordTradeClose` now logs
  a `trade close not journaled` warn carrying `hasEntryFeatures` +
  `vaultEnabled` whenever a close skips journaling — the vault note, the
  JournalPanel row and the brain SGD step all gate on entry features and the
  skip was previously silent. Runtime evidence (Sessions 41 / Observer 113 /
  Trades 0 / Tactics 0 / Brain 0 notes) says the writer works and closes
  never reach it; the P-013 operator diagnostic is now decisive in minutes.

- **THE WIRE — toggleable live world-news desk (operator fun-challenge).**
  The Catalysts quadrant becomes a two-desk surface: CATALYSTS ⇄ ◉ THE WIRE.
  The wire streams real channels — BBC World, NPR, Guardian World, Hacker
  News — with one tab per outlet plus ALL, polled main-side every 60s via a
  zero-dependency, unit-tested RSS parser (`services/wire-feed.ts`). Headlines
  under 2 minutes old pulse ⚡; clicking opens the story in the default
  browser through the existing scheme-allowlisted handler; a failing outlet
  dims its own tab without dimming the desk. OFF by default — flipping to
  CATALYSTS stops all polling (zero background traffic) — and the renderer
  CSP still allowlists no news hosts because every fetch lives in main with
  the house 10s timeout. Desk choice persists across boots. Strictly cosmetic
  to trading: the wire never emits catalysts, never touches engine stores.
  IPC: `WIRE_GET` / `WIRE_SET` / `WIRE_UPDATE` (Zod `.strict()`).
  9 new vitest cases.

- **Standing agent — daily PSD session scheduled (P-016).** A `Cowork` scheduled
  task (`satex-psd-daily`, weekdays 09:05) runs the Problem-Solution-Decision
  loop autonomously while the Claude app is open. The agent reads the
  `PROBLEM-LEDGER.md`, picks the highest-leverage OPEN or IN-PROGRESS entry
  (skipping operator-gated and safety-perimeter work), runs all four gates on
  code changes, updates the ledger, adds a CHANGELOG entry, and reports real
  gate results. The loop is self-contained, never commits or merges, and
  prepares working-tree changes for the operator's review per the branch→PR
  flow. The session respects the SATEX constitution's trading-safety guardrails.

- **Groq locked in as the default advisor provider.** Settings → AI Advisor
  prefills `https://api.groq.com/openai/v1` + `llama-3.1-8b-instant`
  (`DEFAULT_LLM_*` in `@shared/constants`) so a fresh setup is paste-key-and-go.
  Any OpenAI-compatible provider still swaps in by editing two fields.

- **End-of-session LEARNINGS note (`services/learning-report.ts`).** On engine
  shutdown a single, hard-capped (≤4 KB) markdown note lands in
  `Vault/Learnings/`: which brain weights moved and how far, how honest the
  stated confidence was (Brier, multiplier, worst reliability bucket), and the
  autonomous signal funnel. A no-learning session is called out explicitly.
  Folder pruned to 30 notes and `calibration_log` pruned to 2,000 rows on boot
  (the Observer-flood lesson). 6 new vitest cases.

- **Nightly self-eval is now a Settings toggle.** Settings → Nightly
  Self-Evaluation: ● ON / ○ OFF (persisted in `userData/self-eval.json`,
  default ON), a Run Now button for on-demand evaluation, and a last-run
  status line (evaluated / baselined / regressions → report filename). IPC:
  `SELF_EVAL_GET` / `SELF_EVAL_SET` / `SELF_EVAL_RUN` (Zod `.strict()`).

- **Provider-agnostic AI advisor (`services/llm.ts`).** Replaces the hardcoded
  Baidu/ERNIE call in `brain.ts` with one OpenAI-compatible chat-completions
  client — Groq, OpenAI, OpenRouter, Mistral, DeepSeek, Baidu, or a local
  Ollama plug in via Settings → AI Advisor ({ baseUrl, model, apiKey };
  key in safeStorage, never crosses IPC). A stored legacy Baidu token keeps
  working untouched (read-only fallback in credential-store). Every call now
  carries a 10s `AbortSignal` budget (2026-06-10 audit §3.1 — a hung LLM
  socket previously suspended `AutonomousTrader.runCycle` forever, silently
  halting autonomous trading). Advisory-only invariant unchanged: the
  rationale string never gates, sizes, or routes an order. IPC: `BAIDU_*`
  channels replaced by `LLM_CONFIG_GET` / `LLM_CONFIG_SET` (Zod `.strict()`).
  9 new vitest cases (`llm.test.ts`).

- **Confidence calibration — Brier score + reliability curve
  (`services/calibration.ts`).** Implements the constitution's "no confidence
  inflation" rule. Every closed trade that carried a stated entry confidence
  (autonomous path) is journaled to a new `calibration_log` table; a rolling
  200-outcome window yields the Brier score, a 10-bucket reliability curve,
  and a **downgrade-only** multiplier `clamp(winRate / avgConfidence, 0.5, 1)`
  applied at the single decision choke point (`TradingEngine.getAiDecision`)
  once ≥30 outcomes exist. A system claiming 75% and winning 45% trades at
  ×0.6 of its stated conviction; an underconfident system is never boosted.
  Trading-safety note: this can only REDUCE autonomous trading activity,
  never increase it — but it does touch the live decision pipeline, so this
  cut requires the usual human sign-off. Surfaced in AIInsightsPanel as a
  CALIBRATION strip (Brier · multiplier · n + per-bucket health bars).
  14 new vitest cases (`calibration.test.ts`).

- **Nightly backtest self-evaluation (`services/self-eval.ts`).** At 02:30
  local the engine re-runs its strategy roster — `BrainStrategy` with the
  LIVE learned weights, plus Momentum / MeanReversion / Breakout and the
  regime-routed `StrategyEnsemble` — over the day's in-memory candles,
  regression-checks each (strategy, symbol) against a locked baseline via
  `compareReports`, and writes a verdict table to `Vault/Backtests/`
  (baselines under `Vault/Backtests/baselines/`; delete a stale baseline to
  promote an intentional improvement). Strictly observational: never submits
  or gates an order, never mutates brain/pattern/tactics state. Regressions
  surface as WARN lines in the SystemLogs panel. Fully DI'd — scheduling,
  baseline policy, and report rendering are unit-tested without Electron or
  disk. 10 new vitest cases (`self-eval.test.ts`).

- **Formal type scale (audit §4.2.1 — the 2026-05-14 handoff item that never
  shipped).** Nine `--text-*` tokens (8.5 → 36px) in `globals.css`; all 277
  hardcoded `font-size` declarations (16 distinct px values) now route
  through the scale. Sizes snapped to the half-step grid (max visual delta
  0.5px: 8→8.5, 9→9.5, 10→10.5, 11→11.5, 12/13→12.5). Density modes become
  a 9-token override block when built. Inline TSX `fontSize:` numbers are a
  tracked follow-up.

### Fixed

- **`fmt.k()` leaked raw float noise on sub-1000 values (P-019).** The compact
  number formatter returned `String(v)` unrounded below 1,000, so fractional
  inputs rendered IEEE-754 artifacts (a size of `0.1 + 0.2` showed as
  `0.30000000000000004`) while the K/M/B branches all rounded. It now rounds
  sub-1000 non-integers to 3 significant figures — consistent with the suffixed
  branches and noise-free (`0.3`); integers still pass through unchanged. Affects
  the four operator surfaces that read it: ChartPanel volume, MarketsOverview
  volume + notional, and the Time & Sales size tape. New `format.test.ts` pins
  all six helpers (15 cases incl. null / NaN / Infinity and the float-noise
  case); the lib previously had zero coverage. All four gates green: typecheck,
  lint, test (63 files / 684 cases), knip.

- **PatternLearner duplicate-SGD updates (P-001, audit §3.3).** Each observation
  inside the 5-min lookback received the same gradient step on ~8 consecutive
  30s cycles (effective LR ≈ 8×, sample counts inflated ~8×). A per-symbol
  high-water cursor now guarantees exactly one update per observation; the
  cursor advances only on successful labeling so horizon-pending rows retry.
  In-memory by decision (restart re-labels ≤5 min once — bounded). `cycle()`
  made public for tests/on-demand runs. 3 new vitest cases.

- **Order ticket no longer clips to invisible at small window heights
  (P-002, audit §3.2).** Below ~1010px of window height the right rail's fixed
  rows (288+268px) exceeded the main row and `overflow:hidden` hid the
  ExecTicket — including at the ALLOWED minimum window 1200×720. A
  `max-height: 1009px` media query turns the rail into a thin-scrollbar column
  with full-size panels; order entry is reachable at every height, zero change
  on 1080p+ displays.

- **Accessibility floor (P-003, audit §3.9).** Global token-driven
  `:focus-visible` ring (the terminal is keyboard-first but focus position was
  invisible) and a `prefers-reduced-motion` block that collapses
  animations/transitions for vestibular-sensitive operators.

- **Risk-gate correlation computed on returns, not prices (P-010, audit §3.4).**
  Gate 5's Pearson ρ was computing correlation of raw closes, which reads shared
  *trend* as co-movement (two trending series with independent returns read
  price-ρ>0.95 but return-ρ<0.35). New `toLogReturns()` function (zero-price
  guarded) diffs aligned closes into log-returns before `correlation()`.
  `correlationWatch` threshold retuned 0.60→0.45 to reflect structural difference
  in return-space ρ (0.45 avg pairwise return-ρ genuinely indicates crowded
  positions). The gate now displays meaningful correlation structure.

- **Renderer CSP no longer allowlists an LLM endpoint (audit §3.6).**
  `aistudio.baidu.com` removed from `connect-src` — all LLM traffic
  originates in the main process, so the entry only handed an XSS'd renderer
  a sanctioned exfiltration channel.

- **Theme-reactivity leaks (audit §3.7).** Double-top/bottom chart markers
  and legend swatches now resolve `--bb-pos` / `--bb-neg` via `readCssVar`
  (canvas) and CSS vars (DOM) instead of hardcoded hex; the Settings
  data-source pill drops its off-brand Tailwind palette (`#22c55e`/`#f5a623`)
  for `--bb-pos` / `--bb-warn`. Mono and Bluyel themes now recolor these
  surfaces correctly.

- **`CLAUDE.md` drift (audit §3.8).** Two stale claims corrected: CI runs all
  four gates (not "typecheck + vitest only"), and the F.1 facet migration is
  complete (no `this.alpaca.submitOrder/getAccount/cancelOrder` call-sites
  remain — the "~30 sites" follow-up shipped).

- **F.1 — BrokerAdapter abstraction + Alpaca reference implementation.** Lands the
  broker-portability foundation for Phase F (Rithmic / Tradovate execution next). A
  new `@shared/broker/` contract layer (`MarketDataSource`, `OrderRouter` +
  `OrderEvent` + `OrderAck` + `failUnacked`, `AccountSyncer` + `AccountSnapshot`,
  `SymbolResolver`, `BrokerError` + retryable taxonomy, and the `BrokerSession`
  umbrella + `SessionState` 5-state lifecycle) is paired with four Alpaca
  concretes under `main/services/alpaca/`: `AlpacaSymbolResolver` (equity
  identity + crypto pair normalization), `AlpacaAccountSyncer` (REST pull),
  `AlpacaOrderRouter` (caller-supplied UUIDv4 `clientOrderId`, **pre-REST
  dedup** so retries never hit the wire twice, OrderEvent translation,
  `failUnacked` drain), and `AlpacaBrokerSession` (composes the four facets +
  state machine). `AlpacaClient` gains an additive
  `onConnectionStateChange(fn)` event source — dedup'd snapshots emitted on
  every WS open / close / reconnect-timer transition across all three feeds —
  so the session can synthesize the 5 states honestly. `trading-engine.ts`
  now drives the equity + account WS lifecycle through
  `session.connect()` / `session.disconnect()` at all three construction
  call-sites (cold boot, data-feed switch, reconnect). Behavior delta worth
  noting: the live ⇄ simulator data-feed switch now also tears down the
  account WS + emits REJECT via `failUnacked('broker-session-disconnected')`
  for any in-flight orders — previously the account stream leaked silently on
  switch-to-simulator. Engine usage of `this.alpaca.submitOrder` / `.getAccount`
  / `.cancelOrder` (~30 call-sites) and crypto WS lifecycle are intentionally
  out of scope this cut. Design + locked decisions:
  `docs/superpowers/specs/2026-06-01-alpaca-broker-session-design.md`.

- **Renderer frame-budget canary.** New opt-in Playwright E2E
  (`tests/e2e/renderer-perf.spec.ts`, gated by `SATEX_E2E_PERF=1`) boots the app under an
  isolated, offscreen simulator profile, switches to the Trade workspace, and drives the
  lightweight-charts `ChartPanel` via watchlist symbol rotation while the tick stream runs.
  It captures every frame delta through a new `perf.frameProfile` and asserts the renderer
  holds its budget — **p50 ≤ 16 ms** (60 fps floor) and **p95 ≤ 10 ms** (median-of-3 baseline
  8.3 ms × 1.15) — plus a stress-sufficiency gate and zero console errors. Backed by
  `perf.frameProfile` (pure `summarizeFrames` percentile/fps/jank math + a thin RAF collector)
  and `perf.measure` timing on the ChartPanel `setData`/`update` hot paths — the same `update`
  path whose S1-1 regression once cost 125 ms boot frames. New `src/renderer/lib/perf.test.ts`
  pins the math + profiler lifecycle (CI-covered via `npm test`). The E2E is a manual/release
  gate (CI runs no Playwright; promotion tracked as TD-2026-05-22-01). Fulfils the A1 design
  doc's deferred perf canary (§6 Sprint 3). Design + findings:
  `docs/design/2026-05-22-renderer-perf-budget.md`.

- **Runtime data-feed switch (Simulator ⇄ Live Alpaca paper data).** A one-click TopBar
  source chip (`◇ SIM DATA` ⇄ `◆ ALPACA`, cyan — distinct from the amber PAPER/LIVE money
  toggle) swaps the market data feed at runtime, no restart. The swap is transactional
  (`prepare`→`commit`: Alpaca REST auth runs before any teardown, so a failed switch is a
  clean no-op) and reconciles the OrderManager to a clean state (→Sim: fresh $100k paper;
  →Live: real Alpaca paper positions/equity via `syncFromAlpaca`). Strictly paper-safe: the
  switch is refused while ● LIVE real-capital is armed or a replay is active, and `submitOrder`
  is gated mid-swap. Stored Alpaca keys persist across relaunch (safeStorage), so the live
  feed stays available with no re-entry — covered by a new persistence E2E. Interlock logic is
  the pure, unit-tested `data-source-guard.ts`. Design:
  `docs/design/2026-05-24-data-feed-switch.md`.

## [0.5.0] - 2026-05-26

The v0.5 RC cut. Quad chart rebuilt from the ground up on `lightweight-charts`,
plus an asset-class-aware data path that turns the simulator + historical
backfill into a coherent story across equities, indices, futures, and crypto.
Tasks 1–4 from the 2026-05-25 dev plan all land here; final audit pass at
`62de93b` tightens the boot critical path and removes residual `as number`
casts. Master moves from 247/247 to **366/366 vitest cases across 31 files.**

### Added

- **Quad chart rebuild — 2×2 lightweight-charts panes.** Replaces the
  hand-drawn SVG `ChartCanvas` (~300 lines deleted) with four independent
  `QuadPaneChart` instances. Each pane is a self-contained
  `lightweight-charts` instance with its own candlestick + EMA + VWAP series,
  RSI14 header, and a clean "— awaiting <symbol> data —" empty state. No
  more fabricated seed-priced flat lines when a pane has no data.
  Click-to-expand 1-of-4 focus and the symbol-swap picker are preserved.
  Design: `docs/design/2026-05-25-quad-chart-navigation.md`.

- **Independent per-pane navigation.** Native drag-pan and wheel-zoom on
  each pane's timeline. **No shared crosshair, no synchronized scroll** —
  each pane is an isolated chart instance with its own time scale
  (`handleScroll: true`, `handleScale: true`). The previous shared `hover`
  state and the `usePaneData` seed stub are both gone.

- **Full theme reactivity on Quad panes.** Candles read from
  `--bb-pos`/`--bb-neg` CSS variables via the new `candlestickColors`
  mapper (extracted from `ChartPanel` so single and quad share one
  contract); EMA colors come from `--bb-ema9`/`--bb-ema21`; VWAP reads
  `--bb-accent` with opacity via `applyOpacity`. Switching theme
  (Classic / Mono / Bluyel) re-applies on every pane via the
  `theme`-keyed effect — no remount needed.

- **Asset-class-aware off-hours backfill.** Cold-booted empty panes
  silently populate from real Alpaca bars via the existing
  `getHistoricalBars` IPC, dispatched per `UniverseEntry.assetClass`:
  - **equity / index** → last completed NY session, 1Min bars (existing
    behavior, threaded through the renderer planner's new `assetClass`
    field).
  - **crypto** → rolling 24h ending now via the new
    `/v1beta3/crypto/us/bars` endpoint and `AlpacaClient.getCryptoBars`.
    The renderer planner skips the `isMarketOpen` gate for crypto since
    24/7 markets have no RTH window.
  - **futures** → no Alpaca feed; falls back to the live simulator
    stream / "awaiting data."
  IPC contract is unchanged; the asset-class dispatch happens in main via
  `findUniverseEntry`. `ChartPanel`'s post-backfill banner branches to
  "Showing last 24h of crypto bars" for crypto symbols and suppresses
  the "add Alpaca keys for the last NY session" nudge (nonsense for an
  asset class without NY sessions; the sim emits crypto 24/7 anyway).

- **Asset-class-aware simulator emission gate.** Crypto and futures now
  emit ticks + candles **24/7** in the simulator. Equities and indices
  still freeze outside US RTH so the chart doesn't fabricate movement
  while real markets are closed (preserves the 2026-05-17 fix). The
  `SATEX_SIMULATOR_24_7=true` escape hatch still forces everything on.
  Per-asset-class gate (`shouldEmitFor`) is applied inside both `tick()`
  and `rollCandle()` so individual symbols can be included/excluded on
  the same pass.

- **Boot-time simulator seed hydration.** When Alpaca credentials are
  saved, the engine fetches real-market snapshots (`/v2/stocks/snapshots`
  + `/v1beta3/crypto/us/latest/trades`) at init and feeds them into the
  `MarketSimulator` constructor as `seedOverrides`. The GBM walk now
  starts from realistic prices instead of the hardcoded `UNIVERSE.seed`
  values (some of which were a year or more stale — NVDA $965.20 was
  the pre-2024-split equivalent). Bounded by a **1-second budget** so
  the "boot critical path under 1s" invariant is preserved on slow or
  unreachable Alpaca; falls back to `UNIVERSE.seed` silently on failure.
  Defensive checks reject NaN / 0 / negative overrides (a 0 override
  would DoS `Math.exp` on log-return updates).

- **Shared renderer helpers.** Three pure modules extracted from the
  Quad work, all unit-tested independently:
  - `renderer/lib/quad-chart-theme.ts` — `candlestickColors(readCssVar)`
    maps the active theme's CSS variables to `lightweight-charts`
    options. Replaces the inline candle-init logic in `ChartPanel`.
  - `renderer/lib/chart-series.ts` — `emaSeries` + `vwapSeries` pure
    functions (extracted from the SVG `ChartCanvas`; reused by both
    Quad panes and any future small-chart use).
  - `renderer/lib/color.ts` — `applyOpacity` (hex + rgb + named-color
    aware) shared by the EMA regime tinting and VWAP overlay.

### Changed

- **AlpacaClient WS reconnect math** is now a pure helper:
  `alpaca-reconnect.ts` exports `computeReconnectDelay(attempts,
  cooldownUntilMs, nowMs)` which returns `max(exponentialBackoff,
  cooldownRemaining)`. Equity, crypto, and account WS reconnect paths
  all consume it — single source of truth for the 1s → 30s exponential
  back-off and the 60s 406 cooldown. Behavior unchanged for equity;
  see "Fixed" below for the crypto/account behavior change.

### Fixed

- **Crypto WS now honors Alpaca's 406 connection-limit cooldown.** The
  equity feed has held the cooldown contract since v0.4.2: on
  `T:'error', code: 406` ("connection limit exceeded"), set
  `connectionLimitCooldownUntil = now + 60s` so the next reconnect waits
  out the orphan-socket TTL. The crypto feed shipped without that
  guard — its `onCryptoDataMsg` logged 406 but did nothing. Its
  `onclose` then computed pure exponential backoff (1s, 2s, 4s, 8s, 16s,
  cap 30s) and would burn through all six attempts inside the 60s
  window, keeping the limit pinned. Fixed by treating 406 identically
  in both error handlers; both reconnect paths now read the shared
  cooldown via `computeReconnectDelay`. The account-WS reconnect path
  also routes through the helper so a data-WS 406 slows it too
  (Alpaca counts orphan sockets account-wide).

- **Crypto WS reconnect-timer guard.** Pre-fix, crypto's `onclose`
  scheduled a bare `setTimeout(..., backoff).unref?.()` with no handle
  tracked, so a rapid close+close sequence on a flaky connection could
  schedule overlapping reconnects. Added `cryptoReconnectTimer` field
  + early-return guard, matching the equity and account paths.
  `disconnectCryptoStream` now clears the timer.

- **Off-hours backfill no longer hijacks the workspace.** Pre-fix, the
  2026-05-17 off-hours backfill drove a *replay* to load the day's
  bars, which forced `App.tsx`'s `effectiveWs` to `Replay` (so the
  scrubber couldn't disappear mid-tape), hijacking the user's chosen
  workspace (Quad / Trade / Focus / Markets) every off-hours launch
  whenever Alpaca creds were saved. The replay-free
  `planLastSessionBackfill` writes the day's bars directly into the
  candle store via `getHistoricalBars`. No tape, no session, no
  workspace takeover. Design:
  `docs/design/2026-05-25-offhours-chart-backfill.md`.

- **Defense-in-depth try/catch on `QuadPaneChart` backfill.** The
  planner's internal awaits (`getCredentialsMasked`, `fetchBars`)
  already swallow Alpaca-side failures and return `ok:false`, so the
  pane gracefully stays in the empty state. Added an outer try/catch
  for unexpected rejections (main process unresponsive, preload bridge
  missing) so the renderer never sees an unhandled rejection — mirrors
  `ChartPanel`'s pattern.

### Architecture

- Per the v0.6 design adoption plan, the **renderer perf canary**
  from the prior cycle (`tests/e2e/renderer-perf.spec.ts`) targets the
  single `ChartPanel` — the Quad rebuild is intentionally *not*
  benchmarked yet because each pane runs the same `lightweight-charts`
  instance the single chart already uses, and four parallel charts
  would skew the percentile baseline beyond the median-of-3 reference.
  Promoting the canary to gate Quad too is tracked as a follow-up.

### Tests

- Vitest 247/247 (master baseline pre-Quad) → **366/366 across 31
  files** post-Quad. New / extended:
  - `chart-backfill.test.ts` +5 crypto cases (assetClass bypass of
    market-open gate, in-replay and no-creds still skip, back-compat
    for omitted assetClass).
  - `alpaca.test.ts` +18 cases (getCryptoBars URL formatting and
    parsing, getLatestPrices stocks + crypto branches, 406 cooldown
    wiring, mid(bid,ask) fallback, empty-input short-circuit).
  - `alpaca-reconnect.test.ts` — new file, 7 cases pinning the
    exponential progression + cooldown semantics.
  - `historical-importer.test.ts` +7 crypto-bars cases (24h window,
    hoursBack honored, unsupported timeframe short-circuits the
    network, fetch failure surfaced cleanly).
  - `market-data.test.ts` — new file, 8 cases (asset-class emit gate,
    seed override application + defenses against NaN/0/negative).
  - `chart-series.test.ts`, `quad-chart-theme.test.ts` — pure-module
    coverage for the extracted helpers (12 cases total).

### Out of scope (deferred)

- Renderer `marketStore` initial state still seeds from
  hardcoded `UNIVERSE.seed` at module-import time. The engine's
  hydrated quotes replace those values within ~50 ms of boot, so the
  stale window is bounded but nonzero.
- Live → Sim runtime toggle does **not** apply seed hydration (would
  add latency to a user-initiated action). Reusing the last-known-live
  quotes as overrides on the swap path is a future improvement.
- Futures backfill still attempts one wasted REST call per pane on
  cold boot (Alpaca returns 4xx for ES/NQ on the stocks endpoint).
  Could short-circuit at the engine dispatch.
- The seed-hydration in-flight fetch isn't aborted when the 1s
  budget expires — request continues until `AbortSignal.timeout`
  (10s). Future cleanup via `AbortController`.

## 0.4.4 (2026-05-XX)

Sub-second crypto candles ship end-to-end. The A1 design doc
(`docs/design/A1-subsecond-candles.md`) called for a three-sprint plan; this
release lands Sprints 1 + 2 (data layer + per-symbol preference UI + chart
legend marker). Sprint 3 (perf canary, retention worker, replay sub-second)
and MAY-TACTICS integration on the sub-second feed (design doc §6 Q2) are
explicitly deferred to v0.5 / v0.6 respectively. The S1-9 auto-update toast
also lands. Installer remains **unsigned** pending the CA-issued Authenticode
certificate (tracked at issue #2).

### Added

- **A1 Sprint 1 — sub-second crypto candle aggregator.** New 250 ms and 500 ms
  timeframe buttons on the chart for crypto symbols (BTC, ETH today; the
  filter is `UNIVERSE.assetClass === 'crypto'` so the set auto-extends if the
  universe grows). New `SubSecondCandleAggregator` service consumes the
  existing `alpaca.onTick` crypto WS stream and rolls per-trade frames into
  both bucket sizes in parallel. New SQLite table `crypto_subsecond_candles`
  (idempotent-additive migration) with 1 000-bucket retention per
  `(symbol, bucketMs)`. New IPC channels `SUBSECOND_CANDLES_UPDATE` (push,
  diff-gated) and `SUBSECOND_CANDLES_GET` (invoke, capped at 4 000 rows). New
  `subsecondStore` Zustand ring keyed by `${symbol}:${bucketMs}`. Equity and
  futures 250 ms / 500 ms buttons render but are disabled with a tooltip
  explaining the SIP entitlement constraint — sub-second is crypto-only by
  design (IEX caps snapshots at 1 s; paid SIP would unlock sub-second
  equities but is out of v0.4 scope). 17 new vitest cases pin the OHLC math,
  the seal-on-roll contract, retention, out-of-order tick drop, multi-symbol
  isolation, and failure resilience.

- **A1 Sprint 2 — per-symbol bucket preference.** New **Settings →
  Sub-second Candles · Crypto only** section lets the user pick 250 ms or
  500 ms as the default bucket per crypto symbol. Preference persists to
  `Vault/Settings/subsecond-prefs.md` (markdown + JSON fence, hand-editable;
  sanitizer drops non-crypto symbols and out-of-range values defensively).
  When a crypto symbol gets focus, the chart auto-snaps to the user's
  preferred bucket — symbol-change-driven via `prevSymbolRef` so a mid-session
  manual timeframe click is never clobbered, but app-open with a crypto
  symbol pre-focused also fires the snap. New IPC channels
  `SUBSECOND_PREFS_GET` + `SUBSECOND_PREFS_SET` (Zod `.strict()` with the
  `{250, 500}` literal-union — a hostile renderer cannot bypass the bucket
  guard or smuggle in extra fields). 26 new vitest cases — 11 on the engine
  prefs API (default fallback, listener fire on accept, silent reject for
  non-crypto, hydrate REPLACES not merges, `getCandleResolutionMs` returns
  1000 for non-crypto, throwing listener does not break the in-memory
  update); 15 on the file-store round-trip (empty initial state,
  fresh-instance read-back, corruption recovery, hand-edit sanitizer).

- **A1 — chart legend SUB badge** (design doc §4.3). Whenever the chart is
  reading from the SubSecondAggregator ring (`showSub === true`), a cyan
  `SUB · 250 ms` / `SUB · 500 ms` marker renders next to the symbol —
  visually distinct from the warn-yellow `SIM` badge so the analyst reads it
  as informational rather than degraded-mode. Gated on the canonical
  `showSub` flag, mirroring the SIM badge's `isSyntheticFeed()` pattern so
  the rendering decision has a single source of truth.

- **S1-9 — Auto-update toast.** New `UpdateToast` component + `electron-updater`
  service. Both `autoDownload` and `autoInstallOnAppQuit` are set to **false**
  on purpose — the toast is the load-bearing consent surface, and a silent
  auto-download against an unsigned build would burn the user's bandwidth on
  a binary the OS would then reject. `update-available` triggers the
  download; `update-downloaded` enables the `[Restart Now]` button. 30 s
  auto-dismiss; 24 h check cadence. New IPC `UPDATE_AVAILABLE` (push) +
  `UPDATE_INSTALL` (invoke). Added `electron-updater@6.3.9`. 8 vitest cases
  on the new update-store.

### Improved

- **SIM badge propagation.** `MarketsOverviewPanel` and `ChartPanel` header
  now render the SIM badge via the canonical `isSyntheticFeed()` helper in
  `src/renderer/lib/feed-status.ts`. The visual decision stays consistent
  across every surface that displays a synthetic-feed quote — the
  `WatchlistPanel` had this already; now the rest of the terminal does too.

### Fixed

- **Kill-switch atomic write.** `kill-switch-store.ts` now writes via a
  tmp-and-rename pattern (`writeJsonAtomic`) instead of `writeFileSync`'s
  truncate-before-write. A crash between the truncate and the write
  previously left a 0-byte file, which `loadKillSwitchState` parsed as
  JSON-fail and returned `{armed: false}` — silently disarming an armed
  kill switch across the crash. The atomic-rename contract closes that gap.
  7 vitest cases pin happy path, overwrite, no-orphan-tmp, rapid-loop,
  failure-path, and crash-simulation.

### Tooling / quality

- **Code health restored to 10/10.** 12 lint warnings cleared (5 stale
  `eslint-disable` directives for a rule that was not in the config; one
  catastrophic 14-missing-dep `useEffect` in `useIPC.ts:127` refactored to
  the `useXStore.getState()` pattern; 3 perf-critical `exhaustive-deps`
  disables in `ChartPanel` documented with the 20 Hz frame-stall rationale).
  66 dead-code items removed (10 placeholder panel files superseded by the
  Black Box panels; 2 unused dependencies — `@electron-toolkit/preload`,
  `echarts`; 38 unused exports downgraded to module-local; 13 truly-dead
  symbols deleted; the `chart-indicators/index.ts` barrel pruned to only
  the actually-consumed re-exports).
- **CI on master.** GitHub Actions `ci.yml` runs `typecheck` + `vitest` on
  Ubuntu Node 20.19 for every push and PR. The latest run for `fa68c55`
  completed green in 59 s.

### Tests

- Total: **222 / 222 passing** across **17** vitest files (up from
  179 / 179 in v0.4.3; +43 across A1 Sprint 1 aggregator, A1 Sprint 2
  engine + prefs service, S1-9 update store, B11 kill-switch atomic write).

### Known limitations / caveats

- **Installer is unsigned.** Windows SmartScreen will display
  "Windows protected your PC" on first install until either (a) the
  Authenticode cert (S1-8) lands and a signed installer is published, or
  (b) SmartScreen reputation accumulates post-cert. Tracked at issue #2.
- **Sub-second is crypto-only.** Equity feeds (IEX) cap snapshots at 1 s;
  paid Alpaca SIP entitlement is required for sub-second equity ticks —
  out of scope for v0.4. The disabled-button + tooltip in the chart
  toolbar makes the constraint discoverable.
- **MAY-TACTICS sub-second integration deferred to v0.6** per design doc
  §6 Q2 — the data layer ships first; tactic graduation follows once the
  renderer has been proven to hold under sustained live sub-second load.
- **Replay tapes do not include sub-second candles in v0.4.4.** Sub-second
  is live-only; replay still shows 1-second candles for crypto. Adding
  sub-second to the replay path is A1 Sprint 3 scope.
- **GPG-signed tags not in use.** The `v0.4.4` tag will ship as an
  annotated (not GPG-signed) tag. The Authenticode signature on the `.exe`
  is what end-users verify; the git tag conveys authorship via commit
  metadata.

### Upgrade notes

- Schema migrations are idempotent-additive — the new
  `crypto_subsecond_candles` table is created on first boot of v0.4.4;
  existing tables and rows untouched.
- Existing indicator settings, workspace state, watchlist, kill-switch
  state, and replay tapes carry over unchanged.
- No end-user environment-variable changes required. Build-time vars
  (`CSC_LINK`, `CSC_KEY_PASSWORD`) become relevant only once the cert is
  in hand on the build machine.

### What's next

- **v0.4.5 (or re-cut as v0.4.4-signed)**: signed installer once issue #2
  resolves.
- **v0.5**: A1 Sprint 3 — perf canary (P95 chart-frame < 16 ms under
  sustained 20-trade/sec BTC), 60-second retention eviction worker,
  telemetry on sub-second emit rate per minute, replay-tape sub-second
  support.
- **v0.6**: MAY-TACTICS scalp-tactic integration on the sub-second feed.

## 0.4.3 (2026-05-19)

Technical-debt close-out + signing infrastructure. All seven v0.4.2-deferred
items shipped behind regression tests. Authenticode signing wiring is in
place but the installer remains **unsigned** pending CA-issued certificate
(see `certs/HANDOFF.md`).

### Tests
- **B1 — tick-recorder flush retry.** 4 new vitest cases pin the
  copy-don't-move semantics + bounded overflow + recovery + idempotency.
  Also fixes a latent v0.4.2 bug: the overflow drop sat on the success
  path where it could never fire; moved into the catch block where it
  actually caps recorder memory at ~1.6 MB during a long DB outage.
- **B2 — alpaca bid/ask sentinel.** 4 new cases pin the trade-frame
  `bid: 0, ask: 0` sentinel + the LiveMarket OR-fallback that preserves
  the prior quote spread. Volume/VWAP gating on `kind === 't'` also
  covered.
- **B3 — futures feed badge.** Extracted the `isSyntheticFeed` decision
  into `src/renderer/lib/feed-status.ts` as a pure function; 12 vitest
  cases over every (asset-class × feed-state) pair. WatchlistPanel
  imports from the lib module. Avoided installing `@testing-library/react`
  + `jsdom` by keeping the testable logic out of the React component.
- **B4 — replay clock anomaly.** 5 cases use `vi.setSystemTime` to
  simulate NTP step-backward and laptop suspend. Pin `autoPausedReason`
  semantics and the unpause/setSpeed baseline reset so manual pause +
  speed-flip don't trip the detector.
- **B5 — alpaca NaN injection (critical).** 12 new cases — 8 cover the
  WS-boundary `num()`/`ts()`/`sym()` guards directly; 4 cover the
  OrderManager Gate 0 `Number.isFinite(ctx.refPriceAge)` hardening.
  Hostile-frame payloads (object-shaped numerics, bad timestamps,
  100-char symbol DoS) verified to produce finite values + length-capped
  symbols across both equity and crypto handlers.

### Fixed / refactored
- **B6 — `STARTING_EQUITY` → `DEFAULT_EQUITY`.** Eight call sites
  renamed. Old name implied the live session-start equity; the value is
  in practice a constructor/display default that the OrderManager
  rebases on first Alpaca sync. Grep for `STARTING_EQUITY` in `src/`
  returns 0.
- **B7 — opt-in HW acceleration.** Default behavior preserved (HW accel
  DISABLED — safe for flaky Win11 GPUs) but now opt-in via
  `SATEX_HW_ACCEL=1` env var or `userData/enable-gpu.flag` file. On
  `child-process-gone` (GPU crash) the flag auto-deletes for the next
  boot, so one GPU crash heals itself.
- **B8 — `SATEX_VAULT_ROOT` env override.** Vault root resolution now
  honors the env var first; final fallback changed from `process.cwd()`
  to `userData/Vault` (cwd() in packaged installs lands on Program Files
  where writes either fail or pollute system paths).
- **B10 — initial-state push race removed.** The previous `setTimeout(
  1500ms)` in `app.whenReady()` pushed 12 channels at a hard-coded
  delay. Moved into the `SUBSCRIBE` IPC handler via `rebroadcastSnapshot()`
  so initial state ships on the renderer's actual readiness signal.
  Bonus: previous SUBSCRIBE pushed a `symbols.includes`-filtered
  `QUOTES_TICK` that was always empty (renderer passes `[]`) — now
  pushes the full snapshot.
- **B11 — `powerMonitor` lifecycle for TickRecorder.** Laptop
  suspend → recorder pauses. Resume → recorder resumes + force-flushes
  the in-memory buffer rather than waiting for the next 1s timer tick.
  Listeners off()'d in shutdown to prevent HMR leak.

### Security
- **B9 — CSP violation reporting.** New `CSP_VIOLATION_REPORT` IPC
  channel + Zod schema + preload bridge. Renderer's
  `securitypolicyviolation` event listener forwards each violation to
  main, where the rotating S1-7 file sink captures it at WARN level.
  Any future XSS-via-CSP-block attempt now leaves a forensic trail.

### Infrastructure
- **S1-8 (Authenticode signing).** Build wiring is cert-ready:
  - `electron-builder.yml` documents the `CSC_LINK` / `CSC_KEY_PASSWORD`
    env-var pair; sets `signingHashAlgorithms: [sha256]`.
  - `scripts/prepack-check.js` now warns (not fails) when those env
    vars are unset, so dev/smoke builds still produce an unsigned .exe
    without ceremony.
  - `certs/satex-codesign.inf` + `certs/satex-codesign.csr` generated
    on the build machine (private key in CurrentUser cert store, pending
    issued cert).
  - `certs/HANDOFF.md` documents the full CA-engagement workflow
    (Sectigo/DigiCert/SSL.com options + price + EV vs OV trade-offs;
    `certreq -accept` flow; PFX export; env-var-set + verify-signature
    commands). The actual procurement is unavoidably user-action (CA
    identity verification, payment, multi-day issuance) and remains the
    single v1.0 ship blocker.

### Tests
- Total: **164 / 164 passing** (up from 127 in v0.4.2; +37 across B1, B2,
  B3, B4, B5).

## 0.4.2 (2026-05-18)

### Fixed
- **Tick recorder data loss on flush failure (B1).** `flush()` previously moved
  the in-memory buffer reference into a local before calling `insertTickBatch`,
  so an insert error dropped the rows on the floor with only a `warn` log.
  Buffer is now copied (not moved), spliced only on insert success, and a
  failed flush leaves the buffer intact for the next retry. Bounded overflow
  at `MAX_BUFFER * 4` drops oldest rows during sustained outages, capping
  recorder memory at ~1.6 MB worst-case. `INSERT OR REPLACE` is idempotent
  on the `(session_id, ts, symbol)` PK, so retries can't double-write.
  Surfaced via `failedFlushCount` in `TickRecorder.stats()`.
- **Bid/ask flicker on trade frames (B2).** Alpaca's `t` (trade) frame carries
  no quote book data; the prior code cloned the trade price into `bid` and
  `ask`, which collapsed the LiveMarket spread to 0 on every trade and
  re-expanded it on the next `q` frame (~10×/sec flicker on liquid names).
  Trade frames now ship `bid: 0, ask: 0`; LiveMarket's existing OR-fallback
  preserves the prior quote-derived bid/ask. Replay tape unaffected — it
  records the LiveMarket-public Quote, not the raw tick.
- **Futures-feed badge (B3).** ES/NQ/CL/GC are in UNIVERSE but the IEX
  data feed carries no futures data; quotes for these symbols come from a
  synthetic GBM seed walk via `trading-engine.seedHistoricalCandles`. They
  used to look indistinguishable from live equity quotes in the WatchlistPanel.
  New `FEED_STATUS_UPDATE` IPC push surfaces per-asset-class feed state
  (`equity: 'live' | 'simulator' | 'off'`, `futures: 'live' | 'synthetic'`,
  `crypto: 'live' | 'off'`); WatchlistPanel renders a small SIM badge next
  to the ticker when the row's asset class isn't `live`. Diff-gated in the
  engine so the renderer doesn't re-render on every 2s heartbeat.
- **Replay clock backjump / suspend (B4).** `ReplaySource.tick()` computed
  cursor purely from `Date.now()`, so an NTP correction backward made the
  cursor regress (re-reading drained rows) and a laptop suspend made it
  jump forward by suspend×speed (silently snapping past hundreds of buckets
  beyond `MAX_ROLLS_PER_CALL`). Each tick now compares the wall delta
  against a 5-second anomaly threshold; on detection the source auto-pauses
  with `autoPausedReason` set to `'wall-clock-backjump'` or
  `'suspend-detected'`. ReplayPanel shows a human-readable note in the
  footer; the existing Resume button restarts cleanly because the tape has
  absolute timestamps.

### Added
- **`FEED_STATUS_UPDATE` IPC push channel** + `FeedStatus` shared type. Diff-gated
  emit from `TradingEngine.broadcastStatus` whenever an equity/crypto class
  changes connection state. Initial-state snapshot included in the post-init
  push block and the visibility-restore rebroadcast path.
- **`feedStore`** (Zustand) on the renderer side, subscribed via `useIPC`. The
  WatchlistPanel SIM badge reads from this store; future per-asset-class UI
  surfaces (depth panel, order-bar warning, etc.) can plug in without new
  IPC wiring.
- **`scripts/prepack-check.js`** + new `prepack:check` npm script chained into
  `pack:win`. Refuses to build if `src/main/index.ts` contains a hardcoded
  version literal — catches future drift the same way the 0.3.0→0.4.1 string
  silently drifted three releases.

### Security
- **NaN poisoning at WebSocket boundary (D6 · critical).** A crafted JSON
  frame from a compromised upstream proxy or MITM could put NaN into
  `q.volume`, `q.vwapNumer`, and `q.timestamp` via `Number(...)` /
  `new Date(...).getTime()`. The poisoning propagated permanently (NaN
  arithmetic stays NaN) and — worst impact — caused `refPriceAge = NaN` in
  the live order path, where the Gate 0 stale-quote check
  (`NaN > MAX_QUOTE_AGE_MS === false`) **failed open**, allowing orders to
  bypass freshness validation. New `num()`, `ts()`, and `sym()` helpers on
  `AlpacaClient` enforce `Number.isFinite` and a 16-char symbol length cap
  at the WS boundary; `OrderManager.validate` Gate 0 also rejects non-finite
  `refPriceAge` as defense-in-depth.

### Notes
- Test suite: 127/127 passing (same count as 0.4.1; no new cases were
  added with this release because all six fixes are observable in
  pre-existing test scaffolding or in runtime behavior the unit tests
  don't reach — added cases are deferred to 0.4.3).
- Installer still unsigned; SmartScreen warns on first install. Authenticode
  cert procurement (S1-8) remains the next operational blocker for clean
  end-user distribution.

## 0.4.1 (2026-05-18)

### Added
- Brand icon (ember colorway) embedded as multi-resolution `resources/icon.ico`.
  Replaces the prior `icon.png` reference in `electron-builder.yml` that
  pointed at a file that never existed; packaged builds used the default
  Electron icon as a result. Recipe documented in the project memory under
  `reference_logo_assets`.

## 0.4.0 (2026-05-18)

### Fixed
- 1 critical + 4 high + 13 medium/low findings from the 2026-05-17 audit
  (commits `4982185 .. f3ced80`). Highlights:
  - **Paper-mode sell-fill double-count** — `applyFill` no longer adds
    `cost + pnl` to cash; the realized PnL is already implicit in the sale
    proceeds. Pre-fix, every closed position inflated paper-mode cash by
    the PnL delta.
  - **Risk-gate daily-loss baseline** — gate now reads
    `getSessionStartEquity` instead of the `STARTING_EQUITY` constant. The
    constant lags any actual Alpaca account sync.
  - **Volume / VWAP inflation** — `LiveMarket.onTick` only accumulates
    `volume` and `vwap` on `kind === 't'` (trade) frames. Quote-update
    frames previously contributed bid+ask depth to the volume metric,
    inflating it ~10× and poisoning VWAP.
  - **Replay tick skip** — `ReplaySource.refillPrefetch` pages until the
    underlying `readTapeRange` returns fewer than `PAGE_LIMIT` rows. The
    prior single-read silently dropped 25-50% of ticks at ≥30× speed on
    live-recorded tape.
  - **Kill-switch disarm native dialog** — `IPC.RISK_KILL false` now goes
    through `dialog.showMessageBox` whenever live-mode is armed. Mirrors
    the live-mode enable interlock (C6) so a renderer compromise can't
    silently disarm via `window.satex.killSwitch(false)`.

### Security
- **Electron sandbox + CSP hardening (5 medium).** `sandbox: true` on the
  BrowserWindow webPreferences; `script-src 'self'` (no `'unsafe-inline'`)
  on the renderer CSP; scheme allowlist on `shell.openExternal`;
  `AutonomousConfig` Zod schema tightened to `.strict()`; IPC byte-size ca