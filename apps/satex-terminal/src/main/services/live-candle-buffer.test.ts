/**
 * SATEX — LiveCandleBuffer tests (coverage sweep, 2026-07-03 · P-076).
 *
 * New-file-only suite. Source (`live-candle-buffer.ts`) is byte-for-byte
 * unchanged. Pins the observable contract of the per-symbol tick→OHLC buffer:
 * OHLC aggregation, negative-volume clamp, the bounded-growth cap
 * (`MAX_CANDLES_PER_SYMBOL`), the intra-bar coalesced flush (most-recent-wins),
 * the bucket-roll fill-forward, and — the point of the suite — the
 * `onCandle` unsubscribe contract (the PR#6 / P-041 / P-043 / P-046 listener-
 * leak class). Pure in-memory logic: no electron, no SQLite. Fake timers drive
 * the flush/roll/emit paths deterministically (vitest fakes Date by default).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { LiveCandleBuffer } from './live-candle-buffer'
import { MAX_CANDLES_PER_SYMBOL } from '@shared/constants'
import type { Candle } from '@shared/types'

function makeCandle(time: number, close: number): Candle {
  return { time, open: close, high: close, low: close, close, volume: 0 }
}

describe('LiveCandleBuffer', () => {
  let buf: LiveCandleBuffer

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    buf = new LiveCandleBuffer(1) // 1s interval (SIMULATOR_CANDLE_INTERVAL_SEC)
  })

  afterEach(() => {
    buf.stop()
    vi.useRealTimers()
  })

  describe('ingestTick — OHLC aggregation', () => {
    it('creates a symbol candle seeded from the first tick', () => {
      buf.ingestTick('AAPL', 100, 5, 0)
      const candles = buf.getCandles('AAPL')
      expect(candles).toHaveLength(1)
      expect(candles[0]).toMatchObject({ open: 100, high: 100, low: 100, close: 100, volume: 5 })
    })

    it('aggregates high/low/close/volume across ticks in the same bucket', () => {
      buf.ingestTick('AAPL', 100, 1, 0)
      buf.ingestTick('AAPL', 105, 2, 0)
      buf.ingestTick('AAPL', 95, 3, 0)
      buf.ingestTick('AAPL', 102, 4, 0)
      const c = buf.getCandles('AAPL')[0]!
      expect(c.open).toBe(100)
      expect(c.high).toBe(105)
      expect(c.low).toBe(95)
      expect(c.close).toBe(102)
      expect(c.volume).toBe(10)
    })

    it('clamps negative volume to zero (Math.max(0, volume))', () => {
      buf.ingestTick('AAPL', 100, 5, 0)
      buf.ingestTick('AAPL', 100, -3, 0)
      expect(buf.getCandles('AAPL')[0]!.volume).toBe(5)
    })

    it('keeps per-symbol state isolated', () => {
      buf.ingestTick('AAPL', 100, 1, 0)
      buf.ingestTick('MSFT', 200, 2, 0)
      expect(buf.getCandles('AAPL')[0]!.close).toBe(100)
      expect(buf.getCandles('MSFT')[0]!.close).toBe(200)
    })
  })

  describe('getCandles', () => {
    it('returns [] for an unknown symbol (degenerate/empty path)', () => {
      expect(buf.getCandles('NOPE')).toEqual([])
    })

    it('respects the limit argument, returning the most recent N', () => {
      buf.seedHistory('AAPL', Array.from({ length: 10 }, (_, i) => makeCandle(i, 100 + i)))
      // seedHistory creates a synthetic `current` candle (seeded from the last
      // close) via getOrCreate, so getCandles = [...history(10), current] = 11.
      expect(buf.getCandles('AAPL')).toHaveLength(11)
      expect(buf.getCandles('AAPL', 3)).toHaveLength(3)
      // newest entry is the synthetic current, seeded from the last seed close
      expect(buf.getCandles('AAPL').at(-1)!.close).toBe(109)
    })
  })

  describe('seedHistory — bounded growth', () => {
    it('is a no-op for an empty array (creates no state)', () => {
      buf.seedHistory('AAPL', [])
      expect(buf.getCandles('AAPL')).toEqual([])
    })

    it('caps seeded history at MAX_CANDLES_PER_SYMBOL, keeping the most recent', () => {
      const over = MAX_CANDLES_PER_SYMBOL + 50
      const seed = Array.from({ length: over }, (_, i) => makeCandle(i, i))
      buf.seedHistory('AAPL', seed)
      const kept = buf.getCandles('AAPL', over) // ask for more than the cap
      // history is capped at MAX; getCandles appends the synthetic current
      // candle (seeded from the last close), so the returned length is MAX + 1.
      expect(kept).toHaveLength(MAX_CANDLES_PER_SYMBOL + 1)
      // most-recent entry is the synthetic current, seeded from the last close
      expect(kept[kept.length - 1]!.close).toBe(over - 1)
      // oldest surviving history entry is exactly (over - MAX): earliest dropped
      expect(kept[0]!.close).toBe(over - MAX_CANDLES_PER_SYMBOL)
    })
  })

  describe('onCandle — listener + unsubscribe (leak class)', () => {
    it('delivers coalesced intra-bar updates (most-recent-wins, one emit/window)', () => {
      const seen: Array<[string, Candle, boolean]> = []
      buf.onCandle((sym, candle, isNew) => seen.push([sym, { ...candle }, isNew]))
      buf.ingestTick('AAPL', 100, 1, 0)
      buf.ingestTick('AAPL', 101, 1, 0)
      buf.ingestTick('AAPL', 102, 1, 0)
      vi.advanceTimersByTime(50) // UPDATE_FLUSH_MS
      const intra = seen.filter(([, , isNew]) => isNew === false)
      expect(intra).toHaveLength(1)
      expect(intra[0]![1].close).toBe(102) // most-recent-wins
    })

    it('unsubscribe removes the listener — no further emits after off()', () => {
      const fn = vi.fn()
      const off = buf.onCandle(fn)
      buf.ingestTick('AAPL', 100, 1, 0)
      vi.advanceTimersByTime(50)
      const callsBefore = fn.mock.calls.length
      expect(callsBefore).toBeGreaterThan(0)

      off()
      buf.ingestTick('AAPL', 101, 1, 0)
      vi.advanceTimersByTime(50)
      expect(fn.mock.calls.length).toBe(callsBefore) // frozen: no leak
    })
  })

  describe('start / stop lifecycle', () => {
    it('stop() clears the pending flush so it never fires', () => {
      const fn = vi.fn()
      buf.onCandle(fn)
      buf.ingestTick('AAPL', 100, 1, 0) // schedules a 50ms flush timer
      buf.stop()
      vi.advanceTimersByTime(1000)
      expect(fn).not.toHaveBeenCalled()
    })

    it('start() and stop() are idempotent (no throw on repeat calls)', () => {
      expect(() => {
        buf.start()
        buf.start()
        buf.stop()
        buf.stop()
      }).not.toThrow()
    })
  })

  describe('maybeRoll — bucket roll fill-forward', () => {
    it('closes the current candle into history and emits a new candle (isNew=true) on bucket crossing', () => {
      const seen: Array<[string, Candle, boolean]> = []
      buf.onCandle((sym, candle, isNew) => seen.push([sym, { ...candle }, isNew]))
      buf.start() // currentBucket = bucketFor(0) = 0
      buf.ingestTick('AAPL', 100, 1, 0)

      // rollTimer fires every 1000ms; at t=1000, bucketFor(1000) = 1 != 0 → roll.
      vi.advanceTimersByTime(1000)

      // history now holds the closed t=0 candle; current is the fresh t=1 candle.
      const candles = buf.getCandles('AAPL')
      expect(candles.length).toBe(2)
      expect(candles[0]!.time).toBe(0) // closed
      expect(candles[1]!.time).toBe(1) // new current

      // at least one emit carried isNew=true (the newly opened candle)
      expect(seen.some(([, , isNew]) => isNew === true)).toBe(true)
    })
  })
})
