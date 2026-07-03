# ULTRAPLAN BLUEPRINT — Intel Workspace: composable quant-intelligence grid

> Execution-ready plan produced by `/ultraplan`. Sections carry stable IDs (§1-§7) so
> the review loop can target them. Kept in sync with every accepted revision.

| Field | Value |
|---|---|
| **Goal (verbatim)** | "make this tab the one and only highly highly customizable using an 'edit modules' button ... draft their workspace module completely by themselves ... re-organizing the homepage of your iPhone or resizing windows/applications on a computer desktop ... resize these panes/modules on this tab of the terminal only. Extreme customization. Also ... let the user choose what tab/page is opened after the startup intro." (on top of: a flagship Quant Intelligence workspace fusing the intelligence layer, with deeper quant analytics, a forward-looking scenario layer, and research-mode interactivity) |
| **Slug** | intel-workspace-composable-grid |
| **Date** | 2026-06-29 |
| **Branch** | master @ 664c0d5 (working tree carries unstaged P-046/P-047) |
| **Status** | APPROVED — Phase A+B+C SHIPPED (unstaged); optional Phase D polish remains |
| **Execution route** | EXECUTE (Phase A+B shipped 2026-06-29; gates green) |
| **Risk class** | CONTAINED (off the trading-safety perimeter — routes no order) |

---

## §1 — Objective Clarification

**Core goal.** Ship a new flagship **Intel** workspace (6th tab, ⌘6) that is the *only*
user-composable surface in SATEX: an **Edit Modules** mode lets the operator add, remove,
drag-rearrange, and resize analytics modules on a persisted grid (the iPhone-jiggle /
desktop-window metaphor), populated by a read-only fusion of the existing intelligence
layer (calibration reliability/Brier, brain feature attribution, regime HMM, brain
weight-drift) plus deeper quant analytics (cross-asset correlation, microstructure, macro),
a forward-looking scenario/convergence layer, and research-mode interactivity — and let the
operator choose which workspace opens after the startup intro.

**Success criteria** (measurable, tied to gates / priority stack):
- A new `Intel` workspace is reachable from the TopBar tab and **⌘6**, and renders inside
  its own keyed `ErrorBoundary` without tripping it. (P1 — model fidelity made legible.)
- **Edit Modules mode** works end to end: enter edit → add/remove modules from a palette →
  drag to rearrange → drag a corner to resize → exit. The resulting layout **survives a full
  reload** (persisted to its OWN `Vault/Settings/intel-layout.md`, decoupled from workspace state).
  Verified by reload assertion.
- The Intel tab ships with a **curated default layout** (valuable out-of-the-box, not a blank canvas)
  and edit mode offers **Reset layout** so the operator can never trap themselves in a broken grid.
- The grid is **scoped to the Intel tab only** — no other workspace gains drag/resize.
- **Startup landing page** is configurable: a SettingsModal control picks the workspace, and
  after the splash the app opens that workspace; the choice persists across restart.
- ≥6 analytics modules implemented, each fed by a **read-only** IPC snapshot and each
  rendering an honest `UNKNOWN — SIGNAL INSUFFICIENT` state when its signal is absent
  (Constitution 0.1), never a fabricated value.
- All four gates green: `typecheck` 0, `lint` 0/0w, `vitest` 0 fail (report real counts),
  `knip` 0 (no new unused exports). Every new **pure** function (grid-layout reducer, the
  analytics derivations) carries unit tests.
- Off-perimeter confirmed: a patch-grep shows zero `OrderManager` / `risk-gates` /
  `kill-switch` / `Alpaca submit` writes. (P0/P2 untouched; routes no order.)

**Constraints** (Section 0 hard rules + CLAUDE.md invariants by name):
- **0.1** no fabricated data — modules show `UNKNOWN` when the signal is insufficient.
  **0.7** calibrated confidence — the reliability module surfaces calibration honestly.
- **Off-perimeter** (AGENTS guardrails): no `OrderManager`, `risk-gates`, kill-switch,
  live-mode interlock, or Alpaca order submission. Read-only by construction.
- **State is Zustand, not Redux** — new `intelStore` / layout state are Zustand; no
  cross-store coupling; go through stores / IPC.
- **IPC payloads stay Zod-validated** (`.strict()`); the new `INTEL_GET` mirrors the existing
  `CALIBRATION_GET` / `REGIME_GET` shape. API keys stay in `safeStorage` (untouched here).
