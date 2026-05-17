/**
 * SATEX — Encrypted credential store.
 * Uses Electron safeStorage (OS keychain on macOS/Windows, libsecret on Linux).
 *
 * Hard fail (adversarial finding C7, 2026-05-16): if `safeStorage` reports
 * encryption unavailable we REFUSE both read and write. Previously the store
 * fell back to a plaintext JSON file with only a log warning, which meant a
 * broken DPAPI / corrupted user profile silently wrote live API keys to disk
 * in cleartext. The new behavior surfaces the error to the renderer (set
 * returns `{ ok:false, reason:'…' }`; reads return null and force re-entry).
 * The user re-enters credentials, the OS keychain issue gets diagnosed, no
 * key ever lands on disk unencrypted.
 *
 * Dual storage (added 2026-05-13): one slot per mode. Both paper and live
 * keypairs can be configured side-by-side; the active endpoint is chosen by
 * alpaca-mode.ts. Old single-slot files are auto-migrated into the paper slot
 * on first read.
 */
import { app, safeStorage } from 'electron'
import fs from 'fs'
import path from 'path'
import { ALPACA_PAPER_HOST } from '@shared/constants'
import type { AccountMode, CredentialsMaskedStatus, CredentialsSetRequest } from '@shared/types'
import { createLogger } from './logger'

const log = createLogger('credentials')

interface KeyPair { keyId: string; secretKey: string }
interface Stored {
  feed: 'iex' | 'sip'
  paper?: KeyPair
  live?:  KeyPair
}
type LegacyStored = { keyId: string; secretKey: string; feed: 'iex' | 'sip' }

interface StoredBaidu { key: string }

function file(name: string): string { return path.join(app.getPath('userData'), name) }

export class SecureStorageUnavailableError extends Error {
  constructor() {
    super('OS secure-storage (safeStorage) is unavailable on this system — credentials cannot be stored or read securely.')
    this.name = 'SecureStorageUnavailableError'
  }
}

function readEncrypted<T>(p: string): T | null {
  if (!fs.existsSync(p)) return null
  // Refuse to read if safeStorage is unavailable. A file on disk written
  // by a prior session would have been encrypted — we can't decrypt without
  // safeStorage anyway. The defensive read here also rejects any plaintext
  // file an attacker may have planted in userData.
  if (!safeStorage.isEncryptionAvailable()) {
    log.error('safeStorage unavailable — refusing to read credentials', { path: p })
    return null
  }
  try {
    const raw = fs.readFileSync(p)
    const json = safeStorage.decryptString(raw)
    return JSON.parse(json) as T
  } catch (err) {
    log.error('failed to read credentials', { path: p, err: String(err) })
    return null
  }
}

function writeEncrypted(p: string, data: unknown): void {
  if (!safeStorage.isEncryptionAvailable()) {
    // Hard fail — caller must surface this to the user. Previously the
    // function silently wrote a plaintext JSON file with API keys.
    log.error('safeStorage unavailable — refusing to write credentials', { path: p })
    throw new SecureStorageUnavailableError()
  }
  const json = JSON.stringify(data)
  fs.writeFileSync(p, safeStorage.encryptString(json))
}

// ── Alpaca ────────────────────────────────────────────────────────────────
const ALPACA_FILE = 'alpaca-creds.bin'

/** Detect + migrate legacy single-keypair format into dual-slot shape. */
function loadStored(): Stored | null {
  const raw = readEncrypted<Stored | LegacyStored>(file(ALPACA_FILE))
  if (!raw) return null
  // Legacy format had `keyId`/`secretKey` at top level. Promote into paper slot.
  if (typeof (raw as LegacyStored).keyId === 'string'
      && typeof (raw as LegacyStored).secretKey === 'string'
      && (raw as Stored).paper === undefined
      && (raw as Stored).live === undefined) {
    const legacy = raw as LegacyStored
    const migrated: Stored = { feed: legacy.feed, paper: { keyId: legacy.keyId, secretKey: legacy.secretKey } }
    log.warn('migrating legacy single-keypair credential file → paper slot')
    try {
      writeEncrypted(file(ALPACA_FILE), migrated)
    } catch (e) {
      // SecureStorageUnavailableError or fs failure. Return the in-memory
      // migrated shape so this session still works; persistence retries
      // next session when the user re-saves.
      log.warn('legacy credential migration could not persist', { err: String(e) })
    }
    return migrated
  }
  return raw as Stored
}

/**
 * Resolve a keypair for a given mode. Returns null if that slot is empty.
 * The shape mirrors the legacy return type ({keyId, secretKey, feed}) so
 * callers don't need to know about the dual-slot internal structure.
 */
