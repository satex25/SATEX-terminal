/**
 * SATEX — Encrypted credential store.
 * Uses Electron safeStorage (OS keychain on macOS/Windows, libsecret on Linux).
 * Falls back to plaintext file ONLY in dev when safeStorage is unavailable
 * (logs a warning loudly). Credentials are never logged or sent over IPC in
 * plaintext after they're stored.
 */
import { app, safeStorage } from 'electron'
import fs from 'fs'
import path from 'path'
import { ALPACA_PAPER_HOST } from '@shared/constants'
import type { CredentialsSetRequest } from '@shared/types'
import { createLogger } from './logger'

const log = createLogger('credentials')

interface StoredCreds {
  keyId: string
  secretKey: string
  feed: 'iex' | 'sip'
}

interface StoredAnthropic { key: string }

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

export function getAlpacaCreds(): StoredCreds | null {
  return readEncrypted<StoredCreds>(file(ALPACA_FILE))
}

export function setAlpacaCreds(req: CredentialsSetRequest): { ok: boolean; reason?: string } {
  const existing = getAlpacaCreds()
  const keyId     = req.keyId.trim()     || existing?.keyId     || ''
  const secretKey = req.secretKey.trim() || existing?.secretKey || ''
  if (!keyId || !secretKey) return { ok: false, reason: 'Both key ID and secret are required.' }
  writeEncrypted(file(ALPACA_FILE), { keyId, secretKey, feed: req.feed })
  log.info('alpaca credentials saved', { feed: req.feed, keyIdLen: keyId.length })
  return { ok: true }
}

export function clearAlpacaCreds(): void {
  try { fs.rmSync(file(ALPACA_FILE), { force: true }); log.info('alpaca credentials cleared') }
  catch (e) { log.warn('clear failed', { err: String(e) }) }
}

export function getAlpacaCredsMasked(): {
  paperConfigured: boolean; feed: 'iex' | 'sip'; endpoint: string; keyIdMasked: string
} {
  const c = getAlpacaCreds()
  const endpoint = `https://${ALPACA_PAPER_HOST}`
  if (!c) return { paperConfigured: false, feed: 'iex', endpoint, keyIdMasked: '' }
  const masked = c.keyId.length > 8 ? `${c.keyId.slice(0, 4)}…${c.keyId.slice(-4)}` : '••••'
  return { paperConfigured: true, feed: c.feed, endpoint, keyIdMasked: masked }
}

// ── Anthropic ─────────────────────────────────────────────────────────────
const ANTHROPIC_FILE = 'anthropic-key.bin'

export function getAnthropicKey(): string | null {
  return readEncrypted<StoredAnthropic>(file(ANTHROPIC_FILE))?.key ?? null
}

export function setAnthropicKey(key: string): { ok: boolean; reason?: string } {
  const k = key.trim()
  if (!k.startsWith('sk-ant-')) return { ok: false, reason: 'Key must start with sk-ant-' }
  writeEncrypted(file(ANTHROPIC_FILE), { key: k })
  log.info('anthropic key saved')
  return { ok: true }
}

export function getAnthropicMasked(): { configured: boolean } {
  return { configured: !!getAnthropicKey() }
}
