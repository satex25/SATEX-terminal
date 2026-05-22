/**
 * SATEX — Renderer performance instrumentation (Phase 10.2 · 2026-05-15)
 *
 * Tiny module to time hot paths in the renderer and surface regressions as
 * console warnings. No external dependencies. Globally disable via the
 * `SATEX_PERF_OFF=1` query string flag (read once at import time).
 *
 * Usage:
 *   import { perf } from '../lib/perf'
 *
 *   // Time a synchronous block:
 *   perf.measure('quad:render', () => { renderQuadCharts(...) })
 *
 *   // Time anything; returns whatever the fn returned:
 *   const result = perf.measure('compute:slip', () => computeSlippage(...))
 *
 *   // Get the rolling stats for a tag (mean/max over last N samples):
 *   perf.stats('quad:render')  // { count, meanMs, maxMs, lastMs }
 *
 *   // Frame-budget watcher for a hot React render path:
 *   useEffect(() => perf.frameWatch(), [])
 *
 * Budget: 16ms = one frame at 60fps. Anything above that is flagged.
 * Cap warnings at 1/sec per tag so we don't carpet-bomb the console.
 */

const PERF_OFF = typeof window !== 'undefined' && window.location.search.includes('SATEX_PERF_OFF=1')
const FRAME_BUDGET_MS = 16
const WARN_THROTTLE_MS = 1_000
const MAX_SAMPLES_PER_TAG = 60

interface Bucket {
  samples: number[]   // ring buffer
  cursor:  number
  count:   number
  maxMs:   number
  lastMs:  number
  lastWarnAt: number
}

const buckets = new Map<string, Bucket>()

function getBucket(tag: string): Bucket {
  let b = buckets.get(tag)
  if (!b) {
    b = {
      samples: new Array(MAX_SAMPLES_PER_TAG).fill(0),
      cursor:  0,
      count:   0,
      maxMs:   0,
      lastMs:  0,
      lastWarnAt: 0,
    }
    buckets.set(tag, b)
  }
  return b
}

function record(tag: string, ms: number): void {
  const b = getBucket(tag)
  b.samples[b.cursor] = ms
  b.cursor = (b.cursor + 1) % MAX_SAMPLES_PER_TAG
  b.count++
  b.lastMs = ms
  if (ms > b.maxMs) b.maxMs = ms
  if (ms > FRAME_BUDGET_MS) {
    const now = performance.now()
    if (now - b.lastWarnAt > WARN_THROTTLE_MS) {
      b.lastWarnAt = now
      // Use console.warn so DevTools surfaces it but it doesn't poison error counts.
      console.warn(`[perf] ${tag} ${ms.toFixed(1)}ms (budget ${FRAME_BUDGET_MS}ms, max ${b.maxMs.toFixed(1)}ms, samples ${b.count})`)
    }
  }
}

export interface PerfStats {
  count:  number
  meanMs: number
  maxMs:  number
  lastMs: number
}

export interface FrameProfileReport {
  frames:     number   // total frames captured in the window
  durationMs: number   // sum of inter-frame deltas (wall-clock of the window)
  fps:        number   // frames / (durationMs/1000)
  p50Ms:      number
  p95Ms:      number
  p99Ms:      number
  maxMs:      number
  longFrames: number   // frame deltas > FRAME_BUDGET_MS (16)
  jankRatio:  number   // longFrames / frames (0 when frames === 0)
}

/** Pure summary of frame deltas (ms). No RAF / window — Node-testable.
 *  Percentiles use nearest-rank on a sorted copy. */
export function summarizeFrames(samples: readonly number[]): FrameProfileReport {
  const n = samples.length
  if (n === 0) {
    return { frames: 0, durationMs: 0, fps: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, maxMs: 0, longFrames: 0, jankRatio: 0 }
  }
  const sorted = [...samples].sort((a, b) => a - b)
  const pct = (p: number): number => sorted[Math.min(n - 1, Math.max(0, Math.ceil((p / 100) * n) - 1))]!
  let durationMs = 0
  let longFrames = 0
  for (const s of samples) {
    durationMs += s
    if (s > FRAME_BUDGET_MS) longFrames++
  }
  return {
    frames:     n,
    durationMs,
    fps:        durationMs > 0 ? (n / durationMs) * 1000 : 0,
    p50Ms:      pct(50),
    p95Ms:      pct(95),
    p99Ms:      pct(99),
    maxMs:      sorted[n - 1]!,
    longFrames,
    jankRatio:  longFrames / n,
  }
}

