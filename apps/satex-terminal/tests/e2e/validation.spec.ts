/**
 * SATEX startup + data integrity validation (2026-05-16 Saturday probe).
 *
 * Runs the comprehensive end-to-end startup check requested by the user.
 * Captures evidence at multiple time points (boot, settled, post-resize) and
 * inspects the rendered DOM for the symbols/text that the validation phases
 * require. Each phase is reported as PASS / FAIL / N-A with a one-line reason.
 *
 * Runs against USE_SIMULATOR=true so we don't push WS connections to the
 * live Alpaca feed on a weekend. Phases that require live data are marked N-A
 * with an explanation rather than fabricated.
 */
import { test, expect, _electron as electron, type ConsoleMessage, type ElectronApplication, type Page } from '@playwright/test'
import path from 'path'
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'fs'

const ARTIFACT_DIR = path.join(__dirname, '..', '..', 'playwright-results', 'validation')
const MAIN_ENTRY   = path.join(__dirname, '..', '..', 'out', 'main', 'index.js')

interface ConsoleEvent { type: string; text: string }

test.beforeAll(() => {
  if (!existsSync(MAIN_ENTRY)) {
    throw new Error(`out/main/index.js missing. Run \`npm run build\` first. Looked at: ${MAIN_ENTRY}`)
  }
  if (existsSync(ARTIFACT_DIR)) rmSync(ARTIFACT_DIR, { recursive: true, force: true })
  mkdirSync(ARTIFACT_DIR, { recursive: true })
})

