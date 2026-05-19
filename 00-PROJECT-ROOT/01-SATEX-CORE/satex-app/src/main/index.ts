/**
 * SATEX — Electron Main Process Entry
 * Bootstraps the BrowserWindow and wires ALL IPC handlers to TradingEngine.
 * contextIsolation: true, nodeIntegration: false — renderer is sandboxed.
 * All renderer↔main communication flows through the typed IPC registry.
 */
import { app, BrowserWindow, crashReporter, dialog, ipcMain, Notification, shell } from 'electron'
import { join } from 'path'
import { existsSync } from 'node:fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { z, type ZodTypeAny } from 'zod'
import { TradingEngine } from './core/trading-engine'
import { enableFileSink } from './services/logger'
import { IPC } from '@shared/ipc-channels'
import {
  OrderSubmitReq, OrderCancelReq, KillSwitchReq, CandlesGetReq, SymbolOnlyReq,
  OptionalSymbolReq, SubscribeReq, WatchlistSetReq, SessionIdReq, OptionalSessionIdReq,
  CredentialsSetReq, BaiduSetReq, LiveModeSetReq, AlpacaModeSetReq, BrainDecisionReq,
  AutonomousConfigSetReq, VaultCheckpointReq, ReplayStartReq, ReplaySeekReq,
  ReplaySpeedReq, ReplayBookmarkAddReq, ReplayBookmarkDelReq, HistoricalImportReq,
  IndicatorSettingsSetReq, WorkspaceStateSetReq, JournalReflectReq, LayoutSaveReq,
  WindowZoomReq,
} from '@shared/ipc-schemas'
import { loadEnv } from './services/env'
import { createLogger } from './services/logger'
import { IndicatorSettingsService } from './services/indicator-settings'
import { WorkspaceStateService } from './services/workspace-state'
import { migratePlaintextEnvLocalCreds } from './services/credential-store'
import { isLive } from './services/live-mode'

// Migrate plaintext Alpaca keys out of userData/.env.local into safeStorage
// BEFORE dotenv runs. If keys are migrated the file is rewritten (or deleted)
// so the subsequent dotenv pass sees no plaintext credentials for this run
// either. The migration is idempotent — second run finds nothing to do.
{
  const result = migratePlaintextEnvLocalCreds()
  if (result.status === 'migrated') {
    // eslint-disable-next-line no-console
    console.warn('[satex] plaintext Alpaca keys migrated from userData/.env.local → OS keychain')
  } else if (result.status === 'skipped-no-encryption') {
    // eslint-disable-next-line no-console
    console.error('[satex] WARNING: plaintext Alpaca keys present in userData/.env.local but OS keychain is unavailable. Keys remain on disk in cleartext — fix DPAPI/Keychain/libsecret and reboot to migrate.')
  } else if (result.status === 'error') {
    // eslint-disable-next-line no-console
    console.error('[satex] env.local migration error:', result.detail)
  }
}

// Load .env.local early — before any service reads process.env
import { config as dotenvConfig } from 'dotenv'
dotenvConfig({ path: join(app.getPath('userData'), '.env.local'), override: false })
dotenvConfig({ path: join(process.cwd(), '.env.local'), override: false })
dotenvConfig({ path: join(process.cwd(), '.env'), override: false })

// C17 / S1-7 — turn on the rotating file sink as soon as userData is
// available, BEFORE the trading engine boots so engine init lines persist.
enableFileSink(app.getPath('userData'))

const log = createLogger('main')

// ── Chromium stability shims ────────────────────────────────────────────────
// Windows Electron repeatedly hits "Network service crashed, restarting
// service" during the renderer's initial load, which leaves the BrowserWindow
// stuck on a blank page and the `ready-to-show` event never fires. The
// canonical workaround is to disable hardware-accelerated compositing in the
// main process — kills the GPU process, which is the upstream cause of the
// network-service crash on flaky Win11 GPU drivers. Trade-off is a small
// rendering perf hit, but the SATEX terminal is text-heavy and runs fine
// without GPU compositing.
//
// MUST run before app.whenReady() — switches set after `ready` are ignored.
app.disableHardwareAcceleration()
// Force-disable the GPU sandbox for the same reason — some Win11 builds need
// both switches to stop the network service from cycling.
app.commandLine.appendSwitch('disable-gpu')
app.commandLine.appendSwitch('disable-gpu-compositing')

// ── A4 — Crash dump capture (Chromium Crashpad) ─────────────────────────────
// Enables minidump generation on main / renderer / GPU process crashes. The
// dumps land in app.getPath('crashDumps') — on Windows that's
// %APPDATA%/satex-app/Crashpad/. uploadToServer:false keeps them local; we
// don't currently operate a crash-reporting endpoint, but the dumps + the
// rotating S1-7 log file are enough to investigate a crash after the fact.
//
// crashReporter.start MUST run before app.whenReady() to capture pre-ready
// crashes; calling it later silently no-ops for the bootstrap phase.
try {
  crashReporter.start({
    productName: 'SATEX',
    companyName: 'SATEX Trading',
    submitURL: '',          // unused when uploadToServer is false
    uploadToServer: false,  // keep dumps local — no PII leaves the box
    compress: true,         // smaller .dmp.gz files on disk
    ignoreSystemCrashHandler: false,
    rateLimit: false,       // we never overwhelm anyone since we don't upload
  })
} catch (e) {
  // Don't take down the app if crashReporter fails to initialize — file
  // logs (S1-7) are still the primary forensic channel.
  // eslint-disable-next-line no-console
  console.error('[satex] crashReporter.start failed:', e)
}

// ── Single-instance lock ────────────────────────────────────────────────────
// Alpaca's IEX feed allows exactly 1 concurrent WS connection per account.
// Without this lock a second Electron process (dev HMR restart, accidental
// double-launch from the taskbar) will race the original for that slot and
// the loser gets a 406 "connection limit exceeded" frame. With the lock the
// second invocation focuses the existing window and exits cleanly.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  log.warn('another SATEX instance is running — exiting')
  app.quit()
  process.exit(0)
}

