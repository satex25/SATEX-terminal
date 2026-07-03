/**
 * SATEX — rail-layout.ts tests (fully-collapsible side rails, 2026-07-02).
 *
 * Pins the track-sizing contract collapse UI depends on:
 *   - nothing collapsed → every track keeps its natural size, byte-for-byte
 *     identical to the plain CSS default (railTemplateIsDefault === true).
 *   - collapsing a track that has an already-flexible sibling → the sibling
 *     silently absorbs the freed space; no promotion needed.
 *   - collapsing the ONLY flexible track → the last non-collapsed track is
 *     promoted to the flex sink so there is never a dead gutter.
 *   - collapsing everything → all handles, no promotion (nothing to feed).
 */
import { describe, it, expect } from 'vitest'
import { computeRailTemplate, railTemplateIsDefault, RAIL_HANDLE_SIZE, type RailTrackSpec } from './rail-layout'

// Mirrors .bb-col-right: depth(288px, fixed) / regime(268px, fixed) / exec(flex).
const RIGHT_STACK: RailTrackSpec[] = [
  { id: 'depth', expandedSize: '288px', flex: false },
  { id: 'regime', expandedSize: '268px', flex: false },
  { id: 'exec', expandedSize: 'minmax(0, 1fr)', flex: true },
]

// Mirrors .bb-secondary-row: portfolio(fixed, never collapsible) / catalysts
// (flex) / risk (flex) / logs (fixed) / health (fixed).
const SECONDARY_ROW: RailTrackSpec[] = [
  { id: 'portfolio', expandedSize: '224px', flex: false },
  { id: 'news', expandedSize: 'minmax(0, 1fr)', flex: true },
  { id: 'risk', expandedSize: 'minmax(0, 1fr)', flex: true },
  { id: 'logs', expandedSize: '340px', flex: false },
  { id: 'health', expandedSize: '320px', flex: false },
]

describe('computeRailTemplate — nothing collapsed', () => {
  it('every track keeps its natural size (fixed stays fixed, flex stays flex)', () => {
    expect(computeRailTemplate(RIGHT_STACK, new Set())).toEqual(['288px', '268px', 'minmax(0, 1fr)'])
    expect(computeRailTemplate(SECONDARY_ROW, new Set())).toEqual([
      '224px', 'minmax(0, 1fr)', 'minmax(0, 1fr)', '340px', '320px',
    ])
  })

  it('railTemplateIsDefault is true — callers can skip the inline style entirely', () => {
    expect(railTemplateIsDefault(RIGHT_STACK, new Set())).toBe(true)
    expect(railTemplateIsDefault(SECONDARY_ROW, new Set())).toBe(true)
  })
})

describe('computeRailTemplate — collapsing a fixed track with a flexible sibling', () => {
  it('depth collapses to a handle; exec (already flex) needs no promotion', () => {
    const result = computeRailTemplate(RIGHT_STACK, new Set(['depth']))
    expect(result).toEqual([RAIL_HANDLE_SIZE, '268px', 'minmax(0, 1fr)'])
  })

  it('both fixed tracks collapse; the natural flex track still absorbs everything', () => {
    const result = computeRailTemplate(RIGHT_STACK, new Set(['depth', 'regime']))
    expect(result).toEqual([RAIL_HANDLE_SIZE, RAIL_HANDLE_SIZE, 'minmax(0, 1fr)'])
  })

  it('logs + health collapse in the secondary row; catalysts/risk keep sharing the rest', () => {
    const result = computeRailTemplate(SECONDARY_ROW, new Set(['logs', 'health']))
    expect(result).toEqual(['224px', 'minmax(0, 1fr)', 'minmax(0, 1fr)', RAIL_HANDLE_SIZE, RAIL_HANDLE_SIZE])
  })

  it('railTemplateIsDefault is false once anything is collapsed', () => {
    expect(railTemplateIsDefault(RIGHT_STACK, new Set(['depth']))).toBe(false)
  })
})

describe('computeRailTemplate — collapsing the only flexible track promotes a sink', () => {
  it('exec collapses → regime (last non-collapsed) is promoted to flex', () => {
    const result = computeRailTemplate(RIGHT_STACK, new Set(['exec']))
    expect(result).toEqual(['288px', 'minmax(0, 1fr)', RAIL_HANDLE_SIZE])
  })

  it('exec AND regime collapse → depth (the only one left) is promoted', () => {
    const result = computeRailTemplate(RIGHT_STACK, new Set(['exec', 'regime']))
    expect(result).toEqual(['minmax(0, 1fr)', RAIL_HANDLE_SIZE, RAIL_HANDLE_SIZE])
  })

  it('news AND risk collapse → health (the last non-collapsed track) is promoted, not the non-collapsible portfolio slot', () => {
    const result = computeRailTemplate(SECONDARY_ROW, new Set(['news', 'risk']))
    expect(result).toEqual(['224px', RAIL_HANDLE_SIZE, RAIL_HANDLE_SIZE, '340px', 'minmax(0, 1fr)'])
  })

  it('news, risk, AND health collapse → logs (the last remaining) is promoted', () => {
    const result = computeRailTemplate(SECONDARY_ROW, new Set(['news', 'risk', 'health']))
    expect(result).toEqual(['224px', RAIL_HANDLE_SIZE, RAIL_HANDLE_SIZE, 'minmax(0, 1fr)', RAIL_HANDLE_SIZE])
  })
})

describe('computeRailTemplate — degenerate inputs', () => {
  it('collapsing every track yields all handles, no promotion attempted (nothing to feed)', () => {
    const result = computeRailTemplate(RIGHT_STACK, new Set(['depth', 'regime', 'exec']))
    expect(result).toEqual([RAIL_HANDLE_SIZE, RAIL_HANDLE_SIZE, RAIL_HANDLE_SIZE])
  })

  it('empty spec list returns an empty array without throwing', () => {
    expect(computeRailTemplate([], new Set(['whatever']))).toEqual([])
  })

  it('an id in `collapsed` that matches no spec is simply inert', () => {
    const result = computeRailTemplate(RIGHT_STACK, new Set(['not-a-real-rail']))
    expect(result).toEqual(['288px', '268px', 'minmax(0, 1fr)'])
  })
})