test('SATEX startup + data integrity validation', async () => {
  test.setTimeout(60_000)

  let app: ElectronApplication | null = null
  const events: ConsoleEvent[] = []

  try {
    const t0 = Date.now()
    app = await electron.launch({
      args: [MAIN_ENTRY],
      env: { ...process.env, USE_SIMULATOR: 'true', NODE_ENV: 'production' },
      timeout: 30_000,
    })
    const tLaunched = Date.now() - t0
    console.log(`[validation] electron.launch resolved in ${tLaunched}ms`)

    // ── S1-7 follow-up: capture main-process stdout/stderr so logger init
    // lines (file sink init starting / ready) are visible in the test
    // transcript. Without this, structured logs from the main process go
    // to /dev/null and we can't diagnose file-sink failures.
    const mainStdout: string[] = []
    const mainStderr: string[] = []
    const proc = app.process()
    proc.stdout?.on('data', (d: Buffer) => {
      const s = d.toString()
      mainStdout.push(s)
      process.stdout.write(`[main:stdout] ${s}`)
    })
    proc.stderr?.on('data', (d: Buffer) => {
      const s = d.toString()
      mainStderr.push(s)
      process.stdout.write(`[main:stderr] ${s}`)
    })

    const win: Page = await app.firstWindow({ timeout: 20_000 })
    win.on('console', (m: ConsoleMessage) => events.push({ type: m.type(), text: m.text() }))
    win.on('pageerror', (err) => events.push({ type: 'pageerror', text: err.message }))

    await win.waitForLoadState('domcontentloaded', { timeout: 20_000 })
    const tDomReady = Date.now() - t0
    console.log(`[validation] domcontentloaded at ${tDomReady}ms from launch`)

    // ── Phase 1.1: capture boot screenshot ASAP ─────────────────────────────
    await expect.poll(
      async () => (await win.locator('body *').count()) > 0,
      { timeout: 15_000, message: 'renderer never populated body' },
    ).toBe(true)
    await win.screenshot({ path: path.join(ARTIFACT_DIR, '01-boot.png'), fullPage: true })

    // ── Phase 1.2 + 1.3: workspace + symbol restoration ─────────────────────
    // Settle for 3s so the workspace store has hydrated from
    // Vault/Settings/workspace-state.md and the panels have populated.
    await win.waitForTimeout(3000)
    await win.screenshot({ path: path.join(ARTIFACT_DIR, '02-settled-3s.png'), fullPage: true })

    // ── S1-7 verification: confirm <userData>/logs/ exists after 5s ─────────
    // Wait an additional 2s (total 5s settle) so the logger.ts mkdirSync
    // has definitely run. Ask main for the userData path it resolved (the
    // ONE source of truth — different from test-process APPDATA reading),
    // then check fs from the test process.
    //
    // Note: Playwright's app.evaluate doesn't expose Node's `require`, so
    // we keep the in-main work to electron-only APIs and do fs in-test.
    await win.waitForTimeout(2000)
    const userDataDir = await app.evaluate(({ app: electronApp }) => electronApp.getPath('userData'))
    const logsDir = path.join(userDataDir, 'logs')
    const logsDirExists = existsSync(logsDir)
    const logFiles = logsDirExists ? readdirSync(logsDir) : []
    console.log(`[validation] logs-dir check: ${JSON.stringify({ userDataDir, logsDir, exists: logsDirExists, files: logFiles })}`)
    expect(
      logsDirExists,
      `logs/ directory missing at ${logsDir}. userData=${userDataDir}. ` +
      `Check main-process stdout for "file sink init starting" / "file sink ready" / ` +
      `"file sink init failed" lines.`,
    ).toBe(true)
    expect(
      logFiles.some(f => f.startsWith('satex-') && f.endsWith('.log')),
      `no daily log file present in ${logsDir} — files: ${logFiles.join(', ')}`,
    ).toBe(true)

    // Read the active workspace tab. TopBar tabs render `Trade Focus Markets
    // Replay Quad`. Check which one has the `.on` class (the .ws-tab.on
    // selector). Fall back to any tab marked aria-current if class is gone.
    const activeWorkspace = await win.evaluate(() => {
      const tabs = document.querySelectorAll('[class*="ws-tab"], [class*="bb-tab"], button')
      for (const t of Array.from(tabs)) {
        const txt = (t as HTMLElement).textContent?.trim()
        const isActive = t.className.includes('on') || t.getAttribute('aria-current') === 'true'
        if (isActive && txt && ['Trade', 'Focus', 'Markets', 'Replay', 'Quad'].includes(txt)) {
          return txt
        }
      }
      return null
    })
    console.log(`[validation] active workspace tab: ${activeWorkspace}`)

    // Collect all symbol-like tokens visible in the renderer right now.
    // Symbol = 1-5 uppercase letters appearing in a text node. We bound the
    // result to known SATEX universe candidates to filter noise.
    const visibleSymbols = await win.evaluate(() => {
      const KNOWN = new Set([
        'NVDA','AAPL','MSFT','GOOG','GOOGL','TSLA','META','AMZN','AMD','SPY','QQQ','IWM','DIA','VXX',
        'ES','NQ','RTY','YM','CL','GC','SI','BTC','ETH','SOL',
      ])
      const out = new Set<string>()
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      let n: Node | null
      while ((n = walker.nextNode())) {
        const text = n.textContent ?? ''
        for (const tok of text.split(/\s+/)) {
          const clean = tok.replace(/[^A-Z]/g, '')
          if (clean.length >= 2 && clean.length <= 5 && KNOWN.has(clean)) out.add(clean)
        }
      }
      return Array.from(out).sort()
    })
    console.log(`[validation] visible symbols: ${visibleSymbols.join(', ')}`)

    // ── Phase 2.1: WS connect — only validatable when not in simulator mode
    // We're in USE_SIMULATOR=true, so the engine does NOT open a WS to Alpaca.
    // Capture the log lines that prove which path was taken.
    const useSimLines = events.filter(e => /simulator|alpaca live market/i.test(e.text))
    console.log(`[validation] data-source path lines: ${useSimLines.map(e => e.text.slice(0, 100)).join(' | ')}`)

    // ── Phase 4.3: window resize behavior ───────────────────────────────────
    // The Black Box stage is fixed at 1920×1080 by design (App.tsx:5-9). We
    // attempt a resize and capture the result — expect either graceful
    // adaptation or the fixed-design clip behavior.
    await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0]
      if (w) { w.setMinimumSize(800, 600); w.setSize(1280, 800) }
    })
    await win.waitForTimeout(500)
    await win.screenshot({ path: path.join(ARTIFACT_DIR, '03-resized-1280x800.png'), fullPage: true })

    await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0]
      if (w) w.setSize(1920, 1080)
    })
    await win.waitForTimeout(500)
    await win.screenshot({ path: path.join(ARTIFACT_DIR, '04-restored-1920x1080.png'), fullPage: true })

    // ── Phase 4.2: console error/warning analysis ───────────────────────────
    const errorEvents = events.filter(e => e.type === 'error' || e.type === 'pageerror')
    const warnEvents  = events.filter(e => e.type === 'warning')
    const perfWarns   = warnEvents.filter(e => /\[perf\]/.test(e.text))
    const otherWarns  = warnEvents.filter(e => !/\[perf\]/.test(e.text))

    // ── Persist a structured validation report ──────────────────────────────
    const report = {
      generatedAt: new Date().toISOString(),
      timing: { electronLaunchMs: tLaunched, domReadyMs: tDomReady },
      activeWorkspace,
      visibleSymbols,
      consoleErrors: errorEvents.length,
      consoleErrorTexts: errorEvents.slice(0, 10).map(e => e.text),
      consoleWarnings: warnEvents.length,
      perfWarnings: perfWarns.length,
      otherWarnings: otherWarns.length,
      otherWarningTexts: otherWarns.slice(0, 10).map(e => e.text),
      dataSourcePathHints: useSimLines.map(e => e.text),
      totalEvents: events.length,
    }
    writeFileSync(path.join(ARTIFACT_DIR, 'report.json'), JSON.stringify(report, null, 2), 'utf8')

    // Console summary for the test runner output.
    console.log('---VALIDATION REPORT---')
    console.log(JSON.stringify(report, null, 2))

    // Hard assertion: zero ERROR-level renderer messages OR pageerrors.
    expect(errorEvents, `renderer logged ${errorEvents.length} ERROR(s): ${errorEvents.map(e => e.text).join(' | ')}`).toEqual([])
  } finally {
    if (app) { try { await app.close() } catch { /* ignore */ } }
  }
})
