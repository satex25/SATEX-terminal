# Program design — Topstep-eval-capable code-ready

**Date:** 2026-06-02
**Owner:** human + Claude
**Status:** draft (pending user spec review)
**Scope class:** program (decomposes into ~8 sub-projects, each with its own implementation plan)

## 1. Purpose

Reach a release candidate where SATEX is "Topstep-eval-capable" — code-complete to run a Topstep $50K XFA evaluation end-to-end on the simulator with all funded-account rules enforced, a second broker adapter (Rithmic or Tradovate) code-complete on the `@shared/broker/` interfaces, the v0.6 renderer perf budget continues to hold post-integration, and a signed Windows installer in `dist/`. **No real capital is crossed.** This is the engineering-complete state from which "actually run a Topstep eval" or "first D-2 payout" become follow-up programs.

## 2. Goal (Definition of Done — program level)

Master is at a release-candidate tag (v0.6.0 or v0.7.0 — decide at convergence) where all of these hold simultaneously:

1. `git grep -n "this.alpaca\." -- src/` returns matches only in `live-market.ts` (the MarketDataSource concrete itself). Engine + historical-importer talk solely to `BrokerSession` facets.
2. Four gates green on master continuously: `npm run typecheck`, `npm run lint`, `npm test`, `npm run knip`.
3. Topstep $50K XFA `FundedAccountProfile` selectable in simulator. Multi-day deterministic simulator integration test passes: trailing-MaxDD HWM with Topstep lock, news blackout (MacroCalendar), IANA-tz-aware EOD flatten, max-contracts gate, allowed-asset-class gate, RiskGates 9-13. Renderer shows the five new gauges.
4. `DailyPnlLedger` accumulates per-day P&L with timezone-aware day boundaries; payout-phase state machine visible in renderer when in funded phase.
5. `StrategyEnsemble` regime-routes between Momentum, MeanReversion, Breakout strategies with fallback; `autonomous-trader` consumes it; regression framework runs against locked baseline; backtest CLI green on canned fixture.
6. Second broker concrete `TradovateBrokerSession.create()` instantiable and type-conforming to `OrderRouter` / `MarketDataSource` / `AccountSyncer` / `SymbolResolver`. Fake-harness conformance tests pass. **No live wiring crossed.** (Rithmic deferred to a follow-up program — see §7 #1.)
7. Opt-in `SATEX_E2E_PERF=1 npx playwright test renderer-perf.spec.ts` green against post-integration build (p50 ≤ 16ms, p95 ≤ 10ms). New hot paths instrumented with `perf.measure` (`ensemble:select`, `riskgates:snapshot`, `fundedaccount:snapshot`, `dailypnlledger:accumulate`). Budgets on the new tags optional.
8. `dist/SATEX Setup <version>.exe` signed: `Get-AuthenticodeSignature` returns `Status: Valid`, `SignerCertificate` subject contains `SATEX Trading Systems`. Manual install verified, SmartScreen behavior matches cert type.
9. `CHANGELOG.md` released-section entry written; `package.json` version bumped; release tag pushed.

## 3. Verified state of play (2026-06-02)

### 3.1 Raw material on remote
- `master` @ `5c9be27`, v0.5.0 RC, 374/374 tests green, four gates green.
- `feat/f1-broker-adapter-impl` (current, +14 commits): BrokerSession umbrella; engine adopted session lifecycle; **19 sites** still on direct `this.alpaca.*` (verified by `Grep` 2026-06-02: 13 in `trading-engine.ts`, 6 in `historical-importer.ts`; `live-market.ts`'s 5 sites are the LiveMarket concrete itself and stay).
- `feat/tier-2-alpha-depth` (+39 commits): cascaded stack containing — in chronological order — slippage + short, backtest framework, funded compliance, D-2 payout, strategies + ensemble + sizing + TCA + microstructure + regression framework, ensemble wiring. Cascade verified by `git merge-base --is-ancestor`: `slippage-short ⊂ topstep-50k ⊂ d2-payout ⊂ tier-2-alpha`.
- Lane 2: `certs/satex-codesign.csr` + `certs/HANDOFF.md` + `certs/satex-codesign.inf` on master. `scripts/prepack-check.js` surfaces `installer WILL BE SIGNED` when `CSC_LINK`+`CSC_KEY_PASSWORD` set. `electron-builder.yml` configured with `signtoolOptions.signingHashAlgorithms: sha256`.
- Lane 3: `src/renderer/lib/perf.ts` + `summarizeFrames` + `frameProfile.start/stop/report` already on master. `tests/e2e/renderer-perf.spec.ts` complete with calibrated 8.3ms × 1.15 = 10ms p95 budget. ChartPanel.tsx already wraps `chart:setData` (line 627) and `chart:update` (line 668) with `perf.measure`.

### 3.2 Correction to prior context
- CLAUDE.md and memory cite "~30" Alpaca-direct sites for F.1 follow-up. Verified count is **24 total**, but 5 of those are inside `live-market.ts` (the MarketDataSource concrete) and should stay. **Real migration surface = 19 sites.**
- Memory cites Lane 3 perf-budget runtime harness as incomplete. Reality: runtime harness AND E2E both shipped to master. Lane 3 reduces to regression protection + new-hot-path instrumentation.

## 4. Program shape — three lanes

```
master @ 5c9be27 (v0.5.0 RC, 374/374 green)
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
   ┌────▼────┐       ┌────▼────┐       ┌────▼────┐
   │ Lane 1  │       │ Lane 2  │       │ Lane 3  │
   │ Strategy│       │  Cert   │       │  perf   │
   │  main   │       │ procure │       │ contin. │
   └────┬────┘       └────┬────┘       └────┬────┘
        │ L1.A             │ L2.A → L2.B    │ L3.A (after L1.A)
        │ L1.B            (3-15 biz day     │ L3.B (after L1.C/D/F)
        │ L1.C            wait — passive)   │
        │ L1.D             │ L2.C-F         │
        │ L1.E             │                │
        │ L1.F             │                │
        │ L1.G             │                │
        ▼                  ▼                ▼
                  Convergence: RC tag
              Topstep-eval-capable code-ready
                  Signed installer in dist/
              Second broker adapter code-complete
```

**Lane 1** (strategic, main): internally sequential because the cascaded stack forces ordering. Owns the trading-engine integration risk.

**Lane 2** (cert): mostly user-action paperwork. Long external wait (3-15 biz days). Starts day 1.

**Lane 3** (perf continuity): touches only renderer code and instrumentation. Independent of trading-engine work.

**Convergence:** all three lanes' exits hold simultaneously → RC tag.

## 5. Sub-projects

### 5.1 Lane 1 — strategic main lane

#### L1.A — F.1 broker-port completion
- **Branch:** `feat/f1-broker-adapter-impl` (current)
- **Scope:** Migrate 19 sites (13 in `trading-engine.ts`, 6 in `historical-importer.ts`) from direct `this.alpaca.*` to `this.session.<facet>.*`. Includes: `submitOrder`/`cancelOrder` → `session.router`; `getAccount`/`getPositions` → `session.account`; `getBars`/`getCryptoBars`/`getClock`/`onTradeUpdate`/`isMarketConnected`/`msSinceLastTick`/`isConfigured` — decide facet placement during migration (most likely a thin `MarketData` extension or stays on session). Migrate `shutdown()` from sync to async-session-aware.
- **Pre:** F.1 design doc accepted; on `feat/f1-broker-adapter-impl`; gates green at branch tip.
- **Post:** `git grep -n "this.alpaca\." -- src/` returns only `live-market.ts` matches; 4 gates green; PR opened → CI green → user signs off → `gh pr merge --merge`; head SHA in `master`.
- **Trading-safety:** touches `submitOrder` / `cancelOrder` paths — explicit human PR sign-off required per AGENTS.md.
- **Open implementation question:** crypto WS facet vs engine-owned (recommendation: engine-owned, document the boundary).

#### L1.B — Forward-test foundation (slippage + short + backtest framework)
- **Branch:** rebase first 14 commits of cascaded stack (`b90774a` through `e251681`) onto post-L1.A master.
- **Commits in original order:** SlippageModel iface + ZeroSlippage, FixedBps, sqrt-law, OrderManager simulator wire, short-side autonomous, Phase C plan doc, BacktestReport/EquityPoint/Metrics types, pure metrics lib (Sharpe/Sortino/Calmar/MaxDD/PF/expectancy), Strategy iface + StrategySnapshot, BrainStrategy wrapper, BacktestRunner with intra-bar bracket resolution, reporter (console + markdown + JSON), headless CLI + canned fixture + integration test.
- **Pre:** L1.A merged.
- **Post:** Backtest CLI green on canned fixture; slippage model selectable; simulator runs short side; 4 gates green; PR signed off → merged.
- **Rebase note:** these commits don't touch the broker abstraction surface, low conflict risk. The simulator-path `OrderManager` may have moved underneath; reconcile.

#### L1.C — Strategies + ensemble + sizing + TCA + microstructure + regression
- **Branch:** rebase commits `aba8bce` through `17478f5` (11 commits) onto post-L1.E master.
- **Scope:** Multi-tf indicators, StrategySnapshot extension, MomentumStrategy, MeanReversionStrategy, BreakoutStrategy, StrategyEnsemble (regime-routed + fallback), VolatilityTargetSizing, TransactionCostAnalyzer, microstructure features (depth_imbalance + microprice_dev), regression framework (compareReports vs baseline), knip cleanup.
- **Pre (code dependency):** L1.B merged. L1.C imports `Strategy` interface + `BacktestReport` / `EquityPoint` / `Metrics` types from L1.B. **No code dependency on L1.D or L1.E.**
- **Rebase position:** chronologically after L1.E in the cascaded stack. Spec preserves chronological order to minimize rebase conflict surface — see §7 #4. This is an ordering constraint for the rebase strategy, not a code dependency.
- **Post:** Per-strategy unit tests pass; ensemble regime fixture tests pass; regression baseline locked; 4 gates green.
- **Note:** pure strategy code — no broker surface touched — clean review.

#### L1.D — Funded-account compliance (Topstep $50K XFA)
- **Branch:** rebase commits `d841d9a` through `67ecf24` (10 commits) onto post-L1.B master.
- **Scope:** `FundedAccountProfile` abstraction + Topstep $50K XFA preset; `EquityHWMService` with Topstep lock semantics (trailing DD floor, locks once hit); pure `maxContracts` + `allowedAssetClass` checks; `MacroCalendarService.isNewsBlackout()` + pure blackout check; `EodFlattenService` (IANA-tz-aware); `FundedAccountStore` (atomic JSON + sanitization); `FundedAccountService` (orchestrator + renderer snapshot); `RiskGatesService` display gates 9-13 (5 new gauges); `OrderManager` `cancelAll` + `flattenAll`; IPC + preload + renderer hookup.
- **Pre:** L1.B merged. (Original order: L1.B → L1.D, preserved by rebase.)
- **Post:** Topstep $50K profile selectable in simulator; multi-day deterministic simulator integration test asserts the funded contract (HWM/lock/EOD/news/max-contracts/asset-class); 5 gauges render in renderer; 4 gates green.
- **Trading-safety:** densest concentration of enforcement logic. Every gate unit-tested. Multi-day simulator integration test pre-merge. **Explicit human PR sign-off required.**

#### L1.E — D-2 payout rules
- **Branch:** rebase commits `9550df9` through `0cf5143` (3 commits) onto post-L1.D master.
- **Scope:** D-2 plan doc, `DailyPnlLedger` per-day P&L accumulation with timezone-aware day boundaries, payout metrics + display gauges + phase IPC.
- **Pre:** L1.D merged.
- **Post:** Payout-phase state machine visible in renderer when in funded phase; phase transitions unit-tested; 4 gates green.

#### L1.F — Tier-2 ensemble wired into autonomous-trader
- **Branch:** rebase commit `95a4217` (1 commit) onto post-L1.C master.
- **Scope:** `autonomous-trader` consumes `StrategyEnsemble`; replaces direct strategy reference.
- **Pre (code dependency):** L1.C merged — provides `StrategyEnsemble`.
- **Pre (test prerequisite):** L1.E merged — the autonomous-loop integration test asserts end-to-end behavior including funded-account context; without L1.D + L1.E the fixture can't drive the funded path. Implicitly satisfied because L1.C lands chronologically after L1.E; documented here so the test gate is not misread as a code dependency.
- **Post:** Autonomous trader uses ensemble in simulator; integration test green; 4 gates green.
- **Trading-safety:** touches autonomous decision loop. **Explicit human PR sign-off required.**

#### L1.G — Tradovate broker adapter
- **Branch:** new, `feat/f2-tradovate-adapter`.
- **Scope:** Implement `OrderRouter`, `MarketDataSource`, `AccountSyncer`, `SymbolResolver`, plus `TradovateBrokerSession.create()` against Tradovate's REST + WebSocket protocol. Build against a fake harness conforming to the wire protocol; no live API access (OAuth + account credentials) needed for code-ready done state. Unit tests + protocol conformance tests + integration test that swaps session at construction sites.
- **Pre:** L1.F merged. (Tradovate decision settled per §7 #1.)
- **Post:** `TradovateBrokerSession.create()` exists; engine instantiates a non-Alpaca session without throwing; all four facets type-check against the same `@shared/broker/` interfaces Alpaca uses; fake-harness conformance tests pass; 4 gates green.
- **Trading-safety:** new order-routing surface — requires explicit human sign-off even though no live wiring is crossed.

### 5.2 Lane 2 — cert procurement

| Sub-project | Type | Pre | Post |
|---|---|---|---|
| **L2.A** CA choice | user-decision | none | EV-vs-OV + CA chosen; `certs/HANDOFF.md` amended if EV (workflow differs) |
| **L2.B** CSR submit | user-action | L2.A | CSR submitted via CA portal; identity verification kicked off; CA tracking ID logged |
| **L2.C** Receive + bind | user-action, build-machine | L2.B (3-15 biz day external wait) | `certreq -accept satex-codesign.cer` succeeds; `Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert` shows cert with `HasPrivateKey=True` |
| **L2.D** `.pfx` + env (OV) / token config (EV) | user-action | L2.C | OV: `Export-PfxCertificate` → `satex-codesign.pfx`; `CSC_LINK`+`CSC_KEY_PASSWORD` in build shell. EV: USB token signing or cloud signing service configured |
| **L2.E** Signed `pack:win` | engineering | L2.D + master buildable (L1.A minimum) | `dist/SATEX Setup <ver>.exe` exists; `prepack:check` logs `installer WILL BE SIGNED` |
| **L2.F** Verify | engineering | L2.E | `Get-AuthenticodeSignature` returns `Valid`; `SignerCertificate` subject contains `SATEX Trading Systems`; manual install + run; SmartScreen behavior matches cert type |

**Out of scope (deferred):** L2.G GitHub Actions release-signing pipeline (waits for L2.F + S1-9 auto-update).

### 5.3 Lane 3 — perf continuity

| Sub-project | Pre | Post |
|---|---|---|
| **L3.A** Re-baseline post-L1.A | L1.A merged | `SATEX_E2E_PERF=1 npx playwright test renderer-perf.spec.ts` green against post-L1.A build; OR regression diagnosed and fix landed before downstream lanes merge |
| **L3.B** Instrument new hot paths | L1.C + L1.D + L1.F merged | `perf.measure('ensemble:select', …)`, `perf.measure('riskgates:snapshot', …)`, `perf.measure('fundedaccount:snapshot', …)`, `perf.measure('dailypnlledger:accumulate', …)` in place; `satexPerf.dump()` shows new tags; no budget assertion yet (data collection only) |

**Out of scope (deferred):** L3.C — establish budgets on the new tags; possibly move to scheduled nightly. Defer past convergence.

## 6. Cross-lane sync points

- **L2.E ↔ Lane 1:** master must be buildable. L1.A minimum; every subsequent Lane 1 merge keeps the build green.
- **L3.A ↔ L1.A:** re-baseline only meaningful after broker abstraction lands.
- **L3.B ↔ L1.C/D/F:** instruments their new hot paths.
- **Convergence gate:** all sub-project post-conditions hold simultaneously before RC tag.

## 7. Open decisions

| # | Decision | Recommendation | Where settled |
|---|---|---|---|
| 1 | Rithmic vs Tradovate for L1.G | **DECIDED 2026-06-02: Tradovate.** REST + WebSocket protocol, no broker sponsorship required to spec/build, Topstep-accepted. Pivot cost to Rithmic later is zero (same `@shared/broker/` interfaces). Memory entry `project_phase_f_broker_port` updated; Rithmic deferred to a follow-up program. | Settled (this spec amendment) |
| 2 | EV vs OV cert for L2.A | EV Sectigo (~$200/yr, instant SmartScreen reputation, USB token). Trade-off: signing workflow changes (token plug-in or cloud signing) | Before L2.B |
| 3 | Crypto WS facet vs engine-owned | Engine-owned for now; document the boundary; revisit when a non-Alpaca broker adds crypto | In L1.A design |
| 4 | Rebase split granularity | 5 sub-PRs by chronological grouping (L1.B/D/E/C/F) so gates stay green at each tip and review surface stays small | Standing recommendation in this spec |
| 5 | Release version at convergence | v0.6.0 if v0.6 design is stable; v0.7.0 if convergence ships new design phases | Decide at convergence |

## 8. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Rebase conflicts in L1.B-L1.E because the cascaded stack was built when `trading-engine.ts` called `this.alpaca.submitOrder` etc. directly | medium | Rebase one sub-project at a time. Gates green at each tip. Where a rebased commit references `this.alpaca.X`, migrate to `this.session.<facet>.X` inline; reflect in the commit (small reword OK). If a rebased commit can't preserve semantics, split into "preserve original" + "facet migration" commits |
| L1.G live wiring blocked by Tradovate API access (OAuth + account credentials) — note this is a follow-up-program risk, not a code-ready risk | low | Fake-harness conformance proves protocol mapping. Code-ready does not require live access. Live wiring is a follow-up program |
| `shutdown()` async migration in L1.A — current sync `this.alpaca.disconnect*`; `session.disconnect()` is async; Electron `before-quit` may not await | medium | Verify `before-quit` handler awaits the returned promise. If not, add explicit `event.preventDefault()` + `await` + `app.quit()` pattern. Cover with electron-launch test |
| EV cert USB-token CI constraint | low | If EV chosen, defer GitHub-Actions signing pipeline (S1-9) until cloud signing or HSM-CI decided. L2.G stays out of scope |
| Multi-day simulator integration test for L1.D is expensive | low | Use deterministic seeded simulator (`SATEX_SIMULATOR_24_7=true` already exists). Cap test wall-clock at <2 min using accelerated time. Run nightly, not on every PR |
| Trading-safety blast radius in L1.A / L1.D / L1.F | high | Per-PR human sign-off explicitly required per AGENTS.md. No autonomous merge. CI-green necessary but not sufficient |

## 9. Out of scope (deferred to follow-up programs)

- Live Rithmic/Tradovate wiring (real broker sponsorship, real API keys, live order flow)
- Running a real Topstep eval (real $50K eval purchase, ops/monitoring/incident-response)
- L2.G GitHub Actions signed-release pipeline (S1-9, blocked on L2.F + auto-update wiring)
- v1.0.0 release prep (post-program)
- Decommissioning `AlpacaClient`'s standalone surface where the session hasn't been adopted yet
- L3.C — establishing budgets on the new perf tags (data collection only at convergence)

## 10. Realistic PR + effort estimate

- **Lane 1:** 7 PRs (L1.A through L1.G)
- **Lane 2:** 0 PRs (user-action); small `certs/HANDOFF.md` amendment PR if EV chosen
- **Lane 3:** 1-2 PRs (L3.A possibly no PR if green on first run; L3.B is one)
- **Total:** ~8 PRs, multi-week wall-clock (cert wait dominates Lane 2 critical path)

## 11. Implementation handoff

This is a program-level spec. Each sub-project will get its own implementation plan via the writing-plans skill. The first plan to write is **L1.A — F.1 broker-port completion** since it's the in-progress branch and unblocks everything downstream in Lane 1, AND it's the prerequisite for L2.E and L3.A.

Two further sub-projects already have design docs on remote branches:
- `origin/docs/f1-broker-adapter-design` — F.1 design (used by current branch)
- `origin/docs/topstep-50k-plan` — Topstep $50K plan (informs L1.D)
- `origin/docs/tier-2-alpha-plan` — Tier-2 alpha plan (informs L1.C + L1.F)

L1.G (Tradovate adapter) will need its own design doc at L1.G start — Tradovate REST + WebSocket protocol mapping to the four `@shared/broker/` facets (`OrderRouter` / `MarketDataSource` / `AccountSyncer` / `SymbolResolver`).

## 12. Trading-safety perimeter — explicit

This program **does not cross** the trading-safety guardrails defined in `AGENTS.md`:
- No live capital is moved.
- No live broker credentials are wired.
- The kill-switch atomic write contract is preserved.
- Live-mode arming interlock and MAY-TACTICS graduation interlock are unchanged.
- IPC payloads remain Zod-validated; API keys remain in `safeStorage`.
- No macOS build target is added.

Per AGENTS.md, every PR in Lane 1 — and specifically L1.A, L1.D, L1.F, L1.G — requires **explicit human PR sign-off** before merge. CI-green is necessary but not sufficient.
