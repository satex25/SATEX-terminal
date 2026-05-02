# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

**SATEX** — Smart Autonomous Trading EXperience. A production-grade Electron desktop application for real-time, algorithmic equity trading with institutional risk controls, adaptive AI learning, and historical backtesting. Windows-first, targets professional traders and quant developers.

**Project Root:** `C:\Users\User\mc4\00-PROJECT-ROOT\`

### Why This Matters

Retail trading tools cap at 150–200ms latency; SATEX targets <150ms. Bloomberg Terminal costs $25K/year; SATEX is free/open-source. No existing tool combines sub-second latency, single-screen density, autonomous trading intelligence, and hard risk guardrails in one application.

---

## Project Structure

```
00-PROJECT-ROOT/
├── 01-SATEX-CORE/
│   ├── satex-app/                     # Main Electron app (all source)
│   │   ├── src/
│   │   │   ├── main/                  # Electron main process
│   │   │   │   ├── services/          # MarketSimulator, OrderManager, AIBrain, etc.
│   │   │   │   ├── index.ts           # Main process entry, service wiring
│   │   │   │   └── ...
│   │   │   ├── preload/               # Preload script (IPC bridge)
│   │   │   ├── renderer/              # React app (18, TypeScript, Tailwind)
│   │   │   │   ├── components/        # Memoized React panels (20Hz refresh)
│   │   │   │   ├── stores/            # Zustand state management
│   │   │   │   ├── hooks/             # Custom IPC + data hooks
│   │   │   │   └── App.tsx
│   │   │   └── shared/                # Shared types, IPC channels, constants
│   │   ├── package.json
│   │   └── vite.config.ts
│   └── satex-vault/                   # Obsidian knowledge vault (reference)
├── 02-INTEGRATIONS/
│   ├── agents-framework/              # Polymarket AI agents (Python)
│   ├── polygon-data-mcp/              # Polygon.io + backtrader plotting
│   └── polymarket-cli/                # Rust CLOB CLI
└── README.md, .gitignore, etc.
```

### Key Files to Know

- **`src/main/index.ts`** — Main process lifecycle, service wiring, IPC handlers. Boots all services and wires quote/order/account events to renderer via IPC.
- **`src/main/services/order-manager.ts`** — Paper-trading engine with 7 hard risk invariants. Enforces position sizing, buying power, daily loss limits, kill switch.
- **`src/main/services/autonomous-trader.ts`** — 7-gate AI decision tree. Routes trade signals through confidence, volatility, position limits, risk/reward checks.
- **`src/main/services/ai-brain.ts`** — SQLite-backed learned-parameter cache. Persists win-rate, SL distance, volatility regimes across sessions.
- **`src/main/services/replay-runner.ts`** — Historical backtesting engine. Streams Alpaca bars, applies strategy logic, accumulates trade outcomes for AI learning.
- **`src/main/services/market-data.ts`** — GBM-based market simulator. 20Hz deterministic ticks, Brownian motion price paths, news events.
- **`src/main/services/live-market.ts`** — Alpaca WebSocket adapter. Real-time quote ingestion, quote dedup, fallback to simulator for unsupported symbols.
- **`src/main/services/alpaca-live-trading.ts`** — 5-gate live execution safety module. Requires user confirmation, account verification, risk acknowledgment.
- **`src/shared/ipc-channels.ts`** — IPC message contract. Defines all main↔renderer channels (quotes, orders, account, replay, calendar).
- **`src/shared/types.ts`** — TypeScript data contracts. Order, Position, Account, Quote, Candle, TradeSignal, DecisionResult, etc.
- **`src/shared/constants.ts`** — Risk limits, equity baseline, asset-class symbols, technical indicator periods.

---

## Development Commands

**Installation & Setup**
```bash
cd 01-SATEX-CORE/satex-app
npm install
```

**Development (Hot Reload)**
```bash
npm run dev
```
Launches Electron in dev mode with Vite hot-reload on renderer changes. Main process changes require restart.

**Type Checking**
```bash
npm run typecheck
```
Runs `tsc -b --noEmit` across main + renderer + shared. Must pass before any commit.

**Linting**
```bash
npm run lint
```
Runs ESLint on all `.ts` and `.tsx` files. Checks for unused imports, unreachable code, React hook violations.

**Formatting**
```bash
npm run format
```
Prettier on `.ts`, `.tsx`, `.css`. Use before final commit.

**Testing**
```bash
npm run test               # Run all tests once
npm run test:watch        # Watch mode for active development
npm run test:watch -- --grep="OrderManager"   # Single test file pattern
```

**Production Build (Windows)**
```bash
npm run pack:win
```
Runs `tsc -b`, `electron-vite build`, then `electron-builder --win --config electron-builder.yml`. Outputs `.exe` installer + portable.

**Preview Packaged Build**
```bash
npm start
```
Runs the last packaged build (no dev server).

---

## Architecture Patterns

### 1. Main Process ↔ Renderer IPC Contract

All communication flows through typed IPC channels in `src/shared/ipc-channels.ts`:
- **One-way events** (main → renderer): `QUOTES_TICK`, `ACCOUNT_UPDATE`, `ORDERS_UPDATE`, `CANDLES_UPDATE`, `REPLAY_STATUS`, etc.
- **Request-reply** (renderer → main, async): `ORDER_SUBMIT`, `KILL_SWITCH`, `REPLAY_START`, `GET_CANDLES`, `LIVE_TRADING_ENABLE`, etc.

**Pattern:**
```typescript
// Main process handler
ipcMain.handle(IPC.ORDER_SUBMIT, (_e, req: OrderRequest) => {
  return orders.submit(req);  // Returns Order immediately
});

