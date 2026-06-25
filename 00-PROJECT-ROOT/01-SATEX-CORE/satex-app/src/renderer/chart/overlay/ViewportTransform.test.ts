/**
 * SATEX — ViewportTransform unit tests (§3.1)
 *
 * Tests all pure math helpers. No DOM, no LWC, no mocks needed.
 */
import { describe, it, expect } from 'vitest'
import {
  lerp,
  decayVelocity,
  rubberBand,
  clamp,
  visibleBarsFromWidth,
  computeZoom,
} from './ViewportTransform'

describe('lerp', () => {
  it('returns a at t=0', () => expect(lerp(0, 100, 0)).toBe(0))
  it('returns b at t=1', () => expect(lerp(0, 100, 1)).toBe(100))
  it('returns midpoint at t=0.5', () => expect(lerp(0, 100, 0.5)).toBe(50))
  it('handles negative ranges', () => expect(lerp(-50, 50, 0.5)).toBe(0))
})

describe('decayVelocity', () => {
  it('decays by factor', () => expect(decayVelocity(10, 0.92)).toBeCloseTo(9.2))
  it('snaps to 0 when below threshold', () => {
    expect(decayVelocity(0.005, 0.92)).toBe(0)
    expect(decayVelocity(-0.005, 0.92)).toBe(0)
  })
  it('preserves sign', () => expect(decayVelocity(-10, 0.92)).toBeCloseTo(-9.2))
})

describe('rubberBand', () => {
  it('returns full delta at resistance=1', () => expect(rubberBand(100, 1)).toBe(100))
  it('returns zero at resistance=0', () => expect(rubberBand(100, 0)).toBe(0))
  it('returns half at resistance=0.5', () => expect(rubberBand(100, 0.5)).toBe(50))
  it('handles negative delta', () => expect(rubberBand(-80, 0.3)).toBeCloseTo(-24))
})

describe('clamp', () => {
  it('returns value when in range', () => expect(clamp(5, 0, 10)).toBe(5))
  it('clamps to min', () => expect(clamp(-1, 0, 10)).toBe(0))
  it('clamps to max', () => expect(clamp(11, 0, 10)).toBe(10))
  it('works with equal bounds', () => expect(clamp(5, 5, 5)).toBe(5))
})

describe('visibleBarsFromWidth', () => {
  it('computes bar count from pixel width', () => {
    expect(visibleBarsFromWidth(1000, 10)).toBe(100)
  })
  it('returns 0 for zero bar width', () => {
    expect(visibleBarsFromWidth(1000, 0)).toBe(0)
  })
  it('floors fractional result', () => {
    expect(visibleBarsFromWidth(103, 10)).toBe(10)
  })
})

describe('computeZoom', () => {
  it('zooms in (negative deltaY reduces bars)', () => {
    const { newBars } = computeZoom(200, -100, 0.5, 50, 500)
    expect(newBars).toBeLessThan(200)
    expect(newBars).toBeGreaterThanOrEqual(50)
  })

  it('zooms out (positive deltaY increases bars)', () => {
    const { newBars } = computeZoom(200, 100, 0.5, 50, 500)
    expect(newBars).toBeGreaterThan(200)
    expect(newBars).toBeLessThanOrEqual(500)
  })

  it('clamps to minBars', () => {
    const { newBars } = computeZoom(55, -100000, 0.5, 50, 500)
    expect(newBars).toBe(50)
  })

  it('clamps to maxBars', () => {
    const { newBars } = computeZoom(490, 100000, 0.5, 50, 500)
    expect(newBars).toBe(500)
  })

  it('anchorOffset is positive when zooming in from cursor left of center', () => {
    const { anchorOffset } = computeZoom(200, -100, 0.2, 50, 500)
    expect(anchorOffset).toBeGreaterThan(0)
  })

  it('anchorOffset is negative when zooming out', () => {
    const { anchorOffset } = computeZoom(200, 100, 0.5, 50, 500)
    expect(anchorOffset).toBeLessThan(0)
  })
})
