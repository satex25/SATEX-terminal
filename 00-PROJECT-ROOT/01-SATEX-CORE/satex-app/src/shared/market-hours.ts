/**
 * SATEX — US equity market-hours utility.
 *
 * Pure date math, no broker dependency. Used by:
 *   - main/services/market-data.ts (MarketSimulator) — to freeze fake ticks
 *     during non-RTH so charts don't show fictitious movement while the real
 *     market is closed.
 *   - shared chart code that needs to know "should I show 'MARKET CLOSED'
 *     instead of live ticks?".
 *
 * Caveat (2026-05-17) — US equity holidays are NOT yet handled. A holiday
 * during a Mon-Fri returns `true` here, so the simulator will tick. This is
 * an explicit known-limitation; the practical impact is small (handful of
 * trading days per year). To add holiday handling without a calendar
 * dependency, ship a small hardcoded NYSE holiday list keyed by year and
 * update annually. Tracking as a follow-up.
 *
 * For real Alpaca-backed sessions the broker's /v2/clock endpoint is the
 * authoritative source — the trading-engine already calls it every 30s and
 * propagates `isOpen` into OrderManager (see syncMarketClock). This module
 * is only for code paths that need a synchronous answer without Alpaca.
 */

/** Regular Trading Hours window in NY-local minutes (09:30 = 570, 16:00 = 960). */
const RTH_START_MIN = 9 * 60 + 30
const RTH_END_MIN   = 16 * 60

/** Pull NY-local weekday + hour + minute for `now` without depending on a
 *  timezone library. Intl + IANA `America/New_York` handles DST correctly. */
function nyParts(now: Date): { weekday: string; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday:  'short',
    hour:     '2-digit',
    minute:   '2-digit',
    hour12:   false,
  }).formatToParts(now)
  const weekday = parts.find(p => p.type === 'weekday')?.value ?? ''
  // Intl can emit '24' for midnight under hour12:false on older ICU; clamp.
  let hour = Number(parts.find(p => p.type === 'hour')?.value ?? '0')
  if (hour === 24) hour = 0
  const minute = Number(parts.find(p => p.type === 'minute')?.value ?? '0')
  return { weekday, hour, minute }
}

/** True if the US equity market is currently in Regular Trading Hours.
 *  Weekend = always false. Weekday outside 09:30-16:00 ET = false.
 *  Holidays = not handled (returns true on weekday holidays, see file header). */
export function isUsEquityMarketOpen(now: Date = new Date()): boolean {
  const { weekday, hour, minute } = nyParts(now)
  if (weekday === 'Sat' || weekday === 'Sun') return false
  const hm = hour * 60 + minute
  return hm >= RTH_START_MIN && hm < RTH_END_MIN
}

/** Most recent calendar date (YYYY-MM-DD in NY-local) that should have a
 *  completed NY trading session. Used by the chart's auto-load-last-session
 *  feature so we default to a date Alpaca actually has historical bars for.
 *
 *  Today RTH not yet closed → return yesterday's date.
 *  Today RTH closed (or weekend) → return today (if weekday + past 16:00)
 *                                  or the most recent weekday otherwise. */
export function mostRecentClosedSessionDate(now: Date = new Date()): string {
  const { weekday, hour, minute } = nyParts(now)
  const hm = hour * 60 + minute
  // Step back one day if today's session hasn't closed yet, OR if it's
  // before market open on a weekday (no session to reference yet today).
  const todayHasClosedSession =
    weekday !== 'Sat' && weekday !== 'Sun' && hm >= RTH_END_MIN
  const d = new Date(
    new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' })).getTime(),
  )
  if (!todayHasClosedSession) d.setDate(d.getDate() - 1)
  // Roll back from weekend to most recent weekday.
  for (let guard = 0; guard < 7; guard++) {
    const dow = d.getDay() // 0 = Sunday in NY local
    if (dow !== 0 && dow !== 6) break
    d.setDate(d.getDate() - 1)
  }
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
