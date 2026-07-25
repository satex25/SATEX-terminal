/**
 * RS-1.3 slice 2 — sandbox isolation contract.
 *
 * These tests pin the three properties that make a golden capture hermetic:
 * every path the engine can reach lands inside a scratch tree, the environment
 * the engine reads is pinned to fixed values and restored afterwards, and the
 * network is closed with an audit trail rather than left to chance.
 *
 * The network case is not hypothetical. A spike run of the real engine under
 * this harness recorded `edgar poll failed — TypeError: fetch failed`: the
 * EDGAR service's 10-second boot timer fires inside any replay longer than ten
 * virtual seconds and reaches for `https://www.sec.gov`. That poll only failed
 * because the machine happened to have no route at that instant. On a
 * connected machine it would have injected live SEC filings — wall-clock
 * dependent, unreproducible — straight into the decision stream.
 */
import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { createSandbox, pinEnv, blockNetwork, ORACLE_ENV } from './sandbox'

const cleanups: Array<() => void> = []
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.()
})

describe('createSandbox', () => {
  it('creates an isolated root that carries the vault marker', () => {
    const sb = createSandbox()
    cleanups.push(() => sb.dispose())
    expect(fs.existsSync(sb.root)).toBe(true)
    // `resolveVaultRoot()` walks up from app.getAppPath() looking for
    // `.obsidian/` and checks the start directory first. Planting the marker
    // in the sandbox root means the engine's vault writer resolves here and
    // can never climb out into the operator's real vault.
    expect(fs.existsSync(path.join(sb.root, '.obsidian'))).toBe(true)
  })

  it('maps every electron path name to a created directory inside the root', () => {
    const sb = createSandbox()
    cleanups.push(() => sb.dispose())
    for (const name of ['userData', 'downloads', 'home', 'temp', 'logs', 'appData']) {
      const p = sb.path(name)
      expect(fs.existsSync(p)).toBe(true)
      expect(path.relative(sb.root, p).startsWith('..')).toBe(false)
    }
  })

  it('returns the same directory for repeated lookups of one name', () => {
    const sb = createSandbox()
    cleanups.push(() => sb.dispose())
    expect(sb.path('userData')).toBe(sb.path('userData'))
  })

  it('gives each sandbox a distinct root so parallel captures cannot collide', () => {
    const a = createSandbox()
    const b = createSandbox()
    cleanups.push(() => { a.dispose(); b.dispose() })
    expect(a.root).not.toBe(b.root)
  })

  it('removes the whole tree on dispose', () => {
    const sb = createSandbox()
    const root = sb.root
    fs.writeFileSync(path.join(sb.path('userData'), 'satex.db'), 'x')
    sb.dispose()
    expect(fs.existsSync(root)).toBe(false)
  })

  it('tolerates a second dispose', () => {
    const sb = createSandbox()
    sb.dispose()
    expect(() => sb.dispose()).not.toThrow()
  })
})

describe('pinEnv', () => {
  const TOUCHED = ['SATEX_USE_SIMULATOR', 'SATEX_RNG_SEED', 'SATEX_LOG_LEVEL', 'ALPACA_KEY_ID', 'ALPACA_SECRET_KEY']

  it('forces the engine into seeded simulator mode with no broker credentials', () => {
    const pin = pinEnv()
    cleanups.push(() => pin.restore())
    expect(process.env['SATEX_USE_SIMULATOR']).toBe('true')
    expect(process.env['SATEX_RNG_SEED']).toBe(String(ORACLE_ENV.rngSeed))
    // Credentials present would flip the engine to LiveMarket and make the
    // capture depend on a broker socket — the opposite of an oracle.
    expect(process.env['ALPACA_KEY_ID']).toBeUndefined()
    expect(process.env['ALPACA_SECRET_KEY']).toBeUndefined()
  })

  it('restores a previously set variable to its exact prior value', () => {
    process.env['ALPACA_KEY_ID'] = 'operator-key'
    const pin = pinEnv()
    expect(process.env['ALPACA_KEY_ID']).toBeUndefined()
    pin.restore()
    expect(process.env['ALPACA_KEY_ID']).toBe('operator-key')
    delete process.env['ALPACA_KEY_ID']
  })

  it('leaves a previously unset variable unset after restore', () => {
    for (const k of TOUCHED) delete process.env[k]
    const pin = pinEnv()
    pin.restore()
    for (const k of TOUCHED) expect(process.env[k]).toBeUndefined()
  })

  it('accepts an explicit seed override', () => {
    const pin = pinEnv({ rngSeed: 777 })
    cleanups.push(() => pin.restore())
    expect(process.env['SATEX_RNG_SEED']).toBe('777')
  })
})

describe('blockNetwork', () => {
  it('rejects a fetch instead of letting it reach the wire', async () => {
    const net = blockNetwork()
    cleanups.push(() => net.restore())
    await expect(fetch('https://www.sec.gov/files/company_tickers.json')).rejects.toThrow(/oracle sandbox/i)
  })

  it('records every blocked attempt so the capture can attest to it', async () => {
    const net = blockNetwork()
    cleanups.push(() => net.restore())
    await fetch('https://data.sec.gov/submissions/CIK0000320193.json').catch(() => {})
    await fetch(new URL('https://paper-api.alpaca.markets/v2/account')).catch(() => {})
    expect(net.attempts).toEqual([
      'https://data.sec.gov/submissions/CIK0000320193.json',
      'https://paper-api.alpaca.markets/v2/account',
    ])
  })

  it('puts the original fetch back on restore', () => {
    const original = globalThis.fetch
    const net = blockNetwork()
    expect(globalThis.fetch).not.toBe(original)
    net.restore()
    expect(globalThis.fetch).toBe(original)
  })
})
