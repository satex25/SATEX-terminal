---
type: audit
title: SATEX Full-System Verified Audit — 2026-06-10
date: 2026-06-10
version-under-audit: 0.5.0 (master @ 1be1ac6, post-L1.C merge PR #21)
methodology: Every claim verified against code (file:line) or measured by running the gates. No pasted-audit claims trusted (per AGENTS.md). Planning-only — zero code changes made.
tags: [satex, audit, planning, ui-ux, ai-brain]
---

# SATEX FULL-SYSTEM VERIFIED AUDIT — 2026-06-10

> Planning-phase deliverable. Findings only — no code was modified.
> Companion history: [[Vault/00-Audit/SATEX-HANDOFF]] (2026-05-14, v0.3.0), [[Vault/00-Audit/MASTER-FIX-PLAN]].
> Roadmap context: `satex-app/docs/superpowers/specs/2026-06-02-topstep-eval-capable-program-design.md`.

---

## 1. Self-diagnostic — the four gates, actually run

Run 2026-06-10 in an isolated Linux environment reproducing CI (`ci.yml`, Ubuntu).
The repo's own node_modules are Windows-native; a clean install was made in a scratch
directory so **your working tree was not touched**.

| Gate | Command | Result | Evidence |
|---|---|---|---|
| Types | `tsc -p tsconfig.node.json && tsc -p tsconfig.web.json --noEmit` | **PASS** | exit 0 + exit 0 |
| Lint | `eslint src tests` | **PASS** | exit 0, zero output |
| Tests | `vitest run` | **PASS** | **612/612 tests, 55 files**, 6.86 s, exit 0 |
| Dead code | `knip` | **PASS** | exit 0; one hint (`out/main/index.js` entry) is an artifact of the scratch copy lacking `out/` — not a repo issue |

Notes on reproduction (useful for future agent sessions):
- `npm install --ignore-scripts` + `echo electron > node_modules/electron/path.txt` is enough for the vitest suite (persistence falls back to NullDB by design, `persistence.ts:55-62`).
- knip's parser (oxc) allocates a 4 GiB ArrayBuffer on Node ≥ 22; sandbox had 3.9 GB. Shimming `process.version` to v20.19.0 reproduces CI's Node-20 path exactly — that is how the PASS above was obtained.
- Test count growth: 247 (pre-Quad) → 366 (v0.5.0) → **612 today**. Healthy trajectory.

**System verdict: master is green on all four gates.** The May-14 handoff scored the system 5.5/10; on the same dimensions today the verified state is materially better (see §2). The codebase is 211 TS/TSX files, ~34,500 lines — up from 64 files / ~12k LOC at v0.3.0, with test coverage growing faster than source.

---

## 2. Verified remediation since the 2026-05-14 handoff

AGENTS.md demands "verify, don't confabulate" — so each old S0/S1 was re-checked against today's code:

| 2026-05-14 finding | Status today | Evidence |
|---|---|---|
| S0 — no `uncaughtException`/`unhandledRejection` handlers | **FIXED** | `main/index.ts:182-183` → `gracefulShutdown` |
| S0 — no renderer crash recovery | **FIXED** | `render-process-gone` handler `main/index.ts:304`; `child-process-gone` `:92` |
| S0 — `requireAdministrator` elevation | **FIXED** | `electron-builder.yml:27` → `asInvoker` |
| S0 — fire-and-forget `void` async swallowing failures | **FIXED** | centralized `fireAndForget(label, op)` wrapper, `trading-engine.ts:301` |
| S0 — no CI/CD | **FIXED** | `.github/workflows/ci.yml` runs **all four gates** on every push/PR |
| S1 — `sandbox:false` | **FIXED** | `main/index.ts:241` `sandbox: true` (2026-05-18) |
| S1 — no fetch timeout on Alpaca REST | **FIXED** | `AbortSignal.timeout(REST_TIMEOUT_MS)` on every call, `alpaca.ts:224` etc. |
| S1 — 4 orphan IPC channels | **FIXED** | zero hits for BRAIN_UPDATE / INDICATORS_UPDATE / LOG_EVENT / BRAIN_OUTCOME |
| S1 — no auto-update | **FIXED** | `auto-update.ts`, `UpdateToast.tsx`, `update-store.ts`, electron-updater in deps |
| S1 — no CSP / no window-open deny | **FIXED** (with one caveat, §3.6) | CSP meta `index.html:13`; `setWindowOpenHandler` `main/index.ts:326` |
| S1 — no institutional dock model | **FIXED** | Black Box 3-rail shell, `App.tsx` (left watchlist / center workspace / right depth-regime-exec + secondary row) |
| S1 — redundant panels (TopMovers≈Watchlist, Calendar≈News) | **FIXED** | both panels deleted from tree; replaced by Catalysts/MarketsOverview model |
| S1 — quote/candle batch desync, 360 evt/s flood | **FIXED + GUARDED** | 50 ms batching incl. trade batch (`trading-engine.ts:207-213`); p50 ≤ 16 ms frame-budget canary `tests/e2e/renderer-perf.spec.ts` |
| S1 — no tape integrity checksums | **FIXED** | `tape-integrity.ts` + test |
| S1 — engine monolith (9 timers, 4 responsibilities) | **NOT FIXED** — grew | §3.1 |
| S2 — no formal type scale | **NOT FIXED** | §4.2 |
| S2 — kill-switch UX | **IMPROVED beyond spec** | hold-to-arm chord with progress overlay, instant disarm (`App.tsx:144-218`) — genuinely excellent interaction design |
| Code signing | **EXTERNALLY BLOCKED** | CSR ready at `certs/satex-codesign.csr`; needs CA purchase (human action) |

This is an unusually strong remediation record for three weeks. The codebase practices what AGENTS.md preaches.

---

## 3. NEW findings — verified, severity-ordered

### 3.1 S1 — ERNIE LLM call has no timeout; can stall the autonomous loop
`brain.ts:205` — `fetch('https://aistudio.baidu.com/...')` has **no `AbortSignal`**. Every other
external call in the app got the 10 s timeout treatment (`alpaca.ts:212-224`); this one was missed.
Blast radius: `AutonomousTrader.runCycle → tryOne → deps.getDecision → brain.decide → callErnie`
(`autonomous-trader.ts:178`). A hung ERNIE socket suspends the `await` indefinitely; `cycling`
stays true and **autonomous trading silently stops** — no error, no status change. The
`local.confidence > 0.3` gate (`brain.ts:162`) means this only triggers when a token is configured.
**Plan:** add `AbortSignal.timeout(ALPACA-style constant)` + treat timeout as the existing catch path. ~20 min, not on the trading-safety perimeter (advisory text only).

### 3.2 S1 — ExecTicket (order entry) clips to invisible at minimum window size
`main/index.ts:226-227` allows 1200×720. At 720 px height the main row gets
720 − 40 − 26 − 172 − 30 = **452 px** (`globals.css:2087`), but the right rail demands
288 + 1 + 268 + 1 = 558 px *before* ExecTicket's `minmax(0,1fr)` row (`globals.css:2104`)
with `overflow:hidden`. Result: at any window under ~1010 px tall, the **order ticket — the
primary trading control — is clipped to zero height**, and RegimeDashboard is cut mid-panel.
All 4 media queries in 3,517 lines of CSS are width-based; none address height.
**Plan (pick one):** (a) raise `minHeight` to ~1010; (b) make right-rail rows
`minmax(min-content, Npx)` with internal scroll; (c) height media query that collapses Regime
into a tab shared with Depth. Option (b) preserves the design intent best. ~2-4 h.

### 3.3 S1 — PatternLearner applies duplicate SGD updates every cycle
`pattern-learner.ts:107-143`. Each 30 s cycle re-walks the last 5 min of observations
(`LOOKBACK_MS = 300_000`) and updates weights for every observation older than the 60 s label
horizon — **with no high-water-mark cursor and no dedup**. An observation therefore receives the
same gradient step on ~8 consecutive cycles: effective learning rate ≈ 8 × `LR`, `samples`
counters inflated ~8×, and systematic over-weighting of slow periods. This corrupts the very
statistics the learner exists to produce (the vault's long-frozen `forward-return error: 0.0000`
in [[00-INDEX]] is consistent with a degenerate loop).
**Plan:** persist `lastLabeledTs` per symbol; only label observations in
`(lastLabeledTs, now − LABEL_HORIZON_MS]`. Add a unit test asserting one update per observation
across overlapping cycles. ~2-3 h. Observational subsystem — not on the safety perimeter, but it
feeds your learning-velocity goals, so fix before trusting any learned weights.

### 3.4 S2 — Risk-gate correlation runs on prices, not returns
`risk-gates.ts:85-98` + `:255-260` — Gate 5 computes Pearson ρ on raw close prices. Price-level
correlation measures *shared trend*, not co-movement: any two assets drifting upward in the same
hour read ρ → 1 even with independent returns. Institutional convention is correlation of
log-returns. The C4 timestamp-alignment fix (`alignCloses`) is good — this is the remaining
methodological gap. Display-only gate (enforcement lives in OrderManager), so severity S2.
**Plan:** diff the aligned closes into log-returns before `correlation()`; keep `MIN_CORR_OVERLAP`
on the *returns* array. Re-tune `correlationWatch` (return-space ρ runs lower; 0.60 may be too hot). ~2 h + test.

### 3.5 S2 — Brain microstructure features are inert (known gap, worth pinning)
`brain.ts:73` accepts `depth?: DepthSnapshot`, but no call-site ever passes it:
`trading-engine.ts:919` (learning capture) and `brain.ts:113` (`decisionFromLocal`) both omit it,
while `this.depth.get(symbol)` is available at `trading-engine.ts:841`. So `depth_imbalance` and
`microprice_dev` are **0 at decision time and 0 at learning time** — weights frozen at defaults.
The L1.C plan explicitly deferred wiring to **L1.F**, so this is tracked — but note the L1.F spec
(§5.1) only mentions wiring the *ensemble*; brain depth-feature plumbing at engine:919 and a
`decide()`-path depth argument should be added to the L1.F checklist or they will silently stay dead.
**Plan:** amend L1.F scope: pass `this.depth.get(symbol)` at both call-sites + add a test that a
non-zero depth snapshot moves the score. Trading-safety: touches the live decision pipeline → human PR sign-off (per AGENTS.md).

### 3.6 S2 — Renderer CSP allowlists aistudio.baidu.com unnecessarily
`index.html:13` includes `https://aistudio.baidu.com` in `connect-src`. The only ERNIE fetch
lives in the **main process** (`brain.ts:205`); the renderer never contacts Baidu (verified — only
the masked-key IPC, `SettingsModal.tsx:92-199`). CSP exists to bound a compromised renderer; an
XSS'd renderer currently has a sanctioned exfiltration endpoint. **Plan:** delete the entry. 5 min.

### 3.7 S2 — Theme-reactivity leaks: hardcoded colors that won't re-theme
The token system itself is strong (`--bb-*` primitives + aliases + `color-mix` softs + 4 themes,
`globals.css:8-160`). Leaks found:
- `ChartPanel.tsx:1030,1045` — double-top/bottom marker colors hardcoded `#ff4655`/`#21c97a` (with rgba twins), bypassing `readCssVar`.
- `ChartPanel.tsx:1382,1388` — legend swatches hardcoded.
- `SettingsModal.tsx:235-236` — uses **Tailwind palette** `#22c55e`/`#f5a623` instead of `--bb-pos`/`--bb-warn`; visibly off-brand next to `#21c97a` UI.
- `ChartPanel.tsx:544-547` — init-time candle colors hardcoded (likely re-themed later by the `candlestickColors` effect; verify, then route through `readCssVar` fallbacks like `:592-593` already does).
**Plan:** sweep to `readCssVar('--bb-…') || fallback` pattern, which the file already uses correctly elsewhere. ~2 h.

### 3.8 S3 — Stale documentation in `satex-app/CLAUDE.md` (two claims)
1. "lint + knip are local-only today" — **false**: `ci.yml` runs all four gates (lint step line ~40, knip step ~43).
2. "Still on `this.alpaca.*` directly (~30 sites: submitOrder/getAccount/cancelOrder…)" — **false**: zero such call-sites remain in `trading-engine.ts`; remaining `this.alpaca` uses are construction + crypto-WS lifecycle (documented as engine-owned). The facet migration it describes as "follow-up" appears complete.
CLAUDE.md is the agent-onboarding source of truth; stale invariants cause agents to "fix" the wrong things. **Plan:** 15-min doc PR.

### 3.9 S3 — Accessibility floor
3,517-line stylesheet: **1** `:focus-visible` rule, **0** `prefers-reduced-motion` blocks, ~51
`aria-` attributes concentrated in 10 of 40+ components. Keyboard support is actually good
(⌘K palette, ⌘1-5, hold-chord) but focus *indication* is nearly absent — a keyboard user can't
see where they are. **Plan:** global `:focus-visible` token ring (`--accent` outline), a
reduced-motion block disabling marquee/pulse animations, ARIA pass on Watchlist/Depth tables. ~4-6 h.

### 3.10 S3 — Misc verified observations
- `ChartPanel key={symbol}` (`App.tsx:248,260,277`) forces a full chart teardown/rebuild per symbol switch — measurable jank candidate; the perf canary rotates symbols, so promote its p95 as the guard, then trial removing the `key` in favor of `setData`. 
- `AutonomousTrader.cooldowns` map never prunes expired entries (bounded by watchlist size — cosmetic).
- `Brain.persist()` runs 8 sequential upserts per learn (fine at current volume; batch in a transaction when trade frequency grows).
- Engine god-object: 2,297 lines, ~17 owned services, 12 timers, ~30 listener Sets. All timers ARE cleared (`shutdown()`, `trading-engine.ts:657-669`) and wiring is disciplined — but every new feature pays the navigation tax. The old A2 decomposition (OrderLifecycle / LearningLoop / BroadcastHub / SessionLifecycle) remains the right target; do it AFTER L1.D-F land to avoid rebase pain on the in-flight program.

---

## 4. UI/UX deep review (design-priority section)

### 4.1 What is genuinely good (keep, and protect)
- **The Black Box shell** delivers the institutional dock the May audit asked for: persistent left watchlist rail, workspace-switched center, right depth/regime/exec rail, secondary blotter row, ticker tape. Click-cost to order entry is now ~0 (always-visible ExecTicket).
- **Kill-switch hold-to-arm** (2 s chord with progress bar, instant disarm, auto-repeat guard, release-cancels) is best-in-class risk-control UX — better than most real terminals.
- **Token architecture**: primitives → semantic aliases → `color-mix` derived softs; 4 themes via `data-theme`; charts re-theme live via `candlestickColors(readCssVar)` mapper shared by single + quad panes.
- **Empty/warmup states**: risk gates print "n/a · need ≥8 snapshots (3)" instead of fake-healthy zeros (`risk-gates.ts:301-303`); quad panes show "awaiting <symbol> data" instead of fabricated flat lines.
- **Perf discipline**: frame-budget canary with pinned percentile math (`perf.test.ts` in CI), long-frame console watcher in dev (`App.tsx:103`).

### 4.2 The gap between good and world-class (ranked for a design enthusiast)
1. **Type scale (the old audit's ghost).** 16 distinct hardcoded sizes (8→36 px) across ~277 declarations; exactly one `var(--font-base)` reference. The intended scale was even written down in the handoff (§15) and never shipped. This is THE highest-leverage polish item: define `--text-2xs…--text-xl` (8.5/10/11.5/12.5/14/18), mechanical find-replace to nearest step, and every future component snaps to rhythm automatically. ~6-8 h, zero behavioral risk.
2. **Height-responsive layout** (finding 3.2) — a fixed-stage terminal must degrade gracefully or clamp its own window minimums honestly.
3. **Density modes.** The handoff's Compact/Normal/Spacious (⌘⇧Z) proposal is still the right call and becomes nearly free once the type scale exists (override 6 tokens per mode).
4. **Theme leak sweep** (finding 3.7) — Mono and Bluyel themes are only as credible as their worst hardcoded hex.
5. **Accessibility floor** (finding 3.9) — focus rings + reduced-motion are table stakes for "world-class."
6. **Symbol-switch continuity** (finding 3.10) — chart remount flicker is the most *felt* polish defect in daily driving.
7. **v0.6 terminal-v3 mockups** exist at `docs/design/v0.6-terminal-v3/` (5 component files + standalone.html) — before building, screenshot-diff them against the live shell and fold items 1-5 above into that redesign rather than doing two passes.

---

## 5. Obsidian vault + docs hygiene (obsidian-review pass)

| Area | State | Finding |
|---|---|---|
| `Vault/Observer/` | **1,212 files**, May 20 → Jun 7, ~10-min cadence, growing | The #4 "checkpoint noise guard" fixed **Brain** snapshots (folder now empty) but Observer checkpoints still flood. At this rate: ~4,400 files/month. Plan: same guard (write only on material delta), plus a retention policy (keep hourly > 7 days, daily > 30 days) executed by `vault-writer`. |
| `Vault/00-INDEX.md` | stale | "Live system state" frozen at 2026-05-15; Observer count says 339 (actual 1,212); Sessions says 44 (actual 37); Brain "339 historical" (folder empty). The index is the vault's cold-open entry — stale numbers undermine trust in everything below them. Plan: make the "Live state" section explicitly generated-on-write by vault-writer, or delete the numbers and link the folders. |
| `Vault/Daily/` | abandoned | Wired 2026-05-15 with template + `/daily` skill; exactly **one note ever**. Either retire the convention from the index or have session-boot write the day's note automatically. |
| `Vault/Trades/`, `Vault/Tactics/` | 0 files each | "Populates when paper trading runs" — paper trading HAS run (sessions through June 3), so either the autonomous loop hasn't fired an entry in those sessions or the VaultWriter trade-outcome path isn't reached. Worth one diagnostic session: enable autonomous in simulator, confirm a `Trades/` note appears. This is the #1 prerequisite for the learning loop you want (§6) — a learning system with an empty outcomes journal isn't learning. |
| `Vault/Sessions/` | drift | Latest session note (20260603) has no `-close` pair; 37 files vs index's 44. Minor; fix when touching the index. |
| `C:\SATEX\` | **stale duplicate clone** | Full second copy of `01-SATEX-CORE` (own `.git`, own node_modules) untouched since May 10. High confusion risk for agents and humans ("which repo is real?") — mc4 is canonical (master @ PR #21). Plan: archive or delete after a `git -C C:\SATEX ... status` confirms nothing unique. |
| `mc4/docs/` | debris | `copy.md`, `copy-sync.md`, `emptyDir-sync.md`, `writeJson-sync.md` are vendored fs-extra docs sitting in the project docs root. Move under a `vendor/` subfolder or delete. |
| `satex-app/docs/` | **healthy** | Design docs, plans, specs, release checklists are current, cross-linked, and match the code they describe (verified for broker-session, data-feed switch, perf canary). This is the gold standard the vault index should be held to. |
| Git working tree | clean (apparent churn is mount artifact) | 154 "modified" files seen from the Linux side are pure CRLF/LF rendering of the mount — content-identical (verified by diff). Nothing to commit. |

---

## 6. The AI Brain — current truth + continuous-learning plan

### 6.1 What exists today (verified)
Four learning/intelligence layers, deliberately firewalled from each other:

| Layer | File | Learns from | Influences trades? |
|---|---|---|---|
| **Brain** (local) | `brain.ts` | SGD on realized P&L per closed trade, 7 features, clamp ±1.5, sample-floor 5 | **Yes** — bias/confidence gate autonomous entries |
| **Brain** (ERNIE 5.1) | `brain.ts:183-217` | nothing (stateless) | **No** — advisory rationale string only. Good safety property; keep it that way. |
| **PatternLearner** | `pattern-learner.ts` | online regression of (feature, regime) → 1-min forward return | No — observational by invariant |
| **Tactics** | `tactics.ts` | win-rate gate, meta-labeling style | Yes — pre-trade quality gate (Gate 8) |
| **Backtest stack** (L1.B/C, new) | `src/main/backtest/*`, `src/shared/backtest/*` | momentum / mean-reversion / breakout strategies, **regime-routed StrategyEnsemble**, vol-target sizing, slippage models, TCA, `compareReports` regression harness, headless CLI | Not yet — **L1.F wires ensemble into the autonomous trader** |

Safety walls verified intact: paper-only refusal (`autonomous-trader.ts:141-144`), kill-switch check (`:147-149`), 9-gate OM validator (`order-manager.ts:203-256`), replay block, dual-wall live interlock. The constitution's "no autonomous live capital" invariant holds in code, not just prose.

### 6.2 The honest gap vs. your "constantly learning, self-bettering brain"
The pieces exist but the **loop is not closed**: outcomes aren't journaling (Trades/ empty, §5), the observational learner double-counts (§3.3), confidence is never calibrated against results, and the strongest ML asset (the ensemble + regression harness) isn't wired to live decisions yet (L1.F).

### 6.3 Recommended program — "Close the Loop" (sequenced, builds on L1.D-F)
1. **L1.D, L1.E, L1.F as planned** (specs already written, commit rosters ready). L1.F is the single biggest step toward your goal: regime-routed ensemble replaces the single linear scorer. Add to L1.F scope: depth-feature plumbing (§3.5).
2. **Fix the learner cursor** (§3.3) — prerequisite for trusting any learned statistic.
3. **Outcome journaling diagnostic** — make `Vault/Trades/` actually populate; every closed trade writes the post-trade record (entry features, regime, slippage via existing TCA, what-worked). The schema in the project constitution §7.1 is the right shape and the EntryFeaturesValue struct (`trading-engine.ts:111-131`) already carries most fields.
4. **Calibration layer** (new, small): persist (confidence, outcome) pairs; compute rolling Brier score + a 10-bucket reliability curve; when the 0.8-bucket wins < 60%, auto-downgrade displayed confidence. This is the constitution's "no confidence inflation" rule, currently unimplemented (`confidenceOf = samples/40` is a sample-size proxy, not calibration — `brain.ts:181`).
5. **Nightly self-evaluation** (the "training" you asked for, without self-modification risk): scheduled headless run — `scripts/backtest.ts` over the last N days of recorded tape for all strategies + ensemble → `compareReports` vs locked baseline → markdown report into `Vault/Backtests/` → regression = red flag in SystemLogs panel. All components exist; this is ~a day of glue.
6. **Vol-target sizing port**: autonomous sizing is flat `notionalPct` (`autonomous-trader.ts:196-199`) while `backtest/sizing/vol-target.ts` already implements annualized-vol × Kelly-fraction sizing. Porting it live makes per-trade risk consistent across volatility regimes. Safety-perimeter change → human sign-off.
7. **Learning health UI** (ties to your design priority): one panel — weight drift sparklines, calibration curve, learner cycle error, last nightly backtest verdict. The AI must be *legible* to be trustworthy.

Guardrail to preserve throughout: the learning system tunes **signal quality and sizing inputs**, never risk limits — RISK gates stay read-only to the brain (already architecturally true; keep it).

---

## 7. Priority matrix (everything above, one list)

| # | Item | Sev | Effort | Safety sign-off? |
|---|---|---|---|---|
| 1 | ERNIE timeout (§3.1) | S1 | 20 min | no |
| 2 | ExecTicket min-height clip (§3.2) | S1 | 2-4 h | no |
| 3 | PatternLearner cursor (§3.3) | S1 | 2-3 h | no |
| 4 | CSP baidu removal (§3.6) | S2 | 5 min | no |
| 5 | CLAUDE.md staleness (§3.8) | S3 | 15 min | no |
| 6 | Type scale tokens (§4.2.1) | S2 | 6-8 h | no |
| 7 | Theme leak sweep (§3.7) | S2 | 2 h | no |
| 8 | Correlation on returns (§3.4) | S2 | 2 h | no |
| 9 | L1.D funded compliance | program | per spec | **yes** |
| 10 | L1.E payout rules | program | per spec | yes |
| 11 | L1.F ensemble wiring + depth plumbing (§3.5) | program | per spec +2 h | **yes** |
| 12 | Trades/ journaling diagnostic (§6.3.3) | S2 | half day | no |
| 13 | Calibration layer (§6.3.4) | S2 | 1-2 days | no |
| 14 | Nightly backtest regression (§6.3.5) | S2 | 1 day | no |
| 15 | Vol-target sizing live (§6.3.6) | S2 | 1 day | **yes** |
| 16 | A11y floor (§3.9) | S3 | 4-6 h | no |
| 17 | Density modes (§4.2.3) | S3 | 6-8 h | no |
| 18 | Vault Observer retention + index regen (§5) | S3 | 2-3 h | no |
| 19 | C:\SATEX archive, docs debris (§5) | S3 | 30 min | no |
| 20 | Engine decomposition A2 (after L1.F) | S3 | 2-3 days | partial |
| 21 | Code-signing cert purchase | blocker | external/human | n/a |

Suggested first session: items 1+4+5 (under an hour, three real defects), then 2-3, then the type-scale pass — that sequence clears every S1 and the top design item inside ~two working days.

---

## 8. Verification appendix — what was and wasn't verified

**Verified by execution:** all four gates (exit codes + counts above), npm install reproducibility, knip Node-20 behavior.
**Verified by reading code (file:line cited inline):** every finding in §2-§6.
**Not verifiable in this session:** visual rendering (Electron GUI can't run in the Linux sandbox — the ExecTicket clip in §3.2 is proven from grid arithmetic and should be confirmed by resizing the window to 1200×720 on your machine); Windows-specific paths (safeStorage DPAPI, NSIS packaging); live Alpaca behavior. "Verify absolutely every character" was interpreted as: every *claim in this report* traces to a read file or an executed command — no inherited assertions from prior audits were trusted (three were found false and are corrected in §2/§3.8).