const engine = new TradingEngine()
// Chart-indicator toggle persistence lives at <projectRoot>/Vault/Settings/
// indicator-toggles.md. projectRoot is the user's mc4 root (same logic the
// vault writer uses); we resolve from app.getAppPath() upward to find it.
const indicatorSettings = new IndicatorSettingsService(resolveVaultProjectRoot())
const workspaceState    = new WorkspaceStateService(resolveVaultProjectRoot())
let mainWindow: BrowserWindow | null = null

// ── Process-level crash safety (S0-1) ───────────────────────────────────────
// Without these handlers any unhandled error in main terminates silently:
// session lost, orders stranded, no audit trail. gracefulShutdown drains the
// engine (idempotent — every timer/service handles null) then forces exit so
// a stuck shutdown can't deadlock the process. Re-entrant calls are no-ops.
let shuttingDown = false
function gracefulShutdown(label: string, cause: unknown): void {
  if (shuttingDown) return
  shuttingDown = true
  log.error(`graceful shutdown · ${label}`, {
    cause: String(cause),
    stack: (cause as Error)?.stack,
  })
  try { engine.shutdown() } catch (e) {
    log.error('engine.shutdown threw during graceful shutdown', { err: String(e) })
  }
  // Hard-stop after 5s in case anything is still hanging on an async write.
  setTimeout(() => { try { app.exit(1) } catch { process.exit(1) } }, 5_000).unref()
}
process.on('uncaughtException', (err) => gracefulShutdown('uncaughtException', err))
process.on('unhandledRejection', (reason) => gracefulShutdown('unhandledRejection', reason))

function resolveVaultProjectRoot(): string {
  // electron-vite builds main into <repo>/00-PROJECT-ROOT/01-SATEX-CORE/satex-app/out/main/
  // and the vault lives at <repo-root>/Vault/. app.getAppPath() returns the
  // satex-app dir; walk up to find the directory that contains .obsidian/.
  // Falls back to cwd if no marker is found within 6 levels.
  const start = app.getAppPath()
  let cur = start
  for (let i = 0; i < 6; i++) {
    try {
      const obs = join(cur, '.obsidian')
      if (existsSync(obs)) return cur
    } catch { /* keep walking */ }
    const parent = join(cur, '..')
    if (parent === cur) break
    cur = parent
  }
  return process.cwd()
}

