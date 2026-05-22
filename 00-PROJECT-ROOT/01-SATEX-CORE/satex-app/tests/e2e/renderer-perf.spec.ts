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

      // ── Stress path: the Trade workspace renders the lightweight-charts
      // ChartPanel — the path our perf.measure('chart:setData'/'chart:update')
      // instrumentation lives on, and where the S1-1 125ms frame-stall regression
      // occurred. The Quad view is a separate hand-drawn-SVG component
      // (QuadChartPanel) with no perf.measure, so chart:* tags never fire there
      // and a click-driven rebuild can't be measured — see spec §4.3.1. Ensure
      // we're on Trade; the symbol-rotation loop below then drives setData rebuilds
      // (watchlist row click → marketStore.setSymbol → ChartPanel symbol change).
      const trade = win.locator('button', { hasText: /^Trade$/ }).first()
      if (await trade.count()) await trade.click().catch(() => { /* default workspace is already Trade */ })

      // Warm-up settle so mount/hydration spikes stay out of the steady-state window.
      await win.waitForTimeout(WARMUP_MS)

      // ── Begin profiling, then drive symbol rotation for the duration. Rotation
      // forces setData full-rebuilds; the simulator streams ticks the whole time.
      // Use .bb-watchlist-row selector to target the interactive watchlist div
      // directly (role="button" rows), avoiding spurious matches in TickerTape.
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
      expect(chartActivity, `INSUFFICIENT STRESS: only ${chartActivity} chart mutations over ${durationSec}s — check the Trade tab + watchlist-row rotation selectors`).toBeGreaterThanOrEqual(durationSec)
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
