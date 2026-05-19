/**
 * SATEX — feed-status pure-function tests (B3, v0.4.3).
 *
 * Pins the per-asset-class SIM-badge decision logic. The WatchlistPanel
 * delegates to `isSyntheticFeed(symbol, feedStatus)`; everything visible to
 * the user about live-vs-synthetic data flows through this one helper, so it
 * gets exhaustive case coverage here. No jsdom / RTL required — pure
 * function over typed inputs.
 */
import { describe, it, expect } from 'vitest'
import { isSyntheticFeed } from './feed-status'
import type { FeedStatus } from '@shared/types'

const ALL_LIVE: FeedStatus = { equity: 'live', futures: 'live', crypto: 'live' }
const EQUITY_OFF: FeedStatus = { equity: 'off', futures: 'synthetic', crypto: 'live' }
const SIM_MODE: FeedStatus  = { equity: 'simulator', futures: 'synthetic', crypto: 'off' }
const FUTURES_SYNTH: FeedStatus = { equity: 'live', futures: 'synthetic', crypto: 'live' }
const CRYPTO_OFF: FeedStatus = { equity: 'live', futures: 'live', crypto: 'off' }

describe('isSyntheticFeed — equity / index ETF rows', () => {
  it('NVDA (equity) is NOT synthetic when feed.equity === live', () => {
    expect(isSyntheticFeed('NVDA', ALL_LIVE)).toBe(false)
  })
  it('NVDA (equity) IS synthetic when feed.equity === off', () => {
    expect(isSyntheticFeed('NVDA', EQUITY_OFF)).toBe(true)
  })
  it('NVDA (equity) IS synthetic in simulator mode (no broker feed at all)', () => {
    expect(isSyntheticFeed('NVDA', SIM_MODE)).toBe(true)
  })
  it('SPY (index ETF) follows the equity feed status (it is index-class, treated identically)', () => {
    expect(isSyntheticFeed('SPY', ALL_LIVE)).toBe(false)
    expect(isSyntheticFeed('SPY', EQUITY_OFF)).toBe(true)
  })
})

describe('isSyntheticFeed — futures rows', () => {
  it('ES is synthetic when feed.futures === "synthetic" (current build state)', () => {
    // Today the engine's computeFeedStatus always reports futures: 'synthetic'
    // because the IEX data feed carries no futures. FUTURES_SYNTH is the
    // realistic FeedStatus a v0.4.x renderer would see.
    expect(isSyntheticFeed('ES', FUTURES_SYNTH)).toBe(true)
  })
  it('NQ / CL / GC are all flagged when feed.futures === "synthetic"', () => {
    expect(isSyntheticFeed('NQ', FUTURES_SYNTH)).toBe(true)
    expect(isSyntheticFeed('CL', FUTURES_SYNTH)).toBe(true)
    expect(isSyntheticFeed('GC', FUTURES_SYNTH)).toBe(true)
  })
  it('forward-compat: when feed.futures becomes "live", the badge disappears', () => {
    // ALL_LIVE has futures: 'live' — exercises the future code path where
    // a CME-bridged feed lands and futures move out of synthetic mode.
    expect(isSyntheticFeed('ES', ALL_LIVE)).toBe(false)
    expect(isSyntheticFeed('NQ', ALL_LIVE)).toBe(false)
  })
})

describe('isSyntheticFeed — crypto rows', () => {
  it('BTC is NOT synthetic when feed.crypto === live', () => {
    expect(isSyntheticFeed('BTC', ALL_LIVE)).toBe(false)
  })
  it('BTC IS synthetic when crypto feed is off', () => {
    expect(isSyntheticFeed('BTC', CRYPTO_OFF)).toBe(true)
  })
  it('ETH follows the same rule', () => {
    expect(isSyntheticFeed('ETH', ALL_LIVE)).toBe(false)
    expect(isSyntheticFeed('ETH', CRYPTO_OFF)).toBe(true)
  })
})

describe('isSyntheticFeed — unknown symbols', () => {
  it('returns false for symbols not in UNIVERSE (do not over-warn)', () => {
    // No assetClass available → cannot classify → don't flag. This is the
    // safer default: false positives are worse than missing one badge on a
    // symbol the engine isn't tracking anyway.
    expect(isSyntheticFeed('FAKESYMBOL', ALL_LIVE)).toBe(false)
    expect(isSyntheticFeed('XYZQ', SIM_MODE)).toBe(false)
  })
  it('returns false for empty string (defensive)', () => {
    expect(isSyntheticFeed('', ALL_LIVE)).toBe(false)
  })
})
