/**
 * SATEX — useClocks hook (Phase 10 · Black Box)
 *
 * Synchronized UTC + CST clocks ticking every second, plus the active liquidity
 * session inferred from UTC hour (matches satex-data.jsx:SX.sessionFor).
 *
 * Used by TopBar (right-aligned dual clock + SessionPill) and BottomBar.
 */
import { useEffect, useState } from 'react'
import type { SessionId } from '@shared/types'

function sessionForUtcHour(utcHour: number): SessionId {
  if (utcHour >= 0 && utcHour < 7)  return 'TOKYO'
  if (utcHour >= 7 && utcHour < 13) return 'LONDON'
  return 'NY'
}

export interface ClocksSnapshot {
  /** HH:MM:SS in UTC. */
  utc:     string
  /** HH:MM:SS in CST (UTC−6, no DST shift — matches the mockup). */
  cst:     string
  session: SessionId
  utcHour: number
  /** Underlying Date for callers that need finer-grained access. */
  now:     Date
}

export function useClocks(): ClocksSnapshot {
  const [now, setNow] = useState<Date>(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  const utc = now.toISOString().slice(11, 19)
  const cstDate = new Date(now.getTime() - 6 * 3600 * 1000)
  const cst = cstDate.toISOString().slice(11, 19)
  const utcHour = now.getUTCHours()
  return { utc, cst, session: sessionForUtcHour(utcHour), utcHour, now }
}
