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

/**
 * Atomic JSON write — write payload to a tmp sibling of `finalPath`, then
 * rename onto the canonical name. On the same filesystem `rename` is atomic:
 * a reader either sees the previous file or the new one in full, never a
 * truncated half. Pulled out as an exported helper so a process-kill regression
 * test can exercise it directly without mocking electron's `app.getPath`.
 *
 * Why this matters for the kill switch: pre-fix v0.4.3 used a bare
 * `writeFileSync(FILE(), …)` which truncates first, then writes. A crash
 * after truncate-before-write leaves a 0-byte file → next boot's
 * `loadKillSwitchState` lands on the JSON.parse catch and returns
 * `{ armed: false }`. An armed kill switch (e.g. from a daily-loss auto-arm)
 * silently disappears across the crash. Atomic rename closes that hole.
 *
 * Returns true on success, false on any I/O failure (original file untouched).
 * Failure path also unlinks the dangling tmp so disk doesn't accumulate
 * orphans across long sessions of repeated writes.
 */
export function writeJsonAtomic(finalPath: string, data: string): boolean {
  // High-entropy suffix avoids collisions if two saves arrive in the same ms
  // (theoretical, but free defense — `Date.now()` alone could collide under
  // an automated test or a tight save loop).
  const tmpPath = `${finalPath}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  try {
    fs.writeFileSync(tmpPath, data, 'utf8')
    fs.renameSync(tmpPath, finalPath)
    return true
  } catch (e) {
    log.error('atomic write failed', { err: String(e), path: finalPath })
    try { fs.unlinkSync(tmpPath) } catch { /* tmp may not exist if writeFileSync threw */ }
    return false
  }
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
  writeJsonAtomic(FILE(), JSON.stringify(next, null, 2))
}
