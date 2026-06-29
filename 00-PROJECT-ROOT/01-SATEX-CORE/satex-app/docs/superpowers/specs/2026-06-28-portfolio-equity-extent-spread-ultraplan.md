# Ultraplan — PortfolioMiniPanel unbounded equity-array spread (P-041)

- **Date:** 2026-06-28 (operator tz America/Chicago; sandbox clock is UTC = 2026-06-29)
- **Author:** satex-psd-daily (planner / first executor)
- **Branch at plan time:** `master` @ `da6a256` (working tree carries the uncommitted P-024→P-040 backlog)
- **Status:** EXECUTING → SHIPPED (see handoff)
- **Class:** P-027 lineage — unbounded array spread into `Math.min`/`Math.max` call args.

---

## Layer 1 — OBJECTIVE

**Goal (one sentence):** Remove the unbounded `Math.min(...snapshots)` / `Math.max(...snapshots)`
spreads in `PortfolioMiniPanel.tsx` so the equity-curve panel cannot throw `RangeError: Maximum
call stack size exceeded` once a long-running session accumulates more PnL snapshots than the JS
engine's spread-argument cap, by routing both the polyline and the baseline through a single-pass
`seriesExtent` helper.

**Why it is a real defect (evidence):**
- `PortfolioMiniPanel.tsx:54` — `const min = Math.min(...snapshots), max = Math.max(...snapshots)`.
- `PortfolioMiniPanel.tsx:77-78` — the SVG baseline duplicates `Math.min(...snapshots)` /
  `Math.max(...snapshots)` four times (twice per line, identical y1==y2).
- `snapshots` ← `getPnlSnapshots(sid)` ← `db.listPnlSnapshots(sessionId)`
  (`persistence.ts:374`) which is `SELECT * FROM pnl WHERE session_id=? ORDER BY timestamp ASC`
  with **no LIMIT** — unbounded.
- Growth cadence: `trading-engine.ts:568` — `this.pnlTimer = setInterval(() => this.recordPnlSnapshot(), 60_000)`
  → one row/minute, uncapped. ~1,440 rows/day; the V8 spread arg cap (~65k–125k) is crossed at
  ~45–87 days of continuous single-session uptime. The product vision is an always-on institutional
  terminal, so this is reachable, not hypothetical.
- Same class as **P-027** (`vol-heatmap.ts` `computeHeatmap` `Math.max(...spread)`) and the
  `QuadPaneChart.tsx` reduce-loop note — both already fixed with single-pass loops.

**Success criteria (measurable):**
- Zero `Math.min(...` / `Math.max(...` spread of `snapshots` remains in `PortfolioMiniPanel.tsx`
  (grep == 0 matches for `\.\.\.snapshots`).
- New pure helper `seriesExtent` exists with a regression test proving no throw on a 300k-element
  array (mirrors the existing `vol-heatmap.test.ts:124` 300k convention).
- Gate deltas: vitest **+1 test file / +N tests** (the `extent.test.ts` cases); typecheck/lint/knip
  unchanged at exit 0. No behavioural change to the rendered curve for in-cap arrays.

**AGENTS.md constraints that apply:**
- Off the trading-safety perimeter — renderer display only; blocks no order. (Verified: the other
  `getPnlSnapshots` consumer, `risk-gates.ts:308`, iterates with a `for` loop — no spread — so the
  perimeter is already safe and is **not** touched.)
- CRITICAL TOOL HAZARD: `PortfolioMiniPanel.tsx` is an EXISTING CRLF file → edit via python with
  per-file EOL detection; NUL/CRCR scan after every edit; assert anchor uniqueness (count==1).
- New files (`extent.ts`, `extent.test.ts`, this blueprint) written normally.
- Leave everything UNSTAGED for operator review; no git add/commit.

**Assumptions (flagged):**
- A1 (verified): `listPnlSnapshots` has no LIMIT — read at `persistence.ts:374`.
- A2 (verified): 60s cadence — read at `trading-engine.ts:568`.
- A3 (verified): `risk-gates.ts` does not spread the snapshot array — read at `risk-gates.ts:305-318`.
- A4 (verified): `FundedAccountPanel` (`ledger.slice(-10)`) and `components/Sparkline` (quote
  sparklines) spreads are bounded — NOT in scope.

