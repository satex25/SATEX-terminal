/**
 * RS-1.3 slice 2 — electron stub contract.
 *
 * The engine reaches electron for four things that matter to a capture: where
 * to put files, whether secrets can be decrypted, when the machine sleeps, and
 * whether a human authorized real-capital trading. The stub answers all four
 * without an Electron runtime, and answers the last one with a refusal.
 *
 * The refusal is the point. `index.ts`'s LIVE_MODE_SET handler treats
 * `dialog.showMessageBox` as the only authority that can arm live mode
 * (adversarial finding C6, 2026-05-16 — see ledger P-148): it presents
 * `buttons: ['Cancel', 'I accept real capital']` with `cancelId: 0` and arms
 * only when `response === 1`. A stub that returned 1 would hand the harness
 * the one capability the ceremony exists to withhold. Returning 0 means the
 * capture takes the same branch a human pressing Cancel takes, so "the golden
 * driver cannot arm live mode" is a structural property rather than a promise.
 */
import { describe, it, expect, afterEach } from 'vitest'
import path from 'node:path'
import fs from 'node:fs'
import { createSandbox, type OracleSandbox } from './sandbox'
import { createElectronStub } from './electron-stub'

let sb: OracleSandbox | null = null
afterEach(() => { sb?.dispose(); sb = null })

function stub(): ReturnType<typeof createElectronStub> {
  sb = createSandbox()
  return createElectronStub(sb)
}

describe('app surface', () => {
  it('resolves every path name the engine asks for into the sandbox', () => {
    const { module: el } = stub()
    // Measured by grep over src/main: these are the only four names used.
    for (const name of ['userData', 'downloads', 'home', 'crashDumps']) {
      const p = el.app.getPath(name)
      expect(fs.existsSync(p)).toBe(true)
      expect(path.relative(sb!.root, p).startsWith('..')).toBe(false)
    }
  })

  it('reports the sandbox root as the app path so the vault resolves inside it', () => {
    const { module: el } = stub()
    // resolveVaultRoot() starts its `.obsidian` walk here; the sandbox root
    // carries the marker, so the engine's vault writer stays in the sandbox.
    expect(el.app.getAppPath()).toBe(sb!.root)
  })

  it('presents a fixed name and version so captures do not drift with releases', () => {
    const a = stub()
    const b = stub()
    expect(a.module.app.getVersion()).toBe(b.module.app.getVersion())
    expect(a.module.app.isPackaged).toBe(false)
  })

  it('grants the single-instance lock so a boot path never calls quit', () => {
    const { module: el } = stub()
    expect(el.app.requestSingleInstanceLock()).toBe(true)
  })
})

describe('safeStorage', () => {
  it('reports encryption unavailable so no stored credential can be decrypted', () => {
    const { module: el } = stub()
    // credential-store.ts gates every read on this. False means the capture
    // can never resolve a broker key, so `initialize()` cannot pick LiveMarket.
    expect(el.safeStorage.isEncryptionAvailable()).toBe(false)
  })

  it('refuses to encrypt or decrypt rather than returning a plausible value', () => {
    const { module: el } = stub()
    expect(() => el.safeStorage.encryptString('secret')).toThrow(/oracle stub/i)
    expect(() => el.safeStorage.decryptString(Buffer.from(''))).toThrow(/oracle stub/i)
  })
})

describe('dialog — the live-mode arming ceremony', () => {
  it('answers with the Cancel index, the one response that cannot arm live mode', async () => {
    const { module: el } = stub()
    const res = await el.dialog.showMessageBox({
      type: 'warning',
      buttons: ['Cancel', 'I accept real capital'],
      cancelId: 0,
      message: 'Route orders to real-capital broker?',
    })
    // index.ts arms only on `response === 1`. Anything else is a refusal.
    expect(res.response).toBe(0)
    expect(res.response).not.toBe(1)
  })

  it('records the attempt so a capture can attest that nothing was authorized', async () => {
    const { module: el, journal } = stub()
    await el.dialog.showMessageBox({ message: 'Route orders to real-capital broker?', buttons: ['Cancel', 'OK'] })
    expect(journal.dialogs).toEqual(['Route orders to real-capital broker?'])
  })

  it('refuses the two-argument (parent window) call shape index.ts uses', async () => {
    const { module: el } = stub()
    const res = await el.dialog.showMessageBox({} as never, { message: 'x', buttons: ['Cancel', 'Go'] })
    expect(res.response).toBe(0)
  })
})

describe('shell', () => {
  it('refuses to open an external URL and records the target', async () => {
    const { module: el, journal } = stub()
    await expect(el.shell.openExternal('https://alpaca.markets')).rejects.toThrow(/oracle stub/i)
    expect(journal.externalOpens).toEqual(['https://alpaca.markets'])
  })
})

describe('powerMonitor', () => {
  it('accepts and releases suspend/resume handlers without an OS backend', () => {
    const { module: el, journal } = stub()
    const handler = (): void => {}
    el.powerMonitor.on('suspend', handler)
    el.powerMonitor.on('resume', handler)
    expect(journal.powerMonitorEvents).toEqual(['suspend', 'resume'])
    // shutdown() calls off() for both; it must not throw.
    expect(() => { el.powerMonitor.off('suspend', handler); el.powerMonitor.off('resume', handler) }).not.toThrow()
  })
})

describe('journal', () => {
  it('starts empty so an untouched capture attests to zero interventions', () => {
    const { journal } = stub()
    expect(journal.dialogs).toEqual([])
    expect(journal.externalOpens).toEqual([])
    expect(journal.notifications).toEqual([])
  })
})
