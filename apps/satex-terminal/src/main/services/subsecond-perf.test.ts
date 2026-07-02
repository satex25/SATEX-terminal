/**
 * SATEX — Sub-second aggregator perf canary (A1 Sprint 3).
 *
 * Synthetic-load test that pins the engine-side contribution to chart-frame
 * latency. Generates 6000 BTC trade ticks (the design doc target — "sustained
 * 20-trade/sec BTC for 5 min" = 20 × 60 × 5 = 6000 ticks), feeds them through
 * a real `SubSecondCandleAggregator` with a noop persistence shim, and asserts
 * P95 ingest time stays well under the renderer's 16 ms frame budget.
 *
 * Scope of this canary:
 *
 *   This test measures the AGGREGATOR ingest path in the main process —
 *   ~Map.get / Map.set / Math.floor / a few comparisons per tick × 2 buckets.
 *   It does NOT measure the actual `lightweight-charts` render time in the
 *   renderer; that requires a Playwright Electron harness which is future
 *   work (see [[project_next_session]] DX section).
 *
 *   The aggregator is one component of the end-to-end frame budget; if it
 *   regresses (e.g., someone reintroduces a per-tick SQLite call), the
 *   downstream chart frame budget collapses. Bounding the engine side here
 *   means a renderer-perf regression must come from a renderer change, not
 *   from upstream tick-path bloat.
 *
 * Threshold rationale:
 *
 *   Pure JS Map ops + a few arithmetic steps should run in sub-microsecond
 *   territory on warm code. On a noisy CI runner with GC pauses, P95 should
 *   still be comfortably under 1 ms. The 5 ms ceiling here gives ~5× margin
 *   over expected before tripping — tight enough to catch real regressions
 *   (e.g., adding a synchronous DB call inside ingestTick), loose enough to
 *   avoid CI flake from incidental jitter.
 */
import { describe, it, expect } from 'vitest'
import { SubSecondCandleAggregator, type SubSecondCandle, type PersistenceShim } from './subsecond-aggregator'
import type { AlpacaTick } from './alpaca'

const SUSTAINED_TPS         = 20         // design doc: 20 trades/sec
const SUSTAINED_DURATION_S  = 5 * 60     // design doc: 5 minutes
const TOTAL_TICKS           = SUSTAINED_TPS * SUSTAINED_DURATION_S // 6000
const TICK_INTERVAL_MS      = 1000 / SUSTAINED_TPS                 // 50 ms
const WARMUP_TICKS          = 500        // JIT warm-up; not measured
const P95_BUDGET_MS         = 5          // see rationale above

/** No-op persistence — perf test cares about aggregator hot path, not I/O. */
class NoopPersistence implements PersistenceShim {
  insert(_c: SubSecondCandle): void { /* intentional no-op */ }
}

function quantile(sortedAsc: number[], q: number): number {
  if (sortedAsc.length === 0) return 0
  const idx = Math.min(sortedAsc.length - 1, Math.floor(sortedAsc.length * q))
  return sortedAsc[idx]!
}

describe('SubSecondCandleAggregator — perf canary (design doc §6 Sprint 3)', () => {
  it(`P95 ingest time stays under ${P95_BUDGET_MS} ms over ${TOTAL_TICKS} BTC trade ticks at ${SUSTAINED_TPS} tps`, () => {
    const agg = new SubSecondCandleAggregator({
      persistence: new NoopPersistence(),
      onEmit:      () => { /* noop: renderer push isn't part of the engine budget */ },
      buckets:     [250, 500],
    })

    // Warm-up phase — JIT the ingest path so we measure steady state, not
    // first-call compilation overhead.
    const baseTs = 1_700_000_000_000
    for (let i = 0; i < WARMUP_TICKS; i++) {
      agg.ingestTick(makeBtcTick(baseTs + i * TICK_INTERVAL_MS, 50_000 + Math.sin(i) * 100))
    }

    // Measurement phase — record per-tick processing time. performance.now()
    // is high-resolution; the array push is amortized constant.
    const times: number[] = new Array(TOTAL_TICKS)
    const measureBaseTs = baseTs + WARMUP_TICKS * TICK_INTERVAL_MS
    for (let i = 0; i < TOTAL_TICKS; i++) {
      const ts    = measureBaseTs + i * TICK_INTERVAL_MS
      const price = 50_000 + Math.sin(i * 0.01) * 250 // realistic micro-drift
      const t0 = performance.now()
      agg.ingestTick(makeBtcTick(ts, price))
      times[i] = performance.now() - t0
    }

    times.sort((a, b) => a - b)
    const p50 = quantile(times, 0.50)
    const p95 = quantile(times, 0.95)
    const p99 = quantile(times, 0.99)
    const max = times[times.length - 1]!

    // Log the actual numbers so a CI run that PASSES still surfaces useful
    // signal — a tightening regression (e.g., P95 climbing from 0.01 ms to
    // 3 ms) shows up in CI logs even when the assertion holds.
    console.log(`[perf-canary] p50=${p50.toFixed(4)}ms p95=${p95.toFixed(4)}ms p99=${p99.toFixed(4)}ms max=${max.toFixed(4)}ms`)

    expect(p95).toBeLessThan(P95_BUDGET_MS)
  })
})

function makeBtcTick(ts: number, price: number): AlpacaTick {
  return {
    symbol:    'BTC',
    price,
    size:      0.01,
    bid:       0,
    ask:       0,
    timestamp: ts,
    kind:      't',
  }
}
