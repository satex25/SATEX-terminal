import type { Position } from '@shared/types'

/**
 * Result returned by checkBracketHit when a bracket level has been crossed.
 *
 *   level     — which bracket leg fired ('stopLoss' | 'takeProfit').
 *   closeSide — the order side needed to flatten the position
 *               ('sell' for longs, 'buy' for shorts).
 *   price     — the exact bracket price to fill at (never worse than
 *               the bracket level, because we synthesise the fill).
 */
export interface BracketHitResult {
  level:     'stopLoss' | 'takeProfit'
  closeSide: 'buy' | 'sell'
  price:     number
}

/**
 * Pure, side-effect-free bracket check.
 *
 * Called on every incoming quote in simulator mode to decide whether a
 * position's stop-loss or take-profit level has been crossed at the given
 * price.  Returns null when no action is required.
 *
 * Rules:
 *  - Long  (quantity > 0): SL = price ≤ stopLoss;  TP = price ≥ takeProfit.
 *  - Short (quantity < 0): SL = price ≥ stopLoss;  TP = price ≤ takeProfit.
 *  - If both levels are hit simultaneously (gap), stopLoss takes priority
 *    (worst-case outcome, conservative simulation).
 *  - Returns null when quantity is zero, or neither bracket level is set
 *    and no level is crossed.
 */
export function checkBracketHit(
  position: Position,
  currentPrice: number,
): BracketHitResult | null {
  const { quantity, stopLoss, takeProfit } = position
  if (quantity === 0) return null

  const isLong = quantity > 0
  const closeSide: 'buy' | 'sell' = isLong ? 'sell' : 'buy'

  const slHit = stopLoss !== undefined && (
    isLong ? currentPrice <= stopLoss : currentPrice >= stopLoss
  )
  const tpHit = takeProfit !== undefined && (
    isLong ? currentPrice >= takeProfit : currentPrice <= takeProfit
  )

  // Stop-loss takes priority over take-profit on simultaneous cross.
  if (slHit) return { level: 'stopLoss', closeSide, price: stopLoss! }
  if (tpHit) return { level: 'takeProfit', closeSide, price: takeProfit! }
  return null
}
