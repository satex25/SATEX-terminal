/**
 * SATEX — AlpacaAccountSyncer.
 *
 * Delegates to AlpacaClient.getAccount() + getPositions() for pull
 * snapshots (REST /v2/account + /v2/positions in parallel).
 *
 * Push semantics (onUpdate): AlpacaClient's account WebSocket stream
 * delivers only `trade_updates` (order-fill events) via `onTradeUpdate`.
 * There is no Alpaca-side push for equity/cash/buying-power changes.
 * onUpdate therefore returns a no-op unsub. Callers should poll via
 * getSnapshot() on an appropriate interval (engine uses 15s).
 *
 * F.1 task B.2.
 */
import type { AccountSyncer, AccountSnapshot } from '@shared/broker/account-syncer'
import type { Unsub } from '@shared/broker/market-data-source'
import type { Position } from '@shared/types'

/** The subset of AlpacaAccountSnapshot that getAccount() always returns. */
interface RawAccount {
  equity:      number
  cash:        number
  buyingPower: number
  [key: string]: unknown
}

/** The subset of AlpacaPosition that getPositions() always returns. */
interface RawPosition {
  symbol:        string
  qty:           number
  avgEntryPrice: number
  unrealizedPl:  number
  side:          'long' | 'short'
  [key: string]: unknown
}

/** Minimal AlpacaClient surface consumed by this syncer. */
interface AlpacaClientShape {
  getAccount():   Promise<RawAccount>
  getPositions(): Promise<RawPosition[]>
}

/** Map AlpacaPosition → shared Position. */
function toPosition(p: RawPosition): Position {
  return {
    symbol:       p.symbol,
    // Signed: long = positive, short = negative (matches Position contract).
    quantity:     p.side === 'short' ? -Math.abs(p.qty) : Math.abs(p.qty),
    avgPrice:     p.avgEntryPrice,
    unrealizedPnl: p.unrealizedPl,
    realizedPnl:  0,
    // Alpaca REST doesn't return the position-open timestamp; use local
    // clock as a best-effort fallback — observedAt timestamp is the
    // authoritative staleness signal for downstream consumers.
    openedAt:     Date.now(),
  }
}

export class AlpacaAccountSyncer implements AccountSyncer {
  constructor(private readonly client: AlpacaClientShape) {}

  async getSnapshot(): Promise<AccountSnapshot> {
    const [account, rawPositions] = await Promise.all([
      this.client.getAccount(),
      this.client.getPositions(),
    ])
    return {
      equity:      account.equity,
      cash:        account.cash,
      buyingPower: account.buyingPower,
      positions:   rawPositions.map(toPosition),
      // Alpaca REST /v2/account does not include a server timestamp; use
      // local clock at fetch completion as the observation time.
      observedAt:  Date.now(),
    }
  }

  onUpdate(_fn: (snap: AccountSnapshot) => void): Unsub {
    // No-op: AlpacaClient's account WS delivers only trade_updates (order
    // fills) — there is no account-balance push stream. Callers must poll
    // getSnapshot() at a suitable interval. If Alpaca ever exposes an
    // account-state event stream, wire it here and update onTradeUpdate
    // to trigger a poll-then-push cycle.
    return () => { /* no-op */ }
  }
}
