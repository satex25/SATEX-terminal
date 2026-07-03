/**
 * SATEX — Sub-second retention worker tests (A1 Sprint 3).
 *
 * Pins the 60s-cadence cap-enforcement contract that was lifted from the
 * aggregator's sealBucket hot path in Sprint 3. The worker is now the only
 * production caller of `trimSubSecondCandles`; these tests are the regression
 * line for that contract.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { SubsecondRetentionWorker, type RetentionPersistence } from './subsecond-retention'

/** Fake persistence — captures every trim call and lets a test inject the
 *  series list. */
class FakePersistence implements RetentionPersistence {
  series: Array<{ symbol: string; bucketMs: number }> = []
  /** Per-series deletion count to return from trim. Defaults to 0. */
  deletionsBySeries = new Map<string, number>()
  /** Per-series throw flag (set the key to true to make THAT series throw). */
  throwBySeries = new Map<string, boolean>()
  trims: Array<{ symbol: string; bucketMs: number; keep: number }> = []
  getAllSeries(): ReadonlyArray<{ symbol: string; bucketMs: number }> {
    return this.series
  }
  trim(symbol: string, bucketMs: number, keep: number): number {
    const key = `${symbol}:${bucketMs}`
    this.trims.push({ symbol, bucketMs, keep })
    if (this.throwBySeries.get(key)) throw new Error(`trim failed (test) — ${key}`)
    return this.deletionsBySeries.get(key) ?? 0
  }
}

let fake: FakePersistence
let worker: SubsecondRetentionWorker

beforeEach(() => {
  fake = new FakePersistence()
  worker = new SubsecondRetentionWorker({ persistence: fake, intervalMs: 60_000, maxCandles: 1000 })
})

afterEach(() => {
  worker.stop()
  vi.useRealTimers()
})

describe('SubsecondRetentionWorker — runOnce', () => {
  it('trims every series the persistence layer reports', () => {
    fake.series = [
      { symbol: 'BTC', bucketMs: 250 },
      { symbol: 'BTC', bucketMs: 500 },
      { symbol: 'ETH', bucketMs: 250 },
    ]
    const summary = worker.runOnce()
    expect(fake.trims).toEqual([
      { symbol: 'BTC', bucketMs: 250, keep: 1000 },
      { symbol: 'BTC', bucketMs: 500, keep: 1000 },
      { symbol: 'ETH', bucketMs: 250, keep: 1000 },
    ])
    expect(summary.seriesCount).toBe(3)
    expect(summary.rowsDeleted).toBe(0)
  })

  it('aggregates rowsDeleted across all series', () => {
    fake.series = [
      { symbol: 'BTC', bucketMs: 250 },
      { symbol: 'ETH', bucketMs: 250 },
    ]
    fake.deletionsBySeries.set('BTC:250', 12)
    fake.deletionsBySeries.set('ETH:250', 7)
    const summary = worker.runOnce()
    expect(summary.rowsDeleted).toBe(19)
    expect(summary.seriesCount).toBe(2)
  })

  it('returns a clean summary when there are no series in the table', () => {
    fake.series = []
    const summary = worker.runOnce()
    expect(fake.trims).toHaveLength(0)
    expect(summary.rowsDeleted).toBe(0)
    expect(summary.seriesCount).toBe(0)
  })

  it('swallows per-series trim failures and keeps trimming the rest', () => {
    fake.series = [
      { symbol: 'BTC', bucketMs: 250 },
      { symbol: 'BTC', bucketMs: 500 },
      { symbol: 'ETH', bucketMs: 250 },
    ]
    fake.throwBySeries.set('BTC:500', true) // middle series fails
    fake.deletionsBySeries.set('BTC:250', 4)
    fake.deletionsBySeries.set('ETH:250', 6)
    const summary = worker.runOnce()
    // All three got the trim call — failure didn't short-circuit the loop.
    expect(fake.trims.map(t => `${t.symbol}:${t.bucketMs}`)).toEqual([
      'BTC:250', 'BTC:500', 'ETH:250',
    ])
    // Failed series contributes 0 to rowsDeleted; survivors contribute their counts.
    expect(summary.rowsDeleted).toBe(10)
    expect(summary.seriesCount).toBe(3)
  })

  it('honors a custom maxCandles override on the trim call', () => {
    const w2 = new SubsecondRetentionWorker({ persistence: fake, maxCandles: 50 })
    fake.series = [{ symbol: 'BTC', bucketMs: 250 }]
    w2.runOnce()
    expect(fake.trims[0]!.keep).toBe(50)
  })
})

describe('SubsecondRetentionWorker — schedule + lifecycle', () => {
  it('start() is idempotent — second call while running is a no-op', () => {
    vi.useFakeTimers()
    worker.start()
    worker.start()
    worker.start()
    expect(worker._isRunning()).toBe(true)
    // Only one timer scheduled — advancing by intervalMs once fires once.
    fake.series = [{ symbol: 'BTC', bucketMs: 250 }]
    vi.advanceTimersByTime(60_000)
    expect(fake.trims).toHaveLength(1)
  })

  it('start() does NOT fire an immediate run — first tick is at intervalMs', () => {
    vi.useFakeTimers()
    fake.series = [{ symbol: 'BTC', bucketMs: 250 }]
    worker.start()
    // Nothing yet — we're at t=0 and the interval is 60_000.
    expect(fake.trims).toHaveLength(0)
    vi.advanceTimersByTime(59_999)
    expect(fake.trims).toHaveLength(0)
    vi.advanceTimersByTime(1) // crosses 60_000
    expect(fake.trims).toHaveLength(1)
  })

  it('runs every intervalMs while started', () => {
    vi.useFakeTimers()
    fake.series = [{ symbol: 'BTC', bucketMs: 250 }]
    worker.start()
    vi.advanceTimersByTime(60_000) // 1st tick
    vi.advanceTimersByTime(60_000) // 2nd tick
    vi.advanceTimersByTime(60_000) // 3rd tick
    expect(fake.trims).toHaveLength(3)
  })

  it('stop() prevents future runs but does not retroactively cancel completed ones', () => {
    vi.useFakeTimers()
    fake.series = [{ symbol: 'BTC', bucketMs: 250 }]
    worker.start()
    vi.advanceTimersByTime(60_000)
    expect(fake.trims).toHaveLength(1)
    worker.stop()
    vi.advanceTimersByTime(60_000 * 5)
    expect(fake.trims).toHaveLength(1) // no further calls after stop
  })

  it('stop() is idempotent — second call on a stopped worker is a no-op', () => {
    worker.stop()
    expect(() => worker.stop()).not.toThrow()
    expect(worker._isRunning()).toBe(false)
  })

  it('survives a top-level throw from getAllSeries without crashing the timer', () => {
    vi.useFakeTimers()
    const breakable: RetentionPersistence = {
      getAllSeries: vi.fn()
        .mockImplementationOnce(() => { throw new Error('DB locked (test)') })
        .mockImplementationOnce(() => []),
      trim: vi.fn().mockReturnValue(0),
    }
    const w2 = new SubsecondRetentionWorker({ persistence: breakable })
    w2.start()
    vi.advanceTimersByTime(60_000) // first tick — throws
    vi.advanceTimersByTime(60_000) // second tick — survives
    expect(breakable.getAllSeries).toHaveBeenCalledTimes(2)
    w2.stop()
  })
})
