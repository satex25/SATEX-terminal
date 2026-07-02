# ULTRAPLAN BLUEPRINT — L1.D Chart Interaction Layer (CHART-01..20)

> Execution-ready plan produced by `/ultraplan`. Sections carry stable IDs (§1-§7) so
> the review loop can target them. Keep this file in sync with every accepted revision.

| Field | Value |
|---|---|
| **Goal (verbatim)** | "Use /ultraplan on the above prompt. Run with maximum effort for a massive, 1 conversation task or execution list." — planning the L1.D Terminal chart-interaction layer, CHART-01 through CHART-20 (TIER 0 core + TIER 1 extensions), STOP before TIER 2 (AI layer, deferred to tomorrow). |
| **Slug** | chart-interaction-layer |
| **Date** | 2026-06-15 |
| **Branch** | feat/l1d-funded-compliance @ 497e830 (per session header; git state NOT machine-verified this session — the FUSE mount carries no `.git`. CONFIRM with `git status` in a real shell before building.) |
| **Status** | IN REVIEW |
| **Execution route** | TBD (gated after approval) |
| **Risk class** | CONTAINED (renderer/UI only; no order, risk-param, or live-capital path touched). Two CONFIRM gates on data entitlement. One explicit exclusion: no chart action wires to order execution. |

---

## §1 — Objective Clarification

**Core goal.** Build a professional chart-interaction layer on SATEX's existing
TradingView Lightweight Charts v5 base — navigation, drawing, readout, alternate chart
types, and a WebGL density sublayer for order-flow/volume/volatility visuals — without
breaking a single load-bearing invariant or the renderer perf budget, and without
rendering any fabricated data.

**Locked architecture decision (D2 = Hybrid).** Lightweight Charts v5 stays the base
renderer for price/candles/axes/pan/zoom/crosshair. A dedicated WebGL sublayer is added
**only** where the library cannot reach: footprint cells (CHART-11), the volatility
heatmap (CHART-14), volume profile density (CHART-13), and the realized-vol surface
(CHART-16). Two render paths, one shared viewport transform (§3.1) keeps them in sync.

**Success criteria** (measurable, tied to gates / priority stack):

- All four gates green from `satex-app/`: `npm run typecheck`, `npm run lint`,
  `npm test`, `npm run knip` — real exit 0, with reported test file/count deltas.
- Renderer perf budget held: `tests/e2e/renderer-perf.spec.ts` p50 ≤ 16 ms under
  symbol-rotation + tick load with the new layers mounted (P0 system integrity, P4
  execution precision). This is the hard gate the WebGL-rewrite path would have put at
  risk; the hybrid path must prove it stays green.
- Each shipped CHART-xx has a unit-tested pure core (coordinate math, LOD bucketing,
  drawing model, pattern detectors) under `vitest`, mirroring the existing
  `chart-series.test.ts` / `perf.test.ts` pattern.
- Zero fabricated data: every data-backed visual traces to a real stream
  (`onCandle`, `onTrades`, `DEPTH_UPDATE`) or a real computation over it. Unconfirmed
  feeds are CONFIRM-gated, not faked (Constitution 0.1).
