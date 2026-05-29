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

## Phase C TBD-section placeholder

> The Phase C tasks (C.1 metrics types, C.2 metrics implementation, C.3 strategy interface, C.4 BrainStrategy wrapper, C.5 BacktestRunner, C.6 Reporter, C.7 CLI script) are detailed in a follow-up edit to this file. They share the same TDD-with-code structure as Phases A and B. The execution flow does not require Phase C to land in a single commit — each sub-task ends with its own commit.

---

## Self-Review (Phase A + B)

**Spec coverage check:**
- ✅ G-11 (slippage model) — Phase A.1–A.5 covers the interface, three model implementations, OM injection, and trading-engine wiring
- ✅ G-9 (short side) — Phase B.1–B.3 covers regression baseline, failing bearish test, implementation flip, full-suite verification
- ⚠️ G-10 (forward-test framework) — Phase C tasks are stubbed; the framework itself is in the next plan edit. Marking this plan as **partial** until Phase C lands.

**Placeholder scan:** Phase A and B contain real code, real commands, real expected output. Phase C section is explicitly marked as TBD pending the next edit — that is a known gap, not a hidden one.

**Type consistency:** `SlippageModel.fill(req, ctx) → SlippageFill` used consistently across all three model implementations and the OrderManager injection. `getSlippageModel()` name matches between the new method and the test that exercises it. `Strategy`, `BacktestRunner`, `BacktestReport` types are declared in the file-structure map but not yet defined — those land with Phase C.

**Type fix already caught:** Phase A.4 test imports `FixedBpsSlippageModel` and `ZeroSlippageModel`; both exported from `slippage-model.ts` as classes (Tasks A.1 and A.2 confirm). Phase B's `OrderRequest`, `Quote`, `IndicatorSnapshot`, `Account`, `AiDecision` all come from `@shared/types` (verified against the audit-time read).

---

## Execution Handoff

**Plan partially complete and saved to** `docs/superpowers/plans/2026-05-29-forward-test-foundation.md` — **Phases A and B are fully specified and ready to execute; Phase C is stubbed.**

Two execution options for Phase A + B (Phase C plan will be appended before C is executed):

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task (A.1 → A.5, then B.1 → B.3), review between tasks, fast iteration.

2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

Or option 3: **append Phase C to the plan now** before any execution starts, so the whole bundle is on paper before code moves.
