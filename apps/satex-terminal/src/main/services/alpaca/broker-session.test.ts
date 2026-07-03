import { describe, expect, it } from 'vitest'
import { AlpacaBrokerSession, type AlpacaClientLifecycle } from './broker-session'
import { BrokerError } from '@shared/broker/broker-error'
import type { SessionState } from '@shared/broker/broker-session'
import type { OrderRouter, OrderEvent, OrderAck } from '@shared/broker/order-router'
import type { AccountSyncer, AccountSnapshot }  from '@shared/broker/account-syncer'
import type { SymbolResolver } from '@shared/broker/symbol-resolver'
import type { MarketDataSource, Unsub } from '@shared/broker/market-data-source'
import type { AlpacaConnectionState } from '../alpaca'

// ── Fakes ───────────────────────────────────────────────────────────────────

function fakeClient(overrides: Partial<AlpacaClientLifecycle> = {}) {
  let connStateListener: ((s: AlpacaConnectionState) => void) | null = null
  let connectAccountCalls   = 0
  let disconnectAccountCalls = 0
  const client: AlpacaClientLifecycle & {
    connectAccountCalls:    () => number
    disconnectAccountCalls: () => number
    pushConnectionState:    (s: AlpacaConnectionState) => void
  } = {
    connectAccountStream: async () => { connectAccountCalls++; if (overrides.connectAccountStream) await overrides.connectAccountStream() },
    disconnectAccountStream: () => { disconnectAccountCalls++; overrides.disconnectAccountStream?.() },
    onConnectionStateChange: (fn) => {
      connStateListener = fn
      return () => { if (connStateListener === fn) connStateListener = null }
    },
    connectAccountCalls:    () => connectAccountCalls,
    disconnectAccountCalls: () => disconnectAccountCalls,
    pushConnectionState:    (s) => { if (connStateListener) connStateListener(s) },
  }
  return client
}

function fakeOrders(): OrderRouter & { failUnackedCalls: () => string[] } {
  const reasons: string[] = []
  return {
    submit: async (_req): Promise<OrderAck> => ({ brokerOrderId: 'b', clientOrderId: 'c', acceptedAt: 0 }),
    cancel: async (_id) => { /* noop */ },
    onUpdate: (_fn: (e: OrderEvent) => void): Unsub => () => { /* noop */ },
    failUnacked: (reason) => { reasons.push(reason) },
    failUnackedCalls: () => reasons,
  }
}

function fakeAccount(): AccountSyncer {
  return {
    getSnapshot: async (): Promise<AccountSnapshot> => ({ equity: 0, cash: 0, buyingPower: 0, positions: [], observedAt: 0 }),
    onUpdate:    (_fn): Unsub => () => { /* noop */ },
  }
}

function fakeSymbols(): SymbolResolver {
  return {
    toBrokerSymbol: (c) => c,
    toCanonical:    (b) => b,
    isSupported:    () => true,
  }
}

function fakeMarket(overrides: Partial<MarketDataSource> = {}) {
  let startCalls = 0
  let stopCalls  = 0
  const market: MarketDataSource & { startCalls: () => number; stopCalls: () => number } = {
    start: () => { startCalls++; overrides.start?.() },
    stop:  () => { stopCalls++;  overrides.stop?.() },
    onQuotes:  () => () => { /* noop */ },
    onCandle:  () => () => { /* noop */ },
    onNews:    () => () => { /* noop */ },
    onTrades:  () => () => { /* noop */ },
    getQuote:     () => undefined,
    getAllQuotes: () => [],
    getCandles:   () => [],
    // F.1 L1.A safe defaults for the test double
    getBars:        async () => [],
    getCryptoBars:  async () => [],
    getClock:       async () => ({ isOpen: true, nextOpen: 0, nextClose: Number.MAX_SAFE_INTEGER }),
    isConnected:    () => true,
    msSinceLastTick: () => 0,
    startCalls: () => startCalls,
    stopCalls:  () => stopCalls,
  }
  return market
}

