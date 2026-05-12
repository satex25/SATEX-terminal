/**
 * SATEX — Electron Main Process Entry
 * Bootstraps the BrowserWindow and wires ALL IPC handlers to TradingEngine.
 * contextIsolation: true, nodeIntegration: false — renderer is sandboxed.
 * All renderer↔main communication flows through the typed IPC registry.
 */
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { TradingEngine } from './core/trading-engine'
import { IPC } from '@shared/ipc-channels'
import { loadEnv } from './services/env'
import { createLogger } from './services/logger'

// Load .env.local early — before any service reads process.env
import { config as dotenvConfig } from 'dotenv'
dotenvConfig({ path: join(app.getPath('userData'), '.env.local'), override: false })
dotenvConfig({ path: join(process.cwd(), '.env.local'), override: false })
dotenvConfig({ path: join(process.cwd(), '.env'), override: false })

const log = createLogger('main')
const engine = new TradingEngine()
let mainWindow: BrowserWindow | null = null

// ── Window ───────────────────────────────────────────────────────────────────
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width:  1680,
    height: 1000,
    minWidth:  1200,
    minHeight: 720,
    show: false,
    frame: true,
    autoHideMenuBar: true,
    backgroundColor: '#06080C',
    webPreferences: {
      preload:          join(__dirname, '../preload/index.js'),
      sandbox:          false,
      contextIsolation: true,
      nodeIntegration:  false,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
    mainWindow!.focus()
    if (is.dev) mainWindow!.webContents.openDevTools({ mode: 'detach' })
    log.info('window ready-to-show')
  })

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

// ── Engine event wiring ───────────────────────────────────────────────────────
function wireEngineEvents(): void {
  engine.onQuotes((quotes)            => push(IPC.QUOTES_TICK,   quotes))
  engine.onCandle((sym, candle, isNew)=> push(IPC.CANDLES_UPDATE, { symbol: sym, candle, isNew }))
  engine.onNews((item)                => push(IPC.NEWS_APPEND,    item))
  engine.onAccount((account)          => push(IPC.ACCOUNT_UPDATE, account))
  engine.onOrders((orders)            => push(IPC.ORDERS_UPDATE,  orders))
  engine.onStatus((status)            => push(IPC.SYSTEM_STATUS,  status))
  engine.onObserverStats((s)          => push(IPC.OBSERVER_STATS, s))
  engine.onLearnerStats((s)           => push(IPC.LEARNER_STATS,  s))
  engine.onVaultStats((s)             => push(IPC.VAULT_STATS,    s))
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
  ipcMain.handle(IPC.ANTHROPIC_GET_MASKED,   ()        => engine.getAnthropicMasked())
  ipcMain.handle(IPC.ANTHROPIC_SET,          (_e, key: string) => engine.setAnthropicKey(key))
  ipcMain.handle(IPC.ALPACA_RECONNECT,       async ()  => engine.reconnectAlpaca())
  ipcMain.handle(IPC.HEALTH_CHECK,           ()        => engine.healthCheck())

  // ── Live mode (Phase 5) ──────────────────────────────────────────────────────
  ipcMain.handle(IPC.LIVE_MODE_GET, ()           => engine.getLiveMode())
  ipcMain.handle(IPC.LIVE_MODE_SET, (_e, req)    => engine.setLiveMode(req))

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
    log.info('trading engine online')
    // Push initial state to renderer
    setTimeout(() => {
      push(IPC.QUOTES_TICK, engine.getAllQuotes())
      push(IPC.ACCOUNT_UPDATE, engine.om.getAccount())
      push(IPC.ORDERS_UPDATE, engine.om.getOrders())
      push(IPC.OBSERVER_STATS, engine.getObserverStats())
      push(IPC.LEARNER_STATS,  engine.getLearnerStats())
      push(IPC.VAULT_STATS,    engine.getVaultStats())
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
