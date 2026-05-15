/**
 * Standard Floor Pivot Points — daily reference levels.
 *
 *   PP = (H + L + C) / 3
 *   R1 = 2·PP − L     S1 = 2·PP − H
 *   R2 = PP + (H − L) S2 = PP − (H − L)
 *   R3 = H + 2·(PP − L)
 *   S3 = L − 2·(H − PP)
 *
 * Inputs are the PRIOR DAY's HLC — the spec mandates prior-day only, not
 * rolling intraday, to avoid stale-levels-during-the-day problem.
 */
import type { LevelsOutput, PriceLevel } from './types'

export interface PriorDay {
  high: number
  low: number
  close: number
}

export function computePivotPoints(prior: PriorDay): LevelsOutput {
  const { high: h, low: l, close: c } = prior
  const pp = (h + l + c) / 3
  const range = h - l

  const r1 = 2 * pp - l
  const s1 = 2 * pp - h
  const r2 = pp + range
  const s2 = pp - range
  const r3 = h + 2 * (pp - l)
  const s3 = l - 2 * (h - pp)

  const levels: PriceLevel[] = [
    { label: 'R3', price: r3, role: 'resistance' },
    { label: 'R2', price: r2, role: 'resistance' },
    { label: 'R1', price: r1, role: 'resistance' },
    { label: 'PP', price: pp, role: 'pivot' },
    { label: 'S1', price: s1, role: 'support' },
    { label: 'S2', price: s2, role: 'support' },
    { label: 'S3', price: s3, role: 'support' },
  ]
  return { computedFromIndex: 0, levels }
}

/** Convenience: derive prior-day HLC from a candle array by partitioning on
 *  UTC day boundary. Returns null if there's no completed prior day. */
export function priorDayFromCandles(
  candles: Array<{ high: number; low: number; close: number; time: number }>,
): PriorDay | null {
  if (candles.length === 0) return null
  const lastTime = candles[candles.length - 1]!.time
  // candle.time is epoch seconds per Candle type.
  const lastDayStart = Math.floor(lastTime / 86400) * 86400
  // Prior day window is [lastDayStart - 86400, lastDayStart).
  const priorStart = lastDayStart - 86400
  const priorEnd = lastDayStart
  let h = Number.NEGATIVE_INFINITY
  let l = Number.POSITIVE_INFINITY
  let c: number | null = null
  for (const candle of candles) {
    if (candle.time >= priorStart && candle.time < priorEnd) {
      if (candle.high > h) h = candle.high
      if (candle.low  < l) l = candle.low
      c = candle.close   // last candle wins → prior-day close
    }
  }
  if (c === null || !Number.isFinite(h) || !Number.isFinite(l)) return null
  return { high: h, low: l, close: c }
}
