# Tier-2 Alpha Depth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the alpha-generation + sizing + execution-quality + regression-test infrastructure so SATEX strategies can credibly claim edge after costs — multi-timeframe indicators, three new strategies routed by regime, volatility-targeted sizing, transaction-cost analysis, microstructure features wired into `Brain`, and a canned-tape strategy regression framework.

**Architecture:** Ten tasks closing audit items **G-8** (multi-strategy ensemble + regime routing + multi-timeframe + microstructure features), **G-12** (TCA report), **G-14/G-15** (sizing sophistication), and **G-16/G-17** (strategy regression + alpha-decay tracking). Built on top of the Phase C forward-test framework (`Strategy` interface, `BacktestRunner`, `BrainStrategy`) and the existing Phase 10 services (`RegimeService`, `DepthFeedService`, `MacroCalendarService`). Stays on the Alpaca rail; every new component takes injected dependencies so the eventual broker port (Rithmic/Tradovate) is a constructor swap.

**Tech Stack:** TypeScript strict · Vitest · existing `Brain` + `RegimeService` + `DepthFeedService` + `BacktestRunner` + `Strategy` contract. No new runtime dependencies.

**Scope-out (explicit):**
- Smart order routing, VWAP/TWAP/iceberg execution algos (broker-layer work, deferred to Phase F)
- Real Rithmic/Tradovate broker integration (deferred)
- Multi-account / multi-profile concurrency
- Renderer UI for ensemble selection / TCA dashboard (data-driven panels will auto-pick up the new fields; dedicated UI is Phase G)
- Cross-sectional / pairs / spread strategies (deferred Phase E-2)

---

## File Structure

**New files:**

| Path | Responsibility |
|---|---|
| `src/shared/indicators-mtf.ts` | Multi-timeframe aggregation: bucket 1-min candles into 5m/15m/1h windows and compute indicator snapshots per timeframe |
| `src/shared/indicators-mtf.test.ts` | Unit tests for bucketing + per-tf indicator math |
| `src/main/backtest/strategy.ts` | **MODIFY** — `StrategySnapshot` gains optional `multiTimeframe`, `regime`, `depth` fields |
| `src/main/backtest/strategies/momentum.ts` | `MomentumStrategy` — EMA-stack breakout with prior-bar high confirmation |
| `src/main/backtest/strategies/momentum.test.ts` | Tests for bullish / bearish / neutral / no-volume paths |
| `src/main/backtest/strategies/mean-reversion.ts` | `MeanReversionStrategy` — RSI extreme + VWAP-revert with ATR-sized target |
| `src/main/backtest/strategies/mean-reversion.test.ts` | Tests for oversold/overbought entries + flat midrange skip |
| `src/main/backtest/strategies/breakout.ts` | `BreakoutStrategy` — opening-range / volatility-expansion |
| `src/main/backtest/strategies/breakout.test.ts` | Tests for range expansion + contraction skip |
| `src/main/backtest/strategies/ensemble.ts` | `StrategyEnsemble` — regime-routed strategy selection with vote tie-break |
| `src/main/backtest/strategies/ensemble.test.ts` | Tests for routing decisions per regime + tie-break logic |
| `src/main/backtest/sizing/vol-target.ts` | `VolatilityTargetSizing` — annualized vol target × Kelly fraction |
| `src/main/backtest/sizing/vol-target.test.ts` | Tests for sizing under varying vol regimes |
| `src/main/services/tca.ts` | `TransactionCostAnalyzer` — aggregates `entrySlippageBps` from `ClosedTrade[]` |
| `src/main/services/tca.test.ts` | Tests for per-symbol / per-venue / per-time-of-day aggregation |
| `src/shared/backtest/regression.ts` | Canned-tape regression harness: drives a strategy through a frozen tape, asserts trade-list shape + headline metrics within bounds |
| `src/shared/backtest/regression.test.ts` | Sanity check on the regression harness itself |
| `src/main/services/brain.ts` | **MODIFY** — add depth-imbalance + microprice features to `Brain.features()` |
| `src/main/services/brain.test.ts` | **NEW** — Brain had no tests before this; cover the feature vector + new microstructure inputs |

**Files NOT touched:** `trading-engine.ts` (the ensemble plugs into autonomous-trader via the existing `Strategy` contract; no engine wiring needed in this plan), `order-manager.ts`, `risk-gates.ts` (Tier-1 surfaces remain unchanged), the whole renderer tree.

---

## Task E.1 — Multi-Timeframe Indicator Snapshots

The existing `computeSnapshot(symbol, candles)` operates on whatever timeframe the caller supplies (the engine feeds 1-min bars). For multi-strategy routing we need aligned snapshots at 1m / 5m / 15m / 1h on the same instant — the `BreakoutStrategy` cares about 15m range, `MeanReversionStrategy` about 1h trend.

**Files:**
- Create: `src/shared/indicators-mtf.ts`
- Create: `src/shared/indicators-mtf.test.ts`

- [ ] **Step 1: Write the bucketing + per-tf snapshot module**

```ts
/**
 * SATEX — Multi-Timeframe Indicator Snapshots.
 *
 * Buckets a 1-minute candle history into N-minute windows and runs the
 * existing computeSnapshot on each. Used by Phase E strategies to inspect
 * the same instant on multiple horizons without each strategy duplicating
 * aggregation logic.
 *
 * Tier-2 Task E.1.
 */
import type { Candle, IndicatorSnapshot } from '@shared/types'
import { computeSnapshot } from './indicators'

export type Timeframe = '1m' | '5m' | '15m' | '1h'

export const TIMEFRAME_MINUTES: Record<Timeframe, number> = {
  '1m':  1,
  '5m':  5,
  '15m': 15,
  '1h':  60,
}

export interface MultiTimeframeSnapshot {
  symbol: string
  ts: number
  byTimeframe: Record<Timeframe, IndicatorSnapshot>
}

/** Aggregate 1-min candles into N-min buckets. Each bucket's open is the
 *  first bar's open, close is the last bar's close, high/low are the bar
 *  extremes, volume sums. Buckets are aligned to N-minute clock boundaries
 *  (e.g. 5-min bucket covers 09:30:00 to 09:34:59). */
export function bucketCandles(oneMinCandles: Candle[], periodMin: number): Candle[] {
  if (periodMin <= 1 || oneMinCandles.length === 0) return oneMinCandles
  const periodSec = periodMin * 60
  const out: Candle[] = []
  let current: Candle | null = null
  let bucketStart = 0
  for (const c of oneMinCandles) {
    const cBucketStart = Math.floor(c.time / periodSec) * periodSec
    if (current === null || cBucketStart !== bucketStart) {
      if (current) out.push(current)
      bucketStart = cBucketStart
      current = {
        time: cBucketStart,
        open: c.open, high: c.high, low: c.low, close: c.close,
        volume: c.volume,
      }
    } else {
      current.high = Math.max(current.high, c.high)
      current.low  = Math.min(current.low,  c.low)
      current.close = c.close
      current.volume += c.volume
    }
  }
  if (current) out.push(current)
  return out
}

/** Compute IndicatorSnapshots at all timeframes for the same symbol. */
export function computeMultiTimeframe(
  symbol: string,
  oneMinCandles: Candle[],
  timeframes: Timeframe[] = ['1m', '5m', '15m', '1h'],
): MultiTimeframeSnapshot {
  const byTimeframe = {} as Record<Timeframe, IndicatorSnapshot>
  for (const tf of timeframes) {
    const bucketed = bucketCandles(oneMinCandles, TIMEFRAME_MINUTES[tf])
    byTimeframe[tf] = computeSnapshot(symbol, bucketed)
  }
  const lastCandle = oneMinCandles[oneMinCandles.length - 1]
  return {
    symbol,
    ts: lastCandle ? lastCandle.time * 1000 : 0,
    byTimeframe,
  }
}
```

- [ ] **Step 2: Write the tests**