// ── Window ───────────────────────────────────────────────────────────────────
function createWindow(): void {
  mainWindow = new BrowserWindow({
    // SATEX Terminal v2 · Black Box stage is designed for 1920×1080. The renderer
    // shell is fixed-size at the design dimensions; this window matches so no
    // CSS scaling is required.
    width:  1920,
    height: 1080,
    minWidth:  1200,
    minHeight: 720,
    show: false,
    frame: true,
    autoHideMenuBar: true,
    backgroundColor: '#060607',
    webPreferences: {
      preload:          join(__dirname, '../preload/index.js'),
      // 2026-05-18 — sandbox enabled. Chromium isolates the renderer process
      // at the OS level so a renderer RCE can't directly touch the file
      // system or spawn processes. preload still works because it only uses
      // electron.contextBridge + electron.ipcRenderer, both of which are
      // available inside the sandbox; native Node modules (fs, path, etc.)
      // are NOT available to preload under sandbox, but this preload doesn't
      // need them — every privileged operation is delegated to main via IPC.
      sandbox:          true,
      contextIsolation: true,
      nodeIntegration:  false,
    },
  })

  let shown = false
  let domReady = false
  const showOnce = (reason: string): void => {
    if (shown || !mainWindow || mainWindow.isDestroyed()) return
    shown = true
    mainWindow.show()
    mainWindow.focus()
    if (is.dev) mainWindow.webContents.openDevTools({ mode: 'detach' })
    log.info('window shown', { reason })
  }

  mainWindow.on('ready-to-show', () => showOnce('ready-to-show'))
  mainWindow.webContents.on('dom-ready', () => {
    domReady = true
    log.info('renderer dom-ready')
  })
  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    log.warn('renderer did-fail-load', { code, desc, url })
    // Retry once after a short delay — typical cause is the dev server
    // not yet ready in dev mode, or the network service crash described
    // in the shim block above.
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        log.info('retrying renderer load after did-fail-load')
        mainWindow.webContents.reload()
      }
    }, 1500)
  })

  // Watchdog 1 — on flaky Win11 GPU drivers the Chromium network service
  // crashes during initial dev-server load and `ready-to-show` never fires,
  // leaving the user staring at an empty desktop. After 5 s, show the
  // window anyway so they at least see the loading state (or the actual
  // page if the renderer recovered by then). Idempotent via `shown` guard.
  setTimeout(() => showOnce('watchdog-5s'), 5000)

  // Watchdog 2 — if `dom-ready` never fires within 8 s of window creation,
  // the renderer is wedged (network service crashed mid-load, dev server
  // race, etc.). Force a reload. The renderer is idempotent so the engine
  // doesn't care, and IPC stays alive across reload.
  setTimeout(() => {
    if (domReady || !mainWindow || mainWindow.isDestroyed()) return
    log.warn('renderer never reached dom-ready in 8s — forcing reload')
    try { mainWindow.webContents.reload() } catch (e) {
      log.error('forced reload failed', { err: String(e) })
    }
  }, 8000)

  // ── Renderer crash recovery (S0-2) ────────────────────────────────────────
  // On crash, auto-reload the renderer instead of leaving the user with a
  // frozen window. State restoration happens automatically: the renderer's
  // useIPC hook re-fires IPC.SUBSCRIBE on mount, which triggers
  // engine.broadcastInitialSeed() + the snapshot push block in
  // app.whenReady() (QUOTES_TICK / ACCOUNT_UPDATE / ORDERS_UPDATE / etc.).
  // Crash-loop guard: if we exceed 3 reloads in 60s, the renderer is broken
  // beyond auto-recovery — log it and stop reloading so we don't burn CPU.
  const crashHistory: number[] = []
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    log.error('renderer crashed', { reason: details.reason, exitCode: details.exitCode })
    if (details.reason === 'clean-exit') return
    const now = Date.now()
    while (crashHistory.length > 0 && now - crashHistory[0]! > 60_000) crashHistory.shift()
    crashHistory.push(now)
    if (crashHistory.length > 3) {
      log.error('renderer crash-loop detected — giving up on auto-reload', { count: crashHistory.length })
      return
    }
    setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed()) return
      log.warn('reloading renderer after crash', { attempt: crashHistory.length })
      try { mainWindow.reload() } catch (e) {
        log.error('renderer reload failed', { err: String(e) })
      }
    }, 200)
  })
  mainWindow.webContents.on('console-message', (_e, level, message, line, source) => {
    log.info('renderer-console', { level, message, line, source })
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // 2026-05-18 — scheme allowlist. Pre-fix `shell.openExternal(url)` would
    // forward any URL the renderer requested, including `file:`, `ms-…:`,
    // and custom protocol handlers. On Windows, those can launch external
    // programs via protocol associations — a renderer compromise (XSS via
    // news/AI content) could chain into local code execution. Limit to
    // http(s); anything else is denied with a warn log so we notice if a
    // legitimate use case (e.g., mailto:) ever needs the allowlist widened.
    try {
      const protocol = new URL(url).protocol
      if (protocol === 'https:' || protocol === 'http:') {
        shell.openExternal(url)
      } else {
        log.warn('window-open denied — disallowed scheme', { protocol, url: url.slice(0, 200) })
      }
    } catch (e) {
      log.warn('window-open denied — invalid URL', { err: String(e), url: url.slice(0, 200) })
    }
    return { action: 'deny' }
  })

  // ── Visibility-aware push gating (2026-05-17) ──────────────────────────────
  // When the user minimizes / hides the window, freeze the data push pipeline
  // so the renderer doesn't accumulate a backlog of 20Hz quote ticks it can't
  // process while hidden. On restore, re-broadcast a complete snapshot in
  // one shot so the renderer repaints with current state immediately instead
  // of waiting for the next live tick of each channel.
  //
  // Triggers handled:
  //   'minimize' / 'restore'  — taskbar minimize on Windows + restore via click
  //   'hide'     / 'show'     — programmatic hide / Cmd-H on macOS
  //   'blur'     / 'focus'    — NOT used (would pause when devtools takes focus)
  mainWindow.on('minimize', () => {
    pushPaused = true
    log.info('window minimized — renderer pushes paused')
  })
  mainWindow.on('hide', () => {
    pushPaused = true
    log.info('window hidden — renderer pushes paused')
  })
  const resumePushes = (reason: string): void => {
    if (!pushPaused) return
    pushPaused = false
    log.info('window restored — renderer pushes resumed', { reason })
    // The renderer's React tree is still mounted; selectors will pick up
    // store updates from this snapshot. No reload required.
    rebroadcastSnapshot()
  }
  mainWindow.on('restore', () => resumePushes('restore'))
  mainWindow.on('show',    () => resumePushes('show'))

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ── Push helpers (main → renderer) ───────────────────────────────────────────
//
// Pause-on-hide (2026-05-17) — when the user minimizes / hides the SATEX
// window we stop forwarding the high-frequency data feeds (quotes, candles,
// trades, risk gates, etc.) to the renderer. The trading engine keeps running
// in main; only the renderer push is gated. Without this, the renderer's
// event loop accumulated a backlog of 20Hz quote ticks while the page was
// hidden (Chromium throttles rAF but not microtasks); on restore the renderer
// had to process minutes of queued updates in one shot and the JS thread
// wedged — observed as a 10.7s frame stall in the 2026-05-17 02:52 session,
// after which the renderer never recovered. With pushes paused, the renderer
// stays idle while hidden and re-syncs cleanly via `rebroadcastSnapshot()`
// on the next 'restore'/'show' event.
let pushPaused = false
function push(channel: string, payload: unknown): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (pushPaused) return
  mainWindow.webContents.send(channel, payload)
}

/** Re-push the most recent snapshot of every channel a freshly-restored
 *  renderer needs to repaint without waiting for the next live tick. Mirrors
 *  the post-init snapshot block in `app.whenReady` so we have a single
 *  source of truth for "what does the renderer need on resume?". Safe to
 *  call at any time — every getter early-returns sensible defaults when the
 *  engine hasn't initialized yet. */
function rebroadcastSnapshot(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  try {
    push(IPC.QUOTES_TICK,       engine.getAllQuotes())
    if (engine.om) {
      push(IPC.ACCOUNT_UPDATE,  engine.om.getAccount())
      push(IPC.ORDERS_UPDATE,   engine.om.getOrders())
    }
    push(IPC.OBSERVER_STATS,    engine.getObserverStats())
    push(IPC.LEARNER_STATS,     engine.getLearnerStats())
    push(IPC.VAULT_STATS,       engine.getVaultStats())
    push(IPC.REGIME_UPDATE,     engine.getRegime())
    push(IPC.RISK_GATES_UPDATE, engine.getRiskGates())
    push(IPC.MACRO_UPDATE,      engine.getMacro())
    push(IPC.LOGS_TAIL,         engine.getLogsTail())
    push(IPC.DEPTH_UPDATE,      engine.getDepth())
    push(IPC.FEED_STATUS_UPDATE, engine.getFeedStatus())
  } catch (e) {
    log.warn('rebroadcastSnapshot failed', { err: String(e) })
  }
}

