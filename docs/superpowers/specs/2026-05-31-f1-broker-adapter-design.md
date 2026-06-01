# F.1 Design — BrokerAdapter Interface + AlpacaClient Refactor

**Status:** Approved (2026-05-31)
**Goal:** Define a broker-agnostic `BrokerSession` abstraction with three narrow facets (`OrderRouter` / `MarketDataSource` / `AccountSyncer`), refactor `AlpacaClient` to implement it, and land a stub `RithmicBrokerSession` so subsequent phases (F.2–F.5) fill it in without re-touching the interface.
**Out of scope:** Rithmic protocol wiring (F.2/F.3/F.4), engine-side broker selector (F.5), `LiveMarket` internals (preserved as-is, just wrapped).

---

## 1. Architecture

Three narrow interfaces, composed under a `BrokerSession` umbrella that owns lifecycle:

```
                        ┌───────────────────────────────┐
                        │       BrokerSession           │
                        │  connect() / disconnect()     │
                        │  state: SessionState          │
                        │  onStateChange(fn)            │
                        │  symbols: SymbolResolver      │
                        └──────┬──────┬──────┬──────────┘
                               │      │      │
                ┌──────────────┘      │      └──────────────┐
                ▼                     ▼                     ▼
        ┌───────────────┐     ┌───────────────┐     ┌───────────────┐
        │ OrderRouter   │     │ MarketData    │     │ AccountSyncer │
        │ submit/cancel │     │ Source        │     │ getSnapshot   │
        │ onUpdate(evt) │     │ (existing)    │     │ onUpdate(snap)│
        └───────────────┘     └───────────────┘     └───────────────┘
```

Trading-engine consumes via `this.session: BrokerSession`. The facets are exposed as stable references for the session's lifetime — engine code says `this.session.orders.submit(req)` and `this.session.data.getQuote(symbol)`.

**F.1 hard-codes Alpaca as the active session.** The user-facing broker selector (`alpaca` ↔ `rithmic` at runtime with a Settings toggle) is F.5 work. F.1's commit lands an Alpaca-only system that compiles and behaves identically to today, with the Rithmic stub class present but unreachable.

---

## 2. `BrokerSession` (lifecycle umbrella)

```ts
export type SessionState =
  | 'DISCONNECTED'  // not connected (initial state)
  | 'CONNECTING'    // first auth in flight
  | 'CONNECTED'     // ready to route orders / consume data
  | 'RECONNECTING'  // lost connection; auto-retry in progress
  | 'FAILED'        // gave up after retry exhaustion (manual reconnect needed)

export interface BrokerSession {
  /** Stable identifier — picked at construction. */
  readonly broker: 'alpaca' | 'rithmic'
  connect(): Promise<void>
  disconnect(): Promise<void>
  readonly state: SessionState
  /** Subscribe to state transitions. Returns unsubscribe handle. */
  onStateChange(fn: (s: SessionState) => void): () => void
  // Facets — references are stable for the lifetime of the session.
  readonly orders:  OrderRouter
  readonly data:    MarketDataSource
  readonly account: AccountSyncer
  /** Canonical ⇆ broker-native symbol resolver. */
  readonly symbols: SymbolResolver
}
```

**Semantics:**

- `connect()` is **idempotent** — calling it on a `CONNECTED` session is a no-op that resolves immediately. Calling it on `CONNECTING` returns the in-flight promise.
- `disconnect()` triggers `REJECT` events for any orders the broker hasn't acknowledged at the time of call. Already-acknowledged orders remain live broker-side; we just stop receiving updates.
- `state` is read-synchronously off the session; `onStateChange` is the async stream.
- A `FAILED` state requires explicit user action to retry — auto-reconnect gives up after a configurable retry budget (default: 5 attempts, exponential backoff capped at 60 s).

---

## 3. `OrderRouter`

```ts
export interface OrderRouter {
  /** clientOrderId is REQUIRED — engine generates UUIDs at submit-time so
   *  retries are idempotent. Broker round-trips the ID; engine correlates
   *  every subsequent OrderEvent to the originating request via this ID. */
  submit(req: OrderRequest & { clientOrderId: string }): Promise<OrderAck>
  cancel(brokerOrderId: string): Promise<void>
  onUpdate(fn: (event: OrderEvent) => void): () => void
}

export interface OrderAck {
  brokerOrderId: string
  clientOrderId: string
  acceptedAt:    number
}

export type OrderEvent =
  | { execType: 'ACK';          orderId: string; clientOrderId: string; timestamp: number }
  | { execType: 'PARTIAL_FILL'; orderId: string; clientOrderId: string; filled: number; price: number; timestamp: number }
  | { execType: 'FILL';         orderId: string; clientOrderId: string; filled: number; avgPrice: number; timestamp: number }
  | { execType: 'REJECT';       orderId: string; clientOrderId: string; reason: string; timestamp: number }
  | { execType: 'CANCEL';       orderId: string; clientOrderId: string; timestamp: number }
  | { execType: 'EXPIRE';       orderId: string; clientOrderId: string; timestamp: number }
```