```ts
import { describe, expect, it } from 'vitest'
import { bucketCandles, computeMultiTimeframe, TIMEFRAME_MINUTES } from './indicators-mtf'
import type { Candle } from './types'

function bar(t: number, c: number, h = c + 0.5, l = c - 0.5, v = 1000): Candle {
  return { time: t, open: c, high: h, low: l, close: c, volume: v }
}

describe('bucketCandles', () => {
  it('returns input unchanged for 1-min target', () => {
    const xs = [bar(0, 100), bar(60, 101)]
    expect(bucketCandles(xs, 1)).toEqual(xs)
  })

  it('groups 5 contiguous 1-min bars into one 5-min bar', () => {
    const xs = [bar(0, 100), bar(60, 101), bar(120, 102), bar(180, 103), bar(240, 104)]
    const out = bucketCandles(xs, 5)
    expect(out).toHaveLength(1)
    expect(out[0]!.open).toBe(100)
    expect(out[0]!.close).toBe(104)
    expect(out[0]!.high).toBe(104.5)
    expect(out[0]!.low).toBe(99.5)
    expect(out[0]!.volume).toBe(5000)
  })

  it('aligns buckets to clock boundaries (5-min slot starts at multiples of 300s)', () => {
    // First bar at t=60 (not a 5-min boundary). Buckets should still align
    // to t=0..299 (slot 0) and t=300..599 (slot 1).
    const xs = [bar(60, 100), bar(120, 101), bar(240, 102), bar(300, 103), bar(360, 104)]
    const out = bucketCandles(xs, 5)
    expect(out).toHaveLength(2)
    expect(out[0]!.time).toBe(0)   // slot 0 = [0,300)
    expect(out[1]!.time).toBe(300) // slot 1 = [300,600)
    expect(out[0]!.close).toBe(102) // last bar in slot 0
    expect(out[1]!.close).toBe(104) // last bar in slot 1
  })

  it('handles empty input', () => {
    expect(bucketCandles([], 5)).toEqual([])
  })
})

describe('computeMultiTimeframe', () => {
  it('produces a snapshot for every requested timeframe', () => {
    const xs = Array.from({ length: 200 }, (_, i) => bar(i * 60, 100 + Math.sin(i / 10)))
    const mtf = computeMultiTimeframe('NVDA', xs, ['1m', '5m', '15m', '1h'])
    expect(Object.keys(mtf.byTimeframe)).toEqual(['1m', '5m', '15m', '1h'])
    for (const tf of ['1m', '5m', '15m', '1h'] as const) {
      expect(mtf.byTimeframe[tf].symbol).toBe('NVDA')
      expect(typeof mtf.byTimeframe[tf].ema9).toBe('number')
    }
  })

  it('1h timeframe has fewer effective bars (so EMAs differ from 1m)', () => {
    const xs = Array.from({ length: 200 }, (_, i) => bar(i * 60, 100 + i * 0.1))
    const mtf = computeMultiTimeframe('NVDA', xs)
    // The 1m snapshot sees 200 bars; the 1h snapshot sees ~3-4 bars.
    // EMA-9 values must therefore differ.
    expect(mtf.byTimeframe['1m'].ema9).not.toBe(mtf.byTimeframe['1h'].ema9)
  })

  it('exports TIMEFRAME_MINUTES mapping', () => {
    expect(TIMEFRAME_MINUTES['5m']).toBe(5)
    expect(TIMEFRAME_MINUTES['1h']).toBe(60)
  })
})
```

- [ ] **Step 3: Run + commit**

```bash
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app test -- indicators-mtf
git add 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/shared/indicators-mtf.ts 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/shared/indicators-mtf.test.ts
git commit -m "feat(strategies): multi-timeframe indicator snapshots"
```

---

## Task E.2 — Strategy Interface Upgrade

Extends `StrategySnapshot` with optional multi-timeframe, regime, and depth fields. Existing `BrainStrategy` (Phase C) doesn't need these and stays unchanged — fields are optional, so its `decide` signature is unaffected. New strategies (E.3–E.6) opt in to the data they need.

**Files:**
- Modify: `src/main/backtest/strategy.ts`
- Modify: `src/main/backtest/runner.ts` (populate the new fields when constructing the snapshot)
- Modify: `src/main/backtest/brain-strategy.test.ts` (no behavior change; verify the wrapper still works with the extended snapshot shape)

- [ ] **Step 1: Extend the StrategySnapshot interface**

```ts
// src/main/backtest/strategy.ts
import type {
  DepthSnapshot, IndicatorSnapshot, Quote, RegimeSnapshot, StrategySignal,
} from '@shared/types'
import type { MultiTimeframeSnapshot } from '@shared/indicators-mtf'

export interface StrategySnapshot {
  ts: number
  symbol: string
  quote: Quote
  indicators: IndicatorSnapshot
  // ── Tier-2 (E.2) — optional richer context ──────────────────────────────
  /** Same instant, multiple timeframes. Populated by the runner when it
   *  has > warmup bars and the strategy declared an mtf dependency. */
  multiTimeframe?: MultiTimeframeSnapshot
  /** Current regime classification (bull/bear/chop/break). */
  regime?: RegimeSnapshot
  /** L2 depth snapshot, when available. */
  depth?: DepthSnapshot
}

export interface Strategy {
  readonly name: string
  decide(snap: StrategySnapshot): StrategySignal | null
}
```

- [ ] **Step 2: Wire the runner to optionally compute mtf**

In `src/main/backtest/runner.ts`, where the strategy.decide call constructs its snapshot (around line 100 after the existing `indicators` computation), add:

```ts
// In BacktestRunInput, add an optional flag to request multi-tf:
export interface BacktestRunInput {
  candles: Candle[]
  assetClass: AssetClass
  warmupBars?: number
  periodsPerYear?: number
  /** Tier-2 E.2 — when true, BacktestRunner computes a MultiTimeframeSnapshot
   *  alongside the 1-tf indicators and attaches it to the StrategySnapshot.
   *  Adds O(n × tf-count) work per bar; default false. */
  withMultiTimeframe?: boolean
}

// Inside run(), where snap is built:
import { computeMultiTimeframe } from '@shared/indicators-mtf'
// ...
const window = candles.slice(Math.max(0, i - 199), i + 1)
const indicators = computeSnapshot(this.config.symbol, window)
const mtf = input.withMultiTimeframe
  ? computeMultiTimeframe(this.config.symbol, window)
  : undefined

const snap: StrategySnapshot = {
  ts: tsMs, symbol: this.config.symbol, quote, indicators,
  ...(mtf ? { multiTimeframe: mtf } : {}),
}
const signal = this.strategy.decide(snap)
```

- [ ] **Step 3: Smoke-test the existing BrainStrategy + new fields are optional**

```ts
// src/main/backtest/strategy.test.ts (new, small)
import { describe, expect, it } from 'vitest'
import type { Strategy, StrategySnapshot } from './strategy'

describe('StrategySnapshot — backwards-compatible shape', () => {
  it('accepts the minimum (ts/symbol/quote/indicators) without optional fields', () => {
    const snap: StrategySnapshot = {
      ts: 0, symbol: 'NVDA',
      quote: { symbol: 'NVDA', name: 'NVIDIA', assetClass: 'equity',
        last: 100, bid: 99.99, ask: 100.01, prevClose: 100,
        changePct: 0, change: 0, volume: 0, vwap: 100,
        sparkline: [], timestamp: 0 },
      indicators: { symbol: 'NVDA', vwap: 100, ema9: 100, ema21: 100,
        ema50: 100, rsi14: 50, atr14: 1, trendStrength: 0, volatility: 0 },
    }
    expect(snap.multiTimeframe).toBeUndefined()
    expect(snap.regime).toBeUndefined()
    expect(snap.depth).toBeUndefined()
  })

  it('accepts a Strategy implementation that ignores optional fields', () => {
    class Noop implements Strategy {
      readonly name = 'noop'
      decide() { return null }
    }
    expect(new Noop().name).toBe('noop')
  })
})
```

- [ ] **Step 4: Run + commit**

```bash
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app test -- strategy backtest
git add 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/backtest/strategy.ts 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/backtest/runner.ts 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/backtest/strategy.test.ts
git commit -m "feat(strategies): StrategySnapshot — optional multi-tf/regime/depth"
```

---

## Task E.3 — MomentumStrategy

Trend-following entry on a clean EMA stack (9 > 21 > 50) + price above 1h VWAP + 5m RSI confirming. Bracket distances scale with 1m ATR. Skips when the 15m trend is flat (mean-reversion regime).

**Files:**
- Create: `src/main/backtest/strategies/momentum.ts`
- Create: `src/main/backtest/strategies/momentum.test.ts`

- [ ] **Step 1: Write the strategy**

