---
type: ultraplan
title: Track B (B1) — Surface significance-adjusted expectancy on the DISCIPLINE panel
date: 2026-07-13
status: EXECUTED 2026-07-13 — branch feat/discipline-edge, gates green in-sandbox; live-render check + CI + operator sign-off pending (ledger P-101)
branch-target: feat/discipline-edge (off master @ 32ceccd)
supersedes-claim: the decision doc's "implement CONSTITUTION §3.6 in pattern-learner.ts" — see §6: unimplemented narrative doctrine, not a pattern-learner.ts mandate
gates: typecheck · lint · test · knip (all four, real exit codes)
---

# Blueprint — Surface P-096 expectancy on the DISCIPLINE panel

> The numbers already exist. `self-eval.ts` computes PSR and DSR per (strategy ×
> symbol) every night and prints them to a markdown file. They never reach the
> renderer. This plan retains them structurally, exposes them read-only, and renders
> the top strategies by Deflated Sharpe on the DISCIPLINE panel. No new math, no
> trading-path contact, one read-only IPC channel.

Decision log (Layer 1):
- **D1 = B1 only.** Plan the ready, contained expectancy-surface. B2 (Market-Wizards
  trade-retrospective classifier) is deferred to its own ultraplan.
- **D2 = mini-table, top 3 by DSR.** Rows: `strategy · symbol`, DSR%, verdict dot.
- **D3 = retain rows in `SelfEvalService` + a read-only IPC channel.** No file
  parsing, no new persistence.

---

## §1 Objective Clarification

**Core goal.** Show the operator which of the system's own strategies carry a
statistically real edge, on the DISCIPLINE panel, using the PSR/DSR the nightly
self-eval already produces.

**Success criteria (a gate or metric flips, not "looks done"):**
- The DISCIPLINE panel renders an EDGE block: a 3-row table of the top strategies by
  DSR (`strategy · symbol`, DSR%, verdict), plus the report's age, plus a verdict
  count header. Before this change the panel shows nothing about strategy edge.
- The verdict thresholds render from ONE shared function, consumed by both
  `renderReportMd` (main) and the panel (renderer). No duplicated threshold literals.
- All four gates green: `typecheck` 0, `lint` 0, `test` 0 fail, `knip` 0. New pure
  logic (verdict classification, top-3 ranking with null handling) is unit-tested.
- Live-render check: with an on-demand `runSelfEvalNow`, the panel shows real rows and
  the mini-table fits the secondary-row height without clipping.

**Constraints (named against the guardrails):**
- Section 0.4 verification, Section 0.7 calibrated uncertainty: a null DSR (n<2 or
  flat equity) renders as `n/a`, never as a fabricated number.
- §3.6 invariant 3 + significance.ts header: self-eval and significance are STRICTLY
  OBSERVATIONAL. The new channel is read-only (invoke returns data, no setter). No
  path from these numbers to an order, a size, or an autonomy multiplier.
