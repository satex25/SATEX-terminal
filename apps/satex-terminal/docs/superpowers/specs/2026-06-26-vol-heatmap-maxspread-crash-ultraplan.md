---
type: ultraplan
date: 2026-06-26
slug: vol-heatmap-maxspread-crash
branch: feat/d10-funded-account
head: e158e48
author: satex-psd-daily (planner / first executor)
status: EXECUTING
psd: P-027
tags: [satex, ultraplan, chart, webgl, crash, off-perimeter]
---

# Ultraplan — vol-heatmap `Math.max(...spread)` stack-overflow crash (P-027)

> PICK rationale (PSD rule 2d): no autonomously-actionable DECIDED/IN-PROGRESS
> ledger entry exists (all are operator-gated or self-deferred). Targeted audit
> of `feat/d10-funded-account` vs `master` (merge-base 461f4b0; +124 files,
> +15,223 lines) surfaced one real, off-perimeter defect with an unambiguous fix
> that matches an already-documented codebase invariant. That is this blueprint.

---

## Layer 1 — OBJECTIVE

**Goal (one sentence):** Replace the two unbounded `Math.max(1e-10, ...arr)`
array-spreads in `computeHeatmap` (`src/renderer/chart/webgl/vol-heatmap.ts:194-195`)
with single-pass max loops, and pin the fix plus the module's untested exports with
tests, so the volatility heatmap cannot throw `RangeError: Maximum call stack size
exceeded` when fed SATEX's unbounded sub-second crypto candle buffer.

**Measurable success criteria:**
1. `grep -c 'Math\.\(max\|min\)(.*\.\.\.' src/renderer/chart/webgl/vol-heatmap.ts` → **0** (was 2 at lines 194,195).
2. New regression test: `computeHeatmap` on a >=100,000-element candle array returns
   without throwing. (Pre-fix: throws `RangeError` once length exceeds the V8 spread/
   argument ceiling ~65k; post-fix: returns one `HeatmapPoint` per candle.)
3. Behavior preserved: for every non-empty input, new `maxAtr/maxStdev` ===
   `Math.max(1e-10, ...arr)` (max-with-1e-10-floor). Empty array → 1e-10 (unchanged).
4. vitest delta: tests **+6** (appended to existing `vol-heatmap.test.ts`; file count
   unchanged). Exports newly covered: `tickVelocitySeries`, `vpinToIntensity`,
   `computeHeatmap` large-array path.
5. All four gates green: typecheck exit 0 · lint exit 0 (0 warnings) · vitest 0 fail ·
   knip exit 0 (Node-20 shim in sandbox).

**AGENTS.md constraints in scope:**
- OFF trading-safety perimeter — `computeHeatmap` is pure display math under
  `renderer/chart/webgl/`, not on the order/decision path (verified: no OrderManager /
  risk-gates / trading-engine reference; no current call-site at all).
- Rule 5 (file-bridge hazard): both files are EXISTING → edit via python-through-bash
  with per-file EOL detection + post-write NUL/`\r\r` scan. New helper is local
  (non-exported) → no knip impact.
- Gate bar: all four green; report REAL exit codes/counts.
- Leave everything UNSTAGED for operator review (no git add/commit).
- Untouched invariants: Zustand state, Zod IPC, safeStorage, DEFAULT_EQUITY,
  SIM/SUB badge gates, sub-second aggregator feed.

**Assumptions (★ = verified this session):**
- ★ `computeHeatmap` has no call-site yet (`grep` clean) — fix is PREVENTIVE, lands
  before CHART-14 is wired into `FootprintLayer`/`ChartPanel`.
- ★ `atrSeries`/`stdevSeries` both return arrays of length `n` (= `candles.length`),
  so `for (i<n)` indexing is in-bounds.
- ★ The invariant is already documented: `QuadPaneChart.tsx:79` —
  "Reduce loop (not Math.max(...spread)) to avoid stack overflow on big arrays."
