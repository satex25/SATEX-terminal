/**
 * SATEX — Daily P&L Ledger.
 *
 * One entry per trading day (YYYY-MM-DD in profile tz) accumulating realized
 * P&L sums. Used by FundedAccountService for the Topstep payout rules
 * (consistency, profit target, min trading days). Advisory only — these
 * trackers never block orders.
 *
 * Tier-1 Phase D-2 Task F.1.
 */
import type { ClosedTrade } from '@shared/types'
import { tradingDayKey } from './equity-hwm'
import { createLogger } from './logger'

const log = createLogger('daily-pnl')

export interface DailyPnlEntry {
  date: string        // YYYY-MM-DD in profile tz
  realizedPnl: number // signed dollar sum of all trades closed this day
  tradeCount: number
  /** ts of the most recent recordClosedTrade for this day. */
  updatedAt: number
}

export interface DailyPnlLedgerDeps {
  getTimezone: () => string | null
  persist: (entries: DailyPnlEntry[]) => void
}

export class DailyPnlLedger {
  private entries: DailyPnlEntry[] = []

  constructor(private readonly deps: DailyPnlLedgerDeps) {}

  hydrate(entries: DailyPnlEntry[]): void {
    this.entries = [...entries].sort((a, b) => a.date.localeCompare(b.date))
    log.info('daily-pnl hydrated', { entries: this.entries.length })
  }

  /** Append the trade's realized PnL to the entry for the trade's closedAt
   *  trading-day in the active profile's tz. No-ops if no profile active. */
  recordClosedTrade(trade: ClosedTrade): void {
    const tz = this.deps.getTimezone()
    if (!tz) return
    const date = tradingDayKey(new Date(trade.closedAt), tz)
    const idx = this.entries.findIndex(e => e.date === date)
    if (idx >= 0) {
      this.entries[idx]!.realizedPnl += trade.pnl
      this.entries[idx]!.tradeCount += 1
      this.entries[idx]!.updatedAt = Date.now()
    } else {
      this.entries.push({ date, realizedPnl: trade.pnl, tradeCount: 1, updatedAt: Date.now() })
      this.entries.sort((a, b) => a.date.localeCompare(b.date))
    }
    this.deps.persist([...this.entries])
  }

  getEntries(): DailyPnlEntry[] { return [...this.entries] }

  reset(): void {
    this.entries = []
  }
}
