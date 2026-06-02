/**
 * SATEX — AlpacaOrderRouter.
 *
 * Translates between the shared OrderRouter contract and AlpacaClient.
 * Caller supplies `clientOrderId` on every submit (UUIDv4 by convention,
 * per @shared/broker/order-router.ts). The router:
 *   • Deduplicates on clientOrderId BEFORE the REST call so a retry never
 *     touches the wire twice.
 *   • Passes clientOrderId through to Alpaca's POST /v2/orders body so the
 *     broker echoes it back on the response (and on every subsequent
 *     trade-update via order.client_order_id, although our AlpacaTradeUpdate
 *     wire type doesn't currently surface it — see below).
 *   • Maintains a secondary brokerOrderId → clientOrderId index because the
 *     existing AlpacaTradeUpdate type drops client_order_id; this index lets
 *     translate() populate the unified OrderEvent.clientOrderId field.
 *
 * F.1 task B.3.
 */
import type { OrderRouter, OrderEvent, OrderAck } from '@shared/broker/order-router'
import type { Unsub } from '@shared/broker/market-data-source'
import type { OrderRequest, AlpacaTradeUpdate } from '@shared/types'
import { BrokerError } from '@shared/broker/broker-error'

interface AlpacaSubmitResult {
  id: string
  clientOrderId: string
  status: string
  filledQty: number
  filledAvgPrice: number | null
}

interface AlpacaClientShape {
  submitOrder(req: OrderRequest & { clientOrderId?: string }): Promise<AlpacaSubmitResult>
  cancelOrder(brokerOrderId: string): Promise<void>
  onTradeUpdate(fn: (u: AlpacaTradeUpdate) => void): Unsub
}

export class AlpacaOrderRouter implements OrderRouter {
  /** clientOrderId → cached OrderAck. Primary dedup index. */
  private readonly inFlight = new Map<string, OrderAck>()
  /** brokerOrderId → clientOrderId. Lookup index for trade-update translation. */
  private readonly brokerToClient = new Map<string, string>()

  constructor(private readonly client: AlpacaClientShape) {}

  async submit(req: OrderRequest & { clientOrderId: string }): Promise<OrderAck> {
    // Dedup BEFORE the REST call — a retry with the same clientOrderId
    // returns the cached ack without touching the broker.
    const cached = this.inFlight.get(req.clientOrderId)
    if (cached) return cached

    let result: AlpacaSubmitResult
    try {
      result = await this.client.submitOrder(req)
    } catch (e) {
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
    this.brokerToClient.set(result.id, req.clientOrderId)
    return ack
  }

  async cancel(brokerOrderId: string): Promise<void> {
    try {
      await this.client.cancelOrder(brokerOrderId)
    } catch (e) {
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
      const evt = this.translate(u)
      if (!evt) return
      fn(evt)
      if (
        evt.execType === 'FILL' || evt.execType === 'CANCEL' ||
        evt.execType === 'REJECT' || evt.execType === 'EXPIRE'
      ) {
        const cid = this.brokerToClient.get(u.orderId)
        if (cid) this.inFlight.delete(cid)
        this.brokerToClient.delete(u.orderId)
      }
    })
  }

  private translate(u: AlpacaTradeUpdate): OrderEvent | null {
    // AlpacaTradeUpdate has no clientOrderId field — resolve via the
    // brokerOrderId → clientOrderId index populated on submit.
    const clientOrderId = this.brokerToClient.get(u.orderId) ?? ''
    const base = { orderId: u.orderId, clientOrderId, timestamp: u.timestamp }

    switch (u.event) {
      case 'new':          return { execType: 'ACK',          ...base }
      case 'fill':         return { execType: 'FILL',         ...base, filled: u.filledQty, avgPrice: u.price }
      case 'partial_fill': return { execType: 'PARTIAL_FILL', ...base, filled: u.filledQty, price:    u.price }
      case 'canceled':     return { execType: 'CANCEL',       ...base }
      case 'rejected':     return { execType: 'REJECT',       ...base, reason: 'broker rejected' }
      case 'expired':      return { execType: 'EXPIRE',       ...base }
      default:             return null
    }
  }
}