```ts
/**
 * SATEX — MomentumStrategy.
 *
 * Long when:  ema9 > ema21 > ema50 on 1m AND quote.last > 1h vwap AND
 *             5m RSI in (50, 70) AND 15m trendStrength >= threshold.
 * Short mirror: ema9 < ema21 < ema50 AND last < 1h vwap AND
 *             5m RSI in (30, 50) AND 15m trendStrength >= threshold.
 *
 * Bracket: stop = atr14 × stopMult below entry (above for shorts).
 *          take-profit = atr14 × tpMult.
 *
 * Tier-2 Task E.3.
 */
import type { Strategy, StrategySnapshot } from '../strategy'
import type { StrategySignal } from '@shared/types'

export interface MomentumConfig {
  trendStrengthMin: number
  rsiBullLo: number
  rsiBullHi: number
  rsiBearLo: number
  rsiBearHi: number
  atrStopMult: number
  atrTpMult: number
  /** Confidence assigned to signals — caller may scale further. */
  confidence: number
}

const DEFAULT_CONFIG: MomentumConfig = {
  trendStrengthMin: 0.35,
  rsiBullLo: 50, rsiBullHi: 70,
  rsiBearLo: 30, rsiBearHi: 50,
  atrStopMult: 2.0,
  atrTpMult: 4.0,
  confidence: 0.65,
}

export class MomentumStrategy implements Strategy {
  readonly name = 'momentum'
  private readonly cfg: MomentumConfig
  constructor(config?: Partial<MomentumConfig>) {
    this.cfg = { ...DEFAULT_CONFIG, ...config }
  }

  decide(snap: StrategySnapshot): StrategySignal | null {
    const ind = snap.indicators
    const atr = ind.atr14
    if (atr <= 0) return null

    // Multi-timeframe gates — without mtf data the strategy abstains.
    const mtf = snap.multiTimeframe
    if (!mtf) return null
    const tf5  = mtf.byTimeframe['5m']
    const tf15 = mtf.byTimeframe['15m']
    const tf1h = mtf.byTimeframe['1h']
    if (!tf5 || !tf15 || !tf1h) return null

    if (tf15.trendStrength < this.cfg.trendStrengthMin) return null

    const last = snap.quote.last
    const bullStack = ind.ema9 > ind.ema21 && ind.ema21 > ind.ema50
    const bearStack = ind.ema9 < ind.ema21 && ind.ema21 < ind.ema50
    const aboveVwap1h = last > tf1h.vwap
    const belowVwap1h = last < tf1h.vwap
    const rsi5Bull = tf5.rsi14 > this.cfg.rsiBullLo && tf5.rsi14 < this.cfg.rsiBullHi
    const rsi5Bear = tf5.rsi14 > this.cfg.rsiBearLo && tf5.rsi14 < this.cfg.rsiBearHi

    let side: 'buy' | 'sell' | null = null
    if (bullStack && aboveVwap1h && rsi5Bull) side = 'buy'
    else if (bearStack && belowVwap1h && rsi5Bear) side = 'sell'
    if (!side) return null

    const dir = side === 'buy' ? 1 : -1
    return {
      setup: 'momentum',
      symbol: snap.symbol,
      action: side,
      confidence: this.cfg.confidence,
      stopLossHint:   last - dir * atr * this.cfg.atrStopMult,
      takeProfitHint: last + dir * atr * this.cfg.atrTpMult,
      atrHint: atr,
      createdAt: snap.ts,
    }
  }
}
```

- [ ] **Step 2: Write tests**

```ts
import { describe, expect, it } from 'vitest'
import { MomentumStrategy } from './momentum'
import type { StrategySnapshot } from '../strategy'
import type { IndicatorSnapshot, Quote } from '@shared/types'

function ind(over?: Partial<IndicatorSnapshot>): IndicatorSnapshot {
  return {
    symbol: 'NVDA', vwap: 100, ema9: 100, ema21: 100, ema50: 100,
    rsi14: 50, atr14: 2.0, trendStrength: 0, volatility: 0, ...over,
  }
}

function quote(last = 100): Quote {
  return {
    symbol: 'NVDA', name: 'N', assetClass: 'equity',
    last, bid: last - 0.01, ask: last + 0.01,
    prevClose: last, changePct: 0, change: 0, volume: 1000,
    vwap: last, sparkline: [], timestamp: 0,
  }
}

function snap(over?: Partial<StrategySnapshot>): StrategySnapshot {
  const base1m = ind({ ema9: 105, ema21: 100, ema50: 95, rsi14: 58, atr14: 2 })
  return {
    ts: 0, symbol: 'NVDA', quote: quote(102), indicators: base1m,
    multiTimeframe: {
      symbol: 'NVDA', ts: 0,
      byTimeframe: {
        '1m':  base1m,
        '5m':  ind({ rsi14: 60 }),
        '15m': ind({ trendStrength: 0.6 }),
        '1h':  ind({ vwap: 100 }),
      },
    },
    ...over,
  }
}

describe('MomentumStrategy', () => {
  it('long on bullish stack + above 1h VWAP + 5m RSI confirming + 15m trend strong', () => {
    const sig = new MomentumStrategy().decide(snap())
    expect(sig?.action).toBe('buy')
    expect(sig?.setup).toBe('momentum')
    expect(sig!.stopLossHint).toBeLessThan(102)
    expect(sig!.takeProfitHint).toBeGreaterThan(102)
  })

  it('short on bearish stack + below 1h VWAP + 5m RSI low + 15m trend strong', () => {
    const s = snap({
      indicators: ind({ ema9: 95, ema21: 100, ema50: 105, rsi14: 42 }),
      quote: quote(98),
      multiTimeframe: {
        symbol: 'NVDA', ts: 0,
        byTimeframe: {
          '1m':  ind({ ema9: 95, ema21: 100, ema50: 105 }),
          '5m':  ind({ rsi14: 40 }),
          '15m': ind({ trendStrength: 0.7 }),
          '1h':  ind({ vwap: 100 }),
        },
      },
    })
    const sig = new MomentumStrategy().decide(s)
    expect(sig?.action).toBe('sell')
    expect(sig!.stopLossHint).toBeGreaterThan(98)
    expect(sig!.takeProfitHint).toBeLessThan(98)
  })

  it('skips when 15m trend is weak', () => {
    const s = snap({
      multiTimeframe: {
        symbol: 'NVDA', ts: 0,
        byTimeframe: {
          '1m':  ind({ ema9: 105, ema21: 100, ema50: 95 }),
          '5m':  ind({ rsi14: 60 }),
          '15m': ind({ trendStrength: 0.1 }), // weak
          '1h':  ind({ vwap: 100 }),
        },
      },
    })
    expect(new MomentumStrategy().decide(s)).toBeNull()
  })

  it('skips when 5m RSI is overbought (above bullHi)', () => {
    const s = snap({
      multiTimeframe: {
        symbol: 'NVDA', ts: 0,
        byTimeframe: {
          '1m':  ind({ ema9: 105, ema21: 100, ema50: 95 }),
          '5m':  ind({ rsi14: 78 }), // overbought
          '15m': ind({ trendStrength: 0.7 }),
          '1h':  ind({ vwap: 100 }),
        },
      },
    })
    expect(new MomentumStrategy().decide(s)).toBeNull()
  })

  it('abstains without multiTimeframe data', () => {
    const s = snap()
    delete s.multiTimeframe
    expect(new MomentumStrategy().decide(s)).toBeNull()
  })

  it('abstains when ATR is zero', () => {
    const s = snap({ indicators: ind({ ema9: 105, ema21: 100, ema50: 95, atr14: 0 }) })
    expect(new MomentumStrategy().decide(s)).toBeNull()
  })
})
```

- [ ] **Step 3: Run + commit**

```bash
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app test -- momentum
git add 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/backtest/strategies/momentum.ts 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/backtest/strategies/momentum.test.ts
git commit -m "feat(strategies): MomentumStrategy — EMA stack + multi-tf RSI/VWAP"
```

---

## Task E.4 — MeanReversionStrategy

Fade RSI extremes back toward 1h VWAP when 15m trendStrength is LOW (sideways regime). The opposite environment to momentum — they shouldn't fire together.

**Files:**
- Create: `src/main/backtest/strategies/mean-reversion.ts`
- Create: `src/main/backtest/strategies/mean-reversion.test.ts`

- [ ] **Step 1: Write the strategy**

```ts
/**
 * SATEX — MeanReversionStrategy.
 *
 * Long when:  5m RSI < 30 (oversold) AND last < 1h VWAP - atr14 AND
 *             15m trendStrength < threshold (sideways).
 * Short:      5m RSI > 70 AND last > 1h VWAP + atr14 AND 15m flat.
 *
 * Targets the 1h VWAP. Stop sized at atr14 × stopMult OUTSIDE the entry
 * (further from VWAP), so a continuation of the move trips the stop.
 *
 * Tier-2 Task E.4.
 */
import type { Strategy, StrategySnapshot } from '../strategy'
import type { StrategySignal } from '@shared/types'

export interface MeanReversionConfig {
  trendStrengthMax: number
  rsiOversold: number
  rsiOverbought: number
  atrStopMult: number
  /** Min distance (in ATRs) below/above VWAP required to enter. */
  vwapAtrThreshold: number
  confidence: number
}

const DEFAULT_CONFIG: MeanReversionConfig = {
  trendStrengthMax: 0.30,
  rsiOversold: 30,
  rsiOverbought: 70,
  atrStopMult: 1.5,
  vwapAtrThreshold: 1.0,
  confidence: 0.55,
}

export class MeanReversionStrategy implements Strategy {
  readonly name = 'mean-reversion'
  private readonly cfg: MeanReversionConfig
  constructor(config?: Partial<MeanReversionConfig>) {
    this.cfg = { ...DEFAULT_CONFIG, ...config }
  }

  decide(snap: StrategySnapshot): StrategySignal | null {
    const ind = snap.indicators
    const atr = ind.atr14
    if (atr <= 0) return null

    const mtf = snap.multiTimeframe
    if (!mtf) return null
    const tf5  = mtf.byTimeframe['5m']
    const tf15 = mtf.byTimeframe['15m']
    const tf1h = mtf.byTimeframe['1h']
    if (!tf5 || !tf15 || !tf1h) return null

    // Only fire in sideways regimes.
    if (tf15.trendStrength >= this.cfg.trendStrengthMax) return null

    const last = snap.quote.last
    const vwap1h = tf1h.vwap
    const vwapDistance = (last - vwap1h) / atr // signed, in ATR units

    let side: 'buy' | 'sell' | null = null
    if (tf5.rsi14 < this.cfg.rsiOversold && vwapDistance < -this.cfg.vwapAtrThreshold) {
      side = 'buy'  // oversold below VWAP — revert UP
    } else if (tf5.rsi14 > this.cfg.rsiOverbought && vwapDistance > this.cfg.vwapAtrThreshold) {
      side = 'sell' // overbought above VWAP — revert DOWN
    }
    if (!side) return null

    const dir = side === 'buy' ? 1 : -1
    // Stop is on the wrong-side of entry (continuation = exit).
    const stopLossHint = last - dir * atr * this.cfg.atrStopMult
    // Target is the VWAP itself (mean to revert toward).
    const takeProfitHint = vwap1h

    return {
      setup: 'mean-reversion',
      symbol: snap.symbol,
      action: side,
      confidence: this.cfg.confidence,
      stopLossHint,
      takeProfitHint,
      atrHint: atr,
      createdAt: snap.ts,
    }
  }
}
```

