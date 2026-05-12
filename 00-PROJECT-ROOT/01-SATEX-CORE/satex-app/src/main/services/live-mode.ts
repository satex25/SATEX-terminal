/**
 * SATEX — Live-mode interlock state machine.
 * Persists to userData/live-mode.json. Paper is the default; flipping to live
 * requires typed phrase + notional cap. Order manager enforces the cap when
 * isLive() is true.
 */
import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import type { LiveModeSetRequest, LiveModeStatus } from '@shared/types'
import { ALPACA_PAPER_HOST } from '@shared/constants'
import { createLogger } from './logger'

const log = createLogger('live-mode')
const CONFIRM_PHRASE = 'I ACCEPT REAL CAPITAL'
const FILE = () => path.join(app.getPath('userData'), 'live-mode.json')
const NOTIONAL_HARD_CAP = 50_000

interface Stored { enabled: boolean; notionalCap: number; updatedAt: number }

function load(): Stored {
  try {
    const raw = fs.readFileSync(FILE(), 'utf8')
    const parsed = JSON.parse(raw) as Stored
    return { enabled: !!parsed.enabled, notionalCap: parsed.notionalCap || 500, updatedAt: parsed.updatedAt || 0 }
  } catch { return { enabled: false, notionalCap: 500, updatedAt: 0 } }
}

function save(s: Stored): void {
  try { fs.writeFileSync(FILE(), JSON.stringify(s, null, 2), 'utf8') }
  catch (e) { log.error('save failed', { err: String(e) }) }
}

let state: Stored = load()

export function getLiveModeStatus(baseUrl: string): LiveModeStatus {
  const paperOnly = baseUrl.includes(ALPACA_PAPER_HOST)
  return { enabled: state.enabled && !paperOnly, notionalCap: state.notionalCap, endpoint: baseUrl, paperOnly }
}

export function setLiveMode(req: LiveModeSetRequest, ctx: { killArmed: boolean; equity: number; dailyPnl: number; dailyLossLimitPct: number }): { ok: boolean; reason?: string } {
  // Disabling live mode is always allowed
  if (!req.enabled) {
    state = { ...state, enabled: false, updatedAt: Date.now() }
    save(state)
    log.warn('live mode disabled', {})
    return { ok: true }
  }

  // Enabling live mode requires every interlock
  if (req.confirmPhrase.trim() !== CONFIRM_PHRASE) return { ok: false, reason: 'Confirmation phrase mismatch' }
  if (ctx.killArmed) return { ok: false, reason: 'Kill switch is armed — disarm before enabling live mode' }
  const lossThreshold = -(ctx.equity * ctx.dailyLossLimitPct)
  if (ctx.dailyPnl < lossThreshold) return { ok: false, reason: `Daily loss limit reached (${ctx.dailyPnl.toFixed(2)} < ${lossThreshold.toFixed(2)})` }
  if (req.notionalCap <= 0 || req.notionalCap > NOTIONAL_HARD_CAP) return { ok: false, reason: `Notional cap must be 0 < cap ≤ ${NOTIONAL_HARD_CAP}` }

  state = { enabled: true, notionalCap: req.notionalCap, updatedAt: Date.now() }
  save(state)
  log.warn('LIVE MODE ENABLED', { cap: req.notionalCap })
  return { ok: true }
}

export function isLive(): boolean { return state.enabled }
export function getNotionalCap(): number { return state.notionalCap }
