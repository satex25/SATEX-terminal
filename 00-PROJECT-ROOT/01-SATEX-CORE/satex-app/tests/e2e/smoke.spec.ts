/**
 * SATEX Electron smoke test (post-S0-batch QA).
 *
 * Launches the built app via _electron.launch(), waits for the renderer to
 * reach domcontentloaded, captures a screenshot, then asserts the boot path
 * didn't throw or produce error-level console output. Single-instance lock
 * means this test will exit immediately if another SATEX process is open;
 * the runner reports that as a launch failure with a clear message.
 *
 * Run: npx playwright test
 */
import { test, expect, _electron as electron, type ElectronApplication, type ConsoleMessage } from '@playwright/test'
import path from 'path'
import { existsSync, mkdirSync, rmSync } from 'fs'

const ARTIFACT_DIR = path.join(__dirname, '..', '..', 'playwright-results')
const MAIN_ENTRY   = path.join(__dirname, '..', '..', 'out', 'main', 'index.js')

test.beforeAll(() => {
  if (!existsSync(MAIN_ENTRY)) {
    throw new Error(`out/main/index.js missing. Run \`npm run build\` first. Looked at: ${MAIN_ENTRY}`)
  }
  if (existsSync(ARTIFACT_DIR)) rmSync(ARTIFACT_DIR, { recursive: true, force: true })
  mkdirSync(ARTIFACT_DIR, { recursive: true })
})

test('app launches, renderer mounts, no error-level console output', async () => {
  let app: ElectronApplication | null = null
  const consoleErrors: string[] = []
  const consoleAll: { type: string; text: string }[] = []

  try {
    // USE_SIMULATOR=true ensures the engine picks MarketSimulator instead of
    // attempting Alpaca REST/WS — keeps the test offline-safe and avoids
    // 401-noise from the missing credentials.
    app = await electron.launch({
      args: [MAIN_ENTRY],
      env: { ...process.env, USE_SIMULATOR: 'true', NODE_ENV: 'production' },
      timeout: 30_000,
    })

    const window = await app.firstWindow({ timeout: 20_000 })

    // Mirror renderer console to the test transcript and bucket error-level
    // messages for the assertion below. The S0-2 watchdog logs WARN on
    // did-fail-load, which is expected on dev-server flakes; we only fail
    // the test on ERROR-level renderer output.
    window.on('console', (msg: ConsoleMessage) => {
      consoleAll.push({ type: msg.type(), text: msg.text() })
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })
    window.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`))

    await window.waitForLoadState('domcontentloaded', { timeout: 20_000 })

    // Give Phase 12 workspace-state hydration + initial seed broadcast a beat
    // to settle before the screenshot. Web-first assertion: wait until the
    // shell <body> has at least one child rendered (App.tsx mount complete).
    await expect.poll(
      async () => (await window.locator('body *').count()) > 0,
      { timeout: 15_000, message: 'renderer body never received any child elements' },
    ).toBe(true)

    await window.screenshot({ path: path.join(ARTIFACT_DIR, 'boot.png'), fullPage: true })

    // Surface the console transcript regardless of pass/fail so the report
    // is useful even when nothing broke.
    console.log(`[smoke] renderer console messages (${consoleAll.length}):`)
    for (const m of consoleAll.slice(0, 30)) console.log(`  [${m.type}] ${m.text.slice(0, 200)}`)
    if (consoleAll.length > 30) console.log(`  ... ${consoleAll.length - 30} more truncated`)

    expect(consoleErrors, `renderer logged ${consoleErrors.length} error(s): ${consoleErrors.join(' | ')}`).toEqual([])
  } finally {
    if (app) {
      try { await app.close() } catch { /* ignore close-time errors */ }
    }
  }
})
