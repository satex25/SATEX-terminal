/**
 * subsecondStore contract tests (P-051).
 *
 * Pins the renderer-side sub-second candle ring: hydration slicing to the
 * 1 200-bar cap, appendBar's three branches (append / same-openMs re-seal
 * replace / out-of-order drop), head-trim on overflow, per-(symbol,bucketMs)
 * series isolation, the hydratePrefs {250|500} sanitizer that guards the UI
 * against contract drift, and getPref's explicit-null-when-unconfigured
 * contract (the auto-snap heuristic depends on it). Store source is
 * byte-for-byte unchanged by this test.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useSubsecondStore, type PreferredBucketMs } from './subsecondStore'
import type { SubSecondCandle } from '@shared/types'

const MAX = 1_200 // mirrors MAX_BARS_PER_SERIES in the store

function makeBar(symbol: string, bucketMs: number, openMs: number, close = 1): SubSecondCandle {
  return { symbol, bucketMs, openMs, open: close, high: close, low: close, close, volume: 10 }
}

function makeBars(symbol: string, bucketMs: number, count: number, startMs = 0): SubSecondCandle[] {
  return Array.from({ length: count }, (_, i) => makeBar(symbol, bucketMs, startMs + i * bucketMs))
}

beforeEach(() => {
  useSubsecondStore.setState({ series: new Map(), prefs: {} })
})

describe('subsecondStore.hydrate / getBars', () => {
  it('stores bars keyed by (symbol, bucketMs) and returns them via getBars', () => {
    const bars = makeBars('BTC', 250, 3)
    useSubsecondStore.getState().hydrate('BTC', 250, bars)
    expect(useSubsecondStore.getState().getBars('BTC', 250)).toEqual(bars)
  })

  it('slices hydration input to the most recent 1200 bars', () => {
    const bars = makeBars('BTC', 250, MAX + 50)
    useSubsecondStore.getState().hydrate('BTC', 250, bars)
    const kept = useSubsecondStore.getState().getBars('BTC', 250)
    expect(kept).toHaveLength(MAX)
    expect(kept[0]!.openMs).toBe(bars[50]!.openMs) // head dropped, tail kept
    expect(kept[kept.length - 1]!.openMs).toBe(bars[bars.length - 1]!.openMs)
  })

  it('returns an empty array for a series that was never hydrated', () => {
    expect(useSubsecondStore.getState().getBars('ETH', 250)).toEqual([])
  })

  it('keeps series isolated per (symbol, bucketMs) pair', () => {
    useSubsecondStore.getState().hydrate('BTC', 250, makeBars('BTC', 250, 2))
    useSubsecondStore.getState().hydrate('BTC', 500, makeBars('BTC', 500, 5))
    expect(useSubsecondStore.getState().getBars('BTC', 250)).toHaveLength(2)
    expect(useSubsecondStore.getState().getBars('BTC', 500)).toHaveLength(5)
  })
})

describe('subsecondStore.appendBar', () => {
  it('appends a bar with a new openMs', () => {
    useSubsecondStore.getState().hydrate('BTC', 250, makeBars('BTC', 250, 2))
    useSubsecondStore.getState().appendBar(makeBar('BTC', 250, 2 * 250))
    expect(useSubsecondStore.getState().getBars('BTC', 250)).toHaveLength(3)
  })

  it('replaces the tail in place on a same-openMs re-seal (no duplicate row)', () => {
    useSubsecondStore.getState().hydrate('BTC', 250, [makeBar('BTC', 250, 0, 100)])
    useSubsecondStore.getState().appendBar(makeBar('BTC', 250, 0, 105))
    const bars = useSubsecondStore.getState().getBars('BTC', 250)
    expect(bars).toHaveLength(1)
    expect(bars[0]!.close).toBe(105) // corrected bar won, no duplicate
  })

  it('drops an out-of-order push (older openMs than the tail)', () => {
    const seeded = [makeBar('BTC', 250, 250), makeBar('BTC', 250, 500)]
    useSubsecondStore.getState().hydrate('BTC', 250, seeded)
    useSubsecondStore.getState().appendBar(makeBar('BTC', 250, 0))
    expect(useSubsecondStore.getState().getBars('BTC', 250)).toEqual(seeded)
  })

  it('trims the head when an append exceeds the 1200-bar cap', () => {
    useSubsecondStore.getState().hydrate('BTC', 250, makeBars('BTC', 250, MAX))
    const next = makeBar('BTC', 250, MAX * 250)
    useSubsecondStore.getState().appendBar(next)
    const bars = useSubsecondStore.getState().getBars('BTC', 250)
    expect(bars).toHaveLength(MAX)
    expect(bars[0]!.openMs).toBe(250) // oldest (openMs 0) dropped from the head
    expect(bars[bars.length - 1]!.openMs).toBe(next.openMs)
  })

  it('starts a fresh series when appending to an unknown key', () => {
    useSubsecondStore.getState().appendBar(makeBar('SOL', 500, 0))
    expect(useSubsecondStore.getState().getBars('SOL', 500)).toHaveLength(1)
  })
})

describe('subsecondStore.hydratePrefs / getPref', () => {
  it('keeps only the {250, 500} literal-union values (sanitizer)', () => {
    const dirty = { BTC: 250, ETH: 500, SOL: 100, DOGE: 999 } as unknown as Record<string, PreferredBucketMs>
    useSubsecondStore.getState().hydratePrefs(dirty)
    expect(useSubsecondStore.getState().prefs).toEqual({ BTC: 250, ETH: 500 })
  })

  it('wholesale-replaces the prefs mirror on each hydrate', () => {
    useSubsecondStore.getState().hydratePrefs({ BTC: 250 })
    useSubsecondStore.getState().hydratePrefs({ ETH: 500 })
    expect(useSubsecondStore.getState().prefs).toEqual({ ETH: 500 })
  })

  it('getPref returns null for an unconfigured symbol, the value once set', () => {
    expect(useSubsecondStore.getState().getPref('BTC')).toBeNull()
    useSubsecondStore.getState().hydratePrefs({ BTC: 500 })
    expect(useSubsecondStore.getState().getPref('BTC')).toBe(500)
  })
})
