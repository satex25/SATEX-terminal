/**
 * SATEX — Continuous Market Observer (Phase 8).
 *
 * Tick-rate intel logger that runs the entire time the engine is up. It is
 * intentionally and entirely SEPARATE from the Brain.
 *
 *   Brain (services/brain.ts):       learns on trade close only (SGD over
 *                                    captured entry features vs realized PnL).
 *   Observer (this file):            learns nothing. It records — every quote
 *                                    batch produces one Observation per symbol
 *                                    in the watchlist. Output drives the
 *                                    PatternLearner and VaultWriter checkpoints.
 *
 * Why split: the brain's reward signal is sparse (one update per closed trade,
 * dozens per session). The observer produces a dense, continuous feature
 * stream the system can introspect, replay, and learn from independently.
 * Mixing the two would poison the brain's reward shaping.
 *
 * Lifecycle: start() → on every quote-batch, capture observations into an
 * in-memory ring buffer per symbol → flush to SQLite every FLUSH_INTERVAL_MS
 * OR when the cross-symbol buffer hits MAX_BUFFER. Caller polls stats() for
 * UI display.
 */
import type { Candle, Observation, ObserverStats, Quote, IndicatorSnapshot, MarketRegime } from '@shared/types'
import { computeSnapshot } from '@shared/indicators'
import { createLogger } from './logger'
import * as db from './persistence'

const log = createLogger('observer')

const FLUSH_INTERVAL_MS = 5_000
const MAX_BUFFER        = 500
const RING_PER_SYMBOL   = 200
const VELOCITY_LOOKBACK = 10

interface SymbolRing {
  buf: Observation[]
  cursor: number
  /** Recent last prices for velocity computation. */
  priceHistory: number[]
}

export interface ObserverDeps {
  getCandles: (symbol: string, limit?: number) => Candle[]
  getWatchlist: () => string[]
}

export class MarketObserver {
  private deps: ObserverDeps
  private rings = new Map<string, SymbolRing>()
  private flushBuffer: Observation[] = []
  private flushTimer: NodeJS.Timeout | null = null
  private running = false
  private totalObserved = 0
  private lastFlushAt: number | null = null
  private lastFlushSize = 0
  /** Rolling per-minute observation rate. Buckets: [ts-60s..ts]. */
  private recentTimestamps: number[] = []

  constructor(deps: ObserverDeps) { this.deps = deps }

  start(): void {
    if (this.running) return
    this.running = true
    this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS)
    log.info('observer started', { flushIntervalMs: FLUSH_INTERVAL_MS, maxBuffer: MAX_BUFFER })
  }

  stop(): void {
    if (!this.running) return
    this.running = false
    if (this.flushTimer) { clearInterval(this.flushTimer); this.flushTimer = null }
    this.flush()
    log.info('observer stopped', { totalObserved: this.totalObserved })
  }

  /** Hook this to TradingEngine's quote-batch listener. */
  ingestQuotes(quotes: Quote[]): void {
    if (!this.running) return
    const watch = new Set(this.deps.getWatchlist())
    const ts = Date.now()
    for (const q of quotes) {
      if (!watch.has(q.symbol)) continue
      const obs = this.observationFromQuote(q, ts)
      if (!obs) continue
      this.recordToRing(obs)
      this.flushBuffer.push(obs)
      this.totalObserved++
      this.recentTimestamps.push(ts)
    }
    // Trim per-minute window
    const cutoff = ts - 60_000
    while (this.recentTimestamps.length > 0 && this.recentTimestamps[0]! < cutoff) {
      this.recentTimestamps.shift()
    }
    if (this.flushBuffer.length >= MAX_BUFFER) this.flush()
  }

  /** Recent ring for a symbol (newest last). */
  getRecent(symbol: string, limit = RING_PER_SYMBOL): Observation[] {
    const ring = this.rings.get(symbol)
    if (!ring) return []
    const out = ring.buf.slice(0, ring.cursor)
    return out.slice(-limit)
  }

  stats(): ObserverStats {
    return {
      running: this.running,
      totalObserved: this.totalObserved,
      observationsPerMinute: this.recentTimestamps.length,
      symbolsTracked: this.rings.size,
      bufferedRows: this.flushBuffer.length,
      lastFlushAt: this.lastFlushAt,
      lastFlushSize: this.lastFlushSize,
    }
  }

  // ── internal ────────────────────────────────────────────────────────────────

  private observationFromQuote(q: Quote, ts: number): Observation | null {
    const candles = this.deps.getCandles(q.symbol, 200)
    if (candles.length < 21) return null  // need enough history for indicators
    let ind: IndicatorSnapshot
    try { ind = computeSnapshot(q.symbol, candles) } catch { return null }

    const mid = (q.bid + q.ask) / 2 || q.last
    const spreadBps = q.last > 0 ? ((q.ask - q.bid) / q.last) * 10_000 : 0
    const velocityBps = this.computeVelocity(q.symbol, q.last)
    const regime = classifyRegime(ind, velocityBps)

    return {
      ts, symbol: q.symbol,
      last: q.last, mid, spreadBps, velocityBps,
      ema9: ind.ema9, ema21: ind.ema21, ema50: ind.ema50,
      rsi14: ind.rsi14, atr14: ind.atr14, vwap: ind.vwap,
      trendStrength: ind.trendStrength, regime,
    }
  }

  private computeVelocity(symbol: string, last: number): number {
    let ring = this.rings.get(symbol)
    if (!ring) {
      ring = { buf: [], cursor: 0, priceHistory: [] }
      this.rings.set(symbol, ring)
    }
    ring.priceHistory.push(last)
    if (ring.priceHistory.length > VELOCITY_LOOKBACK + 1) ring.priceHistory.shift()
    if (ring.priceHistory.length <= 1) return 0
    const prev = ring.priceHistory[0]!
    return prev > 0 ? ((last - prev) / prev) * 10_000 : 0
  }

  private recordToRing(obs: Observation): void {
    let ring = this.rings.get(obs.symbol)
    if (!ring) {
      ring = { buf: [], cursor: 0, priceHistory: [] }
      this.rings.set(obs.symbol, ring)
    }
    if (ring.buf.length < RING_PER_SYMBOL) {
      ring.buf.push(obs)
      ring.cursor = ring.buf.length
    } else {
      ring.buf[ring.cursor % RING_PER_SYMBOL] = obs
      ring.cursor++
    }
  }

  private flush(): void {
    if (this.flushBuffer.length === 0) return
    const batch = this.flushBuffer.splice(0)
    try {
      const n = db.insertObservations(batch)
      this.lastFlushAt = Date.now()
      this.lastFlushSize = n
      log.debug('observer flush', { rows: n })
    } catch (err) {
      log.warn('observer flush failed — dropping batch', { rows: batch.length, err: String(err) })
    }
  }
}

function classifyRegime(ind: IndicatorSnapshot, velocityBps: number): MarketRegime {
  const stack = ind.ema9 > ind.ema21 && ind.ema21 > ind.ema50
    ? 'up'
    : ind.ema9 < ind.ema21 && ind.ema21 < ind.ema50
      ? 'down'
      : 'flat'
  const fast = Math.abs(velocityBps) > 15
  const strong = Math.abs(ind.trendStrength) > 0.45
  if (stack === 'up'   && strong) return 'trend_up'
  if (stack === 'down' && strong) return 'trend_down'
  if (stack === 'flat' && !fast)  return 'range'
  if (fast && !strong) return 'chop'
  return 'unknown'
}
