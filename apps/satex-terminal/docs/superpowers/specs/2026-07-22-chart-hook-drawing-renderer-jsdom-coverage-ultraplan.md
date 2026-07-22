# ULTRAPLAN — Chart-subtree jsdom-harness coverage, wave 1: `useIPC.ts` + `drawing-renderer.ts` (P-129)

- **Date:** 2026-07-22 (fallback dawn — no 05:00 handoff fired; work-layer assumed the planner role, ledger P-129)
- **Author:** work-layer finisher (Claude Opus 4.8), off-nominal fire 14:06 CDT
- **Program:** closes the first two modules of the P-129 chart-subtree coverage survey; the clean off-perimeter `.ts` picks (renderer stores 24/24 P-127, shared indicators P-128) are exhausted, so this opens the jsdom + canvas-stub harness workstream P-129 mapped.
- **Blast radius:** test-only. Zero source edits planned. OFF-PERIMETER (renderer UI + pure canvas math; no order/risk/kill/arm/credential/update-feed path).

---

## LAYER 1 — OBJECTIVE

Add two characterization suites that pin the load-bearing behavior of the two highest-value untested chart modules from the P-129 map, **without editing either subject**:

1. `src/renderer/hooks/useIPC.ts` (154 L) — the single IPC-subscription hub; the §2.5.7 listener-cleanup surface. Success = a new `useIPC.test.tsx` (jsdom) that turns RED if the subscribe-once / cleanup-all contract, the missing-`window.satex` guard, the optional-channel fallback (`?.() ?? (() => {})`), or the replay-transition reset logic regresses.
2. `src/renderer/chart/drawing/drawing-renderer.ts` (145 L) — the pure canvas `renderDrawing` switch. Success = a new `drawing-renderer.test.ts` (node env, mock `CanvasRenderingContext2D`) that pins each `kind` branch, the dpr scaling, the selected/color selection, and the `(x2 - x1) || 1` vertical-extend divide-by-zero guard (P-039/P-040/P-093 degenerate-input class).

**Measurable success criteria:**
- vitest test-count delta: +~18 (useIPC) and +~16 (drawing-renderer) → ~+34 net, both files green ×2 under `--sequence.shuffle`.
- `npm run typecheck` stays exit 0 (both tsconfigs), scoped `eslint` on the two new files exit 0.
- Both subjects `git diff --stat` **empty** (no source touched).
- knip = CI-arbitrated (sandbox oxc crash under Node 22, P-097).

**Constraints:** no new dependency (dependency minimalism, §1.1; `@testing-library/react` is NOT installed — use the hand-rolled `renderHook` proven by `__harness_probe.test.tsx`). Bash-mount writes only (P-099). Subjects untouched unless a real defect surfaces → then full PSD, off-perimeter + low-blast-radius only.

**Assumptions (flagged):** (a) react-dom 19.2.7 + `act` from `react` render the hook under jsdom — VERIFIED, probe green 3/3. (b) Zustand `getState()` returns a stable object so `vi.spyOn(useStore.getState(), 'method')` installed pre-mount is captured by the hook's destructure — standard Zustand contract, verified at `marketStore.ts:38` / `footprintStore.ts:38`.

---

## LAYER 2 — DOMAIN MAP

| File | Role | Touch |
|---|---|---|
| `src/renderer/hooks/useIPC.ts` | subject 1 (READ-ONLY) | none |
| `src/renderer/hooks/useIPC.test.tsx` | NEW suite | create |
| `src/renderer/chart/drawing/drawing-renderer.ts` | subject 2 (READ-ONLY) | none |
| `src/renderer/chart/drawing/drawing-renderer.test.ts` | NEW suite | create |
| `src/renderer/hooks/__harness_probe.test.tsx` | prior-session spike (UNSTAGED, untracked); proves the harness | fold its assertions into the real suite; **recommend operator remove the spike** — do not delete unattended |
| `src/renderer/stores/marketStore.ts` · `footprintStore.ts` | real stores, spied for wiring spot-checks | none (spy only) |
| `src/renderer/chart/drawing/DrawingModel.ts` | `fibLevels`, Drawing/FibDraw types | import only (already covered) |
| `src/renderer/chart/overlay/ViewportTransform.ts` | `ViewportTransform` type | import type only |

**PERIMETER:** none. No RISK-TOUCH nodes in this plan.