---

## Layer 2 — DOMAIN MAP

| File | Role | Layer / domain | Risk |
|---|---|---|---|
| `src/renderer/panels/PortfolioMiniPanel.tsx` | the defect site (3 edits) | renderer / panels | off-perimeter |
| `src/renderer/lib/extent.ts` | NEW pure helper `seriesExtent` | renderer / lib | off-perimeter |
| `src/renderer/lib/extent.test.ts` | NEW vitest unit test | renderer / lib | off-perimeter |
| `src/main/services/persistence.ts:374` | evidence only (unbounded source) | main / system | READ-ONLY |
| `src/main/core/trading-engine.ts:568` | evidence only (cadence) | main / core | READ-ONLY |
| `src/main/services/risk-gates.ts:308` | evidence only (safe consumer) | main / risk ⚠️ | NOT TOUCHED |

No RISK-TOUCH files are modified. The only ⚠️ file (`risk-gates.ts`) is read for evidence and
confirmed safe; it is not edited.

---

## Layer 3 — TASK TREE (atomic actions)

- **T1 — create the pure helper**
  - T1.1 Write `src/renderer/lib/extent.ts` exporting `Extent` interface + `seriesExtent(values)`.
- **T2 — create the test**
  - T2.1 Write `src/renderer/lib/extent.test.ts` with: empty → identity extent; normal series;
    negative/zero-crossing (CL crude); single element; 300k-element no-throw + correctness.
- **T3 — fix the panel (EXISTING CRLF file, python edits)**
  - T3.1 Detect EOL; assert each anchor count==1.
  - T3.2 Add `import { seriesExtent } from '../lib/extent'` after the `@shared/constants` import.
  - T3.3 Insert `eqMin/eqMax` extent memo; rewrite `path` useMemo to use `eqMin/eqMax` (drop the
    two spreads); add a guarded `baseY` const.
  - T3.4 Replace the JSX `y1`/`y2` spread expressions with `{baseY}`.
  - T3.5 NUL/CRCR byte-scan the panel; grep-assert `...snapshots` count == 0.
- **T4 — gates** (typecheck, lint, vitest sharded, knip with Node-20 shim).
- **T5 — close** (ledger P-041 SHIPPED, CHANGELOG under first `### Fixed`, handoff).

---

## Layer 4 — DEPENDENCY DAG

```
T1.1 ──┬─► T3.2 ─► T3.3 ─► T3.4 ─► T3.5 ─► T4 ─► T5
T2.1 ──┘                                   ▲
       (T2.1 depends on T1.1 export shape) │
```

Sequential: T1.1 before T2.1 and T3.x (they import it). T3.2→T3.3→T3.4→T3.5 in order. T4 after all
code. T5 after T4 green. **No APPROVAL NODE** — no RISK-TOUCH task in this plan.

---

## Layer 5 — EXECUTION SPECS

### T1.1 — `src/renderer/lib/extent.ts` (NEW)
- Method: `Write` (new file, no hazard). Exports `interface Extent { min:number; max:number }` and
  `export function seriesExtent(values: readonly number[]): Extent` using an index `for` loop with
  `if (v < min) min = v; if (v > max) max = v`, seeded `min=Infinity,max=-Infinity`.
