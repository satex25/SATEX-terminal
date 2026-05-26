/**
 * SATEX — AlpacaClient WS-boundary input validation tests (B5, v0.4.3).
 *
 * Locks down the 2026-05-18 D6 critical-security fix. A crafted JSON frame
 * delivered via the data WebSocket (compromised upstream proxy, MITM with
 * cert-validation broken in user config) could otherwise:
 *
 *   • Put NaN into `tick.size` → `q.volume += NaN` permanent poisoning
 *   • Put NaN into `tick.timestamp` → `refPriceAge = NaN` →
 *     `NaN > MAX_QUOTE_AGE_MS` is false → Gate 0 FAILS OPEN in live mode
 *   • Put a 100 MB string in `tick.symbol` → Map-key memory blow-up
 *
 * The fix added `num()`, `ts()`, `sym()` helpers that gate every field at
 * the WS boundary. These tests bypass the actual WebSocket and call the
 * private `onDataMsg` / `onCryptoDataMsg` methods directly with crafted
 * payloads, then assert every numeric field on the emitted AlpacaTick is
 * finite and the symbol is length-capped.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { AlpacaClient, type AlpacaTick, type AlpacaConfig } from './alpaca'

const dummyCfg: AlpacaConfig = {
  keyId: 'k', secretKey: 's',
  baseUrl: 'https://paper-api.alpaca.markets',
  dataUrl: 'https://data.alpaca.markets',
  feed: 'iex',
}

/** Call the private equity-feed message handler. Test-only cast. */
function fireEquity(client: AlpacaClient, msg: Record<string, unknown>): void {
  ;(client as unknown as {
    onDataMsg: (m: Record<string, unknown>, symbols: string[]) => void
  }).onDataMsg(msg, ['NVDA'])
}

/** Call the private crypto-feed message handler. Test-only cast. */
function fireCrypto(client: AlpacaClient, msg: Record<string, unknown>): void {
  ;(client as unknown as {
    onCryptoDataMsg: (m: Record<string, unknown>, symbols: string[]) => void
  }).onCryptoDataMsg(msg, ['BTC/USD'])
}

describe('AlpacaClient — equity WS boundary NaN guards (D6, v0.4.3)', () => {
  let client: AlpacaClient
  let ticks: AlpacaTick[]

  beforeEach(() => {
    ticks = []
    client = new AlpacaClient(dummyCfg)
    client.onTick(t => ticks.push(t))
  })

  it('garbage size strings in q-frame → tick.size === 0 (not NaN)', () => {
    fireEquity(client, {
      T: 'q', S: 'NVDA', bp: 100.10, ap: 100.20,
      bs: 'foo', as: 'bar',           // hostile non-numeric
      t: '2026-05-19T00:00:00Z',
    })
    expect(ticks).toHaveLength(1)
    expect(Number.isFinite(ticks[0]!.size)).toBe(true)
    expect(ticks[0]!.size).toBe(0)    // 0 + 0
  })

  it('garbage timestamp string → tick.timestamp falls back to Date.now() (finite)', () => {
    const before = Date.now()
    fireEquity(client, {
      T: 'q', S: 'NVDA', bp: 100, ap: 100.1, bs: 1, as: 1,
      t: 'not-a-valid-iso-date',
    })
    const after = Date.now()
    expect(ticks).toHaveLength(1)
    expect(Number.isFinite(ticks[0]!.timestamp)).toBe(true)
    expect(ticks[0]!.timestamp).toBeGreaterThanOrEqual(before)
    expect(ticks[0]!.timestamp).toBeLessThanOrEqual(after)
  })

  it('object-shaped numeric → coerced to 0 (not NaN)', () => {
    // Number({ evil: true }) is NaN; this.num must reject.
    fireEquity(client, {
      T: 'q', S: 'NVDA',
      bp: { evil: true } as unknown,
      ap: ['array'] as unknown,
      bs: undefined, as: null,
      t: 1700000000000,
    })
    expect(ticks).toHaveLength(1)
    const tk = ticks[0]!
    expect(Number.isFinite(tk.bid)).toBe(true)
    expect(Number.isFinite(tk.ask)).toBe(true)
    expect(Number.isFinite(tk.price)).toBe(true)
    expect(tk.bid).toBe(0)
    expect(tk.ask).toBe(0)
    expect(tk.price).toBe(0)
  })

  it('100-char symbol → truncated to 16 chars', () => {
    const huge = 'X'.repeat(100)
    fireEquity(client, {
      T: 't', S: huge, p: 100, s: 1, t: '2026-05-19T00:00:00Z',
    })
    expect(ticks).toHaveLength(1)
    expect(ticks[0]!.symbol.length).toBe(16)
    expect(ticks[0]!.symbol).toBe('X'.repeat(16))
  })

  it('every numeric field on a t-frame is finite even with all-garbage input', () => {
    fireEquity(client, {
      T: 't', S: 'NVDA',
      p: { weird: 'object' } as unknown,
      s: undefined,
      t: null,
    })
    expect(ticks).toHaveLength(1)
    const tk = ticks[0]!
    expect(Number.isFinite(tk.price)).toBe(true)
    expect(Number.isFinite(tk.size)).toBe(true)
    expect(Number.isFinite(tk.bid)).toBe(true)
    expect(Number.isFinite(tk.ask)).toBe(true)
    expect(Number.isFinite(tk.timestamp)).toBe(true)
    expect(tk.kind).toBe('t')
  })

  it('valid frame still passes through correctly (no false positives)', () => {
    fireEquity(client, {
      T: 'q', S: 'NVDA', bp: 100.10, ap: 100.20, bs: 50, as: 75,
      t: '2026-05-19T00:00:00Z',
    })
    expect(ticks).toHaveLength(1)
    expect(ticks[0]!.bid).toBeCloseTo(100.10, 6)
    expect(ticks[0]!.ask).toBeCloseTo(100.20, 6)
    expect(ticks[0]!.size).toBe(125)
    expect(ticks[0]!.kind).toBe('q')
  })
})