**Semantics:**

- `submit()` returns the broker's `OrderAck` on success or **throws `BrokerError`** on ack-time failure (auth lost, validation failure, rate limit, etc.). Throws are reserved for failures BEFORE the broker has accepted the order.
- Anything that happens AFTER acceptance — fill, partial fill, cancel, reject (broker-side post-ack), expire — flows through `onUpdate`. The engine subscribes once at session boot and routes events to the existing `OrderManager.fillOrder` / `rejectOrder` / `cancelOrder` methods by `clientOrderId`.
- Discriminator field is `execType` (matches the FIX ExecType field name used by institutional execution systems). String values are the human-readable enum (`'ACK'` / `'PARTIAL_FILL'` / etc.) — the FIX wire-protocol numeric codes (0 / 1 / 2 / 4 / 8 / C) are documented in the mapping comment but NOT used as discriminator values, so call sites read as `if (e.execType === 'FILL')` rather than `if (e.execType === '2')`. Mapping: `ACK ↔ FIX 0 (New)` · `PARTIAL_FILL ↔ FIX 1` · `FILL ↔ FIX 2` · `CANCEL ↔ FIX 4` · `REJECT ↔ FIX 8` · `EXPIRE ↔ FIX C`.
- **`clientOrderId` contract.** REQUIRED on every `submit()`. The id MUST be opaque (not reverse-engineerable from order metadata), globally unique across the session lifetime, and never reused. UUIDv4 via `crypto.randomUUID()` is the default implementation; alternatives (UUIDv7 for DB-index locality, `nanoid()`, any 128-bit CSPRNG output) are acceptable provided the contract holds.
- Engine submits with a freshly-generated `clientOrderId` for every retry. The adapter's `submit()` SHOULD return the existing `OrderAck` if the broker already saw this ID (broker-side idempotency); MUST not double-submit. If the broker doesn't support client-side ID idempotency, the adapter MUST track in-flight client IDs locally and short-circuit duplicate submissions.
- **Rate limiting.** Broker-side rate-limit responses surface as `BrokerError({ code: 'RATE_LIMIT', retryable: true })` from `submit()`. The engine's existing circuit-breaker pattern handles backoff + retry; persistent rate-limit failures arm the kill switch. No interface-level concurrency counter on `BrokerSession` — position-count guardrails live in `OrderManager.validate` (Gate 4) where they already enforce against `MAX_OPEN_POSITIONS`. Adding a parallel counter on the session would duplicate that responsibility and create races on the read-modify-write path.

---

## 4. `MarketDataSource` (existing — preserved)

The interface that `MarketSimulator` / `LiveMarket` / `ReplaySource` already implement stays as-is. `AlpacaBrokerSession.data` returns the existing `LiveMarket` instance during live mode and `MarketSimulator` during paper. F.4 will add `RithmicMarketData` implementing the same interface.

**No interface change in F.1.** All existing data-feed tests stay green.

---

## 5. `AccountSyncer`

```ts
export interface AccountSyncer {
  /** Pull semantics for callers that need a definite-state read. */
  getSnapshot(): Promise<AccountSnapshot>
  /** Push semantics for live UI updates + risk-gate recomputation.
   *  Returns the unsubscribe handle. */
  onUpdate(fn: (snap: AccountSnapshot) => void): () => void
}

export interface AccountSnapshot {
  equity:        number
  cash:          number
  buyingPower:   number
  positions:     Position[]
  /** ts of the broker-side observation, NOT local arrival time. Used by
   *  staleness guards: if `observedAt` is too far behind `Date.now()`,
   *  RiskGatesService can flag the snapshot as stale and refuse to use
   *  it for daily-loss / MLL recomputation. */
  observedAt:    number
}
```

**Alpaca implementation:** existing 15-second REST polling continues to drive `onUpdate`. `getSnapshot()` performs a fresh REST fetch (bypassing the cache) so callers needing a definite-state read can force it.

**Rithmic implementation (F.2+):** account state is pushed via the gateway's account-update message. `onUpdate` fires as messages arrive. `getSnapshot()` returns the last-cached snapshot synchronously where possible; falls back to a poll if no snapshot is cached yet.

