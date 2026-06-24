/**
 * SATEX — Funded-account pre-trade checks.
 * Pure functions called by OrderManager gates 11 (max-contracts) and 13
 * (allowed-asset-class). No state, no I/O.
 *
 * Tier-1 Task D.5.
 */
import type { AssetClass, OrderSide } from '@shared/types'
import type { FundedAccountProfile } from './types'

export interface MaxContractsCheckResult {
  ok: boolean
  cap: number
  /** Absolute size of the position AFTER this order would execute. */
  resultingAbs: number
}

/** True iff the proposed order keeps the absolute resulting position size
 *  at or below the symbol's contract cap (or the profile's default cap when
 *  the symbol isn't in the map).
 *
 *  `currentPositionQty` is signed: positive = long, negative = short.
 *  Order side determines whether qty adds to or subtracts from the
 *  signed position. The gate then checks `abs(resulting) <= cap`. */
export function checkMaxContracts(
  symbol: string,
  side: OrderSide,
  qty: number,
  currentPositionQty: number,
  profile: FundedAccountProfile,
): MaxContractsCheckResult {
  const cap = profile.maxContracts[symbol] ?? profile.defaultMaxContracts
  const signedDelta = side === 'buy' ? qty : -qty
  const resulting = currentPositionQty + signedDelta
  const resultingAbs = Math.abs(resulting)
  return { ok: resultingAbs <= cap, cap, resultingAbs }
}

/** True iff the asset class is in the profile's allowedAssetClasses list. */
export function checkAllowedAssetClass(
  assetClass: AssetClass,
  profile: FundedAccountProfile,
): boolean {
  return profile.allowedAssetClasses.includes(assetClass)
}
