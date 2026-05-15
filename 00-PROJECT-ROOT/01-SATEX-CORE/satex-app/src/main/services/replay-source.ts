/**
 * SATEX — Replay Source (Phase 9)
 *
 * MarketDataSource implementation that streams recorded ticks from SQLite
 * tape at a controlled speed. Drop-in replacement for MarketSimulator/
 * LiveMarket so the rest of the engine (order manager, observer, brain,
 * tactics, vault) is oblivious to whether quotes are live or replayed.
 *
 * Time model
 * ----------
 * Two clocks coexist:
 *   • wall clock — physical Date.now()
 *   • replay clock — emitted-tick timestamp inside the tape
 *
 * Anchor invariant:
 *   replayTime(now) = anchorReplayTs + (now - anchorWallTs) * speed
 *
 * Pause/resume preserves cursor by re-anchoring on resume. Speed change is
 * also a re-anchor so playback is smooth across speed flips. Seek jumps the
 * cursor and replays the leading edge of tape state (sparkline/vwap) by
 * scanning the tape from `firstTs..cursorTs` at infinite speed.
 *
 * Buffering
 * ---------
 * A 5-second look-ahead window is prefetched per tick. Memory footprint stays
 * tiny even on long tapes; SQLite handles the actual scan.
 *
 * Candle reconstruction
 * ---------------------
 * SimulatorSimulator emits 1-second OHLC rolls from raw quotes; we do the
 * same here. Candles are derived from the tape, not stored separately, so a
 * 5-minute backfill incurs no extra storage cost. Each emitted tick rolls or
 * mutates the in-flight candle just like MarketSimulator.tick().
 */
import {
  SPARKLINE_LENGTH, SIMULATOR_CANDLE_INTERVAL_SEC, TICK_HZ, UNIVERSE,
  REPLAY_DEFAULT_SPEED, REPLAY_MIN_SPEED, REPLAY_MAX_SPEED,
  type UniverseEntry,
} from '@shared/constants'
import type { Candle, NewsItem, Quote, TickTapeRow } from '@shared/types'
import * as db from './persistence'
import type { MarketDataSource, Unsub } from './market-data'
import { createLogger } from './logger'

const log = createLogger('replay')

interface SymbolState {
  entry: UniverseEntry
  last: number
  bid:  number
  ask:  number
  vwap: number
  volume: number
  prevClose: number
  sparkline: number[]
  currentCandle: Candle
  candles: Candle[]
  /** Most recent tape-row timestamp emitted for this symbol. */
  lastEmittedTs: number
}

/** 5-second look-ahead at most. Tape is paged from SQLite as cursor advances. */
const PREFETCH_WINDOW_MS = 5_000

export interface ReplaySnapshot {
  sessionId: string
  speed: number
  cursorTs: number | null
  tapeStartTs: number | null
  tapeEndTs:   number | null
  /** [0..1] progress through tape. */
  progress: number | null
  emittedTicks: number
  /** True when wall ticks are suspended. */
  paused: boolean
  /** Set when the source paused itself (end-of-tape). */
  autoPausedReason: string | null
}

export class ReplaySource implements MarketDataSource {
  // ── Tape identity ───────────────────────────────────────────────────────────
  private readonly sessionId: string
  private readonly tapeStartTs: number
  private readonly tapeEndTs:   number

  // ── Time / speed ────────────────────────────────────────────────────────────
  private speed: number
  private anchorWallTs:   number = 0
  private anchorReplayTs: number = 0
  private cursorTs: number
  private paused = true
  private autoPausedReason: string | null = null

  // ── Tape paging ─────────────────────────────────────────────────────────────
  private prefetched: TickTapeRow[] = []
  private prefetchedThroughTs = 0

  // ── Live-ish state per symbol ───────────────────────────────────────────────
  private states = new Map<string, SymbolState>()

  // ── Tick loop ───────────────────────────────────────────────────────────────
  private tickTimer: NodeJS.Timeout | null = null
  private currentCandleStart = 0
  private emittedTicks = 0

  // ── Listeners ───────────────────────────────────────────────────────────────
  private quoteListeners  = new Set<(q: Quote[]) => void>()
  private candleListeners = new Set<(s: string, c: Candle, isNew: boolean) => void>()
  private newsListeners   = new Set<(n: NewsItem) => void>()

  // ── Hooks for the controller ────────────────────────────────────────────────
  /** Optional callback fired after each emission, for cheap status pushes. */
  onTickEmitted: ((snap: ReplaySnapshot) => void) | null = null

