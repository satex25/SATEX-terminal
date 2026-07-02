# ULTRAPLAN BLUEPRINT — Wire the Self-Diagnostic Core into engine + IPC + a Health panel (P-037)

> Execution-ready plan produced by `/ultraplan`. Sections carry stable IDs (§1-§7) for
> the review loop. Keep this file in sync with every accepted revision.

| Field | Value |
|---|---|
| **Goal (verbatim)** | "the shit out of it. Sounds fascinating. Please ensure a wildly harsh dedication to detail. I need every single aspect to fit together absolutely seamlessly. Run now." (re: /ultraplan P-037 — wire the Self-Diagnostic Core) |
| **Slug** | health-core-wiring-p037 |
| **Date** | 2026-06-27 |
| **Branch** | feat/d10-funded-account @ e158e48 |
| **Status** | APPROVED → EXECUTED (2026-06-27) |
| **Execution route** | EXECUTE (built per §7; all four gates green; UNSTAGED) |
| **Risk class** | RISK-TOUCH (edits `trading-engine.ts` — observability path only, no order/risk mutation; the engine edit is an explicit approval node) |

---

## §1 — Objective Clarification

**Core goal.** Make the SATEX terminal *show* what `diagnoseHealth` already knows: build a
`HealthSignals` snapshot from live engine state, run it through the pure P-036 core every status
tick, and push the resulting graded `HealthReport` to a dedicated renderer Health panel — so a kink
(silent feed stall, reconnecting session, drawdown breach, heap leak) is named, evidenced, and shown
with its constitution-mandated remediation *before the operator goes looking*. Diagnosis only: every
remediation stays advisory text. Nothing auto-executes (D1).

**Success criteria** (measurable, tied to gates / priority stack):
- P0 (integrity): `TradingEngine.healthCheck()` stops returning a hardcoded `ok: true` and returns a
  real `HealthReport`; a new `getHealthReport()` returns a graded verdict derived from live state.
- P0 (integrity): a new `HEALTH_REPORT` push channel delivers the report to the renderer, diff-gated
  so it fires only on severity-or-findings-set change (zero added renderer churn at the 2 s cadence).
- A dedicated `HealthPanel.tsx` renders severity (green/amber/red) + every finding's summary,
  evidence, remediation, and §ref; mounts via the same registry path as `SystemLogsPanel`.
- Gates: `typecheck` exit 0 · `lint` exit 0 (0 warnings) · `vitest` 0 fail with new pure-adapter
  tests (`health-signals.test.ts`) and engine/IPC coverage where unit-testable · `knip` exit 0, no
  new unused exports (every new export reachable from a consumer or test).
- No regression to the live-capital path: zero new call to OrderManager / risk-gates / Alpaca submit;
  the engine diff is read-only state gathering + one emit, isolated to a thin call-site.

**Constraints** (Section 0 + Section 5 + CLAUDE.md invariants by name):
- 0.1 No fabricated signals — a signal with no source ships as `null` (diagnose returns no-finding),
  never a guessed number. Tier C (errorRate, lastError) ships `null` this round (D2).
- 0.8 / Section 8 No safety-layer bypass, no risk-param self-mod — this layer reads state and emits a
  report; it cannot place, cancel, size, or veto an order. Off the execution perimeter by construction.
- 0.7 Calibrated, not alarmist — mode-aware suppression (sim/replay drop live-broker findings) is
  already in the core and is preserved end to end.
- CLAUDE.md: **State is Zustand, not Redux** — the renderer holds the report in a Zustand store; no
  cross-store coupling, it flows engine → IPC → preload → store → panel.
- CLAUDE.md: **IPC payloads stay Zod-validated** — inbound renderer→main only. `HEALTH_REPORT` is an
  outbound push (renderer sends nothing), so it follows the `SYSTEM_STATUS` precedent: typed, in
  `PUSH_CHANNELS`, no inbound Zod. The `HEALTH_CHECK` invoke takes no payload → no schema.
