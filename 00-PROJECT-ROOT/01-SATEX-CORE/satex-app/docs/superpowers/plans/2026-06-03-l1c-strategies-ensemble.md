# L1.C — Strategies + Ensemble + Sizing + TCA + Microstructure + Regression

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or superpowers:subagent-driven-development) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the 11-commit "strategies + ensemble" stack from `origin/feat/tier-2-alpha-depth` onto post-L1.B master by cherry-picking each commit individually. Zero file overlap with L1.D/L1.E surfaces, so chronological-skip is safe here even though the program spec recommends L1.B→L1.D→L1.E→L1.C→L1.F to minimize review surface — verified 2026-06-03 by union-of-files comparison.

**Architecture:** Eleven new files in `src/main/backtest/strategies/` (momentum, mean-reversion, breakout, ensemble + tests), `src/main/backtest/sizing/` (vol-target + test), plus extensions to L1.B's `runner.ts` + `strategy.ts` (optional `multiTimeframe` snapshot field, backwards-compatible `withMultiTimeframe` flag), new `src/shared/indicators-mtf.ts`, brain microstructure features in `src/main/services/brain.ts`, `src/main/services/tca.ts` (TransactionCostAnalyzer), `src/shared/backtest/regression.ts` (compareReports), and a knip-cleanup commit de-exporting internal type aliases.

**Tech Stack:** TypeScript 5.x · Electron · Vitest · ESLint · Knip.

