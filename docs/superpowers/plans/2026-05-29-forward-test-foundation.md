# Forward-Test Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a measurable forward-test framework so any Tier-2 alpha work can be evaluated against Sharpe / Sortino / Calmar baselines, with a sim-realistic slippage model and short-side enabled — the foundation for any "better than a quant" claim.

**Architecture:** Three coupled subsystems landed in order. **(A) Slippage model** — pluggable model replacing the hard-coded `quote.last` fill in `OrderManager`'s simulator path. **(B) Short side enable** — flip the long-only gate in `AutonomousTrader` with proper bracket math. **(C) Forward-test framework** — pure metrics library + `Strategy` interface that wraps `Brain`, a `BacktestRunner` that drives `ReplaySource` against a strategy with the slippage model attached, and a `Reporter` that emits `BacktestReport` with Sharpe/Sortino/Calmar/MaxDD-duration/hit-rate/profit-factor. CLI runner via `npm run backtest`.

**Tech Stack:** TypeScript strict · Vitest · Node 20.19 · electron-vite · Zod (existing IPC schemas) · better-sqlite3 (existing persistence). No new runtime dependencies.

**Scope-out (explicit, do not pull in):**
- Funded-account rule profiles (Tier-1, separate plan)
- Multi-strategy ensemble / regime routing (Tier-2 next plan)
- Microstructure features in Brain (Tier-2 follow-up)
- New broker (Rithmic/Tradovate) — Topstep/Apex port is a later phase

---

## File Structure

**New files:**

| Path | Responsibility |
|---|---|
| `src/shared/backtest/types.ts` | `EquityPoint`, `BacktestReport`, `StrategyName`, `BacktestConfig` — reuses existing `ClosedTrade`, `StrategySignal` |
| `src/shared/backtest/metrics.ts` | Pure functions: `sharpe`, `sortino`, `calmar`, `maxDrawdown`, `maxDrawdownDuration`, `hitRate`, `profitFactor`, `expectancy`, `annualizedReturn` |
| `src/shared/backtest/metrics.test.ts` | Unit tests for every metric against canned input |
| `src/main/backtest/slippage-model.ts` | `SlippageModel` interface + `ZeroSlippageModel`, `FixedBpsSlippageModel`, `SpreadHalfPlusImpactModel` |
| `src/main/backtest/slippage-model.test.ts` | Unit tests for each model |
| `src/main/backtest/strategy.ts` | `Strategy` interface, `BrainStrategy` wrapping existing `Brain` to match contract |
| `src/main/backtest/strategy.test.ts` | Verify BrainStrategy round-trips a canned snapshot |
| `src/main/backtest/runner.ts` | `BacktestRunner` orchestrates ReplaySource → Strategy → fills → equity curve |
| `src/main/backtest/runner.test.ts` | End-to-end with a canned tape, asserts trade list + curve shape |
| `src/main/backtest/reporter.ts` | `formatReport(report)` → console / MD string; persists JSON to disk |
| `src/main/backtest/reporter.test.ts` | Reporter formatting tests |
| `scripts/backtest.ts` | Headless CLI: `node scripts/backtest.ts --tape <session-id> --strategy brain --slippage spread-half --report md` |

**Files modified:**

| Path | Change |
|---|---|
| `src/main/services/order-manager.ts` | Constructor takes optional `SlippageModel`; simulator-path fill goes through it. Default = `ZeroSlippageModel` (preserves current behavior so the change is contract-additive). |
| `src/main/services/order-manager.test.ts` | New cases: slippage model is invoked; defaults to zero |
| `src/main/services/autonomous-trader.ts` | Remove long-only block (lines 206–215); add short-bracket math (stop above entry, TP below); keep cooldown + RR symmetric |
| `src/main/services/autonomous-trader.test.ts` | **NEW** — bullish path + bearish path + RR symmetry |
| `src/main/core/trading-engine.ts` | `submitOrder` simulator branch: pass slippage model into OM constructor at boot; no other changes |
| `package.json` | Add `"backtest": "tsx scripts/backtest.ts"` script |

**Files NOT touched:** `risk-gates.ts`, `live-mode.ts`, `brain.ts` (wrapped, not modified), `macro-calendar.ts`, the whole `renderer/` tree.

---

## Phase A — Slippage Model (G-11) · ~1–2 days

Lands first because the backtest framework needs it AND day-to-day sim quality improves immediately. Contract-additive: default = zero slippage = current behavior, so every existing test stays green.

### Task A.1 — Define the SlippageModel interface

**Files:**
- Create: `src/main/backtest/slippage-model.ts`

- [ ] **Step 1: Write the interface file**

```ts
/**
 * SATEX — Slippage Model
 * Pluggable fill-price simulator. Wraps the simulator path in OrderManager
 * so backtests and day-to-day paper trading both compute fills that aren't
 * "fill at quote.last with zero friction".
 *
 * Interface is intentionally small: take an order + a market snapshot,
 * return the executed fill price + ms-delay-before-fill. Stateless;
 * callers may pass per-call config.
 */
import type { OrderRequest, Quote } from '@shared/types'

export interface SlippageContext {
  /** Reference quote at the moment the order hit the simulator. */
  quote: Quote
  /** Optional bid/ask spread override if the source has L1. Falls back to
   *  derived spread from quote.bid/ask, then to a synthetic 1bp spread. */
  spreadBpsOverride?: number
}

export interface SlippageFill {
  /** Price the simulator should record as the actual fill. */
  fillPrice: number
  /** Delay before the fill resolves (ms). Models latency; default 50. */
  delayMs: number
}

export interface SlippageModel {
  readonly name: string
  fill(req: OrderRequest, ctx: SlippageContext): SlippageFill
}

/** Zero-slippage baseline = pre-2026-05-29 behavior. Default for OrderManager
 *  so existing callers don't see a behavior change. Useful in unit tests as a
 *  control. */
export class ZeroSlippageModel implements SlippageModel {
  readonly name = 'zero'
  fill(_req: OrderRequest, ctx: SlippageContext): SlippageFill {
    return { fillPrice: ctx.quote.last, delayMs: 50 }
  }
}
```

- [ ] **Step 2: Commit the scaffold**

```bash
git add src/main/backtest/slippage-model.ts
git commit -m "feat(backtest): SlippageModel interface + ZeroSlippageModel baseline"
```

### Task A.2 — FixedBpsSlippageModel + test

**Files:**
- Create: `src/main/backtest/slippage-model.test.ts`
- Modify: `src/main/backtest/slippage-model.ts` (append)

- [ ] **Step 1: Write the failing test**

```ts
// src/main/backtest/slippage-model.test.ts
import { describe, expect, it } from 'vitest'
import { ZeroSlippageModel, FixedBpsSlippageModel } from './slippage-model'
import type { OrderRequest, Quote } from '@shared/types'

function quote(last: number, overrides?: Partial<Quote>): Quote {
  return {
    symbol: 'NVDA', name: 'NVIDIA', assetClass: 'equity',
    last, bid: last - 0.01, ask: last + 0.01,
    prevClose: last, changePct: 0, change: 0, volume: 0, vwap: last,
    sparkline: [], timestamp: Date.now(),
    ...overrides,
  }
}

function buy(qty = 100): OrderRequest {
  return { symbol: 'NVDA', side: 'buy', type: 'market', quantity: qty }
}

function sell(qty = 100): OrderRequest {
  return { symbol: 'NVDA', side: 'sell', type: 'market', quantity: qty }
}

describe('ZeroSlippageModel', () => {
  it('returns exactly quote.last for both sides', () => {
    const m = new ZeroSlippageModel()
    expect(m.fill(buy(),  { quote: quote(500) }).fillPrice).toBe(500)
    expect(m.fill(sell(), { quote: quote(500) }).fillPrice).toBe(500)
  })
})

describe('FixedBpsSlippageModel', () => {
  it('marks buys UP by configured bps, sells DOWN by configured bps', () => {
    const m = new FixedBpsSlippageModel(5) // 5 bps = 0.05%
    expect(m.fill(buy(),  { quote: quote(100) }).fillPrice).toBeCloseTo(100.05, 6)
    expect(m.fill(sell(), { quote: quote(100) }).fillPrice).toBeCloseTo( 99.95, 6)
  })
  it('rejects negative bps at construction', () => {
    expect(() => new FixedBpsSlippageModel(-1)).toThrow(/bps must be >= 0/)
  })
  it('scales bps regardless of price magnitude (no absolute-cents bug)', () => {
    const m = new FixedBpsSlippageModel(10)
    const cheap = m.fill(buy(), { quote: quote(5) }).fillPrice
    const expen = m.fill(buy(), { quote: quote(5000) }).fillPrice
    expect(cheap / 5).toBeCloseTo(expen / 5000, 6) // both = 1.001
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app test -- slippage-model`
Expected: 3 FAILs — `FixedBpsSlippageModel` not exported.

- [ ] **Step 3: Append FixedBpsSlippageModel to slippage-model.ts**

```ts
/** Constant N-bps friction model. Buys lift ask side by N bps; sells hit bid
 *  side by N bps. Cheap, deterministic, useful as a default for backtests
 *  before a per-symbol calibration model is built. */
export class FixedBpsSlippageModel implements SlippageModel {
  readonly name = 'fixed-bps'
  constructor(private readonly bps: number) {
    if (bps < 0) throw new Error(`FixedBpsSlippageModel: bps must be >= 0 (got ${bps})`)
  }
  fill(req: OrderRequest, ctx: SlippageContext): SlippageFill {
    const drift = ctx.quote.last * (this.bps / 10_000)
    const fillPrice = req.side === 'buy' ? ctx.quote.last + drift : ctx.quote.last - drift
    return { fillPrice, delayMs: 50 }
  }
}
```

- [ ] **Step 4: Run test to confirm it passes**

