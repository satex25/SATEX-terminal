/**
 * SATEX — Feed-status helpers (B3 v0.4.3, extracted from WatchlistPanel).
 *
 * Pure functions over the per-asset-class FeedStatus snapshot. Used by the
 * WatchlistPanel SIM badge today; will plug into the MarketsOverviewPanel
 * and ChartPanel header in a follow-up so every quote-display surface tells
 * the same truth about live-vs-synthetic data.
 */
import { findUniverseEntry } from '@shared/constants'
import type { FeedStatus } from '@shared/types'

/**
 * True when the symbol's asset class is NOT served by a live broker feed in
 * the current session. The badge renders only when this returns true.
 *
 * Asset-class mapping (matches the engine's computeFeedStatus()):
 *   • equity / index ETFs → feed.equity must be 'live' to be considered live
 *   • futures              → feed.futures must be 'live' (always 'synthetic' today)
 *   • crypto               → feed.crypto must be 'live'
 *   • unknown / not in UNIVERSE → defaults to NOT synthetic (don't flag what
 *     we can't classify — would over-warn)
 */
export function isSyntheticFeed(symbol: string, feed: FeedStatus): boolean {
  const entry = findUniverseEntry(symbol)
  const ac = entry?.assetClass
  if (ac === 'future') return feed.futures !== 'live'
  if (ac === 'crypto') return feed.crypto  !== 'live'
  if (ac === 'equity' || ac === 'index') return feed.equity !== 'live'
  return false
}

/** Tooltip text shown when the SIM badge is hovered. Kept here so any future
 *  surface that renders the badge uses identical copy. */
export const SIM_BADGE_TOOLTIP = 'Synthetic seed — no live feed for this asset class'
