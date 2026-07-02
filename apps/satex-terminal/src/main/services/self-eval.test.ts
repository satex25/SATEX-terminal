import { describe, it, expect, vi } from 'vitest'
import { SelfEvalService, msUntilNext, renderReportMd, type SelfEvalDeps } from './self-eval'
import type { Strategy, StrategySnapshot } from '../backtest/strategy'
import type { BacktestReport } from '@shared/backtest/types'
import type { Candle, StrategySignal } from '@shared/types'

/** Deterministic up-trending tape: a long entry + bracket resolution is
 *  guaranteed for the always-long strategy below. */
function tape(bars: number, start = 100): Candle[] {
  return Array.from({ length: bars }, (_, i) => {
    const px = start + i * 0.1
    return { time: 1_700_000_000 + i * 60, open: px, high: px + 0.4, low: px - 0.2, close: px + 0.1, volume: 10_000 }
  })
}

/** Always-long toy strategy with a tight bracket so trades close quickly. */
function alwaysLong(name = 'toy'): Strategy {
  return {
    name,
    decide(snap: StrategySnapshot): StrategySignal | null {
      const px = snap.quote.last
      return {
        setup: 'toy-always-long',
        symbol: snap.symbol,
        action: 'buy',
        confidence: 0.9,
        stopLossHint: px - 0.5,
        takeProfitHint: px + 0.3,
        atrHint: 0.3,
        createdAt: snap.ts,
      }
    },
  }
}

function makeDeps(over: Partial<SelfEvalDeps> = {}): SelfEvalDeps & {
  baselines: Map<string, BacktestReport>
  reports: Map<string, string>
} {
  const baselines = new Map<string, BacktestReport>()
  const reports = new Map<string, string>()
  return {
    baselines,
    reports,
    getWatchlist: () => ['NVDA'],
    getCandles: async () => tape(300),
    buildStrategies: () => [alwaysLong()],
    readBaseline: (k) => baselines.get(k) ?? null,
    writeBaseline: (k, r) => { baselines.set(k, r) },
    writeReport: (f, md) => { reports.set(f, md) },
    now: () => new Date('2026-06-10T03:00:00').getTime(),
    ...over,
  }
}

describe('msUntilNext', () => {
  it('targets later today when the time has not passed', () => {
    const now = new Date('2026-06-10T01:00:00')
    expect(msUntilNext(2, 30, now)).toBe(90 * 60_000)
  })

  it('rolls to tomorrow when the time already passed', () => {
    const now = new Date('2026-06-10T03:00:00')
    expect(msUntilNext(2, 30, now)).toBe((24 * 60 - 30) * 60_000)
  })

  it('is strictly positive at the exact boundary', () => {
    const now = new Date('2026-06-10T02:30:00')
    expect(msUntilNext(2, 30, now)).toBeGreaterThan(0)
  })
})

describe('SelfEvalService.runOnce', () => {
  it('locks a baseline on first run, compares on second', async () => {
    const deps = makeDeps()
    const svc = new SelfEvalService(deps)

    const first = await svc.runOnce()
    expect(first).not.toBeNull()
    expect(first!.baselined).toBe(1)
    expect(first!.regressions).toHaveLength(0)
    expect(deps.baselines.has('toy · NVDA')).toBe(true)

    // Identical tape + strategy → within tolerance, no new baseline.
    const second = await svc.runOnce()
    expect(second!.baselined).toBe(0)
    expect(second!.regressions).toHaveLength(0)
    expect(second!.evaluated).toBe(1)
  })

  it('flags a regression when behavior drifts beyond tolerance', async () => {
    const deps = makeDeps()
    const svc = new SelfEvalService(deps)
    await svc.runOnce()                       // lock baseline (trades > 0)

    // Same key, but the strategy goes silent → trade count collapses.
    const silent: Strategy = { name: 'toy', decide: () => null }
    deps.buildStrategies = () => [silent]
    const second = await svc.runOnce()
    expect(second!.regressions).toHaveLength(1)
    expect(second!.regressions[0]!.key).toBe('toy · NVDA')
    expect(second!.regressions[0]!.violations.join(' ')).toMatch(/trade count/)
  })

  it('skips thin tapes and unavailable symbols without failing the run', async () => {
    const deps = makeDeps({
      getWatchlist: () => ['NVDA', 'AMD', 'MSFT'],
      getCandles: async (s) => {
        if (s === 'NVDA') return tape(300)
        if (s === 'AMD') return tape(10)              // < MIN_BARS
        throw new Error('no creds')                    // MSFT
      },
    })
    const svc = new SelfEvalService(deps)
    const res = await svc.runOnce()
    expect(res!.evaluated).toBe(1)
    expect(res!.skipped).toBe(2)
    const md = [...deps.reports.values()][0]!
    expect(md).toMatch(/AMD — only 10 bars/)
    expect(md).toMatch(/MSFT — bars unavailable/)
  })

  it('writes a timestamped markdown report with frontmatter + verdict table', async () => {
    const deps = makeDeps()
    const svc = new SelfEvalService(deps)
    const res = await svc.runOnce()
    expect(res!.reportFilename).toMatch(/^\d{8}-\d{6}-self-eval\.md$/)
    const md = deps.reports.get(res!.reportFilename)!
    expect(md).toMatch(/^---\ntype: self-eval/)
    expect(md).toMatch(/baseline locked/)
    expect(md).toMatch(/\| toy · NVDA \|/)
  })

  it('is re-entrant-safe: a second concurrent run is refused', async () => {
    // getCandles hangs until released so the first run is mid-flight.
    let release!: () => void
    const gate = new Promise<void>(r => { release = r })
    const deps = makeDeps({ getCandles: async () => { await gate; return tape(300) } })
    const svc = new SelfEvalService(deps)
    const p1 = svc.runOnce()
    const p2 = svc.runOnce()
    release()
    const [r1, r2] = await Promise.all([p1, p2])
    expect(r1).not.toBeNull()
    expect(r2).toBeNull()
  })
})

describe('renderReportMd', () => {
  it('renders an empty-run placeholder row', () => {
    const md = renderReportMd({ ts: Date.parse('2026-06-10T02:30:00Z'), rows: [], skipped: [] })
    expect(md).toMatch(/no runs — insufficient data/)
    expect(md).toMatch(/2026-06-10/)
  })
})

describe('scheduling', () => {
  it('start() arms a timer and stop() clears it (no run fires early)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-10T01:00:00'))
    const deps = makeDeps({ now: () => Date.now() })
    const runSpy = vi.spyOn(SelfEvalService.prototype, 'runOnce')
    const svc = new SelfEvalService(deps)
    svc.start()
    vi.advanceTimersByTime(89 * 60_000)   // 1 min before 02:30
    expect(runSpy).not.toHaveBeenCalled()
    svc.stop()
    vi.advanceTimersByTime(10 * 60_000)   // past 02:30 — but stopped
    expect(runSpy).not.toHaveBeenCalled()
    runSpy.mockRestore()
    vi.useRealTimers()
  })
})
