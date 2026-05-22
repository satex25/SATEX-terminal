# Renderer Frame-Budget Canary — Design Spec

**Date:** 2026-05-22
**Branch:** `design/v0.6-phase-4-data-binding`
**Status:** Spec for review (resolves audit M-1 – M-4). No code until approved.
**Closes:** v0.6 Phase 5 hardening — "renderer perf budget (runtime harness)".
**Fulfills:** A1 sub-second-candles design doc §5 (risk row 1) + §6 Sprint 3 item 2
("Perf canary test — synthetic 20 trades/sec for 5 min, assert frame budget"),
deferred per `CHANGELOG.md` 0.4.4.

---

## 1. Goal

A runtime harness that guards the renderer's frame budget under realistic streaming
load, generalised to the whole v0.6 renderer (not only sub-second crypto). It must:

1. Measure true per-frame timing percentiles (p50/p95/p99) over a sustained load window.
2. Assert a steady-state 60fps floor and catch regressions from a measured baseline.
3. Run offline, deterministically, opt-in — never perturbing production or default CI.
4. Carry a CI-covered unit test for the measurement math, so the percentile/ring-buffer
   logic can't silently rot.

### Non-goals (YAGNI)

- **No bespoke load injector.** `TICK_HZ = 20` (`src/shared/constants.ts:28`) means the
  simulator already emits ~20 ticks/s/symbol (~360 events/s across 18 symbols, coalesced
  at `BATCH_MS = 50`). That *is* the A1 spec's "20 trades/sec." A synthetic injector was
  the rejected Option 2.
- **No production perf HUD/overlay.** `window.satexPerf.dump()` already covers dev-time
  inspection.
- **No per-component instrumentation sprawl.** Only the two chart hot paths are wrapped
  (§4.2). Other panels stay untouched.
- **No CI wiring of the E2E.** See §5.1 — the project's CI cannot run Playwright; forcing
  it in is out of scope.

---

## 2. Audit reconciliation

The design review (2026-05-22) approved the 4-component architecture and raised M-1 – M-4.
Resolutions below. Where the audit's *specifics* contradicted the codebase, the codebase
wins and the correction is recorded with evidence — transparent divergence, not silent.

### Accepted from the audit

- **Two-gate calibration** (absolute spec gate + regression gate) — adopted in §5.
- **p50 ≤ 16ms as the non-negotiable 60fps-floor assert** — adopted (§5, §6).
- **Designated, documented stress path rather than an assumed one** — adopted (§4.3.1),
  including the audit's rapid-symbol-rotation idea (the `setData`-rebuild stressor).
- **Explicit primary/secondary signal split** — adopted (§6).
- **Idempotent profiler lifecycle with explicit teardown** — adopted (§4.1, §7).
- **Default duration 5 min** (A1 spec); 3 min documented as a dev-iteration override.
- **Baseline = median of ≥3 runs** — adopted (§5.2).

### Corrected against the codebase (evidence-backed)

