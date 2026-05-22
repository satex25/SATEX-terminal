# Renderer Frame-Budget Canary — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an opt-in runtime harness that asserts the SATEX renderer holds its frame budget (p50 ≤ 16ms 60fps floor; p95 ≤ a calibrated ceiling) under streaming simulator load, fulfilling the deferred A1 perf canary.

**Architecture:** A pure `summarizeFrames()` percentile/fps/jank function + a thin RAF-collector shell (`perf.frameProfile`) added to `src/renderer/lib/perf.ts`; two `perf.measure` wrappers on the ChartPanel hot paths; a Playwright E2E (`renderer-perf.spec.ts`, mirroring `heap.spec.ts`) that drives the Quad workspace under the simulator and reads the profile via `window.satexPerf`; and a vitest unit suite for the math. The budget ceiling is calibrated from a measured baseline in the final task.

**Tech Stack:** TypeScript, React 18, Zustand, lightweight-charts v5, Playwright (`_electron`), Vitest (Node env — **no jsdom**).

**Spec:** `docs/design/2026-05-22-renderer-perf-budget.md` (resolves audit M-1–M-4 / C-1–C-7).

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/renderer/lib/perf.ts` | Add `summarizeFrames()` (pure) + `perf.frameProfile` (RAF shell). Existing `perf.measure/stats/frameWatch` untouched. | Modify |
| `src/renderer/lib/perf.test.ts` | Vitest: percentile/fps/jank math, existing `measure`/`stats` characterization, `frameProfile` lifecycle, `PERF_OFF` no-op. Runs in CI. | Create |
| `src/renderer/panels/ChartPanel.tsx` | Wrap candle `setData` (rebuild) + `update` (incremental) with `perf.measure`. | Modify |
| `tests/e2e/renderer-perf.spec.ts` | Opt-in canary: boot → drive Quad → profile → assert p50 + sufficiency + zero-error; p95 assert added in Task 5. | Create |
| `CHANGELOG.md` | v0.6 unreleased entry. | Modify |
| `CLAUDE.md` | Health-stack + canary invocation note. | Modify |
| `docs/design/A1-subsecond-candles.md` | Mark §6 Sprint-3 perf canary delivered. | Modify |
| `docs/design/2026-05-22-renderer-perf-budget.md` | Lock `BUDGET_P95_MS` from baseline (Task 5). | Modify |

**Conventions to follow** (from existing code):
- Tests are colocated under `src/` and run in **Node env** (no `window`/`requestAnimationFrame`/jsdom). Stub globals with `vi.stubGlobal`; re-import with `vi.resetModules()` for module-load behavior — see `themeStore.test.ts:89-117`.
- `performance` **is** a global in Node 20, so `performance.now()` works in tests.
- Keep testable logic **out** of React components (`CHANGELOG.md:178`) — that's why the math is a pure exported function.
- E2E specs require a build first (`out/main/index.js`) and boot with `USE_SIMULATOR=true` — see `heap.spec.ts:41-52`.

---

## Task 1: `perf.frameProfile` + pure `summarizeFrames` + unit tests (TDD)

**Files:**
- Modify: `src/renderer/lib/perf.ts` (add after the existing `perf` export, ~line 143)
- Test: `src/renderer/lib/perf.test.ts` (create)

- [ ] **Step 1: Write failing tests for the pure `summarizeFrames` math**

Create `src/renderer/lib/perf.test.ts`:

```ts
/**
 * SATEX — Renderer perf instrumentation tests (v0.6 Phase 5 close-out).
 *
 * Node env (no jsdom): `performance` is a Node global; `requestAnimationFrame`,
 * `cancelAnimationFrame`, and `window` are absent and stubbed where needed
 * (mirrors themeStore.test.ts). The pure math (summarizeFrames) needs no stubs.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { perf, summarizeFrames } from './perf'

describe('summarizeFrames — pure percentile / fps / jank math', () => {
  it('returns an all-zero report for no samples', () => {
    expect(summarizeFrames([])).toEqual({
      frames: 0, durationMs: 0, fps: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0,
      maxMs: 0, longFrames: 0, jankRatio: 0,
    })
  })

  it('computes nearest-rank percentiles over a known 1..100 array', () => {
    const samples = Array.from({ length: 100 }, (_, i) => i + 1) // 1..100
    const r = summarizeFrames(samples)
    expect(r.frames).toBe(100)
    expect(r.p50Ms).toBe(50)
    expect(r.p95Ms).toBe(95)
    expect(r.p99Ms).toBe(99)
    expect(r.maxMs).toBe(100)
    expect(r.longFrames).toBe(84)            // values 17..100 exceed the 16ms budget
    expect(r.jankRatio).toBeCloseTo(0.84, 5)
    expect(r.durationMs).toBe(5050)          // sum(1..100)
    expect(r.fps).toBeCloseTo((100 / 5050) * 1000, 5)
  })

  it('handles a single fast frame (no jank)', () => {
    const r = summarizeFrames([8])
    expect(r).toMatchObject({ frames: 1, p50Ms: 8, p95Ms: 8, p99Ms: 8, maxMs: 8, longFrames: 0, jankRatio: 0 })
  })

  it('handles a single slow frame (all jank)', () => {
    const r = summarizeFrames([40])
    expect(r).toMatchObject({ frames: 1, maxMs: 40, longFrames: 1, jankRatio: 1 })
  })
})
```

- [ ] **Step 2: Run the math tests — verify they FAIL**

Run: `npx vitest run src/renderer/lib/perf.test.ts`
Expected: FAIL — `summarizeFrames` is not exported from `./perf`.

- [ ] **Step 3: Implement `FrameProfileReport` + `summarizeFrames` in `perf.ts`**

In `src/renderer/lib/perf.ts`, immediately **after** the `PerfStats` interface (line 81) add:

```ts
export interface FrameProfileReport {
  frames:     number   // total frames captured in the window
  durationMs: number   // sum of inter-frame deltas (wall-clock of the window)
  fps:        number   // frames / (durationMs/1000)
  p50Ms:      number
  p95Ms:      number
  p99Ms:      number
  maxMs:      number
  longFrames: number   // frame deltas > FRAME_BUDGET_MS (16)
  jankRatio:  number   // longFrames / frames (0 when frames === 0)
}

/** Pure summary of frame deltas (ms). No RAF / window — Node-testable.
 *  Percentiles use nearest-rank on a sorted copy. */
