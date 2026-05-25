import { describe, it, expect, vi } from 'vitest'
import { planLastSessionBackfill, type BackfillDeps } from './chart-backfill'
import type { Candle } from '@shared/types'

const BARS: Candle[] = [
  { time: 1747918800, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 },
]

function deps(over: Partial<BackfillDeps> = {}): BackfillDeps {
  return {
    symbol: 'NVDA',
    inReplay: false,
    isMarketOpen: () => false,
    mostRecentClosedSessionDate: () => '2026-05-22',
    getCredentialsMasked: async () => ({ paperConfigured: true }),
    fetchBars: async () => ({ ok: true, bars: BARS }),
    ...over,
  }
}

describe('planLastSessionBackfill — off-hours chart backfill (replay-free)', () => {
  it('skips when a replay is already active (never clobbers it)', async () => {
    const fetchBars = vi.fn(async () => ({ ok: true, bars: BARS }))
    const r = await planLastSessionBackfill(deps({ inReplay: true, fetchBars }))
    expect(r).toEqual({ action: 'skipped', reason: 'in-replay' })
    expect(fetchBars).not.toHaveBeenCalled()
  })

  it('skips during US market hours — live data is preferred', async () => {
    const fetchBars = vi.fn(async () => ({ ok: true, bars: BARS }))
    const r = await planLastSessionBackfill(deps({ isMarketOpen: () => true, fetchBars }))
    expect(r).toEqual({ action: 'skipped', reason: 'market-open' })
    expect(fetchBars).not.toHaveBeenCalled()
  })

  it('skips when no Alpaca credentials are saved', async () => {
    const fetchBars = vi.fn(async () => ({ ok: true, bars: BARS }))
    const r = await planLastSessionBackfill(deps({ getCredentialsMasked: async () => ({}), fetchBars }))
    expect(r).toEqual({ action: 'skipped', reason: 'no-creds' })
    expect(fetchBars).not.toHaveBeenCalled()
  })

  it('skips when getCredentialsMasked returns undefined', async () => {
    const r = await planLastSessionBackfill(deps({ getCredentialsMasked: async () => undefined }))
    expect(r).toEqual({ action: 'skipped', reason: 'no-creds' })
  })

  it('backfills the last completed session bars off-hours when creds exist', async () => {
    const fetchBars = vi.fn(async () => ({ ok: true, bars: BARS }))
    const r = await planLastSessionBackfill(deps({ fetchBars }))
    expect(r).toEqual({ action: 'backfilled', date: '2026-05-22', bars: BARS })
    // Fetches only the chart symbol, 1-minute bars, for the last session date.
    expect(fetchBars).toHaveBeenCalledWith({ symbol: 'NVDA', date: '2026-05-22', timeframe: '1Min' })
  })

  it('accepts live-only credentials too', async () => {
    const r = await planLastSessionBackfill(deps({ getCredentialsMasked: async () => ({ liveConfigured: true }) }))
    expect(r.action).toBe('backfilled')
  })

  it('reports no-bars when the fetch returns an empty list (closed day / too recent)', async () => {
    const r = await planLastSessionBackfill(deps({ fetchBars: async () => ({ ok: true, bars: [] }) }))
    expect(r.action).toBe('no-bars')
    if (r.action === 'no-bars') expect(r.date).toBe('2026-05-22')
  })

  it('reports no-bars (with reason) when the fetch fails', async () => {
    const r = await planLastSessionBackfill(deps({ fetchBars: async () => ({ ok: false, reason: 'alpaca 429' }) }))
    expect(r.action).toBe('no-bars')
    if (r.action === 'no-bars') expect(r.reason).toBe('alpaca 429')
  })
})
