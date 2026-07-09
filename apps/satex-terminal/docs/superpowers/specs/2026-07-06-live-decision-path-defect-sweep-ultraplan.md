---
type: ultraplan-blueprint
date: 2026-07-06
run: satex-psd-daily (dawn planner) — REAL run time 2026-07-06 14:47 CDT (off-nominal; nominal slot 05:00)
slug: live-decision-path-defect-sweep
status: EXECUTED — sweep complete, verdict CLEAN (no code defect found); positive finding recorded as P-089
branch: chore/p076-p080-coverage-and-fixes
tags: [satex, ultraplan, psd, audit, intelligence, brain, calibration, pattern-learner, regime, self-eval, defect-class-sweep]
---

# ULTRAPLAN — Live-Decision-Path Defect-Class Sweep (2026-07-06)

Pick rationale: §2 priority order exhausted through (c) — no handoff REMAINING/BLOCKED
(2026-07-05 work-layer closed clean), IN-PROGRESS P-008 rides post-L1.G, all four DECIDED
entries are ladder-gated (P-009 L1.F, P-012 L1.D-F), defer-decisions (P-011 = "wait for
density modes"), or operator filesystem ops (P-068, sandbox-EPERM-blocked). Landed on
(d) audit fallback, which matches the 2026-07-04 AND 2026-07-05 handoffs' top standing
recommendation: the twice-deferred read-only sweep of the live-decision-path files,
explicitly flagged as "worth dedicating a full session to it specifically." Also honors
the 2026-07-05 directive NOT to stack another coverage file onto the uncommitted pile —
this sweep adds ledger evidence, not code to the pile.

## LAYER 1 — OBJECTIVE
One sentence: prove or disprove that the live-decision-path (services/intelligence
decision layer) is free of the repo's recidivist defect classes, and fix the
highest-leverage single-answer defect found (if any).

Success criteria (measurable):
- Every unguarded-denominator / unbounded-spread / timer-leak / degenerate-input /
  NaN-propagation candidate in the 5 target files is inspected at file:line and given a
  verdict (guarded / defect).
- If a real single-answer defect is found: it disappears at a named file:line, a test
  pins it, and a gate delta is reported.
- If none is found: an evidenced CLEAN verdict is recorded as a PSD entry, closing the
  twice-deferred audit recommendation. (Directive 0.1: a fabricated fix to "fill the
  session" is forbidden; the audit IS the deliverable — FAILURE PROTOCOL "nothing
  pickable".)

Constraints in force: 0.1 (never fabricate — UNKNOWN over guess), 0.3 (never touch the
safety perimeter autonomously — this layer is decision/advisory, NOT execution/risk),
0.4 (measure, don't assert), §2.5.7 leak class, §2.7 no scope-creep / correctness only.

Assumptions: the 5 files ARE the live-decision path (verified: brain.ts = SGD signal,
calibration.ts = confidence throttle, pattern-learner.ts = regime-conditioned SGD,
regime.ts = HMM classifier, self-eval.ts = nightly observational backtest). None sits on
the trading-safety perimeter (execution/, risk/, kill switch, arming) — confirmed against
CONSTITUTION §2.4 + ARCHITECTURE §2.

## LAYER 2 — DOMAIN MAP
Service domain: intelligence (main process). Layer: main. Blast radius (read-only unless
a defect is fixed):
- src/main/services/brain.ts (203 LOC) — features(), scoreLocal(), decisionFromLocal(),
  learn()
- src/main/services/calibration.ts (146 LOC) — computeBrier/Buckets/Multiplier,
  CalibrationService.record/calibrate
- src/main/services/pattern-learner.ts (242 LOC) — start/stop, cycle, featuresOf,
  forwardLogReturn
- src/main/services/regime.ts (303 LOC) — normalize, gaussian, extractFeatures,
  emissionProb, hmmStep, start/stop
- src/main/services/self-eval.ts (239 LOC) — start/stop, armNext, runOnce
No perimeter files in radius → NO RISK-TOUCH / APPROVAL NODE this session.

## LAYER 3 — TASK TREE
T1 grep defect-class signatures across all 5 files (Math.*(...spread), bare-identifier
   denominators, setInterval/setTimeout, unbounded push/Map/Set). [DONE]
T2 read + verdict each candidate at file:line. [DONE]
T3 verify STATE_MEANS shape vs feature-vector order + FEATURE_SIGMA > 0 (HMM correctness).
   [DONE]
T4 verify 1:1 setInterval/clearInterval + setTimeout/clearTimeout per file. [DONE]
T5 IF defect found → fix + pin with test + gates; ELSE → record CLEAN PSD entry P-089.
   [DONE — no defect; P-089 recorded]
T6 real gate baseline (== final; no code changed). [DONE]
T7 ledger + handoff + this blueprint. [DONE]

## LAYER 4 — DEPENDENCY DAG
T1 -> T2 -> {T3, T4} -> T5 -> T6 -> T7. All sequential except T3/T4 parallel. No
APPROVAL NODES.

## LAYER 5 — EXECUTION SPECS (with realized results)
- Denominators: brain.ts:88 `if (totSize > 0)`; :96 `if (quote.last > 0)`; :81
  `Math.max(0.01, quote.last)`; :132 `if (notional <= 0) return`. calibration.ts:86
  `if (avgConf <= 0) return 1`; :54 length===0 guard (Brier); :79 `if (b.n > 0)`.
  regime.ts:73 `if (s === 0) return uniform`; extractFeatures `Math.max(1e-9, last)`,
  `e21 === 0 ? 0`, `trailing > 0`, `last > 0`. pattern-learner.ts:236
  `Math.max(0.01, x0.last)`; featuresOf `o.vwap > 0`. VERDICT: every denominator guarded.
- Spreads: grep `Math\.(min|max|hypot|pow)\(\.\.\.` across all 5 files → ZERO hits.
  VERDICT: no unbounded-spread class (P-041/P-027 class absent here).
- Timers: set/clear counts — brain 0/0, calibration 0/0, pattern-learner 1/1,
  regime 1/1, self-eval 1/1. Each start() has an idempotency guard (`if (this.timer)
  return` / `if (this.running) return`) and a matching stop() with clearInterval/
  clearTimeout. self-eval also `timer.unref()`. VERDICT: no timer-leak class
  (PR#6/P-041/P-043/P-046 absent here).
- Unbounded growth: calibration.samples `shift()` at WINDOW (:124); pattern-learner
  lastLabeledTs Map keyed by symbol → bounded by watchlist; regime posterior fixed
  length 4. VERDICT: no unbounded-growth class.
- HMM correctness: STATE_MEANS all length-4 matching feature order
  [normVol, normTrend, normSpread, normVolume] (regime.ts:47-52, :150-158);
  FEATURE_SIGMA = 0.22 > 0; emissionProb underflow-to-0 handled by normalize's zero-guard
  (falls to uniform, no NaN). VERDICT: correct + numerically graceful.

Validation command / result: typecheck node exit 0 · typecheck web exit 0 · lint exit 0
(0 warnings) · vitest 5 decision files 47/47 (exit 0). knip not run (sandbox oxc 2 GB
OOM, §2.9; no code changed → knip-neutral, CI arbiter).

## LAYER 6 — RISK AUDIT (self-adversarial)
- "Did the sweep miss a path?" — checked the exact class list the ledger was built to
  guard (P-039/P-040 degenerate denominators, P-041/P-027 unbounded spreads,
  PR#6/P-041/P-043/P-046 timer/observer leaks, bounded-growth caps). Coverage of
  intelligence decision files is the named gap the prior two handoffs flagged; this
  closes it against that class list.
- "Is a CLEAN verdict just laziness?" — no: each verdict cites a specific guard at
  file:line (Layer 5), and the gate/test run is real (Layer 5 results).
- Residual (NOT a defect, logged for honesty): pattern-learner.ts has only 3 co-located
  tests for 242 LOC / 6-feature × 5-regime SGD — thin relative to complexity. Deliberately
  NOT acted on: adding tests = stacking coverage on the already-large uncommitted pile,
  which the 2026-07-05 handoff explicitly discouraged pending an operator checkpoint.
  Recorded as a future candidate, not this session's work.
- Micro-observation (NOT acted on): docs/policy/scheduled-psd-daily.md §Verify sandbox
  recipe still says "in satex-app" (pre-reorg dir shorthand for the throwaway /tmp clone);
  cosmetic, inside a fallback recipe, not a live-path bug. Editing an existing tracked
  CRLF/LF doc for a cosmetic item is not worth the file-bridge corruption risk (§2.9);
  flagged for a batched doc pass.

## LAYER 7 — ASSEMBLED PLAN / OUTCOME
The live-decision path is defect-clean against the repo's recidivist class list, evidenced
at file:line, with a green typecheck/lint and 47/47 decision-layer tests. No code changed;
baseline == final. This closes the twice-deferred audit recommendation. Recorded as P-089.