- Validation: `npx tsc` clean; imported by panel + test so knip sees it used.
- Failure mode: none expected. Fallback: inline the loop in the panel if a lib export trips knip
  (it won't — it is imported).

### T2.1 — `src/renderer/lib/extent.test.ts` (NEW)
- Method: `Write`. Cases listed in T2.1. The 300k case uses
  `Array.from({ length: 300_000 }, (_, i) => i % 1000)` and asserts `seriesExtent(big)` does not
  throw and equals `{ min: 0, max: 999 }`. (No negative assertion that the spread throws — that is
  engine-version-flaky; the existing vol-heatmap test uses the same conservative shape.)
- Validation: `npx vitest run src/renderer/lib/extent.test.ts` → all pass.

### T3.2 — import (EXISTING CRLF; python)
- Anchor (assert count==1): `import { DEFAULT_EQUITY } from '@shared/constants'`
- Insert after it: `\r\nimport { seriesExtent } from '../lib/extent'`

### T3.3 — extent memo + path rewrite (python)
- Anchor (assert count==1): the full current `path` useMemo block (lines ~51-61).
- Replacement: a `eqMin/eqMax` `useMemo(() => seriesExtent(snapshots), [snapshots])`, the `path`
  useMemo using `eqMin/eqMax` (deps `[snapshots, eqMin, eqMax]`), and a guarded
  `baseY = snapshots.length >= 2 ? 50 - ((DEFAULT_EQUITY - eqMin)/Math.max(1, eqMax - eqMin))*88 + 6 : 0`.

### T3.4 — JSX baseline (python)
- Anchor (assert count==1): the two-line `y1=…Math.min(...snapshots)…` / `y2=…` block.
- Replacement: `y1={baseY}` / `y2={baseY}`.

### T3.5 — verify
- `python` byte-read panel: assert `b'\x00' not in data` and `b'\r\r' not in data`.
- `grep -c '\.\.\.snapshots' PortfolioMiniPanel.tsx` → expect `0`.

### T4 — gates (from `00-PROJECT-ROOT/01-SATEX-CORE/satex-app`)
- `npm run typecheck` → exit 0.
- `npm run lint` → exit 0.
- vitest sharded `npx vitest run --shard=k/8` k=1..8 (full run exceeds the 45s bash wall).
- knip: `NODE_OPTIONS="--require /tmp/satex-agent-node20-shim.js" npx knip` (shim sets
  process.version v20.19.0; recreate it — /tmp does not persist).
- Expected: vitest test-file count +1 (new `extent.test.ts`), test count +5.

### T5 — close
- Ledger: add **P-041** under `## Shipped — awaiting verification` (newest first), full
  PROBLEM/SOLUTIONS/DECISION/SHIPPED/gate sections; add a session entry.
- CHANGELOG: one line under the FIRST `### Fixed` inside `## Unreleased`.
- Handoff: `Vault/Daily/2026-06-28-agent-handoff.md`.

---

## Layer 6 — RISK AUDIT (self-adversarial)

- **"Is the empty-array path safe?"** `seriesExtent([])` → `{min:Infinity,max:-Infinity}`. The `path`
  memo guards `snapshots.length < 2 → ''`; `baseY` guards `>= 2 → else 0`; the SVG renders only when
  `path` is truthy. So Infinity never reaches layout math. ✔
- **"Did I change the rendered curve for normal (in-cap) arrays?"** No — `seriesExtent` returns the
  same min/max as the spread for any finite array; span/`baseY` formulas are byte-identical other
  than the variable source. ✔ (A NaN snapshot would poison both old and new identically — no
  regression; out of scope.)
- **"Did I touch the perimeter?"** No. `risk-gates.ts` reads the same data but via a `for` loop;
  left untouched and re-verified. ✔
- **"NUL/CRCR corruption?"** Mandatory byte-scan after every panel edit (T3.5). ✔
- **"knip dead-export?"** `seriesExtent` is imported by the panel and the test → used. ✔
- **"Degenerate: all-equal snapshots?"** `span = (eqMax - eqMin) || 1` and `Math.max(1, …)` keep the
  divisor ≥ 1 — flat line, no div-by-zero. ✔ (unchanged from original)
- **Root vs. symptom:** the true root is the unbounded `listPnlSnapshots` query, but adding a LIMIT
  would change what `risk-gates.ts:308` (PERIMETER) sees — a one-way-door behavioural change
  requiring operator sign-off. **VETOED** for this session. The renderer-side single-pass fix is the
  correct off-perimeter scope; the query-LIMIT option is recorded in the ledger as operator-deferred.

---

## Layer 7 — ASSEMBLED PLAN

Execute T1.1 → T2.1 → T3.2 → T3.3 → T3.4 → T3.5 → T4 → T5, gates after T3, close after green.
Deliverables: `extent.ts`, `extent.test.ts`, a 3-edit `PortfolioMiniPanel.tsx`, ledger P-041,
CHANGELOG line, handoff. No commits — unstaged for operator review.