  constructor(sessionId: string, opts?: { speed?: number; fromTs?: number }) {
    this.sessionId = sessionId
    const bounds = db.getTapeBounds(sessionId)
    if (bounds.firstTs == null || bounds.lastTs == null || bounds.count === 0) {
      throw new Error(`replay source: session ${sessionId} has no tape rows`)
    }
    this.tapeStartTs = bounds.firstTs
    this.tapeEndTs   = bounds.lastTs

    const requestedFrom = opts?.fromTs ?? this.tapeStartTs
    this.cursorTs = this.clampToTape(requestedFrom)
    this.speed = clampSpeed(opts?.speed ?? REPLAY_DEFAULT_SPEED)

    // Seed symbol state from UNIVERSE (constant) — values rehydrate from the
    // tape's leading edge on warmup() before the first emission.
    for (const entry of UNIVERSE) {
      this.states.set(entry.symbol, this.seedState(entry))
    }

    log.info('replay source constructed', {
      sessionId, tapeStart: this.tapeStartTs, tapeEnd: this.tapeEndTs,
      ticks: bounds.count, cursor: this.cursorTs, speed: this.speed,
    })
  }

  // ── MarketDataSource API ────────────────────────────────────────────────────
  start(): void {
    // Warm up state so the first emitted Quote is consistent with where the
    // cursor is, not stale UNIVERSE seeds.
    this.warmup(this.cursorTs)
    this.unpause()
  }

  stop(): void {
    this.pause()
    this.prefetched = []
    this.quoteListeners.clear()
    this.candleListeners.clear()
    this.newsListeners.clear()
  }

  onQuotes(fn: (q: Quote[]) => void):                       Unsub { this.quoteListeners.add(fn);  return () => this.quoteListeners.delete(fn) }
  onCandle(fn: (s: string, c: Candle, n: boolean) => void): Unsub { this.candleListeners.add(fn); return () => this.candleListeners.delete(fn) }
  onNews(fn: (n: NewsItem) => void):                        Unsub { this.newsListeners.add(fn);   return () => this.newsListeners.delete(fn) }

  getQuote(symbol: string): Quote | undefined {
    const s = this.states.get(symbol); return s ? this.quoteFrom(s) : undefined
  }
  getAllQuotes(): Quote[] {
    return Array.from(this.states.values()).map(s => this.quoteFrom(s))
  }
  getCandles(symbol: string, limit = 500): Candle[] {
    const s = this.states.get(symbol)
    if (!s) return []
    return [...s.candles, s.currentCandle].slice(-limit)
  }

  // ── Replay control surface ──────────────────────────────────────────────────

  pause(): void {
    if (this.paused) return
    if (this.tickTimer) { clearInterval(this.tickTimer); this.tickTimer = null }
    this.paused = true
    log.info('replay paused', { cursor: this.cursorTs })
  }

  /** Internal — used by start() and resume() to begin tick emission. */
  private unpause(): void {
    if (!this.paused) return
    this.autoPausedReason = null
    this.anchor(this.cursorTs)
    const tickMs = Math.floor(1000 / TICK_HZ)
    this.tickTimer = setInterval(() => this.tick(), tickMs)
    this.paused = false
    log.info('replay resumed', { cursor: this.cursorTs, speed: this.speed })
  }

  resume(): void { this.unpause() }

  setSpeed(speed: number): number {
    const next = clampSpeed(speed)
    if (next === this.speed) return next
    // Re-anchor so the cursor doesn't jump.
    this.anchor(this.cursorTs)
    this.speed = next
    log.info('replay speed changed', { speed: next })
    return next
  }

  /** Jump cursor to `ts`, reset internal state, replay tape up to `ts`
   *  at infinite speed so sparkline/vwap/candles match the new position. */
  seek(ts: number): void {
    const target = this.clampToTape(ts)
    const wasPaused = this.paused
    if (!wasPaused) this.pause()
    // Reset state & rewarm.
    for (const entry of UNIVERSE) this.states.set(entry.symbol, this.seedState(entry))
    this.prefetched = []
    this.prefetchedThroughTs = 0
    this.cursorTs = target
    this.warmup(target)
    if (!wasPaused) this.unpause()
    log.info('replay seek', { ts: target })
  }

  snapshot(): ReplaySnapshot {
    const tapeLen = Math.max(1, this.tapeEndTs - this.tapeStartTs)
    const progress = Math.min(1, Math.max(0, (this.cursorTs - this.tapeStartTs) / tapeLen))
    return {
      sessionId: this.sessionId,
      speed: this.speed,
      cursorTs: this.cursorTs,
      tapeStartTs: this.tapeStartTs,
      tapeEndTs: this.tapeEndTs,
      progress,
      emittedTicks: this.emittedTicks,
      paused: this.paused,
      autoPausedReason: this.autoPausedReason,
    }
  }

