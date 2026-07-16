import { describe, it, expect } from 'vitest'
import { Sparkline } from './Sparkline'

/**
 * P-108 regression — Sparkline must not spread an unbounded array into
 * `Math.min`/`Math.max`. It now routes through `seriesExtent` (single-pass),
 * the same hardening the rest of the render tree already carries
 * (extent.ts / vol-heatmap / QuadPaneChart, P-041/P-093 lineage).
 *
 * Sparkline is a pure, hook-free presentational component, so we invoke it
 * directly: the min/max computation runs during the call, which is exactly
 * where the `RangeError: Maximum call stack size exceeded` used to fire.
 */
describe('Sparkline — unbounded-array hardening (P-108)', () => {
  it('does not throw on a 300k-element series (no Math.min(...spread) overflow)', () => {
    // Mirrors extent.test.ts / vol-heatmap.test.ts over-cap convention: 300k
    // exceeds V8's argument-spread limit (~65k–125k).
    const big = Array.from({ length: 300_000 }, (_, i) => i % 1000)
    expect(() => Sparkline({ data: big })).not.toThrow()
  })

  it('still renders an <svg> element for a normal small series', () => {
    const el = Sparkline({ data: [1, 2, 3, 2, 4] })
    expect(el).toBeTruthy()
    expect((el as { type?: unknown }).type).toBe('svg')
  })

  it('returns an empty <svg> for fewer than two finite points', () => {
    const el = Sparkline({ data: [NaN, Infinity, 5] })
    expect((el as { type?: unknown }).type).toBe('svg')
  })
})
