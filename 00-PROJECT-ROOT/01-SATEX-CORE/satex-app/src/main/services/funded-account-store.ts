/**
 * SATEX — Funded account persistence.
 * Stores the active profile id + the EquityHWM ledger to
 * `userData/funded-account.json`. Same atomic-write / silent-recovery
 * pattern as kill-switch-store.ts so a corrupted file never crashes boot.
 *
 * Tier-1 Task D.6.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { app } from 'electron'
import { join } from 'node:path'
import type { EquityHwmLedgerEntry } from '@shared/funded/types'
import { createLogger } from './logger'

const log = createLogger('funded-store')

export interface FundedAccountStored {
  activeProfileId: string | null
  ledger: EquityHwmLedgerEntry[]
  updatedAt: number
}

const EMPTY: FundedAccountStored = {
  activeProfileId: null,
  ledger: [],
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
    writeFile: (path, data) => writeFileSync(path, data, 'utf8'),
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

function sanitize(raw: unknown): FundedAccountStored {
  if (!raw || typeof raw !== 'object') return { ...EMPTY }
  const r = raw as Record<string, unknown>
  const activeProfileId = typeof r.activeProfileId === 'string' ? r.activeProfileId : null
  const rawLedger = Array.isArray(r.ledger) ? r.ledger : []
  const ledger = rawLedger.filter(isLedgerEntry) as EquityHwmLedgerEntry[]
  const updatedAt = typeof r.updatedAt === 'number' ? r.updatedAt : 0
  return { activeProfileId, ledger, updatedAt }
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
