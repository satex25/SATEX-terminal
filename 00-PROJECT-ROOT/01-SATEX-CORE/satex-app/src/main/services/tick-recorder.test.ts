/**
 * SATEX — TickRecorder flush retry tests (B1, v0.4.3).
 *
 * Locks down the 2026-05-18 fix: pre-fix `flush()` moved the buffer reference
 * into a local before calling `insertTickBatch`, so an insert failure dropped
 * the rows silently. The fix copies (slice), splices only on success, and
 * accumulates `failedFlushCount` in catch. This file pins all three semantics
 * with mocked persistence + fake timers — no SQLite handle required.
 *
 * Also pins the bounded-overflow behavior during sustained outage: when the
 * buffer exceeds MAX_BUFFER * 4 (16000 rows ≈ 1.6 MB) and flush is still
 * failing, the oldest rows get dropped to cap memory.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Quote } from '../../shared/types'

const mockInsertTickBatch    = vi.fn()
const mockGetTapeBounds      = vi.fn()
const mockUpsertTapeManifest = vi.fn()

vi.mock('./persistence', () => ({
  insertTickBatch:     (rows: unknown[]) => mockInsertTickBatch(rows),
  getTapeBounds:       (sid: string) => mockGetTapeBounds(sid),
  upsertTapeManifest:  (m: unknown) => mockUpsertTapeManifest(m),
}))

import { TickRecorder } from './tick-recorder'

function mkq(symbol: string, ts: number, price = 100): Quote {
  return {
    symbol,
    name: symbol,
    assetClass: 'equity',
    last: price,
    bid: price - 0.01,
    ask: price + 0.01,
    prevClose: price,
    change: 0,
    changePct: 0,
    volume: 0,
    vwap: price,
    sparkline: [],
    timestamp: ts,
  }
}

beforeEach(() => {
  mockInsertTickBatch.mockReset()
  mockGetTapeBounds.mockReset().mockReturnValue({ count: 0, firstTs: null, lastTs: null })
  mockUpsertTapeManifest.mockReset()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('TickRecorder.flush — retry semantics (B1, v0.4.3)', () => {
  it('preserves buffer rows on flush failure (no row loss)', () => {
    mockInsertTickBatch.mockImplementation(() => { throw new Error('SQLITE_BUSY') })
    const rec = new TickRecorder('s-test')
    rec.start()
    rec.ingest([
      mkq('AAA', 1_000_000_000),
      mkq('BBB', 1_000_000_000),
      mkq('CCC', 1_000_000_000),
    ])
    expect(rec.stats().buffered).toBe(3)
    // Trigger one timer-driven flush() pass.
    vi.advanceTimersByTime(1_100)
    // Pre-fix this would have been 0 (rows dropped); post-fix the buffer is intact.
    expect(rec.stats().buffered).toBe(3)
    expect(rec.stats().failedFlushCount).toBe(1)
    expect(rec.stats().totalRecorded).toBe(0)
    rec.stop()
  })

  it('drains buffer + resets failedFlushCount when retry succeeds after prior failures', () => {
    mockInsertTickBatch
      .mockImplementationOnce(() => { throw new Error('SQLITE_BUSY') })
      .mockImplementationOnce(() => { throw new Error('SQLITE_BUSY') })
      .mockImplementation((rows: unknown[]) => (rows as unknown[]).length)
    const rec = new TickRecorder('s-test')
    rec.start()
    rec.ingest([
      mkq('AAA', 1_000_000_000),
      mkq('BBB', 1_000_000_000),
    ])
    vi.advanceTimersByTime(1_100)   // fail 1
    vi.advanceTimersByTime(1_100)   // fail 2
    expect(rec.stats().failedFlushCount).toBe(2)
    expect(rec.stats().buffered).toBe(2)
    vi.advanceTimersByTime(1_100)   // success
    expect(rec.stats().buffered).toBe(0)
    expect(rec.stats().failedFlushCount).toBe(0)
    expect(rec.stats().totalRecorded).toBe(2)
    rec.stop()
  })

  it('drops oldest rows when buffer exceeds MAX_BUFFER * 4 during sustained outage', () => {
    mockInsertTickBatch.mockImplementation(() => { throw new Error('PROLONGED_OUTAGE') })
    const rec = new TickRecorder('s-test')
    rec.start()
    // MAX_BUFFER = 4_000; bound is MAX_BUFFER * 4 = 16_000.
    // Ingest 18_000 distinct-symbol quotes in one batch — they all pass the
    // per-symbol throttle (each symbol's first sighting bypasses MIN_SAMPLE_MS).
    // The ingest() epilogue auto-fires flush() once at buffer.length >= MAX_BUFFER,
    // which fails. The catch-path overflow guard then drops the 2_000-row excess
    // to cap memory at the 16_000-row ceiling.
    const flood: Quote[] = []
    for (let i = 0; i < 18_000; i++) flood.push(mkq(`S${i}`, 1_000_000_000))
    rec.ingest(flood)
    expect(rec.stats().buffered).toBeLessThanOrEqual(16_000)
    expect(rec.stats().buffered).toBeGreaterThan(0)
    expect(rec.stats().failedFlushCount).toBeGreaterThanOrEqual(1)
    expect(rec.stats().totalRecorded).toBe(0)
    rec.stop()
  })

  it('does not double-write on retry (idempotent semantics)', () => {
    // INSERT OR REPLACE on (session_id, ts, symbol) PK is idempotent — but the
    // recorder must also not re-call insertTickBatch with already-drained rows.
    // After a successful flush, the next flush() sees an empty buffer and
    // returns early without calling insertTickBatch again.
    mockInsertTickBatch.mockImplementation((rows: unknown[]) => (rows as unknown[]).length)
    const rec = new TickRecorder('s-test')
    rec.start()
    rec.ingest([mkq('AAA', 1_000_000_000)])
    vi.advanceTimersByTime(1_100)  // success — drains
    const callsAfterFirstSuccess = mockInsertTickBatch.mock.calls.length
    vi.advanceTimersByTime(1_100)  // empty-buffer flush — must NOT call insert
    vi.advanceTimersByTime(1_100)  // empty-buffer flush — must NOT call insert
    expect(mockInsertTickBatch.mock.calls.length).toBe(callsAfterFirstSuccess)
    rec.stop()
  })
})
