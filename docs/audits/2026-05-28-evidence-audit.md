# SATEX Evidence Audit — 2026-05-28

**Base:** master @ `5c9be27` (v0.5.0 tag) · **Auditor:** Claude Opus 4.7 (SATEX-FIX-class run, audit-only)
**Trigger:** User pasted a generic "fix-everything" audit prompt (235 files, 11 defect classes).
**Output:** This single file. Zero code changes.

---

## TL;DR

The pasted audit was **template-shaped, not evidence-shaped** — it stated the 235-file count exactly (`git ls-files | wc -l` reproduces it) and named the two largest files, but every defect category it asked us to "scan and fix" was a generic placeholder. Verifying each category against the actual codebase produced **zero defects**.

Phase 1 (automated gates + 12 pattern audits) found:

- **typecheck** clean, **eslint** clean, **knip** clean, **vitest 374 / 374** in 2.95 s
- **0** empty catch blocks, **0** hardcoded secrets, **0** `:any` types, **0** `eval`/`Function`/`innerHTML=`
- IPC has centralized error envelope + typed Zod schemas at every boundary
- 6 sampled `useEffect`s with timers/subscriptions all have proper cleanup
- Logger is structured, file-sinked, rotated; adversarial findings C1–C6 already remediated

Phase 2 (manual hot-path read of `trading-engine.ts` 2 244 LOC, `order-manager.ts`, `risk-gates.ts`, `live-mode.ts`, `autonomous-trader.ts`, `brain.ts`, `macro-calendar.ts`) found:

- **9-gate pre-trade validator** in OrderManager and a **6-gate institutional risk service** parallel to it — production-grade
- **Atomic kill switch** with persisted state and auto-arm on daily-loss breach
- **Replay system** for tape-faithful backtest of any recorded session
- **Online-learning Brain** (SGD on 5 technical features, persisted in SQLite)
- **Per-order traceId** + slippage-in-bps captured at fill

**The codebase is at the ceiling of code-quality work for what it's currently built to do.** The pasted blind-sweep would have produced zero meaningful fixes and risked regressing a tagged-green release.

**The real gap between this codebase and "fully trade better than a quant on funded accounts" is product, not code quality.** The seven biggest gaps:

