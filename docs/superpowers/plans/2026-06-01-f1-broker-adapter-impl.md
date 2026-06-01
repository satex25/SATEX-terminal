# F.1 BrokerAdapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the F.1 BrokerAdapter abstraction defined in `docs/superpowers/specs/2026-05-31-f1-broker-adapter-design.md` — three narrow interfaces (`OrderRouter` / `MarketDataSource` / `AccountSyncer`) composed under a `BrokerSession` umbrella, with `AlpacaClient` refactored to implement it and `RithmicBrokerSession` landing as a `NOT_IMPLEMENTED` stub.

**Architecture:** Five stages on the critical path, one deferred polish stage. Stage A defines the shared types. Stage B composes Alpaca facets ON TOP of the existing `AlpacaClient` (via delegation — no internal refactor of the 780-line file). Stage C lands Rithmic stubs. Stage D runs both adapters through a shared contract test suite. Stage E wires `private session: BrokerSession` into `TradingEngine`. Stage F extracts `AlpacaClient` internals into focused files — deferred because the abstraction works without it, and the file split is a non-breaking refactor that can land in the same PR or as a follow-up.

**Tech Stack:** TypeScript strict · Vitest · existing `AlpacaClient` (preserved). No new runtime deps.

**Spec invariants this plan must preserve:**
- All 673 existing tests stay green
- typecheck / lint / knip remain 0 / 0 / 0
- `AlpacaClient` symbol survives via the existing `src/main/services/alpaca.ts` path
- Trading engine call sites NOT migrated in F.1 — that's F.5

---

## File Structure

**New directories:**

```
src/shared/broker/
  market-data-source.ts          # MarketDataSource interface (extracted from main/)
  broker-error.ts                # BrokerError + BrokerErrorCode
  order-router.ts                # OrderRouter, OrderEvent, OrderAck
  account-syncer.ts              # AccountSyncer, AccountSnapshot
  symbol-resolver.ts             # SymbolResolver
  broker-session.ts              # BrokerSession + SessionState
  broker-error.test.ts

src/main/services/alpaca/
  symbol-resolver.ts             # AlpacaSymbolResolver impl + tests
  symbol-resolver.test.ts
  account-syncer.ts              # AlpacaAccountSyncer impl + tests
  account-syncer.test.ts
  order-router.ts                # AlpacaOrderRouter impl + tests
  order-router.test.ts
  session.ts                     # AlpacaBrokerSession composes facets
  session.test.ts

src/main/services/rithmic/
  session.ts                     # RithmicBrokerSession (stub)
  session.test.ts                # Stub contract verification
```

**Modified files:**

| Path | Change |
|---|---|
| `src/main/services/market-data.ts` | `MarketDataSource` interface re-exported from `@shared/broker/market-data-source`; concrete classes (`MarketSimulator`) unchanged |
| `src/main/core/trading-engine.ts` | adds `private session: BrokerSession` field, constructed in `initialize()`; existing call sites untouched |
| `src/main/services/broker-session.contract.test.ts` (NEW) | shared contract suite runs against both Alpaca + Rithmic |

**Files NOT touched in critical-path stages (A–E):**
- `src/main/services/alpaca.ts` (the existing 780-line file) — stays as-is, used via delegation
- `src/main/services/live-market.ts` — wrapped by `AlpacaBrokerSession.data`
- `src/main/services/order-manager.ts` / `risk-gates.ts` / `funded-account.ts` — broker-agnostic, unaffected

---

## Stage A — Shared types (6 tasks)

### Task A.0 — Extract MarketDataSource interface to shared/

The existing `MarketDataSource` interface lives in `src/main/services/market-data.ts`. `BrokerSession.data` declared in `src/shared/broker/` cannot import from `main/` without creating a layer violation. Solution: extract the interface, leave concrete classes (`MarketSimulator`) in place.

**Files:**
- Create: `src/shared/broker/market-data-source.ts`
- Modify: `src/main/services/market-data.ts` — re-export from new location

- [ ] **Step 1: Read the current MarketDataSource interface definition**

```bash
grep -n "interface MarketDataSource" 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/services/market-data.ts
```
Expected: line number printed. Read those lines + 10 below.

- [ ] **Step 2: Create shared/broker/market-data-source.ts with the extracted interface**

`src/shared/broker/market-data-source.ts`:

```ts
/**
 * SATEX — MarketDataSource interface.
 *
 * Extracted from src/main/services/market-data.ts so BrokerSession.data
 * (declared in @shared/broker/broker-session) can reference the type
 * without crossing the main → shared layer boundary.
 *
 * Concrete implementations stay in main/: MarketSimulator, LiveMarket,
 * ReplaySource. F.1 task A.0.
 */
import type { Candle, Quote } from '@shared/types'

/** Unsubscribe handle returned by every `on*` subscription. */
export type Unsub = () => void

/** The data-feed contract shared by simulator, live-broker WS, and replay. */
export interface MarketDataSource {
  getQuote(symbol: string): Quote | undefined
  getAllQuotes(): Quote[]
  getCandles(symbol: string, limit?: number): Candle[]
  onQuotesTick(fn: (quotes: Quote[]) => void): Unsub
  onCandleUpdate(fn: (symbol: string, candle: Candle, isNew: boolean) => void): Unsub
}
```

(The exact shape — including `onQuotesTick` / `onCandleUpdate` — must match what `src/main/services/market-data.ts` currently declares. Read the existing file first; the snippet above is the expected shape. If the existing file has additional methods, add them verbatim.)

- [ ] **Step 3: Update main/services/market-data.ts to re-export the interface**

In `src/main/services/market-data.ts`, replace the original `export interface MarketDataSource { ... }` block with:

```ts
export type { MarketDataSource, Unsub } from '@shared/broker/market-data-source'
```

(The concrete `MarketSimulator` class and other runtime exports stay unchanged.)

- [ ] **Step 4: Verify typecheck is clean**

```bash
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app run typecheck
```
Expected: 0 errors. Every existing import of `MarketDataSource` continues to resolve via the re-export.

- [ ] **Step 5: Verify full test suite is green**

```bash
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app test
```
Expected: 673 / 673 passing (no behavior change).

- [ ] **Step 6: Commit**

```bash
git add 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/shared/broker/market-data-source.ts 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/services/market-data.ts
git commit -m "feat(broker): extract MarketDataSource interface to @shared/broker"
```

### Task A.1 — BrokerError class

The runtime class + the `BrokerErrorCode` union. Standalone, no broker dependencies.

**Files:**
- Create: `src/shared/broker/broker-error.ts`
- Create: `src/shared/broker/broker-error.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/shared/broker/broker-error.test.ts
import { describe, expect, it } from 'vitest'
import { BrokerError } from './broker-error'

describe('BrokerError', () => {
  it('is an Error subclass', () => {
    const e = new BrokerError({ broker: 'alpaca', code: 'AUTH_FAILED', message: 'bad key', retryable: false })
    expect(e).toBeInstanceOf(Error)
    expect(e).toBeInstanceOf(BrokerError)
  })

  it('carries broker / code / retryable as readonly fields', () => {
    const e = new BrokerError({ broker: 'rithmic', code: 'RATE_LIMIT', message: '429', retryable: true })
    expect(e.broker).toBe('rithmic')
    expect(e.code).toBe('RATE_LIMIT')
    expect(e.retryable).toBe(true)
    expect(e.message).toBe('429')
  })

  it('preserves the raw wire-protocol response when provided', () => {
    const raw = { status: 429, body: 'too many requests' }
    const e = new BrokerError({ broker: 'alpaca', code: 'RATE_LIMIT', message: '429', retryable: true, raw })
    expect(e.raw).toBe(raw)
  })

  it('raw is undefined when not provided', () => {
    const e = new BrokerError({ broker: 'alpaca', code: 'AUTH_FAILED', message: 'x', retryable: false })
    expect(e.raw).toBeUndefined()
  })

  it('sets name to "BrokerError" for instanceof + stack traces', () => {
    const e = new BrokerError({ broker: 'alpaca', code: 'TIMEOUT', message: 't', retryable: true })
    expect(e.name).toBe('BrokerError')
  })
})
```

- [ ] **Step 2: Run to confirm it fails**

```bash
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app test -- broker-error
```
Expected: FAIL with module-not-found on `./broker-error`.

- [ ] **Step 3: Write the implementation**

`src/shared/broker/broker-error.ts`:

