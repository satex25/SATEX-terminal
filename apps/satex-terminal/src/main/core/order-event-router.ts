/**
 * SATEX — Order-Event Router (pure helper)
 *
 * Extracted from TradingEngine.onOrderEvent so the three-path handler
 * (REJECT/CANCEL/EXPIRE cleanup → parent FILL → bracket-child FILL) can be
 * unit-tested without instantiating the full engine.
 *
 * F.1 L1.A follow-up — test gap flagged in Task 2.1 review (concern 3) and
 * Task 2.3 review (FILL handler coverage).
 */
import type { OrderEvent } from '@shared/broker/order-router'
import { createLogger } from '../services/logger'

const log = createLogger('order-event-router')

/**
 * Minimal shape of an entry-features record that the router needs to read/
 * write.  The full EntryFeaturesValue in trading-engine.ts has many more
 * fields (brain features, tactics, etc.) — none of which this handler
 * touches.  Structural compatibility means TradingEngine can pass its own
 * map directly.
 */
export interface EntryFeatureSlice {
  quoteAtSubmit?: number
  entrySlippageBps?: number | null
}

export interface OrderEventDeps<TEntry extends EntryFeatureSlice> {
  om: { fillOrder: (id: string, price: number) => void }
  brokerOrderIdToSatexId: Map<string, string>
  entryFeatures: Map<string, TEntry>
  findOpenEntryForSymbol: (symbol: string) => [string, TEntry] | null
  recordTradeClose: (args: {
    symbol: string
    quantity: number
    fillPrice: number
    entry: TEntry
    entryId: string
    source: 'alpaca-bracket'
  }) => void
  fireAndForget: (label: string, op: () => Promise<void>) => void
  syncBrokerAccount: () => Promise<void>
}

/**
 * Handle a single OrderEvent.  Mirrors the body of
 * TradingEngine.onOrderEvent exactly; TradingEngine delegates to this
 * function so the logic can be tested without the full engine context.
 */
export function handleOrderEvent<TEntry extends EntryFeatureSlice>(
  deps: OrderEventDeps<TEntry>,
  e: OrderEvent,
): void {
  // Terminal events that aren't FILL: clean up the broker→satex map so
  // long-running sessions don't accumulate stale entries (e.g., orders
  // that were ACK'd but later rejected/canceled never enter the FILL path).
  if (e.execType === 'REJECT' || e.execType === 'CANCEL' || e.execType === 'EXPIRE') {
    deps.brokerOrderIdToSatexId.delete(e.orderId)
    return
  }
  if (e.execType !== 'FILL') return  // Ignore ACK / PARTIAL_FILL

  // ── Parent-order path (F.1 L1.A 2.3) ──────────────────────────────────
  // The engine registered this mapping at submit time. If it's here, this
  // FILL belongs to an order the engine submitted, not a bracket child.
  const satexOrderId = deps.brokerOrderIdToSatexId.get(e.orderId)
  if (satexOrderId !== undefined) {
    deps.brokerOrderIdToSatexId.delete(e.orderId)  // one-shot; clean up immediately
    deps.om.fillOrder(satexOrderId, e.avgPrice)
    // S1-6: slippage capture — moved here from the synchronous submitOrder
    // return path (L1.A 2.3). entryFeatures is only set for buy orders, so
    // this is a no-op for any future sell-entry orders.
    const ef = deps.entryFeatures.get(satexOrderId)
    if (ef && ef.quoteAtSubmit != null && ef.quoteAtSubmit > 0) {
      ef.entrySlippageBps = (e.avgPrice - ef.quoteAtSubmit) / ef.quoteAtSubmit * 10_000
    }
    log.info('parent order filled', { brokerOrderId: e.orderId, satexOrderId, avgPrice: e.avgPrice })
    return
  }

  // ── Bracket-child path (F.1 L1.A 2.1) ─────────────────────────────────
  // For now we only learn from sell-fills that close a position we opened.
  // Buy-fills (covering shorts) would mirror — out of scope until shorts.
  if (e.side !== 'sell') return
  const symbol = e.symbol
  if (!symbol) return  // No symbol — cannot route to entry; should not occur for Alpaca fills.
  const found = deps.findOpenEntryForSymbol(symbol)
  if (!found) {
    log.debug('alpaca bracket fill: no matching entry', { symbol, orderId: e.orderId })
    return
  }
  const [entryId, entry] = found
  deps.recordTradeClose({
    symbol,
    quantity: e.filled,
    fillPrice: e.avgPrice,
    entry,
    entryId,
    source: 'alpaca-bracket',
  })
  // Refresh account snapshot so equity reflects the fill immediately
  // rather than waiting on the next 15s sync.
  deps.fireAndForget('syncBrokerAccount', () => deps.syncBrokerAccount())
}