- **Clean up what you create** (the PR #6 leak class — load-bearing): the grid edit-mode
  pointer listeners, any module poll timers, and any `ResizeObserver` must be removed on
  unmount *and* on edit-mode exit. This is the single highest-risk invariant for this build.
- **No macOS build target. Ever.** SIM/SUB badges + canonical feed gates untouched.
- **File-bridge edit discipline** (work-layer rule 5): NEW files via the Write tool; EXISTING
  files (`types.ts`, `ipc-channels.ts`, `ipc-schemas.ts`, `App.tsx`, `TopBar.tsx`,
  `globals.css`, `SettingsModal.tsx`, `workspaceStore.ts`, `main/index.ts`, preload) edited
  via python with per-file CRLF/LF detection, anchor count==1, post-edit NUL/`\r\r` byte-scan.

**Environment.** Renderer (workspace shell, grid engine, module components, Zustand stores) +
main (read-only analytics aggregation service, IPC handler) + shared (`types.ts`,
`ipc-channels.ts`, `ipc-schemas.ts`). Data feed: read-only from existing services/stores
(brain, calibration, regime, pattern-learner, self-eval, market/depth/macro). No broker facet
writes.

**Assumptions.**
- A1 [VERIFIED] `WORKSPACE_TABS` (`shared/types.ts:46`) is the single source for tabs; adding
  `'Intel'` cascades through the `Workspace` union. `WS_DIGITS` in `App.tsx:200` maps ⌘1-5.
- A2 [VERIFIED] `WorkspaceState` persists via `window.satex.workspace.getState/setState` to
  `Vault/Settings/workspace-state.md` (`workspaceStore.ts`); the startup-landing field extends this
  record additively, while the grid layout lives in its own `intel-layout.md` (§3.7).
- A3 [VERIFIED] The analytics largely exist: `calibration.snapshot()` → Brier + buckets;
  `brain.weights` (Record<FeatureKey,number>) + `score = Σ weights[k]·f[k]`; `regime`
  snapshot/posterior; `computeWeightDrift` (`learning-report.ts:45`); `computeJournalAggregates
  .byRegime` (`journalStore.ts`, the regime-conditional edge — already built + now tested by
  P-047). IPC already exposes `BRAIN_GET`, `CALIBRATION_GET`, `REGIME_GET`, `SELF_EVAL_GET`.
- A4 [VERIFIED] Each workspace renders in a `key={effectiveWs}` `ErrorBoundary` (`App.tsx:255`,
  the P-044 boundary) — the per-module isolation pattern is established (QuadChartPanel).
- A5 [VERIFIED] A custom pointer-drag pattern already ships (`TweaksPanel.tsx:35-47`,
  mousedown/move/up with matched refs) — the grid reuses this idiom, no new dep.
- A6 [UNVERIFIED] Sufficiency of correlation/VPIN/macro raw inputs in every mode. **Mitigation:**
  each such module degrades to `UNKNOWN` (0.1) rather than fabricate; verified by an empty-input
  unit test (the P-047 "degenerate result" discipline).

**Unknowns (resolved in Decision Log).** Boundary → D1; grid engine → D2 (custom, zero-dep);
expanded boundary → D3. Residual minors (exact v1 module set, persistence field shape) carry
reasonable defaults documented in §5, revisable in the review loop.

---

## §2 — Domain Mapping

**Problem classification.** Primarily **functional** (a new composable UI capability) and
**data** (read-only analytics aggregation + derivation), with an **operational** seam (layout
persistence in its own file + an additive landing-page field, no schema migration). It is **not** a risk or temporal
problem: nothing on the live-capital path, no order, no risk parameter, no timing-critical
execution. The build's one genuinely sharp edge is *lifecycle hygiene* (the drag listeners +
module timers), not capital safety.

**Touch-map.**
- **Agents:** **LEARN** (surfaces the learning loop), **AUDIT** (makes model fidelity legible),
  **TECH** / **MACRO** (analytics inputs). **Not** RISK, **not** EXEC.
- **Broker facets:** none. No `OrderRouter` / `AccountSyncer` writes; account equity is read for
  display context only.