// ── Native OS notification helper ────────────────────────────────────────────
// Wraps Electron's Notification API. No-ops cleanly on unsupported platforms.
// Throttled per-key so a noisy event (e.g., kill switch flip-flopping) can't
// spam the notification center.
const notifyState = new Map<string, number>()
function notify(opts: { key: string; title: string; body: string; minIntervalMs?: number; urgent?: boolean }): void {
  if (!Notification.isSupported()) return
  const min = opts.minIntervalMs ?? 5_000
  const last = notifyState.get(opts.key) ?? 0
  const now  = Date.now()
  if (now - last < min) return
  notifyState.set(opts.key, now)
  try {
    const n = new Notification({
      title:     opts.title,
      body:      opts.body,
      urgency:   opts.urgent ? 'critical' : 'normal',
      silent:    !opts.urgent,
    })
    // Click-to-focus: bring the SATEX window forward when the user clicks
    // the toast. Useful for unattended sessions where the trader gets pinged
    // by a fill / stop / kill-switch and wants to inspect immediately.
    //
    // Windows-specific: `BrowserWindow.focus()` alone does not reliably
    // steal foreground from another app — Windows blocks foreground stealing
    // unless multiple signals align. The combination below is the documented
    // workaround: restore() un-minimizes, show() re-asserts visibility (works
    // even if already shown), focus() requests focus, moveTop() forces
    // z-order above other windows. macOS ignores moveTop() harmlessly.
    n.on('click', () => {
      if (!mainWindow || mainWindow.isDestroyed()) return
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
      mainWindow.moveTop()
    })
    n.show()
  } catch (e) {
    log.warn('notification failed', { err: String(e) })
  }
}

// ── Engine event wiring ───────────────────────────────────────────────────────
// State for diff-based notification triggers — we watch transitions, not levels.
let lastSeenOrderIds = new Set<string>()
let lastKillSwitchArmed: boolean | null = null
let lastDailyLossWarned = false
let lastRegimeState:    string | null = null

function wireEngineEvents(): void {
  engine.onQuotes((quotes)            => push(IPC.QUOTES_TICK,   quotes))
  engine.onCandle((sym, candle, isNew)=> push(IPC.CANDLES_UPDATE, { symbol: sym, candle, isNew }))
  engine.onBulkCandlesReplace((sym, candles) => push(IPC.CANDLES_BULK_REPLACE, { symbol: sym, candles }))
  engine.onNews((item)                => push(IPC.NEWS_APPEND,    item))
  engine.onAccount((account)          => {
    push(IPC.ACCOUNT_UPDATE, account)
    // Kill switch transition (not-armed → armed) is operationally critical.
    // `lastKillSwitchArmed` starts as null; we treat null and false equally
    // ("not yet observed armed") so that a boot into a persisted-armed state
    // (kill-switch-store.ts restore) also fires the toast on the first
    // account update.
    if (lastKillSwitchArmed !== true && account.killSwitchArmed === true) {
      notify({
        key: 'kill-switch',
        title: '● Kill switch ARMED',
        body: 'All open orders canceled. Trading halted until disarmed.',
        urgent: true,
        minIntervalMs: 2_000,
      })
    }
    lastKillSwitchArmed = account.killSwitchArmed
    // Daily loss approaching limit — fire once per crossing.
    const limit = account.equity * account.dailyLossLimitPct
    const dailyLoss = Math.max(0, -account.dailyPnl)
    const ratio = limit > 0 ? dailyLoss / limit : 0
    if (ratio >= 0.8 && !lastDailyLossWarned) {
      lastDailyLossWarned = true
      notify({
        key: 'daily-loss-warn',
        title: '⚠ Daily loss approaching limit',
        body: `Loss ${(ratio * 100).toFixed(0)}% of ${(account.dailyLossLimitPct * 100).toFixed(1)}% cap — kill switch arms at 100%.`,
        urgent: true,
        minIntervalMs: 60_000,
      })
    } else if (ratio < 0.5 && lastDailyLossWarned) {
      // Reset latch once we've drifted back well below threshold.
      lastDailyLossWarned = false
    }
  })
  engine.onOrders((orders)            => {
    push(IPC.ORDERS_UPDATE,  orders)
    // Detect newly-filled orders by comparing fill state against last snapshot.
    //
    // 2026-05-16 (adversarial finding C1) — the special "■ Stop hit" toast
    // path was removed alongside `OrderRequest.triggeredBy`. The old branch
    // only fired when the renderer set `triggeredBy:'stop-loss'`, which was
    // both a security bypass surface and unused in practice (no caller ever
    // set the field). All fills now share the standard "✓ Filled" toast.
    // Stop-loss UX clarity will return once we derive trigger-type from
    // AlpacaTradeUpdate bracket-leg metadata in `onAlpacaTradeUpdate`.
    for (const o of orders) {
      const key = `${o.id}:${o.status}`
      if (o.status === 'filled' && !lastSeenOrderIds.has(key)) {
        notify({
          key:   `fill-${o.id}`,
          title: `✓ Filled · ${o.request.side.toUpperCase()} ${o.request.quantity} ${o.request.symbol}`,
          body:  o.fillPrice != null
            ? `@ $${o.fillPrice.toFixed(2)} · ${o.request.type.toUpperCase()}`
            : `${o.request.type.toUpperCase()} order filled`,
          minIntervalMs: 1_000,
        })
      }
    }
    lastSeenOrderIds = new Set(orders.map(o => `${o.id}:${o.status}`))
  })
  engine.onStatus((status)            => push(IPC.SYSTEM_STATUS,  status))
  engine.onFeedStatus((feed)          => push(IPC.FEED_STATUS_UPDATE, feed))
  engine.onObserverStats((s)          => push(IPC.OBSERVER_STATS, s))
  engine.onLearnerStats((s)           => push(IPC.LEARNER_STATS,  s))
  engine.onVaultStats((s)             => push(IPC.VAULT_STATS,    s))
  engine.onReplayStatus((s)           => push(IPC.REPLAY_STATUS,  s))
  engine.onTradeClosed((t)            => push(IPC.TRADE_CLOSED,   t))
  engine.onTrades((trades)            => push(IPC.TRADES_TICK,    trades))
}

/** Wire Phase 10 Black Box pushes — called after engine.initialize() because
 *  the services don't exist until then. */
