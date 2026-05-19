/**
 * SATEX — Tick Recorder (Phase 9)
 *
 * Subscribes to live quotes and persists a compressed tape into SQLite. Lives
 * alongside the live source — it never touches the engine's tick path, only
 * appends. ReplaySource later reads the same tape back at controlled speed.
 *
 * Design choices:
 *  • Sample-rate cap: at most one snapshot per symbol per `MIN_SAMPLE_MS`,
 *    so a 20 Hz feed compresses ~5x without losing trend resolution.
 *  • Batched flush: rows accumulate in memory and flush every `FLUSH_MS` or
 *    when `MAX_BUFFER` is hit. Bursts never block the tick path.
 *  • Pauseable: ReplayController calls `pause()` while replay is active so
 *    we don't double-record (replay would emit synthetic quotes through the
 *    same engine path otherwise).
 *  • Bounded retention: writes are append-only; pruning is a separate cron
 *    not yet wired (intentional — recorded sessions should survive restarts).
 */
import { insertTickBatch, getTapeBounds, upsertTapeManifest } from './persistence'
import type { Quote, TickTapeRow } from '@shared/types'
import { createLogger } from './logger'
import { computeTapeManifestHash } from './tape-integrity'

const log = createLogger('tick-recorder')

// At ~20 Hz live ticks across 17 symbols, 250 ms compresses to ~4 ticks/sec/symbol
// — enough resolution for any indicator without bloating storage.
const MIN_SAMPLE_MS = 250
const FLUSH_MS      = 1_000
const MAX_BUFFER    = 4_000

// 2026-05-18 — periodic manifest reseal cadence (deferred issue #1 item).
// Trades off "max ticks at risk on crash" vs. "DB write rate during long
// sessions." 5s = a manifest is at most ~5s stale at any moment; a crash
// leaves the tape recoverable via the `ok-extended` verify outcome with at
// most ~5s of unverified tail. Cost is one bounds-read + one INSERT OR
// REPLACE every 5s — sub-millisecond on better-sqlite3.
const RESEAL_INTERVAL_MS = 5_000

export class TickRecorder {
  private sessionId: string
  private buffer:    TickTapeRow[] = []
  /** Last-sampled wall-clock per symbol — enforces MIN_SAMPLE_MS throttling. */
  private lastSampledAt: Map<string, number> = new Map()
  private flushTimer: NodeJS.Timeout | null = null
  private active = false
  private paused = false
  private totalRecorded = 0
  private lastFlushSize = 0
  private lastFlushAt: number | null = null
  /** 2026-05-18 — count of consecutive flush failures (B1). Resets to 0 on
   *  successful flush. Surfaced via stats() so the SystemStatus pill can show
   *  a TAPE: DEGRADED badge when retries accumulate. */
  private failedFlushCount = 0
  /** Wall-clock millis of the last successful (rolling or final) manifest seal.
   *  Zero before any seal has fired. Drives the 5s periodic reseal cadence —
   *  see RESEAL_INTERVAL_MS for the rationale. */
  private lastSealedAt = 0
  private totalSeals   = 0

  constructor(sessionId: string) {
    this.sessionId = sessionId
  }

  start(): void {
    if (this.active) return
    this.active = true
    this.flushTimer = setInterval(() => this.flush(), FLUSH_MS)
    log.info('recorder started', { sessionId: this.sessionId })
  }

  stop(): void {
    if (!this.active) return
    this.active = false
    if (this.flushTimer) { clearInterval(this.flushTimer); this.flushTimer = null }
    this.flush()
    // Final seal — same code path as periodic rolling reseal. After this and
    // a clean shutdown, the manifest matches the tape exactly; verify-on-open
    // returns `ok`. If we crash before reaching stop(), the most recent
    // rolling seal becomes the recovery anchor and verify returns
    // `ok-extended` for any rows appended after that seal.
    this.resealManifest('final')
    log.info('recorder stopped', { sessionId: this.sessionId, totalRecorded: this.totalRecorded, totalSeals: this.totalSeals })
  }

