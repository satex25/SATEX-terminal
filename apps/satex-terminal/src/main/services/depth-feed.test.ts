/**
 * Characterization coverage for the L2 depth-feed synthesizer (P-094).
 *
 * depth-feed.ts is display-data synthesis only: it feeds the DepthPanel's
 * ladder and never touches the order path, so it is off the trading-safety
 * perimeter and a safe autonomous coverage target (CONSTITUTION §2.4).
 * Unlike the other P-094 targets it is already dependency-injected
 * (`new DepthFeedService({ getQuote })`), so no module-reset harness is
 * needed — no electron, no fs, no singleton.
 *
 * What this suite locks in:
 *   1. TIMER LIFECYCLE — start() emits immediately then at 4 Hz (250 ms);
 *      start() is idempotent (never a second interval); stop() halts and a
 *      restart resumes cleanly (the §2.5.7 leak class: the handle is
 *      cleared, not orphaned); stop() before start() is a safe no-op.
 *   2. LISTENER CONTRACT — onUpdate() returns a working unsubscribe; all
 *      listeners receive the SAME snapshot object per tick (intentional
 *      sharing — consumers may rely on identity; do not "fix" into clones
 *      without checking them).
 *   3. get()/subscribe() — bare get() computes fresh and does NOT cache;
 *      get(other) routes through subscribe → tick and returns the cached
 *      lastSnapshot; subscribe(same) is a no-op, subscribe(new) emits an
 *      immediate snapshot for the new symbol.
 *   4. LADDER GEOMETRY — 9 levels/side anchored at best bid/ask, tick size
 *      0.01 / 0.05 (mid>500) / 1.0 (mid>10000), cumulative `tot`, size
 *      floor 20 and jitter-clamp ceiling 2400.
 *   5. DEGENERATE INPUTS (P-039/P-040 class) — quote undefined → finite
 *      zero-anchored ladder with the 0.01 spread floor, never NaN/throw;
 *      bid:0/ask:0 are NOT nullish so the ladder anchors at 0 (bids go
 *      negative) while `mid = 0 || last` reads 100 — a real quirk, pinned
 *      here so any future fixer sees it loudly; bid/ask undefined fall back
 *      to last ± 0.01 %.
 *   6. VPIN PROXY — always within [0,1], EMA step bounded by 0.08/tick.
 *   7. JITTER CONTINUITY — per-symbol size pattern survives symbol
 *      round-trips (the sizeJitter Map is persistent by design).
 *
 * Determinism: Math.random is pinned to 0.5, which makes the churn delta
 * exactly 0 — the jitter array stays at its deterministic initializer, so
 * every snapshot is reproducible. Fake timers pin the interval and Date.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DepthFeedService } from './depth-feed'
import type { Quote, DepthSnapshot } from '@shared/types'

function mkQuote(over: Partial<Quote> = {}): Quote {
  return {
    symbol: 'NVDA',
    name: 'NVIDIA Corp',
    assetClass: 'equity',
    last: 100.01,
    bid: 100,
    ask: 100.02,
    prevClose: 99.5,
    changePct: 0.51,
    change: 0.51,
    volume: 1_000_000,
    vwap: 100.0,
    sparkline: [99.9, 100.0, 100.01],
    timestamp: 1_752_000_000_000,
    ...over,
  }
}

function mkSvc(getQuote: (symbol: string) => Quote | undefined = () => mkQuote()) {
  return new DepthFeedService({ getQuote })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(Math, 'random').mockReturnValue(0.5)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('depth-feed timer lifecycle', () => {
  it('start() emits an immediate snapshot, then one per 250 ms (4 Hz)', () => {
    const svc = mkSvc()
    const fn = vi.fn()
    svc.onUpdate(fn)
    svc.start()
    expect(fn).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(250)
    expect(fn).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(750)
    expect(fn).toHaveBeenCalledTimes(5)
    svc.stop()
  })

  it('start() is idempotent — a second start() adds no second interval', () => {
    const svc = mkSvc()
    const fn = vi.fn()
    svc.onUpdate(fn)
    svc.start()
    svc.start()
    expect(fn).toHaveBeenCalledTimes(1) // second start returns early, no extra tick
    vi.advanceTimersByTime(250)
    expect(fn).toHaveBeenCalledTimes(2) // one interval, not two
    svc.stop()
  })

  it('stop() halts emissions and a restart resumes cleanly (leak class §2.5.7)', () => {
    const svc = mkSvc()
    const fn = vi.fn()
    svc.onUpdate(fn)
    svc.start()
    vi.advanceTimersByTime(250)
    expect(fn).toHaveBeenCalledTimes(2)
    svc.stop()
    vi.advanceTimersByTime(1000)
    expect(fn).toHaveBeenCalledTimes(2) // nothing after stop
    svc.start()
    expect(fn).toHaveBeenCalledTimes(3) // immediate tick on restart
    vi.advanceTimersByTime(250)
    expect(fn).toHaveBeenCalledTimes(4)
    svc.stop()
  })

  it('stop() before any start() is a safe no-op', () => {
    expect(() => mkSvc().stop()).not.toThrow()
  })
})

describe('depth-feed listener contract', () => {
  it('onUpdate() returns an unsubscribe fn that silences only that listener', () => {
    const svc = mkSvc()
    const a = vi.fn()
    const b = vi.fn()
    const offA = svc.onUpdate(a)
    svc.onUpdate(b)
    svc.start()
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
    offA()
    vi.advanceTimersByTime(250)
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(2)
    svc.stop()
  })

  it('all listeners receive the SAME snapshot object per tick (identity is part of the contract)', () => {
    const svc = mkSvc()
    const a = vi.fn()
    const b = vi.fn()
    svc.onUpdate(a)
    svc.onUpdate(b)
    svc.start()
    expect(a.mock.calls[0]![0]).toBe(b.mock.calls[0]![0])
    svc.stop()
  })

  it('subscribe(sameSymbol) is a no-op — no emission', () => {
    const svc = mkSvc()
    const fn = vi.fn()
    svc.onUpdate(fn)
    svc.subscribe('NVDA') // default currentSymbol
    expect(fn).not.toHaveBeenCalled()
  })

  it('subscribe(newSymbol) emits an immediate snapshot for the new symbol, even unstarted', () => {
    const svc = mkSvc((symbol) => mkQuote({ symbol }))
    const fn = vi.fn()
    svc.onUpdate(fn)
    svc.subscribe('TSLA')
    expect(fn).toHaveBeenCalledTimes(1)
    expect((fn.mock.calls[0]![0] as DepthSnapshot).symbol).toBe('TSLA')
  })
})

describe('depth-feed get()', () => {
  it('bare get() computes fresh and does NOT cache (two calls, two objects)', () => {
    const svc = mkSvc()
    const g1 = svc.get()
    const g2 = svc.get()
    expect(g1.symbol).toBe('NVDA')
    expect(g2.symbol).toBe('NVDA')
    expect(g2).not.toBe(g1)
  })

  it('get(other) switches symbol via subscribe, caches, and shares the reference with listeners', () => {
    const svc = mkSvc((symbol) => mkQuote({ symbol }))
    const fn = vi.fn()
    svc.onUpdate(fn)
    const snap = svc.get('AAPL')
    expect(snap.symbol).toBe('AAPL')
    expect(fn).toHaveBeenCalledTimes(1)
    expect(snap).toBe(fn.mock.calls[0]![0]) // cached lastSnapshot, same object
    expect(svc.get()).toBe(snap) // subsequent bare get() serves the cache
    expect(svc.get('AAPL')).toBe(snap) // same-symbol get() does not recompute
  })
})

describe('depth-feed ladder geometry', () => {
  it('equities: 9 levels/side, 0.01 tick, cumulative tot, size within [20, 2400]', () => {
    const svc = mkSvc()
    const s = svc.get()
    expect(s.mid).toBe(100.01)
    expect(s.spread).toBe(0.02)
    expect(s.asks).toHaveLength(9)
    expect(s.bids).toHaveLength(9)
    expect(s.asks.map((l) => l.p)).toEqual([100.02, 100.03, 100.04, 100.05, 100.06, 100.07, 100.08, 100.09, 100.1])
    expect(s.bids.map((l) => l.p)).toEqual([100, 99.99, 99.98, 99.97, 99.96, 99.95, 99.94, 99.93, 99.92])
    for (const side of [s.asks, s.bids]) {
      let run = 0
      for (const lvl of side) {
        expect(lvl.size).toBeGreaterThanOrEqual(20)
        expect(lvl.size).toBeLessThanOrEqual(2400) // SIZE_BASE 1200 × jitter clamp 2.0
        run += lvl.size
        expect(lvl.tot).toBe(run)
      }
    }
  })

  it('mid > 500 scales the tick to 0.05', () => {
    const svc = mkSvc(() => mkQuote({ bid: 999.95, ask: 1000.05, last: 1000 }))
    const s = svc.get()
    expect(s.asks.slice(0, 3).map((l) => l.p)).toEqual([1000.05, 1000.1, 1000.15])
    expect(s.bids.slice(0, 3).map((l) => l.p)).toEqual([999.95, 999.9, 999.85])
  })

  it('mid > 10000 scales the tick to 1.0', () => {
    const svc = mkSvc(() => mkQuote({ bid: 39999, ask: 40001, last: 40000 }))
    const s = svc.get()
    expect(s.asks.slice(0, 3).map((l) => l.p)).toEqual([40001, 40002, 40003])
    expect(s.bids.slice(0, 3).map((l) => l.p)).toEqual([39999, 39998, 39997])
  })
})

describe('depth-feed degenerate inputs (P-039/P-040 class)', () => {
  it('quote undefined: finite zero-anchored ladder, 0.01 spread floor, never NaN', () => {
    const svc = mkSvc(() => undefined)
    const s = svc.get()
    expect(s.symbol).toBe('NVDA')
    expect(s.mid).toBe(0)
    expect(s.spread).toBe(0.01)
    expect(s.asks[0]!.p).toBe(0)
    expect(s.asks[1]!.p).toBe(0.01)
    expect(s.bids[0]!.p).toBe(0)
    expect(s.bids[1]!.p).toBe(-0.01) // ladder walks below zero — current behavior, pinned
    for (const lvl of [...s.asks, ...s.bids]) {
      expect(Number.isFinite(lvl.p)).toBe(true)
      expect(Number.isFinite(lvl.size)).toBe(true)
      expect(Number.isFinite(lvl.tot)).toBe(true)
      expect(lvl.size).toBeGreaterThanOrEqual(20)
    }
    expect(Number.isFinite(s.vpin)).toBe(true)
    expect(Number.isFinite(s.computedAt)).toBe(true)
  })

  it('bid:0/ask:0 are NOT nullish: ladder anchors at 0 while mid falls back to last (pinned quirk)', () => {
    const svc = mkSvc(() => mkQuote({ bid: 0, ask: 0, last: 100 }))
    const s = svc.get()
    expect(s.mid).toBe(100) // (0+0)/2 is falsy → `|| last`
    expect(s.spread).toBe(0.01) // max(0.01, 0−0) floor
    expect(s.asks[0]!.p).toBe(0) // but the ladder anchors at the zero bid/ask…
    expect(s.bids[0]!.p).toBe(0)
    expect(s.bids[1]!.p).toBe(-0.01) // …and walks negative. Quirk, visible on purpose.
  })

  it('bid/ask undefined fall back to last ± 0.01 %', () => {
    const svc = mkSvc(() => ({ ...mkQuote({ last: 200 }), bid: undefined, ask: undefined }) as unknown as Quote)
    const s = svc.get()
    expect(s.mid).toBe(200)
    expect(s.spread).toBe(0.04)
    expect(s.asks[0]!.p).toBe(200.02)
    expect(s.bids[0]!.p).toBe(199.98)
  })
})

describe('depth-feed vpin proxy', () => {
  it('stays within [0,1] and moves at most 0.08 per tick (EMA step bound)', () => {
    const svc = mkSvc()
    const snaps = [svc.get(), svc.get(), svc.get()]
    for (const s of snaps) {
      expect(s.vpin).toBeGreaterThanOrEqual(0)
      expect(s.vpin).toBeLessThanOrEqual(1)
    }
    expect(Math.abs(snaps[1]!.vpin - snaps[0]!.vpin)).toBeLessThanOrEqual(0.081)
    expect(Math.abs(snaps[2]!.vpin - snaps[1]!.vpin)).toBeLessThanOrEqual(0.081)
  })
})

describe('depth-feed jitter continuity', () => {
  it('per-symbol size pattern survives a symbol round-trip (persistent sizeJitter Map)', () => {
    const svc = mkSvc((symbol) => mkQuote({ symbol }))
    const a1 = svc.get('AAA')
    svc.get('BBB')
    const a2 = svc.get('AAA')
    // Math.random pinned to 0.5 → churn delta is 0 → patterns must be EXACTLY equal
    expect(a2.asks.map((l) => l.size)).toEqual(a1.asks.map((l) => l.size))
    expect(a2.bids.map((l) => l.size)).toEqual(a1.bids.map((l) => l.size))
  })
})
