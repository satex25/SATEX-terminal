/**
 * SATEX — Session Pill (Phase 10 · Black Box)
 *
 * Liquidity-session badge in the TopBar. Phase glyph (◐/◑/◔) cycles by session.
 * Reflects the current active session as resolved from UTC hour by useClocks.
 */
import type { SessionId } from '@shared/types'

interface Props {
  session: SessionId
}

const ICON: Record<SessionId, string> = {
  TOKYO:  '◐',
  LONDON: '◑',
  NY:     '◔',
}

export function SessionPill({ session }: Props) {
  return (
    <div className="bb-session-pill">
      <span className="bb-session-icon">{ICON[session]}</span>
      <span className="bb-session-name">{session}</span>
      <span className="bb-session-suffix">SESSION</span>
    </div>
  )
}