function makeSession(opts: {
  client?:  ReturnType<typeof fakeClient>
  orders?:  ReturnType<typeof fakeOrders>
  account?: AccountSyncer
  symbols?: SymbolResolver
  data?:    ReturnType<typeof fakeMarket>
} = {}) {
  const client  = opts.client  ?? fakeClient()
  const orders  = opts.orders  ?? fakeOrders()
  const account = opts.account ?? fakeAccount()
  const symbols = opts.symbols ?? fakeSymbols()
  const data    = opts.data    ?? fakeMarket()
  const session = new AlpacaBrokerSession({ client, orders, account, symbols, data })
  return { session, client, orders, account, symbols, data }
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('AlpacaBrokerSession', () => {
  it('connect() transitions DISCONNECTED → CONNECTING → CONNECTED in order', async () => {
    const { session } = makeSession()
    const seen: SessionState[] = []
    session.onStateChange(s => seen.push(s))
    expect(session.state).toBe('DISCONNECTED')
    await session.connect()
    expect(session.state).toBe('CONNECTED')
    expect(seen).toEqual(['CONNECTING', 'CONNECTED'])
  })

  it('connect() on a CONNECTED session is a no-op (no re-handshake)', async () => {
    const { session, client } = makeSession()
    await session.connect()
    expect(client.connectAccountCalls()).toBe(1)
    await session.connect()                       // second call should be a no-op
    expect(client.connectAccountCalls()).toBe(1)
    expect(session.state).toBe('CONNECTED')
  })

  it('concurrent connect() calls share a single in-flight handshake', async () => {
    let resolveAccount: (() => void) | null = null
    const accountReady = new Promise<void>(r => { resolveAccount = r })
    const client = fakeClient({ connectAccountStream: () => accountReady })
    const { session } = makeSession({ client })

    const p1 = session.connect()
    const p2 = session.connect()
    expect(session.state).toBe('CONNECTING')
    resolveAccount!()
    await Promise.all([p1, p2])
    expect(session.state).toBe('CONNECTED')
    // Only ONE account stream connect should have been called even though
    // connect() was invoked twice.
    expect(client.connectAccountCalls()).toBe(1)
  })

  it('connect() throws BrokerError(AUTH_FAILED) and state→FAILED on auth error', async () => {
    const client = fakeClient({
      connectAccountStream: () => { throw new Error('alpaca POST /stream → 401: unauthorized') },
    })
    const { session } = makeSession({ client })
    const seen: SessionState[] = []
    session.onStateChange(s => seen.push(s))

    await expect(session.connect()).rejects.toThrow(BrokerError)
    expect(session.state).toBe('FAILED')
    expect(seen).toEqual(['CONNECTING', 'FAILED'])
  })

  it('connect() classifies non-auth errors as CONNECTION_LOST (retryable)', async () => {
    const client = fakeClient({
      connectAccountStream: () => { throw new Error('socket hang up') },
    })
    const { session } = makeSession({ client })

    const err = await session.connect().catch(e => e)
    expect(err).toBeInstanceOf(BrokerError)
    expect((err as BrokerError).code).toBe('CONNECTION_LOST')
    expect((err as BrokerError).retryable).toBe(true)
  })

  it('connect() partial failure: orphan-WS cleanup runs (data.stop + disconnectAccountStream called)', async () => {
    const client = fakeClient({
      connectAccountStream: () => { throw new Error('401 auth failed') },
    })
    const data = fakeMarket()
    const { session } = makeSession({ client, data })

    await session.connect().catch(() => { /* swallow */ })
    expect(data.stopCalls()).toBe(1)
    expect(client.disconnectAccountCalls()).toBe(1)
  })

  it('reconnecting:true → state=RECONNECTING', async () => {
    const { session, client } = makeSession()
    await session.connect()
    expect(session.state).toBe('CONNECTED')
    client.pushConnectionState({ equity: false, account: true, crypto: false, reconnecting: true })
    expect(session.state).toBe('RECONNECTING')
  })

  it('state restoration → equity+account both true & not reconnecting → state=CONNECTED', async () => {
    const { session, client } = makeSession()
    await session.connect()
    client.pushConnectionState({ equity: false, account: true, crypto: false, reconnecting: true })
    expect(session.state).toBe('RECONNECTING')
    client.pushConnectionState({ equity: true, account: true, crypto: false, reconnecting: false })
    expect(session.state).toBe('CONNECTED')
  })

  it('transient partial-down state (no reconnecting flag yet) does NOT flap', async () => {
    const { session, client } = makeSession()
    await session.connect()
    client.pushConnectionState({ equity: false, account: true, crypto: false, reconnecting: false })
    // Per spec: no immediate transition; state stays CONNECTED until either
    // a full-up event or a reconnecting event arrives.
    expect(session.state).toBe('CONNECTED')
  })

  it('disconnect() calls orders.failUnacked with the canonical reason', async () => {
    const orders = fakeOrders()
    const { session } = makeSession({ orders })
    await session.connect()
    await session.disconnect()
    expect(orders.failUnackedCalls()).toEqual(['broker-session-disconnected'])
  })

  it('disconnect() calls data.stop and client.disconnectAccountStream, transitions to DISCONNECTED', async () => {
    const { session, client, data } = makeSession()
    await session.connect()
    const seen: SessionState[] = []
    session.onStateChange(s => seen.push(s))
    await session.disconnect()
    expect(data.stopCalls()).toBe(1)
    expect(client.disconnectAccountCalls()).toBe(1)
    expect(session.state).toBe('DISCONNECTED')
    expect(seen).toEqual(['DISCONNECTED'])
  })

  it('disconnect() tears down the connection-state observer (no more state updates from the client)', async () => {
    const { session, client } = makeSession()
    await session.connect()
    await session.disconnect()
    // Post-disconnect, even a stream of "we're reconnecting!" events must
    // not flip the session back. (Subscription was torn down.)
    client.pushConnectionState({ equity: true, account: true, crypto: false, reconnecting: true })
    expect(session.state).toBe('DISCONNECTED')
  })

  it('onStateChange unsub stops further notifications', async () => {
    const { session } = makeSession()
    const seen: SessionState[] = []
    const off = session.onStateChange(s => seen.push(s))
    await session.connect()
    expect(seen).toEqual(['CONNECTING', 'CONNECTED'])
    off()
    await session.disconnect()
    expect(seen).toEqual(['CONNECTING', 'CONNECTED'])  // unchanged after unsub
  })
})