export function summarizeFrames(samples: readonly number[]): FrameProfileReport {
  const n = samples.length
  if (n === 0) {
    return { frames: 0, durationMs: 0, fps: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, maxMs: 0, longFrames: 0, jankRatio: 0 }
  }
  const sorted = [...samples].sort((a, b) => a - b)
  const pct = (p: number): number => sorted[Math.min(n - 1, Math.max(0, Math.ceil((p / 100) * n) - 1))]!
  let durationMs = 0
  let longFrames = 0
  for (const s of samples) {
    durationMs += s
    if (s > FRAME_BUDGET_MS) longFrames++
  }
  return {
    frames:     n,
    durationMs,
    fps:        durationMs > 0 ? (n / durationMs) * 1000 : 0,
    p50Ms:      pct(50),
    p95Ms:      pct(95),
    p99Ms:      pct(99),
    maxMs:      sorted[n - 1]!,
    longFrames,
    jankRatio:  longFrames / n,
  }
}
```

- [ ] **Step 4: Run the math tests — verify they PASS**

Run: `npx vitest run src/renderer/lib/perf.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Append failing tests for `frameProfile` lifecycle + existing-surface characterization**

Append to `src/renderer/lib/perf.test.ts`:

```ts
// Deterministic ms for measure(): performance.now() is read twice per measure
// call (start, finally-end). Feed pairs so each measure records an exact ms.
// All values <= 16 so the >budget warn branch (which calls performance.now()
// again) never fires and the sequence stays predictable.
function mockNowSequence(values: number[]): void {
  let i = 0
  vi.spyOn(performance, 'now').mockImplementation(() => values[i++] ?? values[values.length - 1] ?? 0)
}

describe('perf.measure / perf.stats — existing surface (characterization)', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns the wrapped fn result and records one sample', () => {
    mockNowSequence([0, 5])
    const out = perf.measure('test:passthrough', () => 42)
    expect(out).toBe(42)
    const s = perf.stats('test:passthrough')
    expect(s.count).toBe(1)
    expect(s.lastMs).toBe(5)
    expect(s.maxMs).toBe(5)
    expect(s.meanMs).toBe(5)
  })

  it('tracks count, mean, max over multiple samples', () => {
    mockNowSequence([0, 5, 100, 110, 200, 208]) // ms = 5, 10, 8
    perf.measure('test:multi', () => 0)
    perf.measure('test:multi', () => 0)
    perf.measure('test:multi', () => 0)
    const s = perf.stats('test:multi')
    expect(s.count).toBe(3)
    expect(s.lastMs).toBe(8)
    expect(s.maxMs).toBe(10)
    expect(s.meanMs).toBeCloseTo((5 + 10 + 8) / 3, 5)
  })

  it('rolls the 60-sample window but counts every sample (ring wraparound)', () => {
    const seq: number[] = []
    for (let k = 0; k < 60; k++) seq.push(k * 100, k * 100 + 5)  // 60 samples of 5ms
    seq.push(6000, 6009)                                          // 61st sample = 9ms
    mockNowSequence(seq)
    for (let k = 0; k < 61; k++) perf.measure('test:ring', () => 0)
    const s = perf.stats('test:ring')
    expect(s.count).toBe(61)                       // counts all
    expect(s.maxMs).toBe(9)                        // all-time max (9 > 5)
    expect(s.meanMs).toBeCloseTo((9 + 59 * 5) / 60, 5) // window holds last 60: one 9 + fifty-nine 5s
  })

  it('returns zeroes for an unknown tag', () => {
    expect(perf.stats('test:never')).toEqual({ count: 0, meanMs: 0, maxMs: 0, lastMs: 0 })
  })
})

describe('perf.frameProfile — RAF collector lifecycle (stubbed RAF)', () => {
  let rafCb: ((ts: number) => void) | null
  let rafId: number
  let cancelSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    rafCb = null
    rafId = 0
    vi.stubGlobal('requestAnimationFrame', (cb: (ts: number) => void) => { rafCb = cb; return ++rafId })
    cancelSpy = vi.fn()
    vi.stubGlobal('cancelAnimationFrame', cancelSpy)
    vi.spyOn(performance, 'now').mockReturnValue(0) // start()/reset() read now(); pin to 0
  })

  afterEach(() => {
    perf.frameProfile.stop()
    perf.frameProfile.reset()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('captures inter-frame deltas and summarizes on stop', () => {
    perf.frameProfile.start()
    expect(perf.frameProfile.isRunning()).toBe(true)
    rafCb!(16)  // delta = 16 - 0
    rafCb!(40)  // delta = 40 - 16 = 24
    const r = perf.frameProfile.stop()
    expect(perf.frameProfile.isRunning()).toBe(false)
    expect(r.frames).toBe(2)
    expect(r.maxMs).toBe(24)
    expect(r.longFrames).toBe(1) // only the 24ms frame exceeds 16ms
    expect(cancelSpy).toHaveBeenCalledTimes(1)
  })

  it('is idempotent on start (no second RAF loop)', () => {
    perf.frameProfile.start()
    perf.frameProfile.start()
    expect(rafId).toBe(1) // second start() no-ops while running
  })

  it('does not orphan the RAF loop after stop', () => {
    perf.frameProfile.start()
    const captured = rafCb!
    perf.frameProfile.stop()
    const idAfterStop = rafId
    captured(99) // a stale frame fires after stop
    expect(rafId).toBe(idAfterStop)               // loop did not reschedule
    expect(perf.frameProfile.report().frames).toBe(0) // reset by next start, no growth
  })

  it('survives 10 start/stop cycles with no leak', () => {
    for (let k = 0; k < 10; k++) {
      perf.frameProfile.start()
      rafCb!(16)
      perf.frameProfile.stop()
    }
    expect(perf.frameProfile.isRunning()).toBe(false)
  })
})

describe('perf.frameProfile — disabled via SATEX_PERF_OFF', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules() })

  it('start() is a no-op and report() is zeroed', async () => {
    vi.stubGlobal('window', { location: { search: '?SATEX_PERF_OFF=1' } })
    vi.resetModules()
    const fresh = await import('./perf')
    fresh.perf.frameProfile.start()
    expect(fresh.perf.frameProfile.isRunning()).toBe(false)
    expect(fresh.perf.frameProfile.report().frames).toBe(0)
  })
})
```