```ts
/**
 * SATEX — BrokerError taxonomy.
 *
 * All thrown errors from broker interfaces (OrderRouter / AccountSyncer /
 * SymbolResolver / BrokerSession) are BrokerError (or subclasses).
 * Programmer errors (bad arg, null deref) stay as bare Error.
 *
 * F.1 task A.1.
 */
export type BrokerErrorCode =
  | 'AUTH_FAILED'
  | 'CONNECTION_LOST'
  | 'RATE_LIMIT'
  | 'INVALID_ORDER'
  | 'INSUFFICIENT_FUNDS'
  | 'SYMBOL_NOT_SUPPORTED'
  | 'NOT_IMPLEMENTED'   // Rithmic stubs throw with this code in F.1
  | 'PROTOCOL_ERROR'    // unexpected wire-protocol response shape
  | 'TIMEOUT'

export interface BrokerErrorOpts {
  broker: 'alpaca' | 'rithmic'
  code: BrokerErrorCode
  message: string
  retryable: boolean
  raw?: unknown
}

export class BrokerError extends Error {
  readonly broker:    'alpaca' | 'rithmic'
  readonly code:      BrokerErrorCode
  readonly retryable: boolean
  readonly raw?:      unknown

  constructor(opts: BrokerErrorOpts) {
    super(opts.message)
    this.name = 'BrokerError'
    this.broker = opts.broker
    this.code = opts.code
    this.retryable = opts.retryable
    if (opts.raw !== undefined) this.raw = opts.raw
  }
}
```

- [ ] **Step 4: Verify tests pass**

```bash
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app test -- broker-error
```
Expected: 5 / 5 PASS.

- [ ] **Step 5: Commit**

```bash
git add 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/shared/broker/broker-error.ts 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/shared/broker/broker-error.test.ts
git commit -m "feat(broker): BrokerError class + retryable taxonomy"
```

### Task A.2 — OrderRouter / OrderEvent / OrderAck types

Type-only file (no runtime). Contract definition.

**Files:**
- Create: `src/shared/broker/order-router.ts`

- [ ] **Step 1: Write the interface module**

```ts
/**
 * SATEX — OrderRouter contract.
 *
 * The execution-side facet of a BrokerSession. `submit` throws BrokerError
 * on ack-time failures; every post-acknowledgment event flows through
 * `onUpdate` as a typed OrderEvent.
 *
 * F.1 task A.2.
 */
import type { OrderRequest } from '@shared/types'
import type { Unsub } from './market-data-source'

export interface OrderAck {
  brokerOrderId: string
  clientOrderId: string
  acceptedAt:    number
}

/**
 * FIX ExecType mapping (documentation only — discriminator VALUES are
 * the human-readable enum below, not the FIX wire codes):
 *   ACK          ↔ FIX 0 (New)
 *   PARTIAL_FILL ↔ FIX 1
 *   FILL         ↔ FIX 2
 *   CANCEL       ↔ FIX 4
 *   REJECT       ↔ FIX 8
 *   EXPIRE       ↔ FIX C
 *
 * Field name is `execType` (FIX-standard) so institutional engineers
 * recognise it; values stay readable so TypeScript switch sites read
 * as `if (e.execType === 'FILL')` rather than `if (e.execType === '2')`.
 */
export type OrderEvent =
  | { execType: 'ACK';          orderId: string; clientOrderId: string; timestamp: number }
  | { execType: 'PARTIAL_FILL'; orderId: string; clientOrderId: string; filled: number; price: number; timestamp: number }
  | { execType: 'FILL';         orderId: string; clientOrderId: string; filled: number; avgPrice: number; timestamp: number }
  | { execType: 'REJECT';       orderId: string; clientOrderId: string; reason: string; timestamp: number }
  | { execType: 'CANCEL';       orderId: string; clientOrderId: string; timestamp: number }
  | { execType: 'EXPIRE';       orderId: string; clientOrderId: string; timestamp: number }

export interface OrderRouter {
  /**
   * Submits an order to the broker. `clientOrderId` is REQUIRED — must be
   * opaque (not reverse-engineerable from order metadata), globally unique
   * across the session lifetime, and never reused. UUIDv4 via
   * crypto.randomUUID() is the default; UUIDv7 / nanoid / any 128-bit
   * CSPRNG output is acceptable provided the contract holds.
   *
   * Throws BrokerError on ack-time failure (auth lost, validation, rate
   * limit). Anything post-ack flows through onUpdate.
   */
  submit(req: OrderRequest & { clientOrderId: string }): Promise<OrderAck>

  cancel(brokerOrderId: string): Promise<void>

  /** Subscribe to all post-ack order events. Returns the unsubscribe handle. */
  onUpdate(fn: (event: OrderEvent) => void): Unsub
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app run typecheck
```
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/shared/broker/order-router.ts
git commit -m "feat(broker): OrderRouter + OrderEvent + OrderAck types"
```

### Task A.3 — AccountSyncer / AccountSnapshot types

**Files:**
- Create: `src/shared/broker/account-syncer.ts`

- [ ] **Step 1: Write the interface module**

```ts
/**
 * SATEX — AccountSyncer contract.
 *
 * Push + pull access to broker-side account state (equity, cash, buying
 * power, positions). Alpaca polls REST every 15s; Rithmic pushes via
 * gateway account-update messages.
 *
 * F.1 task A.3.
 */
import type { Position } from '@shared/types'
import type { Unsub } from './market-data-source'

export interface AccountSnapshot {
  equity:      number
  cash:        number
  buyingPower: number
  positions:   Position[]
  /**
   * Broker-side observation timestamp (NOT local arrival time). Consumers
   * (RiskGatesService, OrderManager) check Date.now() - observedAt against
   * a staleness threshold and refuse to recompute on stale data.
   *
   * If the broker doesn't supply a server timestamp, the adapter uses local
   * clock at message-arrival time.
   */
  observedAt:  number
}