- CLAUDE.md invariants: Zustand only (panel reads via IPC/store, no cross-store
  coupling); IPC request payloads Zod-validated (this GET carries no request, matching
  `CALIBRATION_GET`); clean up the poll interval on unmount (the PR #6 leak lesson);
  no macOS target.
- The panel is a compact secondary-row instrument. A 3-row table plus the existing
  Conviction + AUDIT/RISK blocks risks vertical overflow (§6 CRITIC).

**Environment.** Electron main (`SelfEvalService`, `trading-engine`, `index.ts` IPC),
preload bridge, shared types + shared backtest, renderer (`DisciplinePanel`, a new
pure selector, `globals.css`). Broker facet: none. Data feed: none (reads a nightly
in-memory artifact).

**Assumptions (flagged):**
- `SelfEvalService.runOnce` holds the typed `rows` array in scope (verified: lines
  183-232). Retaining the last run's rows is a field assignment, not a refactor.
- In simulator/replay mode `this.selfEval` can be null (verified: `getSelfEvalStatus`
  guards with `?.`). The report getter returns null there. Panel shows "no report."
- Report rows are bounded (watchlist × strategy roster, small). Retaining the last
  run only is memory-safe.

**Unknowns.** None blocking. Design defaults chosen and recorded in §5 (ranking
tie-breaks, cold-boot copy, poll cadence).

---

## §2 Domain Mapping

**Classification.** Operational + data-presentation problem. Read an existing
observational artifact, move it across the IPC boundary read-only, render it. Zero
functional trading logic, zero risk logic.

**Specialist-agent touch (of the 8):** AUDIT and LEARN outputs are being *displayed*.
No agent behavior changes. RISK is untouched (its store is already read on the panel
for the posture strip; no new read).

**Broker facets:** none. No session lifecycle call-site touched.

**Blast radius / invariant in play:** the load-bearing invariant here is the
observational wall (§3.6 invariant 3, restated in `significance.ts` and
`self-eval.ts` headers). The plan must not create a write path or a decision path from
significance numbers. It does not: the channel is invoke-only, the panel is display.

**Touch-map (files):**
```
shared:   types.ts (+DTO)  ·  backtest/significance.ts OR new edge-verdict.ts (+classifyEdge)
          ipc-channels.ts (+SELF_EVAL_REPORT_GET)  ·  ipc-schemas.ts (no request schema needed)
main:     services/self-eval.ts (retain rows + getLastReport + use classifyEdge)
          core/trading-engine.ts (+getSelfEvalReport)  ·  index.ts (+register channel)
preload:  index.ts (+getSelfEvalReport)
renderer: lib/self-eval-edge.ts (+selector, pure)  ·  lib/self-eval-edge.test.ts
          panels/DisciplinePanel.tsx (+EDGE block)  ·  globals.css (+.bb-disc-edge-*)
```

---

## §3 Task Decomposition

**T1 — Shared DTO.** In `shared/types.ts` add the renderer-facing report type so the
renderer never imports backtest internals.
- `SelfEvalReportRow { strategy: string; symbol: string; tradeCount: number; hitRate: number; sharpe: number; maxDrawdown: number; psr: number | null; dsr: number | null; minTRL: number | null; verdict: EdgeVerdict }`
- `SelfEvalReport { generatedAt: number; trials: number; rows: SelfEvalReportRow[] }`
- `EdgeVerdict = 'real' | 'selection-risk' | 'noise'`

**T2 — Extract the verdict, one source of truth.** ⚠️ shared-logic. The
`real/selection-risk/noise` thresholds live inline in `self-eval.ts:116-119`. Extract
`classifyEdge(sig): EdgeVerdict` into `@shared/backtest/significance.ts` (or a new
`@shared/backtest/edge-verdict.ts`). Rewrite `renderReportMd` to call it. Both main and
renderer import it. Pure, unit-tested.
- Threshold contract (preserved from current code): `dsr != null && dsr >= 0.95 → real`;
  else `psr != null && psr >= 0.95 → selection-risk`; else `noise`.

**T3 — Retain rows in `SelfEvalService`.** Add a private `lastReport: SelfEvalReport | null`,
built at the end of `runOnce` from the same `rows` used for the markdown (map each row
to a `SelfEvalReportRow` via `classifyEdge`). Add `getLastReport(): SelfEvalReport | null`.
No change to scheduling, write path, or `SelfEvalRunResult`.

**T4 — Engine getter.** In `trading-engine.ts`, beside `getSelfEvalStatus` (~line 1562),
add `getSelfEvalReport(): SelfEvalReport | null { return this.selfEval?.getLastReport() ?? null }`.

**T5 — IPC channel (read-only).** 
- `ipc-channels.ts`: add `SELF_EVAL_REPORT_GET`.
- `index.ts` (~line 800, beside `CALIBRATION_GET`): `register(IPC.SELF_EVAL_REPORT_GET, () => engine.getSelfEvalReport())`.
- No request schema (no payload), exactly like `CALIBRATION_GET`.
- `preload/index.ts` (~line 70, beside `getSelfEvalStatus`): `getSelfEvalReport: () => ipcRenderer.invoke(IPC.SELF_EVAL_REPORT_GET) as Promise<SelfEvalReport | null>`.
- The `window.satex` type surface (wherever the preload API type is declared — preload d.ts or shared) gains the same method; typecheck enforces it, but it is an explicit touch point, not a surprise.

**T6 — Renderer selector (pure).** `renderer/lib/self-eval-edge.ts`:
- `rankTopByDsr(report, n=3): SelfEvalReportRow[]` — sort by DSR desc, nulls last;
  tie-break by PSR desc then sharpe desc; take n.
- `verdictCounts(report): { real: number; selectionRisk: number; noise: number }`.
- Formatters reuse `fmtRelTime` from `discipline.ts` for report age (no duplication).
- `self-eval-edge.test.ts`: null-DSR ordering, tie-breaks, fewer-than-3 rows,
  empty/null report, count correctness.

**T7 — Panel EDGE block.** In `DisciplinePanel.tsx`: poll `getSelfEvalReport` at the
existing 60s self-audit cadence (one added pull, same effect pattern, same cleanup).
Render a third block under Conviction/AUDIT-RISK:
- Header: `EDGE` + counts (`2 real · 1 selection-risk · 3 noise`) + report age.
- Up to 3 rows: `strategy · symbol` (ellipsis), DSR% (tabular), verdict dot (tone).
- Cold-boot / null report: `No self-eval yet — runs nightly 02:30, or trigger in Settings.`
- Overflow guard: `overflow-y: auto` on the body or a bounded EDGE sub-region.

**T8 — Styles.** `globals.css`: `.bb-disc-edge-*` following the `.bb-disc-row` idiom.
`EdgeVerdict → tone`: real=`--bb-pos`, selection-risk=`--bb-warn`, noise=`--bb-txt-dim`.

**T9 — Gates + live-render.** Run all four. Then launch the app, `runSelfEvalNow` from
Settings, confirm the EDGE table shows real rows and fits the panel height.

None of T1-T9 is RISK-TOUCH. T3-T5 are trading-engine-adjacent (they live in the engine
+ main IPC), so the PR carries operator sign-off per AGENTS.md.

---

## §4 Dependency + Ordering (DAG)

```
T1 (DTO) ─────────────┬──────────────► T6 (selector) ──► T7 (panel) ──► T8 (styles) ──► T9 (gates+render)
T2 (classifyEdge) ────┴──► T3 (retain)                        ▲
                              └──► T4 (engine) ──► T5 (IPC/preload) ──┘
```

- **Start in parallel:** T1 (DTO) and T2 (classifyEdge extraction + tests). Independent.
- **Chain:** T2 → T3 → T4 → T5 (main side, each depends on the prior).
- **Chain:** (T1 + T2) → T6 → T7 → T8.
- **Join:** T7 needs T5 (the preload method) and T6 (the selector). T9 is terminal.
- **Approval node:** the PR (after T9) is a human-sign-off gate — engine + IPC surface,
  per AGENTS.md. No mid-build approval node (nothing is a one-way door; no risk param,
  no live capital).

Critical path: T2 → T3 → T4 → T5 → T7 → T8 → T9.

---

## §5 Execution Specification

**T2 classifyEdge** — method: pure function, same thresholds as `self-eval.ts:116-119`.
Artifacts: `classifyEdge` export + `edge-verdict.test.ts` (or added to
`significance.test.ts`). Validation: the extracted call in `renderReportMd` produces
byte-identical markdown for a fixed input (a characterization test on `renderReportMd`
before/after). Failure mode: threshold drift — guarded by the shared function + the
characterization test. Fallback: if `renderReportMd` output diverges, the extraction is
wrong; revert to inline and re-extract.

**T3 retain rows** — method: assign `this.lastReport` at the end of `runOnce`, after the
`withDsr` second pass (line 232), mapping `rows → SelfEvalReportRow[]`. Artifacts:
`getLastReport()` + a unit test on a `SelfEvalService` with injected deps (the service
is already fully DI-tested). Validation: test that after `runOnce`, `getLastReport()`
returns rows whose verdicts match `classifyEdge`. Failure mode: null `sig.dsr` on
single-trial runs — expected; DTO carries `dsr: number | null`. Fallback: none needed.

**T4 engine getter** — mirror `getSelfEvalStatus`. Validation: typecheck. Failure mode:
`this.selfEval` null in sim/replay — `?? null` handles it.

**T5 IPC** — copy the `CALIBRATION_GET` triple (channel const, `register`, preload cast).
Validation: typecheck + a renderer smoke that `window.satex.getSelfEvalReport` exists.
Failure mode: channel name typo — caught by typecheck on the `IPC` enum. No Zod schema
(no request payload), consistent with `CALIBRATION_GET` / `SELF_EVAL_GET`.

**T6 selector** — method: pure ranking. `rankTopByDsr`: `rows.slice().sort(cmp).slice(0,n)`
where `cmp` orders non-null DSR desc, nulls last, tie-break PSR desc then sharpe desc.
Artifacts + tests as in §3. Validation: `test` gate. Failure mode: all-null DSR (early
program) — returns the PSR/sharpe-ranked top 3, verdicts render `noise`/`selection-risk`.

**T7 panel** — method: add one `useEffect` poll (60s) + one state slot, feed the selector,
render. Reuse `toneVar` + `fmtRelTime` from the existing panel/`discipline.ts`.
Validation: `typecheck` + live render (T9). Failure mode: overflow — the guard in T7 +
the T9 height check. Cleanup: `clearInterval` + `cancelled` flag on unmount (mandatory,
PR #6 lesson).

**T8 styles** — single-class selectors only (avoid the specificity traps the design
skill warns about). Reduced-motion: nothing animates here, so nothing to gate.

**T9 gates + render** — `npm run typecheck && npm run lint && npm test && npm run knip`
from `apps/satex-terminal/`, real exit codes. Then `npm run dev`, Settings →
runSelfEvalNow, observe the EDGE block.

**Skills the build phase uses (your "use many skills" ask):**
`superpowers:test-driven-development` for T2/T3/T6 (pure logic, test-first);
`frontend-design` for T7/T8 (the EDGE block must sit inside the Black Box system, not
fight the conviction meter for attention); `gates` skill for T9; then
`superpowers:requesting-code-review` + the `/autoplan` handoff before merge.

---

## §6 Risk + Ambiguity Audit (self-adversarial, VETO power)

**CRITIC pass — how is this wrong, what did I leave out?**
- *Premise error caught (the big one):* the decision doc claimed CONSTITUTION §3.6
  prescribes a loss/win classification and that `pattern-learner.ts` should implement
  it. Verified: §3.6 does contain that language verbatim ("investigate high-confidence
  losses, ignore low-confidence wins, respond to losing streaks by shrinking") — but as
  model-update hygiene, narrative guidance carried forward from v2. No code implements
  it, and nothing in §3.6 mandates `pattern-learner.ts` as the home: that file is a
  continuous (feature × regime) regression learner that by invariant never touches the
  brain table. The doctrine exists as narrative guidance, not as a pattern-learner.ts
  mandate — so this plan does not build there. The Market-Wizards classifier is real
  but is B2, deferred, and belongs in a new LEARN-domain retrospective, not here.
- *Threshold drift:* the verdict logic is inline today. Left un-extracted, the panel
  would duplicate it and drift. T2 fixes this (one shared function). Caught, planned.
- *Teardown:* the panel adds a timer. Not clearing it repeats the PR #6 ResizeObserver
  leak. T7 mandates `clearInterval` + `cancelled` on unmount.
- *Overflow:* the operator chose the mini-table (D2) over my one-liner. Three extra rows
  in a compact panel can clip. Mitigated by the T7 overflow guard + the T9 live height
  check. This is the one visual risk and it is owned.
- *Cold-boot / null:* no report until the first nightly (or on-demand) run. Handled with
  explicit copy, not a blank or a spinner-forever.
- *knip:* new exported types must be consumed. Follow the Track A `DisciplineFactor`
  lesson — export only what a consumer imports by name; keep internal helpers unexported.

**RISK-AGENT pass — Section 5 + Section 8 check.**
- Risk per trade, open exposure, daily loss, drawdown, positions: **untouched.** No
  order logic, no sizing, no risk-param read or write.
- Live capital: **none.** No broker facet, no session call-site.
- Self-modification of risk params: **none.** The channel is read-only; no setter.
- Safety-layer bypass: **none.** The observational wall (§3.6 invariant 3) is preserved;
  significance numbers reach a display surface only, never a decision surface.
- Single-signal trade logic: **N/A**, no trade logic added.

**Verdict: NO VETO.** The plan clears Section 0, Section 5, Section 8. The single
enforced guardrail: the new IPC stays invoke-only (no `_SET` sibling), and the panel
stays display-only. Recorded so the executor cannot widen it into a write path.

---

## §7 Final Assembly

**Ordered execution sequence (from §4 DAG):**
1. T1 DTO + T2 classifyEdge (parallel)
2. T3 retain rows → T4 engine getter → T5 IPC + preload
3. T6 selector (needs T1+T2)
4. T7 panel (needs T5+T6) → T8 styles
5. T9 gates + live-render
6. Human-sign-off PR (engine/IPC surface)

**Acceptance criteria (as gate outcomes):**
- `typecheck` exit 0 with the new DTO, channel, engine getter, preload method.
- `lint` exit 0.
- `test` exit 0 — new tests: `classifyEdge` (thresholds + nulls), `renderReportMd`
  characterization (byte-identical after extraction), `SelfEvalService.getLastReport`,
  `rankTopByDsr` (null ordering, tie-breaks, <3 rows, empty).
- `knip` exit 0, no orphan exports from the new modules.
- Live: DISCIPLINE panel shows the EDGE mini-table with real rows after `runSelfEvalNow`,
  fits the panel height, report age renders, cold-boot shows the explicit "no self-eval
  yet" copy.
- Metric that flips: strategy edge (PSR/DSR verdicts) is visible to the operator on the
  cockpit for the first time; before, it lived only in a vault markdown file.

**Out of scope (explicit):** the B2 Market-Wizards trade-retrospective classifier; any
change to `pattern-learner.ts`; any new persistence; any change to `SelfEvalStatus` or
the nightly schedule; the full per-strategy table (D2 chose top-3, detail beyond that is
a later view).

**Estimated surface:** ~9 modified files, ~2-3 new files (per the §2 touch-map:
types.ts, significance.ts or edge-verdict.ts, ipc-channels.ts, self-eval.ts,
trading-engine.ts, main index.ts, preload index.ts + its `window.satex` type surface,
DisciplinePanel.tsx, globals.css modified; selector + tests new). Comparable to the
Track A DISCIPLINE panel in size and risk profile (that shipped green in one session).