**Staleness contract:** `observedAt` must be the broker-reported timestamp, not local clock. If the broker doesn't supply one, the adapter uses local clock at message-arrival time. Consumers (e.g. `RiskGatesService.compute`) check `Date.now() - snap.observedAt` against a configurable threshold and degrade gracefully on stale data.

---

## 6. `SymbolResolver`

```ts
export interface SymbolResolver {
  /** Canonical → broker-native. 'ES' → 'ESM5' (futures front-month).
   *  Throws if the canonical symbol cannot be resolved to a tradeable
   *  contract (e.g. no front-month rollable, market closed for the entire
   *  contract chain). */
  toBrokerSymbol(canonical: string): string
  /** Broker-native → canonical. 'ESM5' → 'ES'. Throws on unrecognized
   *  symbol so the engine never silently records an unmappable position. */
  toCanonical(brokerSymbol: string): string
  /** True if `canonical` is tradeable on this broker right now. Cheap
   *  lookup; doesn't throw. */
  isSupported(canonical: string): boolean
}
```

**Alpaca implementation:** identity for equity (`AAPL` ↔ `AAPL`) + crypto pair normalization (`BTCUSD` ↔ `BTC/USD`). `isSupported` checks the UNIVERSE constant.

**Rithmic implementation (F.4):** owns the front-month roll calendar. The roll trigger uses the standard CME convention (8 calendar days before contract expiry for ES/NQ; varies by product). Roll calendar lives in `src/main/services/rithmic/symbol-resolver.ts` as a static lookup table.

**Canonical naming convention:** all-uppercase ticker for equities (`AAPL`), all-uppercase product code for futures (`ES`, `NQ`, `CL`, `GC`), product code for crypto with no separator (`BTC`, `ETH`). The trading engine and strategies always use canonical form.

---

## 7. Error model

```ts
export type BrokerErrorCode =
  | 'AUTH_FAILED'
  | 'CONNECTION_LOST'
  | 'RATE_LIMIT'
  | 'INVALID_ORDER'
  | 'INSUFFICIENT_FUNDS'
  | 'SYMBOL_NOT_SUPPORTED'
  | 'NOT_IMPLEMENTED'        // Rithmic stubs throw with this code
  | 'PROTOCOL_ERROR'         // unexpected wire-protocol response
  | 'TIMEOUT'

export class BrokerError extends Error {
  readonly broker:    'alpaca' | 'rithmic'
  readonly code:      BrokerErrorCode
  readonly retryable: boolean
  /** Original wire-protocol response when available (REST status + body,
   *  WS frame, R|API response code). */
  readonly raw?:      unknown

  constructor(opts: {
    broker: 'alpaca' | 'rithmic'
    code: BrokerErrorCode
    message: string
    retryable: boolean
    raw?: unknown
  }) {
    super(opts.message)
    this.broker = opts.broker
    this.code = opts.code
    this.retryable = opts.retryable
    this.raw = opts.raw
  }
}
```

**Conventions:**

- All thrown errors from broker interfaces are `BrokerError` (or subclasses) — never bare `Error`.
- Programmer errors (bad argument shape, null deref) stay as regular `Error` / `TypeError` etc. — they're bugs to fix, not broker conditions to handle.
- Engine can branch on `e instanceof BrokerError && e.retryable` for circuit-breaker patterns.
- `retryable=true` examples: `RATE_LIMIT`, `CONNECTION_LOST`, `TIMEOUT`. `retryable=false`: `AUTH_FAILED`, `INVALID_ORDER`, `INSUFFICIENT_FUNDS`, `SYMBOL_NOT_SUPPORTED`.

---

## 8. Alpaca refactor strategy

**In-place reorganization, not a parallel rewrite.** The existing 780-line `AlpacaClient` splits into focused files:

```
src/main/services/alpaca/
  index.ts                  # public surface: re-exports AlpacaBrokerSession + legacy AlpacaClient shim
  session.ts                # AlpacaBrokerSession class — composes the three facets, owns auth + WS
  order-router.ts           # AlpacaOrderRouter — REST submit/cancel + trade-update WS → onUpdate
  account-syncer.ts         # AlpacaAccountSyncer — 15s REST polling + onUpdate stream
  symbol-resolver.ts        # AlpacaSymbolResolver — equity identity + crypto pair normalization
  rest.ts                   # shared authenticated REST client (extracted from current AlpacaClient.rest)
  wire-protocol.ts          # AlpacaTick / AlpacaTradeUpdate types + parsers (extracted)
  ws-equity.ts              # equity WebSocket (extracted from current marketWs handler)
  ws-crypto.ts              # crypto WebSocket (extracted from current cryptoWs handler)
  ws-account.ts             # account-update WebSocket (extracted from current accountWs handler)
```

