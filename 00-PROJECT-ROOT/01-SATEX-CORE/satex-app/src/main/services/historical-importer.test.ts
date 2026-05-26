import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { HistoricalImporter } from './historical-importer'
import type { AlpacaClient } from './alpaca'
import type { Candle } from '@shared/types'

const BARS: Candle[] = [
  { time: 1747918800, open: 100, high: 101, low: 99,  close: 100.5, volume: 1_000 },
  { time: 1747918860, open: 100.5, high: 102, low: 100, close: 101.5, volume: 1_200 },
]

const CRYPTO_BARS: Candle[] = [
  { time: 1747918800, open: 50_000, high: 50_100, low: 49_900, close: 50_050, volume: 10 },
]

/** Minimal structural AlpacaClient stub — fetchDayBars touches isConfigured +
 *  getBars; fetchRecentCryptoBars touches isConfigured + getCryptoBars. */
function makeAlpaca(opts: {
  configured?: boolean
  getBars?: AlpacaClient['getBars']
  getCryptoBars?: AlpacaClient['getCryptoBars']
} = {}): AlpacaClient {
  return {
    isConfigured: opts.configured ?? true,
    getBars: opts.getBars ?? (async () => BARS),
    getCryptoBars: opts.getCryptoBars ?? (async () => CRYPTO_BARS),
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

describe('HistoricalImporter.fetchRecentCryptoBars — crypto off-hours backfill (2026-05-26)', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-05-26T18:00:00Z')) })
  afterEach(()  => { vi.useRealTimers() })

  it('returns ok:false when there is no Alpaca client', async () => {
    const r = await new HistoricalImporter(null).fetchRecentCryptoBars('BTC')
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/credential/i)
  })

  it('returns ok:false when the client is not configured', async () => {
    const r = await new HistoricalImporter(makeAlpaca({ configured: false })).fetchRecentCryptoBars('BTC')
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/credential/i)
  })

  it('queries getCryptoBars for a rolling 24h window ending now (default)', async () => {
    const getCryptoBars = vi.fn<AlpacaClient['getCryptoBars']>(async () => CRYPTO_BARS)
    const r = await new HistoricalImporter(makeAlpaca({ getCryptoBars })).fetchRecentCryptoBars('btc')
    expect(r.ok).toBe(true)
    expect(r.bars).toEqual(CRYPTO_BARS)
    // Symbol uppercased, 1Min default, last-24h window pegged to "now".
    expect(getCryptoBars).toHaveBeenCalledWith(
      'BTC', '1Min',
      '2026-05-25T18:00:00.000Z',
      '2026-05-26T18:00:00.000Z',
    )
  })

  it('honors an explicit hoursBack window', async () => {
    const getCryptoBars = vi.fn<AlpacaClient['getCryptoBars']>(async () => CRYPTO_BARS)
    await new HistoricalImporter(makeAlpaca({ getCryptoBars })).fetchRecentCryptoBars('BTC', '1Min', 6)
    expect(getCryptoBars).toHaveBeenCalledWith(
      'BTC', '1Min',
      '2026-05-26T12:00:00.000Z',
      '2026-05-26T18:00:00.000Z',
    )
  })

  it('rejects an unsupported timeframe without hitting the network', async () => {
    const getCryptoBars = vi.fn<AlpacaClient['getCryptoBars']>(async () => CRYPTO_BARS)
    const r = await new HistoricalImporter(makeAlpaca({ getCryptoBars }))
      .fetchRecentCryptoBars('BTC', '5Min' as unknown as '1Min')
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/Unsupported timeframe/)
    expect(getCryptoBars).not.toHaveBeenCalled()
  })

  it('surfaces a getCryptoBars failure as ok:false without throwing', async () => {
    const getCryptoBars = vi.fn<AlpacaClient['getCryptoBars']>(async () => { throw new Error('alpaca 429') })
    const r = await new HistoricalImporter(makeAlpaca({ getCryptoBars })).fetchRecentCryptoBars('BTC')
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/429/)
  })

  it('returns ok:true with an empty bars array when Alpaca has nothing in the window', async () => {
    const getCryptoBars = vi.fn<AlpacaClient['getCryptoBars']>(async () => [])
    const r = await new HistoricalImporter(makeAlpaca({ getCryptoBars })).fetchRecentCryptoBars('BTC')
    expect(r.ok).toBe(true)
    expect(r.bars).toEqual([])
  })
})
