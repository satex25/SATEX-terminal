/**
 * SATEX — AlpacaBrokerSession.
 *
 * Composes the four Alpaca facets under the BrokerSession umbrella with
 * a 5-state lifecycle machine. See
 * docs/superpowers/specs/2026-06-01-alpaca-broker-session-design.md.
 *
 * F.1 task A.6.
 */
import type {
  BrokerSession, SessionState,
} from '@shared/broker/broker-session'
import type { OrderRouter }      from '@shared/broker/order-router'
import type { AccountSyncer }    from '@shared/broker/account-syncer'
import type { SymbolResolver }   from '@shared/broker/symbol-resolver'
import type { MarketDataSource, Unsub } from '@shared/broker/market-data-source'
import { BrokerError }           from '@shared/broker/broker-error'
import type { AlpacaClient, AlpacaConnectionState } from '../alpaca'
import { AlpacaSymbolResolver }  from './symbol-resolver'
import { AlpacaAccountSyncer }   from './account-syncer'
import { AlpacaOrderRouter }     from './order-router'

/** The slice of AlpacaClient the session drives + observes. */
export interface AlpacaClientLifecycle {
  connectAccountStream():    Promise<void>
  disconnectAccountStream(): void
  onConnectionStateChange(fn: (s: AlpacaConnectionState) => void): () => void
}

export class AlpacaBrokerSession implements BrokerSession {
  readonly broker = 'alpaca' as const
  readonly symbols: SymbolResolver
  readonly account: AccountSyncer
  readonly orders:  OrderRouter
  readonly data:    MarketDataSource

  private readonly client: AlpacaClientLifecycle
  private _state: SessionState = 'DISCONNECTED'
  private readonly stateListeners = new Set<(s: SessionState) => void>()
  private connectPromise: Promise<void> | null = null
  private offConnectionState: Unsub | null = null

  constructor(deps: {
    client:  AlpacaClientLifecycle
    orders:  OrderRouter
    account: AccountSyncer
    symbols: SymbolResolver
    data:    MarketDataSource
  }) {
    this.client  = deps.client
    this.orders  = deps.orders
    this.account = deps.account
    this.symbols = deps.symbols
    this.data    = deps.data
  }

  /** Wire the production composition: instantiate the four Alpaca facets
   *  + LiveMarket and hand them to the constructor. Tests should call the
   *  constructor directly with fakes. */
  static create(
    client: AlpacaClient,
    market: MarketDataSource,
  ): AlpacaBrokerSession {
    return new AlpacaBrokerSession({
      client,
      orders:  new AlpacaOrderRouter(client),
      account: new AlpacaAccountSyncer(client),
      symbols: new AlpacaSymbolResolver(),
      data:    market,
    })
  }

  get state(): SessionState { return this._state }

  onStateChange(fn: (s: SessionState) => void): Unsub {
    this.stateListeners.add(fn)
    return () => { this.stateListeners.delete(fn) }
  }

  async connect(): Promise<void> {
    if (this._state === 'CONNECTED') return
    if (this._state === 'CONNECTING' && this.connectPromise) return this.connectPromise

    this.setState('CONNECTING')
    this.connectPromise = this.runConnect()
    try {
      await this.connectPromise
    } finally {
      this.connectPromise = null
    }
  }

  async disconnect(): Promise<void> {
    this.orders.failUnacked('broker-session-disconnected')
    try { this.data.stop() } catch { /* idempotent — already stopped */ }
    try { this.client.disconnectAccountStream() } catch { /* idempotent */ }
    if (this.offConnectionState) { this.offConnectionState(); this.offConnectionState = null }
    this.setState('DISCONNECTED')
  }

  private async runConnect(): Promise<void> {
    // Subscribe BEFORE the connect calls so we don't miss state events that
    // fire during the connect race.
    this.offConnectionState = this.client.onConnectionStateChange((s) => this.onConnectionState(s))
    try {
      await Promise.all([
        Promise.resolve(this.data.start()),
        this.client.connectAccountStream(),
      ])
      this.setState('CONNECTED')
    } catch (e) {
      // Orphan-WS cleanup: one leg may have succeeded; force both shut.
      try { this.data.stop() } catch { /* noop */ }
      try { this.client.disconnectAccountStream() } catch { /* noop */ }
      if (this.offConnectionState) { this.offConnectionState(); this.offConnectionState = null }
      this.setState('FAILED')
      const msg = e instanceof Error ? e.message : String(e)
      const code = /auth|unauthor|401|403/i.test(msg) ? 'AUTH_FAILED' : 'CONNECTION_LOST'
      throw new BrokerError({
        broker: 'alpaca', code,
        message: `AlpacaBrokerSession.connect failed: ${msg}`,
        retryable: code === 'CONNECTION_LOST', raw: e,
      })
    }
  }

  private onConnectionState(s: AlpacaConnectionState): void {
    // Per spec § Data flow: reconnecting wins; full-up restores CONNECTED;
    // anything else (transient drop window between close and timer arm) is
    // ignored so we don't flap.
    if (s.reconnecting) { this.setState('RECONNECTING'); return }
    if (s.equity && s.account) { this.setState('CONNECTED'); return }
  }

  private setState(next: SessionState): void {
    if (this._state === next) return
    this._state = next
    for (const fn of this.stateListeners) {
      try { fn(next) } catch { /* one bad listener must not break the fanout */ }
    }
  }
}
