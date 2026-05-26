/**
 * SATEX — Off-hours chart backfill planner (2026-05-25)
 *
 * Pure decision logic for the chart's "show the last completed NY session when
 * the market is closed" behavior. Extracted from ChartPanel so it can be unit
 * tested in the Node env (no jsdom) and — critically — so the data path is
 * REPLAY-FREE by construction.
 *
 * The 2026-05-17 version of this feature started a *replay* to pull the day's
 * bars into the chart. An active replay forces App.tsx's `effectiveWs` to
 * 'Replay' (so the scrubber can't be hidden mid-tape), which hijacked the
 * user's chosen workspace (e.g. Quad) on every off-hours launch once Alpaca
 * credentials were present. This planner has no `replay` dependency at all —
 * its only data call is `fetchBars` (window.satex.getHistoricalBars), which
 * returns bars directly with no tape, no session, and no workspace takeover.
 * See docs/design/2026-05-25-offhours-chart-backfill.md.
 */
import type { Candle } from '@shared/types'

export interface BackfillDeps {
  /** The chart symbol to backfill. */
  symbol: string
  /** Symbol's asset class — drives the market-open gate. Crypto trades 24/7
   *  so it bypasses isMarketOpen; equity/index/future keep the v0.4.4 gate
   *  (skip during RTH because the live feed populates the chart fast).
   *  Omitted = behave as before (equity-style gate) for back-compat. */
  assetClass?: 'equity' | 'index' | 'future' | 'crypto'
  /** Whether a replay is currently active — if so, leave it alone. */
  inReplay: boolean
  /** Is the US equity market open right now? Live data wins when it is. */
  isMarketOpen: () => boolean
  /** Most-recent COMPLETED NY session date as YYYY-MM-DD. Used by the equity/
   *  index path; the crypto path ignores it (main fetches a rolling 24h window). */
  mostRecentClosedSessionDate: () => string
  /** Masked credential status — backfill needs Alpaca keys to hit the bars API. */
  getCredentialsMasked: () => Promise<{ paperConfigured?: boolean; liveConfigured?: boolean } | undefined>
  /** Replay-free single-symbol day-of-bars fetch (window.satex.getHistoricalBars). */
  fetchBars: (req: { symbol: string; date: string; timeframe: '1Min' }) => Promise<{ ok: boolean; bars?: Candle[]; reason?: string }>
}

export type BackfillResult =
  | { action: 'skipped'; reason: 'in-replay' | 'market-open' | 'no-creds' }
  | { action: 'backfilled'; date: string; bars: Candle[] }
  | { action: 'no-bars'; date: string; reason?: string }

/**
 * Decide whether — and with what data — to backfill the chart with the last
 * completed NY session. Guards (in order):
 *   1. in a replay     → skip (don't clobber the user's tape)
 *   2. market open      → skip (live data is what the user wants)
 *   3. no credentials   → skip (the bars API would just 401)
 * Otherwise fetch the last session's 1-minute bars for the chart symbol and
 * return them for the caller to drop into the candle store. Never starts a
 * replay; never changes the workspace.
 */
export async function planLastSessionBackfill(deps: BackfillDeps): Promise<BackfillResult> {
  if (deps.inReplay) return { action: 'skipped', reason: 'in-replay' }

  // Crypto trades ~24/7 — the equity RTH gate doesn't apply, and on cold boot
  // we still want bars even if the US equity market is currently open (the
  // crypto live feed needs a minute to bucket its first bar). Equity/index/
  // future continue to skip when the market is open because their live feeds
  // start populating the chart within seconds of opening.
  const isCrypto = deps.assetClass === 'crypto'
  if (!isCrypto && deps.isMarketOpen()) return { action: 'skipped', reason: 'market-open' }

  const creds = await deps.getCredentialsMasked()
  const hasCreds = !!(creds && (creds.paperConfigured || creds.liveConfigured))
  if (!hasCreds) return { action: 'skipped', reason: 'no-creds' }

  const date = deps.mostRecentClosedSessionDate()
  const res = await deps.fetchBars({ symbol: deps.symbol, date, timeframe: '1Min' })
  if (!res.ok || !res.bars || res.bars.length === 0) {
    return { action: 'no-bars', date, reason: res.reason }
  }
  return { action: 'backfilled', date, bars: res.bars }
}