// Renderer hook
const { invoke } = window.electron;
const order = await invoke(IPC.ORDER_SUBMIT, orderRequest);
```

**Critical Rule:** Any new IPC channel MUST be added to `src/shared/ipc-channels.ts` FIRST. Channels are load-bearing for type safety.

### 2. Service Architecture

Each service in `src/main/services/` follows a pattern:

```typescript
export class MyService {
  private listeners = new Set<(data: DataType) => void>();
  
  onData(fn: (data: DataType) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);  // Unsubscribe
  }
  
  private emit(data: DataType): void {
    for (const fn of this.listeners) fn(data);
  }
}
```

Services use **event emitters**, not callbacks or polling. Main process wires emitters to IPC send:

```typescript
orders.onOrders((os) => {
  send(IPC.ORDERS_UPDATE, os);
});
```

### 3. Tick Processing (20 Hz, ~50ms Per Tick)

- **MarketSimulator** or **LiveMarket** generate quotes every 50ms
- Quote handler updates OrderManager prices, triggers order fills
- OrderManager emits filled orders; main sends them to renderer
- Renderer updates positions/account panels via Zustand (with memoization)

**Latency Budget:**
- Tick ingestion: 5ms
- Price update + order fill check: 10ms
- IPC serialization + send: 5ms
- Renderer update: 20ms
- Total: ~40ms (well under 50ms budget)

### 4. Risk Invariants (Non-Negotiable)

**OrderManager enforces 7 hard limits:**

1. **Kill switch armed** → reject all new orders, cancel pending
2. **Buying power exceeded** → max 2× equity (paper margin)
3. **Position size > 25% equity** → cap per symbol
4. **Daily loss ≥ 2%** → no new entries (liquidations only)
5. **Triggered orders** (SL/TP) → always allowed (reduce exposure)
6. **Max 3 open positions** → prevents over-allocation
7. **Account verification** (for live trading) → manual activation required

These are enforced at the engine level, not the strategy level. **Strategies cannot bypass them.**

### 5. Autonomous Trading Gates (7 Decision Points)

**AutonomousTrader** evaluates trade signals through:

1. **Enabled flag** — must be true
2. **Confidence ≥ 0.6** — signal quality threshold
3. **Daily loss budget not exhausted** — daily 2% hard stop
4. **Open positions < 3** — capacity constraint
5. **Volatility-adjusted size > 0** — position sizing (ATR-based)
6. **SL/TP from LearnedStopLossEngine** — adaptive exits
7. **Risk/reward ratio ≥ 2.5:1** — win expectancy

If any gate fails, the trade is rejected with reason. AprilTacticsStrategy submits signals; AutonomousTrader decides.

### 6. Data Flow: Quotes → Orders → Positions → Account

```
MarketSimulator (20 Hz)
    ↓ [Quote tick]
OrderManager.markPrices()
    ↓ [Check fills on pending orders]
OrderManager.submit(OrderRequest)
    ↓ [Validate risk, fill paper, emit Order]
orders.onOrders() → IPC.ORDERS_UPDATE
    ↓ [Main sends to renderer]
Renderer Zustand store
    ↓ [Update positions, cash, equity]