export interface AccountSyncer {
  /** Pull semantics — fetches a fresh snapshot, bypassing any cache. */
  getSnapshot(): Promise<AccountSnapshot>
  /** Push semantics — fires on every broker-reported account state change. */
  onUpdate(fn: (snap: AccountSnapshot) => void): Unsub
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app run typecheck
```
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/shared/broker/account-syncer.ts
git commit -m "feat(broker): AccountSyncer + AccountSnapshot types"
```

### Task A.4 — SymbolResolver interface

**Files:**
- Create: `src/shared/broker/symbol-resolver.ts`

- [ ] **Step 1: Write the interface module**

```ts
/**
 * SATEX — SymbolResolver contract.
 *
 * Canonical SATEX symbol ⇆ broker-native string. Equities are identity
 * (AAPL ↔ AAPL); futures need front-month roll resolution (ES ↔ ESM5);
 * crypto needs pair normalization (BTC ↔ BTC/USD).
 *
 * Canonical naming convention:
 *   - Equity: all-uppercase ticker ('AAPL')
 *   - Future: all-uppercase product code ('ES', 'NQ', 'CL', 'GC')
 *   - Crypto: product code, no separator ('BTC', 'ETH')
 *
 * F.1 task A.4.
 */
export interface SymbolResolver {
  /**
   * Canonical → broker-native. 'ES' → 'ESM5'. Throws BrokerError
   * (SYMBOL_NOT_SUPPORTED) if no front-month is rollable for the
   * canonical symbol on this broker.
   */
  toBrokerSymbol(canonical: string): string

  /**
   * Broker-native → canonical. 'ESM5' → 'ES'. Throws BrokerError
   * (SYMBOL_NOT_SUPPORTED) on unrecognized broker symbol — engine never
   * silently records an unmappable position.
   */
  toCanonical(brokerSymbol: string): string

  /** True if `canonical` is tradeable on this broker right now. Cheap lookup. */
  isSupported(canonical: string): boolean
}
```

- [ ] **Step 2: Verify typecheck + commit**

```bash
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app run typecheck
git add 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/shared/broker/symbol-resolver.ts
git commit -m "feat(broker): SymbolResolver interface"
```

### Task A.5 — BrokerSession umbrella

**Files:**
- Create: `src/shared/broker/broker-session.ts`

- [ ] **Step 1: Write the umbrella interface**

```ts
/**
 * SATEX — BrokerSession umbrella.
 *
 * Composes OrderRouter + MarketDataSource + AccountSyncer + SymbolResolver
 * under a single lifecycle owner. The engine consumes via
 * `this.session: BrokerSession`; broker-specific code is encapsulated
 * inside the implementation.
 *
 * F.1 task A.5.
 */
import type { OrderRouter } from './order-router'
import type { AccountSyncer } from './account-syncer'
import type { SymbolResolver } from './symbol-resolver'
import type { MarketDataSource, Unsub } from './market-data-source'

export type SessionState =
  | 'DISCONNECTED'  // not connected (initial state)
  | 'CONNECTING'    // first auth in flight
  | 'CONNECTED'     // ready to route orders + consume data
  | 'RECONNECTING'  // lost connection; auto-retry in progress
  | 'FAILED'        // gave up after retry exhaustion (manual reconnect needed)

export interface BrokerSession {
  /** Stable identifier — picked at construction time. */
  readonly broker: 'alpaca' | 'rithmic'

  /**
   * Idempotent connect. Calling on a CONNECTED session is a no-op that
   * resolves immediately. Calling on CONNECTING returns the in-flight
   * promise. Throws BrokerError(AUTH_FAILED | CONNECTION_LOST | TIMEOUT)
   * on unrecoverable failure.
   */
  connect(): Promise<void>

  /**
   * Triggers REJECT events for any orders the broker hasn't acknowledged
   * at the time of call. Already-acknowledged orders remain live broker-side.
   */
  disconnect(): Promise<void>

  /** Read-synchronous current state. */
  readonly state: SessionState

  /** Subscribe to state transitions. */
  onStateChange(fn: (s: SessionState) => void): Unsub

  // ── Facets — stable references for the session's lifetime ────────────
  readonly orders:  OrderRouter
  readonly data:    MarketDataSource
  readonly account: AccountSyncer
  readonly symbols: SymbolResolver
}
```

- [ ] **Step 2: Verify typecheck + commit**

```bash
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app run typecheck
git add 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/shared/broker/broker-session.ts
git commit -m "feat(broker): BrokerSession umbrella interface + SessionState"
```

---

## Stage B — Alpaca facets via delegation (4 tasks)

Each facet is a NEW file in `src/main/services/alpaca/` that composes the existing 780-line `AlpacaClient` via internal delegation. AlpacaClient itself stays at `src/main/services/alpaca.ts` unchanged. Stage F (deferred) splits AlpacaClient into focused files — Stage B works whether or not Stage F lands.

### Task B.1 — AlpacaSymbolResolver

Equity is identity; crypto pairs normalize (`BTCUSD` ⇆ `BTC/USD`). No `AlpacaClient` dependency — pure functions.

**Files:**
- Create: `src/main/services/alpaca/symbol-resolver.ts`
- Create: `src/main/services/alpaca/symbol-resolver.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/main/services/alpaca/symbol-resolver.test.ts
import { describe, expect, it } from 'vitest'
import { AlpacaSymbolResolver } from './symbol-resolver'
import { BrokerError } from '@shared/broker/broker-error'

describe('AlpacaSymbolResolver', () => {
  const r = new AlpacaSymbolResolver()

  it('returns identity for equity tickers', () => {
    expect(r.toBrokerSymbol('AAPL')).toBe('AAPL')
    expect(r.toBrokerSymbol('SPY')).toBe('SPY')
    expect(r.toCanonical('AAPL')).toBe('AAPL')
  })

  it('normalizes crypto canonical → broker (BTC → BTC/USD)', () => {
    expect(r.toBrokerSymbol('BTC')).toBe('BTC/USD')
    expect(r.toBrokerSymbol('ETH')).toBe('ETH/USD')
  })

  it('normalizes crypto broker → canonical (BTC/USD → BTC)', () => {
    expect(r.toCanonical('BTC/USD')).toBe('BTC')
    expect(r.toCanonical('ETH/USD')).toBe('ETH')
  })

  it('isSupported true for equity tickers in the UNIVERSE', () => {
    expect(r.isSupported('AAPL')).toBe(true)
    expect(r.isSupported('NVDA')).toBe(true)
  })

  it('isSupported true for crypto canonicals (BTC, ETH)', () => {
    expect(r.isSupported('BTC')).toBe(true)
    expect(r.isSupported('ETH')).toBe(true)
  })

  it('isSupported false for unknown tickers', () => {
    expect(r.isSupported('FAKETICKER')).toBe(false)
  })

  it('toBrokerSymbol throws SYMBOL_NOT_SUPPORTED for unknown canonical', () => {
    expect(() => r.toBrokerSymbol('FAKETICKER')).toThrow(BrokerError)
    try { r.toBrokerSymbol('FAKETICKER') }
    catch (e) {
      expect((e as BrokerError).code).toBe('SYMBOL_NOT_SUPPORTED')
      expect((e as BrokerError).broker).toBe('alpaca')
    }
  })

  it('toCanonical throws SYMBOL_NOT_SUPPORTED for unknown broker symbol', () => {
    expect(() => r.toCanonical('NONSENSE-PAIR')).toThrow(BrokerError)
  })
})
```

- [ ] **Step 2: Run to confirm fail**

```bash
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app test -- "alpaca/symbol-resolver"
```
Expected: FAIL with module-not-found.

- [ ] **Step 3: Write the implementation**

`src/main/services/alpaca/symbol-resolver.ts`:

```ts
/**
 * SATEX — AlpacaSymbolResolver.
 *
 * Equity tickers are identity (AAPL ↔ AAPL). Crypto canonicals normalize
 * to Alpaca's pair format (BTC ↔ BTC/USD). Unknown symbols throw
 * BrokerError(SYMBOL_NOT_SUPPORTED) so the engine never silently records
 * an unmappable position.
 *
 * F.1 task B.1.
 */
import type { SymbolResolver } from '@shared/broker/symbol-resolver'
import { BrokerError } from '@shared/broker/broker-error'
import { UNIVERSE, findUniverseEntry } from '@shared/constants'

/** Crypto canonical → Alpaca pair format. */
const CRYPTO_TO_PAIR: Record<string, string> = {
  BTC: 'BTC/USD',
  ETH: 'ETH/USD',
}
/** Reverse lookup, generated once. */
const PAIR_TO_CRYPTO: Record<string, string> = Object.fromEntries(
  Object.entries(CRYPTO_TO_PAIR).map(([k, v]) => [v, k])
)

export class AlpacaSymbolResolver implements SymbolResolver {
  toBrokerSymbol(canonical: string): string {
    // Crypto path
    if (canonical in CRYPTO_TO_PAIR) return CRYPTO_TO_PAIR[canonical]!
    // Equity / index path — identity if known to the UNIVERSE
    const entry = findUniverseEntry(canonical)
    if (entry) return canonical
    throw new BrokerError({
      broker: 'alpaca', code: 'SYMBOL_NOT_SUPPORTED',
      message: `Unknown canonical symbol: ${canonical}`, retryable: false,
    })
  }

  toCanonical(brokerSymbol: string): string {
    // Crypto path
    if (brokerSymbol in PAIR_TO_CRYPTO) return PAIR_TO_CRYPTO[brokerSymbol]!
    // Equity / index path — identity if known to the UNIVERSE
    const entry = findUniverseEntry(brokerSymbol)
    if (entry) return brokerSymbol
    throw new BrokerError({
      broker: 'alpaca', code: 'SYMBOL_NOT_SUPPORTED',
      message: `Unknown broker symbol: ${brokerSymbol}`, retryable: false,
    })
  }

  isSupported(canonical: string): boolean {
    if (canonical in CRYPTO_TO_PAIR) return true
    return findUniverseEntry(canonical) !== undefined
  }
}
```

(Note: `UNIVERSE` and `findUniverseEntry` are existing exports from `@shared/constants`. If `findUniverseEntry`'s signature differs at implementation time, use whichever symbol-lookup helper exists in the codebase. UNIVERSE-based lookup is the established pattern in current Alpaca-related code.)

- [ ] **Step 4: Run to confirm pass**

```bash
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app test -- "alpaca/symbol-resolver"
```
Expected: 8 / 8 PASS.

- [ ] **Step 5: Commit**

```bash
git add 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/services/alpaca/symbol-resolver.ts 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/services/alpaca/symbol-resolver.test.ts
git commit -m "feat(broker): AlpacaSymbolResolver — equity identity + crypto pair normalization"
```

### Task B.2 — AlpacaAccountSyncer

Delegates to the existing `AlpacaClient.getAccount()` + `getPositions()` for `getSnapshot`, and to the existing account-update WS handler for `onUpdate`. The class accepts an `AlpacaClient` instance via constructor; doesn't import it lazily.

**Files:**
- Create: `src/main/services/alpaca/account-syncer.ts`
- Create: `src/main/services/alpaca/account-syncer.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/main/services/alpaca/account-syncer.test.ts
import { describe, expect, it } from 'vitest'
import { AlpacaAccountSyncer } from './account-syncer'
import type { AccountSnapshot } from '@shared/broker/account-syncer'

function fakeClient(over?: Partial<{
  account: { equity: number; cash: number; buyingPower: number }
  positions: unknown[]
}>) {
  const account = over?.account ?? { equity: 100_000, cash: 50_000, buyingPower: 200_000 }
  const positions = over?.positions ?? []
  let listener: ((snap: { account: typeof account; positions: typeof positions }) => void) | null = null
  return {
    getAccount: async () => account,
    getPositions: async () => positions,
    onAccountUpdate: (fn: (snap: { account: typeof account; positions: typeof positions }) => void) => {
      listener = fn
      return () => { listener = null }
    },
    /** test hook to push an account-update event */
    pushUpdate: (snap: { account: typeof account; positions: typeof positions }) => {
      if (listener) listener(snap)
    },
  }
}

describe('AlpacaAccountSyncer', () => {
  it('getSnapshot pulls fresh REST data on every call', async () => {
    const client = fakeClient()
    const syncer = new AlpacaAccountSyncer(client as never)
    const snap = await syncer.getSnapshot()
    expect(snap.equity).toBe(100_000)
    expect(snap.cash).toBe(50_000)
    expect(snap.buyingPower).toBe(200_000)
    expect(snap.positions).toEqual([])
    expect(typeof snap.observedAt).toBe('number')
  })

  it('onUpdate fires when the account-update WS delivers an event', async () => {
    const client = fakeClient()
    const syncer = new AlpacaAccountSyncer(client as never)
    const observed: AccountSnapshot[] = []
    syncer.onUpdate(s => observed.push(s))
    client.pushUpdate({
      account: { equity: 110_000, cash: 60_000, buyingPower: 220_000 },
      positions: [],
    })
    expect(observed).toHaveLength(1)
    expect(observed[0]!.equity).toBe(110_000)
  })

  it('unsubscribe handle stops onUpdate', () => {
    const client = fakeClient()
    const syncer = new AlpacaAccountSyncer(client as never)
    const observed: AccountSnapshot[] = []
    const unsub = syncer.onUpdate(s => observed.push(s))
    unsub()
    client.pushUpdate({
      account: { equity: 99_000, cash: 0, buyingPower: 0 },
      positions: [],
    })
    expect(observed).toHaveLength(0)
  })

  it('observedAt uses Date.now() as fallback when broker omits server timestamp', async () => {
    const client = fakeClient()
    const syncer = new AlpacaAccountSyncer(client as never)
    const before = Date.now()
    const snap = await syncer.getSnapshot()
    const after = Date.now()
    expect(snap.observedAt).toBeGreaterThanOrEqual(before)
    expect(snap.observedAt).toBeLessThanOrEqual(after)
  })
})
```

- [ ] **Step 2: Implement**

`src/main/services/alpaca/account-syncer.ts`:

```ts
/**
 * SATEX — AlpacaAccountSyncer.
 *
 * Delegates to AlpacaClient.getAccount() + getPositions() for pull
 * snapshots, and to the account-update WS subscription for push events.
 * The existing 15s REST polling stays inside AlpacaClient — this facet
 * just adapts the shape.
 *
 * F.1 task B.2.
 */
import type { AccountSyncer, AccountSnapshot } from '@shared/broker/account-syncer'
import type { Unsub } from '@shared/broker/market-data-source'
import type { Position } from '@shared/types'

interface AlpacaClientShape {
  getAccount(): Promise<{ equity: number; cash: number; buyingPower: number }>
  getPositions(): Promise<Position[]>
  onAccountUpdate(fn: (snap: { account: { equity: number; cash: number; buyingPower: number }; positions: Position[] }) => void): Unsub
}

export class AlpacaAccountSyncer implements AccountSyncer {
  constructor(private readonly client: AlpacaClientShape) {}

  async getSnapshot(): Promise<AccountSnapshot> {
    const [account, positions] = await Promise.all([
      this.client.getAccount(),
      this.client.getPositions(),
    ])
    return {
      equity:      account.equity,
      cash:        account.cash,
      buyingPower: account.buyingPower,
      positions,
      observedAt:  Date.now(),
    }
  }

  onUpdate(fn: (snap: AccountSnapshot) => void): Unsub {
    return this.client.onAccountUpdate((raw) => {
      fn({
        equity:      raw.account.equity,
        cash:        raw.account.cash,
        buyingPower: raw.account.buyingPower,
        positions:   raw.positions,
        observedAt:  Date.now(),
      })
    })
  }
}
```

**Important:** the `AlpacaClientShape` declared above is the MINIMUM surface this facet needs. If the existing `AlpacaClient` doesn't have an `onAccountUpdate` method by that name, locate the equivalent (likely `onTradeUpdate` or an internal account-WS listener) and adapt the structural type accordingly. Read `src/main/services/alpaca.ts` for the actual surface BEFORE finalizing this file.

- [ ] **Step 3: Run + commit**

```bash
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app test -- "alpaca/account-syncer"
git add 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/services/alpaca/account-syncer.ts 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/services/alpaca/account-syncer.test.ts
git commit -m "feat(broker): AlpacaAccountSyncer — REST pull + WS push via AlpacaClient delegation"
```
Expected: 4 / 4 PASS.

### Task B.3 — AlpacaOrderRouter

The execution facet. Delegates `submit` to `AlpacaClient.submitOrder` (with `clientOrderId` round-tripped via Alpaca's `client_order_id` field), `cancel` to `AlpacaClient.cancelOrder`. Subscribes to the existing trade-update WS and translates Alpaca's event shape to the unified `OrderEvent` discriminator.

**Files:**
- Create: `src/main/services/alpaca/order-router.ts`
- Create: `src/main/services/alpaca/order-router.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/main/services/alpaca/order-router.test.ts
import { describe, expect, it } from 'vitest'
import { AlpacaOrderRouter } from './order-router'
import type { OrderEvent } from '@shared/broker/order-router'
import type { OrderRequest } from '@shared/types'
import { BrokerError } from '@shared/broker/broker-error'

interface FakeOrderResult {
  id: string
  status: string
  filledAvgPrice?: number | null
  clientOrderId?: string
}

function fakeClient() {
  const submitted: Array<OrderRequest & { clientOrderId: string }> = []
  let nextResult: FakeOrderResult | Error = { id: 'broker-abc', status: 'accepted' }
  let tradeUpdateListener: ((u: { event: string; orderId: string; clientOrderId: string; filled?: number; price?: number; avgPrice?: number; reason?: string }) => void) | null = null
  return {
    submitted,
    setNextResult: (r: FakeOrderResult | Error) => { nextResult = r },
    submitOrder: async (req: OrderRequest & { clientOrderId: string }) => {
      submitted.push(req)
      if (nextResult instanceof Error) throw nextResult
      return nextResult
    },
    cancelOrder: async (_id: string) => { /* no-op */ },
    onTradeUpdate: (fn: NonNullable<typeof tradeUpdateListener>) => {
      tradeUpdateListener = fn
      return () => { tradeUpdateListener = null }
    },
    pushTradeUpdate: (u: Parameters<NonNullable<typeof tradeUpdateListener>>[0]) => {
      if (tradeUpdateListener) tradeUpdateListener(u)
    },
  }
}

function buyReq(clientOrderId = 'client-1'): OrderRequest & { clientOrderId: string } {
  return { symbol: 'AAPL', side: 'buy', type: 'market', quantity: 1, clientOrderId }
}

describe('AlpacaOrderRouter', () => {
  it('submit returns OrderAck on broker success', async () => {
    const c = fakeClient()
    const r = new AlpacaOrderRouter(c as never)
    const ack = await r.submit(buyReq('client-1'))
    expect(ack.brokerOrderId).toBe('broker-abc')
    expect(ack.clientOrderId).toBe('client-1')
    expect(typeof ack.acceptedAt).toBe('number')
  })

  it('submit passes clientOrderId through to the broker', async () => {
    const c = fakeClient()
    const r = new AlpacaOrderRouter(c as never)
    await r.submit(buyReq('client-xyz'))
    expect(c.submitted[0]!.clientOrderId).toBe('client-xyz')
  })

  it('submit throws BrokerError on broker rejection', async () => {
    const c = fakeClient()
    c.setNextResult(new Error('Insufficient buying power'))
    const r = new AlpacaOrderRouter(c as never)
    await expect(r.submit(buyReq())).rejects.toThrow(BrokerError)
  })

  it('duplicate clientOrderId returns the same OrderAck without re-submitting', async () => {
    const c = fakeClient()
    const r = new AlpacaOrderRouter(c as never)
    const ack1 = await r.submit(buyReq('client-dup'))
    const ack2 = await r.submit(buyReq('client-dup'))
    expect(c.submitted).toHaveLength(1)              // no double-submit
    expect(ack2.brokerOrderId).toBe(ack1.brokerOrderId)
  })

  it('onUpdate translates Alpaca fill events to OrderEvent FILL', () => {
    const c = fakeClient()
    const r = new AlpacaOrderRouter(c as never)
    const events: OrderEvent[] = []
    r.onUpdate(e => events.push(e))
    c.pushTradeUpdate({
      event: 'fill', orderId: 'broker-abc', clientOrderId: 'client-1',
      filled: 1, avgPrice: 150.25,
    })
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      execType: 'FILL', orderId: 'broker-abc', clientOrderId: 'client-1',
      filled: 1, avgPrice: 150.25,
    })
  })

  it('onUpdate translates Alpaca partial_fill, canceled, rejected, expired', () => {
    const c = fakeClient()
    const r = new AlpacaOrderRouter(c as never)
    const events: OrderEvent[] = []
    r.onUpdate(e => events.push(e))
    c.pushTradeUpdate({ event: 'partial_fill', orderId: 'b', clientOrderId: 'c', filled: 1, price: 150 })
    c.pushTradeUpdate({ event: 'canceled',     orderId: 'b', clientOrderId: 'c' })
    c.pushTradeUpdate({ event: 'rejected',     orderId: 'b', clientOrderId: 'c', reason: 'bad symbol' })
    c.pushTradeUpdate({ event: 'expired',      orderId: 'b', clientOrderId: 'c' })
    expect(events.map(e => e.execType)).toEqual(['PARTIAL_FILL', 'CANCEL', 'REJECT', 'EXPIRE'])
  })

  it('cancel delegates to AlpacaClient.cancelOrder', async () => {
    const c = fakeClient()
    let cancelArg: string | null = null
    ;(c as { cancelOrder: (id: string) => Promise<void> }).cancelOrder = async (id) => { cancelArg = id }
    const r = new AlpacaOrderRouter(c as never)
    await r.cancel('broker-abc')
    expect(cancelArg).toBe('broker-abc')
  })
})
```

- [ ] **Step 2: Implement**

`src/main/services/alpaca/order-router.ts`:

```ts
/**
 * SATEX — AlpacaOrderRouter.
 *
 * Delegates submit/cancel to AlpacaClient, translates Alpaca's trade-update
 * WS events to the unified OrderEvent stream. Idempotent on clientOrderId:
 * a duplicate submit returns the cached OrderAck without a second REST
 * round-trip (Alpaca doesn't natively dedupe on client_order_id; we track
 * in-flight client IDs locally).
 *
 * F.1 task B.3.
 */
import type { OrderRouter, OrderEvent, OrderAck } from '@shared/broker/order-router'
import type { Unsub } from '@shared/broker/market-data-source'
import type { OrderRequest } from '@shared/types'
import { BrokerError } from '@shared/broker/broker-error'

interface AlpacaSubmitResult {
  id: string
  status: string
  filledAvgPrice?: number | null
  clientOrderId?: string
}

interface AlpacaTradeUpdate {
  event: string
  orderId: string
  clientOrderId: string
  filled?: number
  price?: number
  avgPrice?: number
  reason?: string
}

interface AlpacaClientShape {
  submitOrder(req: OrderRequest & { clientOrderId: string }): Promise<AlpacaSubmitResult>
  cancelOrder(brokerOrderId: string): Promise<void>
  onTradeUpdate(fn: (u: AlpacaTradeUpdate) => void): Unsub
}

export class AlpacaOrderRouter implements OrderRouter {
  /** In-flight clientOrderId → cached OrderAck for idempotent re-submits. */
  private readonly inFlight = new Map<string, OrderAck>()

  constructor(private readonly client: AlpacaClientShape) {}

  async submit(req: OrderRequest & { clientOrderId: string }): Promise<OrderAck> {
    const cached = this.inFlight.get(req.clientOrderId)
    if (cached) return cached  // idempotent retry — no second REST call

    let result: AlpacaSubmitResult
    try { result = await this.client.submitOrder(req) }
    catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      throw new BrokerError({
        broker: 'alpaca', code: 'INVALID_ORDER',
        message: `Alpaca rejected submission: ${msg}`,
        retryable: false, raw: e,
      })
    }
    const ack: OrderAck = {
      brokerOrderId: result.id,
      clientOrderId: req.clientOrderId,
      acceptedAt:    Date.now(),
    }
    this.inFlight.set(req.clientOrderId, ack)
    return ack
  }

  async cancel(brokerOrderId: string): Promise<void> {
    try { await this.client.cancelOrder(brokerOrderId) }
    catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      throw new BrokerError({
        broker: 'alpaca', code: 'PROTOCOL_ERROR',
        message: `Alpaca cancel failed: ${msg}`,
        retryable: true, raw: e,
      })
    }
  }

  onUpdate(fn: (event: OrderEvent) => void): Unsub {
    return this.client.onTradeUpdate((u) => {
      const evt = translate(u)
      if (evt) fn(evt)
      // Terminal states clear the in-flight cache so the clientOrderId
      // can't accidentally short-circuit a future intentional re-submit
      // (which would have a fresh clientOrderId anyway, but defensive).
      if (evt && (evt.execType === 'FILL' || evt.execType === 'CANCEL' ||
                  evt.execType === 'REJECT' || evt.execType === 'EXPIRE')) {
        this.inFlight.delete(evt.clientOrderId)
      }
    })
  }
}

function translate(u: AlpacaTradeUpdate): OrderEvent | null {
  const base = { orderId: u.orderId, clientOrderId: u.clientOrderId, timestamp: Date.now() }
  switch (u.event) {
    case 'new':
    case 'accepted':
      return { execType: 'ACK', ...base }
    case 'fill':
      return { execType: 'FILL', ...base, filled: u.filled ?? 0, avgPrice: u.avgPrice ?? u.price ?? 0 }
    case 'partial_fill':
      return { execType: 'PARTIAL_FILL', ...base, filled: u.filled ?? 0, price: u.price ?? 0 }
    case 'canceled':
      return { execType: 'CANCEL', ...base }
    case 'rejected':
      return { execType: 'REJECT', ...base, reason: u.reason ?? 'broker rejected' }
    case 'expired':
      return { execType: 'EXPIRE', ...base }
    default:
      // Unknown Alpaca event type — drop silently. Production logs would
      // capture this, but the OrderEvent contract is strict.
      return null
  }
}
```

**Important:** the `AlpacaClientShape.onTradeUpdate` signature here is structurally what the test expects. If the actual `AlpacaClient.onTradeUpdate` in `src/main/services/alpaca.ts` has a different payload shape, adapt the `translate()` function to read whatever field names are actually emitted. Read the existing `AlpacaTradeUpdate` type from `alpaca.ts` BEFORE finalizing this file.

- [ ] **Step 3: Run + commit**

```bash
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app test -- "alpaca/order-router"
git add 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/services/alpaca/order-router.ts 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/services/alpaca/order-router.test.ts
git commit -m "feat(broker): AlpacaOrderRouter — submit/cancel + OrderEvent translation"
```
Expected: 7 / 7 PASS.

### Task B.4 — AlpacaBrokerSession (composes facets)

The umbrella. Owns the `AlpacaClient` instance and exposes the three facets + symbol resolver + lifecycle.

**Files:**
- Create: `src/main/services/alpaca/session.ts`
- Create: `src/main/services/alpaca/session.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/main/services/alpaca/session.test.ts
import { describe, expect, it } from 'vitest'
import { AlpacaBrokerSession } from './session'
import type { SessionState } from '@shared/broker/broker-session'

function fakeClient() {
  let connected = false
  return {
    connect: async () => { connected = true },
    disconnect: async () => { connected = false },
    isConnected: () => connected,
    submitOrder: async () => ({ id: 'b1', status: 'accepted' }),
    cancelOrder: async () => { /* no-op */ },
    getAccount:  async () => ({ equity: 100_000, cash: 50_000, buyingPower: 200_000 }),
    getPositions: async () => [],
    onTradeUpdate:   () => () => { /* unsub */ },
    onAccountUpdate: () => () => { /* unsub */ },
  }
}

function fakeMarketData() {
  return {
    getQuote: () => undefined,
    getAllQuotes: () => [],
    getCandles: () => [],
    onQuotesTick:   () => () => { /* unsub */ },
    onCandleUpdate: () => () => { /* unsub */ },
  }
}

describe('AlpacaBrokerSession', () => {
  it('reports broker = "alpaca"', () => {
    const s = new AlpacaBrokerSession(fakeClient() as never, fakeMarketData() as never)
    expect(s.broker).toBe('alpaca')
  })

  it('initial state is DISCONNECTED', () => {
    const s = new AlpacaBrokerSession(fakeClient() as never, fakeMarketData() as never)
    expect(s.state).toBe('DISCONNECTED')
  })

  it('connect transitions through CONNECTING → CONNECTED', async () => {
    const s = new AlpacaBrokerSession(fakeClient() as never, fakeMarketData() as never)
    const observed: SessionState[] = []
    s.onStateChange(st => observed.push(st))
    await s.connect()
    expect(observed).toEqual(['CONNECTING', 'CONNECTED'])
    expect(s.state).toBe('CONNECTED')
  })

  it('connect is idempotent — calling on CONNECTED is a no-op', async () => {
    const s = new AlpacaBrokerSession(fakeClient() as never, fakeMarketData() as never)
    await s.connect()
    const observed: SessionState[] = []
    s.onStateChange(st => observed.push(st))
    await s.connect()
    expect(observed).toEqual([])
  })

  it('disconnect transitions to DISCONNECTED', async () => {
    const s = new AlpacaBrokerSession(fakeClient() as never, fakeMarketData() as never)
    await s.connect()
    await s.disconnect()
    expect(s.state).toBe('DISCONNECTED')
  })

  it('exposes stable facet references', () => {
    const s = new AlpacaBrokerSession(fakeClient() as never, fakeMarketData() as never)
    const ordersRef = s.orders
    const dataRef = s.data
    const accountRef = s.account
    const symbolsRef = s.symbols
    expect(s.orders).toBe(ordersRef)
    expect(s.data).toBe(dataRef)
    expect(s.account).toBe(accountRef)
    expect(s.symbols).toBe(symbolsRef)
  })

  it('onStateChange unsub stops further notifications', async () => {
    const s = new AlpacaBrokerSession(fakeClient() as never, fakeMarketData() as never)
    const observed: SessionState[] = []
    const unsub = s.onStateChange(st => observed.push(st))
    unsub()
    await s.connect()
    expect(observed).toEqual([])
  })
})
```

- [ ] **Step 2: Implement**

`src/main/services/alpaca/session.ts`:

```ts
/**
 * SATEX — AlpacaBrokerSession.
 *
 * Composes AlpacaOrderRouter + AlpacaAccountSyncer + AlpacaSymbolResolver
 * + the existing MarketDataSource (LiveMarket / MarketSimulator) into a
 * single BrokerSession. Owns the AlpacaClient connection lifecycle.
 *
 * F.1 task B.4.
 */
import type { BrokerSession, SessionState } from '@shared/broker/broker-session'
import type { OrderRouter } from '@shared/broker/order-router'
import type { AccountSyncer } from '@shared/broker/account-syncer'
import type { SymbolResolver } from '@shared/broker/symbol-resolver'
import type { MarketDataSource, Unsub } from '@shared/broker/market-data-source'
import { AlpacaOrderRouter } from './order-router'
import { AlpacaAccountSyncer } from './account-syncer'
import { AlpacaSymbolResolver } from './symbol-resolver'

interface AlpacaClientShape {
  connect?: () => Promise<void>
  disconnect?: () => Promise<void>
  isConnected?: () => boolean
  submitOrder: AlpacaOrderRouter extends never ? never : Parameters<AlpacaOrderRouter['submit']>[0] extends never ? never : unknown
  cancelOrder: (id: string) => Promise<void>
  getAccount: () => Promise<{ equity: number; cash: number; buyingPower: number }>
  getPositions: () => Promise<unknown[]>
  onTradeUpdate:   (fn: unknown) => Unsub
  onAccountUpdate: (fn: unknown) => Unsub
}

export class AlpacaBrokerSession implements BrokerSession {
  readonly broker = 'alpaca' as const
  private _state: SessionState = 'DISCONNECTED'
  private readonly listeners = new Set<(s: SessionState) => void>()

  readonly orders:  OrderRouter
  readonly data:    MarketDataSource
  readonly account: AccountSyncer
  readonly symbols: SymbolResolver

  constructor(
    private readonly client: AlpacaClientShape,
    marketData: MarketDataSource,
  ) {
    this.orders  = new AlpacaOrderRouter(client as never)
    this.account = new AlpacaAccountSyncer(client as never)
    this.symbols = new AlpacaSymbolResolver()
    this.data    = marketData
  }

  get state(): SessionState { return this._state }

  async connect(): Promise<void> {
    if (this._state === 'CONNECTED') return
    if (this._state === 'CONNECTING') return  // in-flight; caller awaits whichever started it
    this.setState('CONNECTING')
    try {
      if (this.client.connect) await this.client.connect()
      this.setState('CONNECTED')
    } catch (e) {
      this.setState('FAILED')
      throw e
    }
  }

  async disconnect(): Promise<void> {
    if (this._state === 'DISCONNECTED') return
    if (this.client.disconnect) await this.client.disconnect()
    this.setState('DISCONNECTED')
  }

  onStateChange(fn: (s: SessionState) => void): Unsub {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  private setState(s: SessionState): void {
    this._state = s
    for (const fn of this.listeners) {
      try { fn(s) } catch { /* swallow listener errors */ }
    }
  }
}
```

(The `AlpacaClientShape` declared here is intentionally loose because the existing `AlpacaClient` may not have explicit `connect()` / `disconnect()` methods today — those are optional in the shape. Read the existing `AlpacaClient` surface and tighten the shape during implementation. If connect/disconnect don't exist, the `setState` calls still fire correctly.)

- [ ] **Step 3: Run + commit**

```bash
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app test -- "alpaca/session"
git add 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/services/alpaca/session.ts 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/services/alpaca/session.test.ts
git commit -m "feat(broker): AlpacaBrokerSession composes facets + owns lifecycle"
```
Expected: 7 / 7 PASS.

---

## Stage C — Rithmic stubs (1 task)

### Task C.1 — `RithmicBrokerSession` + facet stubs

All five files in one commit. Every method throws `BrokerError({ code: 'NOT_IMPLEMENTED' })`. Lets the contract test suite (Stage D) exercise the interface shape and confirms F.2/F.3/F.4 don't need to re-touch the interface to fill in the bodies.

**Files:**
- Create: `src/main/services/rithmic/session.ts`
- Create: `src/main/services/rithmic/session.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/main/services/rithmic/session.test.ts
import { describe, expect, it } from 'vitest'
import { RithmicBrokerSession } from './session'
import { BrokerError } from '@shared/broker/broker-error'

describe('RithmicBrokerSession (stub)', () => {
  const s = new RithmicBrokerSession()

  it('reports broker = "rithmic"', () => {
    expect(s.broker).toBe('rithmic')
  })

  it('initial state is DISCONNECTED', () => {
    expect(s.state).toBe('DISCONNECTED')
  })

  it('connect throws NOT_IMPLEMENTED', async () => {
    await expect(s.connect()).rejects.toThrow(BrokerError)
    try { await s.connect() }
    catch (e) {
      expect((e as BrokerError).code).toBe('NOT_IMPLEMENTED')
      expect((e as BrokerError).broker).toBe('rithmic')
    }
  })

  it('disconnect is a safe no-op (no throw)', async () => {
    await expect(s.disconnect()).resolves.toBeUndefined()
  })

  it('onStateChange returns a usable unsub handle', () => {
    const unsub = s.onStateChange(() => { /* noop */ })
    expect(typeof unsub).toBe('function')
    expect(() => unsub()).not.toThrow()
  })

  it('orders.submit throws NOT_IMPLEMENTED', async () => {
    await expect(
      s.orders.submit({ symbol: 'ES', side: 'buy', type: 'market', quantity: 1, clientOrderId: 'x' })
    ).rejects.toThrow(BrokerError)
  })

  it('orders.cancel throws NOT_IMPLEMENTED', async () => {
    await expect(s.orders.cancel('x')).rejects.toThrow(BrokerError)
  })

  it('account.getSnapshot throws NOT_IMPLEMENTED', async () => {
    await expect(s.account.getSnapshot()).rejects.toThrow(BrokerError)
  })

  it('data.getQuote returns undefined (matches MarketDataSource contract)', () => {
    expect(s.data.getQuote('ES')).toBeUndefined()
  })

  it('symbols.toBrokerSymbol throws NOT_IMPLEMENTED', () => {
    expect(() => s.symbols.toBrokerSymbol('ES')).toThrow(BrokerError)
  })

  it('symbols.isSupported returns false (stub has no universe)', () => {
    expect(s.symbols.isSupported('ES')).toBe(false)
  })
})
```

- [ ] **Step 2: Implement (all five facets in one file for now — F.2+ may split)**

`src/main/services/rithmic/session.ts`:

```ts
/**
 * SATEX — RithmicBrokerSession stub.
 *
 * Lands in F.1 so the contract test suite has a second implementation to
 * exercise. Every method throws BrokerError(NOT_IMPLEMENTED) until F.2
 * (credentials + connection scaffold), F.3 (order execution), and F.4
 * (market data) fill in the bodies. The interface shape locked here
 * MUST be sufficient for those later phases — if a later phase surfaces
 * a Rithmic constraint that doesn't fit, the interface is revised in
 * that phase's PR (non-breaking since no production callers depend on
 * Rithmic until F.5).
 *
 * F.1 task C.1.
 */
import type { BrokerSession, SessionState } from '@shared/broker/broker-session'
import type { OrderRouter, OrderEvent, OrderAck } from '@shared/broker/order-router'
import type { AccountSyncer, AccountSnapshot } from '@shared/broker/account-syncer'
import type { SymbolResolver } from '@shared/broker/symbol-resolver'
import type { MarketDataSource, Unsub } from '@shared/broker/market-data-source'
import type { Candle, OrderRequest, Quote } from '@shared/types'
import { BrokerError } from '@shared/broker/broker-error'

function notImplemented(message: string): never {
  throw new BrokerError({
    broker: 'rithmic', code: 'NOT_IMPLEMENTED',
    message, retryable: false,
  })
}

class RithmicOrderRouterStub implements OrderRouter {
  async submit(_req: OrderRequest & { clientOrderId: string }): Promise<OrderAck> {
    return notImplemented('Rithmic order submit — wired in F.3')
  }
  async cancel(_brokerOrderId: string): Promise<void> {
    return notImplemented('Rithmic order cancel — wired in F.3')
  }
  onUpdate(_fn: (e: OrderEvent) => void): Unsub {
    return () => { /* no-op subscription */ }
  }
}

class RithmicAccountSyncerStub implements AccountSyncer {
  async getSnapshot(): Promise<AccountSnapshot> {
    return notImplemented('Rithmic account getSnapshot — wired in F.2')
  }
  onUpdate(_fn: (snap: AccountSnapshot) => void): Unsub {
    return () => { /* no-op subscription */ }
  }
}

class RithmicMarketDataStub implements MarketDataSource {
  getQuote(_symbol: string): Quote | undefined { return undefined }
  getAllQuotes(): Quote[] { return [] }
  getCandles(_symbol: string, _limit?: number): Candle[] { return [] }
  onQuotesTick(_fn: (quotes: Quote[]) => void): Unsub {
    return () => { /* no-op */ }
  }
  onCandleUpdate(_fn: (symbol: string, candle: Candle, isNew: boolean) => void): Unsub {
    return () => { /* no-op */ }
  }
}

class RithmicSymbolResolverStub implements SymbolResolver {
  toBrokerSymbol(_canonical: string): string {
    return notImplemented('Rithmic symbol resolver — wired in F.4')
  }
  toCanonical(_brokerSymbol: string): string {
    return notImplemented('Rithmic symbol resolver — wired in F.4')
  }
  isSupported(_canonical: string): boolean { return false }
}

export class RithmicBrokerSession implements BrokerSession {
  readonly broker = 'rithmic' as const
  state: SessionState = 'DISCONNECTED'

  async connect(): Promise<void> {
    return notImplemented('Rithmic connect — wired in F.2')
  }
  async disconnect(): Promise<void> { /* safe no-op */ }
  onStateChange(_fn: (s: SessionState) => void): Unsub {
    return () => { /* no-op subscription */ }
  }

  readonly orders:  OrderRouter      = new RithmicOrderRouterStub()
  readonly account: AccountSyncer    = new RithmicAccountSyncerStub()
  readonly data:    MarketDataSource = new RithmicMarketDataStub()
  readonly symbols: SymbolResolver   = new RithmicSymbolResolverStub()
}
```

- [ ] **Step 3: Run + commit**

```bash
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app test -- rithmic
git add 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/services/rithmic/
git commit -m "feat(broker): RithmicBrokerSession stub — interface shape + NOT_IMPLEMENTED"
```
Expected: 11 / 11 PASS.

---

## Stage D — Shared contract tests (1 task)

### Task D.1 — `broker-session.contract.test.ts`

Shared test suite both adapters run against. Verifies the abstraction holds — if either adapter drifts from the contract, this test fails.

**Files:**
- Create: `src/main/services/broker-session.contract.test.ts`

- [ ] **Step 1: Write the contract suite**

```ts
/**
 * SATEX — BrokerSession contract.
 *
 * Shared test suite that both AlpacaBrokerSession (real) and
 * RithmicBrokerSession (stub) MUST pass. If either drifts from the
 * abstraction, this file catches it.
 *
 * Alpaca runs against fake transport stubs (not the real Alpaca API).
 * Rithmic runs against its own NOT_IMPLEMENTED stub.
 *
 * F.1 task D.1.
 */
import { describe, expect, it } from 'vitest'
import type { BrokerSession } from '@shared/broker/broker-session'
import { AlpacaBrokerSession } from './alpaca/session'
import { RithmicBrokerSession } from './rithmic/session'

function fakeAlpacaClient() {
  return {
    connect: async () => { /* no-op */ },
    disconnect: async () => { /* no-op */ },
    submitOrder: async () => ({ id: 'b', status: 'accepted' }),
    cancelOrder: async () => { /* no-op */ },
    getAccount:  async () => ({ equity: 0, cash: 0, buyingPower: 0 }),
    getPositions: async () => [],
    onTradeUpdate:   () => () => { /* unsub */ },
    onAccountUpdate: () => () => { /* unsub */ },
  }
}

function fakeMarketData() {
  return {
    getQuote: () => undefined,
    getAllQuotes: () => [],
    getCandles: () => [],
    onQuotesTick:   () => () => { /* unsub */ },
    onCandleUpdate: () => () => { /* unsub */ },
  }
}

interface Adapter {
  name: string
  make: () => BrokerSession
}

const ADAPTERS: Adapter[] = [
  { name: 'AlpacaBrokerSession', make: () => new AlpacaBrokerSession(fakeAlpacaClient() as never, fakeMarketData() as never) },
  { name: 'RithmicBrokerSession (stub)', make: () => new RithmicBrokerSession() },
]

for (const adapter of ADAPTERS) {
  describe(`BrokerSession contract: ${adapter.name}`, () => {
    it('exposes a known broker identifier', () => {
      const s = adapter.make()
      expect(['alpaca', 'rithmic']).toContain(s.broker)
    })

    it('initial state is DISCONNECTED', () => {
      const s = adapter.make()
      expect(s.state).toBe('DISCONNECTED')
    })

    it('exposes all four facets as own-properties', () => {
      const s = adapter.make()
      expect(s.orders).toBeDefined()
      expect(s.data).toBeDefined()
      expect(s.account).toBeDefined()
      expect(s.symbols).toBeDefined()
    })

    it('facet references are stable across reads', () => {
      const s = adapter.make()
      expect(s.orders).toBe(s.orders)
      expect(s.data).toBe(s.data)
      expect(s.account).toBe(s.account)
      expect(s.symbols).toBe(s.symbols)
    })

    it('orders surface has submit / cancel / onUpdate', () => {
      const s = adapter.make()
      expect(typeof s.orders.submit).toBe('function')
      expect(typeof s.orders.cancel).toBe('function')
      expect(typeof s.orders.onUpdate).toBe('function')
    })

    it('account surface has getSnapshot / onUpdate', () => {
      const s = adapter.make()
      expect(typeof s.account.getSnapshot).toBe('function')
      expect(typeof s.account.onUpdate).toBe('function')
    })

    it('symbols surface has toBrokerSymbol / toCanonical / isSupported', () => {
      const s = adapter.make()
      expect(typeof s.symbols.toBrokerSymbol).toBe('function')
      expect(typeof s.symbols.toCanonical).toBe('function')
      expect(typeof s.symbols.isSupported).toBe('function')
    })

    it('data surface satisfies MarketDataSource', () => {
      const s = adapter.make()
      expect(typeof s.data.getQuote).toBe('function')
      expect(typeof s.data.getAllQuotes).toBe('function')
      expect(typeof s.data.getCandles).toBe('function')
      expect(typeof s.data.onQuotesTick).toBe('function')
      expect(typeof s.data.onCandleUpdate).toBe('function')
    })

    it('disconnect resolves without throwing on a freshly-constructed session', async () => {
      const s = adapter.make()
      await expect(s.disconnect()).resolves.toBeUndefined()
    })

    it('onStateChange returns an unsub handle that does not throw on call', () => {
      const s = adapter.make()
      const unsub = s.onStateChange(() => { /* noop */ })
      expect(typeof unsub).toBe('function')
      expect(() => unsub()).not.toThrow()
    })

    it('onUpdate subscriptions on every facet return unsub handles', () => {
      const s = adapter.make()
      expect(typeof s.orders.onUpdate(() => { /* noop */ })).toBe('function')
      expect(typeof s.account.onUpdate(() => { /* noop */ })).toBe('function')
      expect(typeof s.data.onQuotesTick(() => { /* noop */ })).toBe('function')
    })
  })
}
```

- [ ] **Step 2: Run + commit**

```bash
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app test -- broker-session.contract
git add 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/services/broker-session.contract.test.ts
git commit -m "test(broker): shared BrokerSession contract suite — Alpaca + Rithmic"
```
Expected: 22 / 22 PASS (11 contract checks × 2 adapters).

---

## Stage E — Trading-engine wire-in (1 task)

### Task E.1 — Add `private session: BrokerSession` field

Minimal touch. Construct an `AlpacaBrokerSession` in `initialize()` after the existing `this.alpaca` and `this.market` are set up. Don't migrate any existing call sites — that's F.5.

**Files:**
- Modify: `src/main/core/trading-engine.ts`

- [ ] **Step 1: Locate the existing AlpacaClient + LiveMarket construction in initialize()**

```bash
grep -n "this.alpaca\s*=\|this.market\s*=" 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/core/trading-engine.ts | head -20
```
Read the surrounding context. The new session field should be constructed AFTER `this.alpaca` is assigned AND AFTER `this.market` is assigned.

- [ ] **Step 2: Add the field declaration**

In the TradingEngine class field block (near the other `private` field declarations — find the existing `private alpaca: AlpacaClient | null` line for reference):

```ts
/**
 * F.1 — BrokerSession abstraction. Wraps the existing AlpacaClient +
 * LiveMarket. F.5 will switch this between Alpaca and Rithmic based on
 * user preference; F.1 hard-codes Alpaca.
 *
 * NOT consumed by existing call sites in F.1 — those still use
 * this.alpaca / this.market / this.om. The session field exists so
 * new code (the next phases) can bind against it without touching the
 * existing surface.
 */
private session: BrokerSession | null = null
```

Add the matching import at the top of the file:

```ts
import type { BrokerSession } from '@shared/broker/broker-session'
import { AlpacaBrokerSession } from '../services/alpaca/session'
```

- [ ] **Step 3: Construct the session in initialize()**

After `this.alpaca` is constructed AND `this.market` is assigned (the order matters — the session needs both), add:

```ts
// F.1 — BrokerSession wraps the existing Alpaca client + market source.
// Hard-coded to Alpaca in F.1; F.5 adds the user-facing selector.
if (this.alpaca) {
  this.session = new AlpacaBrokerSession(this.alpaca, this.market)
  log.info('broker-session constructed', { broker: this.session.broker })
}
```

The `log` instance is the existing `createLogger('engine')` already in scope.

- [ ] **Step 4: Verify full suite is green**

```bash
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app run typecheck
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app run lint
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app run knip
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app test
```
Expected: typecheck 0 / lint 0 / knip 0 / all 673 baseline tests + new tests added in stages A–D PASS.

- [ ] **Step 5: Manual smoke (no automated test)**

```bash
npm --prefix .\00-PROJECT-ROOT\01-SATEX-CORE\satex-app run dev
```
In the dev window: open DevTools console, call `await window.satex.healthCheck()` — verify it returns OK. Submit a paper-mode order via the Order Ticket — verify it still routes through Alpaca paper. No behavior change from pre-refactor; the session field is dormant.

- [ ] **Step 6: Commit**

```bash
git add 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/src/main/core/trading-engine.ts
git commit -m "feat(broker): wire BrokerSession into TradingEngine (dormant in F.1)"
```

---

## Stage F (deferred polish) — AlpacaClient internal extraction

**Status:** Optional. Can land in the same PR as Stages A–E if reviewer time permits, or as a follow-up PR. Stages A–E are functionally complete without this.

**Goal:** Split the existing 780-line `src/main/services/alpaca.ts` into focused files at `src/main/services/alpaca/`. The new files are PURE EXTRACTIONS — same behavior, different filenames. The class `AlpacaClient` is preserved at the same import path via the existing file becoming a re-export shim.

**Files (post-extraction):**

```
src/main/services/alpaca/
  rest.ts            # extracted AlpacaClient.rest() + authenticated REST helper
  wire-protocol.ts   # AlpacaTick, AlpacaTradeUpdate, AlpacaConfig types + WS message parsers
  ws-equity.ts       # equity-feed WebSocket connection + handlers
  ws-crypto.ts       # crypto-feed WebSocket connection + handlers
  ws-account.ts      # account-update WebSocket connection + handlers
  client.ts          # the AlpacaClient class — now composes the above
```

`src/main/services/alpaca.ts` becomes:

```ts
// Backwards-compat shim for callers that still import from the old path.
export * from './alpaca/client'
export { AlpacaClient } from './alpaca/client'
```

### Task F.1 — Extract `rest.ts`

Pull the authenticated REST helper (currently `AlpacaClient.rest<T>()`) into a standalone function. AlpacaClient calls it via `rest(this.cfg, ...)` instead of `this.rest(...)`.

(Detailed step-by-step omitted — Stage F is OPT-IN polish. Implementer follows the existing pattern: extract one method, update AlpacaClient call sites, run tests, commit. Repeat for each file. Skip the entire stage if abstraction-only F.1 already satisfies review expectations.)

### Task F.2 — Extract `wire-protocol.ts`

Move `AlpacaTick`, `AlpacaTradeUpdate`, `AlpacaConfig`, `AlpacaAccountSnapshot`, `AlpacaPosition`, the trade-update parser, and the tick parser to a standalone file.

### Task F.3 — Extract `ws-equity.ts` / `ws-crypto.ts` / `ws-account.ts`

Three sibling files, one per existing WebSocket connection. Each owns its own connect / reconnect / message-dispatch lifecycle. AlpacaClient instantiates all three internally.

---

## Self-review

**1. Spec coverage** — every spec section maps to at least one task:

| Spec § | Spec topic | Plan task |
|---|---|---|
| §1 | Architecture (3 facets + umbrella) | A.0–A.5 (types), B.1–B.4 (Alpaca impl), C.1 (Rithmic stub) |
| §2 | BrokerSession lifecycle | A.5 (interface), B.4 (Alpaca impl), C.1 (Rithmic stub) |
| §3 | OrderRouter + OrderEvent + clientOrderId contract | A.2 (interface), B.3 (Alpaca impl) |
| §4 | MarketDataSource (preserve existing) | A.0 (extract interface to shared/) |
| §5 | AccountSyncer + AccountSnapshot | A.3 (interface), B.2 (Alpaca impl) |
| §6 | SymbolResolver | A.4 (interface), B.1 (Alpaca impl) |
| §7 | BrokerError taxonomy | A.1 (class + codes) |
| §8 | Alpaca refactor strategy | B.1–B.4 (facets via delegation), F.1–F.3 (deferred extraction) |
| §9 | Rithmic stub | C.1 |
| §10 | Testing | every Stage B/C task has tests + Stage D contract suite |
| §11 | File structure | covered by file list at the top |
| §12 | Validation criteria | enforced via the pre-commit gates + final sweep in E.1 step 4 |
| §13 | Risks + mitigations | clientOrderId idempotency cached in B.3; AlpacaClient shim path preserved by F.1's structure |
| §14 | feedback_verify_pasted_specs note | F.1 only stubs Rithmic; real protocol verification happens in F.2 |

**2. Placeholder scan** — every code block has real content. Two "consult the existing file before writing" notes in B.2 and B.3 — those are honest "the AlpacaClient surface shape needs to be read at implementation time" callouts, not placeholders. Stage F's per-task detail is deliberately compressed because the stage is deferred polish; if it's pulled forward into the active PR, the implementer extracts per the existing AlpacaClient method-by-method structure.

**3. Type consistency** — `OrderEvent` discriminator is `execType` consistently across A.2, B.3, C.1, D.1. `clientOrderId` is the field name everywhere. `BrokerSession.broker` is `'alpaca' | 'rithmic'` consistently. `Unsub` type imported from `@shared/broker/market-data-source` consistently (NOT redeclared per-file). `SessionState` union is identical in A.5, B.4, C.1.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-01-f1-broker-adapter-impl.md`.

Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task (A.0 → A.5 → B.1 → ... → E.1, with Stage F optional). Two-stage review between tasks. Highest task isolation; lowest blast radius if any single task surfaces an unexpected refactor.
2. **Inline Execution** — execute the tasks in this session using `superpowers:executing-plans`. Same pattern as Tier-2 and D-2 execution. Faster wall-clock but more context churn.

Which approach?
