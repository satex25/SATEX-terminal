# L1.B — Forward-Test Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the 14-commit "forward-test foundation" stack (slippage models + short-side enablement + backtest framework with headless CLI) on post-L1.A `master` by cherry-picking each commit individually, resolving conflicts inline where L1.A's changes overlap, with all four gates green at every commit tip.

**Architecture:** Cherry-pick each commit from `origin/feat/tier-2-alpha-depth` in chronological order (b90774a → e251681, 14 commits). Two commits have known conflict surface against L1.A — `a429a4e` (wires `SlippageModel` into `OrderManager` constructor + trading-engine simulator submit path) and `4701ac6` (enables short-side in `autonomous-trader.ts`). Other 12 commits add new files in `src/shared/backtest/` + `src/main/backtest/` + `scripts/` — clean apply expected. Plan defaults to cherry-pick over rebase because it makes per-commit gate verification cheap and conflict resolution localized.

**Tech Stack:** TypeScript 5.x · Electron · Vitest · ESLint · Knip · vitest CLI for the backtest CLI script.

**Trading-safety perimeter:** This plan touches `OrderManager` constructor, trading-engine's simulator-submit path, and `autonomous-trader.ts`. Per `AGENTS.md`, the closing PR **requires explicit human sign-off**. No autonomous merge. Every cherry-pick commit must pass pre-commit (typecheck + lint). The closing PR must pass all four gates (typecheck + lint + test + knip).

---

## Spec reference

- Program spec: `docs/superpowers/specs/2026-06-02-topstep-eval-capable-program-design.md` §5.1 L1.B
- L1.A program PR: #19 (must be merged before L1.B starts)
- Source stack: `origin/feat/tier-2-alpha-depth` — the cascaded 39-commit branch; L1.B covers the first 14
- Original L1.B plan doc landed on the source stack at `b90774a`: `feat/tier-2-alpha-depth` → `docs/superpowers/plans/2026-05-29-forward-test-foundation.md` (cherry-pick brings this doc along too)

## L1.B commit roster (chronological, from `origin/feat/tier-2-alpha-depth`)

| # | SHA | Summary | Conflict risk | New files |
|---|---|---|---|---|
| 1 | `b90774a` | docs(plans): forward-test foundation plan (Phases A + B) | None | `docs/superpowers/plans/2026-05-29-forward-test-foundation.md` |
| 2 | `6c106a1` | feat(backtest): SlippageModel interface + ZeroSlippageModel | None | `src/main/backtest/slippage-model.ts` |
| 3 | `3c21e36` | feat(backtest): FixedBpsSlippageModel + tests | None | `slippage-model.test.ts` |
| 4 | `d36068a` | feat(backtest): SpreadHalfPlusImpactModel (sqrt-law) | None | (extends `slippage-model.ts` + test) |
| 5 | `a429a4e` | feat(backtest): wire SlippageModel into OrderManager simulator | **HIGH** — OM constructor + trading-engine simulator branch | none (modifies `order-manager.ts` + `trading-engine.ts`) |
| 6 | `4701ac6` | feat(autonomous): enable short side with mirror bracket math | **MEDIUM** — autonomous-trader.ts:206-219; L1.A renamed `syncAlpacaAccount` references in this file | none (modifies `autonomous-trader.ts`) |
| 7 | `c5ab675` | docs(plans): append Phase C plan | None | doc append |
| 8 | `fd184e0` | feat(backtest): BacktestReport / EquityPoint / Metrics types | None | `src/shared/backtest/types.ts` |
| 9 | `7da525f` | feat(backtest): pure metrics lib (Sharpe/Sortino/Calmar/MaxDD/PF/expectancy) | None | `src/shared/backtest/metrics.ts` + test |
| 10 | `b28751c` | feat(backtest): Strategy interface + StrategySnapshot | None | `src/main/backtest/strategy.ts` |
| 11 | `e6bdb78` | feat(backtest): BrainStrategy wrapper | Low — references `Strategy` from #10 | `src/main/backtest/brain-strategy.ts` + test |
| 12 | `e176022` | feat(backtest): BacktestRunner with intra-bar bracket resolution | None | `src/main/backtest/runner.ts` + test |
| 13 | `d74ddad` | feat(backtest): reporter (console + markdown + JSON) | None | `src/main/backtest/reporter.ts` + test |
| 14 | `e251681` | feat(backtest): headless CLI + canned fixture + integration test | **LOW** — modifies `package.json` (adds deps + script) + `tsconfig.json` | `scripts/backtest.ts` + `scripts/backtest.test.ts` + `scripts/fixtures/tiny-tape.json` (1042 lines) |

