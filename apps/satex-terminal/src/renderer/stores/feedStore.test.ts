/**
 * SATEX — Feed status store characterization coverage.
 *
 * Pins the per-asset-class feed-status store: the pessimistic default shape
 * before the first FEED_STATUS_UPDATE push, and setStatus replace-by-reference.
 * The SIM badge on the WatchlistPanel gates off this store, so the default
 * (equity 'off' / futures 'synthetic' / crypto 'off') must not silently drift.
 *
 * Also pins — but does NOT fix — the observed shared-mutable-default aliasing:
 * the initial `status` is the module-level DEFAULT const by reference
 * (P-061/P-074 class). Flagged for operator taste (ledger), not edited here.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import type { FeedStatus } from '@shared/types'
import { useFeedStore } from './feedStore'

beforeEach(() => {
  useFeedStore.setState(useFeedStore.getInitialState(), true)
})

describe('feedStore — initial state', () => {
  it('seeds the pessimistic default (equity off / futures synthetic / crypto off)', () => {
    expect(useFeedStore.getState().status).toEqual({
      equity: 'off', futures: 'synthetic', crypto: 'off',
    })
  })
})

describe('feedStore — setStatus', () => {
  it('stores the exact object by reference', () => {
    const next: FeedStatus = { equity: 'live', futures: 'synthetic', crypto: 'live' }
    useFeedStore.getState().setStatus(next)
    expect(useFeedStore.getState().status).toBe(next)
  })

  it('a second setStatus replaces the previous', () => {
    const a: FeedStatus = { equity: 'live', futures: 'synthetic', crypto: 'off' }
    const b: FeedStatus = { equity: 'off', futures: 'live', crypto: 'live' }
    useFeedStore.getState().setStatus(a)
    useFeedStore.getState().setStatus(b)
    expect(useFeedStore.getState().status).toBe(b)
  })

  it('LATENT ALIASING (P-061/P-074): initial status is the shared module DEFAULT const', () => {
    // getInitialState().status returns the SAME reference every call (the module
    // `DEFAULT`). Pinned as observed behavior — a mutation would corrupt the
    // default — and flagged as a latent shared-mutable-default smell, NOT edited.
    const first = useFeedStore.getInitialState().status
    const second = useFeedStore.getInitialState().status
    expect(first).toBe(second)
  })
})
