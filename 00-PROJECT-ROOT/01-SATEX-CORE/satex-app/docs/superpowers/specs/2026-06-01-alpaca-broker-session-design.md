# AlpacaBrokerSession — Design

**F.1 task A.6 + B.4.** Composes the four Alpaca facets under the
`BrokerSession` umbrella with an honest 5-state lifecycle machine.

Status: brainstorming approved 2026-06-01. Implementation pending.

## Scope

Build `AlpacaBrokerSession` as a constructable, fully-tested class. Engine
call-sites (cold boot, data-feed switch, reconnect — `trading-engine.ts`
~441 / ~1022 / ~1097) are **out of scope** for this commit. A follow-up
commit migrates them to consume `BrokerSession`.

This is the reference implementation for the `BrokerSession` contract
(`@shared/broker/broker-session.ts`). When the Rithmic adapter lands, it
implements the same interface; the engine consumes `BrokerSession` blindly.

## Decisions locked

| # | Decision | Rationale |
|---|---|---|
| 1 | Umbrella only — no engine integration this commit | Smaller, reviewable diff; trading hot path unchanged |
| 2 | AlpacaClient gains a single `onConnectionStateChange` event | Truthful 5-state SessionState requires an event source; one event minimizes surface |
| 3 | DI facets + static factory `AlpacaBrokerSession.create()` | Mirrors the shape-DI pattern of `AlpacaOrderRouter` / `AlpacaAccountSyncer` |
| 4 | Lenient `failUnacked` — acked-but-not-terminal | Pre-ack window is too small to be useful; lenient drain matches real disconnect needs |
| 5 | Fail-fast initial connect (one attempt) | Retry budget is engine policy, not session; contract says throws on unrecoverable |

## Architecture

```
                    BrokerSession  (shared interface)
                          ▲
                          │
                AlpacaBrokerSession  (this commit)
                ┌─────────┼─────────┬──────────┐
                ▼         ▼         ▼          ▼
        SymbolResolver  Account   Orders   MarketData
        (Alpaca)        Syncer    Router   Source
                        (Alpaca)  (Alpaca) (LiveMarket)
                                              │
                ────────────────────────────  ▼
                          AlpacaClient
                ────────────────────────────
                          │
                  onConnectionStateChange ← NEW event source
```

## File plan

**New**
- `src/main/services/alpaca/broker-session.ts`
- `src/main/services/alpaca/broker-session.test.ts`

**Modified**
- `src/shared/broker/order-router.ts` — add `failUnacked(reason: string): void` method to `OrderRouter`.
- `src/shared/broker/broker-session.ts` — update `disconnect()` docstring to reflect lenient drain semantics.
- `src/main/services/alpaca.ts` — add `AlpacaConnectionState` type + `onConnectionStateChange(fn): Unsub`; emit at every WS open / close / reconnect-timer-arm / reconnect-timer-fire transition.
- `src/main/services/alpaca/order-router.ts` — implement `failUnacked(reason)`: iterate `inFlight`, synthesize REJECT through the existing onUpdate fanout, clear both indices.
- `src/main/services/alpaca/order-router.test.ts` — add 4 `failUnacked` cases.
- `src/main/services/alpaca.test.ts` — add `onConnectionStateChange` cases (event source basics + unsub).

## Component contracts

### `AlpacaConnectionState` (broker-specific, lives in `alpaca.ts`)

```ts
export interface AlpacaConnectionState {
  equity:       boolean   // market WS open
  account:      boolean   // account WS open (trade_updates stream)
  crypto:       boolean   // crypto WS open
  reconnecting: boolean   // any of the three reconnect timers armed
}
```