function wireBlackBoxEvents(): void {
  engine.onRegimeUpdate((s)    => {
    push(IPC.REGIME_UPDATE,     s)
    // Regime transition is a meaningful signal — notify on change.
    if (lastRegimeState !== null && lastRegimeState !== s.state) {
      const dominantP = s.hmm.length > 0
        ? Math.max(...s.hmm.map(h => h.p))
        : 0
      notify({
        key:   `regime-${s.state}`,
        title: `◊ Regime: ${s.state}`,
        body:  `Switched from ${lastRegimeState} · p=${(dominantP * 100).toFixed(0)}%`,
        minIntervalMs: 30_000,
      })
    }
    lastRegimeState = s.state
  })
  engine.onRiskGatesUpdate((s) => push(IPC.RISK_GATES_UPDATE, s))
  engine.onMacroUpdate((s)     => push(IPC.MACRO_UPDATE,      s))
  engine.onLogsTail((s)        => push(IPC.LOGS_TAIL,         s))
  engine.onDepthUpdate((s)     => push(IPC.DEPTH_UPDATE,      s))
}

/** Wire after engine.initialize() — autonomous trader is only built then. */
function wireAutonomousEvents(): void {
  engine.onAutonomousStatus((s)       => push(IPC.AUTONOMOUS_STATS,    s))
  engine.onAutonomousDecision((d)     => push(IPC.AUTONOMOUS_DECISION, d))
}

// ── IPC payload validation wrapper (S0-8 + C3) ───────────────────────────────
// Every handler that takes a payload runs raw input through a Zod schema BEFORE
// the engine sees it. A bad shape throws here, which surfaces as a rejected
// ipcRenderer.invoke() on the renderer side — same error contract callers
// already handle. Without this wrapper, TypeScript's compile-time types are
// erased and the engine trusts whatever the renderer sends.
//
// C3 byte-size cap: Zod validates shape but not raw byte size. A compromised
// renderer could send a 100MB payload that parses successfully (e.g. a huge
// `lesson` string in JournalReflect) and pin the main process on
// JSON.parse → Zod traversal → engine work. The cap fails fast before any of
// that runs. 1MB is generous for SATEX (largest legit payload is the
// IndicatorSettings + WorkspaceState, both well under 1KB).
const MAX_IPC_PAYLOAD_BYTES = 1_000_000

function validated<S extends ZodTypeAny, R>(
  schema: S,
  handler: (req: z.infer<S>) => R | Promise<R>,
): (event: Electron.IpcMainInvokeEvent, raw: unknown) => Promise<R> {
  return async (_event, raw) => {
    // Byte-size guard runs BEFORE Zod so a hostile payload can't waste cycles
    // on schema traversal. JSON.stringify is the closest cheap proxy for the
    // structured-clone size that ipcRenderer.invoke actually transferred.
    // 2026-05-18 — Buffer.byteLength gives the real UTF-8 byte count instead
    // of String#length, which counts UTF-16 code units. Pre-fix a multi-byte
    // payload (emoji in journal `lesson`, Chinese symbol names) registered
    // as 1 unit per character — the effective cap was up to ~4× looser than
    // the documented 1MB. The cap was still enforcing something but not the
    // documented number.
    try {
      const approxBytes = raw === undefined ? 0 : Buffer.byteLength(JSON.stringify(raw), 'utf8')
      if (approxBytes > MAX_IPC_PAYLOAD_BYTES) {
        log.warn('ipc payload too large', { approxBytes, cap: MAX_IPC_PAYLOAD_BYTES })
        throw new Error(`Invalid IPC payload — exceeds ${MAX_IPC_PAYLOAD_BYTES} byte cap (got ${approxBytes})`)
      }
    } catch (e) {
      // JSON.stringify can throw on circular refs / BigInt. Reject those too.
      if (e instanceof Error && e.message.startsWith('Invalid IPC payload')) throw e
      log.warn('ipc payload non-serializable', { err: String(e) })
      throw new Error('Invalid IPC payload — not JSON-serializable', { cause: e })
    }
    const parsed = schema.safeParse(raw)
    if (!parsed.success) {
      const first = parsed.error.issues[0]
      const detail = first ? `${first.path.join('.') || '<root>'}: ${first.message}` : 'unknown shape'
      log.warn('ipc validation rejected', { issues: parsed.error.issues.slice(0, 3) })
      throw new Error(`Invalid IPC payload — ${detail}`)
    }
    return handler(parsed.data)
  }
}

// ── S1-14 — IPC handler safety net ─────────────────────────────────────────
// Every ipcMain.handle registration goes through this wrapper. If the handler
// throws, we log error-level with the channel name + truncated error before
// re-throwing so ipcRenderer.invoke still rejects (preserving the existing
// renderer-side contract). Without this layer, async handler exceptions
// surface to the renderer as opaque rejections with no main-side log trail
// — the exact gap the audit's S1-14 finding flagged.
//
// The validation layer (`validated()`) already logs its own rejections at
// warn-level before throwing; this wrapper additionally catches everything
// the validated layer didn't reject (engine throws, DB throws, etc.).
//
// Channel name kept short in the log payload — the IPC constant string is
// enough to grep against ipc-channels.ts.
function register<T>(
  channel: string,
  fn: (event: Electron.IpcMainInvokeEvent, raw: unknown) => T | Promise<T>,
): void {
  ipcMain.handle(channel, async (event, raw) => {
    try {
      return await fn(event, raw)
    } catch (err) {
      // `Invalid IPC payload — …` errors are already logged by validated()
      // at warn-level and are user-shaped (renderer sent a bad payload).
      // Don't double-log those. Anything else is an engine/DB-side bug or
      // unexpected runtime fault — log at error and keep the stack.
      const msg = err instanceof Error ? err.message : String(err)
      if (!msg.startsWith('Invalid IPC payload')) {
        log.error('ipc handler threw', {
          channel,
          err: msg,
          stack: (err as Error)?.stack?.slice(0, 1500) ?? null,
        })
      }
      throw err
    }
  })
}

