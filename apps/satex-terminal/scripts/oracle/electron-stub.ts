/**
 * SATEX-RS oracle — electron stub.
 *
 * RS-UP-1 / RS-1.3 slice 2. `trading-engine.ts` imports `app` and
 * `powerMonitor`; the services under it import `app` and `safeStorage`; the
 * IPC layer adds `dialog`, `shell`, `BrowserWindow`, `Notification` and
 * `ipcMain`. Under vitest none of those exist, so the capture supplies this
 * object through `vi.mock('electron', …)`. The surface is small because it was
 * measured rather than guessed: `app.getPath` is called with exactly four
 * names across `src/main` (`userData` ×14, `downloads` ×2, `home`,
 * `crashDumps`).
 *
 * Two design rules
 * ----------------
 * **Everything that produces a path produces a sandbox path.** A capture must
 * not be able to read the operator's real database or write into their vault,
 * and `getAppPath()` in particular is the root of `resolveVaultRoot()`'s
 * `.obsidian` walk.
 *
 * **Everything that grants a capability refuses.** `dialog.showMessageBox` is
 * the live-mode arming ceremony (adversarial finding C6, 2026-05-16; ledger
 * P-148): `index.ts` presents `['Cancel', 'I accept real capital']` with
 * `cancelId: 0` and arms only when `response === 1`. This stub returns 0 — not
 * a special "harness" code, but the literal answer a human pressing Cancel
 * gives, so the engine takes an ordinary, well-tested refusal branch. The
 * harness therefore cannot arm live mode *by construction*, which is a
 * property of the design rather than a discipline anyone has to maintain.
 * `safeStorage` reports encryption unavailable for the same reason: no stored
 * broker credential can be resolved, so `initialize()` cannot select
 * `LiveMarket` even if the operator has keys saved.
 *
 * Every refusal is recorded in a journal so a capture can *attest* that no
 * dialog was answered and no external URL was opened, rather than merely
 * asserting it.
 */
import fs from 'node:fs'
import path from 'node:path'
import type { OracleSandbox } from './sandbox'

/**
 * Where the stub sends path lookups.
 *
 * A provider is accepted as well as a sandbox because `vi.mock`'s factory runs
 * **once per test file** while each capture needs its own scratch tree. A stub
 * built around a fixed sandbox would keep answering with the first test's
 * (already disposed) directories, so the engine would open its database
 * somewhere the caller is no longer looking — which is precisely the state the
 * importer's P-097 guard exists to catch, and did.
 */
export type SandboxSource = OracleSandbox | (() => OracleSandbox)

/** Everything the stub was asked to do that it declined or absorbed. */
export interface StubJournal {
  /** `message` field of every dialog raised. Non-empty means something tried
   *  to obtain human authorization during a capture. */
  readonly dialogs: readonly string[]
  /** Targets passed to `shell.openExternal`. */
  readonly externalOpens: readonly string[]
  /** Notification titles the engine tried to surface. */
  readonly notifications: readonly string[]
  /** `powerMonitor` events subscribed to, in registration order. */
  readonly powerMonitorEvents: readonly string[]
  /** Clears every list. A file-scoped stub is shared by every test in the
   *  file, so each run resets before it starts attesting to anything. */
  reset(): void
}

/** Shape `vi.mock('electron', …)` returns, plus the audit trail. */
export interface ElectronStub {
  readonly module: ElectronStubModule
  readonly journal: StubJournal
}

/** Minimal structural type for the stubbed electron module. */
export interface ElectronStubModule {
  app: {
    getPath(name: string): string
    getAppPath(): string
    getName(): string
    getVersion(): string
    readonly isPackaged: boolean
    on(): void
    once(): void
    off(): void
    whenReady(): Promise<void>
    quit(): void
    exit(): void
    relaunch(): void
    requestSingleInstanceLock(): boolean
    setAppUserModelId(): void
    commandLine: { appendSwitch(): void }
  }
  powerMonitor: {
    on(event: string, fn: () => void): void
    off(event: string, fn: () => void): void
  }
  safeStorage: {
    isEncryptionAvailable(): boolean
    encryptString(plain: string): Buffer
    decryptString(cipher: Buffer): string
  }
  dialog: {
    showMessageBox(...args: unknown[]): Promise<{ response: number; checkboxChecked: boolean }>
    showErrorBox(): void
  }
  shell: { openExternal(url: string): Promise<void> }
  ipcMain: { handle(): void; on(): void; removeHandler(): void }
  BrowserWindow: new () => Record<string, never>
  Notification: new (opts?: { title?: string }) => { show(): void }
  crashReporter: { start(): void }
}

/**
 * Version reported to the engine. Fixed rather than read from `package.json`
 * so a release bump cannot change captured golden bytes.
 */