  /** Read current tape bounds and rewrite the integrity manifest. Best-effort
   *  — a seal failure leaves the prior manifest (or none) intact and is
   *  logged at warn. Skipped on empty tape: nothing to verify and ReplaySource
   *  refuses empty sessions anyway. Called periodically from flush() (every
   *  RESEAL_INTERVAL_MS) and once at stop(). */
  private resealManifest(trigger: 'rolling' | 'final'): void {
    try {
      const bounds = getTapeBounds(this.sessionId)
      if (bounds.count > 0 && bounds.firstTs !== null && bounds.lastTs !== null) {
        const inputs = {
          sessionId:    this.sessionId,
          tickCount:    bounds.count,
          firstTs:      bounds.firstTs,
          lastTs:       bounds.lastTs,
        }
        upsertTapeManifest({
          ...inputs,
          manifestHash: computeTapeManifestHash(inputs),
          sealedAt:     Date.now(),
        })
        this.lastSealedAt = Date.now()
        this.totalSeals += 1
        if (trigger === 'final') {
          log.info('tape manifest sealed (final)', inputs)
        } else {
          // Periodic reseal is high-frequency — keep log volume down by
          // emitting at debug for rolling and info only on final.
          log.debug('tape manifest sealed (rolling)', inputs)
        }
      } else if (trigger === 'final') {
        // Only worth surfacing for the final-seal path; periodic reseal on an
        // empty tape is silent (a long warmup with no quotes shouldn't spam).
        log.info('tape manifest skipped (empty tape)', { sessionId: this.sessionId })
      }
    } catch (err) {
      // Manifest sealing is best-effort. A failure here just means the next
      // open of this tape will run with whatever the prior manifest stored
      // (or in `no-manifest` mode if no prior seal succeeded).
      log.warn('tape manifest seal failed', { sessionId: this.sessionId, trigger, err: String(err) })
    }
  }

  pause(): void {
    if (!this.paused) log.info('recorder paused (replay active)')
    this.paused = true
  }

  resume(): void {
    if (this.paused) log.info('recorder resumed (replay ended)')
    this.paused = false
  }

  /** v0.4.3 B11 — force an immediate flush, bypassing the 1s timer cadence.
   *  Called by the powerMonitor 'resume' wiring in trading-engine.ts so a
   *  recorder that was suspended mid-flight pushes its in-memory buffer to
   *  SQLite as soon as the wake handler fires, instead of waiting up to a
   *  full second for the next timer tick. Also handy for graceful-shutdown
   *  paths that want to drain without calling stop() (which would tear down
   *  the entire recorder). Safe to call when paused or not-yet-started. */
  forceFlush(): void {
    this.flush()
  }

  /** Hook target — register with `engine.market.onQuotes(...)`.
   *
   *  2026-05-18 — per-symbol throttle now compares against the QUOTE's
   *  timestamp instead of Date.now(). Pre-fix, two quotes for the same
   *  symbol arriving in one coalesced batch (post-reconnect catchup,
   *  high-frequency same-symbol updates) both saw `now` as equal, so the
   *  second was dropped even when the underlying market timestamps differed
   *  by far more than MIN_SAMPLE_MS. Recording q.timestamp instead of
   *  Date.now() also preserves feed-time fidelity for the replay path
   *  (bucket alignment + replay clock anchor are both more accurate). */
  ingest(quotes: Quote[]): void {
    if (!this.active || this.paused) return
    const fallbackNow = Date.now()
    for (const q of quotes) {
      // Prefer the feed's own timestamp; fall back to wall clock when the
      // source didn't stamp one (simulator early frames, defensive default).
      const ts = q.timestamp && Number.isFinite(q.timestamp) && q.timestamp > 0
        ? q.timestamp
        : fallbackNow
      const prev = this.lastSampledAt.get(q.symbol) ?? 0
      if (ts - prev < MIN_SAMPLE_MS) continue
      this.lastSampledAt.set(q.symbol, ts)
      this.buffer.push({
        sessionId: this.sessionId,
        ts,
        symbol:    q.symbol,
        last:      q.last,
        bid:       q.bid,
        ask:       q.ask,
        volume:    q.volume,
        vwap:      q.vwap,
      })
    }
    if (this.buffer.length >= MAX_BUFFER) this.flush()
  }