| # | Audit claim | Reality | Resolution |
|---|---|---|---|
| C-1 | Canary "blocks merge" / "CI gate" / "exit 1 fails CI" | `.github/workflows/ci.yml` runs only `typecheck` + `vitest` on Ubuntu (no Playwright, no lint, no knip). `heap.spec.ts` is opt-in and not in CI either. | The **E2E canary is a manual / release-checklist gate**, not an automated CI merge gate. Only **`perf.test.ts` (vitest)** gates CI. Stated in §5.1. |
| C-2 | "simulator < 100 frames/sec → insufficient stress" | `requestAnimationFrame` is display-capped (~60fps). 100 frames/sec is physically unreachable. | Load-sufficiency is measured by **renderer event throughput / `chart:setData` call count**, not frames/sec (§5.3). |
| C-3 | Stress path = "Quad + 4 crypto (BTC, ETH, SOL, DOGE)" | `UNIVERSE` has exactly **two** crypto: BTC, ETH (`constants.ts:85-86`). SOL/DOGE don't exist. | Stress path = Quad with **BTC + ETH + two high-volatility equities (NVDA, TSLA)** (§4.3.1). |
| C-4 | Toggle "EMA, RSI, Bollinger" | The 6 indicators are EMA / RSI / Double Top / Double Bottom / Fibonacci / Pivot Points, via `useIndicatorStore` (`ChartPanel.tsx:6-7`). **No Bollinger.** | Stress path enables the **actual** indicator set via the indicator store (§4.3.1). |
| C-5 | "useEffect cleanup must `destroy()` on component unmount" | The profiler is **driven by the Playwright harness via `window.satexPerf`**, not owned by a React component. No component-unmount race exists. | Provide idempotent `stop()` + `reset()`; the harness calls `stop()` in `finally` (mirroring every existing E2E's `finally { app.close() }`). Each test launches+closes a fresh Electron app, so cross-run pollution is structurally impossible (§7). |
| C-6 | Validation: `window.satexPerf.frameProfile === undefined` when `SATEX_PERF_OFF=1` | `window.satexPerf` is always attached; `PERF_OFF` makes methods no-op (`perf.ts:27,86,97,129`). | Under `SATEX_PERF_OFF=1`, `frameProfile.start()` is a **no-op** and `report()` returns a zeroed result. The object still exists (§4.1). |
| C-7 | Spec-doc path `C:\Users\User\mc4\satex-app\docs\design\…` | App lives at `…\mc4\00-PROJECT-ROOT\01-SATEX-CORE\satex-app\…`. | This file is written to the real nested path. |

### Adjusted (rigour kept, over-fitting dropped)

- **σ < 5% across baseline runs** is recorded as an **advisory** health note, not a hard
  blocker. Desktop frame timing carries irreducible variance (GC, OS scheduling); a hard
  σ gate would itself be flaky. We take the **median of 3 runs** and report the spread.
- **"Baseline p95 > 16ms → file incident / block merge."** Honest framing: this canary
  measures a renderer that has **never been profiled before**, so there is no prior green
  state to "regress" from. If the first clean baseline can't hold p95 ≤ 16ms, that is a
  **reported finding** — the canary documents the *actual achieved budget* and the user
  decides whether to invest in renderer optimisation or accept a higher documented budget.
  We never fudge the threshold downward to manufacture green (§5.2).
- **`chart:setData` ≤ 8ms** is treated as an **unbaselined diagnostic**, not a hard
  threshold, until the baseline run sets a real number (§6).

---

## 3. Components

| # | File | Change |
|---|---|---|
| 1 | `src/renderer/lib/perf.ts` | Add isolated `perf.frameProfile` (start/stop/report/reset). Production behaviour unchanged. |
| 2 | `src/renderer/panels/ChartPanel.tsx` | Wrap the candle `setData` (rebuild) and `update` (incremental) sites with `perf.measure`. |
| 3 | `tests/e2e/renderer-perf.spec.ts` | New opt-in canary, mirroring `heap.spec.ts`. |
| 4 | `src/renderer/lib/perf.test.ts` | New vitest unit test (CI-covered) for the perf math. |

---

## 4. Architecture

### 4.1 `perf.frameProfile` (perf.ts)

A frame profiler that is **separate** from the existing `frameWatch()` (which stays
outlier-only for production console warnings). The profiler only allocates / loops when
explicitly started — and only the harness starts it — so production cost is zero.

```ts
export interface FrameProfileReport {
  frames:     number   // total frames captured in the window
  durationMs: number   // sum of inter-frame deltas (= wall-clock span for RAF deltas)
  fps:        number   // frames / (durationMs/1000)
  p50Ms:      number
  p95Ms:      number
  p99Ms:      number
  maxMs:      number
  longFrames: number   // count of frame deltas > FRAME_BUDGET_MS (16)
  jankRatio:  number   // longFrames / frames  (0 when frames === 0)
}

perf.frameProfile = {
  start():     void                 // idempotent; no-op if PERF_OFF or already running; resets buffer
  stop():      FrameProfileReport   // idempotent; cancels RAF; returns final report
  report():    FrameProfileReport   // compute from current buffer without stopping
  reset():     void                 // free sample buffer, zero state
  isRunning(): boolean
}
```

- **Capture:** `start()` installs one RAF loop; each tick pushes `ts − lastTs` into a plain
  `number[]`. At 60fps × 300s ≈ 18 000 samples (~144 KB) — trivial, but `reset()` frees it.
- **Percentiles:** nearest-rank on a sorted copy: `idx = clamp(ceil(p/100 · n) − 1, 0, n−1)`.
  Math lives here (one place) and is unit-tested in `perf.test.ts`.
- **`PERF_OFF`:** `start()` returns immediately without installing RAF; `report()` returns
  an all-zero `FrameProfileReport`. The object still exists on `window.satexPerf` (C-6).
- **Window boundary:** the harness starts the profiler **after a warm-up settle** (§4.3.2)
  so mount/hydration spikes don't pollute steady-state p50.

### 4.2 ChartPanel instrumentation

Wrap the two existing candle-series mutation sites (identified at `ChartPanel.tsx:622-623`
`setData` and `:664` `update`):

```ts
perf.measure('chart:setData', () => s.setData(view.map(c => ({ ... }))))   // full rebuild
perf.measure('chart:update',  () => s.update({ ... }))                     // incremental
```

Pure timing wrappers: `perf.measure` returns the fn's value and is a no-op under
`SATEX_PERF_OFF` (`perf.ts:86`). The per-period EMA/RSI `setData` sites (`:803,:814,:886`)
are **optionally** wrapped as `chart:indicators` (secondary diagnostic); not required for
the primary assert.

### 4.3 `renderer-perf.spec.ts` (the canary)

Mirrors `heap.spec.ts` conventions exactly:

- **Gate:** `SATEX_E2E_PERF=1`, else `test.skip`.
- **Duration:** `SATEX_E2E_PERF_MINUTES` (default **5**; 3 for dev iteration).
- **Boot:** `electron.launch({ args:[out/main/index.js], env:{ USE_SIMULATOR:'true',
  NODE_ENV:'production' } })`; require `out/main/index.js` to exist (else throw "run
  `npm run build`").
- **Timeout:** `(DURATION_MIN + 2) · 60_000`.

#### 4.3.1 Designated stress path (resolves M-2)

Not claimed as the provable global worst case (exhaustive proof is over-investment for a
canary); defined and *measured* as the canary's stress path:

1. Switch to the **Quad** workspace tab (2×2 = four chart canvases — the heaviest layout).
2. Populate the four cells with **BTC, ETH, NVDA, TSLA** (both crypto + two high-vol
   equities — the heaviest *available* mix; C-3).
3. Enable **all six indicators** via `useIndicatorStore` (EMA / RSI / Double Top /
   Double Bottom / Fibonacci / Pivot Points; C-4) so every `update()` recomputes the
   full overlay set.
4. **Rotate the focused symbol** ≈ every 250 ms across the universe to force `setData`
   full-rebuilds (the audit's rotation stressor). 250 ms is the floor — faster than the
   50 ms tick coalesce buys nothing on the streaming path, but symbol-switch `setData` is
   not coalesced, so rotation is a genuine rebuild stressor.

Selectors follow `validation.spec.ts`: workspace tabs are buttons with text
`Trade/Focus/Markets/Replay/Quad`; symbol focus via watchlist rows. Exact selectors
confirmed during implementation; if a programmatic store hook is cleaner than DOM clicks
for indicator toggles, the harness uses `win.evaluate` against the store.

#### 4.3.2 Measurement sequence

1. Boot → wait for renderer mount (`body *` count > 0, per smoke/validation).
2. Apply the stress path (§4.3.1).
3. **Warm-up settle ~10 s** (excluded from measurement).
4. `win.evaluate(() => window.satexPerf.frameProfile.start())`.
5. Run for `DURATION_MIN`, rotating symbols on cadence.
6. `const report = await win.evaluate(() => window.satexPerf.frameProfile.stop())`.
7. Pull `perf.dump()` for `chart:setData` / `chart:update` stats.
8. Assert (§5, §6) + print a `---RENDERER PERF REPORT---` block (like heap/validation).
9. `finally`: `frameProfile.stop()` defensively + `app.close()`.

### 4.4 `perf.test.ts` (vitest, CI-covered)

- Ring-buffer wraparound + `stats()` mean/max/last; empty-bucket → zeroes.
- `measure()` returns the fn's value; records a sample; `PERF_OFF` path is a no-op.
- **Percentile correctness** against a known array (e.g. 1…100 → p50≈50, p95≈95, p99≈99;
  n=1; n=0 → zeroed report).
- **`frameProfile` lifecycle**: mock `requestAnimationFrame`/`cancelAnimationFrame`; assert
  `start()` is idempotent, `stop()` cancels exactly once and is idempotent, `reset()` zeroes,
  10× start/stop cycles leave no scheduled RAF (no orphan loop).

---

## 5. Calibration & thresholds (resolves M-1)

### 5.1 Where the gates actually run

| Gate | Mechanism | Runs in CI? |
|---|---|---|
| `perf.test.ts` (math correctness) | `npm test` (vitest) | **Yes** — `ci.yml` runs vitest on every push/PR to master. |
| `renderer-perf.spec.ts` (frame budget) | `SATEX_E2E_PERF=1 npx playwright test` | **No** — CI runs no Playwright (C-1). **Manual / release-checklist gate**, like `heap.spec.ts`. |

The canary therefore *informs* a release decision; it does not auto-block merges. This is
stated plainly so no one believes a green CI badge implies the frame budget was checked.

> **TD-2026-05-22-01 (agreed follow-up):** wire the canary into CI as a real gate — add a
> `SATEX_E2E_PERF` Playwright job to `ci.yml` on a runner with a display/GPU (or `xvfb`),
> so frame regressions block merges automatically. Scheduled for a sprint after v0.6
> close-out. Until then, the manual gate + the CI-covered `perf.test.ts` are the safety net.

### 5.2 Baseline protocol

1. After implementation, run the canary **≥3 times** on a clean machine (no other heavy apps).
2. Take the **median** p50/p95/p99; record min/max spread (advisory σ, not a gate).
3. Lock two constants in the spec **and** as commented constants in the test
   (mirroring heap's hard-coded `MAX_GROWTH_MB_PER_MIN` with rationale):
   - `TARGET_P50_MS = 16` (60fps floor; fixed).
   - `BUDGET_P95_MS = round(median_baseline_p95 × 1.15)` (15% regression headroom).
4. **Honesty rule:** if the clean baseline can't hold p95 ≤ 16 ms, we do **not** lower a
   target to fake green. We report it as a finding (the renderer doesn't sustain 60fps p95
   under this stress), document the achieved budget, and let the user choose: optimise the
   renderer, or accept and record a higher budget. (See §2 "Adjusted".)

### 5.3 Pass / fail logic

| Outcome | Verdict |
|---|---|
| `p50 ≤ TARGET_P50_MS` **and** `p95 ≤ BUDGET_P95_MS` | ✅ PASS |
| `p50 > TARGET_P50_MS` | ❌ HARD FAIL — renderer can't hold 60fps steady-state |
| `p95 > BUDGET_P95_MS` but `p50 ≤ TARGET_P50_MS` | ⚠️ SOFT FAIL — jank spikes; logged loudly, surfaced in report (the test fails so it's visible, but the report names it a spike-class failure for triage) |
| `chart:setData` call count < `DURATION_SEC` (≈ <1 rebuild/s) | ⚠️ INSUFFICIENT STRESS — report flags it; the run is not trusted as a budget check (C-2). Uses event/rebuild throughput, never frames/sec. |

---

## 6. Signal isolation (resolves M-4)

| Signal | Source | Role | Threshold |
|---|---|---|---|
| `frameProfile.report().p95Ms` (and `p50Ms`) | RAF inter-frame delta — full frame: React diff + store update + IPC deserialise + lightweight-charts render + compositor | **PRIMARY** — gates the manual canary sign-off | `p50 ≤ 16ms`, `p95 ≤ BUDGET_P95_MS` |
| `perf.stats('chart:setData').maxMs / meanMs` | wrapper around lightweight-charts `setData` | **SECONDARY** — diagnostic for root-cause when the primary fails | observational; baseline-set, not a hard gate |
| `chart:update` mean/max | wrapper around incremental `update` | secondary diagnostic | observational |

"P95 chart frame time" (A1) is read as **Interpretation A**: the frame containing chart
render must complete within budget → `frameProfile` is authoritative. `chart:setData` is
the isolation probe when that frame blows budget.

---

## 7. Profiler lifecycle (resolves M-3)

- The profiler is **test-controlled**: the Playwright harness calls `start()` / `stop()`
  via `window.satexPerf`. No React component owns it, so there is no unmount race (C-5).
- `stop()` is **idempotent** and cancels the RAF exactly once; `reset()` frees the buffer.
- The harness calls `stop()` in a `finally` block, exactly as every existing E2E calls
  `app.close()` in `finally`.
- Each Playwright test **launches and closes a fresh Electron process**, so a stray RAF
  cannot survive into a subsequent run — cross-run pollution is structurally impossible.
- `perf.test.ts` proves idempotency + no-orphan over 10 start/stop cycles (§4.4).

---

## 8. Failure modes & kill switch

| Scenario | Recovery |
|---|---|
| Profiler suspected of perturbing the app | `?SATEX_PERF_OFF=1` makes `frameProfile.start()`, `measure()`, `mark()`, `frameWatch()` all no-op (`perf.ts:27`). Instant kill switch, zero allocation. |
| Canary flaky (p95 spike one run) | Re-run; increase `SATEX_E2E_PERF_MINUTES`; confirm the box was idle. Median-of-3 baseline absorbs single-run noise. |
| Memory growth from the sample buffer | Buffer is harness-scoped; `reset()`/`stop()` free it; the process closes at test end. No production allocation. |
| `out/main/index.js` missing | Test throws with "run `npm run build` first" (heap/smoke/validation pattern). |

---

## 9. Deliverables

| # | Deliverable | Path |
|---|---|---|
| 1 | `perf.frameProfile` (start/stop/report/reset/isRunning) | `src/renderer/lib/perf.ts` |
| 2 | `chart:setData` / `chart:update` `perf.measure` wrappers | `src/renderer/panels/ChartPanel.tsx` |
| 3 | Opt-in renderer perf canary | `tests/e2e/renderer-perf.spec.ts` |
| 4 | Vitest unit test (perf math + profiler lifecycle) | `src/renderer/lib/perf.test.ts` |
| 5 | This spec | `docs/design/2026-05-22-renderer-perf-budget.md` |
| 6 | CHANGELOG entry (v0.6 / unreleased) | `CHANGELOG.md` |
| 7 | Health-stack + canary-invocation note | `CLAUDE.md` |
| 8 | A1 Sprint-3 closure note (perf canary delivered, generalised) | `docs/design/A1-subsecond-candles.md` (or CHANGELOG) |

No new dependencies. No `package.json` script added (cross-platform env-prefix scripts need
`cross-env`, which isn't a dep; invocation is documented instead — heap's precedent).

---

## 10. Invocation (Windows / PowerShell)

```powershell
# Canary (manual gate) — 5-minute default
$env:SATEX_E2E_PERF = '1'
npm run build                       # canary needs out/main/index.js
npx playwright test tests/e2e/renderer-perf.spec.ts

# Dev iteration — shorter window
$env:SATEX_E2E_PERF = '1'; $env:SATEX_E2E_PERF_MINUTES = '3'
npx playwright test tests/e2e/renderer-perf.spec.ts

# Unit math (also runs in CI via `npm test`)
npx vitest run src/renderer/lib/perf.test.ts
```

---

## 11. Acceptance criteria

| Criterion | Target |
|---|---|
| `frameProfile.start()` no-op under `SATEX_PERF_OFF=1`; `report()` zeroed | ✅ |
| `stop()` idempotent; no orphan RAF over 10 cycles (unit test) | ✅ |
| Percentile math correct vs known arrays (unit test) | ✅ |
| `perf.test.ts` green under `npm test` (CI) | ✅ |
| Canary boots, applies stress path, prints report, exits 0 on pass / non-zero on fail | ✅ |
| `p50 ≤ 16ms` on the locked baseline | ✅ (or documented finding per §5.2) |
| `p95 ≤ BUDGET_P95_MS` | ✅ (or documented finding) |
| Zero `console.error` / pageerror during the run | ✅ |
| `typecheck`, `lint`, `knip` clean; existing 242/242 vitest unaffected | ✅ |

---

## 12. Open items (lock during implementation, not blockers)

1. `BUDGET_P95_MS` — locked from the median-of-3 baseline (§5.2).
2. Exact Quad-cell population + indicator-toggle mechanism (DOM clicks vs `win.evaluate`
   store hook) — chosen for reliability during implementation.
3. Whether to also wrap the EMA/RSI period `setData` as `chart:indicators` (secondary).
