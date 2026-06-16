/**
 * SATEX — Funded Account Types (P-021)
 *
 * Shared between main (FundedAccountService) and renderer
 * (FundedAccountPanel, fundedAccountStore). Only plain data — no
 * Electron / Node imports.
 */

// ── Ledger ────────────────────────────────────────────────────────────────────

/** One EOD equity entry logged by FundedAccountService on each session close. */
export interface LedgerEntry {
  /** ISO-8601 date string of the EOD close (America/New_York midnight). */
  date: string
  /** Account equity at end-of-day close. */
  equity: number
}

// ── Profile ───────────────────────────────────────────────────────────────────

/**
 * Funded programme configuration. Persisted in Vault/Settings/funded-profile.md.
 * All dollar values are in USD; all phase strings are lower-case.
 */
export interface FundedAccountProfile {
  /** Human-readable programme name (e.g. "Topstep $50K"). */
  name: string
  /** Prop firm identifier, lower-case (e.g. "topstep", "apex", "ftmo"). */
  firm: string
  /** Current phase of the programme. */
  phase: 'combine' | 'funded' | 'activated'
  /** Starting balance at programme inception. */
  initialBalance: number
  /**
   * Trailing maximum drawdown limit — absolute dollar distance from the
   * all-time-high account equity. MLL = highWater − trailingMaxDrawdown.
   */
  trailingMaxDrawdown: number
  /** Intraday loss limit: if daily P&L < −dailyLossLimit the account is
   *  suspended. Stored as a positive value; the check is P&L < −limit. */
  dailyLossLimit: number
  /** Minimum calendar trading days required before payout eligibility. */
  minTradingDays: number
  /** Profit target required to pass the combine / qualify for payout. */
  profitTarget: number
}

// ── Snapshot ──────────────────────────────────────────────────────────────────

/**
 * Live snapshot pushed from main → renderer on every engine tick and on all
 * funded-account state transitions. Mirrors FundedAccountService in-memory
 * state and is safe to serialize (no class instances, no circular refs).
 */
export interface FundedAccountSnapshot {
  /** Whether a funded programme is actively configured and tracking. */
  active: boolean
  /** The active programme profile, or null when no programme is configured. */
  profile: FundedAccountProfile | null
  /**
   * Current Maximum Loss Level — the dollar value the account equity must
   * NOT fall below. Equal to highWater − trailingMaxDrawdown (trailing) or
   * a locked floor (static, Topstep semantics after reaching 100% profit).
   */
  currentMll: number
  /** Remaining buffer before the MLL is hit (currentEquity − currentMll). */
  mllBuffer: number
  /**
   * True when the trailing MLL has been "locked" to a static floor because
   * the trader reached the profit target. Topstep-specific behaviour.
   */
  mllLocked: boolean
  /**
   * Milliseconds until the EOD flatten service forces all positions flat.
   * 0 when EOD flatten is inactive (outside funded mode or before NY close).
   */
  msToFlatBy: number
  /** Highest end-of-day closing balance recorded (drives the trailing MLL). */
  highestEodBalance: number
  /**
   * EOD equity ledger — one entry per trading day close, newest last.
   * Capped at the last 30 sessions; the renderer slices to whatever fits.
   */
  ledger: LedgerEntry[]
}