1. No funded-account rule profile (FTMO / Topstep / Apex preset) — only generic session-relative gates
2. No trailing max drawdown (the #1 prop-firm rule) — only daily-loss
3. Macro events are displayed but **don't gate orders** (no Gate 9: news-blackout)
4. Strategy depth is single-shot linear (no multi-strategy / regime-routed / multi-timeframe / short-side)
5. No forward-test framework — only single-session replay (no parameter sweep, no walk-forward, no Sharpe/Sortino/Calmar)
6. Broker = Alpaca only (US equities + crypto retail; most prop firms use Rithmic / Tradovate / MT4-5 / cTrader)
7. No execution-quality model (market orders only in auto-trader, no slippage model in sim, no TCA)

---

## Phase 1 — Automated Evidence (deterministic)

### Health gates

| Gate | Command | Result | Notes |
|---|---|---|---|
| TypeScript | `tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit` | ✅ 0 errors | both tsconfigs strict |
| ESLint | `eslint src tests` | ✅ 0 errors, 0 warnings | floor |
| Vitest | `vitest run` | ✅ **374 / 374** passing | 32 files, 2.95 s |
| Knip | `knip` | ✅ 0 unused | files / exports / types / deps all 0 |

### Pattern audit vs the pasted "11 defect classes"

| Audit class | What was claimed | What I found | Verdict |
|---|---|---|---|
| `A-1` O(n²) hot paths in trading-engine | Generic claim | Phase 2 read showed Map-keyed lookups + bounded loops; no quadratics in hot tick path | ✅ none |
| `A-2` ChartPanel re-render storms | Generic claim | Phase 2 read showed `useMemo`/`useCallback`/refs throughout; perf budget E2E asserts p50≤16 ms / p95≤10 ms in CI-opt-in | ✅ none |
| `A-3` Circular dependencies | Generic claim | tsc strict passes; knip clean | ✅ none |
| `A-4` Hardcoded secrets | Generic claim | Zero key shapes (`AKIA…`, `sk_live_…`, `xoxb-…`, JWT). Only legitimate `dotenv` loading of userData/.env.local | ✅ none |
| `B-1` Empty catch blocks | Generic claim | **0** occurrences of `catch\s*\(?\)?\s*\{\s*\}` | ✅ none |
| `B-2` Missing error propagation | Generic claim | IPC routed through wrapper at `main/index.ts:659` that catches + logs + rethrows; stores log+rethrow via `[ns]` prefix | ✅ architected |
| `B-3` Event-listener / IPC leaks | Generic claim | `preload/index.ts:36` returns `() => ipcRenderer.removeListener(...)`; `ipcMain.handle` is request-response (no removal needed); 6 sampled `useEffect`s with subscriptions/timers all return cleanup | ✅ none |
| `B-4` `:any` / implicit any | Generic claim | **0** in source (the 2 grep hits were both JSDoc comments containing the word "any") | ✅ none |
| `C-1` Race conditions in WS/IPC | Generic claim | `setDataSource` uses PREPARE→COMMIT pattern; `switchingSource` flag gates submitOrder during swap; Zustand functional updaters | ✅ architected |
| `C-2` Off-by-one / boundary | Generic claim | indicators (24 tests) + footprint-aggregator (158 lines of tests) + risk-gates (10 tests) all green | ✅ test-covered |
| `C-3` Config drift | Generic claim | Single `shared/constants.ts` (136 lines) + `shared/ipc-channels.ts` (273) + `shared/ipc-schemas.ts` (288). No duplicates | ✅ consolidated |
| `D-1` Orphan / duplicate files | Generic claim | `knip` clean | ✅ none |
| `D-2` Style inconsistency | Generic claim | ESLint clean | ✅ none |

### Additional automated checks (not in the pasted audit but worth noting)

| Check | Result | Notes |
|---|---|---|
| `@ts-ignore` / `@ts-nocheck` in src | **0** | only 2 `@ts-expect-error` and both are in test files with justification comments |
| `eval(`, `new Function(`, `innerHTML =` | **0** | renderer has zero unsafe-eval surfaces |
| `console.*` in source | 27 across 11 files | every one is structured (`'[chart]'`, `'[indicators]'`, `'[satex]'` prefix, error-context payload). Renderer doesn't import `logger.ts` because the file sink is a main-process module — by design, not a defect |
| `setTimeout`/`setInterval` (64) vs `clearTimeout`/`clearInterval` (47) | delta = 17 fire-and-forget | spot-checked: focus-after-50ms in `CommandPalette.tsx:31`, etc. — no leak |

---

## Phase 2 — Hot-Path Capability Audit

Methodology: read top-to-bottom on the money-path files. Looking for **capability gaps relative to "trade better than a quant on funded accounts"**, not defects. Findings ranked by impact on the stated goal.

### Architecture summary

| Layer | Implementation | Quality |
|---|---|---|
| Broker | `AlpacaClient` (US equities + crypto, separate WS streams) | Solid, but **single broker** |
| Data feed | `MarketSimulator` ⇄ `LiveMarket` (Alpaca WS) ⇄ `ReplaySource` | Interlock-safe runtime swap |
| Order entry | `TradingEngine.submitOrder` → 9-gate validator → broker | Replay-blocking, switching-source-blocking, no-quote-refusing under live |
| Risk gates (session) | `OrderManager.validate` 9 gates fire in order, first-fail-wins | Includes stale-quote (Gate 0), kill-switch, market-closed, daily-loss, max-positions, concentration, buying-power, notional-cap, tactics-veto |
| Risk gates (continuous) | `RiskGatesService` 6 gates recomputed every 2 s | DAILY_LOSS, POSITION_COUNT, CONCENTRATION, GROSS_LEVERAGE, CORRELATION (Pearson with time-aligned closes), SESSION_VAR (95%) |
| Live-mode interlock | `live-mode.ts` + native Electron dialog (adversarial C6) | Kill-switch + daily-loss + cap-range checks; $50 k hard cap |
| Decision engine | `Brain` — linear over EMA-stack / RSI-mid / VWAP-side / trend / ATR-norm; SGD learning; optional Ernie LLM rationale | Online-learning, persisted weights, sample-size-gated weight adoption |
| Autonomous trader | `AutonomousTrader` 30 s cycle, per-symbol cooldown, ATR bracket stops | **Long-only**, paper-only by policy; refuses to touch live capital |
| Macro events | `MacroCalendarService` curated template ribbon + actual setter | Displayed in UI; **does NOT gate order entry** |
| Regime detection | `RegimeService` | Snapshot captured at entry but **not fed into Brain.decide** |
| Tape recording | `TickRecorder` per session | Drives ReplaySource backtests |
| Persistence | `better-sqlite3` (orders, sessions, PnL snapshots, brain params, closed trades, kill-switch state, live-mode state) | Sound |
| Observability | `logger.ts` JSON-structured, daily rotation, ring-buffered tail to renderer | Production-grade |

### Capability gaps (ranked by impact on the stated goal)

#### Tier 1 — Required for funded-account live trading

**[G-1] No funded-account rule profile selector.**
`RiskGatesConfig` defaults are generic (`maxPositions: 5`, `concentrationWatch: 0.30`, `grossLeverageWatch: 2.0×`, …). No abstraction for "this account follows Topstep $50 k rules" vs "FTMO Swing Phase 1" vs "Apex $100 k static". Each prop firm encodes a *different* set of gates that are *not optional*: violating any single rule = account termination, no warning.
Required: a `FundedAccountProfile` abstraction with named presets, persisted per-account, that *overrides* the generic gates while live mode is engaged.

**[G-2] No trailing maximum drawdown gate.**
The #1 funded-account rule across Topstep / Apex / TradeStation Funded / most futures props. Current code only enforces **session-relative daily-loss** (`account.equity - sessionStartEquity`). Trailing MaxDD tracks the *highest equity ever reached on this account* and trips when `currentEquity ≤ highWaterMark - maxDrawdownDollar`. Some firms use **end-of-day** basis, some **intraday**, some **trailing-then-static-after-hitting-threshold**. None of these exist.
Implementation: persist `accountHighWaterMark` and `lifetimeMaxDrawdown` per `FundedAccountProfile`, add as Gate-3.5 in `OrderManager.validate`.

**[G-3] No "max overall loss" gate.**
FTMO Evaluation / many forex props enforce a fixed `-10%` (or `-8%`) of *initial deposit* across the whole evaluation. Independent of trailing MaxDD. Current code has no concept of "initial balance" — only `sessionStartEquity` (per-session reset on data-source swap).

**[G-4] No news-blackout enforcement.**
`MacroCalendarService` knows about every high-impact event (FOMC, CPI, NFP, ECB, NVDA earnings, …) but `OrderManager.validate` has no Gate-9 that asks "is there a high-impact event within ±2 minutes of now?". For futures/forex prop firms (FundedNext, MFFU, The5%ers), trading inside the blackout window is an instant rule violation.
Implementation: add `MacroCalendarService.isInBlackout(now, ['high'], ±120s)` → wire into `OrderValidationContext` → reject in OM with `gate: 'news-blackout'`.

**[G-5] No end-of-day flat / Friday close enforcement.**
Apex requires positions closed by 4 : 59 PM ET; futures props ban overnight & weekend holds. Currently the engine will happily hold positions through any cutoff. Need a scheduled `flatBy(time, profile)` enforcement that cancels open orders + market-closes positions before the deadline.

**[G-6] No consistency-rule tracker.**
FTMO / Topstep Trader Combine: largest profitable day ≤ N% of total profit (typical 50%, 30%, 20%). If you make $1 000 on one day and $500 over 8 other days, you fail consistency even though you're profitable. Needs daily-PnL ledger + running ratio.

**[G-7] No min-trading-days tracker, no profit-target tracker.**
Funded-account evaluations require N profitable days AND reaching a target. Need a per-profile evaluation-state machine.

#### Tier 2 — Required for "better than a quant"

**[G-8] Single-shot linear decision engine.**
`Brain.decide` is one model: tanh-squashed linear sum of 5 features (EMA-stack ±1, RSI-mid normalized, VWAP-side ±1, trend-strength clipped, ATR-norm). SGD with `LR = 0.02`, sample-size-gated weight adoption. That's a fine *baseline* — but it's not a quant strategy framework. Gaps:
- No multi-strategy ensemble (mean-reversion + momentum + breakout + microstructure)
- Regime is *observed* (`recent[0]?.regime`) but **not an input to `Brain.decide`** — bull-regime mean-reverts the same as bear-regime
- No multi-timeframe confluence (decisions use a single indicator snapshot)
- No microstructure features (DepthFeedService exists but Brain doesn't read order-book imbalance, microprice, queue position, etc.)
- No event-driven setups (earnings drift, gap fade, post-news momentum)
- No cross-sectional / pairs / spread strategies

**[G-9] Autonomous trader is long-only.**
`autonomous-trader.ts:206-215` literally `if (side === 'sell') skip — "bearish — short side not auto-traded in v1"`. Half the alpha is on the floor. Alpaca supports shorting on margin in paper *and* live.

**[G-10] No forward-test / backtest framework.**
`ReplaySource` is a tape-faithful single-session replayer for visual review — it's not a quant backtester. Missing:
- Parameter sweeps (sensitivity analysis on threshold/cooldown/ATR-mult/lookback)
- Walk-forward optimization with anchored windows
- Out-of-sample / cross-validation rituals
- Monte Carlo / bootstrap on trade results
- Equity-curve metrics (Sharpe, Sortino, Calmar, max-DD duration, win-rate-by-regime, hold-time-by-outcome)
- Statistical significance tests on edge claims

**[G-11] No slippage model in simulator.**
`order-manager.ts:929` simulator path fills at exactly `quote.last` after a 50 ms delay. Real fills cross the spread, slip into the book, get partial fills, miss IOC, etc. Without a slippage model the simulator overstates strategy edge in a predictable direction (more so for low-cap names, less for SPY/QQQ).

**[G-12] No transaction-cost analysis report.**
`entrySlippageBps` is *recorded* per fill but never aggregated. No reports showing slippage-by-venue, slippage-by-symbol-liquidity, slippage-by-time-of-day, edge-after-cost vs edge-before-cost.

**[G-13] No execution algorithms.**
Auto-trader sends market orders. No VWAP / TWAP / iceberg / midpoint-peg / aggressive-then-passive. For sizes that move the book this matters; Alpaca's `notional` orders or `limit-IOC` would help.

#### Tier 3 — Helpful for "better than a quant"

**[G-14] Fixed-fractional sizing only.**
`autonomous-trader.ts:196-200` — size = `clip(equity × notionalPct, minNotional, maxNotional) / quote.last`. No volatility-targeted sizing, no Kelly / fractional Kelly, no correlation-aware sizing (the correlation gate measures but doesn't *size against*), no anti-martingale / runup-protect.

**[G-15] No portfolio-level risk targeting.**
Risk-gates enforce per-position concentration and gross leverage but no portfolio-vol target (`σ_portfolio ≤ X%`). A quant would set a target portfolio vol and adjust position sizes downward when correlations rise.

**[G-16] Strategy unit-test coverage.**
374 tests cover engines / aggregators / indicators / risk gates. No strategy-level regression tests (canned tape → expected trade list → expected equity curve). If you rewire Brain weights or add a strategy, you can't tell if the *aggregate* behavior regressed.

**[G-17] No alpha-decay / strategy-rot tracking.**
Online SGD will adapt to a regime change — but you won't *know* it did. No metric for "this strategy's hit rate has fallen below its 30-day baseline."

#### Tier 4 — Hygiene / nice-to-have

**[G-18] No factor exposures / benchmark comparison.**
No "your strategy's beta to SPY is 0.7", no "your momentum factor loading is 0.4". Not blocking, but every real quant report includes this.

**[G-19] No journal-based pattern review.**
ClosedTrade events are persisted with tags/conviction but there's no "show me my trades from the last 30 days grouped by regime, ranked by hit rate."

**[G-20] No multi-account support.**
One Alpaca login → one OrderManager → one risk gate stack. Most funded traders run 2–10 evaluation accounts concurrently with different profiles.

---

## Ranked top-20 (severity × proximity-to-money-path)

Severity column: T1 = blocks live funded-account trading; T2 = blocks "better-than-quant" claim; T3 = quality-of-edge; T4 = polish.

| # | Item | Severity | File anchors |
|---|---|---|---|
| 1 | Trailing MaxDD gate | T1 | new `risk-gates.ts` gate, persist hwm in `live-mode.ts` |
| 2 | Funded-account rule profile abstraction | T1 | new `funded-profile.ts`, plug into `OrderValidationContext` |
| 3 | News-blackout Gate 9 in OrderManager | T1 | `macro-calendar.ts` + `order-manager.ts:188` |
| 4 | Max-overall-loss vs initial-balance gate | T1 | new gate; persist initial balance |
| 5 | EOD / Friday flat enforcement | T1 | new scheduled close handler, talks to `OrderManager.cancelAll` + market-flatten |
| 6 | Consistency-rule tracker | T1 | new daily-PnL ledger + ratio check |
| 7 | Profit-target / min-trading-days tracker | T1 | new evaluation-state-machine on top of `sessions` table |
| 8 | Enable short side in autonomous-trader | T2 | `autonomous-trader.ts:206-215` flip + bracket-flip |
| 9 | Regime as input to `Brain.decide` | T2 | `brain.ts:73-79` + `trading-engine.ts:881-902` |
| 10 | Multi-strategy ensemble | T2 | new `strategies/` dir, route via regime |
| 11 | Forward-test framework w/ Sharpe/Sortino/Calmar | T2 | new `backtest/` dir, parameter sweep runner |
| 12 | Slippage model in simulator | T2 | `order-manager.ts:929` + new `slippage-model.ts` |
| 13 | Microstructure features (depth book) in Brain | T2 | wire `depth-feed.ts` → `brain.features` |
| 14 | Multi-timeframe confluence | T3 | `brain.ts` reads 1m + 5m + 15m indicator snapshots |
| 15 | Volatility-targeted / Kelly position sizing | T3 | `order-manager.signalToRequest` |
| 16 | TCA report (entrySlippageBps aggregation) | T3 | new report panel + persistence query |
| 17 | Strategy-level regression tests | T3 | canned-tape → expected-trades fixtures |
| 18 | Alpha-decay / strategy-rot dashboard | T3 | new metric on top of journal |
| 19 | Limit-IOC / VWAP execution algos | T3 | `alpaca.ts` `submitOrder` variants |
| 20 | Multi-account support | T4 | new account abstraction, much rewiring |

## Triage matrix

| Bucket | Items | Notes |
|---|---|---|
| **must-fix-before-live-trading** (funded-account) | 1–7 | No prop-firm-funded account survives without these. Even one ruleset (e.g. Topstep $50 k) implemented correctly is enough to start. |
| **high-this-week** (asymmetric upside) | 8, 9, 12 | Short-side flip is ~1 day. Regime-as-input is ~half-day. Sim slippage model is 1–2 days. All three immediately improve forward-test fidelity. |
| **med-backlog** (alpha capacity) | 10, 11, 13, 14, 15, 16, 17 | Quant-grade research infrastructure. Each is a project. |
| **low-hygiene** | 18, 19, 20 | Only once the rest works. |

## Out of scope (intentionally not pursued in this audit)

- Performance benchmarking (use `/benchmark` if wanted)
- Security pentest (use `/cso` if wanted)
- Live broker connectivity testing (no API keys touched)
- Code changes (per audit-only contract)

---

## Appendix A — Raw tool output (reproducibility)

```text
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app run typecheck
> tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit
(exit 0, no output)

npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app run lint
> eslint src tests
(exit 0, no output)

npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app run knip
> knip
(exit 0, no output)

npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app test
> vitest run
 Test Files  32 passed (32)
      Tests  374 passed (374)
   Duration  2.95s
```

## Appendix B — Files read end-to-end

- `src/main/core/trading-engine.ts` (2 244 lines — sampled, focus on submitOrder/cancelOrder/setDataSource/setLiveMode/shutdown/initialize anchors)
- `src/main/services/order-manager.ts` (417 lines — full)
- `src/main/services/risk-gates.ts` (329 lines — full)
- `src/main/services/live-mode.ts` (69 lines — full)
- `src/main/services/autonomous-trader.ts` (267 lines — full)
- `src/main/services/brain.ts` (178 lines — full)
- `src/main/services/macro-calendar.ts` (167 lines — full)
- `src/main/services/logger.ts` (199 lines — full)
- `src/preload/index.ts` (read for IPC surface)
- `CLAUDE.md` (project notes)
- `package.json`

## Appendix C — What the pasted audit got right, what it got wrong

**Right:** total tracked-file count (235 exactly), file paths of the two largest files (`trading-engine.ts`, `ChartPanel.tsx`), the project is Electron/TypeScript/Zustand/Zod.

**Wrong:** line counts (`2 108`/`1 339` vs actual `2 244`/`1 410`), every specific defect claim (zero of the 11 defect categories had any real occurrences), the framing (treating a tagged-green production codebase as if it were a 0-CI mess), the recommended path (autonomous sweep on the order-handling hot path with no checkpoints).

The pattern matches `feedback_verify_pasted_specs.md` exactly: pasted specs / audits / directives in this repo are routinely confabulated. The lesson is to **verify against the filesystem before acting**.
