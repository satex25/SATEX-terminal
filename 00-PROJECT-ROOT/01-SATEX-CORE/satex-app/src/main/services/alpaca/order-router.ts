/**
 * SATEX — AlpacaOrderRouter.
 *
 * Delegates submit/cancel to AlpacaClient, translates Alpaca's trade-update
 * WS events to the unified OrderEvent stream. Caches in-flight OrderAcks
 * by brokerOrderId so terminal events can evict them, and deduplicates
 * back-to-back submits that the broker echoes with the same brokerOrderId.
 *
 * IMPORTANT: AlpacaClient.submitOrder takes a plain OrderRequest (no
 * clientOrderId input — Alpaca auto-generates client_order_id server-side
 * and returns it on the OrderResult). The router therefore reads clientOrderId
 * from the OrderResult, not from the inbound request.
 *
 * AlpacaTradeUpdate has NO clientOrderId field (real type in @shared/types).
 * The router sets clientOrderId on OrderEvent from the cached ack (looked up
 * by orderId) when available, or falls back to '' for uncached events.
 *
 * F.1 task B.3.
 */
import type { OrderRouter, OrderEvent, OrderAck } from '@shared/broker/order-router'
import type { Unsub } from '@shared/broker/market-data-source'
import type { OrderRequest, AlpacaTradeUpdate } from '@shared/types'
import { BrokerError } from '@shared/broker/broker-error'

// Structural shape of AlpacaClient used by this module.
// Matches the real AlpacaClient surface in src/main/services/alpaca.ts:
//   submitOrder(req: OrderRequest): Promise<OrderResult>
//   cancelOrder(id: string): Promise<void>
//   onTradeUpdate(fn: TradeUpdateHandler): () => void
interface AlpacaSubmitResult {
  id: string
  clientOrderId: string
  status: string
  filledQty: number
  filledAvgPrice: number | null
}

interface AlpacaClientShape {
  submitOrder(req: OrderRequest): Promise<AlpacaSubmitResult>
  cancelOrder(brokerOrderId: string): Promise<void>
  onTradeUpdate(fn: (u: AlpacaTradeUpdate) => void): Unsub
}

export class AlpacaOrderRouter implements OrderRouter {
  /**
   * In-flight brokerOrderId → cached OrderAck.
   * Used to:
   *  1. Resolve clientOrderId on trade-update events (AlpacaTradeUpdate has no
   *     clientOrderId field — we back-fill from the ack cache).
   *  2. Detect duplicate submits that echo back the same brokerOrderId, so we
   *     can return the cached ack without a second REST round-trip.
   *  3. Evict terminal events (FILL / CANCEL / REJECT / EXPIRE) to prevent
   *     unbounded growth.
   */
  private readonly inFlight = new Map<string, OrderAck>()

  constructor(private readonly client: AlpacaClientShape) {}

  async submit(req: OrderRequest & { clientOrderId?: string }): Promise<OrderAck> {
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

    // Deduplicate: if the broker echoes back the same brokerOrderId we already
    // have cached (e.g. from a prior call with the same request that was
    // already acknowledged), return the cached ack.
    const cached = this.inFlight.get(result.id)
    if (cached) return cached

    const ack: OrderAck = {
      brokerOrderId: result.id,
      clientOrderId: result.clientOrderId,
      acceptedAt:    Date.now(),
    }
    this.inFlight.set(result.id, ack)
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
      if (evt) {
        fn(evt)
        if (
          evt.execType === 'FILL' || evt.execType === 'CANCEL' ||
          evt.execType === 'REJECT' || evt.execType === 'EXPIRE'
        ) {
          this.inFlight.delete(evt.orderId)
        }
      }
    })
  }

  /**
   * Translates an AlpacaTradeUpdate to a unified OrderEvent.
   *
   * AlpacaTradeUpdate fields (real type, @shared/types.ts):
   *   event:     'fill' | 'partial_fill' | 'canceled' | 'rejected' | 'new' | 'expired'
   *   orderId:   string   (Alpaca order UUID)
   *   symbol:    string
   *   side:      'buy' | 'sell'
   *   quantity:  number   (total order qty)
   *   filledQty: number   (cumulative filled qty)
   *   price:     number   (fill price or filled_avg_price from Alpaca WS)
   *   timestamp: number   (ms since epoch)
   *
   * No clientOrderId in the raw update — resolved from the ack cache.
   */
  private translate(u: AlpacaTradeUpdate): OrderEvent | null {
    // Resolve clientOrderId from the in-flight cache if available.
    const cachedAck = this.inFlight.get(u.orderId)
    const clientOrderId = cachedAck?.clientOrderId ?? ''
    const base = { orderId: u.orderId, clientOrderId, timestamp: u.timestamp }

    switch (u.event) {
      case 'new':
        return { execType: 'ACK', ...base }
      case 'fill':
        return { execType: 'FILL', ...base, filled: u.filledQty, avgPrice: u.price }
      case 'partial_fill':
        return { execType: 'PARTIAL_FILL', ...base, filled: u.filledQty, price: u.price }
      case 'canceled':
        return { execType: 'CANCEL', ...base }
      case 'rejected':
        return { execType: 'REJECT', ...base, reason: 'broker rejected' }
      case 'expired':
        return { execType: 'EXPIRE', ...base }
      default:
        return null
    }
  }
}