Add `beforeEach` to the import line: `import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'`.

- [ ] **Step 6: Run — verify the new lifecycle tests FAIL**

Run: `npx vitest run src/renderer/lib/perf.test.ts`
Expected: FAIL — `perf.frameProfile` is `undefined`.

- [ ] **Step 7: Implement `perf.frameProfile` in `perf.ts`**

In `src/renderer/lib/perf.ts`, add this module-level state **before** the `export const perf` block (after `summarizeFrames`):

```ts
const frameProfileState = { running: false, raf: 0, lastTs: 0, samples: [] as number[] }
```

Then add `frameProfile` as a property **inside** the `export const perf = { ... }` object (after `frameWatch`, before the closing brace):

```ts
  /** Harness-only frame profiler. Captures EVERY frame delta into a buffer and
   *  summarizes percentiles on demand. Separate from frameWatch (outlier-only).
   *  Only the E2E perf canary starts it, so production cost is zero. */
  frameProfile: {
    start(): void {
      if (PERF_OFF || frameProfileState.running) return
      if (typeof requestAnimationFrame === 'undefined') return // non-browser: no-op
      frameProfileState.running = true
      frameProfileState.samples = []
      frameProfileState.lastTs = performance.now()
      const loop = (ts: number): void => {
        if (!frameProfileState.running) return
        frameProfileState.samples.push(ts - frameProfileState.lastTs)
        frameProfileState.lastTs = ts
        frameProfileState.raf = requestAnimationFrame(loop)
      }
      frameProfileState.raf = requestAnimationFrame(loop)
    },
    stop(): FrameProfileReport {
      if (frameProfileState.running) {
        frameProfileState.running = false
        if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(frameProfileState.raf)
      }
      return summarizeFrames(frameProfileState.samples)
    },
    report(): FrameProfileReport {
      return summarizeFrames(frameProfileState.samples)
    },
    reset(): void {
      frameProfileState.samples = []
      frameProfileState.lastTs = performance.now()
    },
    isRunning(): boolean {
      return frameProfileState.running
    },
  },
```

