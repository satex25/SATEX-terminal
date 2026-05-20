/**
 * SATEX — Sub-second crypto candle retention worker (A1 Sprint 3, v0.5).
 *
 * Periodic job that enforces the per-(symbol, bucketMs) row cap on
 * `crypto_subsecond_candles` by calling `trimSubSecondCandles` once per minute.
 *
 * History: Sprint 1 trimmed inline from `SubSecondCandleAggregator.sealBucket()`
 * after every single bucket close. At steady state that was ~12 trim calls/sec
 * across 3 crypto symbols × 2 bucket sizes — bounded but inelegant under
 * sustained load. Sprint 3 lifts the cap-enforcement out of the per-tick hot
 * path: aggregator just inserts; worker trims periodically. The retention
 * contract (per design doc §3.4) is unchanged: at most `maxCandles` rows per
 * (symbol, bucketMs); evict oldest beyond that.
 *
 * Why a separate service (not just a method on the aggregator): the trim list
 * must cover series from prior sessions too — the table has no `session_id`
 * column, so old rows from yesterday's BTC@250 series would otherwise
 * accumulate forever. The worker reads `getAllSeries()` from the table on
 * every cycle, catching whatever is there independent of the in-memory
 * aggregator state.
 *
 * Pure logic — no Electron deps. The persistence layer is injected via a
 * minimal RetentionPersistence shim so vitest can drive the worker with a
 * fake table.
 */
import { createLogger } from './logger'

const log = createLogger('subsecond-retention')

/** Minimum surface the worker needs from the persistence layer. Production
 *  wiring uses { getAllSeries: db.getAllSubSecondSeries, trim: db.trimSubSecondCandles }. */
export interface RetentionPersistence {
  /** Returns every (symbol, bucketMs) pair that has at least one row in the
   *  sub-second table. Sorted for deterministic test assertions. */
  getAllSeries(): ReadonlyArray<{ symbol: string; bucketMs: number }>
  /** Trim one (symbol, bucketMs) series to the most-recent `keep` rows.
   *  Returns the number of rows deleted (used for log payload). */
  trim(symbol: string, bucketMs: number, keep: number): number
}

export interface RetentionWorkerDeps {
  persistence: RetentionPersistence
  /** Cadence in milliseconds. Defaults to 60_000 per A1 design §6 Sprint 3. */
  intervalMs?: number
  /** Per-(symbol, bucketMs) row cap. Defaults to 1000 per A1 design §3.4. */
  maxCandles?: number
}

const DEFAULT_INTERVAL_MS = 60_000
const DEFAULT_MAX_CANDLES = 1000

export interface RetentionRunSummary {
  rowsDeleted: number
  seriesCount: number
  elapsedMs:   number
}

export class SubsecondRetentionWorker {
  private readonly persistence: RetentionPersistence
  private readonly intervalMs:  number
  private readonly maxCandles:  number
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(deps: RetentionWorkerDeps) {
    this.persistence = deps.persistence
    this.intervalMs  = deps.intervalMs ?? DEFAULT_INTERVAL_MS
    this.maxCandles  = deps.maxCandles ?? DEFAULT_MAX_CANDLES
  }

  /** Schedule periodic `runOnce()`. Idempotent — second call while running is
   *  a no-op. Does NOT do an immediate run; the first tick fires `intervalMs`
   *  from now. (At startup the table either has prior-session rows already at
   *  steady-state — no acceleration needed — or it's empty and there's
   *  nothing to do for the first ~4-8 minutes anyway.) */
  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => {
      try { this.runOnce() }
      catch (e) {
        // Defensive: the per-series try/catch inside runOnce already swallows
        // trim failures. This outer catch is for impossible cases (e.g.,
        // getAllSeries throws). Never let the timer thread die.
        log.error('retention cycle threw at top level', { err: String(e) })
      }
    }, this.intervalMs)
  }

  /** Stop the scheduled timer. Idempotent. In-flight `runOnce()` (if any)
   *  continues to completion; trim is fast and bounded. */
  stop(): void {
    if (!this.timer) return
    clearInterval(this.timer)
    this.timer = null
  }

  /** Trim every (symbol, bucketMs) pair the persistence layer reports. Per-
   *  series failures are caught and logged so one bad symbol can't poison the
   *  rest of the cycle. Returns a summary for tests + future telemetry. */
  runOnce(): RetentionRunSummary {
    const start = Date.now()
    const series = this.persistence.getAllSeries()
    let rowsDeleted = 0
    for (const { symbol, bucketMs } of series) {
      try {
        rowsDeleted += this.persistence.trim(symbol, bucketMs, this.maxCandles)
      } catch (e) {
        log.warn('trim failed for series', { symbol, bucketMs, err: String(e) })
      }
    }
    const elapsedMs = Date.now() - start
    // Only log when something was actually trimmed — the table sits below cap
    // for the first ~4-8 minutes of every session, and logging "trimmed 0
    // rows" every minute would dilute the signal.
    if (rowsDeleted > 0) {
      log.debug('trimmed sub-second rows', {
        rowsDeleted, seriesCount: series.length, elapsedMs,
      })
    }
    return { rowsDeleted, seriesCount: series.length, elapsedMs }
  }

  /** Test-only — is the periodic timer currently scheduled? Production code
   *  never needs to ask. */
  _isRunning(): boolean { return this.timer !== null }
}