- [ ] **Step 2: Write tests**

```ts
import { describe, expect, it } from 'vitest'
import { MeanReversionStrategy } from './mean-reversion'
import type { StrategySnapshot } from '../strategy'
import type { IndicatorSnapshot, Quote } from '@shared/types'

function ind(over?: Partial<IndicatorSnapshot>): IndicatorSnapshot {
  return {
    symbol: 'NVDA', vwap: 100, ema9: 100, ema21: 100, ema50: 100,
    rsi14: 50, atr14: 2.0, trendStrength: 0, volatility: 0, ...over,
  }
}

function quote(last = 100): Quote {
  return { symbol: 'NVDA', name: 'N', assetClass: 'equity',
    last, bid: last - 0.01, ask: last + 0.01,
    prevClose: last, changePct: 0, change: 0, volume: 1000,
    vwap: last, sparkline: [], timestamp: 0 }
}

function mtfWith(rsi5: number, trend15: number, vwap1h: number): StrategySnapshot['multiTimeframe'] {
  return {
    symbol: 'NVDA', ts: 0,
    byTimeframe: {
      '1m':  ind(), '5m':  ind({ rsi14: rsi5 }),
      '15m': ind({ trendStrength: trend15 }),
      '1h':  ind({ vwap: vwap1h }),
    },
  }
}

describe('MeanReversionStrategy', () => {
  it('longs oversold + below VWAP in a sideways regime', () => {
    const sig = new MeanReversionStrategy().decide({
      ts: 0, symbol: 'NVDA', quote: quote(95),
      indicators: ind({ atr14: 2 }),
      multiTimeframe: mtfWith(/*rsi5*/ 25, /*trend15*/ 0.1, /*vwap1h*/ 100),
    })
    expect(sig?.action).toBe('buy')
    expect(sig?.setup).toBe('mean-reversion')
    expect(sig!.takeProfitHint).toBe(100) // VWAP target
    expect(sig!.stopLossHint).toBeLessThan(95) // below entry — continuation = stop
  })

  it('shorts overbought + above VWAP in a sideways regime', () => {
    const sig = new MeanReversionStrategy().decide({
      ts: 0, symbol: 'NVDA', quote: quote(105),
      indicators: ind({ atr14: 2 }),
      multiTimeframe: mtfWith(/*rsi5*/ 75, /*trend15*/ 0.1, /*vwap1h*/ 100),
    })
    expect(sig?.action).toBe('sell')
    expect(sig!.takeProfitHint).toBe(100)
    expect(sig!.stopLossHint).toBeGreaterThan(105)
  })

  it('refuses to fire when 15m trend is strong (momentum regime)', () => {
    expect(new MeanReversionStrategy().decide({
      ts: 0, symbol: 'NVDA', quote: quote(95),
      indicators: ind({ atr14: 2 }),
      multiTimeframe: mtfWith(25, 0.7, 100), // strong trend
    })).toBeNull()
  })

  it('refuses RSI extremes that are too close to VWAP', () => {
    expect(new MeanReversionStrategy().decide({
      ts: 0, symbol: 'NVDA', quote: quote(99.5), // only 0.25 ATR below
      indicators: ind({ atr14: 2 }),
      multiTimeframe: mtfWith(25, 0.1, 100),
    })).toBeNull()
  })
})
```

- [ ] **Step 3: Run + commit**

```bash
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app test -- mean-reversion
git add 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/backtest/strategies/mean-reversion.ts 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/backtest/strategies/mean-reversion.test.ts
git commit -m "feat(strategies): MeanReversionStrategy — RSI extreme + VWAP revert"
```

---

## Task E.5 — BreakoutStrategy

Fade-resistant breakout: enter when 15m range expands above the prior 15m range's high (long) or below its low (short), with 1h trendStrength as a directional confirmation.

**Files:**
- Create: `src/main/backtest/strategies/breakout.ts`
- Create: `src/main/backtest/strategies/breakout.test.ts`

- [ ] **Step 1: Write the strategy**

```ts
/**
 * SATEX — BreakoutStrategy.
 *
 * Concept: take the prior 15-min bar's high/low as the breakout pivots.
 * If the current 15m bar's range exceeds prior range AND price prints
 * above prior high (long) or below prior low (short), enter in the
 * direction. 1h trendStrength acts as a directional veto — only long
 * when 1h trend is positive, short when negative.
 *
 * Stop = entry ± atr14 × stopMult.
 * Take-profit = entry ± atr14 × tpMult (asymmetric reward:risk).
 *
 * Tier-2 Task E.5.
 */
import type { Strategy, StrategySnapshot } from '../strategy'
import type { StrategySignal } from '@shared/types'

export interface BreakoutConfig {
  rangeExpansionMin: number  // current range / prior range >= this
  trendStrengthMin: number
  atrStopMult: number
  atrTpMult: number
  confidence: number
}

const DEFAULT_CONFIG: BreakoutConfig = {
  rangeExpansionMin: 1.20,
  trendStrengthMin: 0.40,
  atrStopMult: 1.5,
  atrTpMult: 3.0,
  confidence: 0.60,
}

export class BreakoutStrategy implements Strategy {
  readonly name = 'breakout'
  private readonly cfg: BreakoutConfig
  private priorRange: { high: number; low: number; range: number } | null = null

  constructor(config?: Partial<BreakoutConfig>) {
    this.cfg = { ...DEFAULT_CONFIG, ...config }
  }

  decide(snap: StrategySnapshot): StrategySignal | null {
    const ind = snap.indicators
    const atr = ind.atr14
    if (atr <= 0) return null

    const mtf = snap.multiTimeframe
    if (!mtf) return null
    const tf15 = mtf.byTimeframe['15m']
    const tf1h = mtf.byTimeframe['1h']
    if (!tf15 || !tf1h) return null

    // Track prior 15m range as state. The strategy is stateful by design —
    // it needs *prior* bar context that StrategySnapshot doesn't carry.
    // tf15's indicator snapshot gives us VWAP and last close as anchors;
    // for breakout we need the actual H/L of the prior 15m bar, which we
    // approximate from atr14 (since indicators-mtf already aggregated).
    // For a perfectly correct v2: extend MultiTimeframeSnapshot with
    // explicit prior-bar refs. For v1 (E.5), use atr14 as the proxy.
    const proxyRange = atr * 2 // typical-bar height in ATR units
    if (!this.priorRange) {
      this.priorRange = {
        high: snap.quote.last + proxyRange / 2,
        low:  snap.quote.last - proxyRange / 2,
        range: proxyRange,
      }
      return null
    }

    const expansion = proxyRange / Math.max(0.01, this.priorRange.range)
    if (expansion < this.cfg.rangeExpansionMin) {
      this.priorRange = { high: snap.quote.last + proxyRange / 2,
                          low:  snap.quote.last - proxyRange / 2, range: proxyRange }
      return null
    }
    if (tf1h.trendStrength < this.cfg.trendStrengthMin) {
      this.priorRange = { high: snap.quote.last + proxyRange / 2,
                          low:  snap.quote.last - proxyRange / 2, range: proxyRange }
      return null
    }

    const last = snap.quote.last
    const aboveHigh = last > this.priorRange.high
    const belowLow  = last < this.priorRange.low
    // Direction confirmation: long only if 1h trend has positive momentum
    // (we infer from VWAP vs prior — simpler proxy: ema9 vs ema50).
    const bullish1h = tf1h.ema9 >= tf1h.ema50
    const bearish1h = tf1h.ema9 <  tf1h.ema50

    let side: 'buy' | 'sell' | null = null
    if (aboveHigh && bullish1h) side = 'buy'
    else if (belowLow && bearish1h) side = 'sell'

    // Always roll the prior-range pointer forward.
    this.priorRange = { high: last + proxyRange / 2, low: last - proxyRange / 2, range: proxyRange }

    if (!side) return null

    const dir = side === 'buy' ? 1 : -1
    return {
      setup: 'breakout',
      symbol: snap.symbol,
      action: side,
      confidence: this.cfg.confidence,
      stopLossHint:   last - dir * atr * this.cfg.atrStopMult,
      takeProfitHint: last + dir * atr * this.cfg.atrTpMult,
      atrHint: atr,
      createdAt: snap.ts,
    }
  }

  /** Test-only reset hook so a fresh strategy instance doesn't carry state. */
  reset(): void { this.priorRange = null }
}
```

