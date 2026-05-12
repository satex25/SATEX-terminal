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
    // Emit the updated live candle (isNew=false = update to existing candle)
    for (const l of this.listeners) l(symbol, { ...c }, false)
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