- [ ] **Step 8: Run the full perf suite — verify PASS**

Run: `npx vitest run src/renderer/lib/perf.test.ts`
Expected: PASS (all describes green).

- [ ] **Step 9: Gate checks — typecheck, lint, full suite**

Run: `npm run typecheck` → 0 errors
Run: `npm run lint` → 0 warnings/errors
Run: `npm test` → all prior tests + new perf tests pass
Run: `npm run knip` → 0 unused (note: `summarizeFrames` is consumed by `frameProfile`; `frameProfile` is consumed by the E2E in Task 3 — knip ignores `tests/e2e`, so if knip flags `frameProfile`/`summarizeFrames` as unused before Task 3 lands, that is expected; re-run knip after Task 3. If it must be clean now, proceed to Task 3 before the knip gate.)

- [ ] **Step 10: Commit**

```powershell
git add src/renderer/lib/perf.ts src/renderer/lib/perf.test.ts
git commit -m "feat(v0.6): frameProfile + summarizeFrames in perf.ts, with unit tests"
```

---

## Task 2: Instrument the ChartPanel hot paths

**Files:**
- Modify: `src/renderer/panels/ChartPanel.tsx` (import; `setData` block 619-629; `update` block 650-671)

No unit test: the project keeps logic out of components and these are thin timing wrappers around a lightweight-charts call. Verified by typecheck/lint here and exercised by the Task 3 E2E (which reads `chart:setData` / `chart:update` stats).

- [ ] **Step 1: Add the `perf` import**

In `src/renderer/panels/ChartPanel.tsx`, after the existing store imports (the `import { useDepthStore } from '../stores/depthStore'` line, ~line 18) add:

```ts
import { perf } from '../lib/perf'
```

- [ ] **Step 2: Wrap the `setData` rebuild (bulk-reset effect)**

Replace this exact block (lines 622-626):

```ts
      const s = seriesRef.current as { setData: (d: unknown) => void }
      s.setData(view.map(c => ({
        time: c.time as unknown,
        open: c.open, high: c.high, low: c.low, close: c.close,
      })))
```

with:

```ts
      const s = seriesRef.current as { setData: (d: unknown) => void }
      perf.measure('chart:setData', () => s.setData(view.map(c => ({
        time: c.time as unknown,
        open: c.open, high: c.high, low: c.low, close: c.close,
      }))))
```

- [ ] **Step 3: Wrap the `update` live-ratchet (in-flight candle effect)**

Replace this exact block (lines 663-670):

```ts
      const s = seriesRef.current as { update: (d: unknown) => void }
      s.update({
        time: last.time as unknown,
        open: last.open,
        high: liveHigh,
        low:  liveLow,
        close: liveClose,
      })
```

with:

