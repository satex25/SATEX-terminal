/**
 * SATEX — Live Candle Buffer
 * Aggregates real-time ticks into OHLCV candles at a configurable interval.
 * Thread-safe (single-threaded Node.js). Emits candle events to listeners.
 */
import { MAX_CANDLES_PER_SYMBOL, SIMULATOR_CANDLE_INTERVAL_SEC } from '@shared/constants'
import type { Candle } from '@shared/types'
import { createLogger } from './logger'

const log = createLogger('candle-buffer')

type CandleListener = (symbol: string, candle: Candle, isNew: boolean) => void

interface CandleState {
  current: Candle
  history: Candle[]
}

export class LiveCandleBuffer {
  private states = new Map<string, CandleState>()
  private listeners = new Set<CandleListener>()
  private rollTimer: NodeJS.Timeout | null = null
  private currentBucket = 0
  readonly intervalSec: number

  /** S1-1 — intra-bar update coalescing. Without this, ingestTick fires the
   *  candle update on EVERY quote tick: 20Hz × 18 symbols ≈ 360 ev/s, which
   *  drives the renderer's ChartPanel reconciliation 360 times per second
   *  and was the root cause of the 100-125ms boot frame stalls. Most-recent-
   *  wins per symbol, flushed once per UPDATE_FLUSH_MS window. */
  private pendingUpdates = new Map<string, Candle>()
  private updateFlushTimer: NodeJS.Timeout | null = null
  private static UPDATE_FLUSH_MS = 50

  constructor(intervalSec = SIMULATOR_CANDLE_INTERVAL_SEC) {
    this.intervalSec = intervalSec
  }

  start(): void {
    if (this.rollTimer) return
    this.currentBucket = this.bucketFor(Date.now())
    this.rollTimer = setInterval(() => this.maybeRoll(), 1000)
    log.debug('live candle buffer started', { intervalSec: this.intervalSec })
  }

  stop(): void {
    if (this.rollTimer) { clearInterval(this.rollTimer); this.rollTimer = null }
    if (this.updateFlushTimer) { clearTimeout(this.updateFlushTimer); this.updateFlushTimer = null }
    this.pendingUpdates.clear()
  }

  /** Seed historical bars into the buffer before starting the live stream. */
  seedHistory(symbol: string, candles: Candle[]): void {
    if (candles.length === 0) return
    const last = candles[candles.length - 1]!
    const state = this.getOrCreate(symbol, last.close)
    state.history = candles.slice(-MAX_CANDLES_PER_SYMBOL)
    log.debug('seeded history', { symbol, count: state.history.length })
  }

  /** Ingest a single price tick into the live candle. */
  ingestTick(symbol: string, price: number, volume: number, _ts: number): void {
    const state = this.getOrCreate(symbol, price)
    const c = state.current
    c.high   = Math.max(c.high, price)
    c.low    = Math.min(c.low,  price)
    c.close  = price
    c.volume += Math.max(0, volume)
    // S1-1: coalesce the per-tick update — store most-recent candle snapshot
    // and flush every UPDATE_FLUSH_MS ms. Drops ~17× of intra-bar events
    // on a 20Hz feed without losing data (most-recent-wins, candle close is
    // emitted separately by maybeRoll with isNew=true).
    this.pendingUpdates.set(symbol, { ...c })
    this.scheduleFlush()
  }

  /** Schedule a coalesced flush of all pending intra-bar updates. Idempotent —
   *  one timer per window, regardless of how many ticks accumulate. */
  private scheduleFlush(): void {
    if (this.updateFlushTimer) return
    this.updateFlushTimer = setTimeout(() => this.flushPendingUpdates(), LiveCandleBuffer.UPDATE_FLUSH_MS)
  }

  private flushPendingUpdates(): void {
    if (this.updateFlushTimer) {
      clearTimeout(this.updateFlushTimer)
      this.updateFlushTimer = null
    }
    for (const [sym, candle] of this.pendingUpdates) {
      for (const l of this.listeners) l(sym, candle, false)
    }
    this.pendingUpdates.clear()
  }

  onCandle(fn: CandleListener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getCandles(symbol: string, limit = 500): Candle[] {
    const state = this.states.get(symbol)
    if (!state) return []
    return [...state.history, state.current].slice(-limit)
  }

  private bucketFor(ms: number): number {
    return Math.floor(ms / 1000 / this.intervalSec) * this.intervalSec
  }

  private maybeRoll(): void {
    const bucket = this.bucketFor(Date.now())
    if (bucket === this.currentBucket) return
    // S1-1: drop any pending intra-bar updates before rolling — the close
    // emit below covers the same data, and a stale isNew=false arriving
    // AFTER isNew=true would confuse the renderer's candle ordering.
    this.pendingUpdates.clear()
    if (this.updateFlushTimer) {
      clearTimeout(this.updateFlushTimer)
      this.updateFlushTimer = null
    }
    // Roll all symbols
    for (const [symbol, state] of this.states) {
      const closed = { ...state.current }
      state.history.push(closed)
      if (state.history.length > MAX_CANDLES_PER_SYMBOL) state.history.shift()
      for (const l of this.listeners) l(symbol, closed, false) // finalised

      const next: Candle = {
        time:   bucket,
        open:   closed.close,
        high:   closed.close,
        low:    closed.close,
        close:  closed.close,
        volume: 0,
      }
      state.current = next
      for (const l of this.listeners) l(symbol, { ...next }, true) // new candle
    }
    this.currentBucket = bucket
  }

  private getOrCreate(symbol: string, price: number): CandleState {
    let state = this.states.get(symbol)
    if (!state) {
      const bucket = this.bucketFor(Date.now())
      const candle: Candle = { time: bucket, open: price, high: price, low: price, close: price, volume: 0 }
      state = { current: candle, history: [] }
      this.states.set(symbol, state)
    }
    return state
  }
}