  // ── Internal — clock + tape paging ──────────────────────────────────────────

  private anchor(replayTs: number): void {
    this.anchorWallTs   = Date.now()
    this.anchorReplayTs = replayTs
  }

  private currentReplayTime(): number {
    return this.anchorReplayTs + (Date.now() - this.anchorWallTs) * this.speed
  }

  private clampToTape(ts: number): number {
    return Math.min(this.tapeEndTs, Math.max(this.tapeStartTs, ts))
  }

  private refillPrefetch(toTs: number): void {
    if (toTs <= this.prefetchedThroughTs) return
    const fromTs = Math.max(this.cursorTs + 1, this.prefetchedThroughTs + 1)
    const rows = db.readTapeRange(this.sessionId, fromTs, toTs, 5000)
    if (rows.length > 0) this.prefetched.push(...rows)
    this.prefetchedThroughTs = toTs
  }

  /** Replay tape from `tapeStartTs..targetTs` synchronously, rolling candles
   *  on bucket boundaries and emitting them to candle listeners so the
   *  renderer can render the full historical chart immediately on seek.
   *
   *  Pre-fix this was a silent state-rebuild: applyTape mutated each symbol's
   *  in-flight `currentCandle.high/low/close`, but `maybeRollCandle` was only
   *  ever called from `tick()`, never from warmup. After warmup, every symbol
   *  had ONE giant candle covering the entire warmed range, and the chart
   *  panel received zero candle events. Phase 9.2's "seek-to-end after start"
   *  pattern produced a fully built ReplaySource with an empty chart.
   *
   *  Now: cursor advances per tape row → roll on bucket crossing → emit. The
   *  `maybeRollCandle` path already skips symbols without tape data
   *  (lastEmittedTs===0), so seed-only flatlines aren't broadcast. */
  private warmup(targetTs: number): void {
    let cursor = this.tapeStartTs
    // Seed currentCandleStart so the first row's bucket-cross fires a roll
    // rather than mutating a stale seed-time candle indefinitely.
    this.currentCandleStart = Math.floor(this.tapeStartTs / 1000 / SIMULATOR_CANDLE_INTERVAL_SEC) * SIMULATOR_CANDLE_INTERVAL_SEC
    while (cursor <= targetTs) {
      const next = Math.min(targetTs, cursor + 30_000) // 30s pages
      const rows = db.readTapeRange(this.sessionId, cursor, next, 8000)
      if (rows.length === 0) break
      for (const r of rows) {
        this.applyTape(r, /*emitCandleListener=*/ false)
        this.cursorTs = r.ts
        this.maybeRollCandle()
      }
      const lastTs = rows[rows.length - 1]!.ts
      cursor = lastTs + 1
      if (rows.length < 8000) break
    }
    // Final emit: each symbol's in-flight candle (mid-bucket close) so the
    // chart shows the latest bar without waiting for the next bucket roll.
    for (const [sym, s] of this.states) {
      if (s.lastEmittedTs === 0) continue
      for (const l of this.candleListeners) l(sym, s.currentCandle, true)
    }
    this.cursorTs = targetTs
    this.currentCandleStart = Math.floor(targetTs / 1000 / SIMULATOR_CANDLE_INTERVAL_SEC) * SIMULATOR_CANDLE_INTERVAL_SEC
    this.emittedTicks = 0
  }

  // ── Internal — tick emission ────────────────────────────────────────────────

  private tick(): void {
    if (this.paused) return
    const target = Math.min(this.tapeEndTs, this.currentReplayTime())
    if (target >= this.tapeEndTs) {
      // End-of-tape; snap cursor and auto-pause so listeners notice.
      this.cursorTs = this.tapeEndTs
      this.autoPausedReason = 'end-of-tape'
      this.pause()
      this.onTickEmitted?.(this.snapshot())
      return
    }

    // Ensure prefetch covers the next PREFETCH_WINDOW_MS of replay time.
    this.refillPrefetch(Math.min(this.tapeEndTs, target + PREFETCH_WINDOW_MS))

    const batch: Quote[] = []
    // Drain prefetched rows whose ts <= target.
    let i = 0
    while (i < this.prefetched.length && this.prefetched[i]!.ts <= target) {
      const row = this.prefetched[i]!
      this.applyTape(row, true)
      const s = this.states.get(row.symbol)
      if (s) batch.push(this.quoteFrom(s))
      i++
    }
    if (i > 0) this.prefetched.splice(0, i)
    this.cursorTs = target
    this.emittedTicks += batch.length

    if (batch.length > 0) {
      // De-duplicate by symbol — keep the latest snapshot only, matching how
      // the live engine batches downstream.
      const byKey = new Map<string, Quote>()
      for (const q of batch) byKey.set(q.symbol, q)
      const out = Array.from(byKey.values())
      for (const l of this.quoteListeners) l(out)
    }

    this.maybeRollCandle()
    this.onTickEmitted?.(this.snapshot())
  }

