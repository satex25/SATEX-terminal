/**
 * SATEX — Electron Main Process Entry
 * Bootstraps the BrowserWindow and wires ALL IPC handlers to TradingEngine.
 * contextIsolation: true, nodeIntegration: false — renderer is sandboxed.
 * All renderer↔main communication flows through the typed IPC registry.
 */
import { app, BrowserWindow, ipcMain, Notification, shell } from 'electron'
import { join } from 'path'
import { existsSync } from 'node:fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { TradingEngine } from './core/trading-engine'
import { IPC } from '@shared/ipc-channels'
import { loadEnv } from './services/env'
import { createLogger } from './services/logger'
import { IndicatorSettingsService } from './services/indicator-settings'
import { WorkspaceStateService } from './services/workspace-state'

// Load .env.local early — before any service reads process.env
import { config as dotenvConfig } from 'dotenv'
dotenvConfig({ path: join(app.getPath('userData'), '.env.local'), override: false })
dotenvConfig({ path: join(process.cwd(), '.env.local'), override: false })
dotenvConfig({ path: join(process.cwd(), '.env'), override: false })

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
  // eslint-disable-next-line no-process-exit
  process.exit(0)
}

const engine = new TradingEngine()
// Chart-indicator toggle persistence lives at <projectRoot>/Vault/Settings/
// indicator-toggles.md. projectRoot is the user's mc4 root (same logic the
// vault writer uses); we resolve from app.getAppPath() upward to find it.
const indicatorSettings = new IndicatorSettingsService(resolveVaultProjectRoot())
const workspaceState    = new WorkspaceStateService(resolveVaultProjectRoot())
let mainWindow: BrowserWindow | null = null

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
      sandbox:          false,
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

  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    log.error('renderer crashed', { reason: details.reason, exitCode: details.exitCode })
  })
  mainWindow.webContents.on('console-message', (_e, level, message, line, source) => {
    log.info('renderer-console', { level, message, line, source })
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ── Push helpers (main → renderer) ───────────────────────────────────────────
function push(channel: string, payload: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload)
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
  engine.onNews((item)                => push(IPC.NEWS_APPEND,    item))
  engine.onAccount((account)          => {
    push(IPC.ACCOUNT_UPDATE, account)
    // Kill switch transition (false→true) is operationally critical.
    if (lastKillSwitchArmed === false && account.killSwitchArmed === true) {
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
    // Stop-loss exits get a distinct urgent toast — they signal risk realized,
    // not normal entry/take-profit fills, and the user needs to know fast.
    for (const o of orders) {
      const key = `${o.id}:${o.status}`
      if (o.status === 'filled' && !lastSeenOrderIds.has(key)) {
        if (o.request.triggeredBy === 'stop-loss') {
          notify({
            key:   `stop-${o.id}`,
            title: `■ Stop hit · ${o.request.symbol}`,
            body:  o.fillPrice != null
              ? `${o.request.side.toUpperCase()} ${o.request.quantity} @ $${o.fillPrice.toFixed(2)} — risk gate fired`
              : `${o.request.side.toUpperCase()} ${o.request.quantity} — stop-loss closed position`,
            urgent: true,
            minIntervalMs: 1_000,
          })
        } else {
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
    }
    lastSeenOrderIds = new Set(orders.map(o => `${o.id}:${o.status}`))
  })
  engine.onStatus((status)            => push(IPC.SYSTEM_STATUS,  status))
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

// ── IPC Handlers (renderer → main) ────────────────────────────────────────────
function registerIpcHandlers(): void {
  // ── Orders ──────────────────────────────────────────────────────────────────
  ipcMain.handle(IPC.ORDER_SUBMIT, async (_e, req) => engine.submitOrder(req))
  ipcMain.handle(IPC.ORDER_CANCEL, async (_e, id)  => engine.cancelOrder(id))

  // ── Risk ─────────────────────────────────────────────────────────────────────
  ipcMain.handle(IPC.RISK_KILL, (_e, arm: boolean) => {
    if (arm) engine.armKillSwitch()
    else     engine.disarmKillSwitch()
  })

  // ── Market data ──────────────────────────────────────────────────────────────
  ipcMain.handle(IPC.CANDLES_GET,   (_e, { symbol, limit })  => engine.getCandles(symbol, limit))
  ipcMain.handle(IPC.INDICATORS_GET,(_e, symbol: string)     => engine.getIndicators(symbol))
  ipcMain.handle(IPC.SUBSCRIBE,     (_e, symbols: string[])  => {
    log.debug('renderer subscribed', { symbols })
    // Push current snapshot immediately
    const quotes = engine.getAllQuotes()
    push(IPC.QUOTES_TICK, quotes.filter(q => symbols.includes(q.symbol)))
    // Fire one-time fixture seed (catalysts + historical candles) now that
    // the renderer has its IPC listeners attached. Idempotent — guarded by
    // engine.seedBroadcastDone so HMR remounts don't re-flood.
    engine.broadcastInitialSeed()
  })

  // ── Watchlist ────────────────────────────────────────────────────────────────
  ipcMain.handle(IPC.WATCHLIST_GET, ()           => engine.getWatchlist())
  ipcMain.handle(IPC.WATCHLIST_SET, (_e, syms)   => engine.setWatchlist(syms))

  // ── Orders history ───────────────────────────────────────────────────────────
  ipcMain.handle(IPC.ORDERS_HISTORY,   (_e, sessionId) => engine.getOrdersHistory(sessionId))

  // ── Sessions / PnL ──────────────────────────────────────────────────────────
  ipcMain.handle(IPC.SESSIONS_LIST,     ()          => engine.getSessions())
  ipcMain.handle(IPC.SESSIONS_SNAPSHOTS,(_e, sessId)=> engine.getPnlSnapshots(sessId))

  // ── Brain ────────────────────────────────────────────────────────────────────
  ipcMain.handle(IPC.BRAIN_GET, () => engine.getBrainParams())

  // ── Credentials / health ─────────────────────────────────────────────────────
  ipcMain.handle(IPC.CREDENTIALS_STATUS,     ()        => engine.getCredentialsStatus())
  ipcMain.handle(IPC.CREDENTIALS_GET_MASKED, ()        => engine.getCredentialsMasked())
  ipcMain.handle(IPC.CREDENTIALS_SET,        (_e, req) => engine.setCredentials(req))
  ipcMain.handle(IPC.CREDENTIALS_CLEAR,      ()        => engine.clearCredentials())
  ipcMain.handle(IPC.BAIDU_GET_MASKED,       ()        => engine.getBaiduMasked())
  ipcMain.handle(IPC.BAIDU_SET,              (_e, key: string) => engine.setBaiduKey(key))
  ipcMain.handle(IPC.ALPACA_RECONNECT,       async ()  => engine.reconnectAlpaca())
  ipcMain.handle(IPC.HEALTH_CHECK,           ()        => engine.healthCheck())

  // ── Live mode (Phase 5) ──────────────────────────────────────────────────────
  ipcMain.handle(IPC.LIVE_MODE_GET, ()           => engine.getLiveMode())
  ipcMain.handle(IPC.LIVE_MODE_SET, (_e, req)    => engine.setLiveMode(req))

  // ── Alpaca endpoint mode (paper vs live URL) ────────────────────────────────
  ipcMain.handle(IPC.ALPACA_MODE_GET, ()         => engine.getAlpacaModeStatus())
  ipcMain.handle(IPC.ALPACA_MODE_SET, async (_e, req) => engine.setAlpacaModeMode(req))

  // ── Autonomous paper trader (Phase C) ───────────────────────────────────────
  ipcMain.handle(IPC.AUTONOMOUS_ENABLE,     ()           => engine.enableAutonomous())
  ipcMain.handle(IPC.AUTONOMOUS_DISABLE,    ()           => engine.disableAutonomous())
  ipcMain.handle(IPC.AUTONOMOUS_STATUS,     ()           => engine.getAutonomousStatus())
  ipcMain.handle(IPC.AUTONOMOUS_RECENT,     ()           => engine.getAutonomousRecent())
  ipcMain.handle(IPC.AUTONOMOUS_CONFIG_GET, ()           => engine.getAutonomousConfig())
  ipcMain.handle(IPC.AUTONOMOUS_CONFIG_SET, (_e, patch)  => engine.setAutonomousConfig(patch))

  // ── AI brain decision (Phase 6) ──────────────────────────────────────────────
  ipcMain.handle(IPC.BRAIN_DECISION, async (_e, symbol: string) => engine.getAiDecision(symbol))

  // ── MAY-TACTICS (Phase 7) ────────────────────────────────────────────────────
  ipcMain.handle(IPC.TACTICS_STATUS,    ()  => engine.getTacticsStatus())
  ipcMain.handle(IPC.TACTICS_GRADUATE,  ()  => engine.graduateTactics())

  // ── Continuous Observer / PatternLearner / Vault (Phase 8) ──────────────────
  ipcMain.handle(IPC.OBSERVER_GET,      ()  => engine.getObserverStats())
  ipcMain.handle(IPC.LEARNER_GET,       ()  => engine.getLearnerStats())
  ipcMain.handle(IPC.LEARNER_WEIGHTS,   ()  => engine.getLearnerWeights())
  ipcMain.handle(IPC.VAULT_GET,         ()  => engine.getVaultStats())
  ipcMain.handle(IPC.VAULT_CHECKPOINT,  async (_e, req) => engine.manualVaultCheckpoint(req))

  // ── Replay engine (Phase 9) ─────────────────────────────────────────────────
  ipcMain.handle(IPC.REPLAY_SESSIONS,   ()                              => engine.listReplayableSessions())
  ipcMain.handle(IPC.REPLAY_START,      async (_e, req)                 => engine.startReplay(req))
  ipcMain.handle(IPC.REPLAY_STOP,       ()                              => engine.stopReplay())
  ipcMain.handle(IPC.REPLAY_PAUSE,      ()                              => engine.pauseReplay())
  ipcMain.handle(IPC.REPLAY_RESUME,     ()                              => engine.resumeReplay())
  ipcMain.handle(IPC.REPLAY_SEEK,       (_e, ts: number)                => engine.seekReplay(ts))
  ipcMain.handle(IPC.REPLAY_SET_SPEED,  (_e, speed: number)             => engine.setReplaySpeed(speed))
  ipcMain.handle(IPC.REPLAY_BOOKMARK_ADD, (_e, label: string)           => engine.addReplayBookmark(label))
  ipcMain.handle(IPC.REPLAY_BOOKMARK_DEL, (_e, id: string)              => engine.deleteReplayBookmark(id))
  ipcMain.handle(IPC.REPLAY_BOOKMARKS,  (_e, sessionId: string)         => engine.listReplayBookmarks(sessionId))
  ipcMain.handle(IPC.REPLAY_STATUS_GET, ()                              => engine.getReplayStatus())
  ipcMain.handle(IPC.REPLAY_IMPORT_HISTORICAL, async (_e, req)          => engine.importHistoricalDay(req))
  ipcMain.handle(IPC.REPLAY_DELETE_SESSION,    (_e, sessionId: string)  => engine.deleteReplaySession(sessionId))

  // ── Chart-indicator toggle persistence (Phase 11) ────────────────────────────
  ipcMain.handle(IPC.INDICATOR_SETTINGS_GET, () => indicatorSettings.get())
  ipcMain.handle(IPC.INDICATOR_SETTINGS_SET, (_e, next) => indicatorSettings.set(next))
  ipcMain.handle(IPC.INDICATOR_PRIOR_DAY_HLC, (_e, symbol: string) => engine.getPriorDayHlc(symbol))

  // ── Workspace state persistence (Phase 12) ───────────────────────────────────
  ipcMain.handle(IPC.WORKSPACE_STATE_GET, () => workspaceState.get())
  ipcMain.handle(IPC.WORKSPACE_STATE_SET, (_e, next) => workspaceState.set(next))

  // ── Trading journal (P0-2) ───────────────────────────────────────────────────
  ipcMain.handle(IPC.CLOSED_TRADES_GET, () => engine.getClosedTrades(500))
  ipcMain.handle(IPC.JOURNAL_REFLECT, (_e, req: { id: string; lesson: string; emotionTag?: import('@shared/types').JournalTag }) =>
    engine.applyTradeReflection(req.id, req.lesson, req.emotionTag))

  // ── Layout + CSV export ──────────────────────────────────────────────────────
  ipcMain.handle(IPC.LAYOUT_SAVE,       (_e, payload: unknown) => {
    log.debug('layout save requested', { hasPayload: !!payload })
    return { ok: true }
  })
  ipcMain.handle(IPC.ORDERS_EXPORT_CSV, async () => {
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
  ipcMain.handle(IPC.REGIME_GET,       ()              => engine.getRegime())
  ipcMain.handle(IPC.RISK_GATES_GET,   ()              => engine.getRiskGates())
  ipcMain.handle(IPC.MACRO_GET,        ()              => engine.getMacro())
  ipcMain.handle(IPC.LOGS_GET,         ()              => engine.getLogsTail())
  ipcMain.handle(IPC.DEPTH_GET,        (_e, symbol)    => engine.getDepth(symbol as string | undefined))
  ipcMain.handle(IPC.DEPTH_SUBSCRIBE,  (_e, symbol)    => { engine.subscribeDepth(symbol as string); return { ok: true } })

  // ── Window controls ──────────────────────────────────────────────────────────
  ipcMain.handle(IPC.WINDOW_TOGGLE_FULLSCREEN, () => {
    if (mainWindow) mainWindow.setFullScreen(!mainWindow.isFullScreen())
  })
  ipcMain.handle(IPC.WINDOW_TOGGLE_DEVTOOLS, () => {
    mainWindow?.webContents.toggleDevTools()
  })
  ipcMain.handle(IPC.WINDOW_SET_ZOOM, (_e, factor: number) => {
    mainWindow?.webContents.setZoomFactor(Math.max(0.5, Math.min(2.0, factor)))
  })
  ipcMain.handle(IPC.WINDOW_GET_ZOOM, () => mainWindow?.webContents.getZoomFactor() ?? 1.0)

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