export function getAlpacaCreds(mode: AccountMode = 'paper'): (KeyPair & { feed: 'iex' | 'sip' }) | null {
  const stored = loadStored()
  if (!stored) return null
  const slot = mode === 'live' ? stored.live : stored.paper
  if (!slot) return null
  return { keyId: slot.keyId, secretKey: slot.secretKey, feed: stored.feed }
}

export function setAlpacaCreds(req: CredentialsSetRequest): { ok: boolean; reason?: string } {
  const mode: AccountMode = req.mode ?? 'paper'
  const existing = loadStored() ?? { feed: req.feed }
  // Allow updating just the feed on an existing slot — don't require keys.
  const existingSlot = mode === 'live' ? existing.live : existing.paper
  const keyId     = req.keyId.trim()     || existingSlot?.keyId     || ''
  const secretKey = req.secretKey.trim() || existingSlot?.secretKey || ''
  if (!keyId || !secretKey) return { ok: false, reason: 'Both key ID and secret are required.' }
  const next: Stored = { ...existing, feed: req.feed }
  if (mode === 'live') next.live  = { keyId, secretKey }
  else                 next.paper = { keyId, secretKey }
  try {
    writeEncrypted(file(ALPACA_FILE), next)
  } catch (e) {
    if (e instanceof SecureStorageUnavailableError) {
      return { ok: false, reason: 'OS secure-storage unavailable — credentials cannot be saved on this system. Check that your OS keychain (Keychain on macOS, DPAPI on Windows, libsecret on Linux) is functional, then retry.' }
    }
    log.error('alpaca credentials write failed', { err: String(e) })
    return { ok: false, reason: `Failed to save credentials: ${String(e)}` }
  }
  log.info('alpaca credentials saved', { mode, feed: req.feed, keyIdLen: keyId.length })
  return { ok: true }
}

/** Clear a specific slot, or both slots if mode is omitted. */
export function clearAlpacaCreds(mode?: AccountMode): void {
  if (!mode) {
    try { fs.rmSync(file(ALPACA_FILE), { force: true }); log.info('alpaca credentials cleared (all)') }
    catch (e) { log.warn('clear failed', { err: String(e) }) }
    return
  }
  const stored = loadStored()
  if (!stored) return
  const next: Stored = { feed: stored.feed }
  if (mode === 'live') { if (stored.paper) next.paper = stored.paper }
  else                 { if (stored.live)  next.live  = stored.live  }
  if (next.paper || next.live) writeEncrypted(file(ALPACA_FILE), next)
  else { try { fs.rmSync(file(ALPACA_FILE), { force: true }) } catch { /* ignore */ } }
  log.info('alpaca credentials cleared', { mode })
}

function maskKeyId(keyId: string | undefined): string {
  if (!keyId) return ''
  return keyId.length > 8 ? `${keyId.slice(0, 4)}…${keyId.slice(-4)}` : '••••'
}

export function getAlpacaCredsMasked(): CredentialsMaskedStatus {
  const stored = loadStored()
  const endpoint = `https://${ALPACA_PAPER_HOST}`
  if (!stored) {
    return { paperConfigured: false, liveConfigured: false, feed: 'iex', endpoint, paperKeyIdMasked: '', liveKeyIdMasked: '' }
  }
  return {
    paperConfigured: !!stored.paper,
    liveConfigured:  !!stored.live,
    feed: stored.feed,
    endpoint,
    paperKeyIdMasked: maskKeyId(stored.paper?.keyId),
    liveKeyIdMasked:  maskKeyId(stored.live?.keyId),
  }
}

// ── Baidu AI Studio (ERNIE 5.1) ───────────────────────────────────────────
const BAIDU_FILE = 'baidu-aistudio-key.bin'

export function getBaiduKey(): string | null {
  return readEncrypted<StoredBaidu>(file(BAIDU_FILE))?.key ?? null
}

export function setBaiduKey(key: string): { ok: boolean; reason?: string } {
  const k = key.trim()
  if (k.length < 20) return { ok: false, reason: 'Access token looks too short — paste the full AI Studio token.' }
  try {
    writeEncrypted(file(BAIDU_FILE), { key: k })
  } catch (e) {
    if (e instanceof SecureStorageUnavailableError) {
      return { ok: false, reason: 'OS secure-storage unavailable — token cannot be saved on this system. Check your OS keychain, then retry.' }
    }
    log.error('baidu key write failed', { err: String(e) })
    return { ok: false, reason: `Failed to save token: ${String(e)}` }
  }
  log.info('baidu ai-studio key saved')
  return { ok: true }
}

export function getBaiduMasked(): { configured: boolean } {
  return { configured: !!getBaiduKey() }
}
