/**
 * Characterization coverage for the Auto-Update service (P-091).
 *
 * This file locks in two things a future edit must never silently break:
 *   1. The SAFETY POLICY — never auto-download, never auto-install on quit,
 *      never allow a downgrade. A flip of any of these flags to `true` would
 *      let a buggy or unsigned build apply itself without operator consent.
 *   2. The TEARDOWN INVARIANT — `shutdown()` clears the 24h check interval
 *      (the repo's most recidivist defect class: PR #6 / P-041 / P-043 / P-046).
 *
 * It is also the repository's first `vi.mock('electron' / 'electron-updater')`
 * harness. `autoUpdater` is a module singleton assigned/subscribed in the
 * constructor, so it cannot be dependency-injected — it is mocked at the module
 * boundary. `BrowserWindow` is imported only as a value for its type; a stub
 * class satisfies the runtime import. Module mocks are file-scoped in vitest,
 * so sibling suites are unaffected.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { IPC } from '@shared/ipc-channels'

// vi.mock factories are hoisted above imports and may not close over
// un-hoisted module-scope bindings — so the mock singleton + the captured
// event-handler registry live in a vi.hoisted block.
const { mockAutoUpdater, handlers } = vi.hoisted(() => {
  const handlers: Record<string, (arg?: unknown) => void> = {}
  const mockAutoUpdater = {
    logger: undefined as unknown,
    allowDowngrade: undefined as unknown,
    autoDownload: undefined as unknown,
    autoInstallOnAppQuit: undefined as unknown,
    setFeedURL: vi.fn(),
    on: vi.fn((event: string, cb: (arg?: unknown) => void) => {
      handlers[event] = cb
    }),
    downloadUpdate: vi.fn(() => Promise.resolve()),
    checkForUpdates: vi.fn(() => Promise.resolve()),
    quitAndInstall: vi.fn(),
  }
  return { mockAutoUpdater, handlers }
})

vi.mock('electron-updater', () => ({ autoUpdater: mockAutoUpdater }))
vi.mock('electron', () => ({ BrowserWindow: class {} }))

// Imported AFTER the mocks are declared so the constructor sees the stub.
import { AutoUpdateService } from './auto-update'
import type { BrowserWindow } from 'electron'

const DAY_MS = 24 * 60 * 60 * 1000

type FakeWin = BrowserWindow & { webContents: { send: ReturnType<typeof vi.fn> } }

function fakeWindow(destroyed = false): FakeWin {
  return {
    isDestroyed: () => destroyed,
    webContents: { send: vi.fn() },
  } as unknown as FakeWin
}

beforeEach(() => {
  vi.clearAllMocks()
  for (const k of Object.keys(handlers)) delete handlers[k]
  mockAutoUpdater.logger = undefined
  mockAutoUpdater.allowDowngrade = undefined
  mockAutoUpdater.autoDownload = undefined
  mockAutoUpdater.autoInstallOnAppQuit = undefined
})

afterEach(() => {
  vi.useRealTimers()
})

describe('AutoUpdateService — constructor safety policy', () => {
  it('never allows downgrade, auto-download, or auto-install on quit', () => {
    new AutoUpdateService()
    expect(mockAutoUpdater.allowDowngrade).toBe(false)
    expect(mockAutoUpdater.autoDownload).toBe(false)
    expect(mockAutoUpdater.autoInstallOnAppQuit).toBe(false)
  })

  it('points the feed at the satex25/satex-trading GitHub releases', () => {
    new AutoUpdateService()
    expect(mockAutoUpdater.setFeedURL).toHaveBeenCalledWith({
      provider: 'github',
      owner: 'satex25',
      repo: 'satex-trading',
    })
  })

  it('installs a logger sink on the updater', () => {
    new AutoUpdateService()
    expect(mockAutoUpdater.logger).toBeDefined()
  })
})

describe('AutoUpdateService — setWindow scheduling', () => {
  it('registers all four update lifecycle handlers', () => {
    const svc = new AutoUpdateService()
    svc.setWindow(fakeWindow())
    expect(handlers['update-available']).toBeTypeOf('function')
    expect(handlers['update-not-available']).toBeTypeOf('function')
    expect(handlers['update-downloaded']).toBeTypeOf('function')
    expect(handlers['error']).toBeTypeOf('function')
  })

  it('fires an immediate check on setWindow, then again every 24h', () => {
    vi.useFakeTimers()
    const svc = new AutoUpdateService()
    svc.setWindow(fakeWindow())
    expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(DAY_MS)
    expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalledTimes(2)
  })
})

describe('AutoUpdateService — event handler broadcasts', () => {
  it('update-available broadcasts pending status AND kicks off the download', () => {
    const svc = new AutoUpdateService()
    const win = fakeWindow()
    svc.setWindow(win)
    handlers['update-available']({ version: '9.9.9' })
    expect(win.webContents.send).toHaveBeenCalledWith(IPC.UPDATE_AVAILABLE, {
      available: true,
      version: '9.9.9',
      downloaded: false,
    })
    expect(mockAutoUpdater.downloadUpdate).toHaveBeenCalledTimes(1)
  })

  it('update-available with no info coerces version to empty string', () => {
    const svc = new AutoUpdateService()
    const win = fakeWindow()
    svc.setWindow(win)
    handlers['update-available'](undefined)
    expect(win.webContents.send).toHaveBeenCalledWith(IPC.UPDATE_AVAILABLE, {
      available: true,
      version: '',
      downloaded: false,
    })
  })

  it('update-not-available broadcasts the no-update status', () => {
    const svc = new AutoUpdateService()
    const win = fakeWindow()
    svc.setWindow(win)
    handlers['update-not-available']()
    expect(win.webContents.send).toHaveBeenCalledWith(IPC.UPDATE_AVAILABLE, {
      available: false,
      downloaded: false,
    })
  })

  it('update-downloaded flips downloaded:true so the renderer enables Restart', () => {
    const svc = new AutoUpdateService()
    const win = fakeWindow()
    svc.setWindow(win)
    handlers['update-downloaded']({ version: '9.9.9' })
    expect(win.webContents.send).toHaveBeenCalledWith(IPC.UPDATE_AVAILABLE, {
      available: true,
      version: '9.9.9',
      downloaded: true,
    })
  })

  it('error handler swallows to debug — never throws into the process', () => {
    const svc = new AutoUpdateService()
    svc.setWindow(fakeWindow())
    expect(() => handlers['error'](new Error('unsigned build'))).not.toThrow()
  })
})

describe('AutoUpdateService — window guards', () => {
  it('does not send to a destroyed window', () => {
    const svc = new AutoUpdateService()
    const win = fakeWindow(true)
    svc.setWindow(win)
    handlers['update-not-available']()
    expect(win.webContents.send).not.toHaveBeenCalled()
  })
})

describe('AutoUpdateService — install + teardown', () => {
  it('quitAndInstall installs without silent-quit, forcing a run after install', () => {
    const svc = new AutoUpdateService()
    svc.quitAndInstall()
    expect(mockAutoUpdater.quitAndInstall).toHaveBeenCalledWith(false, true)
  })

  it('shutdown clears the 24h interval so no further checks fire', () => {
    vi.useFakeTimers()
    const svc = new AutoUpdateService()
    svc.setWindow(fakeWindow())
    expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalledTimes(1)
    svc.shutdown()
    vi.advanceTimersByTime(DAY_MS * 3)
    expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalledTimes(1)
  })

  it('shutdown is idempotent', () => {
    const svc = new AutoUpdateService()
    svc.setWindow(fakeWindow())
    expect(() => {
      svc.shutdown()
      svc.shutdown()
    }).not.toThrow()
  })
})