Panel re-renders (memoized)
```

### 7. Replay Engine

**ReplayRunner** owns full lifecycle:
1. Fetch Alpaca bars for date range
2. Inject them into live flow (MarketSimulator + LiveMarket silenced)
3. Run strategy logic tick-by-tick
4. Accumulate trade outcomes
5. Train AIBrain on win-rate, SL distances, regime patterns
6. Pause/resume/speed control from UI

Replay is **learning-mode**: every closed trade refines the brain. Live trading is **production-mode**: brain is read-only.

---

## React Component Patterns

### Memoization (Critical for 20 Hz)

All panels that receive tick updates MUST be memoized:

```typescript
const QuotePanel = React.memo(({ symbol, quote }: Props) => {
  return <div>{quote.last.toFixed(2)}</div>;
});
```

Without memoization, parent re-renders cascade to all children on every tick. With memoization, only changed props trigger re-renders.

### Zustand Selectors (Prevent Over-Subscription)

```typescript
// Good: subscribe to only what you need
const equity = useStore((s) => s.account.equity);

// Bad: subscribes to entire store
const { account, positions, orders } = useStore();
```

Selectors create equality checks. If the value hasn't changed, the hook doesn't re-render.

### IPC Hooks

```typescript
const useAccount = () => {
  const [account, setAccount] = useState(initialAccount);
  useEffect(() => {
    const unsub = window.electron.on(IPC.ACCOUNT_UPDATE, setAccount);
    return unsub;
  }, []);
  return account;
};
```

---

## Symbol Universe

SATEX knows 18 symbols across 4 asset classes:

**Equities (NYSE):** AAPL, MSFT, GOOGL, AMZN, NVDA, TSLA, JPM, GS, BAC

**Cryptocurrencies (24/7):** BTC (BTCUSD), ETH (ETHUSD)

**Forex (24/5):** EURUSD, GBPUSD, USDJPY

**Futures (CME):** ES (E-mini S&P 500), NQ (E-mini Nasdaq), CL (Crude Oil)

Each symbol has an asset class that determines:
- Market hours (equity hours vs. 24/5 vs. 24/7)
- Tick size and lot size
- Financing rules (no margin on crypto; repo financing on equities)
- Available data sources (live: Alpaca for equities; sim for crypto/futures)

---

## Critical Rules

### Never Break These

1. **No Math.random in simulator** — use `mulberry32` from `src/main/services/rng.ts`. Ensures replay determinism.
   ```typescript
   const rng = mulberry32(0xdeadbeef);  // seeded
   const rand = rng();  // deterministic 0-1
   ```

2. **All IPC additions go in `src/shared/ipc-channels.ts` FIRST** — then add handlers in `src/main/index.ts`, then consumer hooks in renderer. Order matters for type safety.

3. **Risk invariants in OrderManager are load-bearing** — if you modify position sizing, daily loss, or buying power limits, you MUST add tests and manual verification. A bug here can cause unlimited losses in live trading.

4. **Indicator functions MUST be pure** — no side effects, no external I/O. Indicators are called on every tick; side effects cause cascading bugs.
   ```typescript
   // Good: pure
   export const vwap = (candles: Candle[]): number => { ... };
   
   // Bad: side effect
   export const vwap = (candles: Candle[]): number => {
     console.log('computing vwap');  // ← side effect
     ...
   };
   ```

5. **Memoize all React components that receive 20 Hz updates** — without React.memo, every tick parent will re-render children, tanking UI performance.

6. **Prefix all seeded RNG calls with a seed comment** — so future readers know why randomness is deterministic.
   ```typescript
   const idRand = mulberry32((Date.now() ^ 0x9e3779b9) >>> 0);
   ```

7. **Test risk invariants in isolation** — OrderManager tests should never depend on simulator or live data. Mock price provider.

---

## Testing Strategy

### Unit Tests (Vitest)

- **OrderManager:** Submit valid/invalid orders, check fills, verify risk rejections, test all 7 invariants
- **AutonomousTrader:** Test all 7 gates individually, mock AIBrain for confidence levels
- **LearnedStopLossEngine:** Hydrate with trades, compute SL/TP ranges, verify adaptive updates
- **Indicators:** VWAP, EMA, RSI, ATR with known candle inputs vs. expected outputs
- **RNG:** Seed reproducibility, distribution properties

### Integration Tests

- **Full replay session:** Load 50 bars, run strategy, verify orders match expectations, check AI brain updates
- **Live market + simulator:** Quote merge (live priority, sim fallback)
- **Account state consistency:** Orders fill → positions update → equity correct

### Manual Testing

- Run with `npm run dev`, submit manual trades, verify fills and P&L
- Enable autonomous trading, run for 1 hour, check for risk violations
- Replay a historical day, pause/resume, verify determinism

---

## Debugging & Troubleshooting

**Dev Tools:** `Ctrl+Shift+I` (or menu → View → Toggle Dev Tools)

**Main process console:** Check browser dev tools Console tab

**Quote mismatches:** Check MarketSimulator vs. LiveMarket vs. LiveCandleBuffer. If live is stale, live may be lagging; check Alpaca WebSocket status.

**Order not filling:** Verify price provider is returning a non-null value. Check OrderManager logs for validation rejection.

**Replay not starting:** Ensure Alpaca keys are in environment. Replay requires real Alpaca bars, not simulator. If keys are missing, replayRunner is null.

**Memory leaks:** Check Zustand subscriptions are unsubscribed. Check IPC listeners are removed. DevTools → Performance tab to profile heap growth.

---

## Environment Setup

Create a `.env` file in `satex-app/`:

```env
# Alpaca API keys (optional; defaults to simulator)
APCA_API_KEY_ID=<your_key>
APCA_API_SECRET_KEY=<your_secret>