---

## LAYER 3 — TASK TREE

- **T1** author `useIPC.test.tsx` (jsdom harness + mock `window.satex`).
- **T2** gate T1 (vitest ×2 shuffle, scoped eslint, typecheck).
- **T3** author `drawing-renderer.test.ts` (mock ctx factory).
- **T4** gate T3 (vitest ×2 shuffle, scoped eslint, typecheck).
- **T5** full-project typecheck + combined byte-verify (0 NUL / 0 CRCR / LF / tail intact) on both new files.
- **T6** ledger P-129 transition + close docs.

---

## LAYER 4 — DEPENDENCY DAG

```
T1 → T2 ∥ (T3 → T4)   [T1/T2 and T3/T4 are independent veins, may interleave]
        ↓
       T5 → T6
```

No APPROVAL NODES (no perimeter contact).

---

## LAYER 5 — EXECUTION SPECS

### T1 — `useIPC.test.tsx` (jsdom)
- **Method:** top-of-file `// @vitest-environment jsdom`. Hand-rolled `renderHook` (copy the proven mechanism from `__harness_probe.test.tsx`: `createRoot` + `act` + `IS_REACT_ACT_ENVIRONMENT=true`). A `makeSatex(opts)` factory returning an object whose every `onX` is `vi.fn(() => unsubSpy)` and each optional channel can be omitted. `beforeEach` `delete (window as any).satex`; reset the real stores touched.
- **Assertions (describe blocks):**
  1. *guard* — no `window.satex`: `console.error` spy called, hook returns without throw, unmount no-throw.
  2. *subscribe contract* — with full satex: each required `onX` (`onQuotesTick`,`onCandlesUpdate`,`onNewsAppend`,`onAccountUpdate`,`onOrdersUpdate`,`onSystemStatus`) called exactly once; `subscribe` called once with `[]`.
  3. *cleanup contract (THE leak pin)* — register a shared `unsub` spy across N channels; on `unmount()` the total unsub-call count == number of registered channels; each required channel's own unsub called once. Re-mount after unmount re-subscribes (idempotent lifecycle).
  4. *optional-channel absence* — satex with ONLY the required six present (all `?.`-guarded channels absent): mount + unmount no-throw (the `?? (() => {})` fallback).
  5. *optional-channel presence* — include `onRegimeUpdate`,`onHealthReport`,`onUpdateAvailable`,`onSubsecondCandlesUpdate`,`journal.onTradeClosed`,`onTradesTick`,`onFeedStatusUpdate`,`replay.onStatus`,`onCandlesBulkReplace`,`onAutonomousStats`,`onDepthUpdate`,`onMacroUpdate`,`onLogsTail`,`onRiskGatesUpdate`: each subscribed once, each cleaned up on unmount.
  6. *push routing spot-check* — `vi.spyOn(useMarketStore.getState(),'updateQuotes')` pre-mount; capture the `onQuotesTick` callback; invoke it with a payload inside `act`; assert `updateQuotes` called with that payload (wiring is not inverted).
  7. *replay transition logic* — spy `useMarketStore.getState().resetCandles` + `useFootprintStore.getState().reset`; capture the `replay.onStatus` callback; drive `stopped→playing` (enter ⇒ both reset once), `playing→paused` (stay ⇒ no new reset), `paused→stopped` (leave ⇒ both reset again); assert `setReplay` (via `replayStore`) still receives each status.
  8. *seed fetches* — provide `getRegime`/`getRiskGates`/`getAutonomousStatus`/… as `vi.fn(() => Promise.resolve(null))`; assert each awaited seed fn called once and a rejecting seed fn does not throw (the `.catch(() => {})` wall).
- **Validation:** `npx vitest run src/renderer/hooks/useIPC.test.tsx` → exit 0; re-run `--sequence.shuffle` → exit 0. Expected ~18 tests.
- **Failure mode / fallback:** if a store-spy proves flaky (getState identity), fall back to asserting the captured-callback contract only (mock-level), still pinning subscribe/cleanup — the leak surface — without store coupling. Record the reduction as a divergence.

