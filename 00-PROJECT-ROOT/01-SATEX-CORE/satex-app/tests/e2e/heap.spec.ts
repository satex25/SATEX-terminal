/**
 * SATEX heap-stability E2E (S1-4 · 2026-05-16).
 *
 * Opt-in 30-minute test that launches the Electron app and samples the MAIN
 * process's heapUsed every 30 seconds. Asserts that the linear-regression
 * slope of heap-over-time is bounded — a long-running trading terminal that
 * leaks 5MB/min will show ~150MB growth over 30 min, which we want to catch.
 *
 * Skipped by default because 30 minutes is too long for every CI run. Enable
 * via env:
 *
 *   SATEX_E2E_HEAP=1 npx playwright test heap.spec.ts
 *   SATEX_E2E_HEAP=1 SATEX_E2E_HEAP_MINUTES=5 npx playwright test heap.spec.ts
 *
 * Reads heap via app.evaluate so we see the Electron main-process numbers,
 * not the test runner's. The app boots with USE_SIMULATOR=true (same as
 * smoke.spec.ts) so the heap signature is deterministic across runs.
 *
 * Threshold rationale: SATEX's steady state at 18 watchlist symbols runs
 * ~14MB heap / 308MB RSS (per Phase 10.1 manual log). 5MB/min growth over
 * 30 min would represent ~10x baseline — a clear leak. We allow up to
 * 1.5MB/min (45MB / 30 min) before failing so transient GC cycles and
 * cache warmup don't trip the test.
 */
import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test'
import path from 'path'
import { existsSync } from 'fs'

const ENABLED = process.env['SATEX_E2E_HEAP'] === '1'
const DURATION_MIN = Number(process.env['SATEX_E2E_HEAP_MINUTES'] ?? '30')
const SAMPLE_INTERVAL_MS = 30_000
const MAX_GROWTH_MB_PER_MIN = 1.5
const MAIN_ENTRY = path.join(__dirname, '..', '..', 'out', 'main', 'index.js')

test.describe('heap stability (S1-4)', () => {
  test.skip(!ENABLED, 'set SATEX_E2E_HEAP=1 to run this 30-min test')

  test(`heap growth <= ${MAX_GROWTH_MB_PER_MIN} MB/min over ${DURATION_MIN} min`, async () => {
    test.setTimeout((DURATION_MIN + 2) * 60_000)

    if (!existsSync(MAIN_ENTRY)) {
      throw new Error(`out/main/index.js missing. Run \`npm run build\` first.`)
    }

    let app: ElectronApplication | null = null
    try {
      app = await electron.launch({
        args: [MAIN_ENTRY],
        env: { ...process.env, USE_SIMULATOR: 'true', NODE_ENV: 'production' },
        timeout: 30_000,
      })
      await app.firstWindow({ timeout: 20_000 })

      // Sample (epochMs, heapUsedMB) at SAMPLE_INTERVAL_MS cadence.
      const samples: Array<{ t: number; heapMb: number }> = []
      const sampleHeap = async (): Promise<number> => {
        // app.evaluate runs in the MAIN process — the heap we care about.
        // The simple `() => process.memoryUsage().heapUsed` form is enough.
        const used = await app!.evaluate(() => process.memoryUsage().heapUsed)
        return used / 1024 / 1024
      }

      const startedAt = Date.now()
      const endsAt = startedAt + DURATION_MIN * 60_000
      samples.push({ t: 0, heapMb: await sampleHeap() })
      console.log(`[heap] baseline ${samples[0]!.heapMb.toFixed(1)}MB at t=0`)

      while (Date.now() < endsAt) {
        await new Promise((r) => setTimeout(r, SAMPLE_INTERVAL_MS))
        const heapMb = await sampleHeap()
        const t = (Date.now() - startedAt) / 60_000
        samples.push({ t, heapMb })
        console.log(`[heap] t=${t.toFixed(1)}min heap=${heapMb.toFixed(1)}MB`)
      }

      // Linear regression slope (MB / min) via least-squares.
      const n = samples.length
      const meanT = samples.reduce((a, s) => a + s.t, 0) / n
      const meanH = samples.reduce((a, s) => a + s.heapMb, 0) / n
      let num = 0
      let den = 0
      for (const s of samples) {
        num += (s.t - meanT) * (s.heapMb - meanH)
        den += (s.t - meanT) ** 2
      }
      const slope = den === 0 ? 0 : num / den
      const maxHeap = Math.max(...samples.map((s) => s.heapMb))
      const minHeap = Math.min(...samples.map((s) => s.heapMb))

      console.log(`[heap] samples=${n} slope=${slope.toFixed(3)}MB/min min=${minHeap.toFixed(1)}MB max=${maxHeap.toFixed(1)}MB`)

      expect(
        slope,
        `heap growth slope ${slope.toFixed(3)}MB/min exceeds budget ${MAX_GROWTH_MB_PER_MIN}MB/min — likely leak in event-emitter / timer / store cache`,
      ).toBeLessThan(MAX_GROWTH_MB_PER_MIN)
    } finally {
      if (app) { try { await app.close() } catch { /* ignore */ } }
    }
  })
})
