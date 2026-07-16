/**
 * SATEX — useClocks hook (Phase 10 · Black Box; v0.6 selectable local clock).
 *
 * Synchronized UTC + selectable-local clocks ticking every second, plus the
 * active liquidity session inferred from UTC hour (matches
 * satex-data.jsx:SX.sessionFor).
 *
 * UTC is the fixed trading anchor. The *local* clock is whatever trading zone
 * the operator picked in Settings (useTimezoneStore) — formatted DST-correctly
 * via `Intl` for the selected IANA zone (replacing the old naive UTC−6 CST that
 * ignored daylight saving). Used by TopBar (dual clock + SessionPill),
 * MacroStripPanel ("NOW · {code} {local}"), TickerTape and WatchlistPanel.
 */
import { useEffect, useState } from 'react'
import type { SessionId } from '@shared/types'
import { useTimezoneStore, zoneCode } from '../stores/timezoneStore'

function sessionForUtcHour(utcHour: number): SessionId {
  if (utcHour >= 0 && utcHour < 7)  return 'TOKYO'
  if (utcHour >= 7 && utcHour < 13) return 'LONDON'
  return 'NY'
}

/**
 * Format `date` as HH:MM:SS in the given IANA zone. Pure + defensive: if the
 * runtime ICU can't resolve the zone (some minimal ICU builds), fall back to
 * UTC wall-clock so a clock is always shown rather than throwing. Exported for
 * unit testing (the fallback path in particular).
 */
export function formatInZone(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).format(date)
  } catch {
    return date.toISOString().slice(11, 19)
  }
}

export interface ClocksSnapshot {
  /** HH:MM:SS in UTC. */
  utc:       string
  /** HH:MM:SS in the operator-selected local trading zone (DST-correct). */
  local:     string
  /** Stable short code for the selected zone (e.g. "CHI", "NY", "TYO"). */
  localCode: string
  session:   SessionId
  utcHour:   number
  /** Underlying Date for callers that need finer-grained access. */
  now:       Date
}

export function useClocks(): ClocksSnapshot {
  const timezone = useTimezoneStore((s) => s.timezone)
  const [now, setNow] = useState<Date>(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  const utc = now.toISOString().slice(11, 19)
  const local = formatInZone(now, timezone)
  const utcHour = now.getUTCHours()
  return { utc, local, localCode: zoneCode(timezone), session: sessionForUtcHour(utcHour), utcHour, now }
}
