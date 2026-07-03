/**
 * Unit tests for handleOrderFillForLearning (order-fill-learning-router.ts).
 *
 * P-013 follow-up — pins the OrderManager / simulator close trigger, the
 * sibling of handleOrderEvent's bracket-child path. This is the seam that
 * decides whether a paper-session close ever reaches recordTradeClose; the
 * Vault/Trades journal depends on it firing with a resolvable entry.
 *
 * Covers:
 *   1. status !== 'filled'              → no recordTradeClose
 *   2. buy fill                         → no recordTradeClose (an open, not a close)
 *   3. sell fill with residual position → no recordTradeClose (not flat yet)
 *   4. sell + flat + direct entry hit   → recordTradeClose(entry=direct, entryId=order.id)
 *   5. sell + flat + fallback entry     → recordTradeClose(entry=fallback, entryId=fallback id)
 *   6. sell + flat + no entry at all    → recordTradeClose(entry=null, entryId=null) [P-013 skip path]
 *   7. fillPrice undefined              → forwarded as 0
 *   8. direct hit short-circuits the fallback walk (findOpenEntryForSymbol not consulted)
 */
import { describe, it, expect } from 'vitest'
import { handleOrderFillForLearning } from './order-fill-learning-router'
import type { FillLearningDeps } from './order-fill-learning-router'
import type { Order, OrderRequest, Position } from '@shared/types'

// ── Minimal entry shape used in tests ────────────────────────────────────────

type TestEntry = { symbol: string }

interface RecordedClose {
  symbol: string
  quantity: number
  fillPrice: number
  entry: TestEntry | null
  entryId: string | null
  source: string
}

// ── Factory helpers ───────────────────────────────────────────────────────────

function makeDeps(overrides?: {
  entryFeatures?: Map<string, TestEntry>
  findOpenEntryForSymbol?: (s: string) => [string, TestEntry] | null
}): FillLearningDeps<TestEntry> & {
  recordTradeCloseCalls: RecordedClose[]
  findOpenEntryForSymbolCalls: string[]
} {
  const recordTradeCloseCalls: RecordedClose[] = []
  const findOpenEntryForSymbolCalls: string[] = []
  const findFn = overrides?.findOpenEntryForSymbol ?? ((_s: string) => null)

  const deps = {
    entryFeatures: overrides?.entryFeatures ?? new Map<string, TestEntry>(),
    findOpenEntryForSymbol: (s: string): [string, TestEntry] | null => {
      findOpenEntryForSymbolCalls.push(s)
      return findFn(s)
    },
    recordTradeClose: (args: {
      symbol: string
      quantity: number
      fillPrice: number
      entry: TestEntry | null
      entryId: string | null
      order: Order
      source: 'order-manager'
    }) => {
      recordTradeCloseCalls.push({
        symbol: args.symbol,
        quantity: args.quantity,
        fillPrice: args.fillPrice,
        entry: args.entry,
        entryId: args.entryId,
        source: args.source,
      })
    },
    recordTradeCloseCalls,
    findOpenEntryForSymbolCalls,
  }
  return deps
}

function makeOrder(overrides: Partial<Omit<Order, 'request'>> & { request?: Partial<OrderRequest> } = {}): Order {
  const { request: reqOverrides, ...rest } = overrides
  const request: OrderRequest = {
    symbol: 'AAPL',
    side: 'sell',
    type: 'market',
    quantity: 10,
    source: 'ticket',
    ...reqOverrides,
  }
  return {
    id: 'order-001',
    traceId: 'trace-001',
    createdAt: 1,
    filledAt: 2,
    status: 'filled',
    fillPrice: 150,
    request,
    ...rest,
  }
}

