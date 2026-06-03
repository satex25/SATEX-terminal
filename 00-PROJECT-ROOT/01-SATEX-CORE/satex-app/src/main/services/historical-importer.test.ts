import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { HistoricalImporter } from './historical-importer'
import type { MarketDataSource } from '@shared/broker/market-data-source'
import type { Candle } from '@shared/types'

const BARS: Candle[] = [
  { time: 1747918800, open: 100, high: 101, low: 99,  close: 100.5, volume: 1_000 },
  { time: 1747918860, open: 100.5, high: 102, low: 100, close: 101.5, volume: 1_200 },
]

const CRYPTO_BARS: Candle[] = [
  { time: 1747918800, open: 50_000, high: 50_100, low: 49_900, close: 50_050, volume: 10 },
]

/** Minimal structural MarketDataSource stub — fetchDayBars touches getBars;
 *  fetchRecentCryptoBars touches getCryptoBars. */
function makeDataSource(opts: {
  getBars?: MarketDataSource['getBars']
  getCryptoBars?: MarketDataSource['getCryptoBars']
} = {}): MarketDataSource {
  return {
    getBars: opts.getBars ?? (async () => BARS),
    getCryptoBars: opts.getCryptoBars ?? (async () => CRYPTO_BARS),
  } as unknown as MarketDataSource
}

describe('HistoricalImporter.fetchDayBars — replay-free chart backfill', () => {
  it('returns ok:false when there is no data source', async () => {
    const r = await new HistoricalImporter(null).fetchDayBars('NVDA', '2026-05-22')
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/data source/i)
  })

  it('rejects a malformed date', async () => {
    const r = await new HistoricalImporter(makeDataSource()).fetchDayBars('NVDA', 'not-a-date')
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/YYYY-MM-DD/i)
  })

  it('rejects a weekend date (no US-stock data)', async () => {
    // 2026-05-23 is a Saturday.
    const r = await new HistoricalImporter(makeDataSource()).fetchDayBars('NVDA', '2026-05-23')
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/weekend/i)
  })

  it('rejects a future date', async () => {
    const r = await new HistoricalImporter(makeDataSource()).fetchDayBars('NVDA', '2099-01-02')
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/future/i)
  })

  it('returns the bars for a valid past weekday and queries the RTH window', async () => {
    // 2026-05-22 is a Friday.
    const getBars = vi.fn<MarketDataSource['getBars']>(async () => BARS)
    const r = await new HistoricalImporter(makeDataSource({ getBars })).fetchDayBars('nvda', '2026-05-22')
    expect(r.ok).toBe(true)
    expect(r.bars).toEqual(BARS)
    // Symbol upper-cased; default timeframe 1Min; session window in UTC.
    expect(getBars).toHaveBeenCalledWith('NVDA', '1Min', '2026-05-22T13:00:00Z', '2026-05-22T21:30:00Z')
  })

  it('surfaces a getBars failure as ok:false without throwing', async () => {
    const getBars = vi.fn<MarketDataSource['getBars']>(async () => { throw new Error('alpaca 429') })
    const r = await new HistoricalImporter(makeDataSource({ getBars })).fetchDayBars('NVDA', '2026-05-22')
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/429/)
  })
})

describe('HistoricalImporter.fetchRecentCryptoBars — crypto off-hours backfill (2026-05-26)', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-05-26T18:00:00Z')) })
  afterEach(()  => { vi.useRealTimers() })

  it('returns ok:false when there is no data source', async () => {
    const r = await new HistoricalImporter(null).fetchRecentCryptoBars('BTC')
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/data source/i)
  })

  it('queries getCryptoBars for a rolling 24h window ending now (default)', async () => {
    const getCryptoBars = vi.fn<MarketDataSource['getCryptoBars']>(async () => CRYPTO_BARS)
    const r = await new HistoricalImporter(makeDataSource({ getCryptoBars })).fetchRecentCryptoBars('btc')
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
    const getCryptoBars = vi.fn<MarketDataSource['getCryptoBars']>(async () => CRYPTO_BARS)
    await new HistoricalImporter(makeDataSource({ getCryptoBars })).fetchRecentCryptoBars('BTC', '1Min', 6)
    expect(getCryptoBars).toHaveBeenCalledWith(
      'BTC', '1Min',
      '2026-05-26T12:00:00.000Z',
      '2026-05-26T18:00:00.000Z',
    )
  })

  it('rejects an unsupported timeframe without hitting the network', async () => {
    const getCryptoBars = vi.fn<MarketDataSource['getCryptoBars']>(async () => CRYPTO_BARS)
    const r = await new HistoricalImporter(makeDataSource({ getCryptoBars }))
      .fetchRecentCryptoBars('BTC', '5Min' as unknown as '1Min')
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/Unsupported timeframe/)
    expect(getCryptoBars).not.toHaveBeenCalled()
  })

  it('surfaces a getCryptoBars failure as ok:false without throwing', async () => {
    const getCryptoBars = vi.fn<MarketDataSource['getCryptoBars']>(async () => { throw new Error('alpaca 429') })
    const r = await new HistoricalImporter(makeDataSource({ getCryptoBars })).fetchRecentCryptoBars('BTC')
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/429/)
  })

  it('returns ok:true with an empty bars array when the data source has nothing in the window', async () => {
    const getCryptoBars = vi.fn<MarketDataSource['getCryptoBars']>(async () => [])
    const r = await new HistoricalImporter(makeDataSource({ getCryptoBars })).fetchRecentCryptoBars('BTC')
    expect(r.ok).toBe(true)
    expect(r.bars).toEqual([])
  })
})