## Strategy decision

**Use `git cherry-pick` one commit at a time, NOT `git rebase --onto`.** Justification:
1. Per-commit gate verification — each cherry-pick produces a known SHA; gates run at that tip prove the migration didn't break anything.
2. Conflict isolation — `a429a4e` conflict is resolved in one focused pass without other unrelated commits in the way.
3. Clear commit history on the new branch — every commit retains its original message + author trailer.

---

## Pre-flight: verify base state

### Task 0.1 — Confirm L1.A merged

- [ ] **Step 0.1.1:** Verify L1.A is on `master`.

```bash
git fetch origin
git log --oneline origin/master -10 | grep -iE "L1\.A|broker-port completion"
```

Expected: a merge commit referencing L1.A / PR #19. If absent, **STOP — L1.B blocks on L1.A.**

- [ ] **Step 0.1.2:** Sync local master.

```bash
git checkout master
git pull --ff-only
```

- [ ] **Step 0.1.3:** Confirm four gates green at master tip.

```bash
cd 00-PROJECT-ROOT/01-SATEX-CORE/satex-app
npm install  # in case L1.A merge added/removed deps
npm run typecheck
npm run lint
npm test
npm run knip
```

All must pass. Capture the test count baseline (should be 463 after the L1.A onOrderEvent smoke test landed; may differ slightly if any follow-ups merged with L1.A).

### Task 0.2 — Create the L1.B work branch

- [ ] **Step 0.2.1:** Branch off post-L1.A master.

```bash
git checkout -b feat/l1b-forward-test-foundation master
git log --oneline -1
```

Expected: HEAD on a fresh branch, tip = master tip.

### Task 0.3 — Lock the L1.B source SHAs

- [ ] **Step 0.3.1:** Pin the source commits in this plan by SHA so a force-push on the source branch can't silently change what we cherry-pick.

```bash
git rev-parse origin/feat/tier-2-alpha-depth~25  # should match b90774a (1st L1.B commit)
git rev-parse origin/feat/tier-2-alpha-depth~24  # should match 6c106a1
# ... if any mismatch, surface and re-derive the SHA list
```

If any SHA in the L1.B roster table (above) doesn't match what `git log origin/feat/tier-2-alpha-depth | tac | head -14` returns, **STOP and re-derive the SHA list.** The plan's SHAs are 2026-06-02 verified; if the source has moved, the plan's commits and conflict assessment may be stale.

- [ ] **Step 0.3.2:** Record current state.

```bash
git rev-parse HEAD > /tmp/l1b-base.sha
echo "L1.B base: $(cat /tmp/l1b-base.sha)"
```

