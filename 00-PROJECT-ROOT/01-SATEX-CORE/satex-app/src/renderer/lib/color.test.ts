/**
 * SATEX — color.ts unit tests.
 *
 * Pins `applyOpacity()`, the single hex→rgba helper shared by the single chart
 * and the Quad panes (extracted from ChartPanel 2026-05-25). It is a pure
 * display helper off the trading-safety perimeter, but it renders on every
 * chart overlay, so its three behaviors are worth locking: (1) 6-digit hex →
 * rgba, (2) 3-digit shorthand expansion (#abc → #aabbcc), and (3) pass-through
 * of any non-hex string (rgba(...), named colors, CSS vars) so callers can hand
 * it an already-resolved color untouched. Alpha is always emitted via
 * `.toFixed(2)`, so these cases also pin the two-decimal alpha format.
 */
import { describe, it, expect } from 'vitest'
import { applyOpacity } from './color'

describe('applyOpacity — 6-digit hex', () => {
  it('converts primaries to rgba with two-decimal alpha', () => {
    expect(applyOpacity('#ff0000', 0.5)).toBe('rgba(255,0,0,0.50)')
    expect(applyOpacity('#00ff00', 0.5)).toBe('rgba(0,255,0,0.50)')
    expect(applyOpacity('#0000ff', 0.5)).toBe('rgba(0,0,255,0.50)')
  })
  it('parses mixed channel values', () => {
    // 0a=10, 14=20, 1e=30 — a SATEX-style dark background color
    expect(applyOpacity('#0a141e', 1)).toBe('rgba(10,20,30,1.00)')
    expect(applyOpacity('#808080', 0.5)).toBe('rgba(128,128,128,0.50)')
  })
  it('is case-insensitive on the hex digits', () => {
    expect(applyOpacity('#FFFFFF', 0.5)).toBe('rgba(255,255,255,0.50)')
    expect(applyOpacity('#FfAa00', 0.5)).toBe('rgba(255,170,0,0.50)')
  })
})

describe('applyOpacity — 3-digit shorthand', () => {
  it('expands each nibble before parsing (#abc → #aabbcc)', () => {
    expect(applyOpacity('#abc', 1)).toBe('rgba(170,187,204,1.00)')
  })
  it('handles the achromatic shorthands', () => {
    expect(applyOpacity('#fff', 0.25)).toBe('rgba(255,255,255,0.25)')
    expect(applyOpacity('#000', 0.8)).toBe('rgba(0,0,0,0.80)')
  })
})

describe('applyOpacity — non-hex pass-through', () => {
  it('returns rgba(...) inputs unchanged', () => {
    expect(applyOpacity('rgba(1,2,3,0.4)', 0.9)).toBe('rgba(1,2,3,0.4)')
  })
  it('returns named colors and CSS vars unchanged', () => {
    expect(applyOpacity('red', 0.5)).toBe('red')
    expect(applyOpacity('transparent', 0.1)).toBe('transparent')
    expect(applyOpacity('var(--bb-accent)', 0.5)).toBe('var(--bb-accent)')
  })
  it('returns the empty string unchanged', () => {
    expect(applyOpacity('', 0.5)).toBe('')
  })
})

describe('applyOpacity — alpha formatting', () => {
  it('always emits exactly two decimal places', () => {
    expect(applyOpacity('#000', 1)).toBe('rgba(0,0,0,1.00)')
    expect(applyOpacity('#000', 0)).toBe('rgba(0,0,0,0.00)')
    expect(applyOpacity('#000', 0.6)).toBe('rgba(0,0,0,0.60)')
  })
  it('rounds to two decimals', () => {
    expect(applyOpacity('#000', 0.123)).toBe('rgba(0,0,0,0.12)') // rounds down
    expect(applyOpacity('#000', 0.126)).toBe('rgba(0,0,0,0.13)') // rounds up
  })
})
