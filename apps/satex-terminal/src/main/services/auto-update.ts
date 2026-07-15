/**
 * SATEX — Auto-Update Service (S1-9)
 * Monitors for new releases on GitHub Releases and notifies the renderer.
 * Requires signed installers (CSC_LINK + CSC_KEY_PASSWORD env vars) to work.
 * While unsigned, the service logs checks but won't install.
 */
import { BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { IPC } from '@shared/ipc-channels'
import { createLogger } from './logger'

const log = createLogger('auto-update')

export class AutoUpdateService {
  private mainWindow: BrowserWindow | null = null
  private checkIntervalId: NodeJS.Timeout | null = null
  // 24 hours in milliseconds
  private readonly CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000

  constructor() {
    // electron-updater's Logger type wants info/warn/error/debug — the rotating
    // file-sink logger satisfies that contract structurally. Cast through unknown
    // because the package's exported Logger interface is positional, not nominal.
    autoUpdater.logger = log as unknown as typeof autoUpdater.logger
    autoUpdater.allowDowngrade = false
    // Safety policy: never auto-download (the renderer toast is the consent
    // surface) and never silently install on app quit. The toast button is
    // the only path that calls quitAndInstall(). Without these flags, a user
    // who downloads a buggy update could see it auto-applied on next launch
    // before they realize what happened — and an unsigned build would still
    // trigger the download attempt only to fail signature verification.
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false
    // Point to GitHub Releases for satex25/SATEX-terminal (canonical name
    // since the 2026-07 rename). The update feed is supply-chain-critical:
    // never rely on GitHub's old-name redirect here.
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'satex25',
      repo: 'SATEX-terminal',
    })
  }

  /**
   * Initialize auto-update checks. Called after the BrowserWindow is created.
   * Starts with an immediate check, then checks every 24 hours.
   */
  setWindow(window: BrowserWindow): void {
    this.mainWindow = window
    this.setupListeners()
    this.scheduleChecks()
  }

  private setupListeners(): void {
    autoUpdater.on('update-available', (info) => {
      const version = String(info?.version ?? '')
      log.info('update available', { version })
      // Renderer toast appears immediately so the user knows an update is
      // pending. `downloaded: false` keeps the [Restart Now] button disabled
      // until the binary actually lands. autoDownload=false means electron-
      // updater won't fetch on its own — we kick off the download here so the
      // user doesn't have to wait when they eventually click the toast.
      this.broadcastUpdateStatus({ available: true, version, downloaded: false })
      autoUpdater.downloadUpdate().catch((err) => {
        log.debug('downloadUpdate failed', { err: String(err) })
      })
    })

    autoUpdater.on('update-not-available', () => {
      log.debug('no update available')
      this.broadcastUpdateStatus({ available: false, downloaded: false })
    })

    autoUpdater.on('update-downloaded', (info) => {
      const version = String(info?.version ?? '')
      log.info('update downloaded, ready to install', { version })
      // Flip downloaded:true so the renderer enables the [Restart Now] button.
      this.broadcastUpdateStatus({ available: true, version, downloaded: true })
    })

    autoUpdater.on('error', (err) => {
      // Expected on unsigned builds — electron-updater can't verify signatures.
      // Log at debug level to avoid noise during development.
      log.debug('auto-update check failed', {
        message: err.message,
        hint: 'unsigned build — signature verification unavailable',
      })
    })
  }

  private scheduleChecks(): void {
    // Immediate check on startup (best-effort, don't block startup)
    log.info('starting auto-update checks (24h cadence)')
    this.checkForUpdates().catch((err) => {
      log.debug('initial update check failed', { err: String(err) })
    })

    // Schedule periodic checks every 24 hours
    this.checkIntervalId = setInterval(() => {
      this.checkForUpdates().catch((err) => {
        log.debug('periodic update check failed', { err: String(err) })
      })
    }, this.CHECK_INTERVAL_MS)
    this.checkIntervalId.unref() // Don't keep the process alive
  }

  private async checkForUpdates(): Promise<void> {
    // electron-updater throws on network errors / invalid feed. Callers wrap
    // this in `.catch(...)` so the rejection never propagates past the
    // scheduler's interval handler — checking for updates must never crash
    // the trading process.
    await autoUpdater.checkForUpdates()
  }

  private broadcastUpdateStatus(status: { available: boolean; version?: string; downloaded: boolean }): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(IPC.UPDATE_AVAILABLE, status)
    }
  }

  /**
   * Called when the user accepts the update prompt. Quits the app and installs
   * the downloaded update. Requires electron-updater to have already downloaded
   * the update (update-downloaded event fired).
   */
  quitAndInstall(): void {
    log.info('quitting to install update')
    autoUpdater.quitAndInstall(false, true)
  }

  /**
   * Cleanup on app shutdown.
   */
  shutdown(): void {
    if (this.checkIntervalId) {
      clearInterval(this.checkIntervalId)
      this.checkIntervalId = null
    }
    this.mainWindow = null
  }
}