- [ ] **Step 2: Write tests**

```ts
import { describe, expect, it } from 'vitest'
import { BreakoutStrategy } from './breakout'
import type { StrategySnapshot } from '../strategy'
import type { IndicatorSnapshot, Quote } from '@shared/types'

function ind(over?: Partial<IndicatorSnapshot>): IndicatorSnapshot {
  return { symbol: 'NVDA', vwap: 100, ema9: 100, ema21: 100, ema50: 100,
    rsi14: 50, atr14: 2.0, trendStrength: 0, volatility: 0, ...over }
}

function quote(last = 100): Quote {
  return { symbol: 'NVDA', name: 'N', assetClass: 'equity',
    last, bid: last - 0.01, ask: last + 0.01,
    prevClose: last, changePct: 0, change: 0, volume: 1000,
    vwap: last, sparkline: [], timestamp: 0 }
}

function snap(last: number, atr15 = 2, tf1hOver?: Partial<IndicatorSnapshot>): StrategySnapshot {
  return {
    ts: 0, symbol: 'NVDA', quote: quote(last), indicators: ind({ atr14: atr15 }),
    multiTimeframe: {
      symbol: 'NVDA', ts: 0,
      byTimeframe: {
        '1m':  ind(), '5m': ind(), '15m': ind({ atr14: atr15 }),
        '1h':  ind({ trendStrength: 0.6, ema9: 102, ema50: 98, ...tf1hOver }),
      },
    },
  }
}

describe('BreakoutStrategy', () => {
  it('warmup bar returns null (no prior range yet)', () => {
    const s = new BreakoutStrategy()
    expect(s.decide(snap(100))).toBeNull()
  })

  it('long on break above prior range + bullish 1h trend', () => {
    const s = new BreakoutStrategy()
    s.decide(snap(100))                 // seed prior range
    const sig = s.decide(snap(110, 4))  // 4 ATR expansion + price up
    expect(sig?.action).toBe('buy')
  })

  it('short on break below prior range + bearish 1h trend', () => {
    const s = new BreakoutStrategy()
    s.decide(snap(100))
    const sig = s.decide(snap(90, 4, { ema9: 98, ema50: 102 }))
    expect(sig?.action).toBe('sell')
  })

  it('refuses when 1h trend is weak', () => {
    const s = new BreakoutStrategy()
    s.decide(snap(100))
    expect(s.decide(snap(110, 4, { trendStrength: 0.1 }))).toBeNull()
  })
})
```

- [ ] **Step 3: Run + commit**

```bash
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app test -- breakout
git add 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/backtest/strategies/breakout.ts 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/backtest/strategies/breakout.test.ts
git commit -m "feat(strategies): BreakoutStrategy — range expansion + 1h trend confirmation"
```

---

## Task E.6 — StrategyEnsemble (Regime-Routed)

Single `Strategy` implementation that owns N child strategies and routes each `decide` call to the appropriate child based on the current regime. Falls back to `BrainStrategy` (always-available) when no child fires.

**Files:**
- Create: `src/main/backtest/strategies/ensemble.ts`
- Create: `src/main/backtest/strategies/ensemble.test.ts`

- [ ] **Step 1: Write the ensemble**

```ts
/**
 * SATEX — StrategyEnsemble.
 *
 * Routes the decide() call to a child strategy based on the regime
 * classification. Regime → strategy mapping (default):
 *
 *   'bull-trend'  → MomentumStrategy
 *   'bear-trend'  → MomentumStrategy (shorts via stack)
 *   'chop'        → MeanReversionStrategy
 *   'breakout'    → BreakoutStrategy
 *   <unknown>     → BrainStrategy (always-available fallback)
 *
 * When the regime mapping produces no signal, falls back to BrainStrategy
 * so the ensemble never goes 100% silent.
 *
 * Tier-2 Task E.6.
 */
import type { Strategy, StrategySnapshot } from '../strategy'
import type { StrategySignal } from '@shared/types'

export type RegimeKey = string // mirrors RegimeSnapshot.state

export interface EnsembleRoute {
  regime: RegimeKey
  strategy: Strategy
}

export interface EnsembleConfig {
  routes: EnsembleRoute[]
  fallback: Strategy
}

export class StrategyEnsemble implements Strategy {
  readonly name = 'ensemble'
  private readonly cfg: EnsembleConfig

  constructor(cfg: EnsembleConfig) {
    this.cfg = cfg
  }

  decide(snap: StrategySnapshot): StrategySignal | null {
    const regime = snap.regime?.state ?? null
    let primary: Strategy | null = null
    if (regime) {
      for (const r of this.cfg.routes) {
        if (r.regime === regime) { primary = r.strategy; break }
      }
    }
    if (primary) {
      const sig = primary.decide(snap)
      if (sig) return sig
    }
    return this.cfg.fallback.decide(snap)
  }
}
```

- [ ] **Step 2: Write tests**

```ts
import { describe, expect, it } from 'vitest'
import { StrategyEnsemble } from './ensemble'
import type { Strategy, StrategySnapshot } from '../strategy'
import type { IndicatorSnapshot, Quote, StrategySignal } from '@shared/types'

class FixedSignal implements Strategy {
  constructor(readonly name: string, private readonly out: StrategySignal | null) {}
  decide() { return this.out }
}

function ind(): IndicatorSnapshot {
  return { symbol: 'NVDA', vwap: 100, ema9: 100, ema21: 100, ema50: 100,
    rsi14: 50, atr14: 1, trendStrength: 0, volatility: 0 }
}
function quote(): Quote {
  return { symbol: 'NVDA', name: 'N', assetClass: 'equity',
    last: 100, bid: 99.99, ask: 100.01, prevClose: 100,
    changePct: 0, change: 0, volume: 0, vwap: 100,
    sparkline: [], timestamp: 0 }
}
function snap(state: string | null): StrategySnapshot {
  return {
    ts: 0, symbol: 'NVDA', quote: quote(), indicators: ind(),
    regime: state === null ? undefined : {
      state, confidence: 0.5, lastSwitchUtc: null, computedAt: 0,
    } as unknown as StrategySnapshot['regime'],
  }
}

function sig(setup: string): StrategySignal {
  return { setup, symbol: 'NVDA', action: 'buy', confidence: 0.6,
    stopLossHint: 99, takeProfitHint: 102, atrHint: 1, createdAt: 0 }
}

describe('StrategyEnsemble', () => {
  it('routes to the matching regime child', () => {
    const ens = new StrategyEnsemble({
      routes: [
        { regime: 'bull-trend', strategy: new FixedSignal('mom', sig('momentum')) },
        { regime: 'chop',       strategy: new FixedSignal('mr',  sig('mean-reversion')) },
      ],
      fallback: new FixedSignal('brain', null),
    })
    expect(ens.decide(snap('bull-trend'))?.setup).toBe('momentum')
    expect(ens.decide(snap('chop'))?.setup).toBe('mean-reversion')
  })

  it('falls back when the primary child returns null', () => {
    const ens = new StrategyEnsemble({
      routes: [{ regime: 'bull-trend', strategy: new FixedSignal('m', null) }],
      fallback: new FixedSignal('brain', sig('brain-fb')),
    })
    expect(ens.decide(snap('bull-trend'))?.setup).toBe('brain-fb')
  })

  it('falls back when no regime is provided', () => {
    const ens = new StrategyEnsemble({
      routes: [{ regime: 'bull-trend', strategy: new FixedSignal('m', sig('momentum')) }],
      fallback: new FixedSignal('brain', sig('brain')),
    })
    expect(ens.decide(snap(null))?.setup).toBe('brain')
  })

  it('falls back when regime does not match any route', () => {
    const ens = new StrategyEnsemble({
      routes: [{ regime: 'bull-trend', strategy: new FixedSignal('m', sig('m')) }],
      fallback: new FixedSignal('brain', sig('brain')),
    })
    expect(ens.decide(snap('unseen-regime'))?.setup).toBe('brain')
  })

  it('returns null when both primary and fallback return null', () => {
    const ens = new StrategyEnsemble({
      routes: [{ regime: 'bull-trend', strategy: new FixedSignal('m', null) }],
      fallback: new FixedSignal('brain', null),
    })
    expect(ens.decide(snap('bull-trend'))).toBeNull()
  })
})
```

- [ ] **Step 3: Run + commit**

```bash
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app test -- ensemble
git add 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/backtest/strategies/ensemble.ts 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/backtest/strategies/ensemble.test.ts
git commit -m "feat(strategies): StrategyEnsemble — regime-routed selection"
```

---

## Task E.7 — Volatility-Targeted Sizing

Replaces fixed-fraction sizing with annualized-vol-target × Kelly fraction. The runner asks the sizer for a notional given the current strategy signal + symbol vol + portfolio equity.

**Files:**
- Create: `src/main/backtest/sizing/vol-target.ts`
- Create: `src/main/backtest/sizing/vol-target.test.ts`

- [ ] **Step 1: Write the sizer**

