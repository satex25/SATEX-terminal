# Changelog

All notable changes to SATEX (satex-app) are recorded here. Format roughly follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); we don't strictly follow
semver because the app is still pre-1.0 — minor bumps may introduce behavior
changes alongside fixes during the v0.x stabilization series.

## Unreleased (v0.6 "Black Box")

### Added

- **P-102: post-intro session reveal — the terminal now eases open on the Quad workspace with a staggered fade instead of snapping in.** After `BootIntroSequence` dissolves and unmounts (`splashDone`), `.bb-app` gains a `bb-shell-reveal` class that runs a one-shot `session-reveal` keyframe (820ms, `translateY(6px)`→0 + opacity 0→1) staggered across the five grid rows (0/70/150/230/300ms) so the masthead, tape, main row, bottom bar and status strip cascade in. Renderer/CSS only — no IPC, no engine, no perimeter contact; a one-time mount animation with zero steady-state cost, so the P3 frame budget is unaffected. `prefers-reduced-motion` collapses it to a 240ms plain fade. Also: `DEFAULT_WORKSPACE_STATE.landingWorkspace` default flipped `Trade`→`Quad` so a fresh install lands on Quad to match the operator's configured opening (existing saved `workspace-state.md` preferences are untouched — the tolerant-hydrate contract still wins). Gates (2026-07-13, /tmp-clone Node 20): typecheck node+web exit 0 · eslint `src tests` exit 0 (0 warnings) · targeted vitest workspace-state + workspaceStore + ipc-schemas + intro-sequence 64/64 · knip CI-arbitrated (sandbox oxc OOM, P-097).
- **P-101 (Track B/B1): the DISCIPLINE panel now shows which strategies carry a statistically real edge — the nightly PSR/DSR verdicts reach the cockpit for the first time.** New **EDGE** block under Conviction/AUDIT-RISK: top 3 strategies by Deflated Sharpe (`strategy · symbol`, DSR%, verdict dot), a verdict-count header (`n real · n selection-risk · n noise`) and report age, explicit cold-boot copy ("No self-eval yet — runs nightly 02:30, or trigger in Settings."), `n/a` (never a fabricated number) on null DSR. Plumbing is deliberately minimal and read-only: `SelfEvalService` retains the last run's rows post-`withDsr` (`getLastReport()`), `TradingEngine.getSelfEvalReport()` mirrors `getSelfEvalStatus` null-safety, one invoke-only IPC channel `SELF_EVAL_REPORT_GET` (no request payload, exactly the `CALIBRATION_GET` shape, **no setter sibling**), preload `getSelfEvalReport` (the `window.satex` type flows via `SatexAPI = typeof satexApi`). The `real/selection-risk/noise` thresholds were extracted from `renderReportMd`'s inline ternary into the ONE shared `@shared/backtest/edge-verdict.ts` `classifyEdge` — markdown output pinned byte-identical by a characterization test, so panel and report can never drift. Renderer interpretation is headless and pure (`lib/self-eval-edge.ts`: `rankTopByDsr` DSR-desc nulls-last with PSR→Sharpe tie-breaks, `verdictCounts`, `fmtDsr`). Observational wall (§3.6 invariant 3) intact: display surface only, zero trading-path contact. Panel poll: 60s with `clearInterval` + `cancelled` cleanup (PR #6 lesson); EDGE rows region bounded with `overflow-y: auto` against the compact-panel overflow risk. Tests +18 (5 `classifyEdge`, 13 selector) plus `getLastReport` coverage. Gates (2026-07-13, in-sandbox Node 22): typecheck node+web exit 0 · `eslint src tests` exit 0 · vitest segmented exact-cover 127 files / 1,686 tests / 0 fail · knip CI-arbitrated (P-097). Blueprint: `docs/superpowers/specs/2026-07-13-track-b-significance-expectancy-surface-ultraplan.md`. Live-render check (real rows fit panel height after Run Self-Eval Now) pending on operator hardware.

- **P-098: cold-boot intro replaced — STANDBY GATE → BOOT CEREMONY (the operator's actual Claude-Design intro).** New `BootIntroSequence` overlay implements `SATEX Intro.dc.html` (frame-verified against the operator's 2026-07-13 recording): a framed **standby gate** that holds indefinitely — double hairline border, OPTIONS button (opens the real Settings modal above the plate), live `UTC`/date, CHANNEL/SESSION/FEED corners, 58px wordmark + drawn rule + subtitle, and a breathing PRESS ANY KEY TO CONTINUE (steady 2.6s cadence drifting to a randomized 3.2–5.4s after ~6s; pure `breathCycleMs` is unit-pinned). One plain keypress (or click) arms — a 0.5s fade — then the **boot ceremony** plays 8.2s with no skip: 188px letters resolve out of an 8px blur (staggered 0.7–1.74s), a text-clipped light sweep crosses the wordmark at 3.1s, rule at 3.5s, subtitle at 4.1s, VERSION/SESSION credits at 5.0/5.4s, and the design's integrated gvBootOut dissolve (steady to 90.2%, then fade/scale) reveals the already-warm terminal. The fixed 1920×1080 design stage scales to fit the window. Safety/correctness: chords and bare modifiers fall through untouched (⌘⇧K kill chord, P-044) and the overlay never calls preventDefault; new `holdKeys` prop suspends arming while Settings/palette/tweaks are open so typing into an overlay can never arm the boot; z-stack re-ranked `.sxg` 8000 < `.modal-back` 8500 < `.kill-arm-overlay` 9000 — the kill-arm progress card now renders above the intro (the old splash at z-9999 covered it); `onComplete` is ref-stabilized so App re-renders can't restart the ceremony timer (in Electron the engine re-renders App constantly — the ceremony would never have finished; found by live DOM probing of the dev renderer). `prefers-reduced-motion` collapses the ceremony to 0.9s and lands animations on end-states. Deleted: `SplashIntro.tsx` and the three film-sequence frames from this branch's first cut — that cut had been built from `Intro Rework.dc.html`, a Turn-01 exploration the AI-drafted implementation brief mis-identified as the final design (see P-098 ledger correction; the operator's recording + `SATEX Intro (standalone).html` are the authority). Headless machine + formatters in `lib/intro-sequence.ts`, 16 tests. Live-verified via DOM probe: gate→arm→boot 8,036ms→done; OPTIONS modal above gate; modal typing never arms. Gates (2026-07-13): typecheck node+web exit 0 · eslint scoped exit 0 · vitest renderer/lib 138 + stores 104 + chart/components 84 (untouched segments green in this session's full 127-file sweep) · knip CI-arbitrated (P-097).

- **P-096: the nightly self-evaluation now reports statistical significance — PSR, DSR, and a verdict glyph — beside every naive Sharpe.** `self-eval.ts` `runOnce()` computes `significanceFromReturns(barReturns(report.equityCurve))` per `(strategy × symbol)` row (Bailey–López de Prado Probabilistic Sharpe Ratio + minimum track-record length, from the pure `src/shared/backtest/significance.ts` module landed by the dawn session), then a trial-aware second pass deflates every row against the expected max-Sharpe-under-null across N = the rows raced that night (`withDsr` → Deflated Sharpe Ratio). `renderReportMd` gains `PSR | DSR | Signif.` columns (✅ real ≥ 95% DSR · ⚠️ selection-risk ≥ 95% PSR without DSR · 🔬 noise-band otherwise), an N-trials footer, and honest `n/a` (never NaN) on degenerate curves; `reporter.ts`’s standalone headline card gains PSR + minTRL rows (DSR intentionally absent there — a single report has no trial set to deflate against). Strictly observational per Constitution §3.6: print-only — feeds no risk gate, position size, calibration multiplier, or autonomous decision; `metrics.ts` byte-for-byte unchanged. Also: `SignificanceMetrics` re-exported from `@shared/backtest/types`, and a `significance.ts` header-comment typo fixed (raw kurtosis of a normal is 3.0, not 4.0). Tests: `self-eval.test.ts` 10→14 (columns render; degenerate → `n/a`; single-trial DSR === PSR; multi-row DSR ≤ PSR), `reporter.test.ts` 12→14, plus the dawn session’s `significance.test.ts` 23. Gates (2026-07-10, in-mount Node 22.22.3): typecheck node exit 0 (7.7s) + web exit 0 (7.4s) · lint `eslint src tests` exit 0, 0 warnings (18.8s) · vitest exact-cover segmented 124 files / 1628 tests / 0 fail (12 invocations, all exit 0; 45s-call-ceiling workaround) · knip not sandbox-runnable — binary crashes under Node 22 (oxc raw-transfer) and `knip-wrapper.mjs` proven false-green (P-097) — CI is the knip arbiter. Blueprint: `docs/superpowers/specs/2026-07-10-probabilistic-deflated-sharpe-significance-ultraplan.md`.

### Changed

- **P-115: full-repo dependency upgrade — 7 staged PRs (#55–#61) took every runtime and toolchain dependency to latest-or-latest-compatible.** React 18.3→**19.2.7**, Electron 32→**43.1.1**, TypeScript 5.6→**6.0.3** (TS 7 "tsgo" not yet adoptable — typescript-eslint 8.64.0 peers `<6.1.0`), Tailwind 3→**4.3.3** (verified no-op: `globals.css` is hand-authored with no Tailwind entry point, built CSS byte-identical pre/post), vite 5.4→**7.1**, vitest 2.1→**4.1**, electron-vite 2.3→**5.0**, better-sqlite3 ^11.5→**^12.11.1**, plus `electron-rebuild` (deprecated)→`@electron/rebuild` 4. **npm audit: 22 findings (15 HIGH + 1 CRITICAL) → 3 (2 low, 1 moderate); all HIGH/CRITICAL cleared.** Code adaptations, one per stage: `Icon.tsx` imports `JSX` as a type from `'react'` (React 19 dropped the global namespace); `tsconfig.node.json`/`tsconfig.web.json` `moduleResolution -> "bundler"` (modern deps ship types only via `exports` maps) with a new `src/renderer/assets.d.ts` `declare module '*.css'`; `postcss.config.js` swapped to `@tailwindcss/postcss`; `subsecond-telemetry.test.ts` mock retyped for vitest 4's stricter `Mock` inference. Runtime `dependencies` count unchanged at **10**. Zero perimeter contact across all 7 stages (verified by diff each stage: no touches to `order-manager.ts`, `risk-gates.ts`, `kill-switch-store.ts`, `live-mode.ts`, `services/alpaca/order-router.ts`, or `auto-update.ts`'s pinned feed/consent flags). Gates: each stage verified locally (typecheck/lint/knip/build all 0, Windows) and CI-gated at merge via the `main-protection` required check (P-095); this session independently re-ran `tsc --noEmit` on both configs against the final tree (TypeScript 6.0.3, **exit 0 both**) and audited the full React 19 removed-API surface (`ReactDOM.render`, `findDOMNode`, `defaultProps`/`propTypes`, string refs, no-arg `useRef()`, callback-ref cleanup hazard) — zero hits. Coupled doc-truth correction (8 files, IPC count re-measured 123→**124**) shipped the same session — see ledger P-115. Operator smoke-test still recommended for stage 5 (Electron 43 dev launch + `pack:win`, static gates can't exercise the Chromium/Node runtime bump). Full record: `Vault/00-Audit/PROBLEM-LEDGER.md` P-115.

- **P-111: the simulator now streams 24/7 for every asset class, and a LIVE→PAPER switch does a full clean-slate restart.** Three coupled behavior changes on the data/mode-switch/app-lifecycle path (perimeter-adjacent, human-gated §0.3 — landed after operator sign-off). **(1) Simulator emits continuously.** `market-data.ts` drops the `isUsEquityMarketOpen` gate and the `shouldEmit`/`shouldEmitFor` per-asset-class pause: the synthetic feed is a *simulator*, so "moving data while markets are closed" is expected and correct here. Real-market-hours freezing is now solely the LIVE Alpaca feed's job (it naturally goes still off-hours; no synthetic movement is ever painted over real data because the simulator instance isn't alive in live mode). This reverses the 2026-05-17 off-hours freeze, which had applied to the simulator specifically. The `SATEX_SIMULATOR_24_7` escape hatch is therefore now **inert** (a harmless no-op; docs updated in CONSTITUTION §2.9, README, GETTING-STARTED, app CLAUDE.md perf section, and the perf-spec comment). **(2) Real crypto WS ignored in sim mode.** `onCryptoTick` early-returns unless `dataSource === 'live'`, so the real BTC/ETH WS no longer interleaves real prices over the simulated walk (it stays connected, engine-owned, reused the instant LIVE is selected). Consequence, recorded as intended: the crypto **sub-second aggregator is fed nothing while simulating** — the sim emits 20 Hz quote batches, not `'t'` trade ticks, so it could never coherently populate the SUB view anyway; showing an empty SUB is more honest than real microstructure mislabeled as sim. The load-bearing invariant ("fed only from `alpaca.onTick`") is structurally intact, now correctly qualified "and only while the live feed is selected" (app CLAUDE.md updated). **(3) `reconnectAlpaca` is a no-op in sim mode.** The manual "Reconnect Alpaca stream" action returns a clear message instead of tearing down the working simulator to spin up a live WS that can't stay up (the 30 s-backoff reconnect loop the operator hit); the internal endpoint-flip caller passes `{ internal: true }` and is exempt. **(4) LIVE→PAPER = confirm + full restart.** `TopBar.flipMode` now confirms the downgrade, then (after PAPER is persisted, `res.ok`) fires the new no-arg `APP_RESTART` IPC — `app.relaunch()`+`app.quit()` when packaged (true clean-slate: wipes in-memory tokens + unpersisted learning, replays the boot intro), `webContents.reload()` in dev. Safety: `APP_RESTART` carries no payload (`register()`, not `validated()`) and can only relaunch/reload — it cannot route an order; the confirm→persist→restart ordering leaves no half-armed state (a failed reconnect returns early with PAPER already persisted, the conservative side, and no restart; re-arming to LIVE still requires the typed-phrase `isLive()` interlock, which a restart wipes anyway). IPC count 123→124. Tests: `market-data.test.ts` rewritten to assert 24/7 emission for a market-closed (Saturday) and market-open (Tuesday) instant identically across all four asset classes + candle rolls, plus the `msSinceLastTick` conditional-assignment invariant; the now-dead market-hours-gate tests removed. Gates (2026-07-16, operator hardware, Node 24.15.0): typecheck node+web exit 0 · eslint `src tests` exit 0 (0 warnings) · vitest **1753 tests / 134 files / 0 fail** exit 0 · **knip exit 0** (ran natively on Node 24; the P-097 oxc crash is Node-22-specific). Blueprint: `docs/superpowers/specs/2026-07-16-sim-24-7-live-paper-restart-ultraplan.md`. Reconciles P-110 O1 (pile sign-off) + O2 (coupled doc-drift).

### Fixed

- **P-121: MAY-TACTICS graduation could arm on fabricated data, and lost its boot-time drawdown veto; replaced the count-of-8 bar with an evidence bar.** Three coupled fixes on the graduation interlock (perimeter, human-gated per AGENTS.md — landed behind operator sign-off). **(1) The `seedFromOrders` P0.** At boot it pushed `pnl:0` rows for every filled sell *additively onto* the already-persisted `tactics.json` history (`load()` restores, then seed re-pushed) — so it both double-counted and poisoned the graduation series with fabricated break-even trades. Deleted the method + its `trading-engine.ts` call-site; persisted `tactics.json` (via `recordOutcome`) is now the single source. A versioned store (`STORE_VERSION = 1`) resets any pre-version file once on load — the seeded `pnl:0` rows are indistinguishable from legitimate break-even closes (`recordTradeClose` writes `realizedPnl=0` when `entry===null`), so a surgical strip is impossible; the `graduated` flag is preserved across the reset. **(2) Boot-time drawdown-veto reconstruction.** `vetoActive` is not persisted and `refresh()` (which sets it from drawdown) was reached at boot *only* via `seedFromOrders`; deleting that call would have booted a drawn-down session with the veto cleared. Fixed by calling `this.refresh()` in the `TacticsEngine` constructor. **(3) The graduation bar.** `MIN_TRADES_FOR_ARMED` 8→30 (a real sample floor, not a naive count), and `graduate()` now requires `n≥30 ∧ expectancy>0 ∧ winRate≥0.45` — the record must already clear the armed gate's own floors over an adequate sample, all from the existing `metrics()`. Armed-state now gates on the persisted `graduated` flag *alone* (`status()` + `preTradeGate` decoupled from the live count) so raising the floor never silently disarms an already-graduated legacy user. New `TacticsStatus.graduationEligible` boolean (server-computed, single source) drives the GRADUATE button's enabled state; the modal shows the unmet clause. **PSR/regime deliberately NOT used** — the earlier PSR-gating draft was dropped after review found `significance.ts`'s own header and Constitution §3.3 forbid PSR outputs feeding any gate, and PSR's higher moments are noise at n=30; the constitution is untouched. Honest limitation: n=30 with a 0.45 win-rate floor is stricter than count-of-8 but not strong evidence (a zero-edge strategy clears it a meaningful fraction of the time) — the human click + paper-only policy are the backstops. First test coverage for `tactics.ts` (12 tests: migration, each graduation clause boundary, the graduate→gate invariant, boot-veto reconstruction, legacy-graduate-not-de-armed, null-safety). Gates (2026-07-20, operator hardware, Node 24.15): typecheck node+web exit 0 · eslint `src tests` exit 0 · knip exit 0 · vitest 1818 pass (the 38 `persistence.test.ts` fails are the known better-sqlite3 Electron-ABI local false-fail — **confirmed green in CI**). PR #63, CI Gates green. Blueprint: `docs/superpowers/specs/2026-07-20-tactics-graduation-significance-ultraplan.md`.
- **P-118: `indicatorStore.setRsiPeriod`/`setFibLookback` accepted non-finite input — `NaN` passed the equality guard and poisoned live renderer indicator state until restart.** `Math.max(2, Math.min(200, Math.round(NaN)))` is `NaN`, and `NaN !== cur.rsiPeriod` is always true, so the setter committed `rsiPeriod: NaN` and fired persist (reproduced pre-fix: 2/2 poison-repro tests in the /tmp harness). Disk was already safe — main-side `IndicatorSettingsService.clampInt` defaults non-finite before every write — but the renderer store is the renderer's local source of truth and the sanitized echo is discarded (fire-and-forget), so RSI/fib computation ran on `NaN` until the next launch silently "healed" it, masking the class (P-039/P-040 lineage). Latent, not live: both shipped call sites (`IndicatorsModal.tsx:119,130`) guard with `|| 14` / `|| 50` — but gates belong at the canonical source (invariant 3), not duplicated at call sites. Fix: `if (!Number.isFinite(n)) return` atop both setters, mirroring main-side `clampInt`; `±Infinity` (previously clamped to a bound) is now rejected outright, matching `clampInt`'s treatment of non-finite. Regression-pinned (3 tests in the P-117 suite). Off-perimeter (renderer UI store). Gates shared with P-117 below.
- **P-117: `indicatorStore.ts` (chart-indicator toggle store) shipped with zero test coverage.** Second pick in the renderer-store coverage vein P-116 opened (2026-07-19 handoff §7 top target). Added `src/renderer/stores/indicatorStore.test.ts` (30 characterization tests) pinning the full action surface: `setEnabled` runtime guards (unknown id + no-op-equal bail with no state write AND no persist IPC call), `toggleEmaPeriod` remove / add-sorted-ascending / no-no-op-case (a round-trip toggle restores state but persists twice) / fresh-array discipline, numeric clamps (`setRsiPeriod` [2,200], `setFibLookback` [5,1000], rounded, no-op when the clamp lands on the current value) plus the P-118 NaN/±Infinity regression pins, immutability (every change builds a fresh settings object; previous snapshots and `DEFAULT_INDICATOR_SETTINGS` are never mutated — the P-061/P-074 protected side, swept whole-surface against a `structuredClone` snapshot), `setSettings` wholesale-replace (renderer trusts input; main-side `sanitize()` is the wall before disk), `hydrate` (adopts the disk object by reference / undefined→defaults / reject→defaults+warn / absent-bridge optional-chaining pin — all four set `hydrated`), and the `flush`/`persist` fire-and-forget `.catch` walls (rejections warn, never throw into an action). Gates (2026-07-19, sandbox Node 22.22.3): vitest **30/30 ×2** (second run `--sequence.shuffle`) in a /tmp harness (zustand 5.0.14 + react 19.2.7 + vitest 4.1.10 + TS 6.0.3, subject md5-verified mount==harness) · scoped strict `tsc --noEmit` exit 0 (harness `Window` shim; CI full-graph arbiter) · scoped `eslint` on both touched files **exit 0, 0 warnings, in-mount** (fit inside the 45 s ceiling tonight, unlike P-116's run) · knip CI-arbitrated (P-097). Both files byte-verified (0 NUL / 0 CRCR / LF-only).
- **P-116: `marketStore.ts` (the renderer's central quote/candle store) shipped with zero test coverage.** `marketStore.ts` is where every quote and every candle the chart draws flows through (P3, operator legibility), and it carried three load-bearing guards with no regression pin: `MAX_CANDLES = 30_000` trim on both the `updateCandle` append and `bulkReplaceCandles` paths (the P-041/P-093 growth/spread class — `ChartPanel` spreads this very 30k array); `resetCandles` wiping candle history to empty on a live↔replay data-source swap (invariant 6); and `selectCandles` returning a single **frozen** `EMPTY_CANDLES` for every miss (the Zustand-v5 `useSyncExternalStore` stable-snapshot invariant — the *correctly-handled* member of the P-061/P-074 shared-default class, where a fresh `?? []` would infinite-loop the renderer). Added `src/renderer/stores/marketStore.test.ts` (19 characterization tests) pinning the full action surface (`setSymbol`, `seedQuotes` fresh-Map merge, `updateQuotes` shallow-merge + unknown-symbol insert + new-ref-per-call, `updateCandle` first-insert / in-flight replace / empty-`isNew=false` / **MAX_CANDLES ceiling** / new-ref, `bulkReplaceCandles` under-ceiling replace + **last-MAX_CANDLES trim**, `appendNews` newest-first + **MAX_NEWS cap**, `resetCandles` wipe) plus `selectCandles` (stored-array hit; **shared frozen empty on miss**, asserted via `.toBe` identity + `Object.isFrozen`). This completes the services→renderer coverage sweep for safe units — `live-mode.ts` + `tactics.ts` remain the only untested modules and both are human-gated perimeter. Subject `marketStore.ts` byte-unchanged; test-only, off-perimeter (renderer UI state). Blueprint: `docs/superpowers/specs/2026-07-19-marketstore-characterization-coverage-ultraplan.md`. Gates (2026-07-19, sandbox Node 22.22.3): full `tsc -p tsconfig.web.json --noEmit` in-mount exit 124 (45 s call ceiling, 2026-07-17 env scar) → CI is the full-typecheck arbiter · scoped strict `tsc --noEmit` over the new file + its `@shared` imports exit 0 · vitest **19/19 ×2**, order-independent, in a /tmp harness (zustand 5.0.14 + react 19.2.7 + vitest 4.1.10, matching repo; md5-verified byte-identical sources) · scoped `eslint` exceeded the 45 s startup ceiling (eslint 10.7 + typescript-eslint flat config) → CI is the lint arbiter · knip CI-arbitrated (P-097). `marketStore.ts` byte-unchanged; no `package-lock.json` mutation (harness is /tmp).

- **P-113: `upsertBrainParam` could never replace a global (symbol-less) Brain parameter — every `Brain.learn()` appended 8 fresh rows to the `brain` table, forever.** SQLite treats NULLs in a composite PRIMARY KEY as pairwise distinct, so the `INSERT OR REPLACE INTO brain (key, symbol, …)` upsert never matched an existing `(key, NULL)` row: each of the Brain's 7 feature weights + bias wrote a NEW row per learning event (unbounded growth, and the health snapshot's `brain.params` count at `trading-engine.ts:1637` inflated with it). `Brain.initialize()` (brain.ts:63) still restored the newest value — but only by accident of PK-index scan order (insertion order within a `(key, NULL)` group), an unspecified-behavior dependency. Fix in `persistence.ts`: global-param upserts now delete-then-insert atomically (`db.transaction` where the driver supports it, NullDB degrades to sequential no-ops); per-symbol upserts keep `INSERT OR REPLACE` (a real PK match applies). `migrate()` gains an idempotent one-time dedup that keeps the newest write per key (highest rowid — byte-identical to what `initialize()` effectively loaded, so restore semantics change zero while the growth and the fragility die); a clean DB deletes 0 rows. Also: the module's stale 5-table header comment now names all 13 real tables. Off-perimeter (learning persistence; risk limits untouched and still read-only to learning code, §3.6 invariant 4). Regression-pinned in `persistence.test.ts`: 3 global upserts ⇒ exactly 1 row with the newest value; legacy duplicates dedup to newest-per-key on reopen; null + per-symbol rows still coexist per key. Found during the P-094 persistence-coverage domain probe (2026-07-17 dawn session). Blueprint: `docs/superpowers/specs/2026-07-17-persistence-coverage-brain-null-upsert-ultraplan.md`. Gates (2026-07-17, sandbox Node 22.22.3): pre-edit full typecheck node+web exit 0 (in-mount baseline) · post-edit scoped typecheck over the changed-file graph exit 0 + eslint (repo-version stack 10.4.0/8.59.3) exit 0, 0 warnings — full in-mount tsc/eslint runs exceeded the 45s call ceiling this session (env regression vs 2026-07-16; CI is the full-run arbiter) · vitest `persistence.test.ts` 42/42, run twice order-independent, in a /tmp harness with a Linux better-sqlite3 11.10.0 against md5-verified byte-identical sources (the mount's native binary is Windows-built — §2.9; CI re-arbitrates natively) · knip CI-arbitrated (P-097). `package-lock.json` md5 unchanged (c6c32fa16eb9ac3701f8f14b706580c0).
- **P-094 (persistence.ts portion — final safe pick): the 13-table SQLite layer shipped with zero test coverage.** `persistence.ts` (992→~1,040 LOC with the P-113 fix) is the app's entire durable memory — sessions, order history, pnl, Brain/PatternLearner state, calibration log, replay tape + manifests, sub-second candles — and none of its contract was pinned. Added `src/main/services/persistence.test.ts` (42 characterization tests): schema truth (fresh DB ⇒ exactly 13 tables, WAL mode; re-migration idempotent incl. the `trace_id` ALTER, data survives reopen); sessions/orders/pnl round-trips (partial `updateSession` patches; `legacy-<id>` traceId synthesis for pre-A4 rows; session-scoped + global listings with order/limit contracts); the P-113 pins (above); calibration log (newest-N window replayed oldest→newest, boolean win mapping, prune-count idempotence); watchlist wholesale-replace; observations batch-transaction (rows-written return, empty-batch short-circuit, same-(ts,symbol) replace); pattern weights + learning-log replace-on-ts; replay tape (inclusive `readTapeRange` bounds + limit, `getTapeBounds` `{null,null,0}` empty shape, distinct sorted symbols, `listReplayableSessions` join with durationMs, manifest-first `deleteTapeForSession`); bookmarks CRUD + per-session wipe counts; tape-manifest null-when-absent; sub-second candles (idempotent bucket re-seal, ascending newest-`limit` reads, bucket isolation, `getAllSubSecondSeries`); retention (`pruneOldTicks` degenerate guards NaN/0/negative ⇒ 0 — P-039/P-040 class; age-window prune; `scheduleBackgroundMaintenance` end-to-end with chunked old-session prune while recent tape + session metadata survive); `closeDB` idempotence + lazy reopen + WAL-sidecar checkpoint; and the full NullDB fallback surface (reads ⇒ empty-shape defaults, writes no-throw, plus the loudly-pinned QUIRK that batch writers report `rows.length` even on the no-op store). Two more subject quirks pinned rather than silently "fixed": `trimSubSecondCandles` actually retains `keep+1` rows (the OFFSET cutoff row survives the strict `<`), and better-sqlite3 removes the `-wal` sidecar entirely on close. Harness: `vi.mock('electron')` + per-test temp dirs + `vi.resetModules()` dynamic import (module-singleton discipline per `self-eval-store.test.ts`), plus a `createRequire`-backed global-`require` shim so the subject's bare `require('better-sqlite3')` resolves under vitest's ESM transform — with a documented `SATEX_TEST_BETTER_SQLITE3` escape hatch for Linux sandboxes whose mounted binary is Windows-built (falls back to NullDB and fails loudly, never false-greens — P-097 law). Blueprint: `docs/superpowers/specs/2026-07-17-persistence-coverage-brain-null-upsert-ultraplan.md`. Gates: shared with the P-113 entry above (same changeset). **P-094's safe autonomous picks are now complete** — `live-mode.ts` + `tactics.ts` remain human-gated.

- **P-094 (depth-feed.ts portion): the L2 depth-ladder synthesizer shipped with zero test coverage.** `depth-feed.ts` feeds the DepthPanel's 9-level ladder (real bid/ask anchor, synthesized exponential-decay sizes) plus the VPIN proxy; none of its contract was pinned — a future edit could orphan the 4 Hz interval on stop() (the PR #6 timer-leak class), invert the get() caching semantics, or NaN the ladder on a missing quote with no failing gate. Added `src/main/services/depth-feed.test.ts` (18 tests) locking in the timer lifecycle (immediate emit + 250 ms cadence, idempotent start(), stop/restart with no orphaned interval, stop-before-start no-op), the listener contract (working unsubscribe; all listeners receive ONE shared snapshot object per tick — identity pinned so it can't be silently 'fixed' into clones), get()/subscribe() semantics (bare get() computes fresh and does NOT cache; get(other) routes via subscribe and serves the cached snapshot), 9-level ladder geometry at all three tick scales (0.01 / 0.05 mid>500 / 1.0 mid>10000) with cumulative `tot` and sizes in [20, 2400], degenerate-input pins (P-039/P-040 class: undefined quote → finite zero-anchored ladder with the 0.01 spread floor, never NaN; bid:0/ask:0 are NOT nullish so the ladder anchors at 0 and walks bids negative while mid falls back to last — a real quirk, now visible; undefined bid/ask → last ± 0.01 %), vpin bounded [0,1] with the ≤ 0.08 EMA step, and per-symbol jitter continuity. No module-reset harness needed — the subject is already a DI class; determinism via Math.random pinned to 0.5 (churn delta exactly 0) + fake timers. Test-only, off-perimeter (display-data synthesis; imports only `@shared/types` + the electron-free logger). Blueprint: `docs/superpowers/specs/2026-07-16-depth-feed-coverage-ultraplan.md`. Gates (2026-07-16, in-mount Node 22.22.3): typecheck node+web exit 0 · eslint scoped exit 0 · vitest `depth-feed.test.ts` 18/18 (run twice, order-independent) · knip CI-arbitrated (P-097). Subject `depth-feed.ts` byte-unchanged; `package-lock.json` md5 unchanged (c6c32fa16eb9ac3701f8f14b706580c0).
- **P-094 (alpaca-mode.ts portion): the Alpaca endpoint-mode store shipped with zero test coverage.** `alpaca-mode.ts` persists which Alpaca REST base URL (paper vs live) the engine targets (`<userData>/alpaca-mode.json`), defaulting to paper — explicitly NOT the live-capital arming interlock (the file's own header comment: the actual flip still requires `live-mode.ts`'s typed-phrase + notional-cap + kill-switch-disarmed check). None of its contract was pinned: a future edit could invert the default, break the override-precedence logic that caused a real production bug (2026-05-13T17:27, LIVE selected but REST stayed on paper-api.alpaca.markets), or let a write failure crash the caller. Added `src/main/services/alpaca-mode.test.ts` (15 tests) locking in default-paper on absent/corrupt/partial/unrecognized-mode state, stored `mode:'live'` honored + round-trips through `getAlpacaMode()`/`resolveBaseUrl()`, the full `resolveBaseUrl` override-precedence contract (canonical-URL override is NOT an override — persisted mode still wins; empty-string override also falls through; a non-canonical override wins outright), `setAlpacaMode` persisting JSON with a fresh numeric `updatedAt` and returning `{ok:true, baseUrl}` both directions, and the swallowed-write-failure guard. Harness mirrors `self-eval-store.test.ts`: `vi.mock('electron')` for `app.getPath` + real `fs` on a per-test temp dir, `vi.resetModules()` + dynamic import per case to re-run the module singleton. Test-only, off-perimeter (URL selection, not the arming path). Blueprint: `docs/superpowers/specs/2026-07-16-alpaca-mode-coverage-ultraplan.md`. Gates (2026-07-16, in-mount Node 22.22.3): typecheck node+web exit 0 · eslint scoped exit 0 · vitest `alpaca-mode.test.ts` 15/15 · knip CI-arbitrated (P-097). Subject `alpaca-mode.ts` byte-unchanged; `package-lock.json` md5 unchanged (c6c32fa16eb9ac3701f8f14b706580c0).
- **P-094 (self-eval-store portion): the self-eval toggle store shipped with zero test coverage.** `self-eval-store.ts` persists whether the nightly self-eval study runs (`<userData>/self-eval.json`), defaulting to ENABLED — the learning loop's heartbeat, where opting out must be the explicit action. None of that contract was pinned: a future edit could invert the default (muting the study), break the `enabled !== false` coercion, or let a write failure crash the caller. Added `src/main/services/self-eval-store.test.ts` (8 tests) locking in default-enabled on absent/corrupt/partial state, explicit `enabled:false` honored + round-trip, `setSelfEvalEnabled` persisting JSON with a fresh numeric `updatedAt`, and the swallowed-write-failure guard. Harness mirrors `auto-update.test.ts`: `vi.mock('electron')` for `app.getPath` + real `fs` on a per-test temp dir, `vi.resetModules()` + dynamic import per case to re-run the module singleton. Test-only, off-perimeter (self-eval is strictly observational, §3.6 invariant 3; sole consumer `trading-engine.ts:65` is a read-only getter/setter). Blueprint: `docs/superpowers/specs/2026-07-16-self-eval-store-coverage-ultraplan.md`. Gates (2026-07-16, in-mount Node 22.22.3): typecheck node+web exit 0 · eslint scoped exit 0 · vitest `self-eval-store.test.ts` 8/8 (run twice, order-independent) · knip CI-arbitrated (P-097). Subject `self-eval-store.ts` byte-unchanged; `package-lock.json` md5 unchanged.


