import { describe, it, expect } from 'vitest'
import { seriesExtent } from './extent'

describe('seriesExtent', () => {
  it('returns the identity extent for an empty array', () => {
    expect(seriesExtent([])).toEqual({ min: Infinity, max: -Infinity })
  })

  it('computes min and max for a normal series', () => {
    expect(seriesExtent([3, 1, 4, 1, 5, 9, 2, 6])).toEqual({ min: 1, max: 9 })
  })

  it('handles negative and zero-crossing values (e.g. CL crude)', () => {
    expect(seriesExtent([-37.63, -10, 0, 12.5])).toEqual({ min: -37.63, max: 12.5 })
  })

  it('handles a single element', () => {
    expect(seriesExtent([42])).toEqual({ min: 42, max: 42 })
  })

  it('does not throw on a 300k-element array (no Math.min(...spread) stack overflow)', () => {
    // PnL snapshots are uncapped at 1/min; a long session exceeds the spread
    // arg limit. 300k mirrors the vol-heatmap.test.ts over-cap convention (P-027).
    const big = Array.from({ length: 300_000 }, (_, i) => i % 1000)
    expect(() => seriesExtent(big)).not.toThrow()
    expect(seriesExtent(big)).toEqual({ min: 0, max: 999 })
  })
})