(On Windows PowerShell: `git rev-parse HEAD | Out-File -Encoding ascii /tmp/l1b-base.sha`. Or skip — it's a convenience marker.)

---

## Phase 1 — Slippage models (Tasks 1.1 through 1.4, clean cherry-picks expected)

### Task 1.1 — Cherry-pick the plan doc

**Source commit:** `b90774a`
**Conflict risk:** None (doc-only)

- [ ] **Step 1.1.1:** Cherry-pick.

```bash
git cherry-pick b90774a
```

Expected: clean apply. The plan doc lands at `00-PROJECT-ROOT/01-SATEX-CORE/satex-app/docs/superpowers/plans/2026-05-29-forward-test-foundation.md`. Pre-commit gates run automatically and pass (doc-only).

- [ ] **Step 1.1.2:** Verify branch tip.

```bash
git log --oneline -1
# Expected: "docs(plans): forward-test foundation implementation plan (Phases A + B)"
```

### Task 1.2 — Cherry-pick SlippageModel interface + ZeroSlippageModel

**Source commit:** `6c106a1`
**Files:** Adds `src/main/backtest/slippage-model.ts` (43 lines)
**Conflict risk:** None — new file in a new directory

- [ ] **Step 1.2.1:**

```bash
git cherry-pick 6c106a1
```

- [ ] **Step 1.2.2:** Verify.

```bash
ls 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/backtest/
# Expected: slippage-model.ts
```

### Task 1.3 — Cherry-pick FixedBpsSlippageModel

**Source commit:** `3c21e36`
**Files:** Extends `slippage-model.ts` (+15 lines); adds `slippage-model.test.ts` (66 lines)
**Conflict risk:** None — adding to file that only contains commit 1.2's additions

- [ ] **Step 1.3.1:**

```bash
git cherry-pick 3c21e36
```

- [ ] **Step 1.3.2:** Confirm new tests pass.

```bash
cd 00-PROJECT-ROOT/01-SATEX-CORE/satex-app
npx vitest run src/main/backtest/slippage-model.test.ts
```

Expected: pass (some number of new FixedBps tests).

### Task 1.4 — Cherry-pick SpreadHalfPlusImpactModel (sqrt-law)

**Source commit:** `d36068a`
**Files:** Extends `slippage-model.ts` (+34 lines); extends test (+40 lines)
**Conflict risk:** None

- [ ] **Step 1.4.1:**

```bash
git cherry-pick d36068a
```

- [ ] **Step 1.4.2:** Verify.

```bash
npx vitest run src/main/backtest/slippage-model.test.ts
```

Expected: all slippage-model tests pass (Zero + FixedBps + sqrt-law).

---

## Phase 2 — Wire SlippageModel into OrderManager simulator path (HIGH conflict task)

### Task 2.1 — Cherry-pick the OM + trading-engine wire commit

**Source commit:** `a429a4e`
**Files:**
- Modify: `src/main/services/order-manager.ts` (adds optional SlippageModel constructor parameter + `getSlippageModel()` getter)
- Modify: `src/main/core/trading-engine.ts` (simulator-branch submit routes through `om.getSlippageModel().fill(req, { quote })`)
- Test: `src/main/services/order-manager.test.ts` (+4 tests for injection / getter / identity / resetToPaper preservation)

**Conflict expectation:** **HIGH on `trading-engine.ts`.** L1.A Task 2.3 modified the submit method around lines 919-935 (the live branch). The simulator branch starts around line 937 in post-L1.A. The original `a429a4e` modifies the simulator branch — and that branch may have shifted lines + restructured slightly post-L1.A.

**`order-manager.ts` conflict expectation:** **LOW.** L1.A modified `syncFromSnapshot` + deleted `syncFromAlpaca`. `a429a4e` modifies the constructor + adds a getter. Different methods; cherry-pick should apply with at most a line-number drift.

#### Step 2.1.1 — Cherry-pick (attempt)

```bash
git cherry-pick a429a4e
```

**Three possible outcomes:**

- **A. Clean apply.** Skip to Step 2.1.4.
- **B. Conflict on `trading-engine.ts` simulator branch.** Continue to Step 2.1.2.
- **C. Conflict on `order-manager.ts`.** Continue to Step 2.1.3.

(B and C are not mutually exclusive — may need both.)

#### Step 2.1.2 — Resolve `trading-engine.ts` simulator-branch conflict

If conflicted:

```bash
git status  # see which files are unmerged
```

Read `<<<<<<<` markers in `trading-engine.ts`. The intent of the patch:

```typescript
// In the simulator branch of submitOrder (was around L937 in pre-L1.A,
// may have shifted in post-L1.A after Task 2.3's submitOrder refactor):

// BEFORE (post-L1.A current state):
} else {
  const fillPrice = quote?.last ?? req.limitPrice ?? 0
  // Simulator path: fill == reference quote by construction, so slippage
  // is exactly 0 bps. Stamp it explicitly so the journal shows the value
  // rather than null.
  const ef = this.entryFeatures.get(order.id)
  if (ef) ef.entrySlippageBps = 0
  setTimeout(() => this.om.fillOrder(order.id, fillPrice), 50)
}

// AFTER (what a429a4e wants):
} else {
  // Route the simulator fill through the slippage model. Default is
  // ZeroSlippageModel which preserves prior fill-at-quote.last behavior.
  const slip = this.om.getSlippageModel()
  const fillPrice = quote
    ? slip.fill(req, { quote }).fillPrice
    : (req.limitPrice ?? 0)
  // Stamp realized slippage from the model's actual fill (now possibly
  // non-zero under FixedBps / sqrt-law).
  const ef = this.entryFeatures.get(order.id)
  if (ef && quote?.last && quote.last > 0) {
    ef.entrySlippageBps = (fillPrice - quote.last) / quote.last * 10_000
  }
  setTimeout(() => this.om.fillOrder(order.id, fillPrice), 50)
}
```

**Important reconciliation:** Read the actual `a429a4e` diff via `git show a429a4e -- src/main/core/trading-engine.ts` to confirm the exact patch shape. Apply equivalent semantics to the post-L1.A current state — preserve every L1.A change (the `this.session` instantiation, the `clientOrderId` provenance, etc., are NOT in the simulator branch so they're unaffected; the entire simulator branch is independent of the live branch).

```bash
# Edit src/main/core/trading-engine.ts to resolve
git add src/main/core/trading-engine.ts
```

#### Step 2.1.3 — Resolve `order-manager.ts` conflict (if any)

If `order-manager.ts` conflicted:

The `a429a4e` patch adds:
1. An optional constructor parameter: `constructor(startingEquity = DEFAULT_EQUITY, slippageModel: SlippageModel = ZeroSlippageModel)` (or similar — read the actual diff to confirm signature).
2. A field `private slippageModel: SlippageModel`.
3. A getter `getSlippageModel(): SlippageModel { return this.slippageModel }`.

Post-L1.A the constructor still takes `startingEquity = DEFAULT_EQUITY`. The patch's addition of a second parameter is additive — should merge cleanly. If conflict: the issue is likely line-number drift or that L1.A reshaped the constructor's body. Apply equivalent additive change.

```bash
# Edit src/main/services/order-manager.ts
git add src/main/services/order-manager.ts
```

The test file `order-manager.test.ts` may also conflict because L1.A modified it (Task 1.7 added `syncFromSnapshot` tests + Phase 4 removed the legacy `syncFromAlpaca` test). The `a429a4e` adds 4 NEW tests in a new describe block — should apply cleanly if line numbers shifted. If conflict: read the patch and apply the 4 tests at an appropriate insertion point.

#### Step 2.1.4 — Continue the cherry-pick

```bash
git cherry-pick --continue
```

The original commit message is preserved. Add a brief reconciliation note if desired (the cherry-pick UI will prompt — accept or edit).

#### Step 2.1.5 — Verify gates

```bash
cd 00-PROJECT-ROOT/01-SATEX-CORE/satex-app
npm run typecheck && npm run lint
npx vitest run src/main/services/order-manager.test.ts
npx vitest run  # full suite
npm run knip
```

All must pass. If a test fails, the conflict resolution didn't preserve semantics — back up and reread the original `a429a4e` diff.

#### Step 2.1.6 — Verify the new behavior is wired

```bash
# Confirm simulator-branch now references getSlippageModel
git grep -n "getSlippageModel" 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/core/trading-engine.ts
```

Expected: at least one match in the simulator branch of `submitOrder`.

---

## Phase 3 — Short-side enablement (MEDIUM conflict task)

### Task 3.1 — Cherry-pick the short-side autonomous commit

**Source commit:** `4701ac6`
**Files:** Modify `src/main/services/autonomous-trader.ts` (removes "v1 long-only" skip block at lines 206-219 in the original; adds side-aware bracket math; +7 tests)

**Conflict expectation:** **MEDIUM.** L1.A modified `autonomous-trader.ts` only via string-reference rename `syncAlpacaAccount` → `syncBrokerAccount` (5 sites, per Task 2.7). The `4701ac6` patch modifies a different region (the long-only skip block). Should mostly apply cleanly with line-number drift; verify the rename didn't shift the skip-block region into the patch's hunk.

- [ ] **Step 3.1.1:** Cherry-pick.

```bash
git cherry-pick 4701ac6
```

- [ ] **Step 3.1.2:** If conflict, resolve. Read `git show 4701ac6 -- src/main/services/autonomous-trader.ts` to see the original patch. The intent:
  - Remove the `if (decision.side === 'sell' || ...) return /* v1 long-only */` skip
  - Replace hardcoded `side: "buy"` in `OrderRequest` with `decision.side` (from the brain's decision)
  - Side-aware bracket math: long → stop below entry / TP above; short → stop above entry / TP below

If the rename moved code into the same hunk as the patch: resolve by preserving BOTH the rename (`syncBrokerAccount`) AND the patch's structural change. Stage and continue.

```bash
git add src/main/services/autonomous-trader.ts
git cherry-pick --continue
```

- [ ] **Step 3.1.3:** Verify.

```bash
npx vitest run src/main/services/autonomous-trader.test.ts
# Expected: existing autonomous-trader tests pass + 7 new tests (bullish baseline 2, bearish path 3, neutral/low-confidence vetoed 2)
```

If any old test fails, the rename or other L1.A change is incompatible with the short-side logic; investigate.

- [ ] **Step 3.1.4:** Full-suite check.

```bash
npm run typecheck && npm run lint && npx vitest run && npm run knip
```

---

## Phase 4 — Backtest framework (Tasks 4.1-4.8, all clean cherry-picks expected)

These 8 commits add new files in `src/shared/backtest/`, `src/main/backtest/`, and `scripts/`. No conflict expected unless line-number drift from L1.A shifts file structure unexpectedly.

### Task 4.1 — Phase C plan doc append

**Source commit:** `c5ab675`
**Files:** Doc append in `docs/superpowers/plans/2026-05-29-forward-test-foundation.md`
**Conflict risk:** None

- [ ] **Step 4.1.1:** `git cherry-pick c5ab675`

### Task 4.2 — BacktestReport / EquityPoint / Metrics types

**Source commit:** `fd184e0`
**Files:** Adds `src/shared/backtest/types.ts` (72 lines)
**Conflict risk:** None

- [ ] **Step 4.2.1:** `git cherry-pick fd184e0`

### Task 4.3 — Pure metrics lib

**Source commit:** `7da525f`
**Files:** Adds `src/shared/backtest/metrics.ts` (210 lines) + `metrics.test.ts` (159 lines)
**Conflict risk:** None

- [ ] **Step 4.3.1:** `git cherry-pick 7da525f`

- [ ] **Step 4.3.2:** Verify the metrics tests pass.

```bash
npx vitest run src/shared/backtest/metrics.test.ts
```

Expected: full metrics suite passes (Sharpe/Sortino/Calmar/MaxDD/PF/expectancy).

### Task 4.4 — Strategy interface + StrategySnapshot

**Source commit:** `b28751c`
**Files:** Adds `src/main/backtest/strategy.ts` (26 lines)
**Conflict risk:** None

- [ ] **Step 4.4.1:** `git cherry-pick b28751c`

### Task 4.5 — BrainStrategy wrapper

**Source commit:** `e6bdb78`
**Files:** Adds `src/main/backtest/brain-strategy.ts` (57 lines) + test (86 lines)
**Conflict risk:** Low — references `Strategy` from Task 4.4

- [ ] **Step 4.5.1:** `git cherry-pick e6bdb78`

- [ ] **Step 4.5.2:** Verify.

```bash
npx vitest run src/main/backtest/brain-strategy.test.ts
```

### Task 4.6 — BacktestRunner with intra-bar bracket resolution

**Source commit:** `e176022`
**Files:** Adds `src/main/backtest/runner.ts` (211 lines) + test (183 lines)
**Conflict risk:** None (new file)

- [ ] **Step 4.6.1:** `git cherry-pick e176022`

- [ ] **Step 4.6.2:** Verify.

```bash
npx vitest run src/main/backtest/runner.test.ts
```

### Task 4.7 — Reporter (console + markdown + JSON)

**Source commit:** `d74ddad`
**Files:** Adds `src/main/backtest/reporter.ts` (89 lines) + test (115 lines)
**Conflict risk:** None

- [ ] **Step 4.7.1:** `git cherry-pick d74ddad`

- [ ] **Step 4.7.2:** Verify.

```bash
npx vitest run src/main/backtest/reporter.test.ts
```

### Task 4.8 — Headless CLI + canned fixture + integration test

**Source commit:** `e251681`
**Files:**
- Adds `scripts/backtest.ts` (131 lines)
- Adds `scripts/backtest.test.ts` (43 lines)
- Adds `scripts/fixtures/tiny-tape.json` (1042 lines)
- Modifies `package.json` (adds backtest script + deps if any)
- Modifies `package-lock.json` (auto-generated)
- Modifies `tsconfig.json` (likely adds `scripts/` to includes or adjusts module resolution)

**Conflict risk:** **LOW** — `package.json` and `tsconfig.json` may have drifted from when this commit was authored. Resolve by applying the patch's additions on top of the current contents.

- [ ] **Step 4.8.1:** `git cherry-pick e251681`

- [ ] **Step 4.8.2:** If `package.json` conflicts, resolve by preserving both:
  - The script and dep additions from `e251681`
  - The current dependencies on master (L1.A may have updated nothing in `package.json`, but verify)

```bash
git add package.json package-lock.json tsconfig.json
git cherry-pick --continue
```

- [ ] **Step 4.8.3:** If lockfile is stale (it almost certainly will be), regenerate as a SEPARATE follow-on commit (per AGENTS.md "Prefer to create a new commit rather than amending").

```bash
cd 00-PROJECT-ROOT/01-SATEX-CORE/satex-app
npm install
git add package-lock.json
git -c core.autocrlf=false commit -m "$(cat <<'EOF'
chore(deps): regenerate package-lock after backtest CLI cherry-pick

The e251681 cherry-pick brought package.json's backtest-CLI deps onto
post-L1.A master, but the cached lockfile was authored against the
pre-L1.A node_modules state. Regenerated.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

(Pre-commit re-runs on this commit too — gates must still pass.)

- [ ] **Step 4.8.4:** Run the integration test.

```bash
npx vitest run scripts/backtest.test.ts
```

Expected: integration test passes — should run the CLI against `tiny-tape.json` and produce a report matching expected metrics.

- [ ] **Step 4.8.5:** Run the CLI manually for sanity.

```bash
node scripts/backtest.ts --fixture scripts/fixtures/tiny-tape.json
```

(The exact invocation depends on the CLI's argument shape — read `scripts/backtest.ts` first 30 lines to confirm.)

Expected: console output shows a report (metrics + equity curve) without errors.

---

## Phase 5 — Final gate + PR (Task 5.1)

### Task 5.1 — Final 4-gate verification + PR

- [ ] **Step 5.1.1:** All four gates green at HEAD.

```bash
cd 00-PROJECT-ROOT/01-SATEX-CORE/satex-app
npm run typecheck
npm run lint
npm test
npm run knip
```

Each must pass. Test count expected: 463 (post-L1.A baseline) + ~20-30 new from L1.B's slippage / metrics / strategy / runner / reporter / CLI tests. Capture the exact count.

- [ ] **Step 5.1.2:** Sanity-grep for L1.B's footprint.

```bash
ls src/main/backtest/
# Expected: slippage-model.ts (+ test), strategy.ts, brain-strategy.ts (+ test),
#           runner.ts (+ test), reporter.ts (+ test)
ls src/shared/backtest/
# Expected: types.ts, metrics.ts (+ test)
ls scripts/
# Expected: backtest.ts, backtest.test.ts, fixtures/tiny-tape.json
```

- [ ] **Step 5.1.3:** Confirm SlippageModel is selectable.

```bash
git grep -n "SlippageModel\|getSlippageModel" src/main/services/order-manager.ts src/main/core/trading-engine.ts
```

Expected: matches in both files (OM exposes the getter; trading-engine reads it from the simulator branch).

- [ ] **Step 5.1.4:** Confirm short-side is enabled.

```bash
git grep -n "v1 long-only\|side: \"buy\"" src/main/services/autonomous-trader.ts
```

Expected: zero matches (skip block removed; hardcoded side replaced with `decision.side`).

- [ ] **Step 5.1.5:** Push branch.

```bash
git push -u origin feat/l1b-forward-test-foundation
```

- [ ] **Step 5.1.6:** Open PR.

Write the PR body to a file first to avoid heredoc-backtick collisions:

```bash
cat > /tmp/l1b-pr-body.md << 'PRBODY'
## Summary

Lands the 14-commit forward-test foundation stack from `feat/tier-2-alpha-depth` onto post-L1.A master. Closes program spec §5.1 L1.B.

Per AGENTS.md, this PR touches `OrderManager` constructor, trading-engine simulator-submit path, and `autonomous-trader.ts` — **requires explicit human sign-off** before merge.

## What it adds

- **Slippage models** — `SlippageModel` interface + `ZeroSlippageModel` (baseline), `FixedBpsSlippageModel`, `SpreadHalfPlusImpactModel` (sqrt-law). OrderManager constructor accepts optional model (defaults to Zero — every caller stays backwards-compatible). Simulator submit path routes fills through the selected model.
- **Short-side enablement** — autonomous-trader removes the v1 long-only skip; side-aware bracket math (long: stop below / TP above; short: stop above / TP below). Reward:risk ratios preserved symmetric.
- **Backtest framework primitives** — `Strategy` interface, `StrategySnapshot`, `BacktestReport` / `EquityPoint` / `Metrics` types, pure metrics library (Sharpe / Sortino / Calmar / MaxDD / PF / expectancy), `BrainStrategy` wrapper, `BacktestRunner` with intra-bar bracket resolution, reporter (console + markdown + JSON), headless CLI + canned fixture + integration test.

## DoD verified

- `npx vitest run scripts/backtest.test.ts` green on canned fixture
- SlippageModel selectable on OrderManager
- Simulator runs short side (autonomous-trader emits both buy and sell orders per decision)
- All four gates green at PR HEAD
- `master..HEAD` = 14 commits + lockfile-regeneration commit (if needed)

## Trading-safety blast radius

- OrderManager constructor signature changed (additive — optional parameter; defaults preserve prior behavior)
- Trading-engine simulator-submit path routes through slippage model (was: fill-at-quote.last)
- Autonomous-trader emits short-side orders (was: long-only)
- Kill-switch / live-mode interlock / IPC zod / safeStorage: NOT touched

## Test plan

- [ ] Reviewer runs all four gates locally; confirms green
- [ ] Reviewer runs `node scripts/backtest.ts --fixture scripts/fixtures/tiny-tape.json`; confirms report produced
- [ ] Reviewer reads `a429a4e` cherry-pick conflict resolution in trading-engine.ts simulator branch
- [ ] Reviewer reads `4701ac6` cherry-pick conflict resolution in autonomous-trader.ts
- [ ] Reviewer confirms short-side bracket math: long stop < entry < TP; short TP < entry < stop

Generated with Claude Code.
PRBODY

gh pr create --title "L1.B: forward-test foundation — slippage + short + backtest framework" --body-file /tmp/l1b-pr-body.md
```

- [ ] **Step 5.1.7:** Wait for CI green + explicit human sign-off comment. **Do not merge autonomously.**

- [ ] **Step 5.1.8:** Once approved: `gh pr merge --merge`. Verify head SHA in master. Pull master.

L1.B complete. Downstream L1.C (strategies + ensemble) unblocked.

---

## Appendix — Conflict resolution playbook

If any cherry-pick fails:

1. `git status` — see the conflicted files.
2. `git show <source-sha> -- <conflicted-file>` — see what the patch wanted to do.
3. Read the `<<<<<<<` markers; understand both sides:
   - "ours" = post-L1.A master state
   - "theirs" = the cherry-picked commit's intent
4. Apply the patch's intent on top of "ours" — preserve every L1.A change.
5. `git add <conflicted-file>`.
6. `git cherry-pick --continue`.
7. Run gates immediately. If they fail, the resolution didn't preserve semantics — re-read the patch.

If you cannot resolve a conflict without breaking semantics: `git cherry-pick --abort`, document the blocker, and surface to the human reviewer.

## Appendix — Rollback procedure

If a phase regresses gates and the cause isn't a fixable conflict:

```bash
git reset --hard <last-known-good-sha>
# (the SHA from before the problematic cherry-pick)
```

This is destructive; only use it before the branch is pushed. Once pushed, prefer `git revert` of the problematic commit + a follow-up commit that re-applies the patch correctly.

## Appendix — Verification commands quick-reference

| What | Command |
|---|---|
| Current branch | `git rev-parse --abbrev-ref HEAD` |
| All four gates | `npm run typecheck && npm run lint && npm test && npm run knip` |
| Branch ahead count | `git rev-list --count master..HEAD` |
| L1.B grep — slippage | `git grep -n "SlippageModel\|getSlippageModel" src/` |
| L1.B grep — short-side | `git grep -n "decision.side" src/main/services/autonomous-trader.ts` |
| L1.B grep — backtest | `ls src/shared/backtest/ src/main/backtest/ scripts/backtest.ts` |
