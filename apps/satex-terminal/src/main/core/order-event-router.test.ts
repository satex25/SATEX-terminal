/**
 * Unit tests for handleOrderEvent (order-event-router.ts).
 *
 * F.1 L1.A follow-up — closes the test gap flagged in Task 2.1 review
 * (concern 3) and Task 2.3 review (FILL handler coverage).
 *
 * Covers:
 *   1. REJECT  → map cleanup, no om side-effects
 *   2. CANCEL  → map cleanup, no om side-effects
 *   3. EXPIRE  → map cleanup, no om side-effects
 *   4. FILL parent path (orderId in map) → om.fillOrder + slippage stamp + map delete
 *   5. FILL parent path — no entryFeatures entry → om.fillOrder still called, no crash
 *   6. FILL bracket-child path (sell) → recordTradeClose + syncBrokerAccount fired
 *   7. FILL bracket-child path (buy)  → early return; no recordTradeClose
 */
import { describe, it, expect, vi } from 'vitest'
import { handleOrderEvent } from './order-event-router'
import type { OrderEventDeps, EntryFeatureSlice } from './order-event-router'
import type { OrderEvent } from '@shared/broker/order-router'

// ── Minimal entry shape used in tests ────────────────────────────────────────

type TestEntry = EntryFeatureSlice & { symbol: string }

// ── Factory helpers ───────────────────────────────────────────────────────────

function makeDeps(overrides?: {
  brokerOrderIdToSatexId?: Map<string, string>
  entryFeatures?: Map<string, TestEntry>
  findOpenEntryForSymbol?: (s: string) => [string, TestEntry] | null
}): OrderEventDeps<TestEntry> & {
  fillOrderCalls:      Array<[string, number]>
  recordTradeCloseCalls: Array<{ symbol: string; quantity: number; fillPrice: number; entryId: string; source: string }>
  fireAndForgetLabels:   string[]
  syncBrokerAccountCalls: number
} {
  const fillOrderCalls:        Array<[string, number]> = []
  const recordTradeCloseCalls: Array<{ symbol: string; quantity: number; fillPrice: number; entryId: string; source: string }> = []
  const fireAndForgetLabels:   string[] = []
  let syncBrokerAccountCalls = 0

  const deps = {
    om: {
      fillOrder: (id: string, price: number) => { fillOrderCalls.push([id, price]) },
    },
    brokerOrderIdToSatexId: overrides?.brokerOrderIdToSatexId ?? new Map<string, string>(),
    entryFeatures: overrides?.entryFeatures ?? new Map<string, TestEntry>(),
    findOpenEntryForSymbol: overrides?.findOpenEntryForSymbol ?? ((_s) => null),
    recordTradeClose: (args: { symbol: string; quantity: number; fillPrice: number; entry: TestEntry; entryId: string; source: 'alpaca-bracket' }) => {
      recordTradeCloseCalls.push({ symbol: args.symbol, quantity: args.quantity, fillPrice: args.fillPrice, entryId: args.entryId, source: args.source })
    },
    fireAndForget: (label: string, op: () => Promise<void>) => {
      fireAndForgetLabels.push(label)
      // Execute the promise so syncBrokerAccount spy can be triggered.
      op().catch(() => { /* intentionally ignored in tests */ })
    },
    syncBrokerAccount: async () => { syncBrokerAccountCalls++ },
    // Expose captured calls for assertions
    fillOrderCalls,
    recordTradeCloseCalls,
    fireAndForgetLabels,
    get syncBrokerAccountCalls() { return syncBrokerAccountCalls },
  }
  return deps
}

