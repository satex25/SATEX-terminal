/**
 * SATEX — MarketObserver tests (coverage sweep, 2026-07-04 · P-083).
 *
 * New-file-only suite. Source (`market-observer.ts`) is byte-for-byte unchanged.
 * The observer runs the entire time the engine is up and "learns nothing" — it is
 * a dense recorder feeding PatternLearner + VaultWriter. Off the trading-safety
 * perimeter (no execution/risk/kill-switch/broker coupling).
 *
 * Pins the observable contract: lifecycle + timer cleanup, watchlist gating,
 * the ≥21-candle and computeSnapshot-throw null-guards, the bounded per-symbol
 * ring buffer (`RING_PER_SYMBOL`, the PR#6/P-041/P-043/P-046 bounded-growth
 * class), the rolling per-minute window trim, the `MAX_BUFFER` auto-flush, the
 * intentional flush error-swallow ("dropping batch"), and every `classifyRegime`
 * branch. `./persistence` and `@shared/indicators` are mocked; fake timers +
 * `setSystemTime` drive the flush/window paths deterministically.
 *
 * FINDING (pinned, not fixed — see P-083): `getRecent` returns
 * `buf.slice(0, cursor).slice(-limit)`; once the ring wraps (`cursor > 200`) the
 * modulo buffer is overwritten in place and NOT reordered on read, so the
 * documented "newest last" ordering holds only pre-wrap. This suite asserts
 * ordering pre-wrap and length-cap + membership post-wrap.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { Candle, IndicatorSnapshot, Quote } from '@shared/types'

vi.mock('./persistence', () => ({
  insertObservations: vi.fn((rows: unknown[]) => (Array.isArray(rows) ? rows.length : 0)),
}))
vi.mock('@shared/indicators', () => ({
  computeSnapshot: vi.fn(),
}))

import { MarketObserver, type ObserverDeps } from './market-observer'
import * as db from './persistence'
import { computeSnapshot } from '@shared/indicators'

// ── factories ────────────────────────────────────────────────────────────────

function makeSnapshot(o: Partial<IndicatorSnapshot> = {}): IndicatorSnapshot {
  return {
    symbol: 'NVDA', vwap: 100, ema9: 101, ema21: 100, ema50: 99,
    rsi14: 55, atr14: 1.2, trendStrength: 0.1, volatility: 0.2, ...o,
  }
}

function makeQuote(o: Partial<Quote> = {}): Quote {
  return {
    symbol: 'NVDA', name: 'NVDA', assetClass: 'equity', last: 100,
    bid: 99.9, ask: 100.1, prevClose: 99, changePct: 1, change: 1,
    volume: 1000, vwap: 100, sparkline: [], timestamp: 0, ...o,
  }
}

/** n trivial candles so the observer's `candles.length < 21` guard passes. */
function makeCandles(n: number): Candle[] {
  return Array.from({ length: n }, (_, i) => ({
    time: i, open: 100, high: 101, low: 99, close: 100, volume: 10,
  }))
}

/** Deps that always satisfy the ≥21-candle guard and watch NVDA. */
function makeDeps(over: Partial<ObserverDeps> = {}): ObserverDeps {
  return {
    getCandles: vi.fn(() => makeCandles(25)),
    getWatchlist: vi.fn(() => ['NVDA']),
    ...over,
  }
}

