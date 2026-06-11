/**
 * SATEX — Self-eval toggle persistence.
 * Mirrors the alpaca-mode.ts pattern: one tiny JSON in userData, defaulting
 * to ENABLED (the nightly study is the learning loop's heartbeat — opting
 * out is the explicit action, not opting in).
 */
import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { createLogger } from './logger'

const log = createLogger('self-eval-store')

interface Stored { enabled: boolean; updatedAt: number }

const FILE = () => path.join(app.getPath('userData'), 'self-eval.json')

function load(): Stored {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE(), 'utf8')) as Stored
    return { enabled: parsed.enabled !== false, updatedAt: parsed.updatedAt || 0 }
  } catch { return { enabled: true, updatedAt: 0 } }
}

let state: Stored = load()

export function getSelfEvalEnabled(): boolean { return state.enabled }

export function setSelfEvalEnabled(enabled: boolean): void {
  state = { enabled, updatedAt: Date.now() }
  try { fs.writeFileSync(FILE(), JSON.stringify(state, null, 2), 'utf8') }
  catch (e) { log.error('save failed', { err: String(e) }) }
  log.info('self-eval toggle persisted', { enabled })
}
