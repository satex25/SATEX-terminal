/**
 * SATEX renderer frame-budget canary (v0.6 Phase 5 · A1 Sprint-3 deliverable).
 *
 * Opt-in. Boots the built app under the simulator, drives the Trade workspace's
 * lightweight-charts ChartPanel via watchlist symbol rotation, captures every
 * frame delta via window.satexPerf.frameProfile, and asserts the renderer holds
 * its frame budget. Mirrors heap.spec.ts conventions.
 *
 *   $env:SATEX_E2E_PERF='1'; npx playwright test tests/e2e/renderer-perf.spec.ts
 *   $env:SATEX_E2E_PERF='1'; $env:SATEX_E2E_PERF_MINUTES='3'; npx playwright test renderer-perf.spec.ts
 *
 * Isolation + non-disruption: the app launches with a throwaway --user-data-dir
 * and SATEX_VAULT_ROOT (never touches the user's real profile/vault), and the
 * window is moved offscreen + made transparent immediately after launch so it
 * neither appears on-screen nor steals focus. It is NOT minimized/hidden — that
 * would set document.hidden and throttle requestAnimationFrame, corrupting the
 * frame measurement.
 *
 * p50 <= 16ms is the fixed 60fps floor. BUDGET_P95_MS (the p95 ceiling) is
 * calibrated from a median-of-3 baseline — see the design spec §5.2 / Task 5.
 */
import { test, expect, _electron as electron, type ConsoleMessage, type ElectronApplication, type Page } from '@playwright/test'
import path from 'path'
import os from 'os'
import { existsSync, mkdtempSync, rmSync } from 'fs'

const ENABLED       = process.env['SATEX_E2E_PERF'] === '1'
const DURATION_MIN  = Number(process.env['SATEX_E2E_PERF_MINUTES'] ?? '5')
const WARMUP_MS     = 10_000
const ROTATE_MS     = 2000
const TARGET_P50_MS = 16
// Locked 2026-05-23 from a median-of-3 isolated baseline: p95 = 8.3ms on all
// three runs (σ≈0 — the seeded simulator is deterministic). Budget = round(8.3 ×
// 1.15) = 10ms (~20% headroom). p50 stays the fixed 60fps floor. See spec §5.2.
const BUDGET_P95_MS = 10
const ROTATION_SYMBOLS = ['BTC', 'ETH', 'NVDA', 'TSLA']
const MAIN_ENTRY    = path.join(__dirname, '..', '..', 'out', 'main', 'index.js')

interface FrameProfileReport {
  frames: number; durationMs: number; fps: number
  p50Ms: number; p95Ms: number; p99Ms: number; maxMs: number
  longFrames: number; jankRatio: number
}

