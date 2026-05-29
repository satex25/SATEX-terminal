/**
 * SATEX — Equity High-Water-Mark Service.
 *
 * Owns three pieces of state for the funded-account rule overlay:
 *   1. `highestEodBalance` — the rolling max of every recorded EOD balance.
 *   2. `ledger` — per-trading-day EOD balance entries, persisted via the
 *      FundedAccountStore so the HWM survives app restarts.
 *   3. `recordEod(equity, now)` — append a fresh ledger entry, update
 *      highestEodBalance. Idempotent on the same trading-day key.
 *
 * `computeMll(profile)` is the pure decision function that turns the current
 * HWM into a dollar MLL. Branches on the lock threshold:
 *
 *   if highestEodBalance >= initialBalance + lockAt
 *     return initialBalance              // locked forever at original equity
 *   else
 *     return max(initialBalance, highestEodBalance) - trailingMaxDrawdown
 *
 * The max() guard means a brand-new account (highestEodBalance = 0 because
 * no EOD has been recorded yet) still gets MLL = initialBalance - trailing.
 *
 * Tier-1 Task D.2.
 */
import type {
  EquityHwmLedgerEntry, FundedAccountProfile,
} from '@shared/funded/types'
import { createLogger } from './logger'

const log = createLogger('equity-hwm')

/** Format a Date in the given IANA tz as 'YYYY-MM-DD'. Exported so other
 *  services (EodFlattenService, FundedAccountService) compute the same
 *  day key without duplicating timezone logic. */
export function tradingDayKey(now: Date, tz: string): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
  })
  return fmt.format(now)
}

export interface EquityHwmDeps {
  /** Reads the active profile id (for tz + lock threshold). null = no
   *  active funded profile, in which case the service is a no-op. */
  getProfile: () => FundedAccountProfile | null
  /** Persistence callback — invoked after every ledger mutation. */
  persist: (ledger: EquityHwmLedgerEntry[]) => void
}

export class EquityHWMService {
  private ledger: EquityHwmLedgerEntry[] = []
  private cachedHwm = 0

  constructor(private readonly deps: EquityHwmDeps) {}

  /** Restore ledger from disk at boot. Recomputes the cached HWM. */
  hydrate(ledger: EquityHwmLedgerEntry[]): void {
    this.ledger = [...ledger].sort((a, b) => a.date.localeCompare(b.date))
    this.cachedHwm = 0
    for (const entry of this.ledger) {
      if (entry.equity > this.cachedHwm) this.cachedHwm = entry.equity
    }
    log.info('equity-hwm hydrated', { entries: this.ledger.length, hwm: this.cachedHwm })
  }

  getLedger(): EquityHwmLedgerEntry[] {
    return [...this.ledger]
  }

  getHighestEodBalance(): number {
    return this.cachedHwm
  }

  /** Append (or overwrite) today's EOD entry. Caller passes the equity
   *  snapshot to record and the `now` clock; tz comes from the active
   *  profile. No-ops if no profile is active. */
  recordEod(equity: number, now: Date): void {
    const profile = this.deps.getProfile()
    if (!profile) return
    if (!Number.isFinite(equity) || equity <= 0) {
      log.warn('refusing to record non-positive / non-finite equity', { equity })
      return
    }
    const date = tradingDayKey(now, profile.flatBy.tz)
    const existing = this.ledger.findIndex(e => e.date === date)
    const entry: EquityHwmLedgerEntry = { date, equity, recordedAt: now.getTime() }
    if (existing >= 0) {
      this.ledger[existing] = entry
    } else {
      this.ledger.push(entry)
      this.ledger.sort((a, b) => a.date.localeCompare(b.date))
    }
    if (equity > this.cachedHwm) this.cachedHwm = equity
    this.deps.persist(this.getLedger())
    log.info('eod recorded', { date, equity, hwm: this.cachedHwm })
  }

  /** Compute the current MLL (Maximum Loss Limit) in dollars. */
  computeMll(profile: FundedAccountProfile): number {
    const lockThreshold = profile.initialBalance + profile.trailingMaxDrawdownLockAt
    if (this.cachedHwm >= lockThreshold) {
      return profile.initialBalance
    }
    const base = Math.max(profile.initialBalance, this.cachedHwm)
    return base - profile.trailingMaxDrawdown
  }

  /** True once the lock threshold has been crossed. */
  isLocked(profile: FundedAccountProfile): boolean {
    return this.cachedHwm >= profile.initialBalance + profile.trailingMaxDrawdownLockAt
  }

  /** Wipe state — used when the user clears the active profile. */
  reset(): void {
    this.ledger = []
    this.cachedHwm = 0
  }
}
