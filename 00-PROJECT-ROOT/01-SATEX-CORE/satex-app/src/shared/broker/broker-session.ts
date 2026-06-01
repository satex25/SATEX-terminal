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
