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
    // S1-10 — seal an integrity manifest. Skipped on empty tape: nothing to
    // verify later, and ReplaySource refuses to open empty sessions anyway.
    // Bounds come from the DB after flush so we capture exactly what's on
    // disk (in-memory totalRecorded could drift if a flush partially failed).
    try {
      const bounds = getTapeBounds(this.sessionId)
      if (bounds.count > 0 && bounds.firstTs !== null && bounds.lastTs !== null) {
        const manifest = {
          sessionId:    this.sessionId,
          tickCount:    bounds.count,
          firstTs:      bounds.firstTs,
          lastTs:       bounds.lastTs,
        }
        upsertTapeManifest({
          ...manifest,
          manifestHash: computeTapeManifestHash(manifest),
          sealedAt:     Date.now(),
        })
        log.info('tape manifest sealed', manifest)
      } else {
        log.info('tape manifest skipped (empty tape)', { sessionId: this.sessionId })
      }
    } catch (err) {
      // Manifest sealing is best-effort. A failure here just means the next
      // open of this tape will run in `no-manifest` mode — operationally
      // equivalent to the pre-S1-10 behavior, so we never crash the engine
      // over it.
      log.warn('tape manifest seal failed', { sessionId: this.sessionId, err: String(err) })
    }
    log.info('recorder stopped', { sessionId: this.sessionId, totalRecorded: this.totalRecorded })
  }

  pause(): void {
    if (!this.paused) log.info('recorder paused (replay active)')
    this.paused = true
  }

  resume(): void {
    if (this.paused) log.info('recorder resumed (replay ended)')
    this.paused = false
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
    if (this.buffer.length === 0) return
    const drain = this.buffer
    this.buffer = []
    try {
      const n = insertTickBatch(drain)
      this.totalRecorded += n
      this.lastFlushSize = n
      this.lastFlushAt = Date.now()
    } catch (err) {
      // Best-effort persistence — never crash the engine over a flush error.
      log.warn('tape flush failed; rows dropped', { err: String(err), dropped: drain.length })
    }
  }

  stats(): {
    active: boolean; paused: boolean; sessionId: string
    totalRecorded: number; buffered: number
    lastFlushAt: number | null; lastFlushSize: number
  } {
    return {
      active: this.active,
      paused: this.paused,
      sessionId: this.sessionId,
      totalRecorded: this.totalRecorded,
      buffered: this.buffer.length,
      lastFlushAt: this.lastFlushAt,
      lastFlushSize: this.lastFlushSize,
    }
  }
}
