/**
 * SATEX — Alpaca endpoint mode persistence.
 * Source of truth for which Alpaca endpoint (paper vs live) the engine
 * targets. Stored in userData/alpaca-mode.json. Default is paper.
 *
 * The actual flip to live still requires the live-mode interlock
 * (typed phrase + notional cap + kill-switch disarmed) in live-mode.ts.
 * This module just chooses the URL.
 */
import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { createLogger } from './logger'

const log = createLogger('alpaca-mode')

export type AlpacaMode = 'paper' | 'live'

const PAPER_BASE_URL = 'https://paper-api.alpaca.markets'
const LIVE_BASE_URL  = 'https://api.alpaca.markets'

interface Stored { mode: AlpacaMode; updatedAt: number }

const FILE = () => path.join(app.getPath('userData'), 'alpaca-mode.json')

function load(): Stored {
  try {
    const raw = fs.readFileSync(FILE(), 'utf8')
    const parsed = JSON.parse(raw) as Stored
    return { mode: parsed.mode === 'live' ? 'live' : 'paper', updatedAt: parsed.updatedAt || 0 }
  } catch { return { mode: 'paper', updatedAt: 0 } }
}

function save(s: Stored): void {
  try { fs.writeFileSync(FILE(), JSON.stringify(s, null, 2), 'utf8') }
  catch (e) { log.error('save failed', { err: String(e) }) }
}

let state: Stored = load()

export function getAlpacaMode(): AlpacaMode { return state.mode }

export function resolveBaseUrl(envOverride?: string): string {
  // Precedence: explicit env override > persisted mode > paper default.
  //
  // "Explicit env override" means the user pointed ALPACA_BASE_URL at a
  // non-canonical URL (e.g. a staging proxy). The env.ts default of
  // paper-api.alpaca.markets is NOT an override — if we treated it as one,
  // the persisted mode would never win, and flipping the UI toggle would
  // silently fail to change the actual endpoint. That was the live bug
  // observed at 2026-05-13T17:27 when LIVE was selected but REST stayed on
  // paper-api.alpaca.markets (causing 401s with live keys).
  const isCanonical = !envOverride
    || envOverride === PAPER_BASE_URL
    || envOverride === LIVE_BASE_URL
  if (!isCanonical && envOverride.length > 0) return envOverride
  return state.mode === 'live' ? LIVE_BASE_URL : PAPER_BASE_URL
}

export function setAlpacaMode(mode: AlpacaMode): { ok: boolean; baseUrl: string } {
  state = { mode, updatedAt: Date.now() }
  save(state)
  log.warn('alpaca mode set', { mode })
  return { ok: true, baseUrl: state.mode === 'live' ? LIVE_BASE_URL : PAPER_BASE_URL }
}