const frameProfileState = { running: false, raf: 0, lastTs: 0, samples: [] as number[] }

export const perf = {
  /** Measure a synchronous function call. Returns whatever the fn returned. */
  measure<T>(tag: string, fn: () => T): T {
    if (PERF_OFF) return fn()
    const start = performance.now()
    try {
      return fn()
    } finally {
      record(tag, performance.now() - start)
    }
  },

  /** Mark a point in time without measuring an end. Useful for ad-hoc spans. */
  mark(tag: string): () => void {
    if (PERF_OFF) return () => { /* no-op */ }
    const start = performance.now()
    return () => record(tag, performance.now() - start)
  },

  /** Pull rolling stats for a tag. */
  stats(tag: string): PerfStats {
    const b = buckets.get(tag)
    if (!b || b.count === 0) {
      return { count: 0, meanMs: 0, maxMs: 0, lastMs: 0 }
    }
    const window = Math.min(b.count, MAX_SAMPLES_PER_TAG)
    let sum = 0
    for (let i = 0; i < window; i++) sum += b.samples[i] ?? 0
    return {
      count:  b.count,
      meanMs: sum / window,
      maxMs:  b.maxMs,
      lastMs: b.lastMs,
    }
  },

  /** Dump all perf stats to the console — call from DevTools while debugging. */
  dump(): Record<string, PerfStats> {
    const out: Record<string, PerfStats> = {}
    for (const tag of buckets.keys()) out[tag] = this.stats(tag)
    return out
  },

  /** Frame-budget watcher: uses requestAnimationFrame to detect long frames.
   *  Returns a cleanup fn. Call from useEffect in your hottest panel. */
  frameWatch(): () => void {
    if (PERF_OFF) return () => { /* no-op */ }
    let raf = 0
    let lastTs = performance.now()
    const loop = (ts: number) => {
      const delta = ts - lastTs
      lastTs = ts
      // Anything > 2× budget = clear stutter. Don't record every frame to
      // avoid bias; only record outliers.
      if (delta > FRAME_BUDGET_MS * 2) record('frame:long', delta)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  },

  /** Harness-only frame profiler. Captures EVERY frame delta into a buffer and
   *  summarizes percentiles on demand. Separate from frameWatch (outlier-only).
   *  Only the E2E perf canary starts it, so production cost is zero. */
  frameProfile: {
    start(): void {
      if (PERF_OFF || frameProfileState.running) return
      if (typeof requestAnimationFrame === 'undefined') return // non-browser: no-op
      frameProfileState.running = true
      frameProfileState.samples = []
      frameProfileState.lastTs = performance.now()
      const loop = (ts: number): void => {
        if (!frameProfileState.running) return
        frameProfileState.samples.push(ts - frameProfileState.lastTs)
        frameProfileState.lastTs = ts
        frameProfileState.raf = requestAnimationFrame(loop)
      }
      frameProfileState.raf = requestAnimationFrame(loop)
    },
    stop(): FrameProfileReport {
      if (frameProfileState.running) {
        frameProfileState.running = false
        if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(frameProfileState.raf)
      }
      return summarizeFrames(frameProfileState.samples)
    },
    report(): FrameProfileReport {
      return summarizeFrames(frameProfileState.samples)
    },
    reset(): void {
      frameProfileState.samples = []
      frameProfileState.lastTs = performance.now()
    },
    isRunning(): boolean {
      return frameProfileState.running
    },
  },
}

// Expose to window for quick DevTools poking. No-op outside browser.
if (typeof window !== 'undefined') {
  ;(window as unknown as { satexPerf?: typeof perf }).satexPerf = perf
}
