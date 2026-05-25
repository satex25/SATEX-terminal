import { describe, it, expect, vi } from 'vitest'
import { HistoricalImporter } from './historical-importer'
import type { AlpacaClient } from './alpaca'
import type { Candle } from '@shared/types'

const BARS: Candle[] = [
  { time: 1747918800, open: 100, high: 101, low: 99,  close: 100.5, volume: 1_000 },
  { time: 1747918860, open: 100.5, high: 102, low: 100, close: 101.5, volume: 1_200 },
]

/** Minimal structural AlpacaClient stub — fetchDayBars only touches
 *  `isConfigured` and `getBars`. */
function makeAlpaca(opts: {
  configured?: boolean
  getBars?: AlpacaClient['getBars']
} = {}): AlpacaClient {
  return {
    isConfigured: opts.configured ?? true,
    getBars: opts.getBars ?? (async () => BARS),
  } as unknown as AlpacaClient
}

describe('HistoricalImporter.fetchDayBars — replay-free chart backfill', () => {
  it('returns ok:false when there is no Alpaca client', async () => {
    const r = await new HistoricalImporter(null).fetchDayBars('NVDA', '2026-05-22')
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/credential/i)
  })

  it('returns ok:false when the client is not configured', async () => {
    const r = await new HistoricalImporter(makeAlpaca({ configured: false })).fetchDayBars('NVDA', '2026-05-22')
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/credential/i)
  })

  it('rejects a malformed date', async () => {
    const r = await new HistoricalImporter(makeAlpaca()).fetchDayBars('NVDA', 'not-a-date')
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/YYYY-MM-DD/i)
  })

  it('rejects a weekend date (no US-stock data)', async () => {
    // 2026-05-23 is a Saturday.
    const r = await new HistoricalImporter(makeAlpaca()).fetchDayBars('NVDA', '2026-05-23')
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/weekend/i)
  })

  it('rejects a future date', async () => {
    const r = await new HistoricalImporter(makeAlpaca()).fetchDayBars('NVDA', '2099-01-02')
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/future/i)
  })

  it('returns the bars for a valid past weekday and queries the RTH window', async () => {
    // 2026-05-22 is a Friday.
    const getBars = vi.fn<AlpacaClient['getBars']>(async () => BARS)
    const r = await new HistoricalImporter(makeAlpaca({ getBars })).fetchDayBars('nvda', '2026-05-22')
    expect(r.ok).toBe(true)
    expect(r.bars).toEqual(BARS)
    // Symbol upper-cased; default timeframe 1Min; session window in UTC.
    expect(getBars).toHaveBeenCalledWith('NVDA', '1Min', '2026-05-22T13:00:00Z', '2026-05-22T21:30:00Z')
  })

  it('surfaces a getBars failure as ok:false without throwing', async () => {
    const getBars = vi.fn<AlpacaClient['getBars']>(async () => { throw new Error('alpaca 429') })
    const r = await new HistoricalImporter(makeAlpaca({ getBars })).fetchDayBars('NVDA', '2026-05-22')
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/429/)
  })
})