```ts
      const s = seriesRef.current as { update: (d: unknown) => void }
      perf.measure('chart:update', () => s.update({
        time: last.time as unknown,
        open: last.open,
        high: liveHigh,
        low:  liveLow,
        close: liveClose,
      }))
```

- [ ] **Step 4: Gate checks**

Run: `npm run typecheck` → 0 errors
Run: `npm run lint` → 0 warnings/errors (the `// eslint-disable-next-line react-hooks/exhaustive-deps` comments below each effect are unaffected — they stay attached to the dependency arrays)
Run: `npm test` → unchanged pass count (no new tests)

- [ ] **Step 5: Commit**

```powershell
git add src/renderer/panels/ChartPanel.tsx
git commit -m "feat(v0.6): time chart setData/update hot paths via perf.measure"
```

---

## Task 3: The renderer perf canary (Playwright E2E)

**Files:**
- Create: `tests/e2e/renderer-perf.spec.ts`

This task asserts what is knowable without a baseline: the **p50 ≤ 16ms** 60fps floor, **stress sufficiency**, and **zero console errors**. The **p95 budget assert is added in Task 5** after calibration. The harness prints a full report block either way. UI selectors are verified empirically on first run (Step 4) — expected for an opt-in manual canary.

- [ ] **Step 1: Create the canary spec**

Create `tests/e2e/renderer-perf.spec.ts`:

```ts
/**
 * SATEX renderer frame-budget canary (v0.6 Phase 5 · A1 Sprint-3 deliverable).
 *
 * Opt-in. Boots the built app under the simulator, drives the Quad workspace
 * (4 chart canvases) under the native ~360 events/s tick load (TICK_HZ=20),
 * captures every frame delta via window.satexPerf.frameProfile, and asserts
 * the renderer holds its frame budget. Mirrors heap.spec.ts conventions.
 *
 *   $env:SATEX_E2E_PERF='1'; npx playwright test tests/e2e/renderer-perf.spec.ts
 *   $env:SATEX_E2E_PERF='1'; $env:SATEX_E2E_PERF_MINUTES='3'; npx playwright test renderer-perf.spec.ts
 *
 * p50 <= 16ms is the fixed 60fps floor. BUDGET_P95_MS (the p95 ceiling) is
 * calibrated from a median-of-3 baseline — see the design spec §5.2 / Task 5.
 */
import { test, expect, _electron as electron, type ConsoleMessage, type ElectronApplication, type Page } from '@playwright/test'
import path from 'path'
import { existsSync } from 'fs'

const ENABLED       = process.env['SATEX_E2E_PERF'] === '1'
const DURATION_MIN  = Number(process.env['SATEX_E2E_PERF_MINUTES'] ?? '5')
const WARMUP_MS     = 10_000
const ROTATE_MS     = 250
const TARGET_P50_MS = 16
const ROTATION_SYMBOLS = ['BTC', 'ETH', 'NVDA', 'TSLA']
const MAIN_ENTRY    = path.join(__dirname, '..', '..', 'out', 'main', 'index.js')

interface FrameProfileReport {
  frames: number; durationMs: number; fps: number
  p50Ms: number; p95Ms: number; p99Ms: number; maxMs: number
  longFrames: number; jankRatio: number
}

test.describe('renderer frame budget (A1 perf canary)', () => {
  test.skip(!ENABLED, 'set SATEX_E2E_PERF=1 to run this load test')

  test(`p50 frame time <= ${TARGET_P50_MS}ms over ${DURATION_MIN} min under Quad load`, async () => {
    test.setTimeout((DURATION_MIN + 2) * 60_000)

    if (!existsSync(MAIN_ENTRY)) {
      throw new Error('out/main/index.js missing. Run `npm run build` first.')
    }

    let app: ElectronApplication | null = null
    const errors: string[] = []
    try {
      app = await electron.launch({
        args: [MAIN_ENTRY],
        env: { ...process.env, USE_SIMULATOR: 'true', NODE_ENV: 'production' },
        timeout: 30_000,
      })
      const win: Page = await app.firstWindow({ timeout: 20_000 })
      win.on('console', (m: ConsoleMessage) => { if (m.type() === 'error') errors.push(m.text()) })
      win.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
      await win.waitForLoadState('domcontentloaded', { timeout: 20_000 })
      await expect.poll(async () => (await win.locator('body *').count()) > 0, { timeout: 15_000 }).toBe(true)

      // ── Stress path: switch to the Quad workspace (4 chart canvases). Tab
      // buttons render as text Trade/Focus/Markets/Replay/Quad (validation.spec.ts).
      const quad = win.locator('button', { hasText: /^Quad$/ }).first()
      if (await quad.count()) await quad.click().catch(() => { /* selector verified Step 4 */ })

      // Warm-up settle so mount/hydration spikes stay out of the steady-state window.
      await win.waitForTimeout(WARMUP_MS)

      // ── Begin profiling, then drive symbol rotation for the duration. Rotation
      // forces setData full-rebuilds; the simulator streams ticks the whole time.
      await win.evaluate(() => (window as unknown as { satexPerf: { frameProfile: { start(): void } } }).satexPerf.frameProfile.start())

      const endsAt = Date.now() + DURATION_MIN * 60_000
      let i = 0
      while (Date.now() < endsAt) {
        const sym = ROTATION_SYMBOLS[i++ % ROTATION_SYMBOLS.length]!
        const row = win.locator(`text=${sym}`).first()
        if (await row.count()) await row.click({ timeout: 1_000 }).catch(() => { /* row not clickable; dwell */ })
        await win.waitForTimeout(ROTATE_MS)
      }

      const report = await win.evaluate(() =>
        (window as unknown as { satexPerf: { frameProfile: { stop(): FrameProfileReport }; dump(): Record<string, unknown> } }).satexPerf.frameProfile.stop()) as FrameProfileReport
      const tags = await win.evaluate(() =>
        (window as unknown as { satexPerf: { dump(): Record<string, { count: number; meanMs: number; maxMs: number }> } }).satexPerf.dump())

      const setDataCount = tags['chart:setData']?.count ?? 0
      const updateCount  = tags['chart:update']?.count ?? 0
      const chartActivity = setDataCount + updateCount
      const durationSec = DURATION_MIN * 60

      console.log('---RENDERER PERF REPORT---')
      console.log(JSON.stringify({ durationMin: DURATION_MIN, report, chart: { setDataCount, updateCount }, consoleErrors: errors.length }, null, 2))

      // Stress sufficiency: the chart must actually be mutating (>= ~1 mutation/sec
      // avg). Measured by event/setData throughput, never frames/sec (spec C-2).
      expect(chartActivity, `INSUFFICIENT STRESS: only ${chartActivity} chart mutations over ${durationSec}s — check the Quad/rotation selectors (Step 4)`).toBeGreaterThanOrEqual(durationSec)
      expect(report.frames, 'profiler captured no frames — window.satexPerf.frameProfile not started?').toBeGreaterThan(0)

      // Fixed 60fps floor.
      expect(report.p50Ms, `p50 ${report.p50Ms.toFixed(1)}ms exceeds the 60fps floor ${TARGET_P50_MS}ms`).toBeLessThanOrEqual(TARGET_P50_MS)

      // p95 budget assert is added in Task 5 after baseline calibration.

      expect(errors, `renderer logged ${errors.length} error(s): ${errors.join(' | ')}`).toEqual([])
    } finally {
      if (app) {
        try { await app.evaluate(() => { /* noop guard */ }).catch(() => {}) } catch { /* ignore */ }
        try { await app.close() } catch { /* ignore */ }
      }
    }
  })
})
```