**Backward compatibility:**

- `src/main/services/alpaca.ts` becomes a 5-line re-export shim that pulls from `./alpaca/index.ts`. Every existing `import { AlpacaClient } from '../services/alpaca'` keeps working without edits.
- The `AlpacaClient` class itself survives as a thin wrapper that internally composes the new facets — its existing public methods (`submitOrder`, `cancelOrder`, `getAccount`, `getPositions`, `onTick`, `onTradeUpdate`) delegate to the appropriate facet. New code uses the `BrokerSession` interface; old code (engine, tests) keeps working until callers are migrated piece-by-piece in later phases.
- `LiveMarket` is NOT moved. It stays at `src/main/services/live-market.ts`. `AlpacaBrokerSession.data` returns the `LiveMarket` instance the engine already constructs.

**Trading-engine touch:** minimal. The engine gains a `private session: BrokerSession` field, constructed in `initialize()` alongside the existing Alpaca code. Existing call sites are NOT migrated in F.1 — they keep using `this.alpaca` / `this.market` / `this.om`. New code introduced in F.2–F.5 uses `this.session.*`. The migration of existing call sites is deferred to F.5 when the broker selector lands.

---

## 9. Rithmic stub

`src/main/services/rithmic/session.ts` lands in F.1 as a skeleton:

```ts
export class RithmicBrokerSession implements BrokerSession {
  readonly broker = 'rithmic' as const
  state: SessionState = 'DISCONNECTED'

  async connect(): Promise<void> {
    throw new BrokerError({ broker: 'rithmic', code: 'NOT_IMPLEMENTED',
      message: 'Rithmic connect — wired in F.2', retryable: false })
  }
  async disconnect(): Promise<void> { /* no-op */ }
  onStateChange(_fn: (s: SessionState) => void): () => void { return () => { /* no-op */ } }

  readonly orders:  OrderRouter      = new RithmicOrderRouterStub()
  readonly data:    MarketDataSource = new RithmicMarketDataStub()
  readonly account: AccountSyncer    = new RithmicAccountSyncerStub()
  readonly symbols: SymbolResolver   = new RithmicSymbolResolverStub()
}
```

Every method on every facet throws `BrokerError({ code: 'NOT_IMPLEMENTED' })`. The contract test suite (§ 10) exercises this — making sure the stub satisfies the interface shape and throws cleanly.

---

## 10. Testing

**New test files:**

| File | What it locks |
|---|---|
| `src/shared/types/broker-error.test.ts` | `BrokerError` class shape, code enum, retryable semantics |
| `src/main/services/alpaca/order-router.test.ts` | submit/cancel REST round-trip; onUpdate event ordering; clientOrderId idempotency |
| `src/main/services/alpaca/account-syncer.test.ts` | 15s polling; getSnapshot vs onUpdate paths; observedAt staleness handling |
| `src/main/services/alpaca/symbol-resolver.test.ts` | equity identity, crypto pair normalization, isSupported, throw-on-unknown |
| `src/main/services/alpaca/session.test.ts` | connect idempotency, disconnect rejects in-flight orders, state transitions |
| `src/main/services/rithmic/session.test.ts` | stub throws NOT_IMPLEMENTED everywhere, satisfies interface shape |
| `src/main/services/broker-session.contract.test.ts` | shared contract suite both adapters run against |

**Contract test pattern:** the `broker-session.contract.test.ts` file exports a `runBrokerSessionContract(makeSession: () => BrokerSession)` function. Both Alpaca and Rithmic call it with their session factory. Tests check:

- Interface shape (`session.broker`, `session.state`, all three facets present)
- `connect()` idempotency
- `state` transitions emit on `onStateChange`
- `symbols.toBrokerSymbol` round-trips through `toCanonical`
- `orders.submit` with a `clientOrderId` returns an `OrderAck` containing the same `clientOrderId`

**Idempotency test (Alpaca):** submit same `clientOrderId` twice in quick succession; verify second call returns the SAME `OrderAck` without a second REST round-trip (mock the REST layer to count calls).

**Order-event-ordering test (Alpaca):** mock the trade-update WS to emit `FILL` BEFORE `ACK`; verify the engine still routes the events to the correct `clientOrderId` via the engine's pending-orders map.

**Existing tests:** every test currently passing on master (673 tests at end of Tier-2) must remain green. The Alpaca refactor is non-breaking by construction (`AlpacaClient` shim re-exports the legacy class).

