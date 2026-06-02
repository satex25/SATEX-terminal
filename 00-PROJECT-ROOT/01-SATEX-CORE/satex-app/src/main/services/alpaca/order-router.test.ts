import { describe, expect, it } from 'vitest'
import { AlpacaOrderRouter } from './order-router'
import type { OrderEvent } from '@shared/broker/order-router'
import type { OrderRequest, AlpacaTradeUpdate } from '@shared/types'
import { BrokerError } from '@shared/broker/broker-error'

function fakeClient() {
  const submitted: Array<OrderRequest & { clientOrderId?: string }> = []
  let nextResult: { id: string; clientOrderId: string; status: string; filledQty: number; filledAvgPrice: number | null } | Error
    = { id: 'broker-abc', clientOrderId: 'client-1', status: 'accepted', filledQty: 0, filledAvgPrice: null }
  let tradeUpdateListener: ((u: AlpacaTradeUpdate) => void) | null = null
  return {
    submitted,
    setNextResult: (r: typeof nextResult) => { nextResult = r },
    submitOrder: async (req: OrderRequest & { clientOrderId?: string }) => {
      submitted.push(req)
      if (nextResult instanceof Error) throw nextResult
      // Echo back the caller-supplied clientOrderId if present (mirrors real Alpaca behaviour).
      return req.clientOrderId !== undefined && !(nextResult instanceof Error)
        ? { ...nextResult, clientOrderId: req.clientOrderId }
        : nextResult
    },
    cancelOrder: async (_id: string) => { /* no-op */ },
    onTradeUpdate: (fn: (u: AlpacaTradeUpdate) => void) => {
      tradeUpdateListener = fn
      return () => { tradeUpdateListener = null }
    },
    pushTradeUpdate: (u: AlpacaTradeUpdate) => {
      if (tradeUpdateListener) tradeUpdateListener(u)
    },
  }
}

function buyReq(clientOrderId = 'client-1'): OrderRequest & { clientOrderId: string } {
  return { symbol: 'AAPL', side: 'buy', type: 'market', quantity: 1, clientOrderId }
}

function tu(event: AlpacaTradeUpdate['event'], orderId: string, opts: Partial<AlpacaTradeUpdate> = {}): AlpacaTradeUpdate {
  return {
    event, orderId, symbol: 'AAPL', side: 'buy',
    quantity: 1, filledQty: 0, price: 0, timestamp: Date.now(),
    ...opts,
  }
}

describe('AlpacaOrderRouter', () => {
  it('submit returns OrderAck with caller-supplied clientOrderId', async () => {
    const c = fakeClient()
    const r = new AlpacaOrderRouter(c as never)
    const ack = await r.submit(buyReq('client-XYZ'))
    expect(ack.brokerOrderId).toBe('broker-abc')
    expect(ack.clientOrderId).toBe('client-XYZ')
    expect(typeof ack.acceptedAt).toBe('number')
  })

  it('submit passes clientOrderId through to AlpacaClient', async () => {
    const c = fakeClient()
    const r = new AlpacaOrderRouter(c as never)
    await r.submit(buyReq('client-pass-through'))
    expect(c.submitted[0]!.clientOrderId).toBe('client-pass-through')
  })

  it('submit throws BrokerError on broker rejection', async () => {
    const c = fakeClient()
    c.setNextResult(new Error('Insufficient buying power'))
    const r = new AlpacaOrderRouter(c as never)
    await expect(r.submit(buyReq())).rejects.toThrow(BrokerError)
  })

  it('duplicate clientOrderId deduplicates BEFORE the REST call', async () => {
    const c = fakeClient()
    const r = new AlpacaOrderRouter(c as never)
    const ack1 = await r.submit(buyReq('client-dedup'))
    const ack2 = await r.submit(buyReq('client-dedup'))
    expect(c.submitted).toHaveLength(1)                   // wire-level dedup
    expect(ack2.brokerOrderId).toBe(ack1.brokerOrderId)
    expect(ack2.clientOrderId).toBe('client-dedup')
  })

  it('onUpdate translates fill events with clientOrderId from cache', async () => {
    const c = fakeClient()
    const r = new AlpacaOrderRouter(c as never)
    const events: OrderEvent[] = []
    r.onUpdate(e => events.push(e))
    await r.submit(buyReq('client-fill'))
    c.pushTradeUpdate(tu('fill', 'broker-abc', { filledQty: 1, price: 150.25 }))
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      execType: 'FILL', orderId: 'broker-abc', clientOrderId: 'client-fill',
    })
    const fill = events[0] as Extract<OrderEvent, { execType: 'FILL' }>
    expect(fill.filled).toBe(1)
    expect(fill.avgPrice).toBe(150.25)
  })

  it('onUpdate translates partial_fill / canceled / rejected / expired', async () => {
    const c = fakeClient()
    const r = new AlpacaOrderRouter(c as never)
    const events: OrderEvent[] = []
    r.onUpdate(e => events.push(e))
    await r.submit(buyReq('c'))
    c.pushTradeUpdate(tu('partial_fill', 'broker-abc', { filledQty: 0.5, price: 150 }))
    c.pushTradeUpdate(tu('canceled',     'broker-abc'))
    c.pushTradeUpdate(tu('rejected',     'broker-abc'))
    c.pushTradeUpdate(tu('expired',      'broker-abc'))
    expect(events.map(e => e.execType)).toEqual(['PARTIAL_FILL', 'CANCEL', 'REJECT', 'EXPIRE'])
  })

  it('onUpdate translates new event to ACK', async () => {
    const c = fakeClient()
    const r = new AlpacaOrderRouter(c as never)
    const events: OrderEvent[] = []
    r.onUpdate(e => events.push(e))
    await r.submit(buyReq('c'))
    c.pushTradeUpdate(tu('new', 'broker-abc'))
    expect(events).toHaveLength(1)
    expect(events[0]!.execType).toBe('ACK')
  })

  it('onUpdate ignores unknown event types', () => {
    const c = fakeClient()
    const r = new AlpacaOrderRouter(c as never)
    const events: OrderEvent[] = []
    r.onUpdate(e => events.push(e))
    c.pushTradeUpdate(tu('pending_new' as never, 'broker-abc'))
    expect(events).toHaveLength(0)
  })

  it('cancel delegates to AlpacaClient.cancelOrder', async () => {
    const c = fakeClient()
    let cancelArg: string | null = null
    ;(c as { cancelOrder: (id: string) => Promise<void> }).cancelOrder = async (id) => { cancelArg = id }
    const r = new AlpacaOrderRouter(c as never)
    await r.cancel('broker-abc')
    expect(cancelArg).toBe('broker-abc')
  })

  it('terminal events evict the in-flight + brokerToClient entries', async () => {
    const c = fakeClient()
    const r = new AlpacaOrderRouter(c as never)
    r.onUpdate(() => { /* eviction side-effect only */ })
    await r.submit(buyReq('client-evict'))
    c.pushTradeUpdate(tu('fill', 'broker-abc', { filledQty: 1, price: 150 }))

    // After eviction, a fresh submit with the SAME clientOrderId hits the wire again
    // (because the cache was cleared on the terminal event).
    c.setNextResult({ id: 'broker-new', clientOrderId: 'client-evict', status: 'accepted', filledQty: 0, filledAvgPrice: null })
    const ack2 = await r.submit(buyReq('client-evict'))
    expect(c.submitted).toHaveLength(2)
    expect(ack2.brokerOrderId).toBe('broker-new')
  })
})