- **P-105: v3.1 constitution verified true; stale ⌘ comment + unledgered P-102 closed.** A full re-measurement of `CONSTITUTION.md` v3.1.0 against the working tree confirmed every checkable claim (IPC 122, 13 tables, 24 stores, 21 panels, 7 modals, 3 themes, 9 rails, ⌘1-6, 126 test files, calibration 30/0.5, funded gates 9-13, flat `services/`+`core/`, stack majors, CI job name, zero functional `satex-trading` refs). Two doc-truth nits closed off-perimeter: `App.tsx:251`'s comment said "⌘1..⌘5" though `WS_DIGITS` maps all six (Intel = ⌘6) — corrected to ⌘1..⌘6 (comment only, no behavior change); and P-102 (the intro Quad fade-in, shipped to bundle 2026-07-13) had no `PROBLEM-LEDGER.md` entry — back-filled. Evidence: `Vault/00-Audit/2026-07-15-CONSTITUTION-V3.1-VERIFICATION.md`. Gates (2026-07-15, /tmp clone on p104 tip): typecheck node+web exit 0 · eslint scoped to `App.tsx` exit 0 · comment/markdown-only diff, full suite unchanged (CI arbiter) · knip CI-arbitrated (P-097).

- **P-103: canonical repo name + documentation-truth sweep — every functional reference now reads `satex25/SATEX-terminal` (exact capitals).** The electron-updater feed (`auto-update.ts`) pointed at the pre-2026-07 repo name; it worked only via GitHub's rename redirect, and the update feed is supply-chain-critical — a redirect must never be load-bearing there. Fixed the feed + its pinned assertion (`auto-update.test.ts`, still 14 tests), the README CI badge and Releases links, `docs/SECURITY.md`'s advisory link, and dropped the now-redundant rename parentheticals from `AGENTS.md`/`CONSTITUTION.md` (the rename history lives in ledger P-095). README front page repaired: Getting started / Contributing / Security policy / FAQ linked deleted root files and a nonexistent `docs 1/` folder since the 2026-07-02 reorg — all four now point at the real `docs/` locations. `ARCHITECTURE.md` refreshed to measured reality (last structural update was 2026-06-16): §2 no longer claims a 7-domain-folder `services/` split (the directory is flat + `services/alpaca/`, with pure logic in `core/`); IPC 103→122 channels; renderer 16→21 panels, 4→3 themes, workspaces ⌘1–5→⌘1–6 (Intel), +7 modals/22 stores/9 rails now stated; SQLite 12→13 tables; §1 `90-REFERENCE/`→`reference/`; §4 baseline 1268 tests/98 files (2026-06-27)→1668/126 (P-100 gate record, 2026-07-13) and pre-reorg `satex-app/` spec/cert paths corrected. Also fixed `scripts/update-baseline.sh` — the §4 refresh tool's `APP` var still pointed at the dead `00-PROJECT-ROOT/01-SATEX-CORE/satex-app` path, so the documented baseline-refresh loop could never have run post-reorg. Deliberately untouched: historical records (ledger P-095 text, the shipped P-091 entry above, dated release checklists/specs, `scripts/archive/`) — they document the old name as history; rewriting them would falsify gate records against the ledger's append-only law. Docs + off-perimeter release plumbing only; zero trading-path contact. Gates (2026-07-15, in-mount, sandbox Node 22): typecheck `tsc -p tsconfig.node.json` exit 0 + `tsc -p tsconfig.web.json` exit 0 · eslint scoped to both touched source files exit 0 (full-repo `eslint src tests` exceeds the 45s sandbox call ceiling — P-098 precedent; CI is the full-lint arbiter) · targeted vitest `auto-update.test.ts` 14/14 pass, exit 0 (required `@rollup/rollup-linux-x64-gnu --no-save` first — mount node_modules is a Windows install; `package-lock.json` md5 verified unchanged before/after) · knip not sandbox-runnable (P-097) — CI arbiter. All 10 edited files byte-verified 0 NUL / 0 CRCR in both the /tmp clone and the mount tree.