test.describe('renderer frame budget (A1 perf canary)', () => {
  test.skip(!ENABLED, 'set SATEX_E2E_PERF=1 to run this load test')

  test(`p50 frame time <= ${TARGET_P50_MS}ms over ${DURATION_MIN} min under Trade load`, async () => {
    test.setTimeout((DURATION_MIN + 2) * 60_000)

    if (!existsSync(MAIN_ENTRY)) {
      throw new Error('out/main/index.js missing. Run `npm run build` first.')
    }

    // Throwaway profile + vault so this run never touches the user's real state.
    const tmpDir   = mkdtempSync(path.join(os.tmpdir(), 'satex-perf-'))
    const vaultDir = path.join(tmpDir, 'vault')

    let app: ElectronApplication | null = null
    const errors: string[] = []
    try {
      app = await electron.launch({
        args: [MAIN_ENTRY, `--user-data-dir=${tmpDir}`],
        // SATEX_SIMULATOR_24_7 is inert since P-111 (2026-07-16): the simulator
        // now emits 24/7 for every asset class by default (market-data.ts), so
        // off-hours / weekend runs stream candles without it. Kept here as a
        // harmless no-op so this env stays valid if the flag is ever reintroduced.
        env: { ...process.env, USE_SIMULATOR: 'true', NODE_ENV: 'production', SATEX_VAULT_ROOT: vaultDir, SATEX_SIMULATOR_24_7: 'true' },
        timeout: 30_000,
      })

      // Move every window offscreen + transparent + off the taskbar BEFORE it can
      // grab focus or paint on the user's screen. Deliberately NOT minimize/hide
      // (that throttles RAF). A sub-second flash at default position is possible
      // before this runs; that's the unavoidable minimum.
      await app.evaluate(({ BrowserWindow }) => {
        for (const w of BrowserWindow.getAllWindows()) {
          try { w.setPosition(-4000, -4000); w.setOpacity(0); w.setSkipTaskbar(true) } catch { /* ignore */ }
        }
      })

      const win: Page = await app.firstWindow({ timeout: 20_000 })
      win.on('console', (m: ConsoleMessage) => { if (m.type() === 'error') errors.push(m.text()) })
      win.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
      await win.waitForLoadState('domcontentloaded', { timeout: 20_000 })

      // Wait for the REAL React mount. The previous `body *` poll passed on an
      // empty #root (the div itself is a body descendant); a visible watchlist
      // row proves both that React mounted and the rail we click is interactive.
      await win.locator('.bb-watchlist-row').first().waitFor({ state: 'visible', timeout: 20_000 })

      // ── Dismiss the cold-boot intro before touching the workspace. A fresh
      // throwaway profile always cold-boots into the P-098 STANDBY GATE → boot
      // ceremony (BootIntroSequence → StandbyGateFrame/BootCeremonyFrame): a
      // full-frame `.sxg` overlay (role="presentation") that intercepts pointer
      // events until armed. Without this the Trade-tab click below is swallowed by
      // `.sxg-gate-center` (Playwright "…intercepts pointer events"). Arm the gate
      // (its onClick = PRESS-ANY-KEY equivalent), then wait for the whole intro to
      // unmount — the ceremony runs ~8.2s (or ~0.9s under prefers-reduced-motion)
      // after a 0.5s arm fade, so allow generous slack.
      const gate = win.locator('.sxg-gate')
      await gate.first().waitFor({ state: 'visible', timeout: 15_000 })
      await gate.first().click({ timeout: 10_000 })
      await win.locator('.sxg').waitFor({ state: 'detached', timeout: 20_000 })

      // ── Stress path: the Trade workspace renders the lightweight-charts
      // ChartPanel — the path our perf.measure('chart:setData'/'chart:update')
      // instrumentation lives on, and where the S1-1 125ms frame-stall regression
      // occurred. The fresh-profile DEFAULT workspace is Quad, which is a separate
      // hand-drawn-SVG component (QuadChartPanel) with no <canvas> and no
      // perf.measure — so we MUST switch to Trade and CONFIRM a chart canvas
      // mounted, else the canary silently measures the wrong (uninstrumented)
      // view (the chart:*=0 trap the diag block exposed). See spec §4.3.1.
      await win.locator('.bb-ws-tab', { hasText: /^Trade$/ }).first().click({ timeout: 10_000 })
      await win.locator('canvas').first().waitFor({ state: 'attached', timeout: 15_000 })

      // Confirm the chart actually receives candle data before measuring. A fresh
      // profile starts with an empty candle store, and an empty chart (view.length
      // === 0) fires NEITHER setData nor update. Poll the instrumented counts on
      // the stable chart; if they never move, the chart never got data.
      await expect.poll(
        async () => win.evaluate(() => {
          const d = (window as unknown as { satexPerf: { dump(): Record<string, { count: number }> } }).satexPerf.dump()
          return (d['chart:setData']?.count ?? 0) + (d['chart:update']?.count ?? 0)
        }),
        { timeout: 30_000, message: 'chart never rendered candle data (empty candle store?) — see ---PERF DIAG---' },
      ).toBeGreaterThan(0)

      // Warm-up settle so mount/hydration spikes stay out of the steady-state window.
      await win.waitForTimeout(WARMUP_MS)

      // Begin profiling, then drive symbol rotation for the duration. Rotation
      // forces setData full-rebuilds; the simulator streams ticks the whole time.
      await win.evaluate(() => (window as unknown as { satexPerf: { frameProfile: { start(): void } } }).satexPerf.frameProfile.start())

      const endsAt = Date.now() + DURATION_MIN * 60_000
      let i = 0
      while (Date.now() < endsAt) {
        const sym = ROTATION_SYMBOLS[i++ % ROTATION_SYMBOLS.length]!
        const row = win.locator(`.bb-watchlist-row:has-text("${sym}")`).first()
        if (await row.count()) await row.click({ timeout: 1_000 }).catch(() => { /* row not clickable; dwell */ })
        await win.waitForTimeout(ROTATE_MS)
      }

      const report = await win.evaluate(() =>
        (window as unknown as { satexPerf: { frameProfile: { stop(): FrameProfileReport } } }).satexPerf.frameProfile.stop()) as FrameProfileReport
      const tags = await win.evaluate(() =>
        (window as unknown as { satexPerf: { dump(): Record<string, { count: number; meanMs: number; maxMs: number }> } }).satexPerf.dump())

      // Self-diagnosis snapshot — makes a chart:*=0 result explain itself: which
      // perf tags ever fired, whether React mounted, whether the watchlist + a
      // lightweight-charts <canvas> are present, and which symbol ended active.
      const diag = await win.evaluate(() => {
        const w = window as unknown as { satexPerf?: { dump(): Record<string, unknown> } }
        return {
          dumpKeys:      Object.keys(w.satexPerf?.dump?.() ?? {}),
          rootChildren:  document.getElementById('root')?.children.length ?? -1,
          watchlistRows: document.querySelectorAll('.bb-watchlist-row').length,
          canvases:      document.querySelectorAll('canvas').length,
          activeSymbol:  document.querySelector('.bb-watchlist-row.active')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 16) ?? null,
        }
      })

      const setDataCount = tags['chart:setData']?.count ?? 0
      const updateCount  = tags['chart:update']?.count ?? 0
      const chartActivity = setDataCount + updateCount
      const durationSec = DURATION_MIN * 60

      console.log('---RENDERER PERF REPORT---')
      console.log(JSON.stringify({ durationMin: DURATION_MIN, report, chart: { setDataCount, updateCount }, consoleErrors: errors.length }, null, 2))
      console.log('---PERF DIAG---')
      console.log(JSON.stringify(diag, null, 2))

      // Stress sufficiency: the chart must actually be mutating (>= ~1 mutation/sec
      // avg). Measured by event/setData throughput, never frames/sec (spec C-2).
      expect(chartActivity, `INSUFFICIENT STRESS: only ${chartActivity} chart mutations over ${durationSec}s — see ---PERF DIAG--- (dumpKeys / watchlistRows / canvases)`).toBeGreaterThanOrEqual(durationSec)
      expect(report.frames, 'profiler captured no frames — window.satexPerf.frameProfile not started?').toBeGreaterThan(0)

      // Fixed 60fps floor.
      expect(report.p50Ms, `p50 ${report.p50Ms.toFixed(1)}ms exceeds the 60fps floor ${TARGET_P50_MS}ms`).toBeLessThanOrEqual(TARGET_P50_MS)

      // p95 regression budget (calibrated baseline × 1.15).
      expect(report.p95Ms, `p95 ${report.p95Ms.toFixed(1)}ms exceeds budget ${BUDGET_P95_MS}ms (baseline 8.3ms × 1.15)`).toBeLessThanOrEqual(BUDGET_P95_MS)

      expect(errors, `renderer logged ${errors.length} error(s): ${errors.join(' | ')}`).toEqual([])
    } finally {
      if (app) {
        try { await app.close() } catch { /* ignore */ }
      }
      try { rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
    }
  })
})
