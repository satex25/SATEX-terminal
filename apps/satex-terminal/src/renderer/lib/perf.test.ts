/**
 * SATEX — Renderer perf instrumentation tests (v0.6 Phase 5 close-out).
 *
 * Node env (no jsdom): `performance` is a Node global; `requestAnimationFrame`,
 * `cancelAnimationFrame`, and `window` are absent and stubbed where needed
 * (mirrors themeStore.test.ts). The pure math (summarizeFrames) needs no stubs.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { perf, summarizeFrames } from './perf'

describe('summarizeFrames — pure percentile / fps / jank math', () => {
  it('returns an all-zero report for no samples', () => {
    expect(summarizeFrames([])).toEqual({
      frames: 0, durationMs: 0, fps: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0,
      maxMs: 0, longFrames: 0, jankRatio: 0,
    })
  })

  it('computes nearest-rank percentiles over a known 1..100 array', () => {
    const samples = Array.from({ length: 100 }, (_, i) => i + 1) // 1..100
    const r = summarizeFrames(samples)
    expect(r.frames).toBe(100)
    expect(r.p50Ms).toBe(50)
    expect(r.p95Ms).toBe(95)
    expect(r.p99Ms).toBe(99)
    expect(r.maxMs).toBe(100)
    expect(r.longFrames).toBe(84)            // values 17..100 exceed the 16ms budget
    expect(r.jankRatio).toBeCloseTo(0.84, 5)
    expect(r.durationMs).toBe(5050)          // sum(1..100)
    expect(r.fps).toBeCloseTo((100 / 5050) * 1000, 5)
  })

  it('handles a single fast frame (no jank)', () => {
    const r = summarizeFrames([8])
    expect(r).toMatchObject({ frames: 1, p50Ms: 8, p95Ms: 8, p99Ms: 8, maxMs: 8, longFrames: 0, jankRatio: 0 })
  })

  it('handles a single slow frame (all jank)', () => {
    const r = summarizeFrames([40])
    expect(r).toMatchObject({ frames: 1, maxMs: 40, longFrames: 1, jankRatio: 1 })
  })
})

// Deterministic ms for measure(): performance.now() is read twice per measure
// call (start, finally-end). Feed pairs so each measure records an exact ms.
// All values <= 16 so the >budget warn branch (which calls performance.now()
// again) never fires and the sequence stays predictable.
function mockNowSequence(values: number[]): void {
  let i = 0
  vi.spyOn(performance, 'now').mockImplementation(() => values[i++] ?? values[values.length - 1] ?? 0)
}

describe('perf.measure / perf.stats — existing surface (characterization)', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns the wrapped fn result and records one sample', () => {
    mockNowSequence([0, 5])
    const out = perf.measure('test:passthrough', () => 42)
    expect(out).toBe(42)
    const s = perf.stats('test:passthrough')
    expect(s.count).toBe(1)
    expect(s.lastMs).toBe(5)
    expect(s.maxMs).toBe(5)
    expect(s.meanMs).toBe(5)
  })

  it('tracks count, mean, max over multiple samples', () => {
    mockNowSequence([0, 5, 100, 110, 200, 208]) // ms = 5, 10, 8
    perf.measure('test:multi', () => 0)
    perf.measure('test:multi', () => 0)
    perf.measure('test:multi', () => 0)
    const s = perf.stats('test:multi')
    expect(s.count).toBe(3)
    expect(s.lastMs).toBe(8)
    expect(s.maxMs).toBe(10)
    expect(s.meanMs).toBeCloseTo((5 + 10 + 8) / 3, 5)
  })

  it('rolls the 60-sample window but counts every sample (ring wraparound)', () => {
    const seq: number[] = []
    for (let k = 0; k < 60; k++) seq.push(k * 100, k * 100 + 5)  // 60 samples of 5ms
    seq.push(6000, 6009)                                          // 61st sample = 9ms
    mockNowSequence(seq)
    for (let k = 0; k < 61; k++) perf.measure('test:ring', () => 0)
    const s = perf.stats('test:ring')
    expect(s.count).toBe(61)                       // counts all
    expect(s.maxMs).toBe(9)                        // all-time max (9 > 5)
    expect(s.meanMs).toBeCloseTo((9 + 59 * 5) / 60, 5) // window holds last 60: one 9 + fifty-nine 5s
  })

  it('returns zeroes for an unknown tag', () => {
    expect(perf.stats('test:never')).toEqual({ count: 0, meanMs: 0, maxMs: 0, lastMs: 0 })
  })
})

describe('perf.frameProfile — RAF collector lifecycle (stubbed RAF)', () => {
  let rafCb: ((ts: number) => void) | null
  let rafId: number
  let cancelSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    rafCb = null
    rafId = 0
    vi.stubGlobal('requestAnimationFrame', (cb: (ts: number) => void) => { rafCb = cb; return ++rafId })
    cancelSpy = vi.fn()
    vi.stubGlobal('cancelAnimationFrame', cancelSpy)
    vi.spyOn(performance, 'now').mockReturnValue(0) // start()/reset() read now(); pin to 0
  })

  afterEach(() => {
    perf.frameProfile.stop()
    perf.frameProfile.reset()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('captures inter-frame deltas and summarizes on stop', () => {
    perf.frameProfile.start()
    expect(perf.frameProfile.isRunning()).toBe(true)
    rafCb!(16)  // delta = 16 - 0
    rafCb!(40)  // delta = 40 - 16 = 24
    const r = perf.frameProfile.stop()
    expect(perf.frameProfile.isRunning()).toBe(false)
    expect(r.frames).toBe(2)
    expect(r.maxMs).toBe(24)
    expect(r.longFrames).toBe(1) // only the 24ms frame exceeds 16ms
    expect(cancelSpy).toHaveBeenCalledTimes(1)
  })

  it('stop() is idempotent (cancels RAF exactly once)', () => {
    perf.frameProfile.start()
    perf.frameProfile.stop()
    perf.frameProfile.stop()
    expect(cancelSpy).toHaveBeenCalledTimes(1)
    expect(perf.frameProfile.isRunning()).toBe(false)
  })

  it('is idempotent on start (no second RAF loop)', () => {
    perf.frameProfile.start()
    perf.frameProfile.start()
    expect(rafId).toBe(1) // second start() no-ops while running
  })

  it('does not orphan the RAF loop after stop', () => {
    perf.frameProfile.start()
    const captured = rafCb!
    perf.frameProfile.stop()
    const idAfterStop = rafId
    captured(99) // a stale frame fires after stop
    expect(rafId).toBe(idAfterStop)               // loop did not reschedule
    expect(perf.frameProfile.report().frames).toBe(0) // buffer still empty: start() cleared it and the stale frame early-returned without recording
  })

  it('survives 10 start/stop cycles with no leak', () => {
    for (let k = 0; k < 10; k++) {
      perf.frameProfile.start()
      rafCb!(16)
      perf.frameProfile.stop()
    }
    expect(perf.frameProfile.isRunning()).toBe(false)
  })
})

describe('perf.frameProfile — disabled via SATEX_PERF_OFF', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules() })

  it('start() is a no-op and report() is zeroed', async () => {
    vi.stubGlobal('window', { location: { search: '?SATEX_PERF_OFF=1' } })
    const raf = vi.fn((cb: (ts: number) => void) => { void cb; return 1 })
    vi.stubGlobal('requestAnimationFrame', raf)
    vi.resetModules()
    const fresh = await import('./perf')
    fresh.perf.frameProfile.start()
    expect(raf).not.toHaveBeenCalled()        // PERF_OFF won, not the RAF-absent guard
    expect(fresh.perf.frameProfile.isRunning()).toBe(false)
    expect(fresh.perf.frameProfile.report().frames).toBe(0)
  })
})
