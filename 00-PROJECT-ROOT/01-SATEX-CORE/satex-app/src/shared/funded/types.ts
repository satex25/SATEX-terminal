/**
 * SATEX — Funded Account types.
 * Pluggable rule profile for prop-firm-funded accounts (Topstep, Apex, FTMO,
 * etc.). v1 ships the Topstep $50K XFA preset; later profiles are added by
 * dropping new constants into shared/funded/ and registering in index.ts.
 *
 * Tier-1 from docs/audits/2026-05-28-evidence-audit.md.
 */
import type { AssetClass } from '@shared/types'

/** Evaluation lifecycle stages a funded account can be in. Topstep XFA has
 *  three: Combine (paying for the eval), Funded (post-pass), Activated
 *  (post-first-payout, sometimes with relaxed rules). v1 doesn't drive any
 *  behavior off this field — it's read-only metadata for display. Inline
 *  literal so knip doesn't flag the alias as externally unused. */
type EvaluationPhase = 'combine' | 'funded' | 'activated'

/** EOD cutoff specified in an IANA timezone — the EodFlattenService converts
 *  to UTC once per day. The (hour, minute) pair is local clock time. */
export interface FlatByConfig {
  hour: number
  minute: number
  /** IANA tz name, e.g. 'America/New_York'. Topstep's cutoff is in ET. */
  tz: string
}

export interface FundedAccountProfile {
  /** kebab-case unique id. Persisted; used as the lookup key. */
  id: string
  /** Display name for the UI ('Topstep $50K Express Funded'). */
  name: string
  /** Source firm — 'topstep' | 'apex' | 'ftmo' | etc. Display-only. */
  firm: string
  /** Current evaluation phase. Read-only; v1 doesn't transition. */
  phase: EvaluationPhase

  // ── Capital ─────────────────────────────────────────────────────────────
  /** Starting account balance in USD. */
  initialBalance: number

  // ── Loss limits ─────────────────────────────────────────────────────────
  /** Daily Loss Limit in dollars (positive number — the cap, not a delta). */
  dailyLossLimit: number
  /** Trailing Maximum Loss Limit (MLL) in dollars below the highest EOD
   *  balance. e.g. Topstep $50K = 2000. */
  trailingMaxDrawdown: number
  /** Profit level (above initialBalance, in dollars) at which the MLL
   *  converts from trailing to STATIC at initialBalance. e.g. Topstep
   *  locks once highestEod >= initialBalance + 1000. Set to Infinity to
   *  disable the lock (pure trailing forever). */
  trailingMaxDrawdownLockAt: number

  // ── Position size ───────────────────────────────────────────────────────
  /** Per-symbol max contract / share count. Symbols not in the map fall
   *  through to defaultMaxContracts. */
  maxContracts: Record<string, number>
  /** Cap for any symbol not explicitly listed in maxContracts. */
  defaultMaxContracts: number

  // ── Session boundaries ──────────────────────────────────────────────────
  /** End-of-day flatten time. Positions are force-closed and pending orders
   *  cancelled at this clock time in the given tz, every weekday. */
  flatBy: FlatByConfig

  // ── News ────────────────────────────────────────────────────────────────
  /** Impact levels that trigger the blackout. Empty array = no blackout. */
  newsBlackoutImpacts: ('high' | 'med' | 'low')[]
  /** Half-window in ms — orders refused if any event of matched impact is
   *  within ±this much of now. */
  newsBlackoutWindowMs: number

  // ── Eval bookkeeping (informational in v1) ──────────────────────────────
  profitTarget: number
  minTradingDays: number
  /** Consistency Rule — fraction of total profit allowed in the single
   *  largest profitable day. 0 = no rule (Topstep XFA Combine). 0.5 =
   *  largest day must be ≤ 50% of total profit (Topstep Funded payout). */
  consistencyMaxDayFraction: number

  // ── Allowed instruments ─────────────────────────────────────────────────
  /** Asset classes a Topstep-real account would actually trade
   *  (futures only IRL). The Alpaca overlay sets this permissive so paper
   *  practice on equity symbols doesn't trip Gate 13. */
  allowedAssetClasses: AssetClass[]
}

/** Single entry in the EOD equity ledger — recorded by EquityHWMService each
 *  trading day at the configured flat-by time (or immediately on first boot
 *  for the activation balance). */
export interface EquityHwmLedgerEntry {
  /** Trading-day key — 'YYYY-MM-DD' in the profile's tz. */
  date: string
  /** Account equity at end-of-day in dollars. */
  equity: number
  /** ts at which this entry was recorded. */
  recordedAt: number
}

/** Snapshot the renderer reads. Includes everything needed to display the
 *  rule panel + the current MLL buffer for the rail. */
export interface FundedAccountSnapshot {
  active: boolean
  profile: FundedAccountProfile | null
  /** Highest end-of-day balance observed across all entries. */
  highestEodBalance: number
  /** Current MLL value in dollars. */
  currentMll: number
  /** Has the MLL locked to static (i.e. highestEod crossed lock threshold)? */
  mllLocked: boolean
  /** Distance from current equity to current MLL — positive = OK, negative = busted. */
  mllBuffer: number
  /** Today's date key (YYYY-MM-DD in profile.tz). */
  today: string
  /** ms until the next EOD flatten fires (clamps to 0 if past). */
  msToFlatBy: number
  /** Ledger of every recorded EOD balance, oldest first. */
  ledger: EquityHwmLedgerEntry[]
  /** Tier-1 Phase D-2 — payout-time rule metrics (advisory, never block orders). */
  payoutMetrics: PayoutMetrics
  computedAt: number
}

/** Payout-time rule metrics. Source-of-truth implementation in
 *  `@shared/funded/payout-metrics`. Inlined here (un-exported) so the
 *  snapshot type avoids a circular import; consumers needing the named
 *  type import it from payout-metrics directly. */
interface PayoutMetrics {
  totalProfit: number
  largestProfitableDay: number
  consistencyRatio: number
  consistencyOk: boolean
  profitTargetProgress: number
  profitTargetReached: boolean
  tradingDaysCount: number
  minDaysSatisfied: boolean
  phase: string
  dailyHistory: Array<{ date: string; realizedPnl: number; tradeCount: number; updatedAt: number }>
}