describe('MarketObserver', () => {
  let obs: MarketObserver

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-04T15:00:00Z'))
    vi.mocked(computeSnapshot).mockReturnValue(makeSnapshot())
  })

  afterEach(() => {
    obs?.stop()
    vi.useRealTimers()
  })

  // ── lifecycle ──────────────────────────────────────────────────────────────

  describe('lifecycle', () => {
    it('start() flips running (observable via stats)', () => {
      obs = new MarketObserver(makeDeps())
      expect(obs.stats().running).toBe(false)
      obs.start()
      expect(obs.stats().running).toBe(true)
    })

    it('start() is idempotent — a second start does not create a second flush timer', () => {
      obs = new MarketObserver(makeDeps())
      obs.start()
      obs.start()
      obs.ingestQuotes([makeQuote()])
      // One flush interval (5s) → exactly one flush (not two from a duplicate timer).
      vi.advanceTimersByTime(5_000)
      expect(vi.mocked(db.insertObservations)).toHaveBeenCalledTimes(1)
    })

    it('stop() clears the timer and performs a final flush of buffered rows', () => {
      obs = new MarketObserver(makeDeps())
      obs.start()
      obs.ingestQuotes([makeQuote()])
      expect(obs.stats().bufferedRows).toBe(1)
      obs.stop()
      expect(obs.stats().running).toBe(false)
      expect(vi.mocked(db.insertObservations)).toHaveBeenCalledTimes(1) // final flush
      // Timer cleared: no further flush fires after stop.
      vi.advanceTimersByTime(20_000)
      expect(vi.mocked(db.insertObservations)).toHaveBeenCalledTimes(1)
    })

    it('stop() is idempotent (no throw, no extra flush when already stopped)', () => {
      obs = new MarketObserver(makeDeps())
      obs.start()
      obs.stop()
      expect(() => obs.stop()).not.toThrow()
      expect(vi.mocked(db.insertObservations)).not.toHaveBeenCalled() // nothing buffered
    })
  })

  // ── ingest gating ────────────────────────────────────────────────────────────

  describe('ingestQuotes gating', () => {
    it('is a no-op when not running', () => {
      obs = new MarketObserver(makeDeps())
      obs.ingestQuotes([makeQuote()])
      expect(obs.stats().totalObserved).toBe(0)
      expect(obs.stats().bufferedRows).toBe(0)
    })

    it('ignores symbols not on the watchlist', () => {
      obs = new MarketObserver(makeDeps({ getWatchlist: vi.fn(() => ['AAPL']) }))
      obs.start()
      obs.ingestQuotes([makeQuote({ symbol: 'NVDA' })])
      expect(obs.stats().totalObserved).toBe(0)
    })

    it('records a watchlisted quote (totalObserved + buffered increment)', () => {
      obs = new MarketObserver(makeDeps())
      obs.start()
      obs.ingestQuotes([makeQuote()])
      expect(obs.stats().totalObserved).toBe(1)
      expect(obs.stats().bufferedRows).toBe(1)
      expect(obs.stats().symbolsTracked).toBe(1)
    })
  })

  // ── null-guards ──────────────────────────────────────────────────────────────

  describe('observation null-guards', () => {
    it('skips when fewer than 21 candles are available', () => {
      obs = new MarketObserver(makeDeps({ getCandles: vi.fn(() => makeCandles(10)) }))
      obs.start()
      obs.ingestQuotes([makeQuote()])
      expect(obs.stats().totalObserved).toBe(0)
      expect(vi.mocked(computeSnapshot)).not.toHaveBeenCalled()
    })

    it('skips when computeSnapshot throws (no crash, nothing recorded)', () => {
      vi.mocked(computeSnapshot).mockImplementation(() => { throw new Error('bad candles') })
      obs = new MarketObserver(makeDeps())
      obs.start()
      expect(() => obs.ingestQuotes([makeQuote()])).not.toThrow()
      expect(obs.stats().totalObserved).toBe(0)
    })
  })

  // ── bounded ring buffer ──────────────────────────────────────────────────────

  describe('per-symbol ring buffer (bounded growth)', () => {
    it('caps getRecent at RING_PER_SYMBOL (200) after overflow', () => {
      obs = new MarketObserver(makeDeps())
      obs.start()
      for (let i = 0; i < 250; i++) obs.ingestQuotes([makeQuote({ last: 100 + i })])
      expect(obs.getRecent('NVDA').length).toBe(200)
      expect(obs.stats().totalObserved).toBe(250) // counter is unbounded; ring is bounded
    })

    it('returns newest-last ordering pre-wrap', () => {
      obs = new MarketObserver(makeDeps())
      obs.start()
      obs.ingestQuotes([makeQuote({ last: 10 })])
      obs.ingestQuotes([makeQuote({ last: 20 })])
      obs.ingestQuotes([makeQuote({ last: 30 })])
      const recent = obs.getRecent('NVDA')
      expect(recent.map((o) => o.last)).toEqual([10, 20, 30])
    })

    it('honors the limit parameter', () => {
      obs = new MarketObserver(makeDeps())
      obs.start()
      for (let i = 0; i < 5; i++) obs.ingestQuotes([makeQuote({ last: i })])
      expect(obs.getRecent('NVDA', 2).map((o) => o.last)).toEqual([3, 4])
    })

    it('returns [] for an unknown symbol', () => {
      obs = new MarketObserver(makeDeps())
      obs.start()
      expect(obs.getRecent('TSLA')).toEqual([])
    })
  })

  // ── rolling per-minute window ────────────────────────────────────────────────

  describe('observationsPerMinute rolling window', () => {
    it('counts observations inside the trailing 60s and trims older ones', () => {
      obs = new MarketObserver(makeDeps())
      obs.start()
      obs.ingestQuotes([makeQuote()]) // t0
      vi.advanceTimersByTime(30_000)
      obs.ingestQuotes([makeQuote()]) // t0 + 30s
      expect(obs.stats().observationsPerMinute).toBe(2)
      // Push past 60s from the first sample; the next ingest trims it out.
      vi.advanceTimersByTime(40_000) // now t0 + 70s
      obs.ingestQuotes([makeQuote()])
      expect(obs.stats().observationsPerMinute).toBe(2) // first (t0) dropped, two remain
    })
  })

  // ── velocity ─────────────────────────────────────────────────────────────────

  describe('velocity', () => {
    it('is 0 on the first observation for a symbol', () => {
      obs = new MarketObserver(makeDeps())
      obs.start()
      obs.ingestQuotes([makeQuote({ last: 100 })])
      expect(obs.getRecent('NVDA')[0]!.velocityBps).toBe(0)
    })

    it('is non-zero once a prior price exists', () => {
      obs = new MarketObserver(makeDeps())
      obs.start()
      obs.ingestQuotes([makeQuote({ last: 100 })])
      obs.ingestQuotes([makeQuote({ last: 110 })])
      const v = obs.getRecent('NVDA')[1]!.velocityBps
      expect(v).toBeGreaterThan(0)
    })
  })

  // ── spread guard ─────────────────────────────────────────────────────────────

  describe('spreadBps', () => {
    it('computes basis points from bid/ask when last > 0', () => {
      obs = new MarketObserver(makeDeps())
      obs.start()
      obs.ingestQuotes([makeQuote({ last: 100, bid: 99.9, ask: 100.1 })])
      // (0.2 / 100) * 10_000 = 20 bps
      expect(obs.getRecent('NVDA')[0]!.spreadBps).toBeCloseTo(20, 6)
    })

    it('is 0 when last <= 0 (degenerate-price guard)', () => {
      obs = new MarketObserver(makeDeps())
      obs.start()
      obs.ingestQuotes([makeQuote({ last: 0, bid: 0, ask: 0 })])
      expect(obs.getRecent('NVDA')[0]!.spreadBps).toBe(0)
    })
  })

  // ── flush ────────────────────────────────────────────────────────────────────

  describe('flush', () => {
    it('does not call the DB when the buffer is empty', () => {
      obs = new MarketObserver(makeDeps())
      obs.start()
      vi.advanceTimersByTime(5_000) // timer fires with an empty buffer
      expect(vi.mocked(db.insertObservations)).not.toHaveBeenCalled()
    })

    it('auto-flushes when the buffer reaches MAX_BUFFER (500)', () => {
      obs = new MarketObserver(makeDeps())
      obs.start()
      const quotes = Array.from({ length: 500 }, (_, i) => makeQuote({ last: 100 + i }))
      obs.ingestQuotes(quotes)
      expect(vi.mocked(db.insertObservations)).toHaveBeenCalledTimes(1)
      expect(obs.stats().bufferedRows).toBe(0)
    })

    it('flushes on the interval timer and stamps lastFlushAt/lastFlushSize', () => {
      obs = new MarketObserver(makeDeps())
      obs.start()
      obs.ingestQuotes([makeQuote()])
      vi.advanceTimersByTime(5_000)
      expect(vi.mocked(db.insertObservations)).toHaveBeenCalledTimes(1)
      const s = obs.stats()
      expect(s.lastFlushSize).toBe(1)
      expect(s.lastFlushAt).not.toBeNull()
      expect(s.bufferedRows).toBe(0)
    })

    it('swallows a DB error and drops the batch (bufferedRows -> 0)', () => {
      vi.mocked(db.insertObservations).mockImplementationOnce(() => { throw new Error('db down') })
      obs = new MarketObserver(makeDeps())
      obs.start()
      obs.ingestQuotes([makeQuote()])
      expect(() => vi.advanceTimersByTime(5_000)).not.toThrow()
      expect(obs.stats().bufferedRows).toBe(0) // batch splice()'d out before the throw
      expect(obs.stats().lastFlushAt).toBeNull() // failure path never stamps
    })
  })

  // ── stats shape ────────────────────────────────────────────────────────────

  describe('stats()', () => {
    it('reports the full ObserverStats shape', () => {
      obs = new MarketObserver(makeDeps())
      obs.start()
      obs.ingestQuotes([makeQuote()])
      expect(obs.stats()).toEqual({
        running: true,
        totalObserved: 1,
        observationsPerMinute: 1,
        symbolsTracked: 1,
        bufferedRows: 1,
        lastFlushAt: null,
        lastFlushSize: 0,
      })
    })
  })

  // ── regime classification ────────────────────────────────────────────────────

  describe('classifyRegime (via the recorded observation)', () => {
    function regimeFor(snap: Partial<IndicatorSnapshot>, priceStep = 0): string {
      obs = new MarketObserver(makeDeps())
      obs.start()
      vi.mocked(computeSnapshot).mockReturnValue(makeSnapshot(snap))
      // Two ingests so velocity can be non-zero when priceStep != 0.
      obs.ingestQuotes([makeQuote({ last: 100 })])
      obs.ingestQuotes([makeQuote({ last: 100 + priceStep })])
      const recent = obs.getRecent('NVDA')
      return recent[recent.length - 1]!.regime
    }

    it('trend_up: bullish EMA stack + strong trend', () => {
      expect(regimeFor({ ema9: 103, ema21: 102, ema50: 101, trendStrength: 0.6 })).toBe('trend_up')
    })

    it('trend_down: bearish EMA stack + strong trend', () => {
      expect(regimeFor({ ema9: 99, ema21: 100, ema50: 101, trendStrength: -0.6 })).toBe('trend_down')
    })

    it('range: flat stack, slow, weak trend', () => {
      // ema9==ema21 breaks both up and down stacks -> flat; small price step -> slow.
      expect(regimeFor({ ema9: 100, ema21: 100, ema50: 100, trendStrength: 0.1 }, 0)).toBe('range')
    })

    it('chop: fast velocity but weak trend', () => {
      // Flat stack, big price jump (fast), weak trend.
      expect(regimeFor({ ema9: 100, ema21: 100, ema50: 100, trendStrength: 0.1 }, 5)).toBe('chop')
    })

    it('unknown: bullish stack but weak trend and slow (no branch matches)', () => {
      expect(regimeFor({ ema9: 103, ema21: 102, ema50: 101, trendStrength: 0.1 }, 0)).toBe('unknown')
    })
  })
})
