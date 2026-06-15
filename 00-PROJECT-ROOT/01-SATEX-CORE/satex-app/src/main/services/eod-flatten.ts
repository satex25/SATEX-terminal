/**
 * SATEX — End-of-Day Flatten Service.
 *
 * Fires once per trading day at the configured flat-by clock time
 * (e.g. 16:10 America/New_York for Topstep). The wired callback cancels
 * all open orders and flattens all open positions — keeps the account
 * from holding overnight, which is an instant Topstep rule violation.
 *
 * v1 is tick-driven: caller invokes `tick(now)` from a setInterval (1 min
 * cadence is plenty since the cutoff has minute-level granularity). This
 * keeps the service deterministic and testable without setTimeout state.
 *
 * Tier-1 Task D.4.
 */
import type { FlatByConfig } from '@shared/funded/types'
import { tradingDayKey } from './equity-hwm'
import { createLogger } from './logger'

const log = createLogger('eod-flatten')

interface TzParts {
  year: number
  month: number   // 1-12
  day: number     // 1-31
  hour: number    // 0-23
  minute: number  // 0-59
  weekday: number // 0=Sun..6=Sat
}

function partsIn(date: Date, tz: string): TzParts {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
    weekday: 'short',
  })
  const parts = fmt.formatToParts(date)
  const grab = (type: string): string => parts.find(p => p.type === type)?.value ?? ''
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return {
    year:    parseInt(grab('year'),    10),
    month:   parseInt(grab('month'),   10),
    day:     parseInt(grab('day'),     10),
    hour:    parseInt(grab('hour'),    10) % 24,
    minute:  parseInt(grab('minute'),  10),
    weekday: weekdayMap[grab('weekday')] ?? 0,
  }
}

/** True if `now` is at or past today's flat-by clock time in the given tz. */
export function isPastFlatBy(now: Date, flatBy: FlatByConfig): boolean {
  const p = partsIn(now, flatBy.tz)
  if (p.hour > flatBy.hour) return true
  if (p.hour < flatBy.hour) return false
  return p.minute >= flatBy.minute
}

/** True if `now` falls on a weekend in the given tz. */
export function isWeekend(now: Date, tz: string): boolean {
  const wd = partsIn(now, tz).weekday
  return wd === 0 || wd === 6
}

/** Returns the next time the EOD flat will fire, in ms from now. Skips
 *  weekends (Fri after-cutoff → Mon at cutoff). Always positive. */
export function computeMsToFlatBy(now: Date, flatBy: FlatByConfig): number {
  const STEP_MS = 5 * 60_000
  const MAX_PROBES = (3 * 24 * 60 / 5) // ≤ 3 calendar days
  for (let i = 1; i <= MAX_PROBES; i++) {
    const probe = new Date(now.getTime() + i * STEP_MS)
    if (isWeekend(probe, flatBy.tz)) continue
    const p = partsIn(probe, flatBy.tz)
    if (p.hour === flatBy.hour && p.minute >= flatBy.minute && p.minute < flatBy.minute + 5) {
      return probe.getTime() - now.getTime()
    }
  }
  return 0
}

export interface EodFlattenDeps {
  getFlatBy: () => FlatByConfig | null
  onFlat: (reason: string) => void
  /** Optional: called when lastFiredDate changes so callers can persist it
   *  across app restarts. When omitted, fired-date is in-memory only. */
  setLastFiredDate?: (date: string) => void
}

export class EodFlattenService {
  /** Date key (YYYY-MM-DD in profile tz) of the most recent fire. Resets
   *  every new day. Prevents a single cutoff from firing repeatedly when
   *  the tick interval is shorter than the post-cutoff window. Persisted
   *  via deps.setLastFiredDate so it survives app restarts (P0-C). */
  private lastFiredDate: string | null = null

  constructor(private readonly deps: EodFlattenDeps) {}

  /** Restore last-fired date from persisted storage (call from
   *  FundedAccountService.hydrate before the first tick fires). */
  hydrate(date: string | null): void {
    this.lastFiredDate = date
  }

  /** Read the in-memory (or persisted) last-fired date. Used by
   *  FundedAccountService.persist() to include in the saved state. */
  getLastFiredDate(): string | null {
    return this.lastFiredDate
  }

  tick(now: Date): void {
    const flatBy = this.deps.getFlatBy()
    if (!flatBy) return
    if (isWeekend(now, flatBy.tz)) return
    if (!isPastFlatBy(now, flatBy)) return
    const today = tradingDayKey(now, flatBy.tz)
    if (this.lastFiredDate === today) return
    this.lastFiredDate = today
    this.deps.setLastFiredDate?.(today) // persist so restart past cutoff doesn't re-fire
    log.warn('EOD flatten fired', { date: today, flatBy })
    this.deps.onFlat(`eod-${today}`)
  }

  triggerNow(now: Date, reason: string): void {
    const flatBy = this.deps.getFlatBy()
    if (!flatBy) return
    const today = tradingDayKey(now, flatBy.tz)
    this.lastFiredDate = today
    this.deps.setLastFiredDate?.(today)
    log.warn('EOD flatten manually triggered', { date: today, reason })
    this.deps.onFlat(reason)
  }

  msToFlatBy(now: Date): number {
    const flatBy = this.deps.getFlatBy()
    if (!flatBy) return 0
    return computeMsToFlatBy(now, flatBy)
  }

  hasFiredToday(now: Date): boolean {
    const flatBy = this.deps.getFlatBy()
    if (!flatBy) return false
    return this.lastFiredDate === tradingDayKey(now, flatBy.tz)
  }

  reset(): void {
    this.lastFiredDate = null
  }
}