function makeRejectEvent(orderId = 'broker-001'): OrderEvent {
  return { execType: 'REJECT', orderId, clientOrderId: 'cid-001', reason: 'InsufficientFunds', timestamp: 1 }
}
function makeCancelEvent(orderId = 'broker-001'): OrderEvent {
  return { execType: 'CANCEL', orderId, clientOrderId: 'cid-001', timestamp: 1 }
}
function makeExpireEvent(orderId = 'broker-001'): OrderEvent {
  return { execType: 'EXPIRE', orderId, clientOrderId: 'cid-001', timestamp: 1 }
}
function makeFillEvent(overrides: Partial<Extract<OrderEvent, { execType: 'FILL' }>> = {}): OrderEvent {
  return {
    execType: 'FILL',
    orderId: 'broker-001',
    clientOrderId: 'cid-001',
    filled: 10,
    avgPrice: 150.0,
    timestamp: 1,
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('handleOrderEvent', () => {

  // ── 1. REJECT ───────────────────────────────────────────────────────────────
  describe('REJECT event', () => {
    it('deletes the broker→satex map entry', () => {
      const map = new Map<string, string>([['broker-001', 'satex-001']])
      const deps = makeDeps({ brokerOrderIdToSatexId: map })
      handleOrderEvent(deps, makeRejectEvent('broker-001'))
      expect(map.has('broker-001')).toBe(false)
    })

    it('does not call om.fillOrder', () => {
      const map = new Map<string, string>([['broker-001', 'satex-001']])
      const deps = makeDeps({ brokerOrderIdToSatexId: map })
      handleOrderEvent(deps, makeRejectEvent('broker-001'))
      expect(deps.fillOrderCalls).toHaveLength(0)
    })

    it('does not call recordTradeClose', () => {
      const map = new Map<string, string>([['broker-001', 'satex-001']])
      const deps = makeDeps({ brokerOrderIdToSatexId: map })
      handleOrderEvent(deps, makeRejectEvent('broker-001'))
      expect(deps.recordTradeCloseCalls).toHaveLength(0)
    })
  })

  // ── 2. CANCEL ───────────────────────────────────────────────────────────────
  describe('CANCEL event', () => {
    it('deletes the broker→satex map entry', () => {
      const map = new Map<string, string>([['broker-001', 'satex-001']])
      const deps = makeDeps({ brokerOrderIdToSatexId: map })
      handleOrderEvent(deps, makeCancelEvent('broker-001'))
      expect(map.has('broker-001')).toBe(false)
    })

    it('does not call om.fillOrder', () => {
      const map = new Map<string, string>([['broker-001', 'satex-001']])
      const deps = makeDeps({ brokerOrderIdToSatexId: map })
      handleOrderEvent(deps, makeCancelEvent('broker-001'))
      expect(deps.fillOrderCalls).toHaveLength(0)
    })

    it('does not call recordTradeClose', () => {
      const map = new Map<string, string>([['broker-001', 'satex-001']])
      const deps = makeDeps({ brokerOrderIdToSatexId: map })
      handleOrderEvent(deps, makeCancelEvent('broker-001'))
      expect(deps.recordTradeCloseCalls).toHaveLength(0)
    })
  })

  // ── 3. EXPIRE ───────────────────────────────────────────────────────────────
  describe('EXPIRE event', () => {
    it('deletes the broker→satex map entry', () => {
      const map = new Map<string, string>([['broker-001', 'satex-001']])
      const deps = makeDeps({ brokerOrderIdToSatexId: map })
      handleOrderEvent(deps, makeExpireEvent('broker-001'))
      expect(map.has('broker-001')).toBe(false)
    })

    it('does not call om.fillOrder', () => {
      const map = new Map<string, string>([['broker-001', 'satex-001']])
      const deps = makeDeps({ brokerOrderIdToSatexId: map })
      handleOrderEvent(deps, makeExpireEvent('broker-001'))
      expect(deps.fillOrderCalls).toHaveLength(0)
    })

    it('does not call recordTradeClose', () => {
      const map = new Map<string, string>([['broker-001', 'satex-001']])
      const deps = makeDeps({ brokerOrderIdToSatexId: map })
      handleOrderEvent(deps, makeExpireEvent('broker-001'))
      expect(deps.recordTradeCloseCalls).toHaveLength(0)
    })
  })

  // ── 4. FILL parent path (orderId IS in map) ──────────────────────────────────
  describe('FILL parent path — orderId in broker→satex map', () => {
    it('calls om.fillOrder with the satex order id and avgPrice', () => {
      const map = new Map<string, string>([['broker-001', 'satex-001']])
      const deps = makeDeps({ brokerOrderIdToSatexId: map })
      handleOrderEvent(deps, makeFillEvent({ orderId: 'broker-001', avgPrice: 155.50 }))
      expect(deps.fillOrderCalls).toEqual([['satex-001', 155.50]])
    })

    it('removes the map entry (one-shot cleanup)', () => {
      const map = new Map<string, string>([['broker-001', 'satex-001']])
      const deps = makeDeps({ brokerOrderIdToSatexId: map })
      handleOrderEvent(deps, makeFillEvent({ orderId: 'broker-001' }))
      expect(map.has('broker-001')).toBe(false)
    })

    it('stamps entrySlippageBps when quoteAtSubmit > 0', () => {
      const ef = new Map<string, TestEntry>([
        ['satex-001', { symbol: 'AAPL', quoteAtSubmit: 150.0 }],
      ])
      const map = new Map<string, string>([['broker-001', 'satex-001']])
      const deps = makeDeps({ brokerOrderIdToSatexId: map, entryFeatures: ef })
      // Fill at 151.5 → slippage = (151.5 - 150) / 150 * 10_000 = 100 bps
      handleOrderEvent(deps, makeFillEvent({ orderId: 'broker-001', avgPrice: 151.5 }))
      expect(ef.get('satex-001')?.entrySlippageBps).toBeCloseTo(100, 5)
    })

    it('does NOT enter the bracket-child path (no recordTradeClose)', () => {
      const map = new Map<string, string>([['broker-001', 'satex-001']])
      const deps = makeDeps({ brokerOrderIdToSatexId: map })
      handleOrderEvent(deps, makeFillEvent({ orderId: 'broker-001', side: 'sell', symbol: 'AAPL' }))
      expect(deps.recordTradeCloseCalls).toHaveLength(0)
    })
  })

  // ── 5. FILL parent path — no entryFeatures entry ────────────────────────────
  describe('FILL parent path — no entryFeatures entry', () => {
    it('still calls om.fillOrder (slippage stamp is a no-op)', () => {
      const map = new Map<string, string>([['broker-001', 'satex-001']])
      // entryFeatures is empty — no entry for satex-001
      const deps = makeDeps({ brokerOrderIdToSatexId: map })
      handleOrderEvent(deps, makeFillEvent({ orderId: 'broker-001', avgPrice: 200.0 }))
      expect(deps.fillOrderCalls).toEqual([['satex-001', 200.0]])
    })

    it('still removes the map entry', () => {
      const map = new Map<string, string>([['broker-001', 'satex-001']])
      const deps = makeDeps({ brokerOrderIdToSatexId: map })
      handleOrderEvent(deps, makeFillEvent({ orderId: 'broker-001' }))
      expect(map.has('broker-001')).toBe(false)
    })
  })

  // ── 6. FILL bracket-child path (sell) ───────────────────────────────────────
  describe('FILL bracket-child path — sell side', () => {
    it('calls recordTradeClose with correct args', () => {
      const entry: TestEntry = { symbol: 'AAPL' }
      const deps = makeDeps({
        findOpenEntryForSymbol: (_s) => ['entry-001', entry],
      })
      handleOrderEvent(deps, makeFillEvent({
        orderId: 'broker-child-001',
        side: 'sell',
        symbol: 'AAPL',
        filled: 5,
        avgPrice: 160.0,
      }))
      expect(deps.recordTradeCloseCalls).toHaveLength(1)
      const call = deps.recordTradeCloseCalls[0]
      expect(call.symbol).toBe('AAPL')
      expect(call.quantity).toBe(5)
      expect(call.fillPrice).toBe(160.0)
      expect(call.entryId).toBe('entry-001')
      expect(call.source).toBe('alpaca-bracket')
    })

    it('fires syncBrokerAccount via fireAndForget', async () => {
      const entry: TestEntry = { symbol: 'AAPL' }
      const deps = makeDeps({
        findOpenEntryForSymbol: (_s) => ['entry-001', entry],
      })
      handleOrderEvent(deps, makeFillEvent({
        orderId: 'broker-child-001',
        side: 'sell',
        symbol: 'AAPL',
      }))
      expect(deps.fireAndForgetLabels).toContain('syncBrokerAccount')
      // Allow the micro-task to settle so the syncBrokerAccount counter increments.
      await Promise.resolve()
      expect(deps.syncBrokerAccountCalls).toBe(1)
    })

    it('does not call om.fillOrder', () => {
      const entry: TestEntry = { symbol: 'AAPL' }
      const deps = makeDeps({
        findOpenEntryForSymbol: (_s) => ['entry-001', entry],
      })
      handleOrderEvent(deps, makeFillEvent({ orderId: 'broker-child-001', side: 'sell', symbol: 'AAPL' }))
      expect(deps.fillOrderCalls).toHaveLength(0)
    })
  })

  // ── 7. FILL bracket-child path (buy) — early return ─────────────────────────
  describe('FILL bracket-child path — buy side (not a close)', () => {
    it('returns without calling recordTradeClose', () => {
      const recordFn = vi.fn()
      const deps = makeDeps({
        findOpenEntryForSymbol: (_s) => ['entry-001', { symbol: 'AAPL' }],
      })
      // Replace recordTradeClose with a spy
      const spiedDeps = { ...deps, recordTradeClose: recordFn }
      handleOrderEvent(spiedDeps, makeFillEvent({
        orderId: 'broker-child-001',
        side: 'buy',
        symbol: 'AAPL',
      }))
      expect(recordFn).not.toHaveBeenCalled()
    })

    it('does not call om.fillOrder', () => {
      const deps = makeDeps()
      handleOrderEvent(deps, makeFillEvent({
        orderId: 'broker-child-001',
        side: 'buy',
        symbol: 'AAPL',
      }))
      expect(deps.fillOrderCalls).toHaveLength(0)
    })
  })
})
