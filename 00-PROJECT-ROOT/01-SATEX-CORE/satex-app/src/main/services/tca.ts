/**
 * SATEX — TransactionCostAnalyzer.
 *
 * Pure functions over ClosedTrade[]. No state, no I/O. Used by the
 * BacktestReport finalizer + the planned renderer-side TCA panel.
 *
 * Tier-2 Task E.8.
 */
import type { ClosedTrade } from '@shared/types'

export interface TcaBucket {
  trades: number
  avgBps: number
  medianBps: number
  /** Higher bps = worse fill. */
  worstBps: number
  /** Lowest bps = best fill. */
  bestBps: number
  /** Sum of entry slippage in dollar cost across the bucket. */
  totalDollarCost: number
}

export interface TcaReport {
  overall: TcaBucket
  bySymbol: Record<string, TcaBucket>
  /** UTC hour key (0..23). */
  byHourUtc: Record<number, TcaBucket>
  byDirection: { long: TcaBucket; short: TcaBucket }
  /** Trades with no entrySlippageBps stamped (e.g. simulator zero-slippage). */
  excluded: number
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}

function bucket(trades: ClosedTrade[]): TcaBucket {
  const bps: number[] = []
  let dollarCost = 0
  for (const t of trades) {
    if (typeof t.entrySlippageBps !== 'number') continue
    bps.push(t.entrySlippageBps)
    dollarCost += (t.entrySlippageBps / 10_000) * (t.entryPrice * t.quantity)
  }
  if (bps.length === 0) {
    return { trades: 0, avgBps: 0, medianBps: 0, worstBps: 0, bestBps: 0, totalDollarCost: 0 }
  }
  let sum = 0, worst = bps[0]!, best = bps[0]!
  for (const v of bps) {
    sum += v
    if (v > worst) worst = v
    if (v < best)  best  = v
  }
  return {
    trades: bps.length,
    avgBps: sum / bps.length,
    medianBps: median(bps),
    worstBps: worst,
    bestBps: best,
    totalDollarCost: dollarCost,
  }
}

export function analyzeTca(trades: ClosedTrade[]): TcaReport {
  const bySymbol: Record<string, ClosedTrade[]> = {}
  const byHour:   Record<number, ClosedTrade[]> = {}
  const longs:    ClosedTrade[] = []
  const shorts:   ClosedTrade[] = []
  let excluded = 0
  for (const t of trades) {
    if (typeof t.entrySlippageBps !== 'number') excluded++
    bySymbol[t.symbol] = bySymbol[t.symbol] ?? []
    bySymbol[t.symbol]!.push(t)
    const hr = new Date(t.closedAt).getUTCHours()
    byHour[hr] = byHour[hr] ?? []
    byHour[hr]!.push(t)
    if (t.side === 'long') longs.push(t); else shorts.push(t)
  }
  return {
    overall: bucket(trades),
    bySymbol: Object.fromEntries(Object.entries(bySymbol).map(([k, v]) => [k, bucket(v)])),
    byHourUtc: Object.fromEntries(Object.entries(byHour).map(([k, v]) => [+k, bucket(v)])),
    byDirection: { long: bucket(longs), short: bucket(shorts) },
    excluded,
  }
}