---

## 11. File structure summary

**New files:**

```
src/shared/types/broker-session.ts        # BrokerSession, SessionState, BrokerErrorCode types
src/shared/types/order-router.ts          # OrderRouter, OrderEvent, OrderAck types
src/shared/types/account-syncer.ts        # AccountSyncer, AccountSnapshot types
src/shared/types/symbol-resolver.ts       # SymbolResolver types
src/shared/types/broker-error.ts          # BrokerError class
src/shared/types/broker-error.test.ts

src/main/services/alpaca/
  index.ts
  session.ts
  order-router.ts        order-router.test.ts
  account-syncer.ts      account-syncer.test.ts
  symbol-resolver.ts     symbol-resolver.test.ts
  rest.ts
  wire-protocol.ts
  ws-equity.ts
  ws-crypto.ts
  ws-account.ts
  session.test.ts

src/main/services/rithmic/
  session.ts             session.test.ts
  order-router.stub.ts
  data.stub.ts
  account-syncer.stub.ts
  symbol-resolver.stub.ts

src/main/services/broker-session.contract.test.ts
```

**Modified files:**

| File | Change |
|---|---|
| `src/main/services/alpaca.ts` | becomes a 5-line re-export shim of `./alpaca/index.ts` |
| `src/main/core/trading-engine.ts` | adds `private session: BrokerSession`; existing call sites untouched |
| `src/shared/types.ts` | re-exports the new broker-session type module |

**Files NOT touched:**

- `src/main/services/live-market.ts` — wrapped by `AlpacaBrokerSession.data`, not refactored
- `src/main/services/market-data.ts` — `MarketSimulator` interface unchanged
- `src/main/services/order-manager.ts` — gets the migration in F.5, not F.1
- `src/main/services/risk-gates.ts` / `funded-account.ts` — broker-agnostic, unaffected
- `autonomous-trader.ts`, `brain.ts`, all strategies — broker-agnostic, unaffected
- The entire `src/renderer/` tree

---

## 12. Validation criteria

- All existing **673 tests** stay green
- typecheck / lint / knip stay **0 / 0 / 0**
- New `BrokerSession`-shaped tests cover the contract (>20 new tests across the new files)
- `npm run dev` boots and behaves identically to pre-refactor (manual smoke: `await window.satex.healthCheck()` returns OK; order submission still routes through Alpaca paper)
- The `AlpacaClient` symbol survives via re-export — no caller outside `src/main/services/alpaca/` breaks
- Contract test suite runs against both `AlpacaBrokerSession` and `RithmicBrokerSession`; both pass shape checks; Rithmic stubs throw `NOT_IMPLEMENTED` cleanly

---

## 13. Risks + mitigations

| Risk | Mitigation |
|---|---|
| `AlpacaClient` shim breaks an undocumented import path | Migration tooling: a one-line `grep -r "from.*alpaca"` before the PR shows every consumer; spot-check each |
| Order-event-ordering inversion (FILL before ACK) breaks `OrderManager.fillOrder` | Engine maintains a pending-orders map keyed by `clientOrderId`; events with no matching pending entry get buffered briefly (100 ms) before being dropped |
| `LiveMarket` references the old `AlpacaClient` shape | LiveMarket already imports specific types (`AlpacaTick`, `AlpacaTradeUpdate`) — those types are re-exported from `alpaca/wire-protocol.ts` so the import path stays valid |
| New file proliferation makes the alpaca refactor PR hard to review | Each new file is small (<150 lines target); PR description includes a tree-diff showing the split |
| Rithmic stub throws `NOT_IMPLEMENTED` somewhere code accidentally exercises it before F.2 lands | F.5 is the FIRST phase that wires the user-facing selector; until then the engine hard-codes Alpaca |

---

## 14. Validation against the saved memory `feedback_verify_pasted_specs`

Per that memory: broker-API specs from third parties are routinely confabulated; verify against the actual Rithmic / Tradovate API docs before designing the interface.

**This spec is interface-only.** It is shaped by the asymmetry between Alpaca's REST + thin-WS surface (already in code) and Rithmic's stateful-gateway surface (general knowledge from the R\|API SDK pattern). F.1 itself does NOT wire any Rithmic protocol calls — only stubs. F.2 (Rithmic credentials/connection scaffold) is the FIRST phase that actually exercises the Rithmic R\|API, and F.2's brainstorm MUST verify against the real Rithmic protocol docs before locking the auth flow. If F.2 surfaces a Rithmic constraint that the F.1 interface can't accommodate, the interface gets revised in F.2's PR — non-breaking change since no F.2-aware callers exist yet.