- [ ] **Step 2: Build the app (the E2E needs `out/main/index.js`)**

Run: `npm run build`
Expected: `out/main/index.js` exists, no build errors.

- [ ] **Step 3: Typecheck + lint the new spec**

Run: `npm run typecheck` → 0 errors
Run: `npm run lint` → 0 warnings/errors
Run: `npm test` → vitest still excludes `tests/e2e/**` (config line 10); count unchanged.

- [ ] **Step 4: First run — verify it boots, drives, and reports (selector check)**

Run: `$env:SATEX_E2E_PERF='1'; $env:SATEX_E2E_PERF_MINUTES='1'; npx playwright test tests/e2e/renderer-perf.spec.ts`
Expected: prints `---RENDERER PERF REPORT---` with `report.frames > 0` and `chartActivity >= 60` (1-min run).
- If `chartActivity` is **0 / below floor**: the Quad tab or symbol-row selector didn't match. Inspect — temporarily set `headless:false` in `electron.launch`, or `await win.screenshot({ path: 'perf-debug.png' })` after the Quad click — and adjust the `quad` / `row` locators to the real DOM (e.g. the watchlist row may be a `[class*="wl-row"]` rather than bare `text=`). Re-run until `chartActivity` clears the floor.
- If `report.frames === 0`: confirm `window.satexPerf` exists in this build (it's attached in `perf.ts`; ensure the build is current).

- [ ] **Step 5: Commit**

```powershell
git add tests/e2e/renderer-perf.spec.ts
git commit -m "feat(v0.6): renderer perf canary E2E — p50 floor + stress-sufficiency gate"
```

---

## Task 4: Documentation

**Files:**
- Modify: `CHANGELOG.md` (new unreleased section above the `## 0.4.4` heading, line 8)
- Modify: `CLAUDE.md` (Health Stack region, top of file)
- Modify: `docs/design/A1-subsecond-candles.md` (§6 Sprint 3 item 2, line 221)

- [ ] **Step 1: Add the CHANGELOG entry**

In `CHANGELOG.md`, insert **above** the existing `## 0.4.4 (2026-05-XX)` line (line 8):

```markdown
## Unreleased (v0.6 "Black Box")

### Added

- **Renderer frame-budget canary.** New opt-in Playwright E2E
  (`tests/e2e/renderer-perf.spec.ts`, gated by `SATEX_E2E_PERF=1`) drives the
  Quad workspace under the simulator's native ~360 events/s load and asserts the
  renderer holds its frame budget (p50 ≤ 16ms 60fps floor; p95 ≤ a calibrated
  ceiling). Fulfils the A1 design doc's deferred perf canary (§6 Sprint 3). Backed
  by a new `perf.frameProfile` (pure `summarizeFrames` percentile/fps/jank math +
  a thin RAF collector) and `perf.measure` timing on the ChartPanel `setData`/
  `update` hot paths — the same paths whose S1-1 regression once cost 125ms boot
  frames. New `src/renderer/lib/perf.test.ts` pins the math and the profiler
  lifecycle (CI-covered via `npm test`). The E2E is a manual/release gate (CI runs
  no Playwright; tracked for CI promotion as TD-2026-05-22-01).

```

- [ ] **Step 2: Add the CLAUDE.md health/canary note**

In `CLAUDE.md`, immediately after the `## Health Stack` list (after the `deadcode: npm run knip` line) add:

```markdown

## Renderer perf canary (v0.6)

Opt-in frame-budget E2E. Not in CI (CI = typecheck + vitest only); run manually
before a renderer-heavy release:

```powershell
npm run build
$env:SATEX_E2E_PERF='1'; npx playwright test tests/e2e/renderer-perf.spec.ts
```

Asserts p50 ≤ 16ms (60fps floor) + p95 ≤ `BUDGET_P95_MS` under Quad load. Math is
unit-tested in `src/renderer/lib/perf.test.ts` (runs in CI). Design:
`docs/design/2026-05-22-renderer-perf-budget.md`.
```

- [ ] **Step 3: Mark the A1 Sprint-3 perf canary delivered**

In `docs/design/A1-subsecond-candles.md`, replace line 221:

```markdown
2. Perf canary test — synthetic 20 trades/sec for 5 min, assert frame budget.
```

with:

```markdown
2. ✅ **Delivered (v0.6, 2026-05-22)** — Perf canary, generalised to a renderer
   frame-budget harness (`tests/e2e/renderer-perf.spec.ts`). The simulator's
   native TICK_HZ=20 supplies the "20 trades/sec" load; asserts p50 ≤ 16ms +
   calibrated p95 under Quad load. See `docs/design/2026-05-22-renderer-perf-budget.md`.
```

- [ ] **Step 4: Commit**

```powershell
git add CHANGELOG.md CLAUDE.md docs/design/A1-subsecond-candles.md
git commit -m "docs(v0.6): changelog + CLAUDE + A1 closure for renderer perf canary"
```

---

## Task 5: Calibrate and lock the p95 budget

**Files:**
- Modify: `tests/e2e/renderer-perf.spec.ts` (add `BUDGET_P95_MS` + the p95 assert)
- Modify: `docs/design/2026-05-22-renderer-perf-budget.md` (record the locked number)

Requires the built app from Task 3. Run on an **idle** machine for a clean baseline.

- [ ] **Step 1: Capture three baseline p95 values**

Run three times (5-min spec default):

```powershell
npm run build
$env:SATEX_E2E_PERF='1'
npx playwright test tests/e2e/renderer-perf.spec.ts
npx playwright test tests/e2e/renderer-perf.spec.ts
npx playwright test tests/e2e/renderer-perf.spec.ts
```

From each `---RENDERER PERF REPORT---` block, record `report.p95Ms`. (If any run hard-fails on `p50 > 16ms`, that is a real finding — stop and report it per spec §5.2; do **not** proceed to relax thresholds.)

- [ ] **Step 2: Compute the budget**

- `median_p95` = middle of the three recorded p95 values.
- `BUDGET_P95_MS` = `Math.round(median_p95 * 1.15)` (15% regression headroom).
- Also note the spread (max−min) as an advisory determinism check (§5.2; not a gate).

- [ ] **Step 3: Add the constant + p95 assert to the spec**

In `tests/e2e/renderer-perf.spec.ts`, after the `const TARGET_P50_MS = 16` line add (substitute the number computed in Step 2):

```ts
const BUDGET_P95_MS = 0 // ← replace 0 with Math.round(median_baseline_p95 * 1.15) from Task 5
```

Replace the comment line `// p95 budget assert is added in Task 5 after baseline calibration.` with:

```ts
      expect(report.p95Ms, `p95 ${report.p95Ms.toFixed(1)}ms exceeds budget ${BUDGET_P95_MS}ms (baseline×1.15)`).toBeLessThanOrEqual(BUDGET_P95_MS)
```

(If the test name should reflect both gates, that is cosmetic — leave it.)

- [ ] **Step 4: Record the locked number in the design spec**

In `docs/design/2026-05-22-renderer-perf-budget.md` §12 item 1, replace:

```markdown
1. `BUDGET_P95_MS` — locked from the median-of-3 baseline (§5.2).
```

with (substitute real numbers):

```markdown
1. `BUDGET_P95_MS` = **<value>ms** — locked 2026-05-22 from median-of-3 baseline
   p95 = <median>ms × 1.15. Baseline spread: <min>–<max>ms (advisory).
```

- [ ] **Step 5: Verify the calibrated canary passes, then gate-check**

Run: `$env:SATEX_E2E_PERF='1'; npx playwright test tests/e2e/renderer-perf.spec.ts` → PASS (p50 + p95 both within budget)
Run: `npm run typecheck` → 0 errors
Run: `npm run lint` → 0 warnings/errors
Run: `npm test` → green (E2E excluded)
Run: `npm run knip` → 0 unused (`frameProfile`/`summarizeFrames` now fully consumed)

- [ ] **Step 6: Commit**

```powershell
git add tests/e2e/renderer-perf.spec.ts docs/design/2026-05-22-renderer-perf-budget.md
git commit -m "test(v0.6): lock BUDGET_P95_MS from baseline + enable p95 assert"
```

---

## Self-Review

**1. Spec coverage** — every spec section maps to a task:
- §4.1 `frameProfile` + percentile math → Task 1. §4.2 ChartPanel wrappers → Task 2. §4.3 canary → Task 3. §4.4 unit tests → Task 1 (Steps 1,5). §5 calibration/CI-gate reality → Task 5 + Task 4 (CLAUDE note). §6 signal split (frameProfile primary, chart:setData secondary) → Task 3 (asserts on `report`, prints `tags`). §7 lifecycle/idempotency → Task 1 Step 5 lifecycle tests. §8 kill switch → covered by `PERF_OFF` test (Task 1) + no new behavior. §9 deliverables → Tasks 1–5. §11 acceptance → gate-checks in each task.
- TD-2026-05-22-01 (CI promotion) → recorded in CHANGELOG (Task 4) + spec §5.1; intentionally **not** implemented (post-v0.6).

**2. Placeholder scan** — the only intentionally-runtime value is `BUDGET_P95_MS`, introduced in Task 5 with an exact compute procedure (not a lazy TODO); every other step has complete code. The `= 0` placeholder exists for one step only and Task 5 Step 3 mandates its replacement before the commit in Step 6.

**3. Type consistency** — `FrameProfileReport` shape is identical in `perf.ts` (Task 1 Step 3), the E2E's local `interface` (Task 3), and the test assertions. Method names `start/stop/report/reset/isRunning` are consistent across `perf.ts`, the lifecycle tests, and the E2E (`start()`/`stop()`). `summarizeFrames` signature matches its call in `frameProfile.stop/report`. Tag strings `chart:setData` / `chart:update` match between ChartPanel (Task 2) and the E2E `dump()` reads (Task 3).

**Known empirical step:** Task 3 Step 4 (selector verification) and Task 5 (baseline numbers) require a live run — unavoidable for a runtime harness and explicitly scoped.
