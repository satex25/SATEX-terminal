# SATEX — MASTER EXECUTION PLAN ("The Holy List") — 2026-06-14

> **Authored via `/ultraplan`** (7-layer Structured Cognitive Decomposition), synthesizing
> every open conversation, the Problem Ledger, the 2026-06-10 full-system audit, the Topstep
> program spec, the EOL-corruption sub-plan, and the live repo state.
> **Branch:** `feat/audit-psd-batch-2026-06-11` @ `461f4b0` · **Master:** `1be1ac6` (post-L1.C, PR #21).
> **Operator decisions locked (2026-06-14):** frog = **L1.D**; **PR #22 merges today**; plan lives in **repo spec + Obsidian cockpit**.
> **Status:** EXECUTION-READY. Phase 0 is cleared-for-action now; Phase 1 (the frog) starts the moment master is clean.

---

## 0. The reconciled landscape (one glance)

| Dimension | Verified state (2026-06-14) | Source |
|---|---|---|
| Active branch | `feat/audit-psd-batch-2026-06-11` @ `461f4b0`, 6 commits ahead of master | `git log` |
| PR #22 | OPEN — audit batch + P-013 + second-brain layer; awaiting **operator risk-gates sign-off + merge** | github-state |
| Working tree | 138 "changed" = **134 phantom CRLF** + **4 real content diffs** (`CHANGELOG.md`, `package.json`, `format.ts`, `PROBLEM-LEDGER.md`) | `git diff --ignore-cr-at-eol` |
| Untracked | `satex-app/{AGENTS,LICENSE,README}.md`, `format.test.ts`, this plan, `docs/vendor/` | `git status` |
| P-019 (fmt.k float-noise) | SHIPPED, **unstaged**; 4 gates green in /tmp clone (**684 tests / 63 files**) | ledger |
| Gate baseline (committed) | **669/669 across 62 files**, typecheck 0, lint 0, knip 0 (Node-20 shim) | ledger |
| Ladder position | L1.A–C ✅ merged (PR #21) → **L1.D is next program work** | program spec §5 |
| L1.D raw material | `feat/topstep-50k-compliance` @ `67ecf24`, **10 commits `d841d9a`→`67ecf24`** (verified present) | `git log` |
| Facet migration | **COMPLETE** — 0 direct `this.alpaca` order/account calls in engine | `git grep` |
| GitHub | 5 open PRs / 15 closed · 9 merged remote branches deletable · master **unprotected** · **2FA deadline ~2026-07-11** · Authenticode cert = issue #2 | github-state |
| Terminal v3 brief | `SATEX-CLAUDE-DESIGN-PROMPT.md` ready to hand to Claude Design ("Black Box Evolved") | session |
| Standing agent | `satex-psd-daily` runs **daily 05:05** local | scheduled-tasks |

**Phase trading-safety map** (per `AGENTS.md` + constitution §12): Phases 0, 4(partial), 5, 8 and the entire Operator Track are **off** the live-capital perimeter. Phases **1 (L1.D), 2 (L1.E), 3 (L1.F), 6 (L1.G)** and the vol-target port in Phase 4 are **on** it → **explicit human PR sign-off required, CI-green necessary but not sufficient.**

---

## 1. Eat-the-frog ordering — deterministic, not preferential

The anchor was chosen against fixed criteria, not taste (operator methodology, 2026-06-14):

| Criterion | **L1.D Compliance** | P-012 Decomp | Terminal v3 | P-007 Copilot |
|---|---|---|---|---|
| Existential risk if deferred | 🔴 systemic (funding/compliance gate) | 🟡 arch debt | 🟢 UI velocity | 🟢 feature velocity |
| Blocks PR #22 sign-off downstream value | ✅ unlocks ALL deployment | ❌ | ❌ | ❌ |
| Reversibility if delayed | ❌ non-reversible (audit windows close) | ✅ | ✅ | ✅ |
| Conflict cost mid-program | rebase now while surface is small | 🔴 highest after L1.D-F | low | low |

**Verdict: L1.D is the frog.** It is the densest concentration of enforcement logic in the program, carries the highest trading-safety blast radius, and every hour it waits the rebase surface against the now-migrated broker session grows. Everything else is a conditional dependent of it landing clean.

---

## PHASE 0 — CLEAR THE RUNWAY (precondition for the frog)

**Objective.** Return master to a clean, legible, all-gates-green tip with PR #22 merged, so L1.D rebases onto solid ground. **Blast radius: NONE** (git hygiene + config/docs only).
**Confidence: 0.9.** **Effort: ~30–60 min Claude + operator merge click.**

| # | Task | Method | Done-when |
|---|---|---|---|
| 0.1 | **EOL working-tree cleanup** | `git restore` the 134 EOL-only files (excludes the 4 real diffs); add `.gitattributes` `* text=auto eol=lf` to stop recurrence (per `2026-06-13-worktree-eol-corruption-ultraplan.md` T2/T3) | `git diff --name-only` drops 138 → real diffs only |
| 0.2 | **Stage P-019** | Add `format.ts` + new `format.test.ts`; decide fold-into-#22 vs follow-up commit (recommend: fold, single Unreleased CHANGELOG line) | P-019 tracked, not orphaned |
| 0.3 | **Final 4-gate verification** | Fresh `/tmp` clone @ tip, `npm install --ignore-scripts` + electron shim + Node-20 shim; run typecheck/lint/vitest/knip; report **real exit codes + counts** | All four exit 0; **≥ 684 tests** |
| 0.4 | **PR #22 finalize + merge** | Confirm PR body matches the 6 commits; operator gives **risk-gates sign-off** (commit `a27dbcf` touches `getAiDecision`); `gh pr merge --merge` | Head SHA in `master`; CI green |
| 0.5 | **Post-merge hygiene** | Delete the 9 git-verified merged remote branches; one-time operator `.git` litter cleanup (P-018: `index.lock.stale*`, `index.corrupt-*`, `claude-probe`) | `git branch -r` clean; no lock litter |

**Gate to Phase 1:** master tip is the new clean base, four gates green, working tree empty.

---

## PHASE 1 — 🐸 THE FROG · L1.D Funded-Account Compliance (Topstep $50K XFA)

**Objective.** Land the Topstep $50K XFA funded-account rule engine: profile selectable in the simulator, all funded gates enforced and unit-tested, a multi-day deterministic simulator integration test green, 5 new risk gauges rendering. **This is the program's compliance spine.**
**Trading-safety: ON perimeter — explicit human PR sign-off required.** **Confidence: 0.72** (rebase conflict surface is the unknown). **Effort: ~1–2 focused days.**

### 1.1 PRE-CONDITION CHECK (operator methodology — must all pass before T-work)

```
├── L1.D artifacts exist            → ✅ feat/topstep-50k-compliance @ 67ecf24, 10 commits verified
├── Precondition "L1.B merged"      → ✅ satisfied (L1.A–C merged via PR #21 = master 1be1ac6)
├── Funding/dependency chain (#22)  → Phase 0 must complete first (clean base)
├── No stale spec assumptions       → spec built when engine used this.alpaca.* directly;
│                                       facet migration now COMPLETE → inline migration REQUIRED
└── Audit trail intact              → ledger P-009 (depth) folds to L1.F, NOT L1.D — keep separate
FAILURE INTERPRETATION:
├── Incomplete traceability  → HALT; do not open the L1.D PR
├── Rebase semantic break    → split commit into "preserve original" + "facet migration"
└── Multi-day test red       → treat as P-0 incident; do not request sign-off
```

### 1.2 Scope decomposition (the 10-commit roster + its conflict surface)

| Commit | Deliverable | New file? | Conflict risk vs current master |
|---|---|---|---|
| `d841d9a` | `FundedAccountProfile` + Topstep $50K XFA preset | new | 🟢 low |
| `f73530c` | `EquityHWMService` — trailing MaxDD + Topstep lock semantics | new | 🟢 low |
| `e40ae0d` | news-blackout pure fn + `MacroCalendarService.isNewsBlackout()` | **method add** | 🟡 `macro-calendar.ts` already on branch — reconcile |
| `e830d97` | `EodFlattenService` — IANA-tz-aware EOD cancel + flatten | new | 🟢 low |
| `051d4fe` | pure `maxContracts` + `allowedAssetClass` checks | new | 🟢 low |
| `5046375` | `FundedAccountStore` — atomic JSON + sanitization | new | 🟢 low |
| `bbc139f` | `FundedAccountService` — orchestrator + renderer snapshot | new | 🟢 low |
| `455855b` | `OrderManager` gates 9–13 + `cancelAll`/`flattenAll` | **OM edit** | 🔴 high — OM refactored under broker session |
| `e645029` | `RiskGatesService` display gates — 5 new gauges | edit | 🟡 `risk-gates.ts` changed by P-010 (returns-correlation) |
| `67ecf24` | wire `FundedAccountService` into engine + IPC + preload | **engine edit** | 🔴 high — engine now talks to `this.session.*`, not `this.alpaca.*` |

### 1.3 Task tree

- **T1 — Stage the rebase.** New `feat/l1d-funded-compliance` off clean master; cherry-pick/rebase `d841d9a`→`67ecf24` one commit at a time, gates green at each tip (per program spec §7 #4).
- **T2 — Migrate the two hot commits inline.** In `455855b` and `67ecf24`, rewrite every `this.alpaca.submitOrder/cancelOrder/getAccount` to the `this.session.router.*` / `this.session.account.*` facet; `cancelAll`/`flattenAll` route through `OrderRouter`. Reflect in commit reword.
- **T3 — Reconcile `MacroCalendarService`.** Fold `isNewsBlackout()` into the existing `macro-calendar.ts` rather than re-adding the file.
- **T4 — Reconcile `RiskGatesService`.** Add display gates 9–13 alongside the P-010 returns-correlation gate without regressing it.
- **T5 — Renderer hookup.** 5 new gauges (per-trade 1% / daily 2% / trailing-DD / max-contracts / asset-class) via the canonical single-source gate pattern (no inline call-site logic).
- **T6 — Unit tests, every gate.** HWM lock, EOD flatten (tz-aware), news blackout, max-contracts, asset-class, store atomicity/sanitization.
- **T7 — Multi-day simulator integration test.** Deterministic seeded sim (`SATEX_SIMULATOR_24_7=true`), accelerated clock, wall-clock < 2 min; asserts the funded contract end-to-end. Run nightly, not per-PR.
- **T8 — VERIFY + PR.** Four gates green (real counts), integration test green, gauges visually confirmed; open PR; **request operator sign-off**.

### 1.4 Validation criteria / DoD

1. Topstep $50K XFA `FundedAccountProfile` selectable in simulator.
2. Multi-day deterministic integration test asserts HWM/lock/EOD/news/max-contracts/asset-class — **green**.
3. 5 gauges render from canonical gates (no duplicated inline logic).
4. Four gates green on the PR tip; real exit codes + counts reported (baseline to beat: 684/63).
5. `git grep "this.alpaca."` still returns only `live-market.ts` (invariant preserved).
6. Operator sign-off recorded before merge.

### 1.5 Recovery

`Rollback to last compliant tag → re-run compliance validation suite → re-queue L1.D as P-0 with explicit owner.` No partial-funded state ships to master.

---

## PHASE 2 — L1.E · D-2 Payout Rules (conditional on L1.D)

**Objective.** `DailyPnlLedger` per-day P&L accumulation with timezone-aware day boundaries; payout-phase state machine visible in renderer when in funded phase.
**Pre:** L1.D merged. **Trading-safety: ON.** **Effort: ~0.5 day** (3 commits `9550df9`→`0cf5143`). **Confidence: 0.8.**
**Synergy:** the `DailyPnlLedger` day-boundary work pairs naturally with **P-013** (outcome journaling) — sequence them together so the per-day ledger and the per-trade journal land in one mental model.

---

## PHASE 3 — L1.F · Ensemble Wiring + P-009 Depth Plumbing (conditional on L1.C✅ + L1.E)

**Objective.** `autonomous-trader` consumes the regime-routed `StrategyEnsemble` instead of the single linear scorer — **the single biggest step toward the "constantly-learning brain."**
**Plus P-009 (audit §3.5):** pass `this.depth.get(symbol)` at `trading-engine.ts` learning-capture (~:919) **and** the `decide()` path, with a test that a non-zero depth snapshot moves the score — otherwise `depth_imbalance`/`microprice_dev` stay silently dead.
**Pre:** L1.C provides the ensemble (✅ merged); L1.E provides the funded test fixture. **Trading-safety: ON.** **Effort: ~0.5–1 day** (commit `95a4217` + depth plumbing). **Confidence: 0.75.**

---

## PHASE 4 — Close the Loop (AI brain legibility) — partially parallelizable

The audit's "Close the Loop" program (§6.3). Calibration, nightly self-eval, and LEARNINGS notes already shipped (P-000/P-008a). What remains:

| # | Item | Perimeter | Notes |
|---|---|---|---|
| 4.1 | **P-013 outcome-journaling diagnostic** | off | Operator runs autonomous-in-sim; watch for `Trades/` note + `learning hook fired`. Leading hypothesis: no close ever flowed through `recordTradeClose`. The `trade close not journaled` warn now disambiguates. Close with the pinned test. |
| 4.2 | **Vol-target sizing port** | **ON** | Replace flat `notionalPct` with the existing `backtest/sizing/vol-target.ts` (annualized-vol × Kelly). Human sign-off. |
| 4.3 | **Learning-health UI panel** | off | One panel: weight-drift sparklines, calibration curve, learner cycle error, last nightly-backtest verdict. Makes the brain legible → trustworthy. Folds into Terminal v3 (Phase 5). |
| 4.4 | **Calibration verification** | off | Confirm the downgrade-only Brier path actually fires against recorded (confidence, outcome) pairs. |

**Confidence: 0.7.** **Effort: 4.1 ~minutes (operator) + test; 4.2 ~0.5 day; 4.3 with Phase 5.**

---

## PHASE 5 — Terminal v3 UI/UX Overhaul ("Black Box Evolved")

**Objective.** Execute the full terminal redesign. The brief (`SATEX-CLAUDE-DESIGN-PROMPT.md`) is ready to hand to Claude Design; the engineering frog is the **transfer-back**, not the design.
**Blast radius: renderer only — off the live-capital perimeter** (but `FeedSwitch`/`ExecTicket` ceremony is safety-critical UX). **Confidence: 0.65.** **Effort: multi-day.**

- **5.1** Hand the brief to Claude Design → receive `tokens.css`-first output.
- **5.2** Land `tokens.css` as a diff against `globals.css` (extends `--bb-*`, locked 9-step type scale, zero border-radius).
- **5.3** Component-for-component translation against the named inventory (PanelHead first — most-repeated primitive).
- **5.4** Fold in the deferred polish so it's one pass, not two: **P-011** inline-`fontSize` sweep → `var(--text-*)`; **density modes** (Compact/Spacious token overrides); **accessibility floor** (focus rings present per P-003 — extend ARIA on Watchlist/Depth tables); **symbol-switch continuity** (trial removing `ChartPanel key={symbol}`, guard with the perf p95 canary).
- **5.5** Renderer perf canary green post-redesign (`SATEX_E2E_PERF=1`, p50 ≤ 16 ms).

---

## PHASE 6 — L1.G · Tradovate Broker Adapter (conditional on L1.F)

Second broker concrete on the `@shared/broker/` facets (`OrderRouter`/`MarketDataSource`/`AccountSyncer`/`SymbolResolver`) + `TradovateBrokerSession.create()`, built against a fake wire-protocol harness — **no live wiring crossed**. Needs its own design doc at start (Tradovate REST + WS mapping). **Trading-safety: ON** (new order-routing surface). **Effort: multi-day.** **Confidence: 0.6.**

---

## PHASE 7 — P-007 · Copilot Chat Window (operator-requested feature)

Second `BrowserWindow` with its own renderer entry + IPC trade feed + `llm.ts` Q&A over account state. **Advisory-only wall: chat can never route an order.** OPEN, design-ready, no external gate — but **sized too large to batch**; it earns its own `/ultraplan` pass before code. **Blast radius: new window + IPC, advisory only.** **Effort: multi-day.** **Confidence: 0.6.**

---

## PHASE 8 — P-012 · Engine Decomposition (deferred until L1.D–F land)

Break the 2,297-line `trading-engine.ts` god-object into `OrderLifecycle` / `LearningLoop` / `BroadcastHub` / `SessionLifecycle`. **Correctly sequenced LAST of the engineering frogs** — doing it mid-program multiplies rebase conflicts across the in-flight cascade. **Off perimeter** (refactor, behavior-preserving + tests). **Effort: multi-day.** **Confidence: 0.55.**

---

## OPERATOR PARALLEL TRACK (runs alongside everything — mostly your hands, not Claude's)

| Item | Type | Urgency | Action |
|---|---|---|---|
| **2FA enforcement** | account | 🔴 deadline **~2026-07-11**, account restricted after | Enable 2FA on `satex25` GitHub now-ish |
| **Authenticode cert (L2.A–F, issue #2)** | procurement | external 3–15 biz-day wait → start ASAP | Pick EV-vs-OV CA (rec: EV Sectigo) → submit CSR (`certs/satex-codesign.csr`) → on arrival `CSC_LINK`+`CSC_KEY_PASSWORD` → `npm run pack:win` signs with zero code change |
| **PR triage** | repo | low | #13/#14/#16 = L1.D groundwork (keep, consumed by Phase 1); #11 = operator call |
| **P-014 retros recovery** | data | low | Only you know if a OneDrive/backup copy of the 5 vanished `Vault/Manual/` retros exists |
| **P-020 rulings** | taste | low | (1) clock label "CST" vs fixed UTC−6 (reads 1h off in DST); (2) money sign-glyph (Unicode `−` loss vs ASCII `+` gain) — both deliberate-looking, your call |
| **P-017 fs-extra husks** | docs | low | Re-fetch the 4 zero-byte vendor docs when next needed (excluded from history) |
| **C:\SATEX stale clone** | hygiene | low | Confirm nothing unique, then archive/delete — mc4 is canonical |
| **Vault Observer flood** | hygiene | low | Observer checkpoints grow ~4,400/mo; add write-on-material-delta + retention; refresh stale `00-INDEX.md` |
| **Master branch protection** | repo | med | master is unprotected — consider a require-CI rule before more contributors |

---

## DEPENDENCY DAG (critical path)

```
PHASE 0 (clean + merge #22) ─────────────────────────────────┐
        │                                                     │
        ▼                                                     ▼
  🐸 PHASE 1 (L1.D) ──▶ PHASE 2 (L1.E) ──▶ PHASE 3 (L1.F) ──▶ PHASE 6 (L1.G) ──▶ RC tag / signed installer
        │                    │                  │                                  ▲
        │                    └── P-013 (4.1) ───┘                                  │
        │                                                                  OPERATOR TRACK: cert (L2) ┘
        ▼ (off-perimeter, parallel once Phase 0 done)
  PHASE 4 (4.2 sign-off-gated) · PHASE 5 (Terminal v3 + 4.3) · PHASE 7 (P-007) · PHASE 8 (P-012, after 1–3 land)
```

- **Sequential spine (on-perimeter):** 0 → 1 → 2 → 3 → 6 → convergence. Each requires human sign-off.
- **Parallel (off-perimeter):** Phases 4 (sans 4.2), 5, 7 can proceed once Phase 0 lands; Phase 8 waits for 1–3.
- **Operator track** runs wall-clock-parallel; cert wait dominates the installer critical path.

---

## TODAY'S CUT LINE (what we actually do now)

1. **Phase 0 in full** — EOL cleanup, stage P-019, green gates, finalize PR #22 → **your sign-off + merge.** (Claude executes 0.1–0.3, 0.5; you do 0.4.)
2. **Begin Phase 1 (the frog)** — stand up `feat/l1d-funded-compliance`, run T1 (staged rebase) and T2 (inline facet migration of the two hot commits), gates green at each tip. Realistic first-day target: roster rebased + migrated + unit tests (T1–T6); the multi-day integration test (T7) and PR (T8) follow.
3. **Off-perimeter parallel, if capacity:** kick the Claude Design hand-off (Phase 5.1) and the P-013 diagnostic (Phase 4.1) — neither blocks the frog and both have long lead times.

Everything below the cut line is queued and conditional. We do not open the L1.D PR until its DoD (§1.4) is fully met and you have eyes on it.

---

## RISK AUDIT (self-adversarial — constitution §8.2)

**CRITIC pass.**
- *Phase 0 EOL restore destroys a real edit?* Mitigated — the 4 content diffs are explicitly excluded; `--ignore-cr-at-eol` proves the other 134 are byte-identical-mod-EOL.
- *L1.D rebase silently regresses the broker-session invariant?* Guarded by the §1.4 `git grep "this.alpaca."` check + per-commit gates; the two hot commits get inline migration, not blind cherry-pick.
- *P-009 stays dead because L1.F "only wires the ensemble"?* Explicitly added to Phase 3 scope with a depth-moves-the-score test.
- *Profit pressure leaks into sequencing?* No. Ordering is by compliance/reversibility/conflict-cost, never expected P&L (constitution §1.2: profit is P5).

**RISK-AGENT verdict.** This plan proposes **no** trade, **no** >1% risk, **no** live-capital action, **no** risk-param self-modification, **no** safety-layer bypass. On-perimeter phases (1/2/3/6 + 4.2) are gated on **explicit human PR sign-off**, CI-green necessary but not sufficient. Paper-only invariant preserved. **APPROVED — no veto condition present.**

**AUDIT-AGENT.** Every commit SHA, count, and branch state above is quoted from real `git`/ledger output captured 2026-06-14, not asserted. **CRITIC_PASS** once Phase 0 T0.3 reports real gate numbers on the merged tip.

---

## ACCEPTANCE & SIGN-OFF LOG

| Decision | Owner | State |
|---|---|---|
| Frog = L1.D | operator | ✅ locked 2026-06-14 |
| PR #22 merges today | operator | ✅ locked — **sign-off pending at T0.4** |
| Plan home = repo spec + Obsidian cockpit | operator | ✅ locked |
| L1.D PR merge | operator | ⏳ pending DoD §1.4 + sign-off |
| L1.E / L1.F / L1.G / vol-target merges | operator | ⏳ each requires sign-off |
| Cert CA choice (EV vs OV) | operator | ⏳ before L2.B |

— END MASTER PLAN · v1.0 · 2026-06-14 —