Lives next to `AlpacaClient` because the field set is Alpaca-specific
(Rithmic's connection model has different facets). Not exported from
`@shared/broker/` — broker-specific shapes do not belong in the shared
contract.

### `OrderRouter.failUnacked(reason: string): void` (shared)

Synthesize a REJECT event for every order this router considers
in-progress (acked by broker, no terminal event received). Clear the
in-flight index. Broker-side orders are NOT canceled — callers must
reconcile via `AccountSyncer`.

### `BrokerSession.disconnect()` doc update (shared)

Replace: *"Triggers REJECT events for any orders the broker hasn't
acknowledged at the time of call."*

With: *"Triggers REJECT events for every order the session is still
tracking as in-progress (acked by broker, no terminal event seen).
Broker-side orders are not canceled; reconciliation is the engine's
responsibility via `account.getSnapshot()`."*

### `AlpacaBrokerSession`

```ts
class AlpacaBrokerSession implements BrokerSession {
  readonly broker = 'alpaca' as const
  readonly symbols: SymbolResolver
  readonly account: AccountSyncer
  readonly orders:  OrderRouter
  readonly data:    MarketDataSource

  get state(): SessionState           // sync getter
  onStateChange(fn): Unsub
  connect(): Promise<void>            // idempotent
  disconnect(): Promise<void>

  constructor(deps: { client, orders, account, symbols, data })
  static create(client: AlpacaClient, marketSymbols: string[]): AlpacaBrokerSession
}
```

## Data flow

### `connect()` — idempotent, single attempt

1. If `_state === 'CONNECTED'` → resolve immediately.
2. If `_state === 'CONNECTING'` → return the cached in-flight Promise.
3. Set `_state = 'CONNECTING'`, fire listeners.
4. Subscribe to `client.onConnectionStateChange` (stored on `this` for teardown).
5. Await `data.start()` (which internally calls `client.connectMarketStream`) and `client.connectAccountStream()` in parallel via `Promise.all`. Market stream goes through `data` so LiveMarket sets up its quote/candle plumbing; account stream is called directly because no facet owns it.
6. On success → `_state = 'CONNECTED'`, fire.
7. On any throw → `_state = 'FAILED'`, fire, rethrow as `BrokerError({ code: 'AUTH_FAILED' | 'CONNECTION_LOST' })`.

### Connection-state observer (post-connect)

```
incoming AlpacaConnectionState           → SessionState transition
─────────────────────────────────────────────────────────────────
{ equity:true, account:true,              → CONNECTED   (resume)
  reconnecting:false }
{ reconnecting:true, ... }                → RECONNECTING
{ equity:false OR account:false,          → no immediate transition
  reconnecting:false }                       (window between drop and
                                              scheduleReconnect; next
                                              event carries
                                              reconnecting:true)
```

The "no immediate transition" rule prevents flapping from CONNECTED →
DISCONNECTED → RECONNECTING within milliseconds. The session stays in its
current state until either a fully-restored event or a reconnecting event
arrives.

Crypto WS state is informational — a closed crypto feed never blocks
trading on equities. The session does not hold equity trading state on
crypto WS availability.

### `disconnect()`

1. `orders.failUnacked('broker-session-disconnected')` — synthesizes
   REJECT for each in-progress order via the existing onUpdate fanout.
2. `data.stop()` (LiveMarket internally calls `client.disconnectMarketStream`).
3. `client.disconnectAccountStream()` (no facet owns the account WS).
4. Tear down the `onConnectionStateChange` subscription.
5. `_state = 'DISCONNECTED'`, fire.

## Error handling

| Scenario | Handling |
|---|---|
| AUTH_FAILED on initial connect | `BrokerError({ code:'AUTH_FAILED', retryable:false })`, state = FAILED |
| CONNECTION_LOST on initial connect | `BrokerError({ code:'CONNECTION_LOST', retryable:true })`, state = FAILED |
| One leg of `Promise.all([data.start(), client.connectAccountStream()])` rejects, other succeeds | Catch block force-calls `data.stop()` + `client.disconnectAccountStream()` (both idempotent) before setting FAILED + rethrowing. Prevents orphan WS sockets. |
| WS drop after connected | AlpacaClient retries internally; session sees `reconnecting:true` → RECONNECTING |
| Listener throws in fanout | Wrap each invocation in try/catch + `log.warn` (matches MarketDataSource pattern) |
| `failUnacked` re-entrancy | Second call sees empty `inFlight`, no-op |
| `connect()` called while FAILED | Treat as fresh attempt — set state back to CONNECTING and re-run lifecycle. (Callers must explicitly re-attempt; the session does not auto-recover from FAILED.) |

## Testing

### `src/main/services/alpaca/broker-session.test.ts` (new)

| Case | Pins |
|---|---|
| `connect()` transitions DISCONNECTED→CONNECTING→CONNECTED; listeners fired in order | happy path |
| Concurrent `connect()` calls return the same in-flight Promise | idempotency #1 |
| `connect()` on CONNECTED resolves without re-calling client | idempotency #2 |
| AUTH error during connect → throws BrokerError, state=FAILED, listeners fired | auth error path |
| Connection-state event `{reconnecting:true}` → state=RECONNECTING | reconnect tracking |
| Connection-state event back to all-true → state=CONNECTED | recovery |
| `disconnect()` calls `orders.failUnacked('broker-session-disconnected')` | drain hook |
| `disconnect()` calls `client.disconnectMarketStream` + tears down observer | cleanup |
| `disconnect()` → state=DISCONNECTED, fires | terminal transition |
| `onStateChange` unsub stops further notifications | unsub correctness |

### `src/main/services/alpaca/order-router.test.ts` (4 new cases)

| Case | Pins |
|---|---|
| `failUnacked('reason')` emits REJECT per inFlight entry via onUpdate fanout | drain primitive |
| Cleared `inFlight` and `brokerToClient` post-call | post-condition |
| No-op when `inFlight` is empty | idempotency |
| Post-drain submit with same clientOrderId hits the wire again | cache-clear correctness |

### `src/main/services/alpaca.test.ts` (3 new cases)

| Case | Pins |
|---|---|
| `onConnectionStateChange` fires on equity ws open with `{equity:true,…}` | event source basics |
| Fires when `scheduleReconnect` arms a timer with `{reconnecting:true}` | reconnect signal |
| Unsub stops notifications | unsub correctness |

## Out of scope (deferred to follow-up commit)

- Migrating `trading-engine.ts` to construct + consume `AlpacaBrokerSession` (~441, ~1022, ~1097).
- `getCryptoMarketStream` wiring into AlpacaConnectionState beyond informational reporting.
- Reconnect-budget exhaustion → FAILED transition (AlpacaClient retries forever today).
- IPC surface for the renderer to observe SessionState (TopBar currently reads `isMarketConnected`).

## Acceptance criteria

- All four health-stack gates green: `npm run typecheck`, `npm run lint`, `npm test`, `npm run knip` (the knip flag on `broker-session.ts` clears when `AlpacaBrokerSession` lands and imports it).
- `npm test` count: 402 + new cases (broker-session: 10, router additions: 4, alpaca additions: 3) = **419 tests** target.
- Commits land as a single feat-shaped change with the existing broker-port message convention (`feat(broker): AlpacaBrokerSession — composes facets + 5-state lifecycle`).