- **P-093: `ChartPanel.tsx` computed chart H/L stats with `Math.max(...spread)` / `Math.min(...spread)` over an array that can reach 30,000 elements.** `view` (the visible/aggregated candle series) is bounded only by `MAX_CANDLES = 30_000` (`marketStore.ts`), and spreading an array that large into `Math.max`/`Math.min` call arguments is the unbounded-growth/spread class this repo already tracks (P-041) — three sibling files (`vol-heatmap.ts`, `PortfolioMiniPanel.tsx`, `QuadPaneChart.tsx`) already avoid this exact pattern with an inline comment saying why; `ChartPanel.tsx` was the one spot still using it, two lines above a `vol` calc already done correctly via `.reduce()`. Replaced with a single-pass `for` loop computing `hi`/`lo`/`vol` together — identical `undefined`-when-empty semantics, zero behavior change. Latent, not a reproduced crash (30,000 is empirically under V8's current spread ceiling) — fixed before it becomes engine/version-dependent. Gates: typecheck exit 0 · lint exit 0 (0 warnings); no companion test exists for any panel component today (pre-existing gap, not introduced here) — covered instead by this session's full 122-file / 1598-test segmented run showing no regression. Also surveyed (not implemented) six main-process services with zero test coverage — see P-094; one of them (`live-mode.ts`) is the live-mode arming interlock itself and is flagged for human perimeter review, not an autonomous pick.

- **P-091: `auto-update.ts` (Electron auto-update service) shipped with zero test coverage.** The service encodes a real consent/safety policy — `autoDownload=false`, `autoInstallOnAppQuit=false`, `allowDowngrade=false` — plus a 24h `setInterval` whose only teardown is `shutdown()` (the PR #6 / P-041/P-043/P-046 timer-leak class). None of it was pinned, so a future edit could flip a consent flag or drop the interval clear with no failing gate. Added `src/main/services/auto-update.test.ts` (14 tests) — the repo's first `vi.mock('electron'/'electron-updater')` harness (file-scoped, no `setupFiles` change) — asserting the safety flags, the `satex25/satex-trading` feed URL, all four lifecycle handlers, the nullish-version coercion, the destroyed-window send guard, `quitAndInstall(false, true)`, and that `shutdown()` clears the interval (no further checks fire). Test-only, off-perimeter (release delivery, not the trading path). Blueprint: `docs/superpowers/specs/2026-07-09-auto-update-service-coverage-ultraplan.md`. Gates: typecheck node+web exit 0 · lint exit 0 (0 warnings) · targeted vitest `auto-update.test.ts` 14/14 · knip sandbox-blocked (oxc OOM, CI arbiter).

- **P-087: moved the Simulator/Live data-feed toggle out of the TopBar and into Settings.** The `FeedSwitch` chip previously sat beside the PAPER/LIVE real-capital toggle, reading as equally important — it isn't (one flips market-data source, the other flips capital endpoint). Relocated to a new "Market Data Feed" section in `SettingsModal.tsx` (`View → Settings…`), positioned next to "AI Advisor." Reuses the exact same `useDataSourceStore` hook and `data-source-guard.ts` interlock — no IPC or engine changes, UI relocation only. Watchlist SIM badges (`isSyntheticFeed`) remain the always-visible situational-awareness signal. Gates: typecheck node+web exit 0 · lint exit 0 (0 warnings) · targeted vitest `dataSourceStore.test.ts` 3/3.

- **P-084: stale ledger cross-reference in the PNG-export IPC hardening (`ipc-schemas.ts:361`, `export.ts:104`).** Both comments cited `P-083` as the ledger record for the `ChartPngExportReq` `data` field's move from `Array.from(Uint8Array)` to a raw `Uint8Array` (with a `byteLength <= 20_000_000` refine, replacing the old per-element `.int().min().max()` array check). `P-083` was independently assigned the same day to an unrelated entry (`market-observer.ts` coverage) — the PNG-export change had been sitting unstaged and *never actually ledgered* under its own number, so the in-code citation pointed at the wrong PSD record (a broken evidence trail per CONSTITUTION 0.1/0.10). Corrected both comments to cite `P-084` (this entry) instead of `P-083`. The underlying Uint8Array change itself was re-inspected and is functionally sound — the main-process handler (`src/main/index.ts:1081`, `Buffer.from(data)`) accepts either a `number[]` or a `Uint8Array` unchanged, and `ipc-schemas.test.ts` already covers the schema. Gates: typecheck node+web exit 0 · lint exit 0 (0 warnings) · targeted vitest `ipc-schemas.test.ts` 11/11.

- **P-081/P-083/P-084/P-087/P-088/P-089 ledger reconciliation.** These six entries (LLM max-tokens fix, market-observer + edgar coverage, PNG-export citation fix, FeedSwitch relocation, live-decision-path audit) were committed in `f331013` (2026-07-08) but their ledger `Status:` fields still read `SHIPPED (unstaged, ...)`. Re-ran all four gates directly against the committed tree this session — typecheck exit 0, lint exit 0 (0 warnings), segmented vitest 122 files / 1598 tests / 0 fail, knip sandbox-blocked (oxc OOM, CI arbiter) — confirmed no regression, and updated each entry's status to VERIFIED (committed). Also logged P-092: the ledger's `## In progress` / `## Shipped` / `## Closed` section headers have been unused since at least P-057 (all recent entries stack flat, newest-first) — left OPEN as an operator filing-convention ruling rather than freelancing a large six-entry relocation.

- **P-074: `funded-account-store.ts` aliased its shared empty-state arrays
  into every caller (the same class as P-061), plus an unbounded array-spread
  in `FundedAccountPanel.tsx`.** All three `{ ...EMPTY }` fallback returns
  (no file / corrupt JSON / read-throws) shared the SAME `ledger`/`dailyPnl`
  array references — latent today because both current consumers
  (`equity-hwm.ts`, `daily-pnl-ledger.ts`) already defensively copy before
  mutating, but the same fragile pattern this repo has now hit three times.
  Fixed with a `freshEmpty()` constructor that always returns new arrays, used
  at all three sites. Separately, `FundedAccountPanel.tsx`'s `Sparkline` used
  `Math.min(...values)`/`Math.max(...values)` — an unbounded spread (the
  P-041 class), safe only because the sole call site caps the ledger to 10
  entries; replaced with a bounded for-loop so the component is safe for any
  future caller regardless of ledger size. Regression-pinned with a new test
  asserting independent `load()` calls never share array references. Gates
  included in the P-073 run above; `funded-account-store.test.ts` 11→12 tests,
  `funded-account-integration.test.ts` unaffected (34/34).

- **P-080: `Vault/00-Audit/MAY TACTICS.md` carried a 310-byte trailing NUL-byte
  tail (file-bridge corruption, the P-021/P-078 class) on an otherwise
  byte-for-byte-unchanged file.** Found during the mandated NUL/CRCR audit
  sweep of every modified/untracked working-tree file (rule 5c). `git diff`
  against HEAD showed zero content differences once the NUL tail is excluded
  — `git show HEAD:<path>` was 37134 bytes with 0 NUL bytes; the working-tree
  copy was 37444 bytes (exactly +310 NUL). Recovered via `git show HEAD:<path>`
  restore through the Linux mount (P-078 workaround), re-verified 0 NUL / 0
  CRCR / byte-identical to HEAD. Not a code defect — Cowork file-bridge scar
  tissue on a Vault markdown file; off the trading-safety perimeter.

### Fixed

- **P-072: normal quit path had no hard-exit watchdog — a wedged async teardown
  could orphan the Electron process (and its Chromium GPU/renderer children) in
  Task Manager.** The crash path (`gracefulShutdown`, uncaught-exception /
  unhandled-rejection) already force-exits after 5s via `app.exit(1)`, but the
  normal `before-quit` handler (`src/main/index.ts`) did `engine.shutdown().finally(() => app.quit())`
  with no timeout. `engine.shutdown()` awaits `session.disconnect()`
  (`trading-engine.ts:853`); if a WebSocket `close` never fires its 'close' event
  the promise stays pending forever, the `.finally()` never runs, `app.quit()` is
  never called, and the process tree lingers after every window is closed. Fixed by
  adding a 5s `.unref()`'d watchdog in `before-quit` that calls `app.exit(0)` if the
  graceful path hasn't completed, and clearing it in the `.finally()` on the happy
  path — mirroring the crash-path net. No SATEX-spawned child processes exist
  (verified: no `child_process`/`spawn`/`fork`/`utilityProcess`/`worker_threads` in
  `src/`), so a guaranteed main-process exit is sufficient to leave a clean Task
  Manager on every close path. Off the trading-safety perimeter (process lifecycle,
  no order path). `src/main/index.ts` is the Electron entry (top-level side effects,
  not unit-tested), so verification is via the type/lint gates plus the reasoned
  teardown-hang argument. Gates: typecheck exit 0 · lint exit 0 (0 warnings) · vitest
  115 files / 1463 tests / 0 fail (segmented; single-pool sandbox stall is P-071,
  sandbox-only) · knip sandbox-OOM (CI arbiter).
- **P-061: `indicator-settings.ts` defaults-fallback paths aliased the shared
  `DEFAULT_INDICATOR_SETTINGS` module constant into the live cache.** The three "no
  file / no fence / read-error" fallback paths returned `{ ...DEFAULT_SETTINGS }` -- a
  shallow spread holding the SAME `enabled` object and `emaPeriods` array reference as the
  shared defaults constant, cached on top (`get()`), so any future in-main mutation of a
  defaults read could have silently corrupted process-lifetime defaults for every later
  caller. Latent (today's only consumer is IPC, structured-clone-shielded). Fixed by routing
  all three sites through the existing `sanitize({})` normalizer, which already builds fresh
  objects for every field -- one line changed per site, semantics unchanged. Regression-pinned:
  a new test drives all three fallback paths -- including forcing the actual `readFileSync`
  `catch` branch via an EISDIR (settings-path-as-directory) trick, never previously exercised
  -- and asserts no returned object aliases the shared constant, plus that mutating a returned
  object cannot corrupt it. Off the trading-safety perimeter (chart-toggle persistence routes
  no order). Gates: typecheck OK · lint OK (0 warnings) · vitest 116 files / 1464 tests / 0
  fail · knip OK (55 lines, no new).
- **P-055: Intel workspace `live` freshness dot froze green when the intel feed died.** The dot
  derives at render time (`lastUpdated` within 2x the poll interval), but a failing `getIntel` poll
  updated no state -- no re-render, so the last derivation (typically green) persisted indefinitely:
  stale shown as fresh (Constitution 3.2 "degrade loudly"), on the workspace whose whole job is honest
  signal display. Fixed by bumping a `useState` counter in the poll's failure path (success already
  re-renders via `setSnapshot`), so the dot re-derives and decays within one poll interval; the
  keep-last-snapshot transient-error contract is unchanged and the `cancelled` guard keeps the bump
  unmount-safe. Found auditing the unreviewed P-048 diff. Component-level test blocked on the standing
  `@testing-library/react` operator item. Off the trading-safety perimeter (renderer display). Gates:
  typecheck OK / lint OK (0 warnings) / vitest 113 files / 1419 tests / 0 fail / knip OK (no new
  warnings).
- **P-056: `IntelLayoutSetReq` accepted an unbounded placement array.** Every sibling wire contract
  bounds its collections (`quadSymbols` `.length(4)`) but the Intel layout channel's array had no cap,
  though a valid layout structurally holds at most one placement per module (ids are enum-validated,
  renderer reducers enforce uniqueness, the service dedupes by id). Bounded with
  `.max(INTEL_MODULE_IDS.length)` -- self-maintaining as modules are added. Plus the first co-located
  coverage for the 375-line `ipc-schemas.ts`: NEW `ipc-schemas.test.ts` (+8 tests -- the P-056 bound,
  `.strict()` extra-key rejection, integer/positive geometry, unknown-module-id rejection, and the
  P-048 `landingWorkspace` accept/reject pair). Off the trading-safety perimeter. Gates: typecheck OK /
  lint OK (0 warnings) / vitest 113 files / 1419 tests / 0 fail / knip OK (no new warnings).
- **P-049: `swing-points.ts` accepted degenerate `window`/`lookback` parameters (every-bar swings
  or TypeError).** `swingHighs`/`swingLows` ran their scan loops straight off the raw parameter:
  `window=0` vacuously marked every bar a swing high AND swing low (garbage double-top/bottom pairs
  plus O(n^2) pair churn downstream on the ChartPanel overlay path), while a negative or fractional
  window indexed off the array (`TypeError` reading `.high` of `undefined`); `averageVolume` crashed
  identically on a fractional `lookback`. Proven by `satex-agent-p049-repro.mjs` (OLD vs FIX; w=2/w=3
  parity byte-identical). Latent -- every in-repo call-site passes integer defaults >= 3 -- the P-040
  degenerate-parameter class on the layer's last unguarded file. Fixed by flooring both parameters
  and bailing at `window < 1` to the layer's insufficient-parameter convention (`[]`). +6 regression
  tests in `indicators.test.ts`. Off the trading-safety perimeter (chart display math). Gates:
  typecheck OK · lint OK (0 warnings) · vitest 106 files / 1374 tests / 0 fail · knip OK (no new
  warnings).
- **P-046: `SettingsModal` self-eval poll timers fired setState after unmount (PR #6 leak class).**
  `runSelfEvalNow` scheduled three untracked `setTimeout`s (1500/4000/8000 ms) that each call
  `refreshSelfEval` → `setSeStatus` (a setState + a `getSelfEvalStatus` IPC round-trip) to reveal the
  "Running… → result" transition. None were tracked or cleared, so closing the Settings dialog within
  ~8 s of pressing "Run Self-Eval Now" fired three setState-after-unmount calls plus three orphaned IPC
  reads into a closed modal. Fixed by holding the timer IDs in a `pollTimersRef` and clearing them in an
  unmount cleanup effect — mirrors the canonical `App.tsx` `armTimerRef` + `clearTimeout` pattern. Off
  the trading-safety perimeter (renderer presentation; routes no order). Gates: typecheck OK · lint OK
  (0 warnings) · vitest 100 files / 1287 tests / 0 fail · knip OK (no new warnings).
- **P-044: a render error in the Markets or Replay workspace blackscreened the whole terminal.** The
  center-column workspace content had no error boundary, so any panel render-throw unmounted the entire
  React tree (only the Quad workspace survived — it wraps each pane in `ErrorBoundary`). Wrapped the
  center column in a keyed `ErrorBoundary` (key = active workspace) with a fallback that shows the
  failing workspace + the real error message and keeps every other workspace and the kill-switch chord
  reachable. Off the trading-safety perimeter. Gates: typecheck OK · lint OK (0 warnings) · vitest 100
  files / 1287 tests / 0 fail · knip OK.
- **P-045: Quad panes rendered empty/"sloppy" when switching into the Quad view with data present.** The
  per-pane lightweight-charts series is created asynchronously, but the bulk `setData`/EMA/VWAP effects
  keyed only on candle count and gated on the series ref — so they fired before the series existed and
  never re-fired, leaving panes blank until the next bar ticked. Added a `ready` flag set on series
  creation and threaded it into those effect deps so existing data is applied the instant the chart is
  ready (no per-tick repaint cost). Off the trading-safety perimeter. Gates: typecheck OK · lint OK ·
  vitest 100 files / 1287 tests / 0 fail · knip OK.
- **P-043: `ChartPanel` leaked a `ResizeObserver` on every remount (PR #6 leak class).** The
  single-chart init effect created `const ro = new ResizeObserver(...)` inside its async IIFE, so the
  observer was local to that closure and the effect cleanup — which calls `chart.remove()` — never
  disconnected it. Every unmount/remount of the central Trade/Focus chart (workspace switch,
  symbol-change remount) orphaned a live observer that still referenced the container and whose callback
  closed over the disposed chart (calling `.resize()` on a removed chart on the next resize). Fixed by
  hoisting `ro` to an effect-scoped `let` and adding `ro?.disconnect()` in the cleanup before chart
  disposal — byte-identical to the already-fixed `QuadPaneChart` sibling. Off the trading-safety
  perimeter (renderer presentation; routes no order). Gates: typecheck OK · lint OK (0 warnings) ·
  vitest 100 files / 1287 tests / 0 fail · knip OK (no new warnings).
- **P-041: `PortfolioMiniPanel` spread an unbounded PnL-snapshot array into `Math.min`/`Math.max`.**
  The equity-curve sparkline computed `Math.min(...snapshots)` / `Math.max(...snapshots)` (and
  duplicated the same spread four times in the SVG baseline). `snapshots` comes from
  `getPnlSnapshots` → `listPnlSnapshots` (`SELECT * FROM pnl …`, **no LIMIT**), and PnL rows are
  written every 60s (`trading-engine.ts` `pnlTimer`) with no cap — so an always-on session crosses
  the V8 spread-argument limit (~65k–125k) in ~45 days and the panel throws `RangeError: Maximum
  call stack size exceeded`. Same class as P-027 (vol-heatmap) / QuadPaneChart. Fixed: a single-pass
  `seriesExtent` helper (`renderer/lib/extent.ts`) computes min/max in one loop; the panel routes
  both the polyline and the (now deduped) baseline through it — zero array spreads remain.
  Behaviour-identical for in-cap arrays. Off the trading-safety perimeter (renderer display; the
  other snapshot consumer, `risk-gates.ts`, already iterates with a `for` loop and is untouched).
  +1 test file / +5 tests (`renderer/lib/extent.test.ts`, incl. a 300k-element no-throw case). Gates:
  typecheck OK · lint OK (0 warnings) · vitest 100 files / 1287 tests / 0 fail · knip OK (Node-20 shim).
- **P-040: `indicator-graph.ts` `applyStdev` divided by `period` with no `period <= 0` guard.**
  The rolling-stdev transform kernel (CHART-18 node graph) computed `mean`/`variance` as
  `… / period`; a `StdevNode` with `period === 0` produced a NaN-filled series (`0/0`), and a
  negative period started the window loop at a negative index with a negative divisor (NaN/garbage).
  Every sibling in the chart-indicator layer guards its degenerate parameter (`brickSize <= 0`,
  `reversalAmt <= 0`, `window < 2`, `median <= 0`) — `applyStdev` was the gap. Latent (no preset
  builds a stdev node yet; `evalPipeline` is exported but unwired) and the period<=0 path was
  untested. Fixed: `if (period < 1) return result` (all-zeros, matching the layer's
  insufficient-data convention). Behaviour-identical for every period >= 1 (proven). Off the
  trading-safety perimeter (visual-only alert series; routes no orders). +3 regression tests in
  `chart-indicators/indicator-graph.test.ts` (period 0 / negative → zero series no NaN; valid period
  unaffected). Gates: typecheck OK lint OK (0 warnings) vitest 98 files / 1268 tests / 0 fail knip OK.
- **P-039: `vol-surface.ts` `logReturnStdev` skipped `prev <= 0` but not `curr <= 0` → NaN on**
  **negative-priced instruments.** The per-bar log-return guard was `if (!prev || !curr || prev <= 0)`
  — a negative `curr` with a positive `prev` (a crude-oil bar crossing through zero; CL §1.1,
  negative in Apr 2020) slipped through, and `Math.log(curr / prev)` of a negative ratio returned
  NaN, poisoning the whole realized-vol value (mean/variance → NaN). The negative-price class
  (P-034/P-035/P-038), here surfacing as a half-applied guard. Fixed: also skip `curr <= 0`, so the
  bar is excluded exactly like a non-positive `prev`. Behaviour-identical for every positive price
  (proven OLD≡FIX); negative/zero closes are now skipped instead of yielding NaN. Off the
  trading-safety perimeter (advisory realized-vol surface; routes no orders). +2 regression tests in
  `chart-indicators/vol-surface.test.ts` (zero-crossing crude → finite non-negative; isolated
  negative close → no NaN). Gates: typecheck OK lint OK (0 warnings) vitest 98 files / 1268 tests /
  0 fail knip OK (Node-20 shim).
- **P-038: `chart-types.ts` Kagi `reversalPct` threshold multiplied a signed price.**
  `kagiTransform`'s reversal magnitude was `revAmt = lineStart * reversalPct` (and the default
  `lineStart * 0.01`). For a negative-priced instrument `lineStart < 0` makes `revAmt` negative, so
  the up-line reversal test `close <= extreme - revAmt` becomes `close <= extreme + |revAmt|` — true
  for almost every non-extreme candle, collapsing the Kagi into a spurious reversal on each bar (the
  P-034 / P-035 negative-price class, here on a *multiplicative* threshold). SATEX's universe
  includes CL crude (negative in Apr 2020 — in-domain). Latent today (`kagiTransform` is exported
  from the chart-indicators barrel but has no call-site yet) and the `reversalPct` path had no test
  coverage (only `reversalAmt`, which is guarded `> 0`). Fixed: `Math.abs(lineStart)` on both the
  percentage and default branches. Behaviour-identical for every positive price (`|x| = x` for
  `x > 0`; full existing suite unchanged). Off the trading-safety perimeter (advisory alt-chart
  display; routes no orders). +4 regression tests in `chart-indicators/chart-types.test.ts`
  (first-ever `reversalPct` coverage; OLD 3 spurious reversals vs FIX 1 on a negative series, proven
  empirically; positive mirror byte-identical). Gates: typecheck OK lint OK (0 warnings) vitest
  98 files / 1263 tests / 0 fail knip OK (Node-20 shim).
- **P-035: `patterns.ts` H&S / Inverse-H&S / Flag detectors divided by signed raw prices.**
  The CHART-19 detectors (`detectHeadShoulders`, `detectInverseHeadShoulders`, `detectFlags`) carried
  the same defect class as P-034 in several spots: the shoulder-symmetry gate divided by raw `ls.price`
  (negative anchor → negative `sym` → `sym > tol` always false → the symmetry filter never rejected);
  the H&S prominence / Inv-H&S depth confidence terms divided by raw `hd.price` / `min(ls,rs)`
  (sign-flipped, yielding negative confidence); and the flag `poleMove` divided by the raw pole-base
  close, so on a negative-priced instrument the bull-vs-bear *direction* inverted (a true rise was
  tagged bearish and dropped by the slope check). SATEX's universe includes CL crude (negative in
  Apr 2020 — in-domain). Latent today (detectors are exported from the barrel but not yet wired to a
  consumer; the live double-top/bottom siblings were P-034), it would mis-render the moment CHART-19
  patterns are wired to the overlay. Fixed: all price denominators use `Math.abs(...)` with a
  zero-anchor skip on the symmetry/pole bases; `Math.abs(poleBase)` restores the true move sign so
  bull/bear is correct. Behaviour-identical for every positive price (full existing suite unchanged).
  Off the trading-safety perimeter (advisory display; patterns route no orders). +5 regression tests
  in `chart-indicators/patterns.test.ts` (OLD-vs-FIX divergence proven empirically). Gates: typecheck
  OK lint OK (0 warnings) vitest 96 files / 1219 tests / 0 fail knip OK (Node-20 shim).
- **P-034: `double-top.ts` / `double-bottom.ts` symmetry gate divided by a signed anchor price.**
  `detectDoubleTops` / `detectDoubleBottoms` computed `symmetry = |b.price - a.price| / a.price` and
  gated on `symmetry > tolerance`. For a negative-priced instrument the raw denominator made
  `symmetry` negative, so the filter *never* rejected — any two peaks/troughs registered as a pattern
  and the reported `symmetry` (documented as a positive fraction) came out negative. SATEX's universe
  includes CL crude, which printed negative in Apr 2020, and both detectors are live in
  `ChartPanel.tsx` (the pattern overlay). Fixed: denominator is now `Math.abs(a.price)` with an
  explicit zero-anchor skip. Behaviour-identical for every positive price (full existing suite
  unchanged); negative/zero anchors now compare by true relative distance. Off the trading-safety
  perimeter (advisory display; patterns route no orders). +4 regression tests in
  `chart-indicators/indicators.test.ts`. Gates: typecheck OK lint OK (0 warnings) vitest 96 files /
  1214 tests / 0 fail knip OK (Node-20 shim).
- **P-030: `vol-heatmap.ts` dead `intervals` array removed from `tickVelocitySeries`.**
  The function built and pushed to a per-candle `intervals: number[]` that nothing ever read - the
  rolling-velocity loop reads `candles[].time` directly. Gate-invisible (ESLint/tsc count `.push()`
  as a use), it wasted an O(n) allocation + loop on the same unbounded sub-second crypto hot path
  P-027 just hardened (~3.5e5 bars/day). Removed; `tickVelocitySeries` output is byte-for-byte
  unchanged (its P-027 tests stay green, 24/24). Off the trading-safety perimeter (pure display
  math). Gates: typecheck OK lint OK (0 warnings) vitest 96 files / 1210 tests / 0 fail knip OK
  (Node-20 shim).

- **P-027: `vol-heatmap.ts` `Math.max(...spread)` stack-overflow fix.** `computeHeatmap`
  normalized via `Math.max(1e-10, ...atr)` / `...stdev`, spreading the unbounded per-candle arrays
  as call args — a latent `RangeError: Maximum call stack size exceeded` once fed SATEX's sub-second
  crypto buffer (~3.5e5 candles/day; the spread throws past ~1.3e5 args in V8). Replaced both with a
  single-pass max loop (floor 1e-10 preserved), matching the existing `QuadPaneChart.tsx` invariant.
  Off the trading-safety perimeter (pure display math; no call-site yet — preventive). New regression
  + coverage tests pin `computeHeatmap` (300k no-throw), `tickVelocitySeries`, `vpinToIntensity`.
  Gates: typecheck OK lint OK (0 warnings) vitest 95 files / 1195 tests / 0 fail knip OK (Node-20 shim).

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

- **P-088: coverage for the untested `edgar.ts` (SEC EDGAR catalysts poller).**
  New-file-only Vitest suite (25 tests) for `EdgarService` — the 5-minute
  poller that turns SEC filings into Catalysts-panel `NewsItem`s. Pins the
  `start()`/`stop()` timer lifecycle (idempotent double-start, safe
  double-stop, the ~10s initial-poll delay), the 24h `ensureCikMap` ticker-map
  cache + re-fetch-after-expiry, ticker-case uppercasing, the `TRACKED_FORMS`
  filter, the 7-day lookback cutoff + NaN-date guard, per-form `kind`/
  `sentiment` mapping in `emit()`, the 20-filings-per-symbol cap in
  `fetchSubmissions`, the 404-is-quiet vs. non-404-throws-but-`poll()`-
  swallows distinction, and — the headline bounded-growth pin (the PR#6/
  P-041/P-043/P-046 class) — the `seen` accession-number set halving once it
  exceeds 5000 entries, verified black-box by resending an old (evicted) and
  a recent (retained) accession number after crossing the threshold. Source
  byte-for-byte unchanged. Gates: typecheck node+web exit 0 · lint exit 0 (0
  warnings) · targeted vitest 25/25 · 3-file services segment (edgar +
  market-observer + llm) 63/63, no cross-file mock leakage. knip not run
  (sandbox oxc-parser 2 GB OOM, §2.9 ceiling — new test exports nothing,
  knip-neutral; CI is arbiter).

- **P-083: coverage for the untested `market-observer.ts` (continuous intel
  recorder).** New-file-only Vitest suite (28 tests) for `MarketObserver` —
  the dense, always-on quote recorder that feeds PatternLearner + VaultWriter
  and is intentionally separate from the Brain (it learns nothing). Pins the
  lifecycle + flush-timer cleanup (the PR#6/P-041/P-043/P-046 leak class), the
  bounded per-symbol ring buffer (`RING_PER_SYMBOL` cap), the rolling
  per-minute window trim, the `≥21`-candle and computeSnapshot-throw
  null-guards, the degenerate `last<=0` spread guard, the `MAX_BUFFER`
  auto-flush, the intentional flush error-swallow ("dropping batch"), and all
  five `classifyRegime` branches. `./persistence` + `@shared/indicators`
  mocked; fake timers drive the flush/window paths. Source byte-for-byte
  unchanged. Gates: typecheck node+web exit 0 · lint exit 0 (0 warnings) ·
  targeted vitest 28/28 · 4-file services segment 49/49. Surfaced a pinned
  finding (see ledger P-083): `getRecent` is not reordered post-ring-wrap, so
  its "newest last" contract holds only pre-wrap — documented, not changed.

- **P-076 / P-077: coverage for two untested main-process services.**
  New-file-only Vitest suites for `live-candle-buffer.ts` (13 tests — OHLC
  aggregation, negative-volume clamp, the `MAX_CANDLES_PER_SYMBOL`
  bounded-growth cap, the intra-bar coalesced flush, the bucket-roll
  fill-forward, and the `onCandle` unsubscribe/listener-leak contract) and
  `system-logs.ts` (9 tests — ingest to tail mapping, the `BUFFER_SIZE = 60`
  ring-buffer cap, EVENT/level classification, and the `onTail`
  unsubscribe/listener-leak contract). Both service sources byte-for-byte
  unchanged. Gates: typecheck 0, lint 0, +2 files / +22 tests, all green.

- **P-073: Intel-workspace ultraplan Phase D — every side-rail panel
  (Watchlist, Depth, Regime, Exec, News, Risk, Logs, Health) now fully
  collapses**, matching the `FundedAccountPanel.tsx` collapse interaction but
  standardized and — unlike that panel's "shorter card" — actually shrinking
  the wrapping grid track to a thin re-open handle so the freed space returns
  to the center charts / a sibling panel, never a dead gutter. New headless
  `renderer/lib/rail-layout.ts` (`computeRailTemplate`, 13 tests) computes
  each stack's CSS track sizes, promoting the last non-collapsed track to the
  flex sink only when the stack's one naturally-flexible track was the one
  collapsed. New presentational `renderer/components/RailSlot.tsx` wraps all
  8 panels from `App.tsx` with zero changes to any panel's own source. State
  is a new additive `WorkspaceState.collapsedRails: RailId[]` field (no
  version bump, tolerant hydrate, persisted through the existing
  `workspace-state.md` service and IPC channel). Off the trading-safety
  perimeter throughout (view state only, routes no order). Gates: typecheck
  exit 0 · lint exit 0 (0 warnings) · vitest 117 files / 1488 tests / 0 fail ·
  knip exit 0 (55 lines, byte-identical to baseline).

- **P-079: coverage for `env.ts` (85 LOC, the process.env validation/access
  module every service reads through).** New-file-only Vitest suite (21
  tests) via a `vi.resetModules()` + save/restore-`process.env` harness per
  test (the module holds a top-level `_env` memoization cache, so each
  scenario needs a fresh module instance). Covers all field defaults,
  `SATEX_USE_SIMULATOR` case-insensitive parsing, `ALPACA_FEED` fallback to
  `iex` on an unrecognized value, numeric overrides
  (`SATEX_RNG_SEED`/`SATEX_DAILY_LOSS_LIMIT_PCT`/`SATEX_MAX_OPEN_POSITIONS`),
  `loadEnv()`/`getEnv()` memoization (a second call after `process.env`
  mutates still returns the first snapshot), and pins today's real — not
  ideal — behavior of a malformed `SATEX_RNG_SEED` (`parseInt` → `NaN`,
  un-null-guarded for the present-but-invalid case; only the *absent* case
  falls back to `null`). Source byte-for-byte unchanged. Off the
  trading-safety perimeter. Gates: typecheck exit 0 · lint exit 0 (0
  warnings) · `env.test.ts` 21/21 pass.

### Added

- **P-060: `indicator-settings` service test suite (16 tests).** The last uncovered
  JSON-in-markdown Vault settings service — and the richest sanitizer of the family. New
  co-located `indicator-settings.test.ts` pins defaults + no-side-effect `get()`,
  fresh-instance round-trip, the documented cache + `reload()` manual-edit contracts,
  enabled-map filtering (unknown ids, non-booleans), `EMA_PERIODS` membership + fresh-copy
  default fallback, rsiPeriod/fibLookback clamp+round tables, `legendVisible`
  backward-compat, version pinning, corruption recovery (no fence / bad JSON → defaults),
  and sanitize-BEFORE-write against the raw Vault markdown. Real-tmpdir harness
  (subsecond-prefs convention); service source byte-for-byte unchanged. Settings-file
  family now fully covered. See ledger P-060 (+ P-061 for a latent defaults-aliasing
  find, source untouched).

- **P-059: service-layer persistence tests for `intel-layout` + `workspace-state` (28 tests).** The
  two JSON-in-markdown Vault settings services on the boot path had zero co-located coverage. New
  `intel-layout.test.ts` (14) pins read-only `get()`, fresh-instance round-trip, the documented
  in-instance cache, `sanitizeShape` (unknown/duplicate ids, non-objects, non-finite geometry,
  non-array fence), corruption recovery (no fence / bad JSON -> `[]`), and sanitize-before-write
  proven against the raw file. New `workspace-state.test.ts` (14) pins defaults + no-side-effect
  `get()` + the defensive quad copy, full round-trip, quad normalize/dedupe/pad-to-4/trim,
  chartSymbol fallback, the P-048 additive `landingWorkspace` tolerant hydrate (missing/invalid/
  valid), version normalization, and corruption recovery. New-file-only — both service sources
  byte-for-byte unchanged; real-tmpdir harness per the `subsecond-prefs.test.ts` convention. Gates:
  typecheck OK / lint OK (0 warnings) / vitest 115 files / 1447 tests / 0 fail (+2 files / +28
  tests) / knip OK (byte-identical output).

- **P-052/P-053/P-054: renderer store-coverage sweep -- six untested Zustand stores pinned (+37
  tests, zero source change).** Continues P-050/P-051 down the 2026-07-01 handoff's leverage order.
  NEW `intelStore.test.ts` (7: uppercase + case-insensitive no-op symbol lifecycle, the
  stale-snapshot-clearing invariant, `lastUpdated` stamping) and `intelLayoutStore.test.ts` (16:
  hydrate sanitize/adopt, non-array + sanitize-to-empty + bridge-reject + missing-bridge fallbacks,
  reducer-mediated add/remove/move/resize incl. reject-if-overlap through the store surface,
  write-through persist + fire-and-forget failure warn, fresh-copy reset, edit-mode) pin the P-048
  flagship Intel stores; `replayStore.test.ts` (5: the `active` derivation App.tsx branches the
  center column on); `riskGatesStore` / `wireStore` / `macroStore` `.test.ts` (3 each: push-mirror
  display contracts only -- risk-gate enforcement lives in `services/risk/` and is untouched). All
  new-file-only per the `dataSourceStore.test.ts` convention. Gate checkpoint: typecheck OK / lint OK
  (0 warnings) / vitest 112 files / 1411 tests / 0 fail / knip OK (no new warnings).
- **P-050 / P-051: the two highest-value untested renderer Zustand stores pinned (28 tests, zero
  source change).** New `workspaceStore.test.ts` (16) -- tab validation against `WORKSPACE_TABS`
  (incl. the P-048 `Intel` tab), the Quad-pane uniqueness-swap invariant, uppercase normalization,
  no-op short-circuits (no redundant persist), the additive `landingWorkspace` field, and hydrate's
  defaults-on-empty/failing-IPC behavior. New `subsecondStore.test.ts` (12) -- the 1200-bar
  hydration cap, `appendBar` append / same-openMs re-seal / out-of-order drop / head-trim branches,
  per-(symbol,bucketMs) series isolation, the `hydratePrefs` {250|500} sanitizer, and `getPref`'s
  null-when-unconfigured contract. Both store sources byte-for-byte unchanged. Gates: same run as
  P-049 (106 files / 1374 tests / 0 fail).
- **P-048 (Phase C): the Intel workspace now renders live read-only analytics.** Eight modules fuse
  the existing intelligence layer for the selected symbol — a calibration **reliability diagram**
  (Brier + reliability buckets), brain **feature attribution** (per-feature weight×feature
  contribution to the decision score), the **regime** HMM posterior + metrics, brain **weight drift**
  from session-start priors, a cross-asset **correlation** heatmap, **microstructure** (VPIN +
  order-book imbalance + a mini depth ladder), upcoming **macro** catalysts, and a forward-looking
  **scenario / convergence** read (Bull/Bear/Neutral probabilities + the ≥3-layer convergence tally,
  Constitution §4.2/4.3). A research-mode symbol selector analyzes any symbol independent of the
  chart; the workspace polls a single read-only `INTEL_GET` snapshot (leak-safe, 2.5s) that routes no
  order. Every module renders `UNKNOWN — SIGNAL INSUFFICIENT` rather than fabricating a value when its
  signal is absent (Constitution 0.1). New pure math (`@shared/intel-analytics`) + the fusion service
  are unit-tested. Off the trading-safety perimeter (read-only). Gates: typecheck OK · lint OK (0
  warnings) · vitest 104 files / 1337 tests / 0 fail · knip OK (no new warnings).
- **P-048 (Phase A+B): composable Quant Intelligence workspace (⌘6) + configurable startup landing.**
  New flagship `Intel` workspace — the only user-composable surface in SATEX. An **Edit Modules** mode
  lets the operator add, remove, drag-rearrange, and resize analytics modules on a 12-column grid
  (the iPhone-jiggle / desktop-window metaphor), scoped to this tab only; the layout persists to its
  OWN `Vault/Settings/intel-layout.md` and survives a reload, with a curated default layout + a Reset
  escape hatch. A new **Startup page** setting (Settings → Display) opens the operator's chosen
  workspace after the intro and persists. The grid engine is **zero-dependency**: a pure
  `grid-layout` reducer (reject-if-overlap, per-module min sizes, on-load sanitizer; 15 unit tests)
  plus a leak-safe pointer-drag hook whose window listeners are removed on pointerup AND unmount
  (the PR #6 teardown invariant). Modules render the Constitution-0.1 `UNKNOWN — SIGNAL INSUFFICIENT`
  placeholder until the read-only analytics IPC lands (Phase C). Off the trading-safety perimeter
  (read-only; routes no order). Blueprint:
  `docs/superpowers/specs/2026-06-29-intel-workspace-composable-grid-ultraplan.md`. Gates: typecheck
  OK · lint OK (0 warnings) · vitest 102 files / 1314 tests / 0 fail · knip OK (no new warnings).
- **P-047: regression coverage for `computeJournalAggregates` (trading-journal stats).** New
  `src/renderer/stores/journalStore.test.ts` (12 tests) pins the pure display-aggregation function
  behind the journal panel — win/loss accounting (breakevens excluded from the win-rate denominator,
  no NaN on an all-breakeven ring), conviction buckets (high ≥7 / low ≤4), mean entry slippage (finite-
  only average, null when none captured), the per-regime P&L breakdown (null regime → `UNKNOWN`, sorted
  by total P&L desc, breakeven-excluded per-regime win rate), and best/worst tag selection (per-tag P&L
  accumulation across multi-tag trades, worst suppressed when only one distinct tag). The store had zero
  co-located coverage; `journalStore.ts` is unchanged (new file only — lowest bridge risk, the P-042
  zero-coverage-close pattern). Found via the work-layer code-audit coverage-gap sweep. Off the
  trading-safety perimeter. Gates: typecheck OK · lint OK (0 warnings) · vitest 101 files / 1299 tests /
  0 fail · knip OK (no new warnings).
- **P-042: WebGLRenderer (CHART-10) leak-invariant test coverage.** New
  `src/renderer/chart/webgl/WebGLRenderer.test.ts` (14 tests) pins the PR #6 "clean up what you create"
  invariant on the previously-untested WebGL2 overlay base — the file every density-overlay layer
  (footprint / volume-profile / vol-heatmap) composes. Drives the real class under jsdom with a stubbed
  WebGL2 context + controlled `requestAnimationFrame`: construction (canvas attach, absolute/zIndex/
  pointer-events, rAF start), the frame loop (paint dims + reschedule, paint-error swallowing, no-gl
  skip), `invalidate` (sync frame / no-op after destroy), context loss→restore (preventDefault, stop,
  re-acquire + `onContextRestored`, resume), and the **destroy teardown** (canvas detached, loop
  cancelled, `WEBGL_lose_context.loseContext()` called, listeners removed so post-destroy events are
  inert, idempotent second destroy, destroy-guarded stale tick). `WebGLRenderer.ts` is byte-for-byte
  unchanged — a pure regression net against re-introducing the listener/timer/observer leak class.
  Off the trading-safety perimeter (renderer presentation; routes no order). Gates: typecheck OK · lint
  OK (0 warnings) · vitest 100 files / 1287 tests / 0 fail · knip OK (Node-20 shim; no new warnings).
- **Cold-boot intro splash — film-style `SATEX` name reveal.** New `src/renderer/components/SplashIntro.tsx`: a fullscreen plate shown once per launch that resolves the `SATEX` wordmark letter-by-letter (blur-in + a single film flicker) out of a scanline sweep, draws an accent rule, then dissolves (~3.2s, within the 2–5s brief) to reveal the terminal. No logo — wordmark only. Pure CSS animation (CSP `script-src 'self'`-safe), auto-themes off the `--bb-accent` / `--font-mono` tokens across all 4 themes, honors `prefers-reduced-motion` (fast glitch-free fade), and skips on click or any key. Mounted as the first child of `bb-app` behind a `splashDone` flag in `App.tsx`; styles appended to `globals.css` (`.satex-splash*` + keyframes). Self-cleans its timers; fires `onComplete` exactly once. Off the trading-safety perimeter (presentation only). Gates: typecheck OK lint OK (0 warnings) vitest 98 files / 1268 tests / 0 fail knip OK.
 The pure
  P-036 `diagnoseHealth` core is now live: every status tick (~2s) the engine builds a `HealthSignals`
  snapshot from real state and emits a graded `HealthReport`, diff-gated so it fires only when the
  severity or findings-set changes (same change-only pattern as the feed-status broadcast). New pure
  adapter `src/shared/health/health-signals.ts` (`computeMemGrowthPctPerHr` from a bounded heap-sample
  ring, `computeDrawdownPct` from peak-vs-current equity, `composeHealthSignals`) keeps the engine edit
  a thin call-site. `TradingEngine.getHealthReport()` gathers state → composes → diagnoses;
  `healthCheck()` is upgraded additively (keeps `ok`/`uptime`/`mode`, adds `report`, and `ok` now
  reflects `severity !== 'critical'` instead of a hardcoded `true`). New `HEALTH_REPORT` push channel +
  preload `onHealthReport` bridge + Zustand `healthStore` + `useIPC` subscription (with teardown). New
  dedicated `HealthPanel.tsx` in the secondary row renders the severity badge (green/amber/red), the
  recommended next action, and each finding's summary + evidence + remediation + §ref. **Diagnosis
  only** — off the trading-safety perimeter: the engine diff is read-only state-gather + one emit
  (verified: the sole `this.om` call added is `getAccount()`), the remediation strings are advisory and
  wire to no actuator. Signals wired this round: session state, silent feed-stall, WS-down duration,
  drawdown, heap-growth trend; `errorRatePct`/`lastError` ship as `null` (the core no-findings a null
  signal — Constitution 0.1) pending a Tier-C follow-up. +13 tests (`health-signals.test.ts` boundary
  cases + compose→diagnose seam). Built from the `/ultraplan` blueprint
  `docs/superpowers/specs/2026-06-27-health-core-wiring-p037-ultraplan.md`. Gates: typecheck OK lint OK
  (0 warnings) vitest 98 files / 1259 tests / 0 fail knip OK (Node-20 shim; zero new warnings).
- **P-036: Self-Diagnostic Core — the keystone of the self-healing terminal.** New pure module
  `src/shared/health/` (`types.ts` + `diagnose.ts` + `diagnose.test.ts`) that fuses the raw health
  signals every service already emits (`SystemStatus`, the broker `SessionState` machine, tick
  staleness, WS-down duration, heap-growth trend, error rate, drawdown) into one graded
  `HealthReport` (`healthy | degraded | critical`) — each finding carrying the *kink*, the evidence
  trail, and the **Constitution-mandated remediation**. It encodes §9.3 (Observability thresholds)
  and §11 (Failure Modes & Recovery) — today prose — as executable, test-pinned classification,
  replacing the `TradingEngine.healthCheck()` stub that hardcodes `ok: true` and never diagnoses.
  `diagnoseHealth` is a pure deterministic function (no clock reads — every time-derived signal is
  passed in), **off the trading-safety perimeter** (classifies and *recommends* only; imports nothing
  from engine/OrderManager/risk-gates and can place no order), and **mode-aware** so it never cries
  wolf — `simulator`/`replay` suppress the live-broker feed/WS/session findings (no broker WS to be
  "down"). This is the diagnosis substrate a future (separately sign-off-gated) auto-heal loop and the
  renderer health pill read from. 28 tests pin every threshold boundary, mode-gating, worst-wins
  fusion, deterministic ordering, idempotence, and a mode x session-state totality sweep. Pure;
  new-files-only (no existing-code edit). Gates: typecheck OK lint OK (0 warnings) vitest 97 files /
  1247 tests / 0 fail knip OK (Node-20 shim; zero new warnings).
- **P-031 / P-032 / P-033: chart-indicator + regime test coverage (2026-06-26 work-layer).**
  Pinned three previously-untested exported surfaces, new tests only (zero source edits -> no
  behavior change): `computeVolSurfaceHistory` (vol-surface.test.ts, +4 - warm-up skip, slice
  count = len-100, one point per `VOL_LOOKBACKS`, chronological `asOf` alignment); `emaCrossPipeline`
  (indicator-graph.test.ts, +3 - node-array shape, unused-`_slow`-arg invariance, `evalPipeline`
  length/label); and the HMM `RegimeService` (new `regime.test.ts`, +8 - first coverage of a
  live-decision-path classifier: posterior is a valid 4-state distribution, VPIN / spread drive
  liquidity, listener lifecycle, absent-quote NaN-safety). Gates: typecheck OK lint OK (0 warnings)
  vitest 96 files / 1210 tests / 0 fail knip OK (Node-20 shim).

- **P-026: core `indicators.ts` math test coverage (2026-06-25).** The pure,
  stateless indicator functions feeding every `IndicatorSnapshot` — Brain
  decision features, the regime service's ATR input, and the chart read-outs —
  had zero direct coverage despite sitting on the live-decision *input* path.
  Added `src/shared/indicators.test.ts` (14 tests) pinning the exported surface
  (`rsi`, `atr`, `computeSnapshot`) and, through `computeSnapshot`, the internal
  ema/sma/vwap/trendStrength/rollingVolatility helpers: insufficient-data guards
  (RSI→50, ATR→0), the deliberate flat-window RSI→100 quirk, a hand-computed
  two-bar snapshot (vwap 17.5 / ema9 12 / atr 10 / volatility 33.33…), the
  trendStrength [0,1] clamp + saturation (incl. the un-clamped path), and the
  vwap zero-volume guard. No source change; off the trading-safety perimeter.
  Gates (full working tree, /tmp sandbox @ e158e48 + file): typecheck✅ lint✅
  (0 warnings) test✅ (95 files / 1189 tests) knip✅ (EXIT 0).

- **P-025: `color.ts` (`applyOpacity`) test coverage (2026-06-24).** First tests for the
  shared hex→rgba chart-overlay helper: 6-digit hex, 3-digit shorthand expansion
  (#abc→#aabbcc), case-insensitivity, non-hex pass-through (rgba / named / CSS-var / empty),
  and two-decimal alpha formatting incl. rounding. New `src/renderer/lib/color.test.ts`
  (10 cases); no source change. Off the trading-safety perimeter. Gates (full working tree,
  /tmp sandbox): typecheck✅ lint✅ (0 warnings) test✅ (94 files / 1175 tests) knip✅ (EXIT 0).

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
  `AutonomousConfig` Zod schema tightened to `.strict()`; IPC byte-size cap
  enforced via `Buffer.byteLength` (was `String#length`, ~4× looser on
  multibyte payloads).

### Reliability
- 10s timeout on every Alpaca REST call. Exponential backoff on equity,
  crypto, and account WebSocket reconnects (was fixed 5s / 3s — could storm
  unreachable endpoints during outages). `LiveCandleBuffer` fill-forward on
  bucket boundaries. Tick recorder uses feed-time (`q.timestamp`) instead
  of `Date.now()` so bucket alignment and replay clock anchor are accurate.

### Observability
- Rolling-window tick-Hz computation (was inverted by a stale `Date.now -
  lastTickAt` formula). Explicit no-quote rejection. SESSION_VAR "n/a" label.
  TRADES_TICK 50ms coalescing (matches the existing quote-batch cadence).
  Replay unknown-symbol warning so users see dropped tape rows.

### Post-stabilization pickups (same day)
- **Kill-switch persistence** — `kill-switch-store.ts` persists `{ armed,
  reason, armedAt, updatedAt }` to `userData/kill-switch.json`; boot
  restores armed state via `OrderManager.restoreKillSwitch`. Closes
  deferred item from issue #1.
- **Periodic tape-manifest reseal** — `TickRecorder` reseals every 5s during
  recording so a mid-session crash leaves a recoverable tape (`ok-extended`
  verdict instead of `no-manifest`). Closes deferred item from issue #1.
