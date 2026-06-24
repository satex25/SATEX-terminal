/**
 * SATEX — Funded account persistence.
 * Stores the active profile id + the EquityHWM ledger to
 * `userData/funded-account.json`. Same atomic-write / silent-recovery
 * pattern as kill-switch-store.ts so a corrupted file never crashes boot.
 *
 * Tier-1 Task D.6.
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { app } from 'electron'
import { join } from 'node:path'
import type { EquityHwmLedgerEntry } from '@shared/funded/types'
import { createLogger } from './logger'

const log = createLogger('funded-store')

export interface FundedAccountStored {
  activeProfileId: string | null
  /** Persisted EOD-flatten date key (YYYY-MM-DD in profile tz).
   *  Prevents re-triggering the EOD flatten on app restart past cutoff. */
  lastEodFiredDate: string | null
  /** Tier-1 D-2 — manually-advanced phase ('combine' | 'funded' | 'activated'). */
  activePhase?: string | null
  ledger: EquityHwmLedgerEntry[]
  /** Tier-1 D-2 — per-day P&L for the consistency / profit-target / min-days trackers. */
  dailyPnl?: Array<{ date: string; realizedPnl: number; tradeCount: number; updatedAt: number }>
  updatedAt: number
}

const EMPTY: FundedAccountStored = {
  activeProfileId: null,
  lastEodFiredDate: null,
  activePhase: null,
  ledger: [],
  dailyPnl: [],
  updatedAt: 0,
}

export interface FundedAccountStoreDeps {
  readFile: (path: string) => string | null
  writeFile: (path: string, data: string) => void
  resolvePath: () => string
}

function defaultDeps(): FundedAccountStoreDeps {
  return {
    readFile: (path) => existsSync(path) ? readFileSync(path, 'utf8') : null,
    writeFile: (path, data) => {
      // Atomic write: commit to .tmp then rename-over so a mid-write crash
      // never corrupts the live JSON (rename is atomic on NTFS/ext4).
      const tmp = `${path}.tmp`
      writeFileSync(tmp, data, 'utf8')
      renameSync(tmp, path)
    },
    resolvePath: () => join(app.getPath('userData'), 'funded-account.json'),
  }
}

function isLedgerEntry(x: unknown): x is EquityHwmLedgerEntry {
  if (!x || typeof x !== 'object') return false
  const e = x as Record<string, unknown>
  return typeof e.date === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(e.date as string)
    && typeof e.equity === 'number'
    && Number.isFinite(e.equity as number)
    && (e.equity as number) > 0
    && typeof e.recordedAt === 'number'
}

function isDailyEntry(x: unknown): x is { date: string; realizedPnl: number; tradeCount: number; updatedAt: number } {
  if (!x || typeof x !== 'object') return false
  const e = x as Record<string, unknown>
  return typeof e.date === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(e.date as string)
    && typeof e.realizedPnl === 'number'
    && Number.isFinite(e.realizedPnl as number)
    && typeof e.tradeCount === 'number'
    && (e.tradeCount as number) >= 0
    && typeof e.updatedAt === 'number'
}

function sanitize(raw: unknown): FundedAccountStored {
  if (!raw || typeof raw !== 'object') return { ...EMPTY }
  const r = raw as Record<string, unknown>
  const activeProfileId = typeof r.activeProfileId === 'string' ? r.activeProfileId : null
  const lastEodFiredDate = typeof r.lastEodFiredDate === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(r.lastEodFiredDate as string)
    ? r.lastEodFiredDate as string
    : null
  const activePhase = typeof r.activePhase === 'string'
    && ['combine', 'funded', 'activated'].includes(r.activePhase as string)
    ? r.activePhase as string : null
  const rawLedger = Array.isArray(r.ledger) ? r.ledger : []
  const ledger = rawLedger.filter(isLedgerEntry) as EquityHwmLedgerEntry[]
  const rawDaily = Array.isArray(r.dailyPnl) ? r.dailyPnl : []
  const dailyPnl = rawDaily.filter(isDailyEntry)
  const updatedAt = typeof r.updatedAt === 'number' ? r.updatedAt : 0
  return { activeProfileId, lastEodFiredDate, activePhase, ledger, dailyPnl, updatedAt }
}

export class FundedAccountStore {
  private readonly deps: FundedAccountStoreDeps
  constructor(deps?: Partial<FundedAccountStoreDeps>) {
    const defaults = defaultDeps()
    this.deps = { ...defaults, ...deps }
  }

  load(): FundedAccountStored {
    try {
      const raw = this.deps.readFile(this.deps.resolvePath())
      if (raw === null) return { ...EMPTY }
      return sanitize(JSON.parse(raw))
    } catch (e) {
      log.warn('funded-account load failed — falling back to empty', { err: String(e) })
      return { ...EMPTY }
    }
  }

  save(state: FundedAccountStored): void {
    try {
      const payload: FundedAccountStored = { ...state, updatedAt: Date.now() }
      this.deps.writeFile(this.deps.resolvePath(), JSON.stringify(payload, null, 2))
    } catch (e) {
      log.error('funded-account save failed', { err: String(e) })
    }
  }
}