- Teardown clean: every observer/timer/WebGL context/rAF created is released on unmount
  (the PR #6 ResizeObserver leak does not recur).

**Constraints** (Section 0 hard rules + CLAUDE.md invariants by name):

- **0.1** Never hallucinate data. Data-unconfirmed visuals (CHART-16 options-IV path,
  CHART-20 L3/dark-pool) are CONFIRM-then-BUILD with honest computed fallbacks, never
  synthetic feeds.
- **0.4 / 0.5** Every claim traceable; re-validate state — drawings are derived from
  live viewport transform each frame, not cached stale pixel coords.
- **CLAUDE.md: State is Zustand, not Redux.** New chart state lands in Zustand stores
  (a `drawingStore`, extend `useChartOpts`), no cross-store coupling.
- **CLAUDE.md: IPC payloads stay Zod-validated.** Any new channel (drawing sync, prefs)
  gets a Zod schema in `ipc-schemas.ts` + a channel in `ipc-channels.ts`. No raw
  `ipcRenderer.send` of loose objects (rejects the directive's literal sample).
- **CLAUDE.md: SIM/SUB badges render only from canonical gates.** New overlays must not
  duplicate feed-status logic inline; read `isSyntheticFeed` / `showSub`.
- **CLAUDE.md: clean up what you create** (PR #6 leak precedent).
- **CLAUDE.md: No macOS build target. Ever.**
- **Perf budget** (`docs/design/2026-05-22-renderer-perf-budget.md`): p50 ≤ 16 ms.

**Environment.** Layer: **renderer** (primary) + **shared** (pure math/types) + thin
**main** (IPC handlers for prefs/CONFIRM probes). Runtime Electron 32 / React 18 / TS
5.4 strict. Charting: `lightweight-charts@^5.0.0`. State: Zustand. Data feeds present:
`onQuotes`, `onCandle`, `onTrades` (tagged "P0-1 Footprint"), `DEPTH_UPDATE`
(`DepthSnapshot` with bids/asks + **VPIN toxicity proxy [0,1]**), `onNews`. No broker
facet touched (OrderRouter / AccountSyncer untouched). No live-capital path.

**Assumptions.**

- LWC v5 `ISeriesPrimitive` / `IPanePrimitive` + `timeScale()` / `priceScale()`
  programmatic APIs are available for overlay attach + nav control — [VERIFIED: v5 API;
  CONFIRM exact primitive surface against installed types at build start].
- `onTrades` carries trade side in sim (infers from tick direction) — [VERIFIED in
  `market-data-source.ts` comment]. Live side data depends on SIP — [UNVERIFIED, see D-CONFIRM-SIP].
- Existing detectors (`detectDoubleTops`, `detectDoubleBottoms`, `computeFibonacci`,
  EMA/RSI/Pivots) in `@shared/chart-indicators` are reusable for CHART-19/18 — [VERIFIED: imported in ChartPanel].
- Options IV chain is **absent** from the feed — [VERIFIED: no option-chain/greeks
  source found]. CHART-16 builds realized-vol surface from OHLCV, not IV.

**Unknowns (resolved in Decision Log / CONFIRM gates).**

- D1 scope, D2 engine, D3 data-gating, D4 persistence — resolved (see Decision Log).
- CONFIRM-SIP: is SIP entitlement live (real per-trade side on live feed)? -> §3.10.
- CONFIRM-OPT: any options/IV source reachable? Expected NO -> CHART-16 fallback.
- CONFIRM-L3: any Level-3 / dark-pool entitlement? Expected NO -> CHART-20 proxy.
- CONFIRM-MSYNC: can we pull synchronized multi-symbol bar history for the watchlist
  via `getBars` per symbol? -> CHART-17.

---

## §2 — Domain Mapping

**Problem classification.** Predominantly a **functional + operational** renderer
problem with a **data-visualization** core and a hard **temporal/perf** constraint
(60 fps, p50 ≤ 16 ms under tick load). It is **not** a risk or execution problem: no
task touches order routing, position sizing, risk parameters, or the live-capital path.
The only Constitution-0.1 (data integrity) exposure is the temptation to render
unconfirmed feeds, neutralized by CONFIRM-then-BUILD gating and honest computed
fallbacks. One alignment line to hold: a chart is an **analytic surface**, never a
trade trigger — no drawing/pattern wires into EXEC.

**Touch-map.**

- **Agents:** TECH (visualization of technical structure), DATA (consuming validated
  streams, never minting them), AUDIT (self-review of fabrication risk in Layer 6).
  RISK/EXEC/NEWS/MACRO/LEARN: untouched.
- **Broker facets:** **none mutated.** MarketDataSource is read-only consumed
  (`onTrades`, `onCandle`); OrderRouter / AccountSyncer / SymbolResolver untouched.
- **Files / call-sites in blast radius (renderer):**
  `src/renderer/panels/ChartPanel.tsx` (host), `QuadChartPanel.tsx` / `QuadPaneChart.tsx`
  (alt hosts), `src/renderer/lib/chart-series.ts`, `chart-backfill.ts`,
  `quad-chart-theme.ts`, `src/renderer/lib/perf.ts` (+ `.test.ts`),
  `src/renderer/hooks/useChartOpts.ts`, `src/renderer/stores/{depthStore,subsecondStore,indicatorStore,feedStore,themeStore}.ts`.
  **shared:** `@shared/chart-indicators`, `@shared/types` (Trade/Candle/DepthSnapshot),
  `@shared/constants` (CHART_TIMEFRAMES), `@shared/ipc-schemas.ts`, `@shared/ipc-channels.ts`.
  **main (thin):** new IPC handlers near the subsecond-prefs precedent; CONFIRM probes
  in `live-market.ts` / `alpaca.ts`.
  **new:** `src/renderer/chart/` module (overlay, controllers, drawing, webgl sublayer),
  `tests/e2e/renderer-perf.spec.ts` (extend).
- **Load-bearing invariant at risk:** (1) Zustand-not-Redux — new state must be
  Zustand; (2) Zod-validated IPC — new channels must validate; (3) teardown discipline
  — WebGL contexts + rAF + observers must release; (4) perf budget — the literal reason
  D2 rejected the full WebGL rewrite.

---

## §3 — Task Decomposition

> Major -> sub -> micro. None are ⚠️ RISK-TOUCH (no money/order/risk path). The recurring
> **CONFIRM** node is the operator's mandate: verify a capability's presence; if absent
> (as expected), build it from real data — never guess, never fabricate.

### §3.1 — Foundation: composited overlay + shared viewport transform + perf harness
- **Purpose:** one coordinate system every later feature shares; one place to attach
  overlays; perf guardrail wired before density work. **Inputs:** LWC chart instance,
  container ref. **Outputs:** `src/renderer/chart/overlay/` (CanvasOverlay, transform),
  `ViewportTransform` (price<->y, time<->x, both directions), perf-harness extension.
- **Tools:** LWC `timeScale()`/`priceScale()` coordinate APIs, ResizeObserver (with
  teardown), `requestAnimationFrame`. **Depends on:** nothing. **Blocks:** most tasks.
- Subtasks:
  - `ViewportTransform` pure module — `priceToY`, `yToPrice`, `timeToX`, `xToTime`,
    derived each frame from LWC scales (never cached stale). Unit-tested.
  - `CanvasOverlay` React component — absolutely-positioned `<canvas>` over the LWC
    canvas, DPR-aware, resize-synced, **disposes context + observer + rAF on unmount**.
  - Extend `perf.ts` harness hooks so overlay/WebGL frames count toward the p50 budget.

### §3.2 — Core navigation: CHART-01 parallax, CHART-02 timeframe drag, CHART-07 zoom
- **Purpose:** the directive's three nav features, delivered through LWC's scale API
  instead of hand-rolled scroll math. **Inputs:** transform (§3.1), wheel/drag events.
  **Outputs:** `NavController` driving `timeScale().scrollToPosition` /
  `setVisibleLogicalRange` and `priceScale` autoscale toggling.
- **Depends on:** §3.1. **Blocks:** §3.7.
- Subtasks:
  - CHART-01 vertical parallax: lock time axis, pan price range; momentum (velocity
    decay 0.92/frame) + rubber-band (0.3 resistance) implemented over `priceScale`
    manual range; clamp to data bounds. Pure easing math unit-tested.
  - CHART-02 horizontal timeframe drag: grab-and-slide visible window via
    `setVisibleLogicalRange`; snap-to-session-boundary using `@shared/market-hours`
    helpers already in ChartPanel; lazy backfill via existing `chart-backfill.ts`.
  - CHART-07 cursor-centered zoom: wheel -> widen/narrow logical range about cursor
    time; min 50 bars / max full dataset clamp. Pinch maps to same path.

### §3.3 — Crosshair + OHLCV readout (CHART-05)
- **Purpose:** OHLCV tooltip + price/time axis labels on hover, < 50 ms.
- **Depends on:** §3.1. **Blocks:** §3.4 (reuses readout coordinate logic).
- Subtasks: subscribe LWC `subscribeCrosshairMove`; map to candle via transform; render
  `O/H/L/C/V` strip (reuse `fmt` from `lib/format`); throttle to one frame.

### §3.4 — Drawing engine: CHART-03 tools, CHART-09 undo/redo, CHART-04 annotations
- **Purpose:** polyline / hline / vline / Fibonacci / rectangle, text notes, 100-deep
  undo/redo. **Ephemeral-first (D4):** drawings live in a Zustand `drawingStore` in
  memory, keyed by symbol; thin session persistence only.
- **Depends on:** §3.1, §3.3. **Blocks:** §3.5.
- Subtasks:
  - `DrawingModel` (pure): drawing types store **price/time anchors** (not pixel coords)
    so they survive pan/zoom; reuse `computeFibonacci` from `@shared/chart-indicators`
    for fib levels. Unit-tested.
  - `drawingStore` (Zustand) + undo/redo as immutable snapshot stack (depth 100),
    toolbar count indicator.
  - CHART-04 annotations: click-place contentEditable -> commit to model; drag-reposition
    re-derives anchor from transform.
  - **Persistence (D4, minimal):** session-scoped in memory; optional save via a single
    Zod-validated IPC channel `CHART_DRAWINGS_SET/GET` mirroring the subsecond-prefs
    pattern, writing a small `Vault/Settings/chart-drawings.md` ONLY when the operator
    explicitly saves. No autosave-on-every-stroke (token/IO economy per D4).

### §3.5 — Snapshot export (CHART-08)
- **Purpose:** PNG/SVG of current viewport with overlays baked in.
- **Depends on:** §3.4, §3.8 (must composite LWC canvas + overlay + WebGL layer).
- Subtasks: composite the LWC canvas, the 2D overlay, and the WebGL layer into one
  offscreen canvas -> `toBlob('image/png')`; SVG path for vector (drawings/annotations
  only). Save to user Downloads via a Zod-validated main-side write (not renderer fs).

### §3.6 — Alternate chart types: Renko / Line Break / Kagi (CHART-15)
- **Purpose:** switch series type; all share §3.2 nav.
- **Depends on:** §3.1. **Parallelizable with §3.2/§3.3.**
- Subtasks: pure transforms OHLCV -> Renko bricks / Line-Break / Kagi in
  `@shared/chart-indicators` (or a new `chart-types.ts`), unit-tested; render as LWC
  custom series or mapped candlestick series; type selector in `useChartOpts`.

### §3.7 — Multi-timeframe overlay (CHART-06)
- **Purpose:** drag a 2nd timeframe panel onto the chart, independent scroll, shared or
  split price axis.
- **Depends on:** §3.2 (nav reused per-panel). **Risk:** state isolation between panels.
- Subtasks: second LWC instance in an overlay pane; isolated nav state; toggle shared-Y.

### §3.8 — WebGL density sublayer: CHART-10 base, CHART-11 footprint, CHART-13 volume profile, CHART-14 volatility heatmap
- **Purpose:** the hybrid's WebGL half — high-density visuals LWC can't draw. **CHART-14
  volatility heatmap is the operator-flagged priority** (instant volatility / rug-pull
  read).
- **Depends on:** §3.1 (transform + overlay), §3.2 (viewport range). **Data:** `onCandle`,
  `onTrades`, `DEPTH_UPDATE` — all present.
- Subtasks:
  - CHART-10 WebGL base: single `WebGLRenderer` on a dedicated canvas in the overlay
    stack; offscreen FBO; **frustum cull to visible time range ± 5%**; LOD bucketing
    (merge sub-bars when zoomed out). Context-loss + unmount disposal handled. Pure LOD
    bucketing math unit-tested. Perf-gated by §3.1 harness.
  - CHART-11 footprint: per-candle bid/ask volume cells from `onTrades` (sim side
    inferred; live via SIP, see §3.10 CONFIRM-SIP) + `DepthSnapshot`. Cell aggregation
    pure + tested.
  - CHART-13 volume profile (TPO): horizontal histogram on right axis; POC auto-marked;
    aggregate from candle volume + trade prints. Pure binning tested.
  - **CHART-14 volatility heatmap:** color candle bodies / background by a realized-vol
    intensity computed from OHLCV (ATR / rolling stdev / tick velocity) **plus the
    existing `DepthSnapshot.vpin` toxicity proxy** for rug-pull sensitivity. All inputs
    are real and present — **no CONFIRM needed, build directly.** Intensity mapping +
    color ramp pure + tested. Honors theme via `themeStore`.

### §3.9 — Flow + pattern intelligence: CHART-12 tape, CHART-19 patterns, CHART-18 indicator builder, CHART-17 correlation
- **Purpose:** order-flow tape, auto pattern overlay, no-code indicator composer, and the
  watchlist correlation heatmap.
- **Depends on:** §3.1; CHART-17 depends on CONFIRM-MSYNC (§3.10).
- Subtasks:
  - CHART-12 order-flow tape: vertical Time & Sales beside chart from `onTrades`
    (`TRADES_TICK` channel exists); green/red/gray by side; speed throttle. Buildable now.
  - CHART-19 pattern recognition: **extend existing** `detectDoubleTops` /
    `detectDoubleBottoms`; add Head&Shoulders, wedge, flag detectors in
    `@shared/chart-indicators` (pure, tested); auto-draw with a calibrated confidence
    score (Constitution 0.7 — calibrated, not inflated). Analytic only, never a trigger.
  - CHART-18 custom indicator builder: node-graph (SMA/EMA/RSI -> cross -> alert) over
    existing indicator primitives; evaluate pure; render via overlay/LWC series. Alerts
    are visual only.
  - CHART-17 correlation heatmap: watchlist x watchlist rolling correlation grid.
    **CONFIRM-MSYNC first:** verify synchronized multi-symbol bar history via `getBars`
    per watchlist symbol; if present, build; if the pull is unsynced, build a
    resampler that aligns timestamps (real data, honest alignment). Update ~5 s.

### §3.10 — CONFIRM-gated data features: CHART-16 vol surface, CHART-20 dark-pool/L3 + CONFIRM-SIP
- **Purpose:** honor the operator's CONFIRM-then-BUILD mandate exactly. Each is an
  investigation node followed by a build path that uses only real data.
- Subtasks:
  - **CONFIRM-SIP:** probe `live-market.ts` / `alpaca.ts` feed mode (`iex|sip`). Comment
    already says real per-trade side lands "when the SIP entitlement lands." Outcome
    documented; footprint/tape work in sim regardless; live fidelity noted, not faked.
  - **CHART-16 vol surface — CONFIRM-OPT then BUILD:** CONFIRM no options/IV source
    (expected absent — none found). Then BUILD a **realized-volatility surface**:
    X=lookback window, Y=timeframe, Z=realized vol from our OHLCV. Rotatable 3D on the
    WebGL layer. Real computed data, zero fabrication. (If an IV feed is ever added, the
    same surface renders implied vol — forward-compatible.)
  - **CHART-20 dark-pool/L3 — CONFIRM-L3 then BUILD honest proxy:** CONFIRM no L3 /
    dark-pool entitlement (expected absent). Then BUILD a **large-print / block-trade
    detector** from the real `onTrades` stream (prints above a size threshold marked as
    ghost markers), explicitly labeled "block prints (proxy)" — NOT mislabeled as dark
    pool. If real L3 is ever entitled, the marker source swaps with no UI change.

---

## §4 — Dependency + Ordering (DAG)

**Ordered execution sequence (recommended build order):**
§3.1 -> §3.2 -> §3.3 -> §3.4 -> §3.6 -> §3.8 -> §3.9 -> §3.7 -> §3.5 -> §3.10

**Parallelizable sets (no mutual dependency):**
- After §3.1: { §3.2, §3.3, §3.6 } can proceed in parallel.
- CONFIRM spikes { CONFIRM-SIP, CONFIRM-OPT, CONFIRM-L3, CONFIRM-MSYNC } are read-only
  investigations — run them **early/anytime**, before their dependent builds.
- After §3.8 base: { §3.8 footprint/profile/heatmap, §3.9 pattern-recognition } parallel.

**Approval / attention nodes** (none are live-capital one-way doors; flagged for operator
visibility):
- ⚠️ CONFIRM-SIP / CONFIRM-OPT / CONFIRM-L3 / CONFIRM-MSYNC — decision points where the
  build path forks on real capability. Surfaced, not guessed.
- ⛔ **EXCLUDED BY DESIGN:** no drawing, pattern, or indicator-builder alert may wire to
  order execution. A "draw line -> auto-trade" path would be RISK-TOUCH and is out of
  scope for this layer (Constitution 0.2/0.8, 8.1). Chart = analytic surface only.

```
                     ┌─▶ §3.2 nav ─────────────┬─▶ §3.7 multi-TF ─┐
  §3.1 foundation ───┼─▶ §3.3 crosshair ─▶ §3.4 drawing ─────────┼─▶ §3.5 export
                     ├─▶ §3.6 alt-types                            │
                     └─▶ §3.8 webgl base ─▶ {11 footprint,13 VP,   │
                                            14 vol-heatmap*} ──────┘
  CONFIRM-{SIP,OPT,L3,MSYNC} (early spikes) ─▶ §3.9 {12 tape,19 patterns,18 builder,17 corr}
                                            ─▶ §3.10 {16 vol-surface, 20 block-print proxy}
  (* CHART-14 volatility heatmap = operator priority; no CONFIRM, real data present)
```

---

## §5 — Execution Specification

### §5.1 — spec for §3.1 (Foundation)
- **Method:** derive a per-frame `ViewportTransform` from LWC `timeScale()`/`priceScale()`
  coordinate converters; composited absolutely-positioned canvas overlay (DPR-scaled).
- **Artifacts:** `src/renderer/chart/overlay/CanvasOverlay.tsx`, `ViewportTransform.ts`
  (+ `.test.ts`), `perf.ts` hook extension.
- **Validation:** typecheck + lint + `ViewportTransform.test.ts` round-trips
  (price->y->price within epsilon); perf harness still p50 ≤ 16 ms with empty overlay.
- **Failure modes:** stale transform after resize (Const. §11 data-feed-corruption analog
  for pixels); overlay/observer leak (PR #6). **Fallback:** rebuild transform on every
  `subscribeVisibleTimeRangeChange`; assert single observer in test.

### §5.2 — spec for §3.2 (Navigation)
- **Method:** drive LWC scale API, not raw scroll math; easing/rubber-band as pure
  functions; clamp to `getBars` data bounds.
- **Artifacts:** `NavController.ts` (+ `.test.ts` for momentum/rubber-band/zoom-clamp).
- **Validation:** unit tests for decay (0.92/frame), resistance (0.3), zoom bounds
  (50..N bars), session-snap math; manual fps check via perf harness.
- **Failure modes:** momentum overscroll past data; snap to wrong session. **Fallback:**
  hard clamp + snap-window unit tests; reuse `@shared/market-hours`.

### §5.3 — spec for §3.3 (Crosshair) / §3.4 (Drawing) / §3.5 (Export)
- **Method:** LWC `subscribeCrosshairMove`; price/time-anchored drawing model (survives
  pan/zoom); immutable undo stack; composite-canvas export.
- **Artifacts:** `Crosshair.tsx`, `DrawingModel.ts` (+test), `drawingStore.ts`,
  `AnnotationLayer.tsx`, `export.ts`; IPC `CHART_DRAWINGS_GET/SET` + Zod schema.
- **Validation:** model test (anchor stable across zoom); undo/redo depth-100 test;
  export produces > 100 KB PNG containing overlay; typecheck/lint/knip clean.
- **Failure modes:** pixel-anchored drawings drift on zoom (root cause to avoid);
  unbounded undo memory. **Fallback:** anchors in price/time only; cap stack at 100.

### §5.4 — spec for §3.6 / §3.7 (Alt types / Multi-TF)
- **Method:** pure OHLCV->Renko/LineBreak/Kagi transforms; second LWC instance with
  isolated nav state.
- **Artifacts:** `chart-types.ts` (+test), `MultiTFOverlay.tsx`.
- **Validation:** transform unit tests (brick size, reversal); state-isolation test (pan
  panel A does not move B); perf budget held with 2 instances.
- **Failure modes:** shared-state bleed between panels. **Fallback:** per-panel store slice.

### §5.5 — spec for §3.8 (WebGL density: base, footprint, volume profile, **vol heatmap**)
- **Method:** dedicated WebGL canvas in overlay stack; FBO + frustum cull + LOD;
  aggregation cores pure. Vol heatmap intensity = f(ATR/rolling-stdev/tick-velocity,
  `DepthSnapshot.vpin`).
- **Artifacts:** `webgl/WebGLRenderer.ts`, `webgl/lod.ts` (+test), `footprint.ts` (+test),
  `volume-profile.ts` (+test), `vol-heatmap.ts` (+test).
- **Validation:** LOD/bucketing/intensity unit tests; **perf E2E p50 ≤ 16 ms @ 10K
  candles with WebGL layer live** (the hybrid's must-pass proof); GPU context disposed on
  unmount (test asserts `loseContext` called).
- **Failure modes:** WebGL context loss; GPU leak; perf regression (Const. §11
  memory-leak / model-drift analogs). **Fallback:** on context loss, degrade to a 2D
  canvas heatmap (lower density) rather than blank; if perf regresses, cap density via LOD.

### §5.6 — spec for §3.9 / §3.10 (Flow/intelligence + CONFIRM-gated)
- **Method:** tape from `onTrades`; extend existing detectors for patterns (calibrated
  confidence); node-graph indicator eval over existing primitives; correlation over
  resampled multi-symbol bars; CONFIRM probes then real-data builds (realized-vol
  surface; block-print proxy).
- **Artifacts:** `OrderFlowTape.tsx`, `patterns.ts` (+test, extends chart-indicators),
  `indicator-graph.ts` (+test), `correlation.ts` (+test), `vol-surface.ts` (+test),
  `block-prints.ts` (+test); CONFIRM findings appended to this spec.
- **Validation:** detector tests with known fixtures; confidence calibration sanity
  (no >0.9 on noise); correlation symmetry/diagonal tests; CONFIRM outcomes documented
  with file/line evidence (Const. 0.4 traceability).
- **Failure modes:** confidence inflation (Const. 8.1) -> auto-downgrade rule in tests;
  mislabeling proxy as real (Const. 0.1) -> explicit "(proxy)" labels enforced in UI test.
- **Fallback:** if CONFIRM finds a feed truly absent and no honest computation exists,
  the feature emits `UNKNOWN — SIGNAL INSUFFICIENT` UI state, never fake data.

---

## §6 — Risk + Ambiguity Audit (self-adversarial)

**CRITIC pass.**

- *What am I assuming I haven't verified?* The exact LWC v5 primitive/coordinate API
  surface, git branch state, and SIP/options/L3 entitlement. All four are converted to
  explicit CONFIRM nodes at build start, not assumed.
- *Worst case if wrong?* (a) LWC v5 lacks a needed primitive -> the hybrid's WebGL layer
  absorbs that visual (the architecture already plans a WebGL path, so this degrades
  gracefully). (b) Perf budget regresses under WebGL -> §5.5 makes the p50 E2E a
  must-pass with LOD/degrade fallbacks. (c) A "temporary" drawing-persistence hack
  becomes permanent -> D4 keeps it ephemeral-first, single Zod IPC channel only.
- *What did I leave out?* Teardown: every rAF, ResizeObserver, WebGL context, LWC
  subscription, and event listener must release on unmount — explicit in §5.1/§5.5
  with test assertions (PR #6 leak precedent). Theme: overlays/WebGL must honor
  `themeStore`. SIM/SUB badges: overlays must not duplicate feed-status logic inline.
- *Unknown unknowns:* a node-graph indicator builder (CHART-18) is the largest scope risk
  in TIER 1; it can be staged (MVP: linear pipeline of existing indicators) without
  blocking anything else. Flagged for the /autoplan second opinion.

**RISK-AGENT pass** (against Section 5 immutable risk rules + Section 8 guardrails):

- **Verdict: APPROVED.** This layer proposes no trade, no position sizing, no risk-param
  change, no live-capital action, no single-signal trade logic, no safety-layer bypass.
  Section 5 limits are not engaged. Section 8: no self-modification of risk params, no
  EXEC path. The one alignment hazard — wiring a chart action to execution — is
  explicitly EXCLUDED in §4 (⛔ node). Data-integrity (0.1) is the live risk and is
  handled by CONFIRM-then-BUILD + honest-proxy labeling + `UNKNOWN` fallback.
- **Conditions on approval:** (1) no autosave persistence creep (D4); (2) perf E2E is a
  release gate for §3.8; (3) every proxy/derived visual is labeled as such; (4) no
  `any`, no `@ts-ignore`, Zod on all new IPC.

**Unresolved high-risk items surfaced to operator:** none capital-facing. Build-time
CONFIRM nodes (SIP/OPT/L3/MSYNC) are documented and forked, not guessed.

---

## §7 — Final Assembly: the plan

**Build order (copy-ready):**
1. §3.1 Foundation — overlay + `ViewportTransform` + perf hook — done when transform
   round-trip test passes and empty-overlay perf p50 ≤ 16 ms.
2. CONFIRM spikes (SIP/OPT/L3/MSYNC) — read-only — done when each outcome is written into
   this spec with file/line evidence.
3. §3.2 Navigation (CHART-01/02/07) — done when momentum/rubber-band/zoom/snap unit tests
   pass and manual fps holds.
4. §3.3 Crosshair (CHART-05) — done when OHLCV readout renders < 50 ms on hover.
5. §3.4 Drawing + undo/redo + annotations (CHART-03/09/04) — done when anchors survive
   zoom and undo depth-100 test passes.
6. §3.6 Alt types (CHART-15) — done when Renko/LineBreak/Kagi transform tests pass.
7. §3.8 WebGL base + footprint + volume profile + **vol heatmap** (CHART-10/11/13/14) —
   done when LOD/intensity tests pass and perf E2E p50 ≤ 16 ms @ 10K candles WITH WebGL
   live. (CHART-14 prioritized.)
8. §3.9 Tape + patterns + indicator builder + correlation (CHART-12/19/18/17) — done when
   detector fixtures pass, confidence stays calibrated, correlation tests pass.
9. §3.7 Multi-TF overlay (CHART-06) — done when panel state-isolation test passes.
10. §3.5 Export (CHART-08) — done when composited PNG contains all layers.
11. §3.10 Vol surface + block-print proxy (CHART-16/20) — done when realized-vol surface
    renders from OHLCV and block prints are labeled "(proxy)".

**Acceptance criteria (gate outcomes):**
- [ ] `npm run typecheck` clean (exit 0)
- [ ] `npm run lint` clean (exit 0)
- [ ] `npm test` green — report new file/test counts vs current 775/775
- [ ] `npm run knip` clean (or noted CI-only per digest)
- [ ] `tests/e2e/renderer-perf.spec.ts` p50 ≤ 16 ms with overlay + WebGL layer mounted
- [ ] Every new visual traces to a real stream/computation; proxies labeled; no fabricated feed
- [ ] Teardown test: no leaked rAF / observer / WebGL context on unmount
- [ ] All new IPC Zod-validated; no `any` / `@ts-ignore`; state in Zustand

**Deliverables:** the `src/renderer/chart/` module + shared math + thin IPC; unit tests
per feature; perf E2E extension; CHANGELOG entry; PROBLEM-LEDGER deltas (one per CHART
group); this spec updated with CONFIRM findings.

---

## Decision Log

| D# | Question | Chosen | Why |
|---|---|---|---|
| D1 | Scope boundary | CHART-01..20, stop before TIER 2 | Matches the operator's "STOP RIGHT HERE" marker; TIER 2 AI layer deferred to tomorrow. |
| D2 | Chart engine | **Hybrid** — LWC v5 base + WebGL only where needed | Keeps the tested, perf-budgeted base; adds WebGL only for footprint/heatmap/vol-surface the library can't draw. Avoids the rewrite's perf + regression risk. |
| D3 | Data-gated features | Plan all 20; **CONFIRM-then-BUILD** unconfirmed ones | Operator mandate: never guess — confirm a capability's absence, then build it from real data (no fabrication, Const. 0.1). Volatility heatmap prioritized; builds from data we already have. |
| D4 | Persistence / IPC | App convention (Zod IPC) but **ephemeral-first** drawings | Drawings are temporary; don't spend complexity/tokens on durable scribble storage. Zod IPC honors the invariant; save only on explicit operator action. Reserve budget for TIER 2 AI integration. |

## Revision Log (review loop)

| # | Section | Change | Trigger |
|---|---|---|---|
| 0 | all | Initial draft | ultraplan Layer 7 assembly |