  private flush(): void {
    if (this.buffer.length === 0) {
      // Even with nothing to flush, check the reseal cadence — there are paths
      // where rows landed via a MAX_BUFFER flush between timer ticks, so a
      // periodic-tick flush() with an empty buffer is exactly when we'd want
      // to capture those rows into a rolling seal. Cheap when the interval
      // hasn't elapsed yet.
      this.maybeResealManifest()
      return
    }
    // 2026-05-18 (B1) — copy, don't move. Pre-fix this was `drain = this.buffer;
    // this.buffer = []` which dropped the original buffer reference. On insert
    // failure, the rows in `drain` were a dead local and lost forever. Now the
    // buffer stays intact through the insert; we splice only on success. INSERT
    // OR REPLACE is idempotent on (session_id, ts, symbol) so a retry won't
    // double-write. Bounded overflow at MAX_BUFFER*4 caps memory at ~1.6MB
    // during a sustained outage; drop-oldest preserves the freshest tail.
    const drain = this.buffer.slice()
    try {
      const n = insertTickBatch(drain)
      this.buffer.splice(0, drain.length)
      this.totalRecorded += n
      this.lastFlushSize = n
      this.lastFlushAt = Date.now()
      if (this.failedFlushCount > 0) {
        log.info('tape flush recovered', { afterAttempts: this.failedFlushCount, recovered: n })
        this.failedFlushCount = 0
      }
    } catch (err) {
      // Best-effort persistence — buffer untouched, rows safe for next retry.
      this.failedFlushCount += 1
      // 2026-05-19 (v0.4.3 B1) — bounded buffer growth during sustained outage.
      // Pre-fix the overflow check sat after the success-path splice where it
      // could never fire (the splice drained the full buffer). Moved into the
      // catch block where it does what the comment originally promised: cap
      // recorder memory at MAX_BUFFER*4 (~1.6 MB) by dropping the oldest rows
      // first, preserving the freshest tail through a long DB outage.
      if (this.buffer.length > MAX_BUFFER * 4) {
        const overflow = this.buffer.length - MAX_BUFFER * 4
        this.buffer.splice(0, overflow)
        log.warn('tape buffer overflow during outage; dropped oldest rows', {
          dropped: overflow,
          bufferedAfter: this.buffer.length,
        })
      }
      log.warn('tape flush failed; will retry', {
        err: String(err),
        buffered: this.buffer.length,
        attempt: this.failedFlushCount,
      })
    }
    this.maybeResealManifest()
  }

  /** Fire a rolling reseal if the cadence interval has elapsed since the last
   *  seal. Called from flush() (post-insert) so the new rows are visible to
   *  `getTapeBounds`. The first flush after start() also reseals — `lastSealedAt`
   *  defaults to 0 which is always more than RESEAL_INTERVAL_MS ago. */
  private maybeResealManifest(): void {
    const now = Date.now()
    if (now - this.lastSealedAt < RESEAL_INTERVAL_MS) return
    this.resealManifest('rolling')
  }

  stats(): {
    active: boolean; paused: boolean; sessionId: string
    totalRecorded: number; buffered: number
    lastFlushAt: number | null; lastFlushSize: number
    lastSealedAt: number | null; totalSeals: number
    failedFlushCount: number
  } {
    return {
      active: this.active,
      paused: this.paused,
      sessionId: this.sessionId,
      totalRecorded: this.totalRecorded,
      buffered: this.buffer.length,
      lastFlushAt: this.lastFlushAt,
      lastFlushSize: this.lastFlushSize,
      lastSealedAt: this.lastSealedAt > 0 ? this.lastSealedAt : null,
      totalSeals: this.totalSeals,
      failedFlushCount: this.failedFlushCount,
    }
  }
}
