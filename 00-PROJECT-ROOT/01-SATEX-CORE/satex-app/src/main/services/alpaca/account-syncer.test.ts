/**
 * Tests for AlpacaAccountSyncer (F.1 task B.2).
 *
 * Push-side tests (onUpdate) are intentionally omitted.
 *
 * AlpacaClient's account WebSocket subscribes only to `trade_updates` —
 * order-fill events delivered via `onTradeUpdate`. There is NO account-balance
 * push stream: Alpaca does not push equity/cash/buying-power changes over the
 * account WS. onUpdate therefore returns a no-op unsub and the push path
 * cannot be meaningfully tested against a real event source.
 */
import { describe, expect, it } from 'vitest'
import { AlpacaAccountSyncer } from './account-syncer'
import type { AccountSnapshot } from '@shared/broker/account-syncer'

/** Minimal AlpacaClient shape the syncer actually needs. */
function fakeClient(over?: Partial<{
  account: { equity: number; cash: number; buyingPower: number }
  positions: Array<{
    symbol: string
    qty: number
    avgEntryPrice: number
    marketValue: number
    unrealizedPl: number
    side: 'long' | 'short'
  }>
}>) {
  const account = over?.account ?? { equity: 100_000, cash: 50_000, buyingPower: 200_000 }
  const positions = over?.positions ?? []
  return {
    getAccount: async () => ({
      ...account,
      portfolioValue: account.equity,
      status: 'ACTIVE',
      patternDayTrader: false,
      tradingBlocked: false,
      accountBlocked: false,
      daytradeCount: 0,
    }),
    getPositions: async () => positions,
  }
}

describe('AlpacaAccountSyncer', () => {
  it('getSnapshot pulls fresh data via getAccount + getPositions', async () => {
    const client = fakeClient()
    const syncer = new AlpacaAccountSyncer(client as never)
    const snap: AccountSnapshot = await syncer.getSnapshot()
    expect(snap.equity).toBe(100_000)
    expect(snap.cash).toBe(50_000)
    expect(snap.buyingPower).toBe(200_000)
    expect(snap.positions).toEqual([])
    expect(typeof snap.observedAt).toBe('number')
  })

  it('observedAt is set at fetch time when broker omits server timestamp', async () => {
    const client = fakeClient()
    const syncer = new AlpacaAccountSyncer(client as never)
    const before = Date.now()
    const snap = await syncer.getSnapshot()
    const after = Date.now()
    expect(snap.observedAt).toBeGreaterThanOrEqual(before)
    expect(snap.observedAt).toBeLessThanOrEqual(after)
  })

  it('maps AlpacaPosition fields to shared Position shape', async () => {
    const client = fakeClient({
      positions: [
        { symbol: 'AAPL', qty: 10, avgEntryPrice: 150, marketValue: 1600, unrealizedPl: 100, side: 'long' },
      ],
    })
    const syncer = new AlpacaAccountSyncer(client as never)
    const snap = await syncer.getSnapshot()
    expect(snap.positions).toHaveLength(1)
    const pos = snap.positions[0]!
    expect(pos.symbol).toBe('AAPL')
    expect(pos.quantity).toBe(10)          // long → positive
    expect(pos.avgPrice).toBe(150)
    expect(pos.unrealizedPnl).toBe(100)
    expect(pos.realizedPnl).toBe(0)
    expect(typeof pos.openedAt).toBe('number')
  })

  it('short positions map to negative quantity', async () => {
    const client = fakeClient({
      positions: [
        { symbol: 'TSLA', qty: 5, avgEntryPrice: 200, marketValue: 950, unrealizedPl: -50, side: 'short' },
      ],
    })
    const syncer = new AlpacaAccountSyncer(client as never)
    const snap = await syncer.getSnapshot()
    const pos = snap.positions[0]!
    expect(pos.quantity).toBe(-5)          // short → negative
  })

  it('onUpdate returns a callable no-op unsub', () => {
    const client = fakeClient()
    const syncer = new AlpacaAccountSyncer(client as never)
    const unsub = syncer.onUpdate(() => { /* noop */ })
    expect(typeof unsub).toBe('function')
    expect(() => unsub()).not.toThrow()
  })
})