- vitest sandbox can allocate a 100k-element array of small objects (~tens of MB,
  within Node default heap). Fallback: 50k (still > 65k? no — use 100k; 50k may be
  under some engines' ceiling, so keep >=100k to guarantee the pre-fix throw).

## Layer 2 — DOMAIN MAP

| File | Symbol(s) | Change | Perimeter |
|---|---|---|---|
| `src/renderer/chart/webgl/vol-heatmap.ts` | `computeHeatmap` (lines 193-195) | replace 2 spreads w/ loop | OFF (display) |
| `src/renderer/chart/webgl/vol-heatmap.test.ts` | append 4 `describe`/`it` blocks | add coverage | OFF (test) |

- Domain folder: `renderer/chart/webgl` (not a `services/` domain). Layer: **renderer**.
- Sibling readers of the module (none today; future: `FootprintLayer.tsx`). No API/IPC/
  schema change. No type change. No export added/removed.
- **NOT touched (RISK-TOUCH, excluded):** `services/execution/*`, `services/risk/*`,
  `OrderManager`, `trading-engine.ts`, `funded/checks.ts` (feeds OrderManager gates 11/13).

## Layer 3 — TASK TREE

- **T1 — Fix the spread crash**
  - T1.1 (done in audit) read `vol-heatmap.ts`.
  - T1.2 python exact-replace the 3-line block (comment + 2 `const`s) with a single-pass
    loop computing `maxAtr`/`maxStdev` seeded at `1e-10`, plus an invariant comment.
  - T1.3 verify: `grep -c 'Math.max(' vol-heatmap.ts` excludes the spread; NUL/`\r\r`
    scan; line-count delta == +~6.
- **T2 — Pin fix + untested exports**
  - T2.1 read `vol-heatmap.test.ts` head for imports + `Candle` fixture shape.
  - T2.2 python append 4 blocks: (a) `computeHeatmap` 100k no-throw + length + [0,1]
    bound; (b) `computeHeatmap` floor/normalization semantics on a tiny series;
    (c) `tickVelocitySeries` length/range/density-ordering; (d) `vpinToIntensity` clamp.
  - T2.3 verify: NUL/`\r\r` scan; file ends with newline; `describe(`/`)` balance.
- **T3 — VERIFY** all four gates in clean `/tmp` sandbox (Layer 6 recipe).
- **T4 — CLOSE** ledger entry P-027 (SHIPPED) + audit notes (P-028/P-029) + one CHANGELOG
  `### Fixed` line under Unreleased + handoff file. UNSTAGED.

## Layer 4 — DEPENDENCY DAG

```
T1.2 ─► T1.3 ─┐
T2.1 ─► T2.2 ─► T2.3 ─► T3 (gates) ─► T4 (close)
```
- T1 and T2.1 may run in parallel; T2.2's no-throw test is independent of T1, but the
  normalization test documents post-fix behavior, so run T2 after T1.
- **APPROVAL NODES: none.** No task is RISK-TOUCH. Fully autonomous.

## Layer 5 — EXECUTION SPECS

### T1.2 — edit `vol-heatmap.ts` (python, EXISTING file)
Method (LF file, no NUL — confirmed):
```python
import io
p='src/renderer/chart/webgl/vol-heatmap.ts'
s=open(p,encoding='utf-8').read()
old="""  // Find max values for normalization
  const maxAtr   = Math.max(1e-10, ...atr)
  const maxStdev = Math.max(1e-10, ...stdev)"""
assert s.count(old)==1, ('anchor not unique', s.count(old))
new="""  // Find max values for normalization.
  // Single-pass loop, never Math.max(...spread): atr/stdev hold one entry per
  // candle and are unbounded (sub-second crypto buffers exceed 10^5), so
  // spreading them as call args throws RangeError (stack overflow). Same
  // invariant as QuadPaneChart.tsx. Floor 1e-10 preserves the prior semantics.
  let maxAtr = 1e-10, maxStdev = 1e-10
  for (let i = 0; i < n; i++) {
    const a = atr[i]!;   if (a > maxAtr)   maxAtr = a
    const d = stdev[i]!; if (d > maxStdev) maxStdev = d
  }"""
s=s.replace(old,new)
open(p,'w',encoding='utf-8',newline='').write(s)
```
- Expected artifact: `computeHeatmap` body computes max via loop; `n` already in scope.
- Validation: `grep -n 'Math.max(1e-10' vol-heatmap.ts` → no match; python NUL scan → clean.
- Failure mode: anchor count != 1 → STOP (file changed/corrupted); re-read, re-anchor.
- Fallback: none needed; equivalence is exact.

### T2.2 — append to `vol-heatmap.test.ts` (python, EXISTING file)
- Read head first for the `Candle` import and fixture shape (existing tests build
  `{time,open,high,low,close,volume}`). Reuse that shape.
- Append a single `describe('computeHeatmap — large-array safety + module coverage (P-027)', ...)`
  with ~6 `it`s. Append at EOF (after the final `})`), preceded by one blank line.
- Validation: `npx vitest run src/renderer/chart/webgl/vol-heatmap.test.ts` → all pass;
  brace balance; NUL scan clean.
- Failure mode: 100k alloc OOM → not expected; if so the no-throw still holds at the
  size that fits. Pre-fix sanity: the same test on unpatched code throws RangeError
  (proves the test bites).

### T3 — gate recipe (Layer 6).
### T4 — ledger/CHANGELOG/handoff exact text (Layer 7 + close step).

## Layer 6 — RISK AUDIT (self-adversarial)

- **"Is the fix behavior-equivalent?"** `Math.max(1e-10, ...arr)` = max(1e-10, max(arr)).
  Loop seeds `m=1e-10`, takes max over all elements ⇒ identical, incl. empty (→1e-10)
  and all-negative (atr/stdev are >=0 anyway). ✅
- **"Out-of-bounds?"** `atr.length == stdev.length == n`. Loop `i<n`. ✅
- **"Did I miss other landmines?"** grep found other `Math.max(...spread)` sites:
  `Sparkline.tsx:18`, `ChartPanel.tsx:1233-1234` (visible view only), `FundedAccountPanel.tsx:69-70`,
  `PortfolioMiniPanel.tsx:54,77-78`, `chart-types.ts:128-129` (line-break window of <=N),
  `main/index.ts:578`. All operate on **bounded** arrays (samples / visible range / equity
  snapshots / fixed window) → safe. Logged as **P-029 (audit note, no action)** so they
  are not re-flagged. Only the per-candle unbounded `vol-heatmap` case is a real risk.
- **"Degenerate inputs to the new tests?"** covered: empty (existing test), tiny, 100k.
- **"Teardown/unmount/reconnect paths?"** `computeHeatmap` is pure, owns no resources. N/A.
- **"NUL-corruption artifact path?"** mitigated: python write w/ `newline=''` (preserve LF),
  post-write byte scan for `\x00` and `\r\r` on both files.
- **"knip?"** no new export; appended tests reference existing exports only → no unused.
- **Guardrail check:** no perimeter file touched; no order/risk/kill-switch/IPC/keys.
  VETO: none. All tasks reach Layer 7.

## Layer 7 — ASSEMBLED PLAN (execution order)

1. T1.2 edit `vol-heatmap.ts` (python) → T1.3 verify (grep + NUL).
2. T2.1 read test head → T2.2 append tests (python) → T2.3 verify (NUL + brace).
3. T3 VERIFY: build `/tmp/satex-agent-p027` sandbox from `feat/d10-funded-account`,
   copy the 2 changed files in, `npm ci`-equivalent (`npm install --ignore-scripts`),
   `electron` shim, run typecheck + lint + vitest + knip (Node-20 shim). Record REAL
   exit codes + file/test counts.
4. T4 CLOSE: P-027 → SHIPPED in PROBLEM-LEDGER (with evidence + gate stamp); add P-028
   (payout-metrics `profitTarget===0` contradiction — operator ruling; no shipped profile
   triggers it) and P-029 (bounded `Math.max(...spread)` audit note). One CHANGELOG
   `### Fixed` line under `## Unreleased`. Write `Vault/Daily/2026-06-26-agent-handoff.md`.
   Everything UNSTAGED.

— END BLUEPRINT —