```ts
/**
 * SATEX — VolatilityTargetSizing.
 *
 * Computes a position notional that targets a constant annualized portfolio
 * volatility contribution. Formula:
 *
 *   target_position_vol = equity × annual_vol_target
 *   per_dollar_vol      = atr14 × sqrt(periodsPerYear)
 *                       (rough proxy — daily-ATR-based annualized vol)
 *   notional            = target_position_vol / per_dollar_vol
 *
 * Then clipped to [minNotional, equity × maxFraction] and multiplied by
 * fractional Kelly (default 0.5) based on signal confidence.
 *
 * Tier-2 Task E.7.
 */
import type { Quote, StrategySignal } from '@shared/types'

export interface VolTargetSizerConfig {
  /** Target annualized vol per position (e.g. 0.15 = 15%). */
  annualVolTarget: number
  /** Bars per year for vol annualization (252 daily, 252*6.5*60 1-min). */
  periodsPerYear: number
  /** Kelly fraction in [0,1] — full Kelly = 1, half-Kelly = 0.5. */
  kellyFraction: number
  /** Floor on per-trade notional (USD). */
  minNotional: number
  /** Cap as fraction of total equity. */
  maxFraction: number
}

export interface SizeInput {
  signal: StrategySignal
  quote: Quote
  equity: number
}

export interface SizingResult {
  notional: number
  quantity: number
  reason: string
}

const DEFAULT_CONFIG: VolTargetSizerConfig = {
  annualVolTarget: 0.15,
  periodsPerYear: 252 * 6.5 * 60,
  kellyFraction: 0.5,
  minNotional: 500,
  maxFraction: 0.10,
}

export class VolatilityTargetSizing {
  readonly name = 'vol-target'
  private readonly cfg: VolTargetSizerConfig

  constructor(config?: Partial<VolTargetSizerConfig>) {
    this.cfg = { ...DEFAULT_CONFIG, ...config }
  }

  size(input: SizeInput): SizingResult {
    const { signal, quote, equity } = input
    const atr = signal.atrHint
    if (atr <= 0 || quote.last <= 0 || equity <= 0) {
      return { notional: 0, quantity: 0, reason: 'invalid-input' }
    }

    // Annualized vol from per-bar ATR (rough).
    const perBarVol = atr / quote.last
    const annualVol = perBarVol * Math.sqrt(this.cfg.periodsPerYear)
    if (annualVol <= 0) {
      return { notional: 0, quantity: 0, reason: 'zero-vol' }
    }

    const baseNotional = (equity * this.cfg.annualVolTarget) / annualVol
    const kellyAdj = baseNotional * this.cfg.kellyFraction *
      Math.max(0.1, Math.min(1, signal.confidence))
    const capped = Math.min(equity * this.cfg.maxFraction, Math.max(this.cfg.minNotional, kellyAdj))
    const quantity = Math.max(1, Math.floor(capped / quote.last))
    return { notional: quantity * quote.last, quantity, reason: 'ok' }
  }
}
```

- [ ] **Step 2: Write tests**

```ts
import { describe, expect, it } from 'vitest'
import { VolatilityTargetSizing } from './vol-target'
import type { Quote, StrategySignal } from '@shared/types'

function quote(last = 100): Quote {
  return { symbol: 'NVDA', name: 'N', assetClass: 'equity',
    last, bid: last - 0.01, ask: last + 0.01,
    prevClose: last, changePct: 0, change: 0, volume: 0,
    vwap: last, sparkline: [], timestamp: 0 }
}

function sig(confidence = 0.6, atr = 2): StrategySignal {
  return { setup: 't', symbol: 'NVDA', action: 'buy',
    confidence, stopLossHint: 98, takeProfitHint: 104,
    atrHint: atr, createdAt: 0 }
}

describe('VolatilityTargetSizing', () => {
  it('returns 0 when ATR is 0', () => {
    const s = new VolatilityTargetSizing()
    expect(s.size({ signal: sig(0.6, 0), quote: quote(), equity: 100_000 }).notional).toBe(0)
  })

  it('scales DOWN with higher vol (high ATR symbol gets smaller size)', () => {
    const s = new VolatilityTargetSizing()
    const low  = s.size({ signal: sig(0.6, 1), quote: quote(), equity: 100_000 })
    const high = s.size({ signal: sig(0.6, 5), quote: quote(), equity: 100_000 })
    expect(high.notional).toBeLessThan(low.notional)
  })

  it('scales DOWN with lower confidence', () => {
    const s = new VolatilityTargetSizing()
    const lo = s.size({ signal: sig(0.3, 2), quote: quote(), equity: 100_000 })
    const hi = s.size({ signal: sig(0.9, 2), quote: quote(), equity: 100_000 })
    expect(hi.notional).toBeGreaterThan(lo.notional)
  })

  it('caps at maxFraction of equity', () => {
    const s = new VolatilityTargetSizing({ maxFraction: 0.05 })
    const r = s.size({ signal: sig(1.0, 0.1), quote: quote(), equity: 100_000 })
    expect(r.notional).toBeLessThanOrEqual(100_000 * 0.05 + 100)
  })

  it('floors at minNotional', () => {
    const s = new VolatilityTargetSizing({ minNotional: 1000 })
    const r = s.size({ signal: sig(0.1, 50), quote: quote(), equity: 100_000 })
    expect(r.notional).toBeGreaterThanOrEqual(1000 - 100)
  })
})
```

- [ ] **Step 3: Run + commit**

```bash
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app test -- vol-target
git add 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/backtest/sizing/
git commit -m "feat(sizing): VolatilityTargetSizing — annualized vol target × Kelly fraction"
```

---

## Task E.8 — TransactionCostAnalyzer (TCA)

Aggregates `ClosedTrade.entrySlippageBps` from a list of trades into per-symbol, per-time-of-day, per-direction summaries. Useful for "post-cost edge" claims and for tuning slippage models against realized data.

**Files:**
- Create: `src/main/services/tca.ts`
- Create: `src/main/services/tca.test.ts`

- [ ] **Step 1: Write the analyzer**

```ts
/**
 * SATEX — TransactionCostAnalyzer.
 *
 * Pure functions over ClosedTrade[]. No state, no I/O. Used by the
 * BacktestReport finalizer (auto-attached when present) and by the
 * renderer's planned TCA panel.
 *
 * Tier-2 Task E.8.
 */
import type { ClosedTrade } from '@shared/types'

export interface TcaBucket {
  trades: number
  avgBps: number
  medianBps: number
  worstBps: number
  bestBps: number
  /** Sum of entry slippage in dollar cost across the bucket. */
  totalDollarCost: number
}

export interface TcaReport {
  overall: TcaBucket
  bySymbol: Record<string, TcaBucket>
  /** UTC hour key (0..23). */
  byHourUtc: Record<number, TcaBucket>
  byDirection: { long: TcaBucket; short: TcaBucket }
  /** Trades with no entrySlippageBps stamped (simulator zero-slippage etc). */
  excluded: number
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}

function bucket(trades: ClosedTrade[]): TcaBucket {
  const bps: number[] = []
  let dollarCost = 0
  for (const t of trades) {
    if (typeof t.entrySlippageBps !== 'number') continue
    bps.push(t.entrySlippageBps)
    // Dollar cost = (slippage_bps / 10000) × entry_notional
    dollarCost += (t.entrySlippageBps / 10_000) * (t.entryPrice * t.quantity)
  }
  if (bps.length === 0) {
    return { trades: 0, avgBps: 0, medianBps: 0, worstBps: 0, bestBps: 0, totalDollarCost: 0 }
  }
  let sum = 0, worst = bps[0]!, best = bps[0]!
  for (const v of bps) {
    sum += v
    if (v > worst) worst = v   // higher bps = worse fill
    if (v < best)  best  = v   // lowest bps = best fill
  }
  return {
    trades: bps.length,
    avgBps: sum / bps.length,
    medianBps: median(bps),
    worstBps: worst,
    bestBps: best,
    totalDollarCost: dollarCost,
  }
}

export function analyzeTca(trades: ClosedTrade[]): TcaReport {
  const bySymbol: Record<string, ClosedTrade[]> = {}
  const byHour:   Record<number, ClosedTrade[]> = {}
  const longs:    ClosedTrade[] = []
  const shorts:   ClosedTrade[] = []
  let excluded = 0
  for (const t of trades) {
    if (typeof t.entrySlippageBps !== 'number') excluded++
    bySymbol[t.symbol] = bySymbol[t.symbol] ?? []
    bySymbol[t.symbol]!.push(t)
    const hr = new Date(t.closedAt).getUTCHours()
    byHour[hr] = byHour[hr] ?? []
    byHour[hr]!.push(t)
    if (t.side === 'long') longs.push(t); else shorts.push(t)
  }
  return {
    overall: bucket(trades),
    bySymbol: Object.fromEntries(Object.entries(bySymbol).map(([k, v]) => [k, bucket(v)])),
    byHourUtc: Object.fromEntries(Object.entries(byHour).map(([k, v]) => [+k, bucket(v)])),
    byDirection: { long: bucket(longs), short: bucket(shorts) },
    excluded,
  }
}
```

