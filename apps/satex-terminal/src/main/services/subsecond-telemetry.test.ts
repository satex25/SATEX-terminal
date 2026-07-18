/**
 * SATEX — Sub-second emit-rate telemetry tests (A1 Sprint 3).
 *
 * Pins the counter + 60s flush contract that powers the operator-facing
 * emit-rate log. The aggregator calls recordEmit() on every seal; the
 * telemetry service is responsible for snapshot + log + reset.
 */
import { describe, it, expect, beforeEach, vi, afterEach, type Mock } from 'vitest'
import { SubsecondTelemetry, type TelemetryDeps } from './subsecond-telemetry'

// vitest 4 tightened Mock typing: a bare vi.fn() no longer satisfies a specific
// (msg, data?) => void signature via intersection, so parameterize with the log
// fn type explicitly.
type LogFn = (msg: string, data?: Record<string, unknown>) => void

function makeSpyLogger(): NonNullable<TelemetryDeps['logger']> & {
  info:  Mock<LogFn>
  debug: Mock<LogFn>
} {
  return { info: vi.fn<LogFn>(), debug: vi.fn<LogFn>() }
}

let telemetry: SubsecondTelemetry
let spyLog: ReturnType<typeof makeSpyLogger>

beforeEach(() => {
  spyLog = makeSpyLogger()
  telemetry = new SubsecondTelemetry({ intervalMs: 60_000, logger: spyLog })
})

afterEach(() => {
  telemetry.stop()
  vi.useRealTimers()
})

describe('SubsecondTelemetry — recordEmit + flush', () => {
  it('accumulates per-(symbol, bucketMs) counts across many calls', () => {
    telemetry.recordEmit('BTC', 250)
    telemetry.recordEmit('BTC', 250)
    telemetry.recordEmit('BTC', 250)
    telemetry.recordEmit('BTC', 500)
    telemetry.recordEmit('ETH', 250)
    const result = telemetry.flushAndLog()
    expect(result.totalEmits).toBe(5)
    expect(result.rates).toEqual([
      { symbol: 'BTC', bucketMs: 250, count: 3 },
      { symbol: 'BTC', bucketMs: 500, count: 1 },
      { symbol: 'ETH', bucketMs: 250, count: 1 },
    ])
  })

  it('flushAndLog returns sorted rates for deterministic logs', () => {
    telemetry.recordEmit('ETH', 500)
    telemetry.recordEmit('BTC', 250)
    telemetry.recordEmit('ETH', 250)
    telemetry.recordEmit('BTC', 500)
    const result = telemetry.flushAndLog()
    expect(result.rates.map(r => `${r.symbol}:${r.bucketMs}`)).toEqual([
      'BTC:250', 'BTC:500', 'ETH:250', 'ETH:500',
    ])
  })

  it('flushAndLog resets counters — next flush starts from zero', () => {
    telemetry.recordEmit('BTC', 250)
    telemetry.recordEmit('BTC', 250)
    expect(telemetry.flushAndLog().totalEmits).toBe(2)
    expect(telemetry.flushAndLog().totalEmits).toBe(0)
    telemetry.recordEmit('BTC', 250)
    expect(telemetry.flushAndLog().totalEmits).toBe(1)
  })

  it('logs at INFO only when totalEmits > 0', () => {
    telemetry.flushAndLog() // empty window — no log
    expect(spyLog.info).not.toHaveBeenCalled()
    telemetry.recordEmit('BTC', 250)
    telemetry.flushAndLog() // non-empty — log fires
    expect(spyLog.info).toHaveBeenCalledTimes(1)
    expect(spyLog.info).toHaveBeenCalledWith('emit-rate', expect.objectContaining({
      totalEmits: 1,
      rates: [{ symbol: 'BTC', bucketMs: 250, count: 1 }],
    }))
  })

  it('flushAndLog returns the empty result with totalEmits=0 when nothing has been recorded', () => {
    const result = telemetry.flushAndLog()
    expect(result.totalEmits).toBe(0)
    expect(result.rates).toEqual([])
    expect(result.windowEnd).toBeGreaterThanOrEqual(result.windowStart)
  })

  it('windowStart advances after each flush — second window starts where the first ended', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 1, 12, 0, 0))
    const tel2 = new SubsecondTelemetry({ intervalMs: 60_000, logger: spyLog })
    // Advance time BEFORE the first flush so r1.windowEnd is meaningfully
    // later than r1.windowStart (otherwise both equal T0 and the post-flush
    // chain reads as a no-op).
    vi.advanceTimersByTime(60_000)
    tel2.recordEmit('BTC', 250)
    const r1 = tel2.flushAndLog()
    vi.advanceTimersByTime(60_000)
    tel2.recordEmit('BTC', 250)
    const r2 = tel2.flushAndLog()
    // Contract: each new window picks up exactly where the prior one ended.
    expect(r2.windowStart).toBe(r1.windowEnd)
    expect(r2.windowStart).toBeGreaterThan(r1.windowStart)
  })

  it('handles symbol names that contain a colon (rare but defensive)', () => {
    // The internal key is `${symbol}:${bucketMs}` — splitting on lastIndexOf
    // means a symbol with embedded colons still resolves correctly.
    telemetry.recordEmit('FOO:BAR', 250)
    const result = telemetry.flushAndLog()
    expect(result.rates).toEqual([{ symbol: 'FOO:BAR', bucketMs: 250, count: 1 }])
  })
})

describe('SubsecondTelemetry — schedule + lifecycle', () => {
  it('start() schedules a flush every intervalMs', () => {
    vi.useFakeTimers()
    telemetry.start()
    telemetry.recordEmit('BTC', 250)
    vi.advanceTimersByTime(60_000)
    expect(spyLog.info).toHaveBeenCalledTimes(1)
    telemetry.recordEmit('BTC', 250)
    vi.advanceTimersByTime(60_000)
    expect(spyLog.info).toHaveBeenCalledTimes(2)
  })

  it('start() is idempotent — second call while running is a no-op', () => {
    vi.useFakeTimers()
    telemetry.start()
    telemetry.start()
    telemetry.recordEmit('BTC', 250)
    vi.advanceTimersByTime(60_000)
    expect(spyLog.info).toHaveBeenCalledTimes(1) // only one timer scheduled
  })

  it('start() does NOT do an immediate flush', () => {
    vi.useFakeTimers()
    telemetry.recordEmit('BTC', 250)
    telemetry.start()
    expect(spyLog.info).not.toHaveBeenCalled()
    vi.advanceTimersByTime(59_999)
    expect(spyLog.info).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(spyLog.info).toHaveBeenCalledTimes(1)
  })

  it('stop() halts further flushes but does NOT flush the current window', () => {
    vi.useFakeTimers()
    telemetry.start()
    telemetry.recordEmit('BTC', 250)
    telemetry.stop()
    vi.advanceTimersByTime(60_000 * 5)
    // No flush fired — the pending count stays in the counter.
    expect(spyLog.info).not.toHaveBeenCalled()
  })

  it('stop() is idempotent', () => {
    expect(() => { telemetry.stop(); telemetry.stop() }).not.toThrow()
    expect(telemetry._isRunning()).toBe(false)
  })
})