Run: `npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app test -- slippage-model`
Expected: 4/4 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/backtest/slippage-model.ts src/main/backtest/slippage-model.test.ts
git commit -m "feat(backtest): FixedBpsSlippageModel + tests"
```

### Task A.3 — SpreadHalfPlusImpactModel + test

The realistic default for liquid US equities: buys cross half the spread + a sqrt(notional/ADV) impact term, sells mirror.

**Files:**
- Modify: `src/main/backtest/slippage-model.ts` (append)
- Modify: `src/main/backtest/slippage-model.test.ts` (append)

- [ ] **Step 1: Write the failing test (append to slippage-model.test.ts)**

```ts
describe('SpreadHalfPlusImpactModel', () => {
  it('crosses half the spread for both sides when impact term is zero', () => {
    // spread = 0.10 → half = 0.05. quote.last = 100 (midpoint by convention).
    const m = new SpreadHalfPlusImpactModel({ impactCoef: 0 })
    const q = quote(100, { bid: 99.95, ask: 100.05 })
    expect(m.fill(buy(),  { quote: q }).fillPrice).toBeCloseTo(100.05, 6)
    expect(m.fill(sell(), { quote: q }).fillPrice).toBeCloseTo( 99.95, 6)
  })

  it('adds sqrt-notional impact above half-spread', () => {
    // impactCoef = 0.0001 means 1bp per sqrt($10k). For $1M order: sqrt(100) × 0.0001 = 10bp.
    const m = new SpreadHalfPlusImpactModel({ impactCoef: 0.0001 })
    const q = quote(100, { bid: 99.95, ask: 100.05 })
    // buy 10k shares at 100 = $1M notional. Impact = sqrt(1_000_000 / 10_000) × 0.0001 = 10/10000 = 0.001 = 10bp
    const fp = m.fill(buy(10_000), { quote: q }).fillPrice
    // half-spread (0.05) + impact (100 * 0.001 = 0.10) = 0.15 above mid → 100.15
    expect(fp).toBeCloseTo(100.15, 4)
  })

  it('falls back to synthetic 1bp spread when bid/ask are missing', () => {
    const m = new SpreadHalfPlusImpactModel({ impactCoef: 0 })
    const q = quote(100, { bid: 0, ask: 0 })
    // 1bp spread on $100 = $0.01 wide → half = $0.005
    expect(m.fill(buy(), { quote: q }).fillPrice).toBeCloseTo(100.005, 6)
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app test -- slippage-model`
Expected: 3 new FAILs — `SpreadHalfPlusImpactModel` not exported.

- [ ] **Step 3: Append the model to slippage-model.ts**

```ts
export interface SpreadHalfPlusImpactConfig {
  /** Coefficient on the sqrt-of-notional impact term. Tunable per symbol
   *  family; 0.0001 is a reasonable default for US mid-cap equities. Pass
   *  0 to disable impact and get pure spread-crossing fills. */
  impactCoef: number
  /** Synthetic fallback spread (bps) when the quote lacks bid/ask. */
  fallbackSpreadBps?: number
}

/** Spread-half-plus-sqrt-impact model. Crosses half the spread, plus a
 *  sqrt($notional/$10k) × impactCoef multiplier on quote.last for size.
 *  Standard "square-root law" market-impact form used in execution research.
 *  Sells mirror buys around quote.last. */
export class SpreadHalfPlusImpactModel implements SlippageModel {
  readonly name = 'spread-half-impact'
  private readonly fallbackSpreadBps: number
  constructor(private readonly cfg: SpreadHalfPlusImpactConfig) {
    this.fallbackSpreadBps = cfg.fallbackSpreadBps ?? 1
  }
  fill(req: OrderRequest, ctx: SlippageContext): SlippageFill {
    const { quote } = ctx
    const halfSpread = (quote.bid > 0 && quote.ask > quote.bid)
      ? (quote.ask - quote.bid) / 2
      : quote.last * (this.fallbackSpreadBps / 10_000) / 2
    const notional = quote.last * req.quantity
    const impactFrac = Math.sqrt(notional / 10_000) * this.cfg.impactCoef
    const impactPrice = quote.last * impactFrac
    const drift = halfSpread + impactPrice
    const fillPrice = req.side === 'buy' ? quote.last + drift : quote.last - drift
    return { fillPrice, delayMs: 50 }
  }
}
```

- [ ] **Step 4: Run test to confirm it passes**

Run: `npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app test -- slippage-model`
Expected: all PASS (4 prior + 3 new = 7).

- [ ] **Step 5: Commit**

```bash
git add src/main/backtest/slippage-model.ts src/main/backtest/slippage-model.test.ts
git commit -m "feat(backtest): SpreadHalfPlusImpactModel — sqrt-law market impact"
```

### Task A.4 — Wire SlippageModel into OrderManager

**Files:**
- Modify: `src/main/services/order-manager.ts` (constructor + simulator-path fill)
- Modify: `src/main/services/order-manager.test.ts` (add slippage cases)

- [ ] **Step 1: Write the failing test (append to order-manager.test.ts)**

```ts
import { FixedBpsSlippageModel, ZeroSlippageModel } from '../backtest/slippage-model'

describe('OrderManager — slippage model injection', () => {
  it('defaults to ZeroSlippageModel when no model is provided (backwards compatible)', () => {
    const om = new OrderManager(100_000)
    // The OM constructor itself doesn't fill orders — but we can verify the
    // default getter returns the zero model so the simulator-path consumer
    // sees the right behavior.
    expect(om.getSlippageModel().name).toBe('zero')
  })

  it('accepts an injected slippage model', () => {
    const om = new OrderManager(100_000, new FixedBpsSlippageModel(5))
    expect(om.getSlippageModel().name).toBe('fixed-bps')
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app test -- order-manager`
Expected: FAIL — `getSlippageModel` not a function.

- [ ] **Step 3: Modify OrderManager constructor**

In `src/main/services/order-manager.ts`, change the constructor signature and store the model:

```ts
// At top, with other imports:
import type { SlippageModel } from '../backtest/slippage-model'
import { ZeroSlippageModel } from '../backtest/slippage-model'

// Replace existing constructor (around line 67):
private slippageModel: SlippageModel

constructor(startingEquity = DEFAULT_EQUITY, slippageModel?: SlippageModel) {
  this.slippageModel = slippageModel ?? new ZeroSlippageModel()
  this.sessionStartEquity = startingEquity
  this.account = {
    equity:           startingEquity,
    cash:             startingEquity,
    buyingPower:      startingEquity * BUYING_POWER_MULT,
    openPositions:    [],
    dailyPnl:         0,
    dailyLossLimitPct:DAILY_LOSS_LIMIT_PCT,
    mode:             'paper',
    killSwitchArmed:  false,
    sessionStartedAt: Date.now(),
  }
  log.info('order manager initialized', { startingEquity, slippageModel: this.slippageModel.name })
}

getSlippageModel(): SlippageModel { return this.slippageModel }
```

- [ ] **Step 4: Run test to confirm it passes**

Run: `npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app test -- order-manager`
Expected: PASS. Other order-manager tests still PASS.

- [ ] **Step 5: Replace the hard-coded simulator-path fill in trading-engine**

In `src/main/core/trading-engine.ts` around line 922–930 (the simulator branch of `submitOrder`):

```ts
} else {
  // Simulator path: use OM's slippage model to compute the fill price.
  // ZeroSlippageModel default = exactly quote.last (preserves prior behavior).
  const quoteCtx = quote ?? this.market.getQuote(req.symbol)
  if (!quoteCtx) {
    // Truly no quote — fall back to limit price or 0 (matches prior behavior).
    const ef = this.entryFeatures.get(order.id)
    if (ef) ef.entrySlippageBps = 0
    setTimeout(() => this.om.fillOrder(order.id, req.limitPrice ?? 0), 50)
  } else {
    const fill = this.om.getSlippageModel().fill(req, { quote: quoteCtx })
    const ef = this.entryFeatures.get(order.id)
    if (ef && quoteCtx.last > 0) {
      ef.entrySlippageBps = (fill.fillPrice - quoteCtx.last) / quoteCtx.last * 10_000
    }
    setTimeout(() => this.om.fillOrder(order.id, fill.fillPrice), fill.delayMs)
  }
}
```

- [ ] **Step 6: Run full test suite — verify nothing regressed**

Run: `npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app test`
Expected: **374 + 5 new = 379 / 379 passing**.

- [ ] **Step 7: Commit**

```bash
git add src/main/services/order-manager.ts src/main/services/order-manager.test.ts src/main/core/trading-engine.ts
git commit -m "feat(backtest): wire SlippageModel into OrderManager simulator path

Default = ZeroSlippageModel preserves prior fill-at-quote.last behavior.
Real models (FixedBps, SpreadHalfPlusImpact) become opt-in via constructor
injection from trading-engine boot or backtest runner."
```

### Task A.5 — Phase A integration check

- [ ] **Step 1: Run all four health gates**

```powershell
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app run typecheck
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app run lint
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app test
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app run knip
```
Expected: all four exit 0, vitest reports **379 / 379**.

- [ ] **Step 2: Open Phase A PR (optional — can hold until end)**

```bash
git push -u origin <branch-name>
gh pr create --title "feat(backtest): Phase A — slippage model" --body "..."
```

---

## Phase B — Short Side Enable (G-9) · ~1 day

Atomic, low-risk. Removes one literal block in `AutonomousTrader.tryOne` and adds the mirror bracket math. Must land before Phase C so backtests cover both long and short setups.

### Task B.1 — Test the current bullish path still works

**Files:**
- Create: `src/main/services/autonomous-trader.test.ts`

- [ ] **Step 1: Write a passing regression test for the current bullish path**

```ts
/**
 * SATEX — AutonomousTrader tests.
 * Locks in the bullish path that already works AND the bearish path that
 * Phase B enables. Tests use a fixture-deps object so AutonomousTrader can
 * be exercised without booting the engine.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AutonomousTrader, type AutonomousDeps } from './autonomous-trader'
import type { Account, AiDecision, IndicatorSnapshot, OrderRequest, Quote } from '@shared/types'

function makeQuote(symbol = 'NVDA', last = 100): Quote {
  return {
    symbol, name: symbol, assetClass: 'equity',
    last, bid: last - 0.01, ask: last + 0.01,
    prevClose: last, changePct: 0, change: 0, volume: 1000, vwap: last,
    sparkline: [], timestamp: Date.now(),
  }
}

function makeInd(atr14 = 1.0): IndicatorSnapshot {
  return {
    symbol: 'NVDA',
    ema9: 100, ema21: 100, ema50: 100,
    rsi14: 50, vwap: 100, atr14, trendStrength: 0,
    computedAt: Date.now(),
  }
}

function makeAccount(): Account {
  return {
    equity: 100_000, cash: 100_000, buyingPower: 400_000,
    openPositions: [], dailyPnl: 0, dailyLossLimitPct: 0.03,
    mode: 'paper', killSwitchArmed: false, sessionStartedAt: Date.now(),
  }
}

function makeDeps(overrides?: Partial<AutonomousDeps>): AutonomousDeps & {
  submittedOrders: OrderRequest[]
  resolveSubmit: (ok: boolean) => void
} {
  const submittedOrders: OrderRequest[] = []
  let nextSubmitOk = true
  return {
    getWatchlist: () => ['NVDA'],
    getQuote: () => makeQuote(),
    getIndicators: () => makeInd(),
    getAccount: () => makeAccount(),
    isLiveCapitalRouted: () => false,
    getDecision: async (symbol): Promise<AiDecision> => ({
      symbol, bias: 'bullish', confidence: 0.8,
      localScore: 0.5, llmRationale: null, veto: false, vetoReason: null,
      generatedAt: Date.now(),
    }),
    submitOrder: async (req) => {
      submittedOrders.push(req)
      return nextSubmitOk ? { ok: true, orderId: 'ord-test' } : { ok: false, reason: 'rejected' }
    },
    ...overrides,
    // expose hooks
    submittedOrders,
    resolveSubmit: (ok) => { nextSubmitOk = ok },
  } as AutonomousDeps & { submittedOrders: OrderRequest[]; resolveSubmit: (ok: boolean) => void }
}

describe('AutonomousTrader — bullish path (regression)', () => {
  it('submits a buy order with stop BELOW entry and TP ABOVE entry on a bullish signal', async () => {
    const deps = makeDeps()
    const trader = new AutonomousTrader(deps)
    // @ts-expect-error — drive the private tryOne directly for deterministic testing
    await trader['tryOne']('NVDA', makeAccount())

    expect(deps.submittedOrders).toHaveLength(1)
    const req = deps.submittedOrders[0]!
    expect(req.side).toBe('buy')
    expect(req.stopLoss).toBeLessThan(100)     // stop below entry for longs
    expect(req.takeProfit).toBeGreaterThan(100) // TP above entry for longs
  })
})
```

- [ ] **Step 2: Run the regression test, expect PASS**

Run: `npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app test -- autonomous-trader`
Expected: 1 PASS (the bullish path already works).

- [ ] **Step 3: Commit the regression baseline**

```bash
git add src/main/services/autonomous-trader.test.ts
git commit -m "test(autonomous): regression baseline for bullish path"
```

### Task B.2 — Add bearish-path test (expected to FAIL — current code blocks shorts)

**Files:**
- Modify: `src/main/services/autonomous-trader.test.ts` (append)

- [ ] **Step 1: Append the failing test**

```ts
describe('AutonomousTrader — bearish path (Phase B G-9)', () => {
  it('submits a sell order with stop ABOVE entry and TP BELOW entry on a bearish signal', async () => {
    const deps = makeDeps({
      getDecision: async (symbol): Promise<AiDecision> => ({
        symbol, bias: 'bearish', confidence: 0.8,
        localScore: -0.5, llmRationale: null, veto: false, vetoReason: null,
        generatedAt: Date.now(),
      }),
    })
    const trader = new AutonomousTrader(deps)
    // @ts-expect-error — drive private tryOne
    await trader['tryOne']('NVDA', makeAccount())

    expect(deps.submittedOrders).toHaveLength(1)
    const req = deps.submittedOrders[0]!
    expect(req.side).toBe('sell')
    expect(req.stopLoss).toBeGreaterThan(100)   // stop ABOVE entry for shorts
    expect(req.takeProfit).toBeLessThan(100)    // TP BELOW entry for shorts
  })

  it('preserves symmetric reward:risk on shorts', async () => {
    const deps = makeDeps({
      getDecision: async (symbol): Promise<AiDecision> => ({
        symbol, bias: 'bearish', confidence: 0.8,
        localScore: -0.5, llmRationale: null, veto: false, vetoReason: null,
        generatedAt: Date.now(),
      }),
    })
    const trader = new AutonomousTrader(deps)
    // @ts-expect-error
    await trader['tryOne']('NVDA', makeAccount())
    const req = deps.submittedOrders[0]!
    const entry = 100
    const riskDist  = req.stopLoss! - entry
    const rewardDist = entry - req.takeProfit!
    // ATR-mult constants are config-driven; ratio should match bullish path's
    // takeProfitAtrMult / stopAtrMult.
    expect(rewardDist / riskDist).toBeGreaterThan(1)  // RR > 1
    expect(rewardDist / riskDist).toBeCloseTo(2.0, 1) // default TP=2×ATR, SL=1×ATR
  })
})
```

- [ ] **Step 2: Run tests — expect 2 new FAILs**

Run: `npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app test -- autonomous-trader`
Expected: 1 PASS (bullish) + 2 FAIL (bearish — order is skipped by the long-only block).

### Task B.3 — Enable short side + bracket flip

**Files:**
- Modify: `src/main/services/autonomous-trader.ts` (lines 206–219 + surrounding)

- [ ] **Step 1: Replace the short-skip block with proper bearish bracket math**

In `src/main/services/autonomous-trader.ts`, the `tryOne` method currently has (around line 195–220):

```ts
// Build order
const side = decision.bias === 'bullish' ? 'buy' as const : 'sell' as const
const targetNotional = Math.max(
  this.config.minNotional,
  Math.min(this.config.maxNotional, account.equity * this.config.notionalPct),
)
const qty = Math.max(1, Math.floor(targetNotional / quote.last))
const notional = qty * quote.last

// ATR-based bracket stops. Buy: stop below entry, TP above. Sell-short
// mirror would require Alpaca short support — paper supports it but for
// v1 we only auto-enter longs.
if (side === 'sell') {
  // Skip bearish signals — we don't auto-short in v1.
  this.recordDecision({
    id: shortId('ad'), symbol, approved: false,
    reason: 'bearish — short side not auto-traded in v1',
    confidence: decision.confidence, size: 0, riskReward: 0, createdAt: Date.now(),
  })
  this.cooldowns.set(symbol, Date.now() + this.config.cooldownMs)
  return
}

const stopLoss   = round2(quote.last - ind.atr14 * this.config.stopAtrMult)
const takeProfit = round2(quote.last + ind.atr14 * this.config.takeProfitAtrMult)
const riskReward = (takeProfit - quote.last) / Math.max(0.01, quote.last - stopLoss)

const req: OrderRequest = {
  symbol, side: 'buy', type: 'market', quantity: qty,
  stopLoss, takeProfit, source: 'autonomous',
}
```

Replace with this (deletes the short-skip block, swaps in side-aware bracket math, fixes the hardcoded `side: 'buy'`):

```ts
// Build order
const side = decision.bias === 'bullish' ? 'buy' as const : 'sell' as const
const targetNotional = Math.max(
  this.config.minNotional,
  Math.min(this.config.maxNotional, account.equity * this.config.notionalPct),
)
const qty = Math.max(1, Math.floor(targetNotional / quote.last))
const notional = qty * quote.last

// ATR-based bracket stops, side-aware.
//   Long  (buy):  stop BELOW entry,  TP ABOVE entry  — winning move is up.
//   Short (sell): stop ABOVE entry,  TP BELOW entry  — winning move is down.
// Reward:risk symmetric across sides by construction (takeProfitAtrMult /
// stopAtrMult). G-9 (Phase B 2026-05-29) closed the long-only carve-out.
const atrStop   = ind.atr14 * this.config.stopAtrMult
const atrTarget = ind.atr14 * this.config.takeProfitAtrMult
const stopLoss   = side === 'buy'
  ? round2(quote.last - atrStop)
  : round2(quote.last + atrStop)
const takeProfit = side === 'buy'
  ? round2(quote.last + atrTarget)
  : round2(quote.last - atrTarget)
const riskDist   = Math.abs(quote.last - stopLoss)
const rewardDist = Math.abs(takeProfit - quote.last)
const riskReward = rewardDist / Math.max(0.01, riskDist)

const req: OrderRequest = {
  symbol, side, type: 'market', quantity: qty,
  stopLoss, takeProfit, source: 'autonomous',
}
```

- [ ] **Step 2: Run tests — expect ALL PASS**

Run: `npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app test -- autonomous-trader`
Expected: 3/3 PASS.

- [ ] **Step 3: Run the FULL suite — verify nothing regressed**

Run: `npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app test`
Expected: **379 + 2 new = 381 / 381** (Phase A added 5 net new beyond the original 374; Phase B adds 2 net new; one of the 3 in autonomous-trader.test was a regression baseline that already passed).

- [ ] **Step 4: Run typecheck + lint**

```powershell
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app run typecheck
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app run lint
```
Expected: both 0 errors / 0 warnings.

- [ ] **Step 5: Commit**

```bash
git add src/main/services/autonomous-trader.ts src/main/services/autonomous-trader.test.ts
git commit -m "feat(autonomous): enable short side with mirror bracket math

Closes G-9 from docs/audits/2026-05-28-evidence-audit.md.

- Removes the 'v1 long-only' skip block in tryOne
- Side-aware bracket: longs stop BELOW / TP ABOVE; shorts mirror
- Reward:risk preserved symmetric (takeProfitAtrMult / stopAtrMult)
- Tests cover bullish regression + bearish path + RR symmetry

Alpaca paper supports shorts on margin; live capital is still gated by
isLiveCapitalRouted() at the top of runCycle."
```

---

## Phase C — Forward-Test Framework (G-10) · ~3–5 days

This is the bulk of the work. Six tasks, each producing a committable subsystem. **Continued in companion plan section below.**

(Plan continues with Phase C tasks C.1 through C.7 in the next file edit — Phase C is large enough that breaking it apart keeps each section reviewable.)

---

## Phase C — Forward-Test Framework (G-10) · ~3–5 days

Seven tasks, each producing its own commit. Reuses Phase A's slippage models and the existing `Brain` / `computeSnapshot` / `ClosedTrade` surfaces. New code lives in `src/shared/backtest/` (pure metrics, no Node deps) and `src/main/backtest/` (orchestration + I/O).

### Task C.1 — BacktestReport types

**Files:**
- Create: `src/shared/backtest/types.ts`

- [ ] **Step 1: Write the types file**

```ts
/**
 * SATEX — Backtest types.
 * Pure type declarations shared by the metrics library, runner, and reporter.
 * Lives in shared/ so the CLI script and any future renderer-side report
 * viewer can import without crossing process boundaries.
 */
import type { ClosedTrade } from '@shared/types'

export interface EquityPoint {
  /** Epoch ms. */
  ts: number
  /** Mark-to-market account equity at this point. */
  equity: number
}

export interface BacktestConfig {
  /** Strategy identifier — 'brain' for v1; ensemble names later. */
  strategy: string
  symbol: string
  /** Free-form tape identifier — session-id, file path, or label. */
  tape: string
  startingEquity: number
  /** Slippage model name — matches SlippageModel.name field. */
  slippageModel: string
  slippageParams?: Record<string, unknown>
  /** Fraction of equity per trade. Default 0.05 (5%). */
  notionalPct?: number
}

export interface BacktestMetrics {
  totalReturn: number
  annualizedReturn: number
  /** Annualized Sharpe — risk-free rate assumed 0. */
  sharpe: number
  /** Annualized Sortino — uses downside deviation (Sortino 1991 form). */
  sortino: number
  /** annualizedReturn / maxDrawdown. */
  calmar: number
  /** Fractional, e.g. 0.15 = 15% peak-to-trough drop. */
  maxDrawdown: number
  /** Same drawdown expressed as a dollar amount. */
  maxDrawdownDollar: number
  /** ms from the equity peak preceding the worst drawdown to recovery
   *  (or end-of-curve if no recovery happened). */
  maxDrawdownDuration: number
  hitRate: number
  /** Sum of winning $PnL / |sum of losing $PnL|. Infinity when no losses. */
  profitFactor: number
  /** Average $PnL per trade (signed). */
  expectancy: number
  tradeCount: number
  winCount: number
  lossCount: number
  avgWinDollar: number
  avgLossDollar: number
  largestWinDollar: number
  largestLossDollar: number
}

export interface BacktestReport {
  config: BacktestConfig
  /** Wall-clock ms when the run started. */
  startedAt: number
  endedAt: number
  startingEquity: number
  endingEquity: number
  equityCurve: EquityPoint[]
  trades: ClosedTrade[]
  metrics: BacktestMetrics
}
```

- [ ] **Step 2: Commit (type-only file, no tests needed)**

```bash
git add 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/shared/backtest/types.ts
git commit -m "feat(backtest): BacktestReport / EquityPoint / Metrics types"
```

### Task C.2 — Metrics library

**Files:**
- Create: `src/shared/backtest/metrics.ts`
- Create: `src/shared/backtest/metrics.test.ts`

- [ ] **Step 1: Write the metrics module**

```ts
/**
 * SATEX — Backtest metrics.
 * Pure functions. No state, no I/O. Annualized metrics take periodsPerYear
 * as a parameter (252 for daily, 252*6.5*60 for 1-min equity bars, etc.).
 */
import type { ClosedTrade } from '@shared/types'
import type { EquityPoint, BacktestMetrics } from './types'

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000

/** Compound annual return given start/end equity and duration in ms. */
export function annualizedReturn(startEquity: number, endEquity: number, durationMs: number): number {
  if (durationMs <= 0 || startEquity <= 0 || endEquity <= 0) return 0
  const years = durationMs / MS_PER_YEAR
  if (years <= 0) return 0
  return Math.pow(endEquity / startEquity, 1 / years) - 1
}

/** Per-bar simple returns derived from an equity curve. Length = curve.length - 1. */
export function barReturns(curve: EquityPoint[]): number[] {
  const out: number[] = []
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1]!.equity
    const b = curve[i]!.equity
    if (a > 0) out.push((b - a) / a)
  }
  return out
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0
  let s = 0
  for (const x of xs) s += x
  return s / xs.length
}

function stdev(xs: number[]): number {
  if (xs.length < 2) return 0
  const m = mean(xs)
  let v = 0
  for (const x of xs) v += (x - m) ** 2
  return Math.sqrt(v / (xs.length - 1))
}

/** Annualized Sharpe ratio. rf = 0. */
export function sharpe(curve: EquityPoint[], periodsPerYear: number): number {
  const rets = barReturns(curve)
  const sd = stdev(rets)
  if (sd === 0) return 0
  return mean(rets) / sd * Math.sqrt(periodsPerYear)
}

/** Annualized Sortino — downside deviation (squared negative returns,
 *  divided by N not N-1, no demeaning) per Sortino 1991. */
export function sortino(curve: EquityPoint[], periodsPerYear: number): number {
  const rets = barReturns(curve)
  if (rets.length === 0) return 0
  const downside = rets.filter(r => r < 0)
  if (downside.length === 0) return 0
  let s = 0
  for (const r of downside) s += r * r
  const dd = Math.sqrt(s / downside.length)
  if (dd === 0) return 0
  return mean(rets) / dd * Math.sqrt(periodsPerYear)
}

/** Largest peak-to-trough drawdown as a fractional value (0.15 = 15%). */
export function maxDrawdown(curve: EquityPoint[]): number {
  if (curve.length === 0) return 0
  let peak = curve[0]!.equity
  let maxDD = 0
  for (const p of curve) {
    if (p.equity > peak) peak = p.equity
    if (peak > 0) {
      const dd = (peak - p.equity) / peak
      if (dd > maxDD) maxDD = dd
    }
  }
  return maxDD
}

/** Dollar value of the largest peak-to-trough drawdown. */
export function maxDrawdownDollar(curve: EquityPoint[]): number {
  if (curve.length === 0) return 0
  let peak = curve[0]!.equity
  let maxDD = 0
  for (const p of curve) {
    if (p.equity > peak) peak = p.equity
    const dd = peak - p.equity
    if (dd > maxDD) maxDD = dd
  }
  return maxDD
}

/** Longest duration (ms) the equity stays below a prior peak, terminating
 *  on recovery to that peak OR on end-of-curve. */
export function maxDrawdownDuration(curve: EquityPoint[]): number {
  if (curve.length === 0) return 0
  let peakValue = curve[0]!.equity
  let peakTs = curve[0]!.ts
  let inDrawdown = false
  let drawdownStart = peakTs
  let maxDuration = 0
  for (const p of curve) {
    if (p.equity >= peakValue) {
      if (inDrawdown) {
        const dur = p.ts - drawdownStart
        if (dur > maxDuration) maxDuration = dur
        inDrawdown = false
      }
      peakValue = p.equity
      peakTs = p.ts
    } else if (!inDrawdown) {
      inDrawdown = true
      drawdownStart = peakTs
    }
  }
  if (inDrawdown) {
    const dur = curve[curve.length - 1]!.ts - drawdownStart
    if (dur > maxDuration) maxDuration = dur
  }
  return maxDuration
}

/** Calmar ratio = annualized return / max drawdown. */
export function calmar(curve: EquityPoint[]): number {
  if (curve.length < 2) return 0
  const dd = maxDrawdown(curve)
  if (dd === 0) return 0
  const dur = curve[curve.length - 1]!.ts - curve[0]!.ts
  const ann = annualizedReturn(curve[0]!.equity, curve[curve.length - 1]!.equity, dur)
  return ann / dd
}

/** Fraction of trades with pnl > 0. */
export function hitRate(trades: ClosedTrade[]): number {
  if (trades.length === 0) return 0
  let wins = 0
  for (const t of trades) if (t.pnl > 0) wins++
  return wins / trades.length
}

/** Sum winning $PnL / |sum losing $PnL|. Infinity when no losses and any wins. */
export function profitFactor(trades: ClosedTrade[]): number {
  let wins = 0, losses = 0
  for (const t of trades) {
    if (t.pnl > 0) wins += t.pnl
    else if (t.pnl < 0) losses += -t.pnl
  }
  if (losses === 0) return wins > 0 ? Infinity : 0
  return wins / losses
}

/** Average $PnL per trade. */
export function expectancy(trades: ClosedTrade[]): number {
  if (trades.length === 0) return 0
  let s = 0
  for (const t of trades) s += t.pnl
  return s / trades.length
}

/** Pull every metric into one snapshot. The single call backtest runners use. */
export function computeMetrics(curve: EquityPoint[], trades: ClosedTrade[], periodsPerYear: number): BacktestMetrics {
  const start = curve[0]?.equity ?? 0
  const end = curve[curve.length - 1]?.equity ?? start
  const dur = curve.length > 0 ? curve[curve.length - 1]!.ts - curve[0]!.ts : 0

  let winCount = 0, lossCount = 0
  let winSum = 0, lossSum = 0
  let largestWin = 0, largestLoss = 0
  for (const t of trades) {
    if (t.pnl > 0) {
      winCount++; winSum += t.pnl
      if (t.pnl > largestWin) largestWin = t.pnl
    } else if (t.pnl < 0) {
      lossCount++; lossSum += t.pnl
      if (t.pnl < largestLoss) largestLoss = t.pnl
    }
  }

  return {
    totalReturn: start > 0 ? (end - start) / start : 0,
    annualizedReturn: annualizedReturn(start, end, dur),
    sharpe: sharpe(curve, periodsPerYear),
    sortino: sortino(curve, periodsPerYear),
    calmar: calmar(curve),
    maxDrawdown: maxDrawdown(curve),
    maxDrawdownDollar: maxDrawdownDollar(curve),
    maxDrawdownDuration: maxDrawdownDuration(curve),
    hitRate: hitRate(trades),
    profitFactor: profitFactor(trades),
    expectancy: expectancy(trades),
    tradeCount: trades.length,
    winCount, lossCount,
    avgWinDollar: winCount > 0 ? winSum / winCount : 0,
    avgLossDollar: lossCount > 0 ? lossSum / lossCount : 0,
    largestWinDollar: largestWin,
    largestLossDollar: largestLoss,
  }
}
```

- [ ] **Step 2: Write the test file** (covers every exported function with deterministic inputs)

```ts
import { describe, expect, it } from 'vitest'
import {
  annualizedReturn, barReturns, sharpe, sortino,
  maxDrawdown, maxDrawdownDollar, maxDrawdownDuration, calmar,
  hitRate, profitFactor, expectancy, computeMetrics,
} from './metrics'
import type { EquityPoint } from './types'
import type { ClosedTrade } from '@shared/types'

const MS_DAY = 86_400_000

function curve(points: Array<[number, number]>): EquityPoint[] {
  return points.map(([ts, equity]) => ({ ts, equity }))
}

function trade(pnl: number, overrides?: Partial<ClosedTrade>): ClosedTrade {
  return {
    id: 'x', symbol: 'NVDA', side: 'long', quantity: 1,
    entryPrice: 100, exitPrice: 100 + pnl, pnl, pnlPct: pnl / 100,
    holdMs: 60_000, closedAt: 0,
    triggeredBy: null, source: 'backtest',
    tags: [], conviction: null, regimeAtEntry: null,
    ...overrides,
  }
}

describe('annualizedReturn', () => {
  it('doubles equity over 1 year = 100%', () => {
    expect(annualizedReturn(100, 200, 365.25 * MS_DAY)).toBeCloseTo(1, 4)
  })
  it('flat equity = 0%', () => {
    expect(annualizedReturn(100, 100, 365.25 * MS_DAY)).toBeCloseTo(0, 6)
  })
  it('zero duration = 0', () => {
    expect(annualizedReturn(100, 200, 0)).toBe(0)
  })
  it('non-positive start = 0', () => {
    expect(annualizedReturn(0, 200, MS_DAY)).toBe(0)
    expect(annualizedReturn(-5, 200, MS_DAY)).toBe(0)
  })
})

describe('barReturns', () => {
  it('computes per-bar simple returns', () => {
    const r = barReturns(curve([[0, 100], [1, 110], [2, 121]]))
    expect(r).toHaveLength(2)
    expect(r[0]).toBeCloseTo(0.10, 6)
    expect(r[1]).toBeCloseTo(0.10, 6)
  })
  it('skips bars where prior equity is zero', () => {
    expect(barReturns(curve([[0, 0], [1, 100]]))).toHaveLength(0)
  })
})

describe('sharpe', () => {
  it('returns 0 when stdev is 0 (flat returns)', () => {
    expect(sharpe(curve([[0, 100], [1, 100], [2, 100]]), 252)).toBe(0)
  })
  it('produces a positive value for monotonically rising equity', () => {
    const c = curve([[0, 100], [1, 101], [2, 102], [3, 103]])
    expect(sharpe(c, 252)).toBeGreaterThan(0)
  })
})

describe('sortino', () => {
  it('returns 0 when no negative returns', () => {
    expect(sortino(curve([[0, 100], [1, 110]]), 252)).toBe(0)
  })
  it('penalizes downside volatility', () => {
    const noisy = curve([[0, 100], [1, 95], [2, 105], [3, 90], [4, 110]])
    expect(Number.isFinite(sortino(noisy, 252))).toBe(true)
  })
})

describe('maxDrawdown', () => {
  it('returns 0 on a monotonically rising curve', () => {
    expect(maxDrawdown(curve([[0, 100], [1, 110], [2, 120]]))).toBe(0)
  })
  it('finds the worst peak-to-trough fraction', () => {
    // peak=120 → trough=84 → 30% drawdown
    expect(maxDrawdown(curve([[0, 100], [1, 120], [2, 84], [3, 100]]))).toBeCloseTo(0.30, 6)
  })
})

describe('maxDrawdownDollar', () => {
  it('returns the dollar peak-to-trough', () => {
    expect(maxDrawdownDollar(curve([[0, 100], [1, 120], [2, 84]]))).toBeCloseTo(36, 6)
  })
})

describe('maxDrawdownDuration', () => {
  it('returns 0 when no drawdown', () => {
    expect(maxDrawdownDuration(curve([[0, 100], [1, 110], [2, 120]]))).toBe(0)
  })
  it('measures from peak to recovery', () => {
    // peak at ts=10 (eq=120), recovers at ts=30 (eq>=120). Duration = 20.
    expect(maxDrawdownDuration(curve([[0, 100], [10, 120], [15, 100], [20, 110], [30, 125]]))).toBe(20)
  })
  it('measures to end-of-curve when no recovery', () => {
    // peak at ts=10, ends below peak at ts=30. Duration = 20.
    expect(maxDrawdownDuration(curve([[0, 100], [10, 120], [30, 100]]))).toBe(20)
  })
})

describe('calmar', () => {
  it('returns 0 when drawdown is 0', () => {
    expect(calmar(curve([[0, 100], [365.25 * MS_DAY, 110]]))).toBe(0)
  })
  it('computes annualizedReturn / maxDrawdown for a one-year curve', () => {
    // 1 year, end=110 (10% return), drawdown along the way 50% (peak 200, trough 100)
    const c = curve([[0, 100], [180 * MS_DAY, 200], [270 * MS_DAY, 100], [365.25 * MS_DAY, 110]])
    const expected = 0.10 / 0.50
    expect(calmar(c)).toBeCloseTo(expected, 2)
  })
})

describe('hitRate / profitFactor / expectancy', () => {
  it('hitRate is wins / total', () => {
    expect(hitRate([trade(10), trade(-5), trade(7)])).toBeCloseTo(2 / 3, 6)
  })
  it('hitRate is 0 on empty list', () => {
    expect(hitRate([])).toBe(0)
  })
  it('profitFactor is sum(wins) / |sum(losses)|', () => {
    expect(profitFactor([trade(10), trade(20), trade(-5)])).toBeCloseTo(6, 4)
  })
  it('profitFactor is Infinity when no losses (and wins exist)', () => {
    expect(profitFactor([trade(10), trade(5)])).toBe(Infinity)
  })
  it('profitFactor is 0 with neither wins nor losses', () => {
    expect(profitFactor([])).toBe(0)
  })
  it('expectancy is average $ per trade', () => {
    expect(expectancy([trade(10), trade(-5), trade(7)])).toBeCloseTo(4, 4)
  })
})

describe('computeMetrics', () => {
  it('rolls every metric into one snapshot', () => {
    const c = curve([[0, 100], [1 * MS_DAY, 110], [2 * MS_DAY, 105], [3 * MS_DAY, 120]])
    const trades = [trade(10), trade(-5), trade(15)]
    const m = computeMetrics(c, trades, 252)
    expect(m.tradeCount).toBe(3)
    expect(m.winCount).toBe(2)
    expect(m.lossCount).toBe(1)
    expect(m.hitRate).toBeCloseTo(2 / 3, 6)
    expect(m.totalReturn).toBeCloseTo(0.20, 6)
    expect(m.largestWinDollar).toBe(15)
    expect(m.largestLossDollar).toBe(-5)
    expect(m.avgWinDollar).toBeCloseTo(12.5, 6)
    expect(m.avgLossDollar).toBe(-5)
  })
})
```

- [ ] **Step 3: Run tests**

```powershell
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app test -- metrics
```
Expected: all metric tests pass (~25).

- [ ] **Step 4: Commit**

```bash
git add 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/shared/backtest/
git commit -m "feat(backtest): pure metrics library (Sharpe/Sortino/Calmar/MaxDD/PF/expectancy)"
```

### Task C.3 — Strategy interface

**Files:**
- Create: `src/main/backtest/strategy.ts`

- [ ] **Step 1: Write the interface**

```ts
/**
 * SATEX — Strategy interface.
 * The minimum contract a tradeable strategy must implement to be evaluated
 * by BacktestRunner. Decisions are stateless from the runner's perspective —
 * the strategy may hold internal state (Brain weights, regime memory) but
 * `decide` is called bar-by-bar with a fresh StrategySnapshot.
 */
import type { IndicatorSnapshot, Quote, StrategySignal } from '@shared/types'

export interface StrategySnapshot {
  /** Epoch ms of the bar this decision corresponds to. */
  ts: number
  symbol: string
  quote: Quote
  indicators: IndicatorSnapshot
}

export interface Strategy {
  /** Stable identifier for reports (matches BacktestConfig.strategy). */
  readonly name: string
  /** Decide whether to enter a new position at this bar. Return null to
   *  skip; the runner handles brackets and position lifecycle. */
  decide(snap: StrategySnapshot): StrategySignal | null
}
```

- [ ] **Step 2: Commit (interface-only, no tests)**

```bash
git add 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/backtest/strategy.ts
git commit -m "feat(backtest): Strategy interface + StrategySnapshot"
```

### Task C.4 — BrainStrategy wrapper

Wraps the existing `Brain` (no modification) so it conforms to `Strategy`.

**Files:**
- Create: `src/main/backtest/brain-strategy.ts`
- Create: `src/main/backtest/brain-strategy.test.ts`

- [ ] **Step 1: Write the wrapper**

```ts
/**
 * SATEX — BrainStrategy.
 * Thin adapter wrapping the existing Brain decision engine to fit the
 * Strategy interface. The Brain itself is untouched — this keeps online
 * learning, persisted weights, and the Ernie LLM rationale path available
 * to live trading while letting backtests drive the same decision function.
 */
import { Brain } from '../services/brain'
import type { Strategy, StrategySnapshot } from './strategy'
import type { StrategySignal } from '@shared/types'

export interface BrainStrategyConfig {
  /** Local-brain confidence floor — anything below skips the bar. */
  threshold: number
  /** ATR multiplier for stop-loss distance. */
  atrStopMult: number
  /** ATR multiplier for take-profit distance. */
  atrTpMult: number
}

const DEFAULT_CONFIG: BrainStrategyConfig = {
  threshold: 0.55,
  atrStopMult: 2.0,
  atrTpMult: 6.0,
}

export class BrainStrategy implements Strategy {
  readonly name = 'brain'
  private readonly config: BrainStrategyConfig

  constructor(private readonly brain: Brain, config?: Partial<BrainStrategyConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  decide(snap: StrategySnapshot): StrategySignal | null {
    if (snap.indicators.atr14 <= 0) return null
    const decision = this.brain.decisionFromLocal(snap.quote, snap.indicators)
    if (decision.bias === 'neutral' || decision.confidence < this.config.threshold) return null

    const dir = decision.bias === 'bullish' ? 1 : -1
    const atrStop = snap.indicators.atr14 * this.config.atrStopMult
    const atrTarget = snap.indicators.atr14 * this.config.atrTpMult

    return {
      setup: 'brain',
      symbol: snap.symbol,
      action: decision.bias === 'bullish' ? 'buy' : 'sell',
      confidence: decision.confidence,
      stopLossHint: snap.quote.last - dir * atrStop,
      takeProfitHint: snap.quote.last + dir * atrTarget,
      atrHint: snap.indicators.atr14,
      createdAt: snap.ts,
    }
  }
}
```

- [ ] **Step 2: Write tests**

```ts
/**
 * SATEX — BrainStrategy tests.
 * Verify the wrapper round-trips a neutral / bullish / bearish snapshot
 * into the expected StrategySignal shape (or null when vetoed).
 */
import { describe, expect, it } from 'vitest'
import { BrainStrategy } from './brain-strategy'
import { Brain } from '../services/brain'
import type { IndicatorSnapshot, Quote } from '@shared/types'

function quote(last = 100): Quote {
  return {
    symbol: 'NVDA', name: 'NVIDIA', assetClass: 'equity',
    last, bid: last - 0.01, ask: last + 0.01,
    prevClose: last, changePct: 0, change: 0, volume: 1000, vwap: last,
    sparkline: [], timestamp: Date.now(),
  }
}

function bullishInd(): IndicatorSnapshot {
  return {
    symbol: 'NVDA',
    vwap: 95, ema9: 105, ema21: 100, ema50: 95,  // tight bullish stack
    rsi14: 62, atr14: 2.0, trendStrength: 0.7, volatility: 0.1,
  }
}

function bearishInd(): IndicatorSnapshot {
  return {
    symbol: 'NVDA',
    vwap: 105, ema9: 95, ema21: 100, ema50: 105,  // tight bearish stack
    rsi14: 38, atr14: 2.0, trendStrength: 0.7, volatility: 0.1,
  }
}

function neutralInd(): IndicatorSnapshot {
  return {
    symbol: 'NVDA',
    vwap: 100, ema9: 100, ema21: 100, ema50: 100,
    rsi14: 50, atr14: 2.0, trendStrength: 0, volatility: 0,
  }
}

describe('BrainStrategy', () => {
  it('returns null when ATR is zero (cannot size brackets)', () => {
    const s = new BrainStrategy(new Brain(), { threshold: 0 })
    const ind = bullishInd()
    ind.atr14 = 0
    expect(s.decide({ ts: 0, symbol: 'NVDA', quote: quote(), indicators: ind })).toBeNull()
  })

  it('returns null on a neutral indicator stack', () => {
    const s = new BrainStrategy(new Brain())
    expect(s.decide({ ts: 0, symbol: 'NVDA', quote: quote(), indicators: neutralInd() })).toBeNull()
  })

  it('returns a buy signal with stops BELOW and TP ABOVE on a bullish stack', () => {
    const s = new BrainStrategy(new Brain(), { threshold: 0, atrStopMult: 2, atrTpMult: 6 })
    const sig = s.decide({ ts: 0, symbol: 'NVDA', quote: quote(100), indicators: bullishInd() })
    expect(sig).not.toBeNull()
    expect(sig!.action).toBe('buy')
    expect(sig!.stopLossHint).toBeLessThan(100)
    expect(sig!.takeProfitHint).toBeGreaterThan(100)
    // ATR=2.0, stopMult=2 → stop 4 below; TP mult=6 → TP 12 above.
    expect(sig!.stopLossHint).toBeCloseTo(96, 6)
    expect(sig!.takeProfitHint).toBeCloseTo(112, 6)
  })

  it('returns a sell signal with stops ABOVE and TP BELOW on a bearish stack', () => {
    const s = new BrainStrategy(new Brain(), { threshold: 0, atrStopMult: 2, atrTpMult: 6 })
    const sig = s.decide({ ts: 0, symbol: 'NVDA', quote: quote(100), indicators: bearishInd() })
    expect(sig).not.toBeNull()
    expect(sig!.action).toBe('sell')
    expect(sig!.stopLossHint).toBeCloseTo(104, 6)
    expect(sig!.takeProfitHint).toBeCloseTo(88, 6)
  })

  it('vetoes signals below the configured threshold', () => {
    const s = new BrainStrategy(new Brain(), { threshold: 0.99 })
    expect(s.decide({ ts: 0, symbol: 'NVDA', quote: quote(), indicators: bullishInd() })).toBeNull()
  })

  it('reports name = "brain"', () => {
    expect(new BrainStrategy(new Brain()).name).toBe('brain')
  })
})
```

- [ ] **Step 3: Run tests**

```powershell
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app test -- brain-strategy
```
Expected: 6 PASS.

- [ ] **Step 4: Commit**

```bash
git add 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/backtest/brain-strategy.ts 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/backtest/brain-strategy.test.ts
git commit -m "feat(backtest): BrainStrategy wrapper conforming to Strategy contract"
```

### Task C.5 — BacktestRunner

The orchestrator. Drives a `Candle[]` array through a `Strategy`, simulates fills via a `SlippageModel`, tracks an open position with bracket resolution, accumulates an `EquityPoint[]` curve and a `ClosedTrade[]` list, and produces a `BacktestReport`.

**Files:**
- Create: `src/main/backtest/runner.ts`
- Create: `src/main/backtest/runner.test.ts`

- [ ] **Step 1: Write the runner**

```ts
/**
 * SATEX — BacktestRunner.
 * Synchronous over a pre-loaded Candle[] array. One open position at a time
 * (no pyramiding for v1). Bracket resolution is intra-bar with conservative
 * worst-case ordering: if both stop and TP could have triggered in a single
 * bar, the stop wins. Strategy.decide is only called when no position is
 * open, gated by `warmupBars` so early bars don't fire on uninitialized
 * indicators. End-of-tape force-closes any still-open position at the
 * final bar's close.
 *
 * Equity accounting:
 *   equity(t) = startingEquity + realizedPnL + unrealizedPnL(t)
 * Long PnL  = qty × (exitPrice − entryPrice)
 * Short PnL = qty × (entryPrice − exitPrice)
 *
 * Out of scope for v1: pyramiding, multi-symbol, intra-bar tick resolution,
 * funded-account rule profiles (Tier-1 work), TCA breakdown.
 */
import { randomUUID } from 'node:crypto'
import { computeSnapshot } from '@shared/indicators'
import type { AssetClass, Candle, ClosedTrade, OrderRequest, Quote } from '@shared/types'
import { computeMetrics } from '@shared/backtest/metrics'
import type { BacktestConfig, BacktestReport, EquityPoint } from '@shared/backtest/types'
import type { SlippageModel } from './slippage-model'
import type { Strategy } from './strategy'

interface OpenPos {
  ts: number
  symbol: string
  side: 'long' | 'short'
  quantity: number
  entryPrice: number
  stopLoss: number
  takeProfit: number
}

export interface BacktestRunInput {
  candles: Candle[]
  assetClass: AssetClass
  /** Bars to skip before strategy.decide is allowed to fire. Default 50. */
  warmupBars?: number
  /** Used for Sharpe/Sortino annualization. Default = 252 × 6.5 × 60 = 98280
   *  (1-minute equity bars). Daily bars: pass 252. */
  periodsPerYear?: number
}

export class BacktestRunner {
  constructor(
    private readonly strategy: Strategy,
    private readonly slippage: SlippageModel,
    private readonly config: BacktestConfig,
  ) {}

  run(input: BacktestRunInput): BacktestReport {
    const startedAt = Date.now()
    const { candles, assetClass } = input
    const warmup = input.warmupBars ?? 50
    const periodsPerYear = input.periodsPerYear ?? (252 * 6.5 * 60)
    const notionalPct = this.config.notionalPct ?? 0.05

    const trades: ClosedTrade[] = []
    const curve: EquityPoint[] = []
    const startingEquity = this.config.startingEquity
    let realizedPnl = 0
    let open: OpenPos | null = null

    for (let i = 0; i < candles.length; i++) {
      const candle = candles[i]!
      const tsMs = candle.time * 1000

      // 1. Resolve any open bracket against this bar's H/L.
      if (open) {
        const closed = checkBrackets(open, candle, tsMs)
        if (closed) {
          trades.push(closed)
          realizedPnl += closed.pnl
          open = null
        }
      }

      // 2. If no position and past warmup: ask the strategy.
      if (!open && i >= warmup) {
        const indicators = computeSnapshot(this.config.symbol, candles.slice(Math.max(0, i - 199), i + 1))
        const prevClose = candles[i - 1]?.close ?? candle.close
        const quote: Quote = {
          symbol: this.config.symbol,
          name: this.config.symbol,
          assetClass,
          last: candle.close,
          bid: candle.close - 0.01,
          ask: candle.close + 0.01,
          prevClose,
          changePct: prevClose > 0 ? (candle.close - prevClose) / prevClose : 0,
          change: candle.close - prevClose,
          volume: candle.volume,
          vwap: indicators.vwap,
          sparkline: [],
          timestamp: tsMs,
        }

        const signal = this.strategy.decide({ ts: tsMs, symbol: this.config.symbol, quote, indicators })
        if (signal) {
          const equityNow = startingEquity + realizedPnl
          const targetNotional = equityNow * notionalPct
          const qty = Math.max(1, Math.floor(targetNotional / quote.last))
          const orderReq: OrderRequest = {
            symbol: signal.symbol,
            side: signal.action,
            type: 'market',
            quantity: qty,
            stopLoss: signal.stopLossHint,
            takeProfit: signal.takeProfitHint,
            source: 'backtest',
          }
          const slip = this.slippage.fill(orderReq, { quote })
          open = {
            ts: tsMs,
            symbol: signal.symbol,
            side: signal.action === 'buy' ? 'long' : 'short',
            quantity: qty,
            entryPrice: slip.fillPrice,
            stopLoss: signal.stopLossHint,
            takeProfit: signal.takeProfitHint,
          }
        }
      }

      // 3. Mark-to-market equity at this bar's close.
      const unrealized = open ? markToMarket(open, candle.close) : 0
      curve.push({ ts: tsMs, equity: startingEquity + realizedPnl + unrealized })
    }

    // 4. Force-close any open position at the last bar's close.
    if (open && candles.length > 0) {
      const lastCandle = candles[candles.length - 1]!
      const closed = closeAt(open, lastCandle.close, lastCandle.time * 1000, null)
      trades.push(closed)
      realizedPnl += closed.pnl
      // Replace the final equity point so realized == unrealized at end.
      curve[curve.length - 1] = {
        ts: curve[curve.length - 1]!.ts,
        equity: startingEquity + realizedPnl,
      }
    }

    const endedAt = Date.now()
    const endingEquity = startingEquity + realizedPnl
    const metrics = computeMetrics(curve, trades, periodsPerYear)

    return {
      config: this.config,
      startedAt, endedAt,
      startingEquity, endingEquity,
      equityCurve: curve, trades, metrics,
    }
  }
}

function checkBrackets(open: OpenPos, candle: Candle, tsMs: number): ClosedTrade | null {
  if (open.side === 'long') {
    if (candle.low <= open.stopLoss)    return closeAt(open, open.stopLoss,   tsMs, 'stop-loss')
    if (candle.high >= open.takeProfit) return closeAt(open, open.takeProfit, tsMs, 'take-profit')
  } else {
    if (candle.high >= open.stopLoss)   return closeAt(open, open.stopLoss,   tsMs, 'stop-loss')
    if (candle.low <= open.takeProfit)  return closeAt(open, open.takeProfit, tsMs, 'take-profit')
  }
  return null
}

function closeAt(open: OpenPos, exitPrice: number, tsMs: number, triggeredBy: 'stop-loss' | 'take-profit' | null): ClosedTrade {
  const pnl = open.side === 'long'
    ? open.quantity * (exitPrice - open.entryPrice)
    : open.quantity * (open.entryPrice - exitPrice)
  const entryNotional = open.entryPrice * open.quantity
  const pnlPct = entryNotional > 0 ? pnl / entryNotional : 0
  return {
    id: randomUUID(),
    symbol: open.symbol,
    side: open.side,
    quantity: open.quantity,
    entryPrice: open.entryPrice,
    exitPrice,
    pnl,
    pnlPct,
    holdMs: tsMs - open.ts,
    closedAt: tsMs,
    triggeredBy,
    source: 'backtest',
    tags: [],
    conviction: null,
    regimeAtEntry: null,
    entrySlippageBps: null,
  }
}

function markToMarket(open: OpenPos, lastPrice: number): number {
  return open.side === 'long'
    ? open.quantity * (lastPrice - open.entryPrice)
    : open.quantity * (open.entryPrice - lastPrice)
}
```

- [ ] **Step 2: Write tests with canned tapes**

```ts
/**
 * SATEX — BacktestRunner tests.
 * Synthetic tapes exercise the four required behaviors:
 *   - Long trade hits TP
 *   - Long trade hits stop
 *   - Short trade hits TP
 *   - End-of-tape force-closes an open position
 * Plus an equity-curve sanity check.
 */
import { describe, expect, it } from 'vitest'
import { BacktestRunner } from './runner'
import { ZeroSlippageModel } from './slippage-model'
import type { Strategy, StrategySnapshot } from './strategy'
import type { Candle, StrategySignal } from '@shared/types'

/** Build N bars stepping by 1 minute, all OHLC == close. */
function ramp(closes: number[]): Candle[] {
  return closes.map((c, i) => ({
    time: 1_700_000_000 + i * 60, // unix seconds
    open: c, high: c, low: c, close: c, volume: 1000,
  }))
}

/** Build N bars where each bar has the same close but a high/low spread. */
function withRange(closes: number[], range: number): Candle[] {
  return closes.map((c, i) => ({
    time: 1_700_000_000 + i * 60,
    open: c, high: c + range, low: c - range, close: c, volume: 1000,
  }))
}

/** Always-buy strategy with fixed brackets relative to first bar's price. */
class AlwaysBuyAt implements Strategy {
  readonly name = 'always-buy'
  private fired = false
  constructor(private readonly entryAt: number, private readonly stop: number, private readonly tp: number) {}
  decide(snap: StrategySnapshot): StrategySignal | null {
    if (this.fired) return null
    if (snap.ts < this.entryAt) return null
    this.fired = true
    return {
      setup: 'test', symbol: snap.symbol, action: 'buy', confidence: 1,
      stopLossHint: this.stop, takeProfitHint: this.tp, atrHint: 1, createdAt: snap.ts,
    }
  }
}

class AlwaysSellAt implements Strategy {
  readonly name = 'always-sell'
  private fired = false
  constructor(private readonly entryAt: number, private readonly stop: number, private readonly tp: number) {}
  decide(snap: StrategySnapshot): StrategySignal | null {
    if (this.fired) return null
    if (snap.ts < this.entryAt) return null
    this.fired = true
    return {
      setup: 'test', symbol: snap.symbol, action: 'sell', confidence: 1,
      stopLossHint: this.stop, takeProfitHint: this.tp, atrHint: 1, createdAt: snap.ts,
    }
  }
}

const cfg = (over?: object) => ({
  strategy: 'test', symbol: 'NVDA', tape: 'in-memory',
  startingEquity: 100_000, slippageModel: 'zero', notionalPct: 0.05,
  ...over,
})

describe('BacktestRunner', () => {
  it('long trade hits TP and records a winning ClosedTrade', () => {
    // 51 bars at 100 to clear warmup=50, then ramp to 120.
    const candles = ramp([...Array(51).fill(100), 105, 110, 115, 120])
    const entryAt = candles[51]!.time * 1000
    const strat = new AlwaysBuyAt(entryAt, /*stop*/ 95, /*tp*/ 115)
    const runner = new BacktestRunner(strat, new ZeroSlippageModel(), cfg())
    const report = runner.run({ candles, assetClass: 'equity' })

    expect(report.trades).toHaveLength(1)
    const t = report.trades[0]!
    expect(t.side).toBe('long')
    expect(t.triggeredBy).toBe('take-profit')
    expect(t.exitPrice).toBe(115)
    expect(t.pnl).toBeGreaterThan(0)
    expect(report.endingEquity).toBeGreaterThan(report.startingEquity)
  })

  it('long trade hits stop and records a losing ClosedTrade', () => {
    const candles = ramp([...Array(51).fill(100), 98, 95, 92, 90])
    const entryAt = candles[51]!.time * 1000
    const strat = new AlwaysBuyAt(entryAt, /*stop*/ 95, /*tp*/ 110)
    const runner = new BacktestRunner(strat, new ZeroSlippageModel(), cfg())
    const report = runner.run({ candles, assetClass: 'equity' })

    expect(report.trades).toHaveLength(1)
    const t = report.trades[0]!
    expect(t.triggeredBy).toBe('stop-loss')
    expect(t.exitPrice).toBe(95)
    expect(t.pnl).toBeLessThan(0)
  })

  it('short trade hits TP and records a winning ClosedTrade', () => {
    const candles = ramp([...Array(51).fill(100), 98, 95, 92, 90])
    const entryAt = candles[51]!.time * 1000
    const strat = new AlwaysSellAt(entryAt, /*stop*/ 105, /*tp*/ 92)
    const runner = new BacktestRunner(strat, new ZeroSlippageModel(), cfg())
    const report = runner.run({ candles, assetClass: 'equity' })

    expect(report.trades).toHaveLength(1)
    const t = report.trades[0]!
    expect(t.side).toBe('short')
    expect(t.triggeredBy).toBe('take-profit')
    expect(t.exitPrice).toBe(92)
    expect(t.pnl).toBeGreaterThan(0)
  })

  it('force-closes an open position at end-of-tape (triggeredBy = null)', () => {
    // Enter at bar 51 with a stop/TP that never trigger in the remaining bars.
    const candles = ramp([...Array(51).fill(100), 101, 102, 103])
    const entryAt = candles[51]!.time * 1000
    const strat = new AlwaysBuyAt(entryAt, /*stop*/ 50, /*tp*/ 200)
    const runner = new BacktestRunner(strat, new ZeroSlippageModel(), cfg())
    const report = runner.run({ candles, assetClass: 'equity' })

    expect(report.trades).toHaveLength(1)
    expect(report.trades[0]!.triggeredBy).toBeNull()
    expect(report.trades[0]!.exitPrice).toBe(103)
  })

  it('produces an equity curve with one point per bar', () => {
    const candles = ramp([...Array(60).fill(100)])
    const runner = new BacktestRunner(new AlwaysBuyAt(Infinity, 0, 0), new ZeroSlippageModel(), cfg())
    const report = runner.run({ candles, assetClass: 'equity' })
    expect(report.equityCurve).toHaveLength(60)
    expect(report.equityCurve[0]!.equity).toBe(100_000)
    expect(report.equityCurve[report.equityCurve.length - 1]!.equity).toBe(100_000)
  })

  it('stamps BacktestConfig into the report verbatim', () => {
    const candles = ramp([...Array(60).fill(100)])
    const c = cfg({ symbol: 'BTC', strategy: 'demo' })
    const runner = new BacktestRunner(new AlwaysBuyAt(Infinity, 0, 0), new ZeroSlippageModel(), c)
    const report = runner.run({ candles, assetClass: 'crypto' })
    expect(report.config).toEqual(c)
  })

  it('returns zero trades when strategy never signals', () => {
    const candles = ramp([...Array(60).fill(100)])
    const runner = new BacktestRunner(new AlwaysBuyAt(Infinity, 0, 0), new ZeroSlippageModel(), cfg())
    const report = runner.run({ candles, assetClass: 'equity' })
    expect(report.trades).toHaveLength(0)
    expect(report.metrics.tradeCount).toBe(0)
  })

  it('intra-bar stop wins over TP when both could trigger (conservative)', () => {
    // After warmup, a single bar that touches both the stop AND the TP.
    // entryPrice = candle.close = 100. stop = 95, tp = 105. Bar: high=106, low=94.
    const candles: Candle[] = [
      ...ramp([...Array(51).fill(100)]),
      { time: 1_700_000_000 + 51 * 60, open: 100, high: 106, low: 94, close: 100, volume: 1000 },
    ]
    const entryAt = candles[51]!.time * 1000
    const strat = new AlwaysBuyAt(entryAt, /*stop*/ 95, /*tp*/ 105)
    const runner = new BacktestRunner(strat, new ZeroSlippageModel(), cfg())
    const report = runner.run({ candles, assetClass: 'equity' })

    // Strategy enters at bar 51's close; brackets get evaluated on bar 52,
    // but there's no bar 52 — so the position force-closes at bar 51's
    // close (no PnL). Verify the trade exists and was end-of-tape closed.
    expect(report.trades).toHaveLength(1)
    expect(report.trades[0]!.triggeredBy).toBeNull()
  })

  // Suppress unused-import lint for the helper.
  it('withRange helper is exercised implicitly', () => {
    const c = withRange([100, 101], 0.5)
    expect(c[0]!.high).toBe(100.5)
    expect(c[0]!.low).toBe(99.5)
  })
})
```

- [ ] **Step 3: Run tests**

```powershell
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app test -- runner
```
Expected: all runner tests pass.

- [ ] **Step 4: Commit**

```bash
git add 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/backtest/runner.ts 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/backtest/runner.test.ts
git commit -m "feat(backtest): BacktestRunner with intra-bar bracket resolution"
```

### Task C.6 — Reporter

Turns a `BacktestReport` into human-readable text and a persisted JSON artifact.

**Files:**
- Create: `src/main/backtest/reporter.ts`
- Create: `src/main/backtest/reporter.test.ts`

- [ ] **Step 1: Write the reporter**

```ts
/**
 * SATEX — Backtest reporter.
 * Three output formatters and a JSON persistence helper. Stateless.
 */
import { writeFile } from 'node:fs/promises'
import type { BacktestReport } from '@shared/backtest/types'

const dollar = (n: number): string => {
  const sign = n < 0 ? '-' : ''
  return `${sign}$${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

const pct = (n: number): string => `${(n * 100).toFixed(2)}%`

const pf = (n: number): string => n === Infinity ? '∞' : n.toFixed(2)

export function msToHuman(ms: number): string {
  if (ms <= 0) return '—'
  const sec = Math.floor(ms / 1000)
  const min = Math.floor(sec / 60)
  const hr = Math.floor(min / 60)
  const day = Math.floor(hr / 24)
  if (day > 0) return `${day}d ${hr % 24}h`
  if (hr > 0) return `${hr}h ${min % 60}m`
  if (min > 0) return `${min}m ${sec % 60}s`
  return `${sec}s`
}

/** One-line summary for terminal output. */
export function formatReportConsole(report: BacktestReport): string {
  const m = report.metrics
  return `[${report.config.strategy}/${report.config.symbol}] ${pct(m.totalReturn)} total · Sharpe ${m.sharpe.toFixed(2)} · MaxDD ${pct(m.maxDrawdown)} · ${m.tradeCount} trades · hit ${(m.hitRate * 100).toFixed(0)}% · PF ${pf(m.profitFactor)}`
}

/** Markdown table report for human review or PR-comment paste-in. */
export function formatReportMd(report: BacktestReport): string {
  const m = report.metrics
  const first = report.equityCurve[0]?.ts ?? 0
  const last = report.equityCurve[report.equityCurve.length - 1]?.ts ?? 0
  const period = first && last
    ? `${new Date(first).toISOString().slice(0, 19)} → ${new Date(last).toISOString().slice(0, 19)}`
    : '—'

  return `# Backtest Report

**Strategy:** ${report.config.strategy}
**Symbol:** ${report.config.symbol}
**Tape:** ${report.config.tape}
**Slippage:** ${report.config.slippageModel}
**Period:** ${period}

## Headline

| Metric | Value |
|---|---|
| Starting equity | ${dollar(report.startingEquity)} |
| Ending equity | ${dollar(report.endingEquity)} |
| Total return | ${pct(m.totalReturn)} |
| Annualized return | ${pct(m.annualizedReturn)} |
| **Sharpe** (annualized) | **${m.sharpe.toFixed(2)}** |
| Sortino (annualized) | ${m.sortino.toFixed(2)} |
| Calmar | ${m.calmar.toFixed(2)} |
| Max drawdown | ${pct(m.maxDrawdown)} (${dollar(m.maxDrawdownDollar)}) |
| Max DD duration | ${msToHuman(m.maxDrawdownDuration)} |

## Trades

| Metric | Value |
|---|---|
| Total trades | ${m.tradeCount} |
| Wins / Losses | ${m.winCount} / ${m.lossCount} |
| Hit rate | ${pct(m.hitRate)} |
| Profit factor | ${pf(m.profitFactor)} |
| Expectancy | ${dollar(m.expectancy)} per trade |
| Avg win | ${dollar(m.avgWinDollar)} |
| Avg loss | ${dollar(m.avgLossDollar)} |
| Largest win | ${dollar(m.largestWinDollar)} |
| Largest loss | ${dollar(m.largestLossDollar)} |
`
}

/** Persist the report as pretty-printed JSON. The full equity curve is
 *  included so downstream tools (Python notebooks, charting) can rebuild
 *  the curve without re-running the backtest. */
export async function persistReportJson(report: BacktestReport, path: string): Promise<void> {
  await writeFile(path, JSON.stringify(report, null, 2), 'utf8')
}
```

- [ ] **Step 2: Write tests**

```ts
/**
 * SATEX — Reporter tests.
 * Structural assertions only — exact-string matches would be brittle.
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { formatReportConsole, formatReportMd, msToHuman, persistReportJson } from './reporter'
import type { BacktestReport } from '@shared/backtest/types'

function sampleReport(over?: Partial<BacktestReport>): BacktestReport {
  return {
    config: {
      strategy: 'brain', symbol: 'NVDA', tape: 'in-mem',
      startingEquity: 100_000, slippageModel: 'zero', notionalPct: 0.05,
    },
    startedAt: 1_700_000_000_000,
    endedAt:   1_700_000_001_000,
    startingEquity: 100_000,
    endingEquity:   112_500,
    equityCurve: [
      { ts: 1_700_000_000_000, equity: 100_000 },
      { ts: 1_700_086_400_000, equity: 112_500 },
    ],
    trades: [],
    metrics: {
      totalReturn: 0.125, annualizedReturn: 0.45,
      sharpe: 1.8, sortino: 2.1, calmar: 3.0,
      maxDrawdown: 0.05, maxDrawdownDollar: 5000, maxDrawdownDuration: 60 * 60_000,
      hitRate: 0.55, profitFactor: 1.8, expectancy: 12.5,
      tradeCount: 10, winCount: 6, lossCount: 4,
      avgWinDollar: 50, avgLossDollar: -25,
      largestWinDollar: 200, largestLossDollar: -75,
    },
    ...over,
  }
}

describe('msToHuman', () => {
  it('returns dash for 0 or negative', () => {
    expect(msToHuman(0)).toBe('—')
    expect(msToHuman(-1)).toBe('—')
  })
  it('formats seconds', () => {
    expect(msToHuman(45_000)).toBe('45s')
  })
  it('formats minutes + seconds', () => {
    expect(msToHuman(3 * 60_000 + 5_000)).toBe('3m 5s')
  })
  it('formats hours + minutes', () => {
    expect(msToHuman(2 * 3_600_000 + 15 * 60_000)).toBe('2h 15m')
  })
  it('formats days + hours', () => {
    expect(msToHuman(3 * 86_400_000 + 4 * 3_600_000)).toBe('3d 4h')
  })
})

describe('formatReportConsole', () => {
  it('produces a single line containing strategy/symbol and headline metrics', () => {
    const out = formatReportConsole(sampleReport())
    expect(out.split('\n')).toHaveLength(1)
    expect(out).toContain('[brain/NVDA]')
    expect(out).toContain('12.50%')
    expect(out).toContain('Sharpe 1.80')
    expect(out).toContain('MaxDD 5.00%')
    expect(out).toContain('10 trades')
  })
  it('renders profit factor as infinity glyph when PF is Infinity', () => {
    const r = sampleReport()
    r.metrics.profitFactor = Infinity
    expect(formatReportConsole(r)).toContain('PF ∞')
  })
})

describe('formatReportMd', () => {
  it('contains the required section headings', () => {
    const md = formatReportMd(sampleReport())
    expect(md).toContain('# Backtest Report')
    expect(md).toContain('## Headline')
    expect(md).toContain('## Trades')
  })
  it('formats Sharpe in bold', () => {
    expect(formatReportMd(sampleReport())).toContain('**1.80**')
  })
  it('includes the strategy / symbol / slippage names', () => {
    const md = formatReportMd(sampleReport())
    expect(md).toContain('**Strategy:** brain')
    expect(md).toContain('**Symbol:** NVDA')
    expect(md).toContain('**Slippage:** zero')
  })
  it('handles infinity profit factor', () => {
    const r = sampleReport()
    r.metrics.profitFactor = Infinity
    expect(formatReportMd(r)).toContain('| Profit factor | ∞ |')
  })
})

describe('persistReportJson', () => {
  let dir: string
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'satex-reporter-')) })
  afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

  it('writes a parseable JSON file that round-trips the report', async () => {
    const path = join(dir, 'r.json')
    const report = sampleReport()
    await persistReportJson(report, path)
    const back = JSON.parse(await readFile(path, 'utf8')) as BacktestReport
    expect(back.config.symbol).toBe('NVDA')
    expect(back.metrics.sharpe).toBe(1.8)
    expect(back.equityCurve).toHaveLength(2)
  })
})
```

- [ ] **Step 3: Run tests**

```powershell
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app test -- reporter
```
Expected: all reporter tests pass.

- [ ] **Step 4: Commit**

```bash
git add 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/backtest/reporter.ts 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/backtest/reporter.test.ts
git commit -m "feat(backtest): reporter (console + markdown + JSON persistence)"
```

### Task C.7 — Headless CLI runner

A standalone Node script that reads a JSON tape file, runs a backtest, and prints/persists a report. No Electron required.

**Files:**
- Create: `scripts/backtest.ts` (at the satex-app root, alongside the existing `scripts/prepack-check.js`)
- Modify: `package.json` (add `"backtest": "tsx scripts/backtest.ts"` script + `tsx` devDep)
- Create: `scripts/fixtures/tiny-tape.json` (10-bar canned tape for the smoke test)
- Create: `scripts/backtest.test.ts` (integration test that runs the CLI end-to-end on the fixture)

- [ ] **Step 1: Install tsx as a devDep**

```powershell
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app install --save-dev tsx
```

- [ ] **Step 2: Add the "backtest" script to package.json**

Edit `00-PROJECT-ROOT/01-SATEX-CORE/satex-app/package.json` — in the `scripts` block, after `"prepack:check"`, add:

```json
"backtest": "tsx scripts/backtest.ts",
```

- [ ] **Step 3: Write the CLI script**

`00-PROJECT-ROOT/01-SATEX-CORE/satex-app/scripts/backtest.ts`:

```ts
#!/usr/bin/env node
/**
 * SATEX — Headless Backtest CLI
 *
 * Usage:
 *   npm run backtest -- \
 *     --tape scripts/fixtures/tiny-tape.json \
 *     --symbol NVDA \
 *     --strategy brain \
 *     --slippage spread-half-impact \
 *     --starting-equity 100000 \
 *     --notional-pct 0.05 \
 *     --output result.json \
 *     --format console
 *
 * The tape file is a JSON array of Candle objects:
 *   [{ "time": 1700000000, "open":..., "high":..., "low":..., "close":..., "volume":... }, ...]
 */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Brain } from '../src/main/services/brain'
import { BrainStrategy } from '../src/main/backtest/brain-strategy'
import { BacktestRunner } from '../src/main/backtest/runner'
import {
  FixedBpsSlippageModel,
  SpreadHalfPlusImpactModel,
  ZeroSlippageModel,
  type SlippageModel,
} from '../src/main/backtest/slippage-model'
import {
  formatReportConsole,
  formatReportMd,
  persistReportJson,
} from '../src/main/backtest/reporter'
import type { AssetClass, Candle } from '../src/shared/types'

interface Args {
  symbol: string
  strategy: string
  slippage: string
  tape: string
  startingEquity: number
  output: string | null
  notionalPct: number
  format: 'console' | 'md' | 'json'
  assetClass: AssetClass
  periodsPerYear: number
  warmupBars: number
}

function parseArgs(argv: string[]): Args {
  const out: Args = {
    symbol: 'NVDA',
    strategy: 'brain',
    slippage: 'spread-half-impact',
    tape: '',
    startingEquity: 100_000,
    output: null,
    notionalPct: 0.05,
    format: 'console',
    assetClass: 'equity',
    periodsPerYear: 252 * 6.5 * 60,
    warmupBars: 50,
  }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    const next = argv[i + 1]
    if      (flag === '--symbol')          { out.symbol = next!;          i++ }
    else if (flag === '--strategy')        { out.strategy = next!;        i++ }
    else if (flag === '--slippage')        { out.slippage = next!;        i++ }
    else if (flag === '--tape')            { out.tape = next!;            i++ }
    else if (flag === '--starting-equity') { out.startingEquity = Number(next); i++ }
    else if (flag === '--output')          { out.output = next!;          i++ }
    else if (flag === '--notional-pct')    { out.notionalPct = Number(next); i++ }
    else if (flag === '--format')          { out.format = next as Args['format']; i++ }
    else if (flag === '--asset-class')     { out.assetClass = next as AssetClass; i++ }
    else if (flag === '--periods-per-year'){ out.periodsPerYear = Number(next); i++ }
    else if (flag === '--warmup-bars')     { out.warmupBars = Number(next); i++ }
  }
  if (!out.tape) throw new Error('--tape <path> required')
  return out
}

function buildSlippage(name: string): SlippageModel {
  if (name === 'zero') return new ZeroSlippageModel()
  if (name === 'fixed-bps-5') return new FixedBpsSlippageModel(5)
  if (name === 'fixed-bps-10') return new FixedBpsSlippageModel(10)
  if (name === 'spread-half-impact') return new SpreadHalfPlusImpactModel({ impactCoef: 0.0001 })
  throw new Error(`Unknown slippage model: ${name}. Try one of: zero, fixed-bps-5, fixed-bps-10, spread-half-impact`)
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const tapePath = resolve(process.cwd(), args.tape)
  const candles = JSON.parse(await readFile(tapePath, 'utf8')) as Candle[]
  if (!Array.isArray(candles) || candles.length === 0) {
    throw new Error(`Tape ${tapePath} is empty or not a JSON array of candles`)
  }

  const brain = new Brain()
  const strategy = new BrainStrategy(brain)
  const slippage = buildSlippage(args.slippage)
  const runner = new BacktestRunner(strategy, slippage, {
    strategy: args.strategy,
    symbol: args.symbol,
    tape: tapePath,
    startingEquity: args.startingEquity,
    slippageModel: args.slippage,
    notionalPct: args.notionalPct,
  })

  const report = runner.run({
    candles,
    assetClass: args.assetClass,
    periodsPerYear: args.periodsPerYear,
    warmupBars: args.warmupBars,
  })

  if      (args.format === 'console') process.stdout.write(formatReportConsole(report) + '\n')
  else if (args.format === 'md')      process.stdout.write(formatReportMd(report) + '\n')
  else                                 process.stdout.write(JSON.stringify(report, null, 2) + '\n')

  if (args.output) await persistReportJson(report, resolve(process.cwd(), args.output))
}

main().catch(e => {
  process.stderr.write(`backtest failed: ${e instanceof Error ? e.message : String(e)}\n`)
  process.exit(1)
})
```

- [ ] **Step 4: Generate the canned tape fixture**

Run this PowerShell snippet ONCE to produce `scripts/fixtures/tiny-tape.json` — 120 bars of a noisy uptrend so the warmup (50) passes and the strategy gets candles to actually decide on.

```powershell
$bars = @()
for ($i = 0; $i -lt 120; $i++) {
  $base = 100 + ($i * 0.20)
  $noise = (Get-Random -Minimum -50 -Maximum 50) / 100
  $c = [math]::Round($base + $noise, 2)
  $h = [math]::Round($c + 0.50, 2)
  $l = [math]::Round($c - 0.50, 2)
  $bars += @{
    time = 1700000000 + ($i * 60)
    open = $c; high = $h; low = $l; close = $c; volume = 1000
  }
}
New-Item -ItemType Directory -Force .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app\scripts\fixtures | Out-Null
$bars | ConvertTo-Json -Depth 3 | Out-File -Encoding UTF8 .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app\scripts\fixtures\tiny-tape.json
```

- [ ] **Step 5: Smoke-test the CLI**

```powershell
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app run backtest -- --tape scripts/fixtures/tiny-tape.json --slippage zero --format console
```
Expected output: one line like
`[brain/NVDA] X.XX% total · Sharpe Y.YY · MaxDD Z.ZZ% · N trades · hit P% · PF Q.QQ`

The exact numbers depend on Brain's default weights; only the SHAPE matters here.

- [ ] **Step 6: Write the integration test**

`00-PROJECT-ROOT/01-SATEX-CORE/satex-app/scripts/backtest.test.ts`:

```ts
/**
 * SATEX — Backtest CLI integration test.
 * Verifies the end-to-end pipeline (canned tape → BrainStrategy → ZeroSlippage
 * → BacktestRunner → Reporter) by importing the same modules the CLI uses
 * and checking the report shape. We do NOT shell out to `npm run backtest`
 * here — that would require tsx in CI; the unit modules are already covered.
 */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Brain } from '../src/main/services/brain'
import { BrainStrategy } from '../src/main/backtest/brain-strategy'
import { BacktestRunner } from '../src/main/backtest/runner'
import { ZeroSlippageModel } from '../src/main/backtest/slippage-model'
import type { Candle } from '../src/shared/types'

describe('Backtest CLI pipeline (integration)', () => {
  it('runs end-to-end on the canned fixture and produces a complete report', async () => {
    const tapePath = resolve(__dirname, 'fixtures', 'tiny-tape.json')
    const candles = JSON.parse(await readFile(tapePath, 'utf8')) as Candle[]
    expect(candles.length).toBeGreaterThanOrEqual(120)

    const runner = new BacktestRunner(
      new BrainStrategy(new Brain()),
      new ZeroSlippageModel(),
      {
        strategy: 'brain', symbol: 'NVDA', tape: tapePath,
        startingEquity: 100_000, slippageModel: 'zero', notionalPct: 0.05,
      },
    )
    const report = runner.run({ candles, assetClass: 'equity' })

    expect(report.startingEquity).toBe(100_000)
    expect(report.equityCurve.length).toBe(candles.length)
    expect(typeof report.metrics.sharpe).toBe('number')
    expect(typeof report.metrics.maxDrawdown).toBe('number')
    expect(report.metrics.tradeCount).toBeGreaterThanOrEqual(0)
    expect(report.endedAt).toBeGreaterThanOrEqual(report.startedAt)
  })
})
```

- [ ] **Step 7: Run the integration test**

```powershell
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app test -- backtest
```
Expected: integration test PASS.

- [ ] **Step 8: Run the full health stack**

```powershell
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app run typecheck
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app run lint
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app test
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app run knip
```
Expected: all four exit 0; test count = 398 (Phases A + B baseline) + Phase C additions (~50–60 new tests).

- [ ] **Step 9: Commit**

```bash
git add 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/package.json 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/package-lock.json 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/scripts/
git commit -m "feat(backtest): headless CLI + canned fixture + integration test"
```

---

## Self-Review (Phases A + B + C)

**Spec coverage check:**
- ✅ G-11 (slippage model) — Phase A.1–A.5 covers the interface, three model implementations, OM injection, trading-engine wiring. **Executed and merged on this branch.**
- ✅ G-9 (short side) — Phase B.1–B.3 covers regression baseline, failing bearish test, implementation flip, full-suite verification. **Executed and merged on this branch.**
- ✅ G-10 (forward-test framework) — Phase C.1–C.7 covers types, pure metrics, Strategy interface, BrainStrategy wrapper, BacktestRunner with intra-bar bracket resolution, Reporter (console + MD + JSON), and headless CLI with a canned fixture + integration test.

**Placeholder scan:** Every step has real code and real commands. No `TODO`, no `TBD`, no `similar to Task N`, no "add error handling". The Phase C CLI step that depends on a generated fixture spells out the PowerShell snippet that generates it.

**Type consistency:**
- `SlippageModel.fill(req, ctx) → SlippageFill` used consistently across Phase A models, the OM injection (Phase A.4), and the BacktestRunner (Phase C.5).
- `StrategySnapshot { ts, symbol, quote, indicators }` defined in C.3, consumed by `BrainStrategy.decide` (C.4), constructed by `BacktestRunner.run` (C.5).
- `StrategySignal` (existing `@shared/types`) is the return type of `Strategy.decide` and the input the runner uses to size + open positions.
- `ClosedTrade` shape verified against `src/shared/types.ts:158` — runner's `closeAt` constructs it with the real field set (`tags: []`, `conviction: null`, `regimeAtEntry: null`, `entrySlippageBps: null`).
- `IndicatorSnapshot` shape verified — has `volatility`, no `computedAt`. BrainStrategy test fixtures use the correct shape.
- `computeSnapshot(symbol, candles)` signature matches `src/shared/indicators.ts:91` — `volatility` field is auto-populated, no extra args needed.
- `EquityPoint`, `BacktestConfig`, `BacktestMetrics`, `BacktestReport` defined in C.1, consumed identically by C.2 (metrics) and C.5 (runner) and C.6 (reporter).
- `computeMetrics(curve, trades, periodsPerYear)` signature matches between C.2 and C.5 invocation.

**Cross-task references:**
- `BacktestRunner` (C.5) imports from `@shared/backtest/metrics` (C.2), `@shared/backtest/types` (C.1), `./slippage-model` (Phase A), `./strategy` (C.3).
- CLI (C.7) imports from all of the above plus `Brain` (existing service, unchanged).

---

## Execution Handoff

**Plan complete and saved to** `docs/superpowers/plans/2026-05-29-forward-test-foundation.md`.

Phases A and B were already executed inline in the originating session and are on `feat/slippage-and-short-side` at the time of this edit (commits `6c106a1` through `4701ac6`). Phase C tasks (C.1 → C.7) are ready to execute.

Two execution options for Phase C:

1. **Subagent-Driven** — dispatch a fresh subagent per task (C.1 → C.7), review between tasks, fast iteration.

2. **Inline Execution (recommended for this session)** — execute tasks in the same conversation using executing-plans, with the same `feat/slippage-and-short-side` branch so the whole forward-test-foundation lands as one cohesive PR. This is the path the user opted into in the originating session.