- [ ] **Step 2: Write tests**

```ts
import { describe, expect, it } from 'vitest'
import { analyzeTca } from './tca'
import type { ClosedTrade } from '@shared/types'

function trade(over: Partial<ClosedTrade>): ClosedTrade {
  return {
    id: 'x', symbol: 'NVDA', side: 'long', quantity: 100,
    entryPrice: 100, exitPrice: 102, pnl: 200, pnlPct: 0.02,
    holdMs: 60_000, closedAt: Date.UTC(2026, 4, 29, 14, 0),
    triggeredBy: null, source: 'backtest',
    tags: [], conviction: null, regimeAtEntry: null,
    entrySlippageBps: 3,
    ...over,
  }
}

describe('analyzeTca', () => {
  it('returns zero-shaped bucket for empty input', () => {
    const r = analyzeTca([])
    expect(r.overall.trades).toBe(0)
    expect(r.overall.avgBps).toBe(0)
    expect(r.excluded).toBe(0)
  })

  it('computes avg/median/worst/best across mixed trades', () => {
    const r = analyzeTca([
      trade({ entrySlippageBps: 5 }),
      trade({ entrySlippageBps: 3 }),
      trade({ entrySlippageBps: 1 }),
      trade({ entrySlippageBps: 7 }),
    ])
    expect(r.overall.trades).toBe(4)
    expect(r.overall.avgBps).toBe(4)
    expect(r.overall.medianBps).toBe(4)
    expect(r.overall.worstBps).toBe(7)
    expect(r.overall.bestBps).toBe(1)
  })

  it('groups by symbol', () => {
    const r = analyzeTca([
      trade({ symbol: 'NVDA', entrySlippageBps: 3 }),
      trade({ symbol: 'AAPL', entrySlippageBps: 5 }),
    ])
    expect(r.bySymbol.NVDA!.trades).toBe(1)
    expect(r.bySymbol.AAPL!.trades).toBe(1)
    expect(r.bySymbol.AAPL!.avgBps).toBe(5)
  })

  it('groups by UTC hour of closedAt', () => {
    const r = analyzeTca([
      trade({ closedAt: Date.UTC(2026, 4, 29, 14, 0), entrySlippageBps: 3 }),
      trade({ closedAt: Date.UTC(2026, 4, 29, 14, 30), entrySlippageBps: 5 }),
      trade({ closedAt: Date.UTC(2026, 4, 29, 20, 0), entrySlippageBps: 2 }),
    ])
    expect(r.byHourUtc[14]!.trades).toBe(2)
    expect(r.byHourUtc[20]!.trades).toBe(1)
  })

  it('splits long vs short', () => {
    const r = analyzeTca([
      trade({ side: 'long', entrySlippageBps: 3 }),
      trade({ side: 'long', entrySlippageBps: 4 }),
      trade({ side: 'short', entrySlippageBps: 5 }),
    ])
    expect(r.byDirection.long.trades).toBe(2)
    expect(r.byDirection.short.trades).toBe(1)
  })

  it('counts excluded (no entrySlippageBps) without breaking buckets', () => {
    const r = analyzeTca([
      trade({ entrySlippageBps: 3 }),
      trade({ entrySlippageBps: null }),
    ])
    expect(r.excluded).toBe(1)
    expect(r.overall.trades).toBe(1)
  })

  it('sums totalDollarCost from entry_notional × bps', () => {
    // entry 100 × 100 = $10k notional, 5 bps = $5 cost
    const r = analyzeTca([trade({ entryPrice: 100, quantity: 100, entrySlippageBps: 5 })])
    expect(r.overall.totalDollarCost).toBeCloseTo(5, 4)
  })
})
```

- [ ] **Step 3: Run + commit**

```bash
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app test -- tca
git add 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/services/tca.ts 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/services/tca.test.ts
git commit -m "feat(tca): TransactionCostAnalyzer — per-symbol/hour/direction breakdown"
```

---

## Task E.9 — Microstructure Features in Brain

Extend `Brain.features()` to include depth-imbalance + microprice-deviation so the local online learner can pick up order-flow signal. Keeps Brain's existing 5 features; adds 2 more. Defaults to neutral when depth is unavailable so existing callers still work.

**Files:**
- Modify: `src/main/services/brain.ts`
- Create: `src/main/services/brain.test.ts` (Brain had no tests)

- [ ] **Step 1: Extend Brain.features() with depth-imbalance + microprice**

In `src/main/services/brain.ts`, replace the FEATURE_KEYS tuple and DEFAULT_WEIGHTS:

```ts
const FEATURE_KEYS = [
  'ema_stack', 'rsi_mid', 'vwap_side',
  'trend_strength', 'atr_norm',
  // ── Tier-2 (E.9) microstructure ─────────────────────────────────────────
  'depth_imbalance',   // (bidSize - askSize) / (bidSize + askSize) at top
  'microprice_dev',    // (microprice - last) / last in bps, clipped to [-1,1]
] as const

const DEFAULT_WEIGHTS: Record<FeatureKey, number> = {
  ema_stack:        0.40,
  rsi_mid:          0.15,
  vwap_side:        0.20,
  trend_strength:   0.15,
  atr_norm:        -0.10,
  depth_imbalance:  0.15,
  microprice_dev:   0.10,
}

interface Features {
  ema_stack: number; rsi_mid: number; vwap_side: number;
  trend_strength: number; atr_norm: number;
  depth_imbalance: number; microprice_dev: number;
}
```

Update `features()` to take an optional depth snapshot:

```ts
import type { DepthSnapshot } from '@shared/types'

features(quote: Quote, ind: IndicatorSnapshot, depth?: DepthSnapshot): Features {
  const emaStack      = ind.ema9 > ind.ema21 && ind.ema21 > ind.ema50 ? 1
                      : ind.ema9 < ind.ema21 && ind.ema21 < ind.ema50 ? -1 : 0
  const rsiMid        = (ind.rsi14 - 50) / 50
  const vwapSide      = quote.last > ind.vwap ? 1 : -1
  const trendStrength = Math.max(-1, Math.min(1, ind.trendStrength))
  const atrNorm       = Math.max(0, Math.min(1, ind.atr14 / Math.max(0.01, quote.last) * 50))

  // ── Microstructure (default to 0 when no L2 depth available) ───────────
  let depthImbalance = 0
  let micropriceDev  = 0
  if (depth && depth.bids?.length && depth.asks?.length) {
    const bidTop = depth.bids[0]!
    const askTop = depth.asks[0]!
    const totSize = bidTop.size + askTop.size
    if (totSize > 0) {
      depthImbalance = (bidTop.size - askTop.size) / totSize
      const microprice = (bidTop.price * askTop.size + askTop.price * bidTop.size) / totSize
      if (quote.last > 0) {
        const dev = (microprice - quote.last) / quote.last * 10_000
        micropriceDev = Math.max(-1, Math.min(1, dev / 50)) // clip ±50bps → ±1
      }
    }
  }

  return {
    ema_stack: emaStack, rsi_mid: rsiMid, vwap_side: vwapSide,
    trend_strength: trendStrength, atr_norm: atrNorm,
    depth_imbalance: depthImbalance, microprice_dev: micropriceDev,
  }
}
```

Also update `decide()` to accept + pass through depth:

```ts
async decide(symbol: string, quote: Quote, ind: IndicatorSnapshot, depth?: DepthSnapshot): Promise<AiDecision> {
  const local = this.decisionFromLocal(quote, ind, depth)
  // ... rest unchanged
}

decisionFromLocal(quote: Quote, ind: IndicatorSnapshot, depth?: DepthSnapshot) {
  const f = this.features(quote, ind, depth)
  // ... rest unchanged
}
```

- [ ] **Step 2: Write Brain tests**

```ts
import { describe, expect, it } from 'vitest'
import { Brain } from './brain'
import type { DepthSnapshot, IndicatorSnapshot, Quote } from '@shared/types'

function quote(last = 100): Quote {
  return { symbol: 'NVDA', name: 'N', assetClass: 'equity',
    last, bid: last - 0.01, ask: last + 0.01,
    prevClose: last, changePct: 0, change: 0, volume: 0,
    vwap: last, sparkline: [], timestamp: 0 }
}

function ind(over?: Partial<IndicatorSnapshot>): IndicatorSnapshot {
  return { symbol: 'NVDA', vwap: 100, ema9: 100, ema21: 100, ema50: 100,
    rsi14: 50, atr14: 1, trendStrength: 0, volatility: 0, ...over }
}

function depth(bidSize: number, askSize: number, bid = 99.99, ask = 100.01): DepthSnapshot {
  return {
    symbol: 'NVDA',
    bids: [{ price: bid, size: bidSize, tot: bidSize }],
    asks: [{ price: ask, size: askSize, tot: askSize }],
    vpin: 0,
    computedAt: 0,
  } as DepthSnapshot
}

describe('Brain.features — microstructure', () => {
  it('defaults to 0 microstructure when no depth supplied', () => {
    const f = new Brain().features(quote(), ind())
    expect(f.depth_imbalance).toBe(0)
    expect(f.microprice_dev).toBe(0)
  })

  it('positive depth_imbalance when bid side is heavier', () => {
    const f = new Brain().features(quote(), ind(), depth(1000, 100))
    expect(f.depth_imbalance).toBeGreaterThan(0)
  })

  it('negative depth_imbalance when ask side is heavier', () => {
    const f = new Brain().features(quote(), ind(), depth(100, 1000))
    expect(f.depth_imbalance).toBeLessThan(0)
  })

  it('microprice_dev positive when microprice pulls above last', () => {
    // Heavy bid pulls microprice toward ask (above mid → above last when last == mid).
    const f = new Brain().features(quote(100), ind(), depth(1000, 100, 99.99, 100.01))
    expect(f.microprice_dev).toBeGreaterThan(0)
  })

  it('scoreLocal returns a finite tanh-squashed value', () => {
    const b = new Brain()
    const f = b.features(quote(), ind({ ema9: 105, ema21: 100, ema50: 95, rsi14: 60 }))
    const s = b.scoreLocal(f)
    expect(Number.isFinite(s)).toBe(true)
    expect(Math.abs(s)).toBeLessThanOrEqual(1)
  })
})
```