  /** Apply one tape row to symbol state. Candle listeners fire only on roll
   *  via `maybeRollCandle`, never on intra-bar updates — matches live engine. */
  private applyTape(row: TickTapeRow, _emit: boolean): void {
    const s = this.states.get(row.symbol)
    if (!s) return
    // First tape row seen for this symbol: reset every price-anchored field
    // to the tape price so the seed-era UNIVERSE values (e.g. NVDA $965)
    // don't bleed into the first candle's open/high. Pre-fix, the in-flight
    // candle kept `open = entry.seed` and `high = Math.max(seed, tape)`,
    // producing a fake $700+ wick on every historical replay. Resetting
    // here is the cheap point — applyTape sees every tape row exactly once.
    if (s.lastEmittedTs === 0) {
      s.prevClose = row.last
      s.sparkline.fill(row.last)
      s.last = row.last
      s.bid  = row.bid
      s.ask  = row.ask
      s.vwap = row.vwap
      s.currentCandle = {
        time:  s.currentCandle.time,
        open:  row.last,
        high:  row.last,
        low:   row.last,
        close: row.last,
        volume: 0,
      }
    }
    s.last   = row.last
    s.bid    = row.bid
    s.ask    = row.ask
    s.vwap   = row.vwap
    s.volume = row.volume
    s.lastEmittedTs = row.ts
    s.sparkline.shift()
    s.sparkline.push(row.last)
    const c = s.currentCandle
    c.high  = Math.max(c.high, row.last)
    c.low   = Math.min(c.low,  row.last)
    c.close = row.last
  }

  private maybeRollCandle(): void {
    const cursorSec = Math.floor(this.cursorTs / 1000)
    const bucket = Math.floor(cursorSec / SIMULATOR_CANDLE_INTERVAL_SEC) * SIMULATOR_CANDLE_INTERVAL_SEC
    if (bucket === this.currentCandleStart) return
    for (const [sym, s] of this.states) {
      // Skip symbols with no tape data yet — emitting their seed-price
      // flatlines would broadcast 18 × N events on every warmup, half of
      // them just repeating the UNIVERSE seed forever.
      if (s.lastEmittedTs === 0) continue
      const closed = { ...s.currentCandle }
      s.candles.push(closed)
      if (s.candles.length > 2000) s.candles.shift()
      for (const l of this.candleListeners) l(sym, closed, false)
      const next: Candle = { time: bucket, open: closed.close, high: closed.close, low: closed.close, close: closed.close, volume: 0 }
      s.currentCandle = next
      for (const l of this.candleListeners) l(sym, next, true)
    }
    this.currentCandleStart = bucket
  }

  private quoteFrom(s: SymbolState): Quote {
    const change = s.last - s.prevClose
    return {
      symbol: s.entry.symbol, name: s.entry.name, assetClass: s.entry.assetClass,
      last: s.last, bid: s.bid, ask: s.ask,
      prevClose: s.prevClose,
      change,
      changePct: s.prevClose === 0 ? 0 : (change / s.prevClose) * 100,
      volume: s.volume,
      vwap: s.vwap || s.last,
      sparkline: s.sparkline.slice(),
      timestamp: this.cursorTs,
    }
  }

  private seedState(entry: UniverseEntry): SymbolState {
    const seedSec = Math.floor(this.cursorTs / 1000)
    const bucket  = Math.floor(seedSec / SIMULATOR_CANDLE_INTERVAL_SEC) * SIMULATOR_CANDLE_INTERVAL_SEC
    return {
      entry, last: entry.seed, bid: entry.seed - 0.05, ask: entry.seed + 0.05,
      vwap: entry.seed, volume: 0,
      prevClose: entry.seed,
      sparkline: new Array(SPARKLINE_LENGTH).fill(entry.seed),
      currentCandle: { time: bucket, open: entry.seed, high: entry.seed, low: entry.seed, close: entry.seed, volume: 0 },
      candles: [],
      lastEmittedTs: 0,
    }
  }
}

function clampSpeed(s: number): number {
  if (!Number.isFinite(s)) return REPLAY_DEFAULT_SPEED
  return Math.max(REPLAY_MIN_SPEED, Math.min(REPLAY_MAX_SPEED, s))
}
