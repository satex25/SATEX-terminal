/**
 * SATEX — Alpaca WS reconnect delay computation (2026-05-26 extraction).
 *
 * Pure helper shared by the equity, crypto, and (optionally) account WS
 * reconnect paths in AlpacaClient. Pulled out so the math is unit-testable
 * without driving a real WS lifecycle, and so the 406 cooldown contract
 * stays uniform across feeds.
 *
 * The 406 cooldown is the load-bearing piece: Alpaca returns WS error code
 * 406 ("connection limit exceeded") when an orphan socket on their side
 * still holds the slot. Hammering reconnects keeps the orphan alive — so
 * we wait whichever is longer of:
 *   • the per-feed exponential backoff (1s, 2s, 4s, 8s, 16s, cap 30s)
 *   • the global cooldown (60s after the most recent 406)
 *
 * Pre-fix (v0.4.2 and earlier on equity; crypto WS until 2026-05-26): only
 * the equity feed honored the cooldown. Crypto's onclose computed pure
 * exponential backoff and would storm right back through a 406 boundary
 * within 1-2 seconds. After Task 2 added crypto historical-bars traffic,
 * the latency mattered more — this extraction makes the contract uniform.
 */

export const ALPACA_RECONNECT = {
  /** First reconnect attempt waits this long. Subsequent attempts double. */
  MIN_BACKOFF_MS: 1_000,
  /** Backoff caps here. With MIN=1000 the cap is hit at attempt 5+. */
  MAX_BACKOFF_MS: 30_000,
  /** Cooldown applied after a server-side 406 (connection-limit exceeded).
   *  Long enough for a stuck server-side socket to time out. */
  CONNECTION_LIMIT_COOLDOWN_MS: 60_000,
} as const

export interface ReconnectInputs {
  /** Number of reconnect attempts so far (reset to 0 on successful auth). */
  attempts: number
  /** Absolute Date.now() before which reconnects must wait. 0 = no cooldown. */
  cooldownUntilMs: number
  /** Current wall-clock time. Injected for tests; in prod pass Date.now(). */
  nowMs: number
}

/**
 * Returns the ms delay before the next reconnect attempt. Picks the larger
 * of the exponential backoff and any remaining 406 cooldown.
 */
export function computeReconnectDelay({ attempts, cooldownUntilMs, nowMs }: ReconnectInputs): number {
  const safeAttempts = Math.max(0, attempts)
  const backoff = Math.min(
    ALPACA_RECONNECT.MAX_BACKOFF_MS,
    ALPACA_RECONNECT.MIN_BACKOFF_MS * Math.pow(2, safeAttempts),
  )
  const cooldownRemaining = Math.max(0, cooldownUntilMs - nowMs)
  return Math.max(backoff, cooldownRemaining)
}
