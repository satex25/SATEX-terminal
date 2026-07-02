---
type: ultraplan
date: 2026-06-27
slug: double-pattern-symmetry-negative-price
problem: P-034
branch: feat/d10-funded-account
head: e158e486b1e1c215d32220dbc6d609e9b69782fd
status: EXECUTING
agent: satex-psd-daily (5 AM planner / first executor)
tags: [satex, ultraplan, psd, P-034, chart-indicators, off-perimeter]
---

# Ultraplan — Double-Pattern Symmetry Denominator (P-034)

7-layer structured decomposition. Authored autonomously (unattended 5 AM session);
all unknowns resolved from repo state. Pick reached via **PSD rule 2(d)** — the
handoff queue (REMAINING-1/2 → P-031/P-032) is exhausted, no actionable autonomous
DECIDED/IN-PROGRESS off-perimeter ledger entry exists (P-009 needs human sign-off;
P-011/P-012/P-008b deferred by their own decisions; P-007/014/017/020/022/028 are
operator-gated), so a targeted branch-vs-master audit of the pure chart-indicator
layer was run. It surfaced one real, **live** (not latent) correctness defect.

---

## Layer 1 — OBJECTIVE

**Goal (one sentence).** Guard the double-top / double-bottom *symmetry* gate against
a non-positive anchor price so two peaks/troughs are compared by their true relative
distance regardless of price sign, instead of silently bypassing the tolerance filter
for negative-priced instruments.

**Evidenced problem.**
`detectDoubleTops` (`src/shared/chart-indicators/double-top.ts:48`) and
`detectDoubleBottoms` (`double-bottom.ts:39`) both compute
`symmetry = Math.abs(b.price - a.price) / a.price`. The denominator is the *raw* anchor
price `a.price`, not its magnitude. The result is gated by `if (symmetry > tolerance) continue`.

For a negative-priced instrument the denominator is negative, so `symmetry` is negative,
and `negative > 0.03` is always `false` → **the symmetry filter never rejects any pair**.
SATEX's instrument universe explicitly includes **CL (crude)** (System Constitution §1.1
Futures), which printed *negative* prices in April 2020 — so negative anchor prices are
inside the system's stated domain, not a hypothetical.