**Trading-safety perimeter:** L1.C does NOT touch order-execution, kill-switch, live-mode interlock, or IPC zod. The only modification to a non-backtest module is `src/main/services/brain.ts` (microstructure feature additions — pure functions that surface new scores; the autonomous-trader is NOT rewired in L1.C — that's L1.F). Per `AGENTS.md`, the closing PR **requires explicit human sign-off** because `brain.ts` participates in the live decision pipeline. Every cherry-pick commit must pass pre-commit (typecheck + lint). The closing PR must pass all four gates (typecheck + lint + test + knip).

---

## Spec reference

- Program spec: `docs/superpowers/specs/2026-06-02-topstep-eval-capable-program-design.md` §5.1 L1.C
- L1.A program PR: #19 (merged 2026-06-03, master `b6fecac`)
- L1.B program PR: #20 (merged 2026-06-03, master `7adf0a8`)
- Source stack: `origin/feat/tier-2-alpha-depth` @ `95a4217` — L1.C covers chronological commits 15–25 (`aba8bce` through `17478f5`); L1.D + L1.E commits sit between L1.B's last (`e251681`) and L1.C's first (`aba8bce`) chronologically but have **zero file overlap** with L1.C, so skipping them on this branch is safe.

## L1.C commit roster (chronological, from `origin/feat/tier-2-alpha-depth`)

| # | SHA | Summary | Conflict risk | Touched files |
|---|---|---|---|---|
| 1 | `aba8bce` | feat(strategies): multi-timeframe indicator snapshots | None | new: `src/shared/indicators-mtf.{ts,test.ts}` |
| 2 | `1f3e6c3` | feat(strategies): StrategySnapshot extended (optional `multiTimeframe`/`regime`/`depth`) | **LOW** — modifies L1.B's `runner.ts` (1 import + 1 field + 1 call-site) and `strategy.ts` (extends `StrategySnapshot` interface). Line offsets verified 2026-06-03 against post-L1.B HEAD; hunks align. | modifies: `runner.ts`, `strategy.ts`; new: `strategy.test.ts` |
| 3 | `d0793dd` | feat(strategies): MomentumStrategy | None | new: `src/main/backtest/strategies/momentum.{ts,test.ts}` |
| 4 | `e9ace04` | feat(strategies): MeanReversionStrategy | None | new: `src/main/backtest/strategies/mean-reversion.{ts,test.ts}` |
| 5 | `af73d88` | feat(strategies): BreakoutStrategy | None | new: `src/main/backtest/strategies/breakout.{ts,test.ts}` |
| 6 | `b8b22d8` | feat(strategies): StrategyEnsemble — regime-routed + fallback | None | new: `src/main/backtest/strategies/ensemble.{ts,test.ts}` |
| 7 | `4c04f66` | feat(sizing): VolatilityTargetSizing — annualized vol × Kelly fraction | None | new: `src/main/backtest/sizing/vol-target.{ts,test.ts}` |
| 8 | `982fe53` | feat(tca): TransactionCostAnalyzer — per-symbol/hour/direction breakdown | None | new: `src/main/services/tca.{ts,test.ts}` |
| 9 | `e280faf` | feat(brain): microstructure features (depth_imbalance + microprice_dev) | **LOW** — modifies `brain.ts` (existing, untouched by L1.A/L1.B). Adds two new features to the scoring pipeline; new `brain.test.ts` file. | modifies: `brain.ts`; new: `brain.test.ts` |
| 10 | `0194778` | feat(backtest): strategy regression framework (compareReports vs baseline) | None | new: `src/shared/backtest/regression.{ts,test.ts}` |
| 11 | `17478f5` | chore(tier-2): de-export internal type aliases (knip cleanup) | None | modifies L1.C's own `ensemble.ts` + `tca.ts` |

## Strategy decision

**Use `git cherry-pick` one commit at a time, NOT `git rebase --onto`.** Same justification as L1.B:
1. Per-commit gate verification — each cherry-pick produces a known SHA; gates run at that tip prove the migration didn't break anything.
2. Conflict isolation — the only two non-trivial commits (`1f3e6c3` and `e280faf`) are resolved in focused passes.
3. Clear commit history — every commit retains its original message + author trailer.

---

## Pre-flight: verify base state

### Task 0.1 — Confirm L1.B merged

- [ ] **Step 0.1.1:** Verify L1.B is on `master`.

```bash
git fetch origin
git log --oneline origin/master -5 | grep -iE "L1\.B|forward-test foundation"
```

Expected: a merge commit referencing L1.B / PR #20. If absent, **STOP — L1.C blocks on L1.B.**

- [ ] **Step 0.1.2:** Sync local master.

```bash
git checkout master
git pull --ff-only
```

- [ ] **Step 0.1.3:** Confirm four gates green at master tip.

```bash
cd 00-PROJECT-ROOT/01-SATEX-CORE/satex-app
npm install  # in case L1.B merge added/removed deps (it added tsx)
npm run typecheck
npm run lint
npm test
npm run knip
```

All must pass. Capture the test count baseline (should be 541/45 after L1.B).

### Task 0.2 — Create the L1.C work branch

- [ ] **Step 0.2.1:** Branch off post-L1.B master.

```bash
git checkout -b feat/l1c-strategies-ensemble master
git log --oneline -1
```

Expected: HEAD on a fresh branch, tip = master tip (post-L1.B).

### Task 0.3 — Lock the L1.C source SHAs

- [ ] **Step 0.3.1:** Pin the source commits by SHA so a force-push on the source branch can't silently change what we cherry-pick.

```bash
git fetch origin
git rev-parse origin/feat/tier-2-alpha-depth  # expected: 95a4217 (the L1.F tip — L1.C is below)
for sha in aba8bce 1f3e6c3 d0793dd e9ace04 af73d88 b8b22d8 4c04f66 982fe53 e280faf 0194778 17478f5; do
  git cat-file -e "$sha^{commit}" || echo "MISSING: $sha"
done
```

If any SHA is missing, **STOP and re-derive the roster.** The L1.C SHAs are 2026-06-03 verified; if the source has moved, the conflict-risk assessment may be stale.

---

## Phase 1 — Multi-timeframe indicators + StrategySnapshot extension (2 commits)

### Task 1.1 — Cherry-pick multi-timeframe indicators

**Source commit:** `aba8bce`
**Files:** new `src/shared/indicators-mtf.ts` (79 lines) + `indicators-mtf.test.ts` (73 lines, 9 tests)
**Conflict risk:** None — new files in a directory with no L1.A/L1.B presence

- [ ] **Step 1.1.1:** Cherry-pick.

```bash
git cherry-pick aba8bce
```

- [ ] **Step 1.1.2:** Verify the MTF tests pass.

```bash
cd 00-PROJECT-ROOT/01-SATEX-CORE/satex-app
npx vitest run src/shared/indicators-mtf.test.ts
```

Expected: 9 tests pass.

### Task 1.2 — Cherry-pick StrategySnapshot extension

**Source commit:** `1f3e6c3`
**Files:**
- Modify `src/main/backtest/runner.ts` (+12 / -2 lines: adds `computeMultiTimeframe` import, extends `Strategy` type import to include `StrategySnapshot`, new `withMultiTimeframe?: boolean` field on `BacktestRunInput`, opt-in snapshot attachment in the strategy.decide call-site at ~line 107)
- Modify `src/main/backtest/strategy.ts` (+17 / -2 lines: extends `StrategySnapshot` interface with optional `multiTimeframe`/`regime`/`depth` fields)
- New `src/main/backtest/strategy.test.ts` (32 lines)

**Conflict risk:** **LOW.** Both files are post-L1.B; line offsets verified to align with the patch's `@@ -20,11` and `@@ -44,6` hunk headers. Should apply clean.

- [ ] **Step 1.2.1:** Cherry-pick.

```bash
git cherry-pick 1f3e6c3
```

- [ ] **Step 1.2.2:** If conflicted (unexpected): read `git show 1f3e6c3 -- src/main/backtest/runner.ts src/main/backtest/strategy.ts` and apply the intent. The runner.ts patch is purely additive (new import + new optional field + opt-in branch in decide). The strategy.ts patch extends the interface additively.

- [ ] **Step 1.2.3:** Verify.

```bash
npx vitest run src/main/backtest/strategy.test.ts src/main/backtest/runner.test.ts
```

Expected: existing L1.B runner tests + new strategy.test.ts shape tests all green.

---

## Phase 2 — Three pure strategies (3 commits, clean cherry-picks)

### Task 2.1 — MomentumStrategy

**Source commit:** `d0793dd`
**Files:** new `src/main/backtest/strategies/momentum.{ts,test.ts}`
**Conflict risk:** None

- [ ] **Step 2.1.1:** `git cherry-pick d0793dd`
- [ ] **Step 2.1.2:** `npx vitest run src/main/backtest/strategies/momentum.test.ts` → green

### Task 2.2 — MeanReversionStrategy

**Source commit:** `e9ace04`
**Files:** new `src/main/backtest/strategies/mean-reversion.{ts,test.ts}`
**Conflict risk:** None

- [ ] **Step 2.2.1:** `git cherry-pick e9ace04`
- [ ] **Step 2.2.2:** `npx vitest run src/main/backtest/strategies/mean-reversion.test.ts` → green

### Task 2.3 — BreakoutStrategy

**Source commit:** `af73d88`
**Files:** new `src/main/backtest/strategies/breakout.{ts,test.ts}`
**Conflict risk:** None

- [ ] **Step 2.3.1:** `git cherry-pick af73d88`
- [ ] **Step 2.3.2:** `npx vitest run src/main/backtest/strategies/breakout.test.ts` → green

---

## Phase 3 — StrategyEnsemble (1 commit)

### Task 3.1 — Cherry-pick StrategyEnsemble

**Source commit:** `b8b22d8`
**Files:** new `src/main/backtest/strategies/ensemble.{ts,test.ts}`
**Conflict risk:** None — references `Strategy` from L1.B (`b28751c`) and the three strategies from Tasks 2.1–2.3

- [ ] **Step 3.1.1:** `git cherry-pick b8b22d8`
- [ ] **Step 3.1.2:** `npx vitest run src/main/backtest/strategies/ensemble.test.ts` → green

---

## Phase 4 — Sizing + TCA + brain microstructure (3 commits)

### Task 4.1 — VolatilityTargetSizing

**Source commit:** `4c04f66`
**Files:** new `src/main/backtest/sizing/vol-target.{ts,test.ts}`
**Conflict risk:** None — new dir

- [ ] **Step 4.1.1:** `git cherry-pick 4c04f66`
- [ ] **Step 4.1.2:** `npx vitest run src/main/backtest/sizing/vol-target.test.ts` → green

### Task 4.2 — TransactionCostAnalyzer

**Source commit:** `982fe53`
**Files:** new `src/main/services/tca.{ts,test.ts}`
**Conflict risk:** None — new files, no existing `tca.*` on master

- [ ] **Step 4.2.1:** `git cherry-pick 982fe53`
- [ ] **Step 4.2.2:** `npx vitest run src/main/services/tca.test.ts` → green

### Task 4.3 — Brain microstructure features

**Source commit:** `e280faf`
**Files:**
- Modify `src/main/services/brain.ts` (+45 / -6 lines: adds `depth_imbalance` and `microprice_dev` features)
- New `src/main/services/brain.test.ts` (110 lines, +12 tests)

**Conflict risk:** **LOW.** `brain.ts` existed pre-L1.A; not touched by L1.A or L1.B. The patch adds two new features into the scoring pipeline — additive, should apply clean. If it doesn't: read `git show e280faf -- src/main/services/brain.ts` and apply the additions at the relevant scoring + feature-extraction sites.

- [ ] **Step 4.3.1:** `git cherry-pick e280faf`
- [ ] **Step 4.3.2:** Verify.

```bash
npx vitest run src/main/services/brain.test.ts
npm test  # full suite — brain is used in the autonomous loop; broader regression check
```

Expected: 12 new brain tests + all existing tests still pass. **If any autonomous-trader test fails**, the microstructure addition broke the existing scoring contract — read the failure and either back out the cherry-pick or surface to the human reviewer.

---

## Phase 5 — Regression framework + knip cleanup (2 commits)

### Task 5.1 — Strategy regression framework

**Source commit:** `0194778`
**Files:** new `src/shared/backtest/regression.{ts,test.ts}`
**Conflict risk:** None

- [ ] **Step 5.1.1:** `git cherry-pick 0194778`
- [ ] **Step 5.1.2:** `npx vitest run src/shared/backtest/regression.test.ts` → green

### Task 5.2 — Knip cleanup (de-export internal type aliases)

**Source commit:** `17478f5`
**Files:** modify L1.C's own `ensemble.ts` + `tca.ts` (de-export `RegimeKey` / `EnsembleRoute` / `TcaBucket`)
**Conflict risk:** None

- [ ] **Step 5.2.1:** `git cherry-pick 17478f5`
- [ ] **Step 5.2.2:** Full knip check.

```bash
npm run knip
```

Expected: zero unused exports / types / files.

---

## Phase 6 — Final gate + PR (Task 6.1)

### Task 6.1 — Final 4-gate verification + PR

- [ ] **Step 6.1.1:** All four gates green at HEAD.

```bash
cd 00-PROJECT-ROOT/01-SATEX-CORE/satex-app
npm run typecheck
npm run lint
npm test
npm run knip
```

Each must pass. Test-count expectation: **541 + ~40-50 from L1.C's strategies + sizing + TCA + brain + regression tests** (roster says: 9 mtf + 2 strategy + ~10 momentum + ~10 mean-reversion + ~10 breakout + ~10 ensemble + ~8 vol-target + ~10 tca + 12 brain + 7 regression = ~88 estimated). Capture the exact count.

- [ ] **Step 6.1.2:** Sanity-grep for L1.C's footprint.

```bash
ls src/main/backtest/strategies/
# Expected: momentum.ts (+ test), mean-reversion.ts (+ test), breakout.ts (+ test), ensemble.ts (+ test)
ls src/main/backtest/sizing/
# Expected: vol-target.ts (+ test)
ls src/main/services/tca.ts src/main/services/brain.test.ts src/shared/indicators-mtf.ts src/shared/backtest/regression.ts
```

- [ ] **Step 6.1.3:** Confirm StrategyEnsemble is regime-routed and falls back gracefully.

```bash
git grep -n "regime\|fallback" src/main/backtest/strategies/ensemble.ts
```

Expected: routes for `trend` / `range` / `breakout` regimes + a default fallback.

- [ ] **Step 6.1.4:** Confirm brain microstructure features are surfaced into scoring.

```bash
git grep -n "depth_imbalance\|microprice_dev" src/main/services/brain.ts
```

Expected: both features defined + consumed by `scoreLocal` (or equivalent scoring path).

- [ ] **Step 6.1.5:** Confirm `autonomous-trader.ts` was NOT modified (L1.F is the wiring lane, not L1.C).

```bash
git diff master..HEAD -- src/main/services/autonomous-trader.ts | wc -l
```

Expected: `0` lines of diff. If non-zero, a cherry-pick leaked into the autonomous-trader and L1.C is out of scope — surface to the human reviewer.

- [ ] **Step 6.1.6:** Push branch.

```bash
git push -u origin feat/l1c-strategies-ensemble
```

- [ ] **Step 6.1.7:** Open PR.

```bash
gh pr create --title "L1.C: strategies + ensemble + sizing + TCA + microstructure + regression" --body-file 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/.pr-body-l1c.md
```

PR body should cover: summary, what's added, gate results at HEAD, cherry-pick log (11 source SHAs → new SHAs), conflict resolution (likely none beyond the two `LOW`-risk commits in Phase 1.2 and 4.3), trading-safety blast radius (brain.ts touched but autonomous-trader unchanged — L1.F is the wiring lane), test plan.

- [ ] **Step 6.1.8:** Wait for CI green + explicit human sign-off comment. **Do not merge autonomously.**

- [ ] **Step 6.1.9:** Once approved: `gh pr merge --merge`. Verify head SHA in master. Pull master.

L1.C complete. Downstream L1.F (autonomous-trader wires ensemble) and L3.B (instrument new hot paths: `ensemble:select`) unblocked.

---

## Appendix — Conflict resolution playbook

If any cherry-pick fails:

1. `git status` — see the conflicted files.
2. `git show <source-sha> -- <conflicted-file>` — see what the patch wanted to do.
3. Read the `<<<<<<<` markers; understand both sides:
   - "ours" = current branch state (post-L1.B + previous L1.C cherry-picks)
   - "theirs" = the cherry-picked commit's intent
4. Apply the patch's intent on top of "ours". Preserve every prior L1.B + earlier-L1.C change.
5. `git add <conflicted-file>`.
6. `git cherry-pick --continue`.
7. Run gates immediately. If they fail, the resolution didn't preserve semantics — re-read the patch.

If you cannot resolve a conflict without breaking semantics: `git cherry-pick --abort`, document the blocker, and surface to the human reviewer.

## Appendix — Rollback procedure

If a phase regresses gates and the cause isn't a fixable conflict:

```bash
git reset --hard <last-known-good-sha>
```

This is destructive; only use it before the branch is pushed. Once pushed, prefer `git revert` of the problematic commit + a follow-up commit that re-applies the patch correctly.

## Appendix — Verification commands quick-reference

| What | Command |
|---|---|
| Current branch | `git rev-parse --abbrev-ref HEAD` |
| All four gates | `npm run typecheck && npm run lint && npm test && npm run knip` |
| Branch ahead count | `git rev-list --count master..HEAD` |
| L1.C grep — strategies | `ls src/main/backtest/strategies/` |
| L1.C grep — sizing | `ls src/main/backtest/sizing/` |
| L1.C grep — brain microstructure | `git grep -n "depth_imbalance\|microprice_dev" src/main/services/brain.ts` |
| L1.C grep — regression | `git grep -n "compareReports" src/shared/backtest/regression.ts` |
| L1.C confirm autonomous-trader untouched | `git diff master..HEAD -- src/main/services/autonomous-trader.ts \| wc -l` (must be 0) |
