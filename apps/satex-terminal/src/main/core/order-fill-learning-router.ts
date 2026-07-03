/**
 * SATEX — Order-Fill Learning Router (pure helper)
 *
 * Extracted from TradingEngine.onOrderFillForLearning so the position-flat
 * detection + entry-fallback resolution — the seam that decides whether an
 * OrderManager / simulator close ever reaches recordTradeClose — can be
 * unit-tested without instantiating the full engine.
 *
 * Mirrors the onOrderEvent → handleOrderEvent split (order-event-router.ts).
 * P-013 follow-up: Vault/Trades never populated in paper sessions. Pinning
 * this trigger isolates "no close ever flowed through recordTradeClose" (the
 * leading hypothesis) from "a close flowed but was not journaled" — the engine
 * already logs the latter via the `trade close not journaled` warn.
 */
import type { Order, Position } from '@shared/types'

/**
 * Dependencies handleOrderFillForLearning needs from the engine. TEntry is the
 * engine's EntryFeaturesValue at the call-site; the helper never reads its
 * fields (it only routes the value through to recordTradeClose), so it stays
 * fully generic and structurally compatible with the engine's own map.
 */
export interface FillLearningDeps<TEntry> {
  entryFeatures: Map<string, TEntry>
  findOpenEntryForSymbol: (symbol: string) => [string, TEntry] | null
  recordTradeClose: (args: {
    symbol: string
    quantity: number
    fillPrice: number
    entry: TEntry | null
    entryId: string | null
    order: Order
    source: 'order-manager'
  }) => void
}

/**
 * Handle one OrderManager fill for the learning loop. Mirrors the body of
 * TradingEngine.onOrderFillForLearning exactly; the engine delegates here.
 *
 * Only a SELL that flattens the position (no residual `position`) is a close.
 * Entry resolution prefers a direct entryFeatures hit on the order id, then
 * falls back to the oldest open entry on the symbol (covers closes of
 * Alpaca-synced positions opened without a paired entry). When neither
 * resolves, entry/entryId are null — recordTradeClose still fires so the
 * downstream `trade close not journaled` diagnostic (P-013) can see the skip.
 */
export function handleOrderFillForLearning<TEntry>(
  deps: FillLearningDeps<TEntry>,
  order: Order,
  position: Position | null,
): void {
  if (order.status !== 'filled') return
  const { side, symbol, quantity } = order.request
  // Position-flat detection: a sell that resulted in no residual position.
  if (side !== 'sell' || position) return

  const entry = deps.entryFeatures.get(order.id) ?? null
  // Some sell orders are opened directly without a paired entry (e.g. close of
  // an Alpaca-synced position). Walk back through entryFeatures looking for any
  // open entry on this symbol when there is no direct match.
  const fallbackPair = entry ? null : deps.findOpenEntryForSymbol(symbol)
  const entryId  = entry ? order.id : fallbackPair?.[0] ?? null
  const resolved = entry ?? (fallbackPair ? fallbackPair[1] : null)
  const fillPrice = order.fillPrice ?? 0

  deps.recordTradeClose({
    symbol, quantity, fillPrice,
    entry: resolved, entryId,
    order, source: 'order-manager',
  })
}