Both detectors are **LIVE**, not latent: `ChartPanel.tsx:1148` calls
`detectDoubleTops(patternView)` and `:1163` calls `detectDoubleBottoms(patternView)` to
draw the operator's pattern overlay. On a negative-priced symbol the chart would render
spurious double-top/bottom patterns and report a nonsensical negative `symmetry`
(the type doc at `types.ts:65-67` states `symmetry` is a positive fraction, "e.g. 0.02
means 2%").

**Empirical reproduction** (`/tmp/satex-agent-repro.mjs`, replicating the exact gate):

| anchor a.price | partner b.price | OLD symmetry | OLD rejected | FIX symmetry | FIX rejected |
|---|---|---|---|---|---|
| 100 | 100.5 (within tol) | 0.005 | false | 0.005 | false |
| 100 | 150 (50% apart) | 0.5 | **true** | 0.5 | true |
| −100 | −103 (within tol) | **−0.03** | false | 0.03 | false |
| −100 | −150 (50% apart) | **−0.5** | **false (BUG)** | 0.5 | **true (fixed)** |
| 0 | 0 | NaN | **false (BUG)** | Infinity | **true (fixed)** |

→ For every **positive** anchor, OLD == FIX (the entire existing test suite is unaffected).
For negative / zero anchors the OLD code falsely accepts wildly-asymmetric pairs and
emits negative/NaN symmetry; the FIX restores the intended relative-distance semantics.

**Success criteria (measurable).**
- `double-top.ts:48` and `double-bottom.ts:39` no longer divide by raw `a.price`;
  denominator is `Math.abs(a.price)` with an explicit `=== 0 → continue` skip.
- New regression tests in `chart-indicators/indicators.test.ts` assert: (a) a far-apart
  negative-price pair is **rejected** (`[]`); (b) a within-tolerance negative-price pair
  is accepted with **positive** `symmetry < tolerance`; applied to both detectors.
- vitest file count unchanged (append to existing file); **test count +≥4**.
- All four gates exit 0; no NUL / `\r\r` in any touched file.

**AGENTS.md constraints that apply.** Off the trading-safety perimeter (advisory display;
patterns route no orders — the constitution's advisory-only wall). No RISK-TOUCH. Report
real gate results. Leave everything UNSTAGED. CRITICAL TOOL HAZARD discipline on the two
existing-file edits (python-through-bash, EOL-detect, anchor count==1, NUL-scan after).

**Assumptions.**
- A1: `a.price` originates from `swingHighs`/`swingLows`, which copy `candle.high`/`.low`;
  negative values flow through unchanged (no upstream clamp). *Verified* — read both
  functions; no clamp.
- A2: Behavior-identical for positive prices ⇒ no existing test changes. *Verified* —
  empirical table above + `Math.abs(x)===x` for `x>0`.
- A3: `continue` on a zero anchor is the correct semantics (relative symmetry is undefined
  at price 0; rejecting is safer than emitting NaN). *Decided*, not externally specced.

---

## Layer 2 — DOMAIN MAP

**Blast radius (exact).**
- `src/shared/chart-indicators/double-top.ts` — `detectDoubleTops`, line 48 (1 expr → 3 lines).
- `src/shared/chart-indicators/double-bottom.ts` — `detectDoubleBottoms`, line 39 (1 expr → 3 lines).
- `src/shared/chart-indicators/indicators.test.ts` — append regression tests (additive).

**Layer / service.** `shared/` layer, `chart-indicators/` module. Pure, deterministic,
main+renderer-safe. **No RISK-TOUCH file in radius.** Not in broker/ execution/ risk/
subsecond/ system/. Read-only downstream consumer: `renderer/panels/ChartPanel.tsx`
(pattern overlay) — not edited.

**Not touched.** No IPC, no Zod schema, no persisted settings, no engine, no order path.

---

## Layer 3 — TASK TREE

- **T1 — Fix double-top.ts**
  - T1.1 detect EOL of `double-top.ts`; assert anchor `  const symmetry = Math.abs(b.price - a.price) / a.price` count == 1.
  - T1.2 replace with `const denom = Math.abs(a.price)\n      if (denom === 0) continue\n      const symmetry = Math.abs(b.price - a.price) / denom` (preserve indentation).
  - T1.3 NUL / `\r\r` scan double-top.ts; confirm `/ a.price` gone, `/ denom` present.
- **T2 — Fix double-bottom.ts** (mirror)
  - T2.1 detect EOL; assert same anchor count == 1.
  - T2.2 replace identically.
  - T2.3 NUL / `\r\r` scan; confirm.
- **T3 — Regression tests**
  - T3.1 detect EOL of `indicators.test.ts`; locate end of `describe('detectDoubleTops'…)` and `describe('detectDoubleBottoms'…)`.
  - T3.2 append one `it('rejects far-apart negative-price peaks (denominator sign guard)')` + one `it('accepts within-tolerance negative-price peaks with positive symmetry')` to the double-top describe; mirror two for double-bottom. (4 tests.)
  - T3.3 NUL / `\r\r` scan + brace-balance the test file.
- **T4 — Gates** (typecheck, lint, vitest sharded, knip Node-20 shim).
- **T5 — Ledger P-034 SHIPPED + CHANGELOG (first `### Fixed` under Unreleased) + handoff.**

---

## Layer 4 — DEPENDENCY DAG

```
T1 ─┐
T2 ─┼─→ T3 ─→ T4 ─→ T5
    │   (tests import both detectors)
```
- T1 ∥ T2 (independent files, run together).
- T3 depends on T1+T2 (tests assert post-fix behavior).
- T4 depends on T1+T2+T3. T5 depends on T4.
- **APPROVAL NODES: none** (no RISK-TOUCH task). Nothing deferred for sign-off.

---

## Layer 5 — EXECUTION SPECS

**T1.2 / T2.2 — the edit (both files).** Method: python through bash, per-file EOL detect.
Anchor (unique, verified count==1 in each file):
```
      const symmetry = Math.abs(b.price - a.price) / a.price
```
Replacement (same 6-space indent as the loop body):
```
      const denom = Math.abs(a.price)
      if (denom === 0) continue
      const symmetry = Math.abs(b.price - a.price) / denom
```
Artifacts: `double-top.ts` (+2 lines), `double-bottom.ts` (+2 lines), each with `/ denom`.
Validation: `grep -c '/ a.price'` == 0 in both; `grep -c '/ denom'` == 1 in both; byte-scan 0 NUL, 0 `\r\r`.
Failure mode: indentation drift → lint error. Fallback: re-read region, re-apply with exact whitespace.

**T3.2 — tests.** Fixtures: reuse the file's `candle()` factory. Construct a negative-price
double-bottom: swing lows near −100, partner at −150 (far) ⇒ expect `[]`; partner at −103
(within 3%) with a positive neckline between ⇒ expect 1 pattern, `symmetry > 0` and `< 0.03`.
Mirror for double-top with negative *highs*. Use `swingWindow: 2` (matches existing tests).
Validation: `npx vitest run src/shared/chart-indicators/indicators.test.ts` all pass;
test count +4. Failure mode: a chosen fixture doesn't form a swing under window 2 → assert
on detector output, adjust the synthetic sequence until the swing registers (verified by
running the targeted file, not by eyeballing).

**T4 — gates.** From `00-PROJECT-ROOT/01-SATEX-CORE/satex-app`:
`npm run typecheck` (exit 0) · `npm run lint` (exit 0, 0 warn) · vitest sharded
`npx vitest run --shard=k/8` k=1..8 (full run exceeds the 45 s bash wall) · knip
`NODE_OPTIONS="--require /tmp/satex-agent-node20-shim.js" npx knip` (exit 0). Expected
vitest delta: 96 files / 1210 tests → **96 files / 1214 tests**, 0 fail.

---

## Layer 6 — RISK AUDIT (self-adversarial)

- *How is this wrong?* If `a.price` is positive (the only case the live feed produces today
  for equities/crypto), `Math.abs` is a no-op ⇒ zero behavior change. Empirically confirmed.
- *Missed edge — `a.price === 0`?* Covered: `denom===0 → continue` rejects (Infinity > tol).
  Previously NaN slipped through as accepted. Net improvement, no regression.
- *Missed edge — `b.price` sign?* Irrelevant; only the denominator was wrong. Numerator is
  already `Math.abs(b - a)`, sign-safe.
- *Did I touch the safety perimeter?* No. No order, risk-gate, kill-switch, or interlock
  file in radius. Pattern output is advisory-only and routes nothing.
- *Teardown / unmount / reconnect / NUL paths?* N/A — pure function, no lifecycle, no IO.
  NUL-corruption guarded by mandatory post-edit byte scan (rule 5c).
- *Degenerate inputs?* Empty candles → `swing*` returns `[]` → loop body never runs → fix
  unreached, still `[]`. Single swing → outer loop `length-1` bound → no pair. Unchanged.
- *Could the `continue` skip a valid pattern?* Only when the anchor price is exactly 0,
  where relative symmetry is genuinely undefined — rejecting is the safe, documented choice.
- **Verdict: no task touches the perimeter or a one-way door. All tasks proceed to Layer 7.**

---

## Layer 7 — ASSEMBLED PLAN

Execute T1 ∥ T2 → T3 → T4 → T5. Two existing-file edits via python-through-bash with
count==1 anchor assertion and post-edit NUL scan; append-only tests; four gates after the
edit batch; ledger P-034 → SHIPPED with gate stamp; one CHANGELOG line under the first
`### Fixed` in `## Unreleased`; handoff written. Everything left UNSTAGED for operator
review. No commit, no APPROVAL NODE.