const FLAT: Position | null = null

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('handleOrderFillForLearning', () => {

  // ── 1. status guard ───────────────────────────────────────────────────────
  describe('non-filled order', () => {
    it('does not call recordTradeClose for a pending sell', () => {
      const deps = makeDeps()
      handleOrderFillForLearning(deps, makeOrder({ status: 'pending' }), FLAT)
      expect(deps.recordTradeCloseCalls).toHaveLength(0)
    })
  })

  // ── 2. buy side (an open, not a close) ────────────────────────────────────
  describe('buy fill', () => {
    it('does not call recordTradeClose even when flat', () => {
      const deps = makeDeps()
      handleOrderFillForLearning(deps, makeOrder({ request: { side: 'buy' } }), FLAT)
      expect(deps.recordTradeCloseCalls).toHaveLength(0)
    })
  })

  // ── 3. sell with residual position (not flat yet) ─────────────────────────
  describe('sell fill that leaves a residual position', () => {
    it('does not call recordTradeClose', () => {
      const residual: Position = {
        symbol: 'AAPL', quantity: 5, avgPrice: 150,
        unrealizedPnl: 0, realizedPnl: 0, openedAt: 1,
      }
      const deps = makeDeps()
      handleOrderFillForLearning(deps, makeOrder({ request: { side: 'sell' } }), residual)
      expect(deps.recordTradeCloseCalls).toHaveLength(0)
    })
  })

  // ── 4. sell + flat + direct entry hit ─────────────────────────────────────
  describe('sell fill that flattens — direct entry hit', () => {
    it('calls recordTradeClose with the direct entry and order id', () => {
      const entry: TestEntry = { symbol: 'AAPL' }
      const ef = new Map<string, TestEntry>([['order-001', entry]])
      const deps = makeDeps({ entryFeatures: ef })
      handleOrderFillForLearning(
        deps,
        makeOrder({ id: 'order-001', fillPrice: 160, request: { symbol: 'AAPL', side: 'sell', quantity: 7 } }),
        FLAT,
      )
      expect(deps.recordTradeCloseCalls).toHaveLength(1)
      const call = deps.recordTradeCloseCalls[0]
      expect(call.symbol).toBe('AAPL')
      expect(call.quantity).toBe(7)
      expect(call.fillPrice).toBe(160)
      expect(call.entry).toBe(entry)
      expect(call.entryId).toBe('order-001')
      expect(call.source).toBe('order-manager')
    })
  })

  // ── 5. sell + flat + fallback entry ───────────────────────────────────────
  describe('sell fill that flattens — no direct hit, fallback resolves', () => {
    it('calls recordTradeClose with the fallback entry and its id', () => {
      const fallbackEntry: TestEntry = { symbol: 'AAPL' }
      const deps = makeDeps({
        // entryFeatures has no key for this order id → forces the fallback walk
        findOpenEntryForSymbol: (_s) => ['entry-xyz', fallbackEntry],
      })
      handleOrderFillForLearning(
        deps,
        makeOrder({ id: 'order-unpaired', request: { symbol: 'AAPL', side: 'sell' } }),
        FLAT,
      )
      expect(deps.recordTradeCloseCalls).toHaveLength(1)
      const call = deps.recordTradeCloseCalls[0]
      expect(call.entry).toBe(fallbackEntry)
      expect(call.entryId).toBe('entry-xyz')
      expect(deps.findOpenEntryForSymbolCalls).toEqual(['AAPL'])
    })
  })

  // ── 6. sell + flat + no entry anywhere (the P-013 skip path) ──────────────
  describe('sell fill that flattens — no entry resolvable', () => {
    it('still fires recordTradeClose with null entry/entryId', () => {
      const deps = makeDeps() // empty map + findOpenEntryForSymbol → null
      handleOrderFillForLearning(deps, makeOrder({ id: 'order-orphan', request: { side: 'sell' } }), FLAT)
      expect(deps.recordTradeCloseCalls).toHaveLength(1)
      const call = deps.recordTradeCloseCalls[0]
      expect(call.entry).toBeNull()
      expect(call.entryId).toBeNull()
      expect(call.source).toBe('order-manager')
    })
  })

  // ── 7. fillPrice undefined → 0 ────────────────────────────────────────────
  describe('missing fill price', () => {
    it('forwards fillPrice as 0', () => {
      const entry: TestEntry = { symbol: 'AAPL' }
      const ef = new Map<string, TestEntry>([['order-001', entry]])
      const deps = makeDeps({ entryFeatures: ef })
      const order = makeOrder({ id: 'order-001' })
      delete (order as { fillPrice?: number }).fillPrice
      handleOrderFillForLearning(deps, order, FLAT)
      expect(deps.recordTradeCloseCalls[0].fillPrice).toBe(0)
    })
  })

  // ── 8. direct hit short-circuits the fallback walk ────────────────────────
  describe('direct hit precedence', () => {
    it('does not consult findOpenEntryForSymbol when a direct entry exists', () => {
      const entry: TestEntry = { symbol: 'AAPL' }
      const ef = new Map<string, TestEntry>([['order-001', entry]])
      const deps = makeDeps({
        entryFeatures: ef,
        findOpenEntryForSymbol: (_s) => ['should-not-be-used', { symbol: 'AAPL' }],
      })
      handleOrderFillForLearning(deps, makeOrder({ id: 'order-001' }), FLAT)
      expect(deps.recordTradeCloseCalls[0].entryId).toBe('order-001')
      expect(deps.findOpenEntryForSymbolCalls).toHaveLength(0)
    })
  })
})
