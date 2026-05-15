/**
 * SATEX — Encrypted credential store.
 * Uses Electron safeStorage (OS keychain on macOS/Windows, libsecret on Linux).
 * Falls back to plaintext file ONLY in dev when safeStorage is unavailable
 * (logs a warning loudly). Credentials are never logged or sent over IPC in
 * plaintext after they're stored.
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

function readEncrypted<T>(p: string): T | null {
  if (!fs.existsSync(p)) return null
  try {
    const raw = fs.readFileSync(p)
    if (safeStorage.isEncryptionAvailable()) {
      const json = safeStorage.decryptString(raw)
      return JSON.parse(json) as T
    }
    log.warn('safeStorage unavailable — reading plaintext fallback', { path: p })
    return JSON.parse(raw.toString('utf8')) as T
  } catch (err) {
    log.error('failed to read credentials', { path: p, err: String(err) })
    return null
  }
}

function writeEncrypted(p: string, data: unknown): void {
  const json = JSON.stringify(data)
  if (safeStorage.isEncryptionAvailable()) {
    fs.writeFileSync(p, safeStorage.encryptString(json))
  } else {
    log.warn('safeStorage unavailable — writing plaintext fallback', { path: p })
    fs.writeFileSync(p, json, 'utf8')
  }
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
    writeEncrypted(file(ALPACA_FILE), migrated)
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
  writeEncrypted(file(ALPACA_FILE), next)
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
  writeEncrypted(file(BAIDU_FILE), { key: k })
  log.info('baidu ai-studio key saved')
  return { ok: true }
}

export function getBaiduMasked(): { configured: boolean } {
  return { configured: !!getBaiduKey() }
}