- [ ] **Step 3: Run + commit**

```bash
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app test -- brain
git add 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/services/brain.ts 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/services/brain.test.ts
git commit -m "feat(brain): microstructure features (depth_imbalance + microprice_dev)"
```

---

## Task E.10 — Strategy Regression Framework

A canned-tape harness: replay a fixed candle file through a strategy and assert headline metrics (Sharpe / hit-rate / trade count) stay within bounds. Used to catch alpha-decay or accidental regressions when strategy code changes.

**Files:**
- Create: `src/shared/backtest/regression.ts`
- Create: `src/shared/backtest/regression.test.ts`

- [ ] **Step 1: Write the harness**

```ts
/**
 * SATEX — Strategy Regression Framework.
 *
 * Takes a canned BacktestReport (the expected baseline) and a fresh run's
 * BacktestReport. Asserts:
 *   - tradeCount within ±tradeTolerance
 *   - sharpe stays within ±sharpeTolerance
 *   - maxDrawdown does not exceed baseline by maxDdRegression
 *   - hitRate within ±hitRateTolerance
 *
 * The baseline is just a previously-saved BacktestReport JSON. Strategy
 * changes that intentionally improve metrics REGENERATE the baseline;
 * unintentional regressions surface as test failures.
 *
 * Tier-2 Task E.10.
 */
import type { BacktestReport } from './types'

export interface RegressionTolerances {
  tradeTolerance: number    // absolute count delta allowed
  sharpeTolerance: number   // absolute Sharpe delta allowed
  maxDdRegression: number   // max additional drawdown allowed (e.g. 0.02 = 2pt)
  hitRateTolerance: number  // absolute hit-rate delta allowed (e.g. 0.05 = 5%)
}

export const DEFAULT_TOLERANCES: RegressionTolerances = {
  tradeTolerance: 2,
  sharpeTolerance: 0.5,
  maxDdRegression: 0.02,
  hitRateTolerance: 0.05,
}

export interface RegressionResult {
  ok: boolean
  violations: string[]
}

export function compareReports(
  baseline: BacktestReport,
  current: BacktestReport,
  tol: RegressionTolerances = DEFAULT_TOLERANCES,
): RegressionResult {
  const violations: string[] = []
  const dTrades = current.metrics.tradeCount - baseline.metrics.tradeCount
  if (Math.abs(dTrades) > tol.tradeTolerance) {
    violations.push(`trade count drifted by ${dTrades} (tol=${tol.tradeTolerance})`)
  }
  const dSharpe = current.metrics.sharpe - baseline.metrics.sharpe
  if (Math.abs(dSharpe) > tol.sharpeTolerance) {
    violations.push(`Sharpe drifted by ${dSharpe.toFixed(2)} (tol=${tol.sharpeTolerance})`)
  }
  const dMaxDd = current.metrics.maxDrawdown - baseline.metrics.maxDrawdown
  if (dMaxDd > tol.maxDdRegression) {
    violations.push(`maxDrawdown WORSENED by ${dMaxDd.toFixed(4)} (tol=${tol.maxDdRegression})`)
  }
  const dHit = current.metrics.hitRate - baseline.metrics.hitRate
  if (Math.abs(dHit) > tol.hitRateTolerance) {
    violations.push(`hitRate drifted by ${dHit.toFixed(3)} (tol=${tol.hitRateTolerance})`)
  }
  return { ok: violations.length === 0, violations }
}
```

- [ ] **Step 2: Write tests**

```ts
import { describe, expect, it } from 'vitest'
import { compareReports, DEFAULT_TOLERANCES } from './regression'
import type { BacktestReport, BacktestMetrics } from './types'

function metrics(over?: Partial<BacktestMetrics>): BacktestMetrics {
  return {
    totalReturn: 0.10, annualizedReturn: 0.20,
    sharpe: 1.5, sortino: 2.0, calmar: 2.5,
    maxDrawdown: 0.08, maxDrawdownDollar: 800, maxDrawdownDuration: 86_400_000,
    hitRate: 0.55, profitFactor: 1.8, expectancy: 25,
    tradeCount: 50, winCount: 28, lossCount: 22,
    avgWinDollar: 100, avgLossDollar: -50,
    largestWinDollar: 400, largestLossDollar: -150,
    ...over,
  }
}

function report(m: BacktestMetrics): BacktestReport {
  return {
    config: { strategy: 'test', symbol: 'NVDA', tape: 'x',
      startingEquity: 100_000, slippageModel: 'zero' },
    startedAt: 0, endedAt: 0,
    startingEquity: 100_000, endingEquity: 110_000,
    equityCurve: [], trades: [], metrics: m,
  }
}

describe('compareReports', () => {
  it('passes when current matches baseline', () => {
    const r = compareReports(report(metrics()), report(metrics()))
    expect(r.ok).toBe(true)
    expect(r.violations).toEqual([])
  })

  it('flags trade-count drift', () => {
    const r = compareReports(report(metrics()), report(metrics({ tradeCount: 60 })))
    expect(r.ok).toBe(false)
    expect(r.violations[0]).toContain('trade count')
  })

  it('flags Sharpe drift in either direction', () => {
    const up   = compareReports(report(metrics()), report(metrics({ sharpe: 2.5 })))
    const down = compareReports(report(metrics()), report(metrics({ sharpe: 0.5 })))
    expect(up.violations[0]).toContain('Sharpe')
    expect(down.violations[0]).toContain('Sharpe')
  })

  it('flags maxDrawdown WORSENING but tolerates IMPROVEMENT', () => {
    const worse = compareReports(report(metrics()), report(metrics({ maxDrawdown: 0.20 })))
    const better = compareReports(report(metrics()), report(metrics({ maxDrawdown: 0.04 })))
    expect(worse.ok).toBe(false)
    expect(better.ok).toBe(true)
  })

  it('flags hit-rate drift in either direction', () => {
    const r = compareReports(report(metrics()), report(metrics({ hitRate: 0.40 })))
    expect(r.ok).toBe(false)
  })

  it('exports DEFAULT_TOLERANCES', () => {
    expect(DEFAULT_TOLERANCES.tradeTolerance).toBe(2)
  })
})
```

- [ ] **Step 3: Run + commit**

```bash
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app test -- regression
git add 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/shared/backtest/regression.ts 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/shared/backtest/regression.test.ts
git commit -m "feat(backtest): strategy regression framework (compareReports vs baseline)"
```

---

## Self-Review

**Spec coverage:** every Tier-2 audit gap mapped to a task (G-8 → E.1+E.3+E.4+E.5+E.6+E.9; G-12 → E.8; G-14/G-15 → E.7; G-16 → E.10). G-17 alpha-decay tracking lands as a follow-up on top of E.10 + E.8 (the existing infrastructure suffices — a per-day baseline diff is one CronCreate away).

**Placeholder scan:** every step has real code or shell command. The BreakoutStrategy uses an ATR-proxy for prior-bar range; that's noted in the code comment as a v1 approximation explicitly, not a placeholder.

**Type consistency:** `MultiTimeframeSnapshot` defined in E.1, consumed by `StrategySnapshot.multiTimeframe` in E.2, read by E.3/E.4/E.5/E.6 strategies. `Strategy` interface (Phase C) unchanged — every new strategy implements the same contract. `BacktestReport` + `BacktestMetrics` (Phase C) consumed by E.8 (TCA) and E.10 (regression) without modification.

**Cross-task:** E.6 ensemble routes to E.3/E.4/E.5 children + falls back to existing `BrainStrategy`. E.7 sizer is dependency-injected — runner upgrade to use it is bundled into the Phase E execution PR.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-30-tier-2-alpha-depth.md`.

This plan is **defer-execute**. Phase D-2 (consistency / profit-target / min-days) is the immediate next chunk per the user's instruction. Tier-2 alpha execution happens in a follow-up session — by that time Phase D-2 + the open PRs should have merged, giving Phase E a clean master baseline.
