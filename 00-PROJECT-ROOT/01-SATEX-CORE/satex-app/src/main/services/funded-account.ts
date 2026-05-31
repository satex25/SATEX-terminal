/**
 * SATEX — Funded Account Service.
 * Single entry point the trading-engine wires to. Holds the active profile,
 * delegates HWM tracking to EquityHWMService, EOD flatten scheduling to
 * EodFlattenService, and produces the snapshot the renderer reads.
 *
 * Tier-1 Task D.7.
 */
import type {
  FundedAccountProfile, FundedAccountSnapshot, EquityHwmLedgerEntry, FlatByConfig,
} from '@shared/funded/types'
import { getProfile as registryGet } from '@shared/funded'
import { computePayoutMetrics, EMPTY_PAYOUT_METRICS, type DailyPnlEntry } from '@shared/funded/payout-metrics'
import type { ClosedTrade } from '@shared/types'
import { EquityHWMService, tradingDayKey } from './equity-hwm'
import { EodFlattenService } from './eod-flatten'
import { FundedAccountStore } from './funded-account-store'
import { DailyPnlLedger } from './daily-pnl-ledger'
import { createLogger } from './logger'

const log = createLogger('funded-account')

export interface FundedAccountListener {
  (snap: FundedAccountSnapshot): void
}

export interface FundedAccountDeps {
  /** Trading-engine-owned callback that cancels every pending order
   *  and market-flattens every open position. EOD service fires this. */
  onFlatten: (reason: string) => void
  /** Optional store injection for tests. Production uses default file path. */
  store?: FundedAccountStore
}

export class FundedAccountService {
  private profile: FundedAccountProfile | null = null
  private readonly hwm: EquityHWMService
  private readonly eod: EodFlattenService
  private readonly store: FundedAccountStore
  private readonly pnlLedger: DailyPnlLedger
  private dailyEntries: DailyPnlEntry[] = []
  private listeners = new Set<FundedAccountListener>()

  constructor(private readonly deps: FundedAccountDeps) {
    this.store = deps.store ?? new FundedAccountStore()
    this.hwm = new EquityHWMService({
      getProfile: () => this.profile,
      persist: (ledger) => this.persist(ledger),
    })
    this.eod = new EodFlattenService({
      getFlatBy: (): FlatByConfig | null => this.profile?.flatBy ?? null,
      onFlat: (reason) => this.deps.onFlatten(reason),
    })
    this.pnlLedger = new DailyPnlLedger({
      getTimezone: () => this.profile?.flatBy.tz ?? null,
      persist: (entries) => { this.dailyEntries = entries; this.persistAll() },
    })
  }

  /** Tier-1 D-2 — record realized PnL for the consistency / profit-target /
   *  min-days trackers. No-op without an active profile. */
  recordClosedTrade(trade: ClosedTrade): void {
    this.pnlLedger.recordClosedTrade(trade)
    this.broadcast()
  }

  /** Manual evaluation phase transition. Topstep's eval is decided
   *  server-side; this just reflects what the user tells us. */
  advancePhase(target: 'combine' | 'funded' | 'activated'): { ok: boolean; reason?: string } {
    if (!this.profile) return { ok: false, reason: 'no active profile' }
    this.profile = { ...this.profile, phase: target }
    this.persistAll()
    log.warn('funded-account phase advanced', { phase: target })
    this.broadcast()
    return { ok: true }
  }

  /** Restore active profile + ledger from disk. Idempotent. */
  hydrate(): void {
    const stored = this.store.load()
    if (stored.activeProfileId) {
      this.profile = registryGet(stored.activeProfileId)
      if (!this.profile) {
        log.warn('stored profile id no longer exists in registry', { id: stored.activeProfileId })
      }
    }
    this.hwm.hydrate(stored.ledger)
    // Tier-1 D-2: restore manual phase override AFTER profile resolution.
    if (this.profile && stored.activePhase && ['combine', 'funded', 'activated'].includes(stored.activePhase)) {
      this.profile = { ...this.profile, phase: stored.activePhase as 'combine' | 'funded' | 'activated' }
    }
    // Tier-1 D-2: restore daily P&L ledger.
    if (stored.dailyPnl && stored.dailyPnl.length > 0) {
      this.pnlLedger.hydrate(stored.dailyPnl)
      this.dailyEntries = stored.dailyPnl
    }
    log.info('funded-account hydrated', {
      profile: this.profile?.id ?? null,
      ledgerEntries: stored.ledger.length,
      dailyEntries: stored.dailyPnl?.length ?? 0,
      phase: this.profile?.phase ?? null,
    })
  }

  /** Activate a profile by id (null to clear). Persists immediately. */
  setProfile(id: string | null): { ok: boolean; reason?: string } {
    if (id === null) {
      this.profile = null
      this.hwm.reset()
      this.eod.reset()
      this.pnlLedger.reset()
      this.dailyEntries = []
      this.persist(this.hwm.getLedger())
      log.warn('funded-account deactivated')
      this.broadcast()
      return { ok: true }
    }
    const next = registryGet(id)
    if (!next) return { ok: false, reason: `unknown profile id: ${id}` }
    this.profile = next
    this.persist(this.hwm.getLedger())
    log.warn('funded-account activated', { profile: next.id, firm: next.firm })
    this.broadcast()
    return { ok: true }
  }

  getProfile(): FundedAccountProfile | null { return this.profile }

  recordEod(equity: number, now: Date): void {
    this.hwm.recordEod(equity, now)
    this.broadcast()
  }

  tick(now: Date): void {
    this.eod.tick(now)
  }

  triggerFlatten(now: Date, reason: string): void {
    this.eod.triggerNow(now, reason)
  }

  isMllBreached(currentEquity: number): boolean {
    if (!this.profile) return false
    return currentEquity < this.hwm.computeMll(this.profile)
  }

  snapshot(currentEquity: number, now: Date): FundedAccountSnapshot {
    if (!this.profile) {
      return {
        active: false, profile: null,
        highestEodBalance: 0, currentMll: 0, mllLocked: false, mllBuffer: 0,
        today: tradingDayKey(now, 'America/New_York'),
        msToFlatBy: 0, ledger: [], payoutMetrics: EMPTY_PAYOUT_METRICS, computedAt: now.getTime(),
      }
    }
    const mll = this.hwm.computeMll(this.profile)
    return {
      active: true,
      profile: this.profile,
      highestEodBalance: this.hwm.getHighestEodBalance(),
      currentMll: mll,
      mllLocked: this.hwm.isLocked(this.profile),
      mllBuffer: currentEquity - mll,
      today: tradingDayKey(now, this.profile.flatBy.tz),
      msToFlatBy: this.eod.msToFlatBy(now),
      ledger: this.hwm.getLedger(),
      payoutMetrics: computePayoutMetrics(this.pnlLedger.getEntries(), this.profile),
      computedAt: now.getTime(),
    }
  }

  onUpdate(fn: FundedAccountListener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private broadcast(): void {
    for (const fn of this.listeners) {
      try { fn(this.snapshot(0, new Date())) }
      catch (e) { log.warn('funded listener threw', { err: String(e) }) }
    }
  }

  private persist(ledger: EquityHwmLedgerEntry[]): void {
    this.store.save({
      activeProfileId: this.profile?.id ?? null,
      activePhase: this.profile?.phase ?? null,
      ledger,
      dailyPnl: this.dailyEntries,
      updatedAt: Date.now(),
    })
  }

  /** Snapshot the full state via the EquityHWM ledger pathway. Called when
   *  phase advances or daily PnL ledger mutates. */
  private persistAll(): void {
    this.persist(this.hwm.getLedger())
  }
}