describe('AlpacaClient — crypto WS boundary NaN guards (D6, v0.4.3)', () => {
  let client: AlpacaClient
  let ticks: AlpacaTick[]

  beforeEach(() => {
    ticks = []
    client = new AlpacaClient(dummyCfg)
    client.onTick(t => ticks.push(t))
  })

  it('garbage size in crypto q-frame → size===0 + base symbol truncated', () => {
    const longPair = 'X'.repeat(40) + '/USD'  // > 16 chars even after split
    fireCrypto(client, {
      T: 'q', S: longPair, bp: 50_000, ap: 50_010,
      bs: 'NaN-from-malice', as: NaN,
      t: 'bad-timestamp',
    })
    expect(ticks).toHaveLength(1)
    const tk = ticks[0]!
    expect(tk.symbol.length).toBeLessThanOrEqual(16)
    expect(Number.isFinite(tk.size)).toBe(true)
    expect(Number.isFinite(tk.timestamp)).toBe(true)
  })

  it('valid crypto trade frame normalizes base symbol correctly', () => {
    fireCrypto(client, {
      T: 't', S: 'BTC/USD', p: 50_000, s: 0.1, t: '2026-05-19T00:00:00Z',
    })
    expect(ticks).toHaveLength(1)
    expect(ticks[0]!.symbol).toBe('BTC')
    expect(ticks[0]!.price).toBe(50_000)
    expect(ticks[0]!.kind).toBe('t')
  })
})

describe('AlpacaClient.getCryptoBars — /v1beta3/crypto/us/bars (2026-05-26)', () => {
  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status, headers: { 'content-type': 'application/json' },
    })
  }

  afterEach(() => { vi.unstubAllGlobals() })

  it('hits /v1beta3/crypto/us/bars with BTC/USD url-encoded symbol formatting', async () => {
    const fetchMock = vi.fn(async (_url: string) => jsonResponse({
      bars: { 'BTC/USD': [{ t: '2026-05-26T17:00:00Z', o: 100, h: 101, l: 99, c: 100.5, v: 1000 }] },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const cli = new AlpacaClient(dummyCfg)
    const bars = await cli.getCryptoBars('BTC', '1Min', '2026-05-25T18:00:00Z', '2026-05-26T18:00:00Z')

    expect(bars).toEqual([{
      time: Math.floor(new Date('2026-05-26T17:00:00Z').getTime() / 1000),
      open: 100, high: 101, low: 99, close: 100.5, volume: 1000,
    }])
    const url = String(fetchMock.mock.calls[0]![0])
    expect(url).toContain('/v1beta3/crypto/us/bars')
    expect(url).toContain('symbols=BTC%2FUSD')   // slash url-encoded
    expect(url).toContain('timeframe=1Min')
    expect(url).toContain('start=2026-05-25T18%3A00%3A00Z')
    expect(url).toContain('end=2026-05-26T18%3A00%3A00Z')
  })

  it('returns an empty array when the keyed bars list is missing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ bars: {} })))
    const cli = new AlpacaClient(dummyCfg)
    const bars = await cli.getCryptoBars('BTC', '1Min', '2026-05-25T18:00:00Z')
    expect(bars).toEqual([])
  })

  it('uppercases lowercase input before pairing — eth → ETH/USD', async () => {
    const fetchMock = vi.fn(async (_url: string) => jsonResponse({ bars: { 'ETH/USD': [] } }))
    vi.stubGlobal('fetch', fetchMock)
    const cli = new AlpacaClient(dummyCfg)
    await cli.getCryptoBars('eth', '1Min', '2026-05-25T18:00:00Z')
    expect(String(fetchMock.mock.calls[0]![0])).toContain('symbols=ETH%2FUSD')
  })

  it('throws when credentials are missing', async () => {
    const cli = new AlpacaClient({ ...dummyCfg, keyId: '', secretKey: '' })
    await expect(cli.getCryptoBars('BTC', '1Min', '2026-05-26T00:00:00Z'))
      .rejects.toThrow(/credentials/i)
  })

  it('throws with status + body on non-ok responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('rate limited', { status: 429 })))
    const cli = new AlpacaClient(dummyCfg)
    await expect(cli.getCryptoBars('BTC', '1Min', '2026-05-26T00:00:00Z'))
      .rejects.toThrow(/429/)
  })
})