# Alpaca live trading keys (optional; separate from data keys)
APCA_LIVE_API_KEY_ID=<your_live_key>
APCA_LIVE_API_SECRET_KEY=<your_live_secret>

# Enable autonomous trading
ENABLE_AUTONOMOUS_TRADING=1

# Polygon.io API key (optional; for alt data integration)
POLYGON_API_KEY=<your_key>
```

**Note:** In development, `.env` is optional. The app runs in simulator-only mode if keys are missing.

---

## Phase Status (as of 2026-05-01)

- **Phase 1 (Foundation)** ✅ — Electron + React + mock simulator
- **Phase 2 (Live Data)** ✅ — Alpaca WebSocket, real quotes, live candles
- **Phase 3 (Intelligence)** ✅ — Indicators, AIBrain, LearnedSL, ReplayRunner
- **Phase 4 (Execution)** ✅ — OrderManager gates, AutonomousTrader, AprilTacticsStrategy
- **Phase 5 (Packaging)** 🔲 — Production build, auto-updates, cross-platform (macOS/Linux TBD)
- **Target Release:** June 30, 2026

### Known Gaps (Phase 5)

1. **ForexFactory MCP server** — Currently expected on `localhost:8080` (Python). Needs proper wiring + error handling.
2. **Python agents bridge** — `agents-framework/` is a separate Python package. IPC layer to orchestrate signals not yet integrated.
3. **Polygon.io integration** — `polygon-data-mcp` exists but not wired into quote flow.
4. **Cross-platform packaging** — electron-builder config only covers Windows. macOS/Linux unsigned builds pending code-signing setup.

---

## Extending SATEX

### Adding a New Service

1. Create `src/main/services/my-service.ts`
2. Implement event emitter pattern (listeners, emit, on/off)
3. Add initialization to `src/main/index.ts` in `wireServices()`
4. If it needs to talk to renderer, add IPC channel to `src/shared/ipc-channels.ts`
5. Add IPC handler in `src/main/index.ts`
6. Create consumer hook in renderer if needed

### Adding a New Strategy

1. Create `src/main/services/strategies/my-strategy.ts`
2. Extend `BaseStrategy` (TBD if base class exists; otherwise use AprilTacticsStrategy as template)
3. Implement `start()`, `stop()`, and signal generation
4. Hook into `orders.submitFromSignal()` or `orders.evaluateSignal()` for autonomous routing
5. Add env flag to gate it (e.g., `ENABLE_MY_STRATEGY=1`)

### Adding an Indicator

1. Create `src/main/services/indicators/my-indicator.ts`
2. Make it pure: input candles, output single number
3. Export named function with clear signature:
   ```typescript
   export const myIndicator = (candles: Candle[], period: number): number => { ... };
   ```
4. Add unit tests in `src/main/services/__tests__/my-indicator.test.ts`
5. Use it in strategy via synchronous call (no async)

---

## Performance Targets

- **Quote ingestion latency:** <10ms (tick to OrderManager)
- **Order fill latency:** <20ms (fill to renderer)
- **Total UI latency:** <50ms (quote to visual update)
- **Replay throughput:** 10,000 bars/sec (historical data processing)
- **Memory footprint:** <500MB steady state (Electron + app data)
- **CPU:** <15% single core during idle, <50% during active trading

---

## References

- **TradingView Lightweight Charts:** https://tradingview.github.io/lightweight-charts/
- **Electron:** https://www.electronjs.org/docs
- **Zustand:** https://github.com/pmndrs/zustand
- **Alpaca API:** https://alpaca.markets/
- **electron-builder:** https://www.electron.build/

---

## Next Steps

1. Verify environment setup (npm install, .env)
2. Run `npm run dev` and test manual order submission
3. Enable autonomous trading: `ENABLE_AUTONOMOUS_TRADING=1 npm run dev`
4. Review Phase 5 gaps and prioritize next work
5. Run full test suite: `npm test`
6. Type check: `npm run typecheck`