### T3 — `drawing-renderer.test.ts` (node)
- **Method:** `makeCtx()` returns a mock ctx: `beginPath/moveTo/lineTo/stroke/fillText/fillRect/strokeRect/arc/fill/save/restore` as `vi.fn()`, plus tracked accessor props (`strokeStyle`,`fillStyle`,`lineWidth`,`font`,`globalAlpha`) that push each assignment into a log array so alpha set→reset ordering is observable. `makeTransform()` returns `{ timeToX:(t)=>t, priceToY:(p)=>p, rect:{left:0,top:0,width:800,height:600}, ... }` (identity maps make expected pixel math trivial).
- **Assertions:**
  1. *common* — `save`+`restore` each once (balanced); unselected ⇒ `strokeStyle===drawing.color ?? '#e0e0e0'`; selected ⇒ `===accent`; `lineWidth===(lineWidth??1)*dpr`.
  2. *line plain* — `moveTo(x1*dpr,y1*dpr)`/`lineTo(x2*dpr,y2*dpr)`; `stroke` once.
  3. *line extend non-vertical* — endpoints at x=0 and x=width; slope applied.
  4. *line extend VERTICAL (x1==x2) — degenerate guard* — no NaN/Infinity in any moveTo/lineTo arg (the `(x2-x1)||1` pin); assert `Number.isFinite` on every coord passed.
  5. *hline* — with `label` ⇒ `fillText` called; without ⇒ not.
  6. *vline* — with `label` ⇒ `fillText`; without ⇒ not.
  7. *rect* — `globalAlpha` log === `[fillOpacity, 1]` (set then reset); `fillRect`+`strokeRect` with dpr-scaled w/h.
  8. *fibonacci* — level count == `fibLevels(fib).length`; each level `drawLine`+`fillText`; unknown-label color falls back to DEFAULT; **degenerate hi==lo ⇒ `fibLevels`==[] ⇒ zero drawLine** (P-039 class).
  9. *annotation* — `arc` (dot) + `fill` + `fillText`; font uses `fontSize??12`.
  10. *dpr sweep* — dpr=2 doubles every coordinate vs dpr=1 for a fixed line.
- **Validation:** `npx vitest run src/renderer/chart/drawing/drawing-renderer.test.ts` exit 0; ×2 shuffle exit 0. Expected ~16 tests.
- **Failure mode:** if a coord assertion is off, the identity transform makes the expected value obvious — re-derive from the source line, never loosen the assertion to pass.

### T5 — verify
- `npm run typecheck` (both tsconfigs) exit 0. Scoped `eslint` on both new files (fallback to CI if the 45s flat-config cold-start ceiling trips). python byte-scan both new files: 0 NUL, 0 `\r\r`, LF-only, tail intact. `git diff --stat` on both subjects EMPTY. `md5sum package-lock.json` == `b35d26e1f1a411c2ac12e0e3a344ba12` (no install).

---

## LAYER 6 — RISK AUDIT (self-adversarial)

- **Harness leak:** the hand-rolled `renderHook` must `root.unmount()` in a cleanup or each test leaks a jsdom root. Mitigation: every test that mounts also unmounts (the cleanup contract tests do; the others call `h.unmount()` in-body or via `afterEach`). Not a product leak — test hygiene.
- **Store bleed across tests:** the real stores are module singletons; a spot-check mutation persists. Mitigation: `beforeEach` reset (`setState(getInitialState?.() ?? …, true)` or targeted reset) + spies via `vi.restoreAllMocks()` in `afterEach`.
- **Spy-identity trap (P-124-adjacent):** if a store `set` replaced the whole state object incl. methods, the pre-mount spy would be stale. Verified these stores' `set` returns partials that never include the action fns, so the spied method survives. If a future store inlines actions into `set`, this test goes red — correct signal.
- **Degenerate inputs:** the drawing suite explicitly drives x1==x2 (vertical extend) and hi==lo (empty fib) — the two divide-by-zero / empty-array classes on this surface.
- **NUL/CRCR corruption:** new files via bash heredoc, python byte-verified post-write (P-099).
- **No perimeter, no reconnect, no aliased-default construction** in scope.

---

## LAYER 7 — WRITE

Blueprint written to `docs/superpowers/specs/2026-07-22-chart-hook-drawing-renderer-jsdom-coverage-ultraplan.md`. Suites authored under the same session (fallback dawn+finisher). NEXT wave for tomorrow's planner: `chart/export.ts` (canvas+Blob) and `hooks/useChartOpts.ts` (renderHook), then the 7 view `.tsx` from the P-129 map.
