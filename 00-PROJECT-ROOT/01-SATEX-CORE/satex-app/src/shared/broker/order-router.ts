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
 * Field name is `execType` (FIX-standard) so institutional execution
 * engineers recognise it; values stay readable so TypeScript switch sites
 * read as `if (e.execType === 'FILL')` rather than `if (e.execType === '2')`.
 */
export type OrderEvent =
  | { execType: 'ACK';          orderId: string; clientOrderId: string; timestamp: number }
  | { execType: 'PARTIAL_FILL'; orderId: string; clientOrderId: string; filled: number; price: number; timestamp: number;
      /** Broker-supplied instrument symbol. Present on Alpaca; optional for other brokers. */
      symbol?: string; side?: 'buy' | 'sell' }
  | { execType: 'FILL';         orderId: string; clientOrderId: string; filled: number; avgPrice: number; timestamp: number;
      /** Broker-supplied instrument symbol. Present on Alpaca; optional for other brokers. */
      symbol?: string; side?: 'buy' | 'sell' }
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

  /**
   * Synthesize a REJECT event for every order this router considers
   * in-progress (acked by broker, no terminal event received yet) and
   * clear the in-flight index. Broker-side orders are NOT canceled —
   * callers must reconcile via AccountSyncer.
   *
   * Intended for use during session disconnect / failure.
   */
  failUnacked(reason: string): void
}
