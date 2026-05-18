/**
 * SATEX — Kill-switch persistence.
 *
 * Persists the armed flag across restarts so an app crash (or deliberate
 * shutdown) after a daily-loss auto-arm cannot circumvent the kill switch
 * by way of a fresh boot. Policy (2026-05-18): armed state survives every
 * restart and only explicit user disarm (or daily-loss auto-arm flipping
 * to a manual disarm with the native dialog) clears it.
 *
 * Sibling of live-mode.ts / alpaca-mode.ts — same file-in-userData pattern.
 * Default on missing/corrupt file is disarmed (safe: prevents nothing).
 */
import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { createLogger } from './logger'

const log = createLogger('kill-switch-store')

const FILE = () => path.join(app.getPath('userData'), 'kill-switch.json')

export interface KillSwitchState {
  armed:     boolean
  reason:    string
  armedAt:   number
  updatedAt: number
}

const DEFAULT: KillSwitchState = { armed: false, reason: '', armedAt: 0, updatedAt: 0 }

export function loadKillSwitchState(): KillSwitchState {
  try {
    const raw = fs.readFileSync(FILE(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<KillSwitchState>
    return {
      armed:     !!parsed.armed,
      reason:    typeof parsed.reason === 'string' ? parsed.reason : '',
      armedAt:   typeof parsed.armedAt === 'number' ? parsed.armedAt : 0,
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
    }
  } catch { return { ...DEFAULT } }
}

export function saveKillSwitchState(armed: boolean, reason: string): void {
  const prev = loadKillSwitchState()
  const now = Date.now()
  const next: KillSwitchState = {
    armed,
    reason: armed ? reason : '',
    armedAt: armed ? (prev.armed ? prev.armedAt : now) : 0,
    updatedAt: now,
  }
  try { fs.writeFileSync(FILE(), JSON.stringify(next, null, 2), 'utf8') }
  catch (e) { log.error('save failed', { err: String(e), armed, reason }) }
}
