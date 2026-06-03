/**
 * SATEX — ReplaySource regression tests.
 *
 * Locks down 2026-05-17 bug: warmup() previously short-circuited after the
 * first 30s page when `rows.length < 8000`. For sparse 1-min historical
 * tape (~24 rows per 30s window) this exited after one page and left the
 * chart with only a few seconds of candles instead of the full session.
 *
 * Tests mock `./persistence` so we don't need a real SQLite handle.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { TickTapeRow } from '../../shared/types'

const mockReadTapeRange  = vi.fn()
const mockGetTapeBounds  = vi.fn()
const mockGetTapeManifest = vi.fn()

vi.mock('./persistence', () => ({
  readTapeRange: (sid: string, from: number, to: number, lim: number) =>
    mockReadTapeRange(sid, from, to, lim),
  getTapeBounds: (sid: string) => mockGetTapeBounds(sid),
  getTapeManifest: (sid: string) => mockGetTapeManifest(sid),
}))

// Imported after mock so the vi.mock hoisting applies.
import { ReplaySource } from './replay-source'

beforeEach(() => {
  mockReadTapeRange.mockReset()
  mockGetTapeBounds.mockReset()
  mockGetTapeManifest.mockReset().mockReturnValue(null)
})

describe('ReplaySource.warmup — sparse-tape regression', () => {
  it('processes the full range when rows are sparse (1-min historical tape)', () => {
    // Emulate the historical-importer output: 4 OHLC subticks per minute over a
    // 1-hour window for one symbol (NVDA). ~24 rows per 30s page — far below
    // the 8000-row page cap that the old break condition compared against.
    const T0 = 1_000_000_000_000
    const TAPE_LEN_MS = 60 * 60 * 1000      // 1 hour
    const SUBTICK_SPACING_MS = 15_000        // 4 per minute
    const SYM = 'NVDA'
    const PRICE = 228.50

    const allRows: TickTapeRow[] = []
    for (let t = T0; t < T0 + TAPE_LEN_MS; t += SUBTICK_SPACING_MS) {
      allRows.push({
        sessionId: 'test', ts: t, symbol: SYM,
        last: PRICE, bid: PRICE - 0.01, ask: PRICE + 0.01,
        vwap: PRICE, volume: 100,
      })
    }

    mockGetTapeBounds.mockReturnValue({
      firstTs: T0,
      lastTs:  T0 + TAPE_LEN_MS - SUBTICK_SPACING_MS,
      count:   allRows.length,
    })
    mockReadTapeRange.mockImplementation(
      (_sid: string, from: number, to: number, limit: number) =>
        allRows.filter(r => r.ts >= from && r.ts <= to).slice(0, limit),
    )

    const replay = new ReplaySource('test')
    // Warmup now emits via the BULK channel (per-bucket candleListener
    // emits are suppressed to spare the IPC pipeline). Assert the full
    // snapshot arrives in one call.
    const bulkSnapshots: Array<{ sym: string; candles: number }> = []
    let bulkCandles: number[] = []
    replay.onBulkCandlesReplace((sym, candles) => {
      bulkSnapshots.push({ sym, candles: candles.length })
      if (sym === SYM) bulkCandles = candles.map(c => c.time)
    })

    // Seek to (near) the end of tape — triggers warmup over the whole range.
    replay.seek(T0 + TAPE_LEN_MS - 1)

    // Pre-fix: warmup exited after first 30s → bulk snapshot would carry
    // <40 candles for NVDA. Post-fix: full 3600 1s buckets get rolled.
    const nvda = bulkSnapshots.find(s => s.sym === SYM)
    expect(nvda).toBeDefined()
    expect(nvda!.candles).toBeGreaterThan(3500)

    const spanSec = Math.max(...bulkCandles) - Math.min(...bulkCandles)
    // candle.time is in seconds (SIMULATOR_CANDLE_INTERVAL_SEC = 1).
    expect(spanSec).toBeGreaterThan(3500)
  })

  it('still terminates when tape is dense and a window hits the page cap', () => {
    // Inverse case: ensure the inner pagination loop drains a saturated 30s
    // window correctly instead of dropping the rest. We construct exactly
    // 9000 rows inside a single 30s window so the first read fills the 8000
    // cap and the inner loop must paginate.
    const T0 = 2_000_000_000_000
    const SYM = 'SPY'
    const ROWS = 9000
    const allRows: TickTapeRow[] = []
    for (let i = 0; i < ROWS; i++) {
      allRows.push({
        sessionId: 'test', ts: T0 + i, symbol: SYM,
        last: 500, bid: 499.99, ask: 500.01, vwap: 500, volume: 1,
      })
    }
    mockGetTapeBounds.mockReturnValue({
      firstTs: T0, lastTs: T0 + ROWS - 1, count: ROWS,
    })
    mockReadTapeRange.mockImplementation(
      (_sid: string, from: number, to: number, limit: number) =>
        allRows.filter(r => r.ts >= from && r.ts <= to).slice(0, limit),
    )

    const replay = new ReplaySource('test')
    let bulkCalls = 0
    replay.onBulkCandlesReplace(() => { bulkCalls++ })
    replay.seek(T0 + ROWS - 1)

    // We don't care about the exact count — just that warmup completed
    // without hitting the safety bound and produced a bulk snapshot.
    expect(bulkCalls).toBeGreaterThanOrEqual(1)
  })
})

describe('ReplaySource.tick — wall-clock anomaly detection (B4, v0.4.3)', () => {
  // Minimal tape: 1 hour of 1Hz rows for NVDA. Cursor will sit at tapeStart;
  // the anomaly check fires before any tape read, so we don't need many rows.
  const T0 = 1_700_000_000_000
  const TAPE_LEN_MS = 60 * 60 * 1000
  const SYM = 'NVDA'

  function setupTape(): void {
    const allRows: TickTapeRow[] = []
    for (let t = T0; t < T0 + TAPE_LEN_MS; t += 1_000) {
      allRows.push({
        sessionId: 'test', ts: t, symbol: SYM,
        last: 100, bid: 99.99, ask: 100.01, vwap: 100, volume: 1,
      })
    }
    mockGetTapeBounds.mockReturnValue({
      firstTs: T0, lastTs: T0 + TAPE_LEN_MS - 1_000, count: allRows.length,
    })
    mockReadTapeRange.mockImplementation(
      (_sid: string, from: number, to: number, limit: number) =>
        allRows.filter(r => r.ts >= from && r.ts <= to).slice(0, limit),
    )
  }

  beforeEach(() => {
    setupTape()
    vi.useFakeTimers({ now: T0 })
  })
  afterEach(() => { vi.useRealTimers() })

  it('pauses with autoPausedReason="wall-clock-backjump" when Date.now() regresses > 5s', () => {
    const replay = new ReplaySource('test', { speed: 1 })
    replay.start()
    // start() → unpause() → tick() once synchronously → lastTickWallTs = T0
    expect(replay.snapshot().paused).toBe(false)
    expect(replay.snapshot().autoPausedReason).toBeNull()

    // Backjump the wall clock 30 seconds, then trigger the next interval tick.
    vi.setSystemTime(T0 - 30_000)
    vi.advanceTimersByTime(20)

    const snap = replay.snapshot()
    expect(snap.paused).toBe(true)
    expect(snap.autoPausedReason).toBe('wall-clock-backjump')
  })

  it('pauses with autoPausedReason="suspend-detected" when Date.now() jumps forward > 5s', () => {
    const replay = new ReplaySource('test', { speed: 1 })
    replay.start()
    expect(replay.snapshot().paused).toBe(false)

    // Simulate laptop suspend: wall clock leaps forward 30 seconds.
    vi.setSystemTime(T0 + 30_000)
    vi.advanceTimersByTime(20)

    const snap = replay.snapshot()
    expect(snap.paused).toBe(true)
    expect(snap.autoPausedReason).toBe('suspend-detected')
  })

  it('does NOT pause for normal sub-5s tick intervals', () => {
    const replay = new ReplaySource('test', { speed: 1 })
    replay.start()
    // Advance several hundred ms — each tick has wallDelta well under threshold.
    for (let i = 0; i < 20; i++) vi.advanceTimersByTime(20)
    const snap = replay.snapshot()
    expect(snap.paused).toBe(false)
    expect(snap.autoPausedReason).toBeNull()
  })

  it('manual long pause + resume does NOT trip the anomaly detector', () => {
    const replay = new ReplaySource('test', { speed: 1 })
    replay.start()
    // Tick a few times normally.
    vi.advanceTimersByTime(100)
    // User manually pauses, walks away for an hour.
    replay.pause()
    vi.setSystemTime(T0 + 60 * 60 * 1000)
    // User comes back and resumes. unpause() must reset lastTickWallTs so the
    // first post-resume tick doesn't see a 1-hour wallDelta and flag it.
    replay.resume()
    vi.advanceTimersByTime(20)
    const snap = replay.snapshot()
    expect(snap.paused).toBe(false)
    expect(snap.autoPausedReason).toBeNull()
  })

  it('speed change during play does NOT trip the anomaly detector', () => {
    const replay = new ReplaySource('test', { speed: 1 })
    replay.start()
    vi.advanceTimersByTime(100)
    // Speed change re-anchors AND resets lastTickWallTs. The next tick after
    // a long-ish gap (which can happen if the test runner pauses) must still
    // produce a clean wallDelta=0 baseline.
    vi.setSystemTime(T0 + 10_000)  // 10s gap before setSpeed
    replay.setSpeed(5)
    vi.advanceTimersByTime(20)
    const snap = replay.snapshot()
    expect(snap.paused).toBe(false)
    expect(snap.autoPausedReason).toBeNull()
    expect(snap.speed).toBe(5)
  })
})

describe('ReplaySource — F.1 L1.A interface compliance', () => {
  // Minimal tape setup reused across all tests in this describe block.
  const T0 = 3_000_000_000_000
  const TAPE_LEN_MS = 5_000

  beforeEach(() => {
    mockReadTapeRange.mockReset()
    mockGetTapeBounds.mockReset()
    mockGetTapeManifest.mockReset().mockReturnValue(null)

    mockGetTapeBounds.mockReturnValue({
      firstTs: T0, lastTs: T0 + TAPE_LEN_MS, count: 5,
    })
    mockReadTapeRange.mockReturnValue([])
  })

  it('getBars returns []', async () => {
    const replay = new ReplaySource('test')
    expect(await replay.getBars('AAPL', '1Min', '2026-06-02T13:00:00Z')).toEqual([])
  })

  it('getCryptoBars returns []', async () => {
    const replay = new ReplaySource('test')
    expect(await replay.getCryptoBars('BTC', '1Min', '2026-06-02T00:00:00Z')).toEqual([])
  })

  it('getClock reports isOpen=true', async () => {
    const replay = new ReplaySource('test')
    expect((await replay.getClock()).isOpen).toBe(true)
  })

  it('isConnected is always true', () => {
    const replay = new ReplaySource('test')
    expect(replay.isConnected()).toBe(true)
  })
})