- CLAUDE.md: **Clean up what you create** — any new listener / timer / panel effect disconnects on
  unmount (the PR #6 ResizeObserver-leak lesson). Engine reuses the existing 2 s tick — no new timer.
- CLAUDE.md: **`DEFAULT_EQUITY`, not `STARTING_EQUITY`** — drawdown reads live `peakEquity` vs current
  equity from the session/OrderManager, never a constant.

**Environment.** Electron main (`trading-engine.ts`, `index.ts`) + shared (`@shared/health`,
`ipc-channels.ts`) + preload (`preload/index.ts`) + renderer (`stores/`, `panels/`, `hooks/useIPC`).
Broker facet read only: `AlpacaBrokerSession.state` + `.data.msSinceLastTick()` (MarketDataSource /
AccountSyncer surfaces) — no facet is mutated.

**Assumptions.**
- A1: `diagnoseHealth` + `HealthSignals`/`HealthReport` exist and are gate-green (P-036, this session). — VERIFIED (97/1247 green).
- A2: Engine status tick (~2 s) assembles `SystemStatus` at trading-engine.ts:2075 and already
  computes `connected`, `tickHz`, `msSinceLastTick` (via `session.data.msSinceLastTick()`), `memMb`
  (`mem.heapUsed`), `sessionState` (`this.session?.state`). — VERIFIED (read 2071-2089).
- A3: `peakEquity` is tracked on the session record (`Math.max(sess.peakEquity, eq)` at 2051) and
  current equity is `this.om.getAccount().equity`. Drawdown is computable now, no new plumbing. — VERIFIED (read 2051, 849).
- A4: The `FeedStatus` diff-gate (2092-2103: `feedStatusListeners` + `lastFeedStatus` + onFeedStatus)
  is the exact pattern to mirror for `HealthReport`. — VERIFIED (read 2092-2103, 281-282, 901).
- A5: Push channels register in `PUSH_CHANNELS` (ipc-channels.ts:292); preload bridges via `on(...)`
  (`onSystemStatus` at preload:47); renderer subscribes in `useIPC.ts:60` into `accountStore`. — VERIFIED.
- A6: `SystemLogsPanel.tsx` / `RegimeDashboardPanel.tsx` are the template for a read-only diagnostic
  panel; the precise registry/workspace mount point is resolved by reading how `SystemLogsPanel` is
  registered (Layer 5 sub-step §5.6a). — PARTIALLY VERIFIED (panels exist; mount path read at execute time).
- A7: memory-growth and wsDown are NOT tracked today; they need a tiny in-engine tracker (mem-sample
  ring; session-state-transition timestamp). errorRate + lastError are NOT tracked; ship `null`. — VERIFIED (grep: no `private lastError`, no mem-trend, no wsDown field).

**Unknowns (resolved in Decision Log).** Boundary → D1. Signal ambition → D2. Transport → D3. UI
surface → D4. (All four resolved before this draft.)

---

## §2 — Domain Mapping

**Problem classification.** Primarily **operational** (observability / system-integrity surfacing)
with a **temporal** edge (rolling trends: mem-growth %/hr, wsDown duration, drawdown from peak). Not a
**risk** problem in the Section-5 sense — it computes a drawdown *reading* for display and never sizes,
gates, or executes. Not a **data** problem — it consumes already-validated internal signals, ingests
no external feed. The work is "fuse and surface existing truth," which is exactly why it is off the
execution perimeter while still touching the engine file.

**Touch-map.**
- **Agents:** AUDIT (this is the self-diagnostic / PASS-FAIL-of-the-system surface), with read-only
  observation of DATA (feed staleness) and RISK (drawdown reading — *read*, never a gate). EXEC is
  explicitly NOT touched.
- **Broker facets:** read only — `session.state` (session machine) and `session.data.msSinceLastTick()`
  (MarketDataSource). No OrderRouter / AccountSyncer / SymbolResolver mutation.
- **Files / call-sites in blast radius:**
  - `src/shared/health/health-signals.ts` (NEW — pure adapter + trend helpers) + `.test.ts` (NEW).
  - `src/shared/health/index.ts` (NEW — barrel; or extend if added) re-exporting diagnose + signals.
  - `src/main/core/trading-engine.ts` (EDIT — ⚠️ engine file: add mem-ring + wsDown tracker fields,
    `getHealthReport()`, `onHealthReport()` + diff-gated emit in the existing status tick; upgrade
    `healthCheck()`).
  - `src/main/index.ts` (EDIT — `engine.onHealthReport(r => push(IPC.HEALTH_REPORT, r))`; upgrade the
    `HEALTH_CHECK` register to return `engine.getHealthReport()`).
  - `src/shared/ipc-channels.ts` (EDIT — add `HEALTH_REPORT` channel + `PUSH_CHANNELS` entry).
  - `src/preload/index.ts` (EDIT — `onHealthReport(cb)` bridge).
  - `src/renderer/stores/healthStore.ts` (NEW — Zustand store holding latest `HealthReport`).
  - `src/renderer/hooks/useIPC.ts` (EDIT — subscribe `onHealthReport` → store; unsub on cleanup).
  - `src/renderer/panels/HealthPanel.tsx` (NEW — dockable panel) + registry mount (EDIT, per §5.6a).
- **Load-bearing invariant at risk:** "Clean up what you create" (new engine listener set + renderer
  subscription + panel effects must tear down) and "State is Zustand, not Redux" (new store). The
  engine-file edit is the one that earns the RISK-TOUCH label and the approval node, even though it is
  observability-only.

---

## §3 — Task Decomposition

> Major → sub → micro → atomic. ⚠️ RISK-TOUCH = touches the engine file / capital-adjacent reads.

### §3.1 — Pure signal adapter (`@shared/health/health-signals.ts`)
- **Purpose:** keep the engine edit a thin, dumb call-site by putting all transformation in pure,
  tested functions. **Inputs:** a flat `HealthSnapshot` of raw fields the engine already has.
  **Outputs:** a `HealthSignals` (the P-036 core's input).
- **Tools:** Write (new file). **Constraints:** pure, no clock reads, no engine import. **Depends on:** P-036 types.
- Subtasks:
  - §3.1a `computeMemGrowthPctPerHr(samples: {t:number; mb:number}[]): number | null` — least-squares
    or first-vs-last over a bounded ring; `null` when < 2 samples or span too short. Atomic: write fn.
  - §3.1b `computeDrawdownPct(peakEquity, currentEquity): number` — `peak<=0 ? 0 : max(0,(peak-cur)/peak)`.
    Atomic: write fn.
  - §3.1c `composeHealthSignals(raw: HealthSnapshot): HealthSignals` — assemble the interface, passing
    `errorRatePct:null` + `lastError` straight through (Tier C). Atomic: write fn + `HealthSnapshot` type.

### §3.2 — Mem-sample ring + wsDown tracker on the engine ⚠️ RISK-TOUCH
- Safety note: edits `trading-engine.ts`, but adds only private observability fields + updates them in
  the existing tick / existing session-state path. No order, no risk gate, no equity mutation.
- **Purpose:** supply the two Tier-B signals the engine does not track yet. **Depends on:** none.
- Subtasks:
  - §3.2a Add `private memSamples: {t:number; mb:number}[] = []` (ring, cap e.g. 60) + push current
    `memMb` each status tick, shift past cap. Atomic: field + 3 lines in the tick.
  - §3.2b Add `private leftConnectedAt: number | null = null`; in the status tick compute
    `wsDownMs = (sessionState!=='CONNECTED' && leftConnectedAt!=null) ? now-leftConnectedAt : 0` and
    set/clear `leftConnectedAt` on the CONNECTED↔not transition. Atomic: field + transition update.

### §3.3 — Engine `getHealthReport()` + diff-gated emit ⚠️ RISK-TOUCH
- Safety note: same engine file; the new method is read-only fan-in → pure compose → pure diagnose →
  emit. Mirrors the `FeedStatus` diff-gate exactly.
- **Purpose:** produce + broadcast the report. **Depends on:** §3.1, §3.2.
- Subtasks:
  - §3.3a `getHealthReport(): HealthReport` — gather raw fields (mode from `replay?'replay':alpaca?'paper':'simulator'`,
    sessionState, connected, tickHz, msSinceLastTick, memMb, memSamples→growth, leftConnectedAt→wsDown,
    peak/current equity→drawdown, errorRatePct:null, lastError:null), `composeHealthSignals`,
    `diagnoseHealth`. Atomic: write method.
  - §3.3b `healthReportListeners: Set<(r:HealthReport)=>void>` + `lastHealthReport: HealthReport|null`
    + `onHealthReport(fn)` (mirror onFeedStatus at 901). Atomic: fields + method.
  - §3.3c In the status tick (after the feed-status block), compute the report and emit diff-gated:
    fire only when `lastHealthReport===null || severity changed || findings codes/severities changed`.
    Atomic: ~8 lines mirroring 2096-2103.
  - §3.3d Upgrade `healthCheck()` (1593) to `return this.getHealthReport()` (or keep `{ok,uptime,mode}`
    and add a `report` field — see §6 CRITIC). Atomic: edit method.

### §3.4 — IPC channel + push wiring
- **Purpose:** carry the report main→renderer. **Depends on:** §3.3.
- Subtasks:
  - §3.4a `ipc-channels.ts`: add `HEALTH_REPORT: 'satex:health:report'` near `HEALTH_CHECK`; add it to
    `PUSH_CHANNELS`. Atomic: 2 edits.
  - §3.4b `index.ts`: add `engine.onHealthReport(r => push(IPC.HEALTH_REPORT, r))` beside the
    `onStatus` push (556). Atomic: 1 line.
  - §3.4c `index.ts`: upgrade `register(IPC.HEALTH_CHECK, () => engine.getHealthReport())` (810).
    Atomic: 1 edit.

### §3.5 — Preload bridge
- **Purpose:** expose the push to the sandboxed renderer. **Depends on:** §3.4a.
- Subtasks:
  - §3.5a `preload/index.ts`: `onHealthReport: (cb) => on(IPC.HEALTH_REPORT, cb)` (mirror
    `onSystemStatus` at 47); ensure `healthCheck` invoke return type widened to `HealthReport`. Atomic: edits.

### §3.6 — Renderer store + subscription
- **Purpose:** hold + update the latest report. **Depends on:** §3.5.
- Subtasks:
  - §3.6a `stores/healthStore.ts`: Zustand store `{ report: HealthReport | null; setReport }` with a
    sensible default (`severity:'healthy', findings:[], …`). Atomic: write store.
  - §3.6b `hooks/useIPC.ts`: `const unsubHealth = window.satex.onHealthReport(setReport)` + add to the
    cleanup return (mirror `unsubStatus` at 60). Atomic: 2 edits.

### §3.7 — Health panel
- **Purpose:** the operator-facing surface (D4: dedicated panel). **Depends on:** §3.6.
- Subtasks:
  - §3.7a `panels/HealthPanel.tsx`: `PanelHead` (`live` dot when `needsAttention`), a severity header
    (green/amber/red token), and a findings list — each row: code, summary, evidence (mono), §ref,
    remediation. Empty state: "All systems nominal." Atomic: write component.
  - §3.7b Register the panel in the same registry/workspace path as `SystemLogsPanel` (resolved §5.6a).
    Atomic: registry edit.

### §3.8 — Close-out
- Subtasks: §3.8a four gates green; §3.8b CHANGELOG `### Added` (P-037); §3.8c PROBLEM-LEDGER P-037
  OPEN/DECIDED → SHIPPED + session note; §3.8d leave UNSTAGED.

---

## §4 — Dependency + Ordering (DAG)

**Ordered execution sequence:**
§3.1 → §3.2 → §3.3 → §3.4 → §3.5 → §3.6 → §3.7 → §3.8.
(§3.1 and §3.2 are independent and can be built in either order; everything downstream needs both.)

**Parallelizable set:** { §3.1 (pure adapter), §3.2 (engine trackers) } — no mutual dependency. The
renderer chain §3.6/§3.7 can be drafted in parallel with §3.4/§3.5 once the channel name (§3.4a) is
fixed, but should be gate-verified after the main side is in.

**Approval nodes (one-way doors — operator sign-off before execution):**
- ⛔ **§3.2 + §3.3 + §3.3d** — these edit `trading-engine.ts`. Per AGENTS.md, the engine file is on the
  trading-safety perimeter even though these specific edits are observability-only (read state, emit a
  report). The operator signs off that the diff is read-only-plus-one-emit before an agent edits the
  engine. This is the gate that made P-037 "DECIDED, sign-off-gated."
- Not one-way doors: §3.1, §3.4-§3.8 are additive/new-file/IPC/renderer and reversible.

```
  §3.1 (pure adapter) ──┐
                        ├─▶ §3.3 (engine report+emit ⚠️) ─▶ §3.4 (IPC) ─▶ §3.5 (preload) ─▶ §3.6 (store) ─▶ §3.7 (panel) ─▶ §3.8 (gates+close)
  §3.2 (engine trackers ⚠️) ─┘
            ⛔ approval node spans §3.2 + §3.3 (engine-file edits)
```

---

## §5 — Execution Specification

### §5.1 — spec for §3.1 (pure adapter)
- **Method:** pure functions; mem-growth via first-vs-last sample over the ring
  (`(last.mb-first.mb)/first.mb / hours`, guard first.mb<=0 and span < min → null). Keep deterministic.
- **Artifacts:** `src/shared/health/health-signals.ts` (`HealthSnapshot` type, `computeMemGrowthPctPerHr`,
  `computeDrawdownPct`, `composeHealthSignals`), `health-signals.test.ts`.
- **Validation:** typecheck + lint + vitest (boundary tests: <2 samples → null; flat → 0; +X% over
  span → X; drawdown peak<=0 → 0, cur>peak → 0, half → 0.5). knip: exports reachable from the test +
  the engine.
- **Failure modes:** divide-by-zero on mem baseline / peak (guarded → null|0); non-monotonic samples.
- **Fallback:** return `null` (diagnose treats as no-finding) — honest under 0.1.

### §5.2 — spec for §3.2 (engine trackers) ⚠️ RISK-TOUCH
- **Method:** bounded ring (cap 60, ~2 min at 2 s) pushed in the existing tick; `leftConnectedAt`
  set on first non-CONNECTED, cleared on return to CONNECTED.
- **Artifacts:** ~2 private fields + ~6 lines inside the existing status tick. No new timer.
- **Validation:** typecheck + lint; the behavior is exercised by §3.3 emit tests where unit-reachable.
  **Risk-engine check:** confirm the diff contains zero `om.`/`risk`/`submitOrder`/`fillOrder` writes
  (grep the patch). Read-only equity reads only.
- **Failure modes:** ring unbounded (cap enforced); `leftConnectedAt` never cleared (clear on CONNECTED
  asserted by a transition test).
- **Fallback:** if a tracker is wrong, the signal degrades to a benign reading; diagnose stays graded.

### §5.3 — spec for §3.3 (getHealthReport + emit) ⚠️ RISK-TOUCH
- **Method:** read-only fan-in → `composeHealthSignals` → `diagnoseHealth`; diff-gate identical in
  shape to 2096-2103 but comparing `severity` + a stable join of `findings.map(f=>f.code+f.severity)`.
- **Artifacts:** `getHealthReport()`, `onHealthReport()`, `healthReportListeners`, `lastHealthReport`,
  ~8 emit lines, `healthCheck()` upgrade.
- **Validation:** typecheck + lint + vitest. If the engine has a unit-testable seam (the broker-session
  DI tests at `broker-session.test.ts` show the pattern), add a focused test that drives
  `getHealthReport()` through injected state; otherwise rely on the pure-adapter tests + a manual smoke
  note. **Risk-engine check:** patch grep clean of execution calls.
- **Failure modes (map to §11):** a thrown diagnose (impossible — pure/total, proven by the P-036
  totality test) would break the tick; wrap the emit in the existing tick's try semantics if any.
- **Fallback:** on any compose error, skip the emit for that tick (never crash the status loop).

### §5.4 — spec for §3.4 (IPC) + §3.5 (preload)
- **Method:** mirror `SYSTEM_STATUS`. Outbound push → no inbound Zod (renderer sends nothing). Add to
  `PUSH_CHANNELS` so the `push()` allowlist accepts it.
- **Artifacts:** channel const + PUSH entry; `index.ts` push line + HEALTH_CHECK upgrade; preload
  `onHealthReport`.
- **Validation:** typecheck + lint + knip (channel referenced on both sides → not unused).
- **Failure modes:** channel added but not in `PUSH_CHANNELS` → `push()` rejects (caught by a quick
  runtime smoke / type). **Fallback:** add the PUSH entry (the validation catches it).

### §5.5 — spec for §3.6 (store + subscription)
- **Method:** Zustand store mirroring `accountStore`; subscribe in `useIPC` with teardown.
- **Artifacts:** `healthStore.ts`; `useIPC.ts` subscription + cleanup line.
- **Validation:** typecheck + lint; cleanup asserted by code review (unsub added to the returned
  cleanup, mirroring `unsubStatus`). knip: store consumed by the panel.
- **Failure modes:** missing unsub → listener leak (PR #6 class) — explicitly added.

### §5.6 — spec for §3.7 (panel)
- **Method:** functional component reading `useHealthStore`; severity → token color
  (`--bb-pos`/amber/`--bb-neg` or the existing severity tokens); `PanelHead` `live` prop on
  `needsAttention`. No inline SIM/severity logic duplicated — derive from `report.severity`.
- §5.6a **Mount resolution (do first):** read how `SystemLogsPanel` is registered (panel registry /
  workspace slot / `App.tsx`) and replicate exactly. This is the one spot the draft leaves to
  execute-time file reading; everything else is specified.
- **Artifacts:** `HealthPanel.tsx` + registry edit.
- **Validation:** typecheck + lint + knip (component imported by the registry → not unused);
  renderer-perf canary is NOT required (no chart/tick hot path).
- **Failure modes:** panel effect leak (none planned — pure store read); empty-state crash (explicit
  empty state).
- **Fallback:** if the registry path is non-obvious, mount in one workspace (e.g. Focus/Markets) and
  flag the rest for a follow-up.

---

## §6 — Risk + Ambiguity Audit (self-adversarial)

**CRITIC pass.**
- *Assumptions not verified:* A6 (exact panel registry/mount) — mitigated by making §5.6a an
  execute-time read of `SystemLogsPanel`, not a guess. Whether the engine has a clean unit seam for
  `getHealthReport()` — mitigated by leaning on pure-adapter tests + the P-036 suite; engine test is
  best-effort.
- *Worst case if wrong:* a malformed emit spams the renderer. Mitigated by the diff-gate (fires only
  on change) and the bounded findings set.
- *Left out / teardown:* (1) renderer `onHealthReport` subscription MUST be added to the `useIPC`
  cleanup return — called out in §3.6b. (2) engine `healthReportListeners` is a Set that the existing
  engine `dispose`/`stop` path should clear if it clears the other listener sets — verify and match.
  (3) No new timer (reuses the 2 s tick) → no timer teardown debt. (4) `healthCheck()` return-shape
  change could break an existing renderer caller — grep `healthCheck(` consumers; if any rely on
  `{ok,uptime,mode}`, keep those fields and ADD `report` rather than replacing (decided: §3.3d keeps
  back-compat — additive).
- *Mode correctness:* the `mode` passed to the core must map `replay`→'replay', else
  `alpaca?'paper':'simulator'`; double-check 'live' is unreachable today (paper-only phase, 0.9) so the
  core's 'live' branch is dormant-but-correct.

**RISK-AGENT pass** (against Section 5 + Section 8):
- Verdict: **APPROVED.** The plan proposes no trade, no order, no risk-parameter change, no
  position-sizing, no live capital, no single-signal execution logic, no self-modification of risk
  params, and no safety-layer bypass. It reads engine state (including a drawdown *reading*) and emits
  an advisory `HealthReport`. The remediation strings ("HALT trading…") are rendered text, wired to no
  actuator. Auto-acting on them is explicitly out of scope (D1) and would be a separate VETO-gated plan.
- The only Section-5-adjacent element is the drawdown reading; it is display-only and compared against
  §5.2/§5.3/§8.1 thresholds the core already encodes — it informs, it does not gate.

**Unresolved high-risk items surfaced to operator:** none. The single sign-off item is the
`trading-engine.ts` edit itself (the ⛔ approval node, §4), which is the reason this is a plan and not
an autonomous ship.

---

## §7 — Final Assembly: the plan

**Build order (copy-ready):**
1. §3.1 — `health-signals.ts` + test → done when `vitest health-signals.test.ts` green (boundary cases).
2. §3.2 — engine mem-ring + wsDown tracker fields/updates → done when typecheck+lint green, patch grep
   shows zero execution-path writes.  ⛔ part of the engine approval node.
3. §3.3 — `getHealthReport()` + `onHealthReport()` + diff-gated emit + `healthCheck()` additive upgrade
   → done when typecheck+lint green.  ⛔ engine approval node.
4. §3.4 — `HEALTH_REPORT` channel + PUSH entry + `index.ts` push + HEALTH_CHECK upgrade → typecheck+knip green.
5. §3.5 — preload `onHealthReport` → typecheck green.
6. §3.6 — `healthStore.ts` + `useIPC` subscription (+cleanup) → typecheck+lint green.
7. §3.7 — `HealthPanel.tsx` + registry mount (§5.6a first) → typecheck+lint+knip green.
8. §3.8 — full four gates; CHANGELOG `### Added`; PROBLEM-LEDGER P-037 → SHIPPED; UNSTAGED.

**Acceptance criteria (gate outcomes):**
- [ ] `npm run typecheck` exit 0
- [ ] `npm run lint` exit 0 (0 warnings)
- [ ] `npm test` 0 fail; report real file/test counts (expect +1-2 files, +N tests vs 97/1247)
- [ ] `npm run knip` exit 0 (Node-20 shim); no NEW unused exports (HEALTH_REPORT + store + panel all consumed)
- [ ] Patch grep over `trading-engine.ts` diff shows zero `submitOrder`/`fillOrder`/`om.create`/`risk` writes
- [ ] `healthCheck()` consumers unbroken (additive return shape)
- [ ] Renderer `useIPC` cleanup includes `unsubHealth`

**Deliverables:** new `health-signals.ts`(+test), `healthStore.ts`, `HealthPanel.tsx`; edits to
`trading-engine.ts`, `index.ts`, `ipc-channels.ts`, `preload/index.ts`, `useIPC.ts`, panel registry;
CHANGELOG `### Added` (P-037); PROBLEM-LEDGER P-037 → SHIPPED + session note. All UNSTAGED.

---

## Decision Log

| D# | Question | Chosen | Why |
|---|---|---|---|
| D1 | P-037 boundary | Diagnosis only (no auto-heal) | Stays off the execution/risk perimeter; auto-acting is a separate VETO-gated plan. |
| D2 | Signal ambition | Tier A+B now; Tier C (errorRate, lastError) null | Max signal with bounded engine edit; `null` is honest under 0.1 and the core no-findings it. |
| D3 | Transport | Piggyback 2 s tick, diff-gated | Reuses cadence, no new timer, mirrors the FeedStatus diff-gate; zero renderer churn. |
| D4 | UI surface | Dedicated Health panel | Operator chose a full dockable panel over a pill; models on SystemLogsPanel. |

## Revision Log (review loop)

| # | Section | Change | Trigger |
|---|---|---|---|
| 1 | header | Status→EXECUTED; HEALTH_CHECK upgrade made additive (no index.ts change); `ok` now reflects severity | execution |