// ── IPC Handlers (renderer → main) ────────────────────────────────────────────
function registerIpcHandlers(): void {
  // ── Orders ──────────────────────────────────────────────────────────────────
  register(IPC.ORDER_SUBMIT, validated(OrderSubmitReq, (req) => engine.submitOrder(req)))
  register(IPC.ORDER_CANCEL, validated(OrderCancelReq, (id)  => engine.cancelOrder(id)))

  // ── Risk ─────────────────────────────────────────────────────────────────────
  // 2026-05-18 — kill-switch DISARM gated on a native dialog whenever the
  // typed-phrase live-mode interlock (live-mode.ts) is armed. Mirrors the
  // adversarial-finding C6 hardening that closed live-mode enable: a
  // compromised renderer (XSS via injected news/AI content) could otherwise
  // disarm the kill switch via window.satex.killSwitch(false) and then
  // submit orders within the notional cap. Arming (true) stays ungated —
  // it's the panic button.
  //
  // In paper/simulator mode (isLive() === false) no real capital can flow
  // regardless of kill-switch state, so the dialog would just be friction
  // without any safety value. Gate only when isLive() is armed.
  register(IPC.RISK_KILL, validated(KillSwitchReq, async (arm) => {
    if (arm) {
      engine.armKillSwitch()
      return
    }
    if (isLive()) {
      if (!mainWindow || mainWindow.isDestroyed()) {
        log.warn('kill-switch disarm refused — no main window for native dialog')
        throw new Error('No window available to confirm kill-switch disarm')
      }
      const { response } = await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        buttons: ['Cancel', 'Disarm kill switch'],
        defaultId: 0,
        cancelId: 0,
        title: 'SATEX — Disarm kill switch (LIVE)',
        message: 'Disarm the kill switch while live trading is armed?',
        detail: [
          'New orders will be eligible for submission to the real-capital broker',
          'as soon as this is disarmed.',
          '',
          'Only your click on the button below can authorize this.',
          'No renderer process, AI output, or injected script can bypass this dialog.',
        ].join('\n'),
        noLink: true,
      })
      if (response !== 1) {
        log.warn('kill-switch disarm cancelled at native dialog')
        return
      }
      log.warn('kill-switch disarm authorized via native dialog')
    }
    engine.disarmKillSwitch()
  }))

  // ── Market data ──────────────────────────────────────────────────────────────
  register(IPC.CANDLES_GET,    validated(CandlesGetReq, ({ symbol, limit }) => engine.getCandles(symbol, limit)))
  register(IPC.INDICATORS_GET, validated(SymbolOnlyReq, (symbol)            => engine.getIndicators(symbol)))
  register(IPC.SUBSCRIBE,      validated(SubscribeReq,  (symbols) => {
    log.debug('renderer subscribed', { symbols })
    // Push current snapshot immediately
    const quotes = engine.getAllQuotes()
    push(IPC.QUOTES_TICK, quotes.filter(q => symbols.includes(q.symbol)))
    // Fire one-time fixture seed (catalysts + historical candles) now that
    // the renderer has its IPC listeners attached. Idempotent — guarded by
    // engine.seedBroadcastDone so HMR remounts don't re-flood.
    engine.broadcastInitialSeed()
  }))

  // ── Watchlist ────────────────────────────────────────────────────────────────
  register(IPC.WATCHLIST_GET, ()                              => engine.getWatchlist())
  register(IPC.WATCHLIST_SET, validated(WatchlistSetReq, (syms) => engine.setWatchlist(syms)))

  // ── Orders history ───────────────────────────────────────────────────────────
  register(IPC.ORDERS_HISTORY, validated(OptionalSessionIdReq, (sessionId) => engine.getOrdersHistory(sessionId)))

  // ── Sessions / PnL ──────────────────────────────────────────────────────────
  register(IPC.SESSIONS_LIST,      ()                              => engine.getSessions())
  register(IPC.SESSIONS_SNAPSHOTS, validated(SessionIdReq, (sessId) => engine.getPnlSnapshots(sessId)))

  // ── Brain ────────────────────────────────────────────────────────────────────
  register(IPC.BRAIN_GET, () => engine.getBrainParams())

  // ── Credentials / health ─────────────────────────────────────────────────────
  register(IPC.CREDENTIALS_STATUS,     ()                                => engine.getCredentialsStatus())
  register(IPC.CREDENTIALS_GET_MASKED, ()                                => engine.getCredentialsMasked())
  register(IPC.CREDENTIALS_SET,        validated(CredentialsSetReq, (req) => engine.setCredentials(req)))
  register(IPC.CREDENTIALS_CLEAR,      ()                                => engine.clearCredentials())
  register(IPC.BAIDU_GET_MASKED,       ()                                => engine.getBaiduMasked())
  register(IPC.BAIDU_SET,              validated(BaiduSetReq, (key)       => engine.setBaiduKey(key)))
  register(IPC.ALPACA_RECONNECT,       async ()                          => engine.reconnectAlpaca())
  register(IPC.HEALTH_CHECK,           ()                                => engine.healthCheck())

  // ── Live mode (Phase 5) ──────────────────────────────────────────────────────
  register(IPC.LIVE_MODE_GET, ()                              => engine.getLiveMode())
  register(IPC.LIVE_MODE_SET, validated(LiveModeSetReq, async (req) => {
    // Adversarial finding C6 (2026-05-16) — XSS-resistant live-mode interlock.
    // The renderer can REQUEST live-mode enable but only a click in this
    // native Electron dialog can AUTHORIZE it. The dialog is rendered by the
    // main process at OS level; renderer code (including XSS-injected news
    // content, AI brain output, devtools-pasted scripts) cannot interact with
    // it. This replaces the prior `confirmPhrase` string-equality check,
    // which any in-process code could satisfy by hardcoding the known string.
    if (req.enabled) {
      if (!mainWindow || mainWindow.isDestroyed()) {
        log.warn('live mode enable refused — no main window for native dialog')
        return { ok: false, reason: 'No window available to confirm live-mode enable' }
      }
      const { response } = await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        buttons: ['Cancel', 'I accept real capital'],
        defaultId: 0,
        cancelId: 0,
        title: 'SATEX — Enable LIVE trading',
        message: 'Route orders to real-capital broker?',
        detail: [
          `Endpoint:      https://api.alpaca.markets`,
          `Per-order cap: $${req.notionalCap.toLocaleString()}`,
          '',
          'Every subsequent order will move real money.',
          'Only your click on the button below can authorize this.',
          'No renderer process, AI output, or injected script can bypass this dialog.',
        ].join('\n'),
        noLink: true,
      })
      if (response !== 1) {
        log.warn('live mode enable cancelled at native dialog')
        return { ok: false, reason: 'Cancelled at confirmation dialog — live mode unchanged' }
      }
      log.warn('live mode enable authorized via native dialog', { cap: req.notionalCap })
    }
    return engine.setLiveMode(req)
  }))

  // ── Alpaca endpoint mode (paper vs live URL) ────────────────────────────────
  register(IPC.ALPACA_MODE_GET, ()                                => engine.getAlpacaModeStatus())
  register(IPC.ALPACA_MODE_SET, validated(AlpacaModeSetReq, (req) => engine.setAlpacaModeMode(req)))

  // ── Autonomous paper trader (Phase C) ───────────────────────────────────────
  register(IPC.AUTONOMOUS_ENABLE,     ()                                       => engine.enableAutonomous())
  register(IPC.AUTONOMOUS_DISABLE,    ()                                       => engine.disableAutonomous())
  register(IPC.AUTONOMOUS_STATUS,     ()                                       => engine.getAutonomousStatus())
  register(IPC.AUTONOMOUS_RECENT,     ()                                       => engine.getAutonomousRecent())
  register(IPC.AUTONOMOUS_CONFIG_GET, ()                                       => engine.getAutonomousConfig())
  register(IPC.AUTONOMOUS_CONFIG_SET, validated(AutonomousConfigSetReq, (patch) => engine.setAutonomousConfig(patch)))

  // ── AI brain decision (Phase 6) ──────────────────────────────────────────────
  register(IPC.BRAIN_DECISION, validated(BrainDecisionReq, (symbol) => engine.getAiDecision(symbol)))

  // ── MAY-TACTICS (Phase 7) ────────────────────────────────────────────────────
  register(IPC.TACTICS_STATUS,    ()  => engine.getTacticsStatus())
  register(IPC.TACTICS_GRADUATE,  ()  => engine.graduateTactics())

  // ── Continuous Observer / PatternLearner / Vault (Phase 8) ──────────────────
  register(IPC.OBSERVER_GET,     ()                                  => engine.getObserverStats())
  register(IPC.LEARNER_GET,      ()                                  => engine.getLearnerStats())
  register(IPC.LEARNER_WEIGHTS,  ()                                  => engine.getLearnerWeights())
  register(IPC.VAULT_GET,        ()                                  => engine.getVaultStats())
  register(IPC.VAULT_CHECKPOINT, validated(VaultCheckpointReq, (req) => engine.manualVaultCheckpoint(req)))

  // ── Replay engine (Phase 9) ─────────────────────────────────────────────────
  register(IPC.REPLAY_SESSIONS,          ()                                            => engine.listReplayableSessions())
  register(IPC.REPLAY_START,             validated(ReplayStartReq,        (req)        => engine.startReplay(req)))
  register(IPC.REPLAY_STOP,              ()                                            => engine.stopReplay())
  register(IPC.REPLAY_PAUSE,             ()                                            => engine.pauseReplay())
  register(IPC.REPLAY_RESUME,            ()                                            => engine.resumeReplay())
  register(IPC.REPLAY_SEEK,              validated(ReplaySeekReq,         (ts)         => engine.seekReplay(ts)))
  register(IPC.REPLAY_SET_SPEED,         validated(ReplaySpeedReq,        (speed)      => engine.setReplaySpeed(speed)))
  register(IPC.REPLAY_BOOKMARK_ADD,      validated(ReplayBookmarkAddReq,  (label)      => engine.addReplayBookmark(label)))
  register(IPC.REPLAY_BOOKMARK_DEL,      validated(ReplayBookmarkDelReq,  (id)         => engine.deleteReplayBookmark(id)))
  register(IPC.REPLAY_BOOKMARKS,         validated(SessionIdReq,          (sessionId)  => engine.listReplayBookmarks(sessionId)))
  register(IPC.REPLAY_STATUS_GET,        ()                                            => engine.getReplayStatus())
  register(IPC.REPLAY_IMPORT_HISTORICAL, validated(HistoricalImportReq,   (req)        => engine.importHistoricalDay(req)))
  register(IPC.REPLAY_DELETE_SESSION,    validated(SessionIdReq,          (sessionId)  => engine.deleteReplaySession(sessionId)))

  // ── Chart-indicator toggle persistence (Phase 11) ────────────────────────────
  register(IPC.INDICATOR_SETTINGS_GET,  ()                                          => indicatorSettings.get())
  register(IPC.INDICATOR_SETTINGS_SET,  validated(IndicatorSettingsSetReq, (next)    => indicatorSettings.set(next)))
  register(IPC.INDICATOR_PRIOR_DAY_HLC, validated(SymbolOnlyReq,           (symbol)  => engine.getPriorDayHlc(symbol)))

  // ── Workspace state persistence (Phase 12) ───────────────────────────────────
  register(IPC.WORKSPACE_STATE_GET, ()                                       => workspaceState.get())
  register(IPC.WORKSPACE_STATE_SET, validated(WorkspaceStateSetReq, (next)   => workspaceState.set(next)))

  // ── Trading journal (P0-2) ───────────────────────────────────────────────────
  register(IPC.CLOSED_TRADES_GET, ()                                  => engine.getClosedTrades(500))
  register(IPC.JOURNAL_REFLECT,   validated(JournalReflectReq, (req)  => engine.applyTradeReflection(req.id, req.lesson, req.emotionTag)))

  // ── Layout + CSV export ──────────────────────────────────────────────────────
  register(IPC.LAYOUT_SAVE, validated(LayoutSaveReq, (payload) => {
    log.debug('layout save requested', { hasPayload: !!payload })
    return { ok: true }
  }))

  // ── C8 — Snapshot export ─────────────────────────────────────────────────
  // Collects every "user-visible state" surface into one JSON blob: indicator
  // toggles, workspace layout, watchlist, autonomous config, recent closed
  // trades, account snapshot. Account secrets (credentials, baidu key) are
  // EXCLUDED — they live in safeStorage and exporting them would defeat the
  // encryption. The blob is written to <userData>/snapshots/ with the wall-
  // clock timestamp so the user can find it in their file manager.
  register(IPC.SNAPSHOT_EXPORT, async () => {
    try {
      const snapshot = {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        // 2026-05-18 — pulled from packaged package.json via Electron's
        // app.getVersion(). Pre-fix this was a hardcoded '0.3.0' string that
        // had drifted 3 releases behind package.json; snapshots written from
        // the running app lied about which build produced them.
        app: { name: 'satex', version: app.getVersion() },
        indicatorSettings: indicatorSettings.get(),
        workspaceState: workspaceState.get(),
        watchlist: engine.getWatchlist(),
        autonomousConfig: engine.getAutonomousConfig(),
        closedTrades: engine.getClosedTrades(500),
        account: engine.om?.getAccount() ?? null,
      }
      const fs = await import('node:fs')
      const path = await import('node:path')
      const dir = path.join(app.getPath('userData'), 'snapshots')
      fs.mkdirSync(dir, { recursive: true })
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const file = path.join(dir, `satex-snapshot-${stamp}.json`)
      fs.writeFileSync(file, JSON.stringify(snapshot, null, 2), 'utf8')
      log.info('snapshot exported', { path: file, bytes: fs.statSync(file).size })
      return { ok: true, path: file, bytes: fs.statSync(file).size }
    } catch (e) {
      log.error('snapshot export failed', { err: String(e) })
      return { ok: false, reason: String(e) }
    }
  })
  register(IPC.ORDERS_EXPORT_CSV, async () => {
    try {
      const orders = engine.getOrdersHistory()
      const rows = ['id,createdAt,filledAt,symbol,side,type,qty,fillPrice,status']
      for (const o of orders) {
        rows.push([
          o.id, o.createdAt, o.filledAt ?? '',
          o.request.symbol, o.request.side, o.request.type,
          o.request.quantity, o.fillPrice ?? '', o.status,
        ].join(','))
      }
      const csv = rows.join('\n')
      const fs = await import('fs')
      const p = join(app.getPath('downloads'), `satex-orders-${Date.now()}.csv`)
      fs.writeFileSync(p, csv, 'utf8')
      log.info('orders csv exported', { path: p, count: orders.length })
      return { ok: true, path: p }
    } catch (e) {
      log.error('csv export failed', { err: String(e) })
      return { ok: false }
    }
  })

  // ── Phase 10: SATEX Terminal v2 · Black Box ──────────────────────────────
  register(IPC.REGIME_GET,      ()                                       => engine.getRegime())
  register(IPC.RISK_GATES_GET,  ()                                       => engine.getRiskGates())
  register(IPC.MACRO_GET,       ()                                       => engine.getMacro())
  register(IPC.LOGS_GET,        ()                                       => engine.getLogsTail())
  register(IPC.DEPTH_GET,       validated(OptionalSymbolReq, (symbol)    => engine.getDepth(symbol)))
  register(IPC.DEPTH_SUBSCRIBE, validated(SymbolOnlyReq,     (symbol)    => { engine.subscribeDepth(symbol); return { ok: true } }))

  // ── Window controls ──────────────────────────────────────────────────────────
  register(IPC.WINDOW_TOGGLE_FULLSCREEN, () => {
    if (mainWindow) mainWindow.setFullScreen(!mainWindow.isFullScreen())
  })
  register(IPC.WINDOW_TOGGLE_DEVTOOLS, () => {
    mainWindow?.webContents.toggleDevTools()
  })
  register(IPC.WINDOW_SET_ZOOM, validated(WindowZoomReq, (factor) => {
    mainWindow?.webContents.setZoomFactor(Math.max(0.5, Math.min(2.0, factor)))
  }))
  register(IPC.WINDOW_GET_ZOOM, () => mainWindow?.webContents.getZoomFactor() ?? 1.0)

  log.info('IPC handlers registered', { count: Object.keys(IPC).length })
}

