/**
 * SATEX — block print detector unit tests (CHART-20)
 * Pure: no DOM, no network.
 */
import { describe, it, expect } from 'vitest'
import { detectBlockPrints, blockPrintThreshold } from './block-prints'
import type { Tradeprint } from './block-prints'

function t(size: number, i = 0): Tradeprint {
  return { time: 1000 + i * 60, price: 100, size, side: 'buy' }
}

const SMALL = Array.from({ length: 200 }, (_, i) => t(10, i))
const GIANT: Tradeprint = { time: 1000 + 200 * 60, price: 100, size: 10000, side: 'sell' }

describe('detectBlockPrints', () => {
  it('returns [] for empty input', () => {
    expect(detectBlockPrints([])).toEqual([])
  })

  it('returns [] for fewer than 2 trades', () => {
    expect(detectBlockPrints([t(100)])).toEqual([])
  })

  it('returns [] when all trades are small', () => {
    expect(detectBlockPrints(SMALL)).toHaveLength(0)
  })

  it('detects a giant trade among small ones', () => {
    expect(detectBlockPrints([...SMALL, GIANT], { multiplier: 3 }).length).toBeGreaterThan(0)
  })

  it('all results have label "(block proxy)"', () => {
    for (const bp of detectBlockPrints([...SMALL, GIANT], { multiplier: 3 })) {
      expect(bp.label).toBe('(block proxy)')
    }
  })

  it('sizeRatio is >= multiplier for all detections', () => {
    const multiplier = 3
    for (const bp of detectBlockPrints([...SMALL, GIANT], { multiplier })) {
      expect(bp.sizeRatio).toBeGreaterThanOrEqual(multiplier)
    }
  })

  it('respects minSize threshold', () => {
    const trades = [...SMALL, { time: 9999, price: 100, size: 50, side: 'buy' as const }]
    for (const bp of detectBlockPrints(trades, { minSize: 100, multiplier: 1 })) {
      expect(bp.size).toBeGreaterThanOrEqual(100)
    }
  })

  it('preserves trade time and price', () => {
    const result = detectBlockPrints([...SMALL, GIANT], { multiplier: 3 })
    if (result.length > 0) {
      expect(result[result.length - 1]!.time).toBe(GIANT.time)
      expect(result[result.length - 1]!.price).toBe(GIANT.price)
    }
  })
})

describe('blockPrintThreshold', () => {
  it('returns 0 for empty input', () => {
    expect(blockPrintThreshold([])).toBe(0)
  })

  it('returns multiplier * median of sizes', () => {
    // sizes [10..19], median = (14+15)/2 = 14.5 → threshold = 14.5 * 5 = 72.5
    const trades = Array.from({ length: 10 }, (_, i) => t(10 + i, i))
    expect(blockPrintThreshold(trades, { multiplier: 5 })).toBeCloseTo(72.5, 5)
  })
})