- **Files / call-sites in blast radius:**
  - shared: `types.ts` (+`'Intel'`, +`landingWorkspace`, +`IntelLayout`/`ModulePlacement`,
    +`IntelSnapshot`; `WorkspaceState` version bump), `ipc-channels.ts` (+`INTEL_GET`),
    `ipc-schemas.ts` (+Zod).
  - main: **new** `services/intelligence/intel-fusion.ts` (read-only aggregation) +
    `intel-analytics.ts` (pure derivations: correlation, attribution, microstructure) + their
    `.test.ts`; `main/index.ts` (IPC handler), preload bridge.
  - renderer: `App.tsx` (Intel render branch + ⌘6 + boot-landing), `TopBar.tsx` (tab),
    `CommandPalette.tsx` (Intel entry), `SettingsModal.tsx` (landing-page control),
    `workspaceStore.ts` (landing field), **new** `stores/intelStore.ts` +
    `stores/intelLayoutStore.ts`, **new** `components/intel/IntelWorkspace.tsx`,
    `components/intel/IntelGrid.tsx`, `lib/grid-layout.ts` (+`.test.ts`),
    `panels/intel/*` module components + a module registry, `globals.css` (grid + token styles).
- **Load-bearing invariant at risk:** **"clean up what you create"** (PR #6) — the grid pointer
  listeners + module poll timers + any `ResizeObserver`. Secondary: Zustand-not-Redux (new
  stores), Zod-validated IPC (new channel), persistence-schema migration safety.

---

## §3 — Task Decomposition

> Major → sub → atomic. **No task is RISK-TOUCH** — the entire build is off the trading-safety
> perimeter (read-only display; routes no order). Phased so each phase is independently
> gate-green and shippable.

### Phase A — Foundations (shell + persistence plumbing)

#### §3.1 — Extend the workspace model (shared)
- **Purpose:** make `Intel` a first-class workspace and give the persistence record its new
  fields. **Inputs:** `shared/types.ts`. **Outputs:** `'Intel'` in `WORKSPACE_TABS`;
  `landingWorkspace: Workspace` added to `WorkspaceState` **additively** (NO version bump — hydrate
  treats a missing field as the default, the tolerant pattern); `ModulePlacement` + `IntelModuleId`
  types added to shared. The grid layout does NOT live on `WorkspaceState` (see §3.7 — its own file).
- **Depends on:** none (root).
- Atomic: add `'Intel'` to the tuple; add the two fields + version; add the new types; extend
  the default. (python edit, anchors count==1, EOL-preserved.)

#### §3.2 — Wire the Intel tab into the shell (renderer)
- **Purpose:** reach the workspace. **Outputs:** TopBar tab; `App.tsx` render branch wrapping
  `<IntelWorkspace/>` in the existing keyed `ErrorBoundary`; `WS_DIGITS` ⌘6 entry; CommandPalette
  "Go to Intel" entry. **Depends on:** §3.1.

#### §3.3 — Startup landing page (renderer + persistence)
- **Purpose:** open the operator's chosen workspace after the splash. **Outputs:** boot logic in
  `App.tsx` applies `landingWorkspace` once, after `workspaceStore.hydrate()` resolves and
  `splashDone` flips (guarded so it runs exactly once, never fighting a manual switch); a
  SettingsModal "Startup page" dropdown (writes `landingWorkspace` through the workspace store).
  **Depends on:** §3.1.

### Phase B — The grid engine (the priority)

#### §3.4 — Pure layout model + reducer (`lib/grid-layout.ts`)
- **Purpose:** all grid math, headless and unit-tested. **Outputs:** `ModulePlacement {id,x,y,w,h}`
  on a fixed-column grid (default 12 cols × N row-units); pure ops `addModule`, `removeModule`,
  `moveModule`, `resizeModule`, `clampToBounds`, `resolveCollisions` (reject-if-overlap for v1), per-module `minSize`,
  (optional), `sanitizeLayout(placements, knownIds)` (drops unknown module ids — mirrors the
  subsecond-prefs sanitizer). **Depends on:** §3.1 (types).

#### §3.5 — `IntelGrid` render (renderer)
- **Purpose:** paint modules from a layout on a CSS grid. **Outputs:** `IntelGrid.tsx` mapping
  `ModulePlacement[]` → absolutely-placed grid cells via `grid-column`/`grid-row` spans; renders
  each module from the registry inside a per-module `ErrorBoundary`. Read-mode only here.
  **Depends on:** §3.4.

#### §3.6 — Edit Modules mode (renderer) — the headline UX
- **Purpose:** the iPhone-jiggle / desktop-window editor. **Outputs:** an "Edit Modules" toggle in
  the Intel header; edit mode shows drag handles + a resize handle (corner) per module + a remove
  (×) affordance + an "Add module" palette (the registry minus already-placed). Drag-rearrange and
  resize via **pointer events** (pointerdown on handle → `setPointerCapture` → pointermove computes
  the candidate placement through the §3.4 reducer with live collision preview → pointerup commits).
  **Teardown:** every `window`/element listener is removed on pointerup, on edit-mode exit, and on
  unmount via a ref-held cleanup (PR #6). **Depends on:** §3.4, §3.5.

#### §3.7 — Layout persistence (renderer + persistence)
- **Purpose:** the layout survives restart, decoupled from workspace state. **Outputs:**
  `intelLayoutStore` (Zustand) holding the live `ModulePlacement[]`, persisted to its OWN
  `Vault/Settings/intel-layout.md` (markdown + JSON fence, hand-editable) via a dedicated
  `INTEL_LAYOUT_GET` / `INTEL_LAYOUT_SET` Zod IPC pair — a byte-for-byte mirror of the
  subsecond-prefs service (load-time sanitizer drops bad/unknown-module entries). Decoupling means
  **no `WorkspaceState` schema change and no migration** (resolves the §6 quiet risk). Auto-persist
  on every committed edit, never blocking the UI. **Depends on:** §3.1, §3.4, §3.6.

### Phase C — Intelligence backend (read-only fusion + derived analytics)

#### §3.8 — Fusion + core derivations (`services/intelligence/intel-fusion.ts`)
- **Purpose:** one read-only `IntelSnapshot` composing what exists + the cheap derivations.
  **Outputs:** compose `calibration.snapshot()` (Brier+buckets), `brain` weights, `regime`
  snapshot, `self-eval` last result; derive **feature attribution** (`weights[k]·features[k]` per
  `FEATURE_KEY` for the focused symbol), reuse **regime-conditional edge** (`computeJournalAggregates
  .byRegime` — already built/tested), reuse **weight-drift** (`computeWeightDrift`). Pure
  derivation helpers live beside it and are unit-tested. **Depends on:** §3.1.

#### §3.9 — Deeper quant analytics (`services/intelligence/intel-analytics.ts`, pure)
- **Purpose:** the "more quant" breadth. **Outputs:** pure `pearsonCorrelationMatrix(seriesBySymbol)`
  over aligned log-returns; `microstructure` (VPIN / depth-imbalance) from the depth feed;
  `macroContext` from the macro store. Each returns `UNKNOWN` sentinels when inputs are insufficient
  (sim mode, <N bars, no depth) — never fabricates (0.1). Fully unit-tested incl. the empty/degenerate
  case (P-047 discipline) and negative-price safety (the P-034/039 class). **Depends on:** §3.1.

#### §3.10 — IPC surface (`INTEL_GET` + optional push)
- **Purpose:** ship the snapshot to the renderer. **Outputs:** `INTEL_GET` channel + Zod
  `IntelSnapshotSchema` (`.strict()`); a read-only handler in `main/index.ts` gathering §3.8/§3.9;
  preload bridge `window.satex.getIntel()`. Optional `INTEL_UPDATE` push piggybacking the existing
  2s status tick, diff-gated (the health-report pattern). **Depends on:** §3.8, §3.9.

### Phase D — Modules + scenario/research (renderer visualizations)

#### §3.11 — Module registry + module components (`panels/intel/*`)
- **Purpose:** the actual modules the operator composes. **Outputs:** a `MODULE_REGISTRY`
  (id → {title, defaultSize, component}) and ≥6 modules, each `--bb-*`-styled, each rendering
  `UNKNOWN` gracefully: **Reliability diagram** (calibration buckets + Brier), **Feature
  attribution** (signed bars), **Regime** (posterior + dominant state), **Weight-drift**
  (sparkline), **Correlation heatmap**, **Microstructure** (VPIN/imbalance), **Macro context**,
  **Scenario/Convergence** (Bull/Bear/Neutral §4.3 + the ≥3-layer convergence tally). **Depends on:**
  §3.10 (data), §3.5 (host).
- **Module contract (DX):** adding a module = one `MODULE_REGISTRY` entry (`id`, `title`,
  `defaultSize`, `minSize`, `component`) + one component that reads the `intelStore` snapshot and
  renders an `UNKNOWN` state. No other file changes — the grid, palette, and persistence pick it up.

#### §3.12 — Research-mode interactivity
- **Purpose:** make it a tool, not a poster. **Outputs:** a time-range selector + a
  portfolio-vs-focused-symbol toggle in the Intel header, threaded into modules that support it
  (correlation, attribution, regime-edge). **Depends on:** §3.11.

### Phase E — Verify + close

#### §3.13 — Gates + teardown audit + docs
- **Outputs:** four gates green per phase; a teardown audit (grep every new `addEventListener`/
  `setInterval`/`ResizeObserver` has a matching cleanup); CHANGELOG entry under the first
  `### Added`; PROBLEM-LEDGER `P-048` SHIPPED with gate stamp. **Depends on:** all.

---

## §4 — Dependency + Ordering (DAG)

**Ordered execution sequence:**
§3.1 → { §3.2, §3.3 } → §3.4 → §3.5 → §3.6 → §3.7 → { §3.8, §3.9 } → §3.10 → §3.11 → §3.12 → §3.13

**Parallelizable set:** { §3.2, §3.3 } (independent shell edits after the model lands);
{ §3.8, §3.9 } (different new files); the entire **Phase C** can proceed in parallel with
**Phase B** (backend vs grid — disjoint files), they only rejoin at §3.11.

**Approval nodes (one-way doors requiring operator sign-off):** **NONE.** No task is RISK-TOUCH;
nothing touches the live-capital path, risk parameters, or the kill-switch. Per the review-loop
revision, the grid layout lives in its own `intel-layout.md` file, so there is **no `WorkspaceState`
schema migration** at all — the prior CRITIC item is designed out.

```
 §3.1 ──┬──▶ §3.2 ──┐
        ├──▶ §3.3 ──┤
        ├──▶ §3.4 ─▶ §3.5 ─▶ §3.6 ─▶ §3.7 ─┐
        └──▶ §3.8 ─┬─────────────▶ §3.10 ──┴─▶ §3.11 ─▶ §3.12 ─▶ §3.13
             §3.9 ─┘
```

**Phasing for shippability:** Phase A+B (foundation + grid + persistence) is a complete,
gate-green, usable increment on its own — the operator can compose an empty/placeholder grid and
set a landing page before a single analytics module exists. Phases C+D layer the intelligence in.

---

## §5 — Execution Specification

### §5.1 — Workspace model (§3.1)
- **Method:** extend the const tuple + interface; bump `version` to `2`; add `ModulePlacement`
  (`{ id: IntelModuleId; x: number; y: number; w: number; h: number }`) and the `IntelModuleId`
  union. `DEFAULT_WORKSPACE_STATE` gets `landingWorkspace: 'Trade'` (additive; `workspace: 'Quad'`
  stays the last-selected restore). The grid layout default lives in the layout service (§3.7), not
  here. No `version` bump — hydrate fills a missing `landingWorkspace` with the default.
- **Artifacts:** `shared/types.ts` edits.
- **Validation:** typecheck (the `Workspace` union cascades — any non-exhaustive switch fails to
  compile, which is the point); lint.
- **Failure modes:** a non-exhaustive `switch (effectiveWs)` somewhere → typecheck catches it.
- **Fallback:** if the cascade surfaces many call-sites, handle them in §3.2 before moving on.

### §5.2 — Shell wiring (§3.2) + landing (§3.3)
- **Method:** mirror the existing Quad branch. `App.tsx`: add `effectiveWs === 'Intel'` →
  `<IntelWorkspace/>`; extend `WS_DIGITS` with `'6': 'Intel'`. `TopBar.tsx`: add the tab. Landing:
  a `useRef(false)` one-shot effect that, after `workspaceStore.hydrated && splashDone`, calls
  `setWorkspace(landingWorkspace)` exactly once. SettingsModal: a `<select>` over `WORKSPACE_TABS`.
- **Validation:** typecheck/lint; manual reasoning that the one-shot guard can't fight a user switch
  (it fires before first paint, ref flips, never re-runs).
- **Failure modes:** landing effect re-running and yanking the user back to the landing page →
  prevented by the ref guard + empty-ish deps. **Fallback:** gate on `!hydratedAppliedRef.current`.

### §5.3 — Grid reducer (§3.4)
- **Method:** pure functions over `ModulePlacement[]` + a `GridConfig {cols, rowH, gap}`. `moveModule`
  / `resizeModule` clamp to `[0,cols]`/min-size, then `resolveCollisions` pushes overlapped modules
  down. **v1 collision policy = reject-if-overlap** (deterministic, no surprise reflow); push-down
  compaction is a documented follow-up. `sanitizeLayout` drops placements whose `id ∉ knownIds` and
  clamps the rest. Each module carries a `minSize` (from the registry) the resizer respects. No DOM,
  no clock.
- **Artifacts:** `lib/grid-layout.ts` + `lib/grid-layout.test.ts`.
- **Validation:** `vitest` — add/remove, move-with-collision (pushes the right module, no overlap
  in the result), resize-clamp (can't exceed cols / go below min), `sanitizeLayout` drops unknown
  ids + clamps, and a persistence round-trip (serialize→parse→equal). **Gate:** test count rises.
- **Failure modes:** infinite collision loop → bounded iteration cap + test. **Fallback:** if
  reject-if-overlap (the chosen v1 default) is too strict in practice, add bounded push-down later.

### §5.4 — Edit mode + teardown (§3.6) — the lifecycle-critical task
- **Method:** pointer-event drag (not HTML5 DnD) for precise control + touch parity. On
  `pointerdown` on a handle: `el.setPointerCapture(e.pointerId)`, record origin, attach
  `pointermove`/`pointerup` to `window`. `pointermove` → reducer computes the candidate placement +
  a live ghost. `pointerup` → commit via the store + **remove both window listeners**. A
  `useEffect` cleanup removes any still-attached listeners on unmount; exiting edit mode clears all
  transient drag state. Resize handle = same machinery on the SE corner mapped to `resizeModule`
  (snapping to grid cells, respecting `minSize`).
- **Edit-mode visual language:** dashed module borders + a subtle jiggle/lift, dimmed read-chrome,
  visible drag handle + SE resize grip + remove (×) + the "Add module" palette; an explicit **Done**
  button (and Esc) exits edit mode. Read mode is clean — zero edit affordances visible.
- **Artifacts:** `IntelGrid.tsx` edit affordances + a `useGridDrag` hook holding the listener refs.
- **Validation:** typecheck/lint; the §3.13 teardown grep proves every `addEventListener` has a
  matching `removeEventListener`; the pure reducer is already unit-tested (§5.3).
- **Failure modes:** **the PR #6 leak** — a listener left on `window` after unmount firing setState
  on a dead component. **Fallback / guarantee:** ref-held cleanup in the hook's `useEffect` return;
  this is the exact P-043/P-046 pattern and is the build's #1 review focus.

### §5.5 — Persistence (§3.7)
- **Method:** `intelLayoutStore` (Zustand) owns the live `ModulePlacement[]`, persisted via the new
  `INTEL_LAYOUT_SET` IPC to `Vault/Settings/intel-layout.md` (subsecond-prefs mirror: markdown + JSON
  fence + a load-time sanitizer). On hydrate, `sanitizeLayout` runs against the live registry; an
  empty/absent file yields the curated DEFAULT layout. `landingWorkspace` rides `workspaceStore` with
  tolerant hydrate (missing field → default). No `WorkspaceState` version bump, no migration.
- **Validation:** `vitest` on `sanitizeLayout` (unknown id dropped, clamp) + the tolerant landing
  hydrate (missing field → default) + a layout persistence round-trip.
- **Failure modes:** a hand-edited or stale on-disk layout referencing a removed module → sanitizer
  drops it (subsecond-prefs precedent). **Fallback:** on any parse error, fall back to default layout.

### §5.6 — Fusion + analytics (§3.8, §3.9)
- **Method:** §3.8 composes existing snapshots + cheap derivations (feature attribution =
  `weights[k]·features[k]`; regime edge reuses `computeJournalAggregates.byRegime`; drift reuses
  `computeWeightDrift`). §3.9 pure math: `pearsonCorrelationMatrix` over aligned log-returns
  (guard `prev<=0||curr<=0` per P-039; `Math.abs` denominators per P-034); microstructure from
  depth; macro from the macro store. All return `UNKNOWN` sentinels on insufficient input.
- **Artifacts:** `intel-fusion.ts`, `intel-analytics.ts`, + `.test.ts` each.
- **Validation:** `vitest` — attribution sums/signs; correlation on a known series (identity =1,
  anti-correlated ≈ −1); **empty input → UNKNOWN, no throw, no NaN** (the P-047 degenerate test);
  negative-price safety. **knip:** every new export is consumed by the IPC handler or a test.
- **Failure modes:** unaligned/short series → NaN. **Fallback:** length-gate → UNKNOWN.

### §5.7 — IPC (§3.10)
- **Method:** add `INTEL_GET` to `ipc-channels.ts`; `IntelSnapshotSchema` (`.strict()`) to
  `ipc-schemas.ts`; a read-only `ipcMain.handle` in `main/index.ts` that gathers §3.8/§3.9 and
  returns the validated snapshot; preload `getIntel`. Optional `INTEL_UPDATE` push on the 2s tick,
  diff-gated.
- **Validation:** typecheck (Zod-inferred type flows to the renderer); a schema round-trip test;
  patch-grep confirms the handler issues **no** order/risk writes (off-perimeter proof).
- **Failure modes:** schema drift between main and renderer → the shared Zod type is the single
  source. **Fallback:** handler try/catch → returns an `UNKNOWN` snapshot, never throws into IPC.

### §5.8 — Modules + research mode (§3.11, §3.12)
- **Method:** a `MODULE_REGISTRY` keyed by `IntelModuleId`; each module is a small self-contained
  component reading the `intelStore` snapshot, wrapped per-module in `ErrorBoundary` (P-044 idiom),
  polling via a single `setInterval` cleared on unmount (the AIInsightsPanel idiom). Research
  controls live in Intel header state threaded as props.
- **Validation:** typecheck/lint; the teardown grep (§3.13); visual correctness is gate-checked only
  (no component-test harness — see §6 / unresolved).
- **Failure modes:** a module throw → contained by its boundary, not a workspace blackscreen.
  **Fallback:** the boundary fallback shows the module title + error, grid stays usable.

---

## §6 — Risk + Ambiguity Audit (self-adversarial)

**CRITIC pass.**
- *Persistence migration (the quiet risk) — DESIGNED OUT by the review.* The grid layout now lives in
  its own `Vault/Settings/intel-layout.md` (its own sanitized IPC), so `WorkspaceState` gains only an
  **additive** `landingWorkspace` with tolerant hydrate — no version bump, no migration, no risk of
  wiping a saved workspace/quad set. A unit test still pins the tolerant-hydrate (missing field →
  default) and the layout sanitizer (unknown module id dropped).
- *Teardown is the loud risk (PR #6).* The grid's edit-mode pointer listeners + each module's poll
  timer + any `ResizeObserver` are exactly the class that shipped a real leak once (and recurred as
  P-043/P-046). **Covered:** ref-held cleanup in `useGridDrag`; `clearInterval` on every module
  unmount; a §3.13 grep that every `addEventListener`/`setInterval`/`new ResizeObserver` in the new
  code has a matching teardown. This is the #1 thing /autoplan or a reviewer should check.
- *Fabrication risk (0.1).* A "quant" module that invents a correlation or VPIN when the feed is dry
  would violate the Constitution's first rule. **Covered:** every analytic returns `UNKNOWN` on
  insufficient input, unit-tested on the empty case. Modules render the `UNKNOWN — SIGNAL
  INSUFFICIENT` state, never a zero dressed as data.
- *Exhaustiveness.* Adding `'Intel'` to the `Workspace` union will (intentionally) break any
  non-exhaustive `switch`. **Covered:** typecheck is the net; fix every surfaced call-site in §3.2.
- *knip.* New exported analytics/types must be consumed (handler or test) or knip flags them.
  **Covered:** tests exercise every exported pure function; the IPC handler consumes the fusion.
- *Scope / fatigue.* This is a large, multi-session build. **Covered:** the §4 phasing makes
  Phase A+B a complete shippable increment; we gate-verify and can stop cleanly between phases.
- *Left out?* Re-checked: empty grid (no modules placed) must render a friendly "Add modules" empty
  state, not a blank pane. Added to §3.5. Edit-mode on an unknown persisted module → sanitized on
  hydrate (§5.5). Keyboard `?`/⌘ handlers must not collide with edit mode — edit mode is local Intel
  state, global shortcuts unaffected.

**RISK-AGENT pass** (against Section 5 + Section 8):
- **Verdict: APPROVED.** No Section 5 immutable risk rule is touched: no position sizing, stops,
  order submission, exposure, or drawdown logic. No Section 8 violation: no risk-parameter
  self-modification, no execution, no convergence/confidence *logic* change — the scenario/convergence
  module **reads and displays** the existing signals, it does not gate a trade. The objective stays
  locked on legibility of `risk_adjusted_accuracy` (P1), which this directly serves. Off the
  trading-safety perimeter by construction (read-only display; routes no order).

**Unresolved high-risk items surfaced to operator:** none capital-sensitive. One product note: real
*component* tests for the grid would need the `@testing-library/react` harness (a lockfile change held
out of scope). We instead unit-test the **pure** reducer + analytics and gate-verify the UI — the
standing P-043/P-046 precedent. Flagged, not blocking.

---

## §7 — Final Assembly: the plan

**Build order (copy-ready):**
1. §3.1 extend the workspace model → typecheck cascade green.
2. §3.2 + §3.3 wire the Intel tab (TopBar, App.tsx branch, ⌘6, CommandPalette) + startup landing
   (boot one-shot + SettingsModal control) → app opens, Intel reachable, landing persists.
3. §3.4 pure grid reducer + tests → vitest green, test count up.
4. §3.5 IntelGrid render (read mode) + empty state → Intel paints placed modules / "Add modules".
5. §3.6 Edit Modules mode (drag + resize, pointer-event, ref-held teardown) → compose live.
6. §3.7 layout persistence (own `intel-layout.md` + `INTEL_LAYOUT_GET/SET`) + sanitize + tolerant-
   hydrate test → layout survives reload; ships a curated default + Reset.
   **— Phase A+B shippable here. Gates green. —**
7. §3.8 fusion + core derivations + tests.
8. §3.9 deeper quant analytics (correlation/microstructure/macro) + empty-case tests.
9. §3.10 `INTEL_GET` Zod IPC + handler + preload + off-perimeter patch-grep.
10. §3.11 module registry + ≥6 modules (each ErrorBoundary-wrapped, UNKNOWN-safe).
11. §3.12 research-mode controls.
12. §3.13 four gates + teardown grep + CHANGELOG + ledger P-048.

**Acceptance criteria (gate outcomes):**
- [ ] `npm run typecheck` clean (the `Workspace` union cascade resolved).
- [ ] `npm run lint` clean (0 warnings).
- [ ] `npm test` green — report real file/test counts; new tests for `grid-layout`, `intel-fusion`,
      `intel-analytics`, the layout sanitizer, and the tolerant landingWorkspace hydrate.
- [ ] `npm run knip` clean (no new unused exports/deps — **zero new deps**, per D2).
- [ ] Edit Modules: add/drag/resize/remove works and the layout **survives a reload**.
- [ ] Startup landing page opens the chosen workspace after the splash and persists.
- [ ] Teardown grep: every new listener/timer/observer has a matching cleanup.
- [ ] Off-perimeter: patch-grep shows zero order/risk/kill-switch/Alpaca-submit writes.

**Deliverables:** the files in §2's touch-map; a CHANGELOG entry under the first `### Added`; a
PROBLEM-LEDGER **P-048** entry (PROBLEM/SOLUTIONS/DECISION + SHIPPED stamp per phase); this blueprint
kept in sync. Everything UNSTAGED for operator review (AGENTS branch→PR).

---

## Decision Log

| D# | Question | Chosen | Why |
|---|---|---|---|
| D1 | Plan boundary | Refine | Operator expanded scope (customization + landing page). |
| (refine) | Scope additions | deeper quant + research mode + scenario layer + **composable Edit-Modules grid** + configurable startup landing | Operator's explicit priority is extreme customization of this one tab. |
| D2 | Grid engine | **Custom lightweight (zero-dep)** | Honors the 10-dep minimalism + knip gate; full control of jiggle UX + `--bb-*`; reuses TweaksPanel drag; avoids react-grid-layout's React-18 peer friction. |
| D3 | Expanded boundary | **Draft it** | Boundary precise, off-perimeter, grid-customization-first. |

## Revision Log (review loop)

| # | Section | Change | Trigger |
|---|---|---|---|
| 1 | §3.7/§5.5/§6 | Grid layout moved to its OWN `Vault/Settings/intel-layout.md` + `INTEL_LAYOUT_GET/SET` IPC (subsecond-prefs mirror), not `WorkspaceState`. Removes the version bump + migration risk. | autoplan eng lens — design the quiet CRITIC risk out, not mitigate it |
| 2 | §3.1/§5.1 | `landingWorkspace` stays additive on `WorkspaceState` with tolerant hydrate — no `version` bump. | autoplan eng lens — minimal, safe, no migration |
| 3 | §1/§3.5/§3.6 | Ship a curated DEFAULT layout + a **Reset layout** affordance (tab valuable out-of-box; no self-trap). | autoplan CEO + design lens |
| 4 | §3.4/§5.3 | v1 collision = **reject-if-overlap** (deterministic); push-down a follow-up. | autoplan eng + design lens |
| 5 | §3.4/§3.11/§5.4 | Per-module `minSize` + edit-mode visual language + explicit **Done**/Esc exit. | autoplan design lens |
| 6 | §3.11 | Documented the one-entry **module contract** for cheap future modules. | autoplan DX lens |
