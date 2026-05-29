/**
 * SATEX — News-blackout window check.
 *
 * Pure function — given a clock, a list of macro events, the impact levels
 * that trip the blackout, and a half-window in ms, returns whether any
 * matching event falls inside [now - window, now + window].
 *
 * Tier-1 Task D.3.
 */
import type { MacroEvent, MacroImpact } from '@shared/types'

export interface BlackoutResult {
  inBlackout: boolean
  /** If inBlackout, the matched event closest to now. Null otherwise. */
  triggeringEvent: MacroEvent | null
  /** Signed ms from now to the triggering event's ts. Negative = past. */
  msToEvent: number | null
}

/** Pure decision function. Caller supplies events + clock + config. */
export function isInBlackout(
  nowMs: number,
  events: MacroEvent[],
  impacts: MacroImpact[],
  windowMs: number,
): BlackoutResult {
  if (impacts.length === 0 || windowMs <= 0) {
    return { inBlackout: false, triggeringEvent: null, msToEvent: null }
  }
  const impactSet = new Set(impacts)
  let bestDelta = Number.POSITIVE_INFINITY
  let bestEvent: MacroEvent | null = null
  for (const evt of events) {
    if (!impactSet.has(evt.impact)) continue
    const evtMs = Date.parse(evt.tsUtc)
    if (Number.isNaN(evtMs)) continue
    const delta = evtMs - nowMs
    if (Math.abs(delta) <= windowMs && Math.abs(delta) < Math.abs(bestDelta)) {
      bestDelta = delta
      bestEvent = evt
    }
  }
  if (bestEvent === null) {
    return { inBlackout: false, triggeringEvent: null, msToEvent: null }
  }
  return { inBlackout: true, triggeringEvent: bestEvent, msToEvent: bestDelta }
}