const ORACLE_APP_VERSION = '0.0.0-oracle'

/**
 * Builds the stub over a sandbox.
 *
 * The returned `module` is passed straight to `vi.mock('electron', () => …)`;
 * `journal` stays live and can be read after the capture finishes.
 */
export function createElectronStub(sandbox: SandboxSource): ElectronStub {
  const dialogs: string[] = []
  const externalOpens: string[] = []
  const notifications: string[] = []
  const powerMonitorEvents: string[] = []
  // Resolved per call, never captured: see SandboxSource.
  const current = (): OracleSandbox => (typeof sandbox === 'function' ? sandbox() : sandbox)

  const module: ElectronStubModule = {
    app: {
      getPath: (name: string): string => current().path(name),
      getAppPath: (): string => current().root,
      getName: (): string => 'satex-oracle',
      getVersion: (): string => ORACLE_APP_VERSION,
      isPackaged: false,
      on: (): void => {},
      once: (): void => {},
      off: (): void => {},
      whenReady: (): Promise<void> => Promise.resolve(),
      // A capture drives the engine directly and never runs the electron
      // lifecycle, so these are absorbed rather than implemented. Reaching one
      // would mean the harness took an app-lifecycle path it has no business
      // on; absorbing keeps that from taking the test process down with it.
      quit: (): void => {},
      exit: (): void => {},
      relaunch: (): void => {},
      requestSingleInstanceLock: (): boolean => true,
      setAppUserModelId: (): void => {},
      commandLine: { appendSwitch: (): void => {} },
    },

    powerMonitor: {
      on: (event: string): void => { powerMonitorEvents.push(event) },
      // `shutdown()` calls `off` for suspend and resume unconditionally; a
      // throw here would abort teardown midway and leak timers into the next
      // capture, which is exactly the state a determinism proof must not be in.
      off: (): void => {},
    },

    safeStorage: {
      // See module header: the single switch that keeps stored broker
      // credentials unreadable during a capture.
      isEncryptionAvailable: (): boolean => false,
      encryptString: (): Buffer => {
        throw new Error('oracle stub: safeStorage is unavailable during golden capture')
      },
      decryptString: (): string => {
        throw new Error('oracle stub: safeStorage is unavailable during golden capture')
      },
    },

    dialog: {
      // Accepts both call shapes — `showMessageBox(options)` and
      // `showMessageBox(parentWindow, options)` — because index.ts uses the
      // latter. The options object is whichever argument carries `message`.
      showMessageBox: (...args: unknown[]): Promise<{ response: number; checkboxChecked: boolean }> => {
        const options = args.find(
          (a): a is { message?: unknown } =>
            typeof a === 'object' && a !== null && 'message' in a,
        )
        dialogs.push(String(options?.message ?? ''))
        // `cancelId: 0`. See module header — this is the refusal, and it is
        // the same value a human pressing Cancel produces.
        return Promise.resolve({ response: 0, checkboxChecked: false })
      },
      showErrorBox: (): void => {},
    },

    shell: {
      openExternal: (url: string): Promise<void> => {
        externalOpens.push(url)
        return Promise.reject(new Error(`oracle stub: refusing to open external target during golden capture (${url})`))
      },
    },

    ipcMain: { handle: (): void => {}, on: (): void => {}, removeHandler: (): void => {} },

    BrowserWindow: class {} as unknown as new () => Record<string, never>,

    Notification: class {
      constructor(opts?: { title?: string }) { notifications.push(String(opts?.title ?? '')) }
      show(): void {}
    },

    crashReporter: { start: (): void => {} },
  }

  return {
    module,
    journal: {
      dialogs,
      externalOpens,
      notifications,
      powerMonitorEvents,
      reset(): void {
        dialogs.length = 0
        externalOpens.length = 0
        notifications.length = 0
        powerMonitorEvents.length = 0
      },
    },
  }
}

/**
 * Absolute path of the sqlite file a capture writes, for the real-database
 * assertion in the importer. Mirrors `persistence.ts`'s
 * `path.join(app.getPath('userData'), 'satex.db')`.
 */
export function sandboxDbPath(sandbox: OracleSandbox): string {
  return path.join(sandbox.path('userData'), 'satex.db')
}

/** True when a capture's sqlite file exists and holds a real SQLite header. */
export function sqliteFileIsReal(dbFile: string): boolean {
  if (!fs.existsSync(dbFile)) return false
  const fd = fs.openSync(dbFile, 'r')
  try {
    const header = Buffer.alloc(16)
    if (fs.readSync(fd, header, 0, 16, 0) < 16) return false
    return header.toString('utf8', 0, 15) === 'SQLite format 3'
  } finally {
    fs.closeSync(fd)
  }
}
