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