// Focus existing window when a second-instance launch is rejected.
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.satex.trading')
  app.on('browser-window-created', (_, w) => optimizer.watchWindowShortcuts(w))

  loadEnv()

  registerIpcHandlers()
  createWindow()
  wireEngineEvents()

  try {
    await engine.initialize()
    wireAutonomousEvents()
    wireBlackBoxEvents()
    log.info('trading engine online')
    // Push initial state to renderer
    setTimeout(() => {
      push(IPC.QUOTES_TICK, engine.getAllQuotes())
      push(IPC.ACCOUNT_UPDATE, engine.om.getAccount())
      push(IPC.ORDERS_UPDATE, engine.om.getOrders())
      push(IPC.OBSERVER_STATS, engine.getObserverStats())
      push(IPC.LEARNER_STATS,  engine.getLearnerStats())
      push(IPC.VAULT_STATS,    engine.getVaultStats())
      // Phase 10 seed snapshots
      push(IPC.REGIME_UPDATE,     engine.getRegime())
      push(IPC.RISK_GATES_UPDATE, engine.getRiskGates())
      push(IPC.MACRO_UPDATE,      engine.getMacro())
      push(IPC.LOGS_TAIL,         engine.getLogsTail())
      push(IPC.DEPTH_UPDATE,      engine.getDepth())
      push(IPC.FEED_STATUS_UPDATE, engine.getFeedStatus())
    }, 1500)
  } catch (err) {
    log.error('engine initialization failed', { err: String(err) })
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  engine.shutdown()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => engine.shutdown())
