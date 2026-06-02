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
import { AlpacaClient, type AlpacaConnectionState, type AlpacaTick, type AlpacaConfig } from './alpaca'

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

describe('AlpacaClient.getLatestPrices — seed hydration helper (2026-05-26)', () => {
  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status, headers: { 'content-type': 'application/json' },
    })
  }

  afterEach(() => { vi.unstubAllGlobals() })

  it('returns latest stock prices keyed by symbol, preferring latestTrade over latestQuote', async () => {
    // Stocks endpoint: { snapshots: { NVDA: { latestTrade:{p:..}, latestQuote:{bp:.., ap:..} } } }
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/v2/stocks/snapshots')) {
        return jsonResponse({
          snapshots: {
            NVDA: { latestTrade: { p: 135.50 }, latestQuote: { bp: 135.45, ap: 135.55 } },
            SPY:  { latestTrade: { p: 608.10 } },
          },
        })
      }
      return jsonResponse({})
    })
    vi.stubGlobal('fetch', fetchMock)

    const cli = new AlpacaClient(dummyCfg)
    const out = await cli.getLatestPrices(['NVDA', 'SPY'])

    expect(out.get('NVDA')).toBe(135.50)
    expect(out.get('SPY')).toBe(608.10)
    const url = String(fetchMock.mock.calls[0]![0])
    expect(url).toContain('/v2/stocks/snapshots')
    expect(url).toContain('symbols=NVDA%2CSPY')
  })

  it('falls back to mid(bid,ask) when latestTrade is missing', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string) => jsonResponse({
      snapshots: {
        AAPL: { latestQuote: { bp: 200, ap: 202 } },  // no latestTrade
      },
    })))
    const cli = new AlpacaClient(dummyCfg)
    const out = await cli.getLatestPrices(['AAPL'])
    expect(out.get('AAPL')).toBe(201)  // mid
  })

  it('hits the crypto endpoint separately for crypto-class symbols', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/v1beta3/crypto/us/latest/trades')) {
        return jsonResponse({ trades: { 'BTC/USD': { p: 71_000 }, 'ETH/USD': { p: 3_800 } } })
      }
      return jsonResponse({ snapshots: {} })
    })
    vi.stubGlobal('fetch', fetchMock)

    const cli = new AlpacaClient(dummyCfg)
    const out = await cli.getLatestPrices(['BTC', 'ETH'])

    expect(out.get('BTC')).toBe(71_000)
    expect(out.get('ETH')).toBe(3_800)
    const url = fetchMock.mock.calls.map(c => String(c[0])).find(u => u.includes('crypto'))!
    expect(url).toContain('symbols=BTC%2FUSD%2CETH%2FUSD')
  })

  it('returns combined stock + crypto prices in one call', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/v2/stocks/snapshots')) {
        return jsonResponse({ snapshots: { NVDA: { latestTrade: { p: 135 } } } })
      }
      if (url.includes('/v1beta3/crypto/us/latest/trades')) {
        return jsonResponse({ trades: { 'BTC/USD': { p: 71_000 } } })
      }
      return jsonResponse({})
    }))
    const cli = new AlpacaClient(dummyCfg)
    const out = await cli.getLatestPrices(['NVDA', 'BTC'])
    expect(out.get('NVDA')).toBe(135)
    expect(out.get('BTC')).toBe(71_000)
    expect(out.size).toBe(2)
  })

  it('returns an empty map when credentials are missing (no throw)', async () => {
    const cli = new AlpacaClient({ ...dummyCfg, keyId: '', secretKey: '' })
    const out = await cli.getLatestPrices(['NVDA'])
    expect(out.size).toBe(0)
  })

  it('returns a partial map when one branch fails (other-branch results survive)', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/v2/stocks/snapshots')) return new Response('429', { status: 429 })
      if (url.includes('/v1beta3/crypto/us/latest/trades')) {
        return jsonResponse({ trades: { 'BTC/USD': { p: 71_000 } } })
      }
      return jsonResponse({})
    }))
    const cli = new AlpacaClient(dummyCfg)
    const out = await cli.getLatestPrices(['NVDA', 'BTC'])
    expect(out.get('BTC')).toBe(71_000)
    expect(out.has('NVDA')).toBe(false)
  })

  it('skips symbols not present in the response (no NaN, no zero)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ snapshots: {} })))
    const cli = new AlpacaClient(dummyCfg)
    const out = await cli.getLatestPrices(['NVDA'])
    expect(out.has('NVDA')).toBe(false)
  })

  it('handles an empty input gracefully', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}))
    vi.stubGlobal('fetch', fetchMock)
    const cli = new AlpacaClient(dummyCfg)
    const out = await cli.getLatestPrices([])
    expect(out.size).toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()  // no roundtrips for empty
  })
})

describe('AlpacaClient — WS 406 connection-limit cooldown (2026-05-26)', () => {
  function cooldownUntilOf(client: AlpacaClient): number {
    return (client as unknown as { connectionLimitCooldownUntil: number }).connectionLimitCooldownUntil
  }

  it('equity 406 sets connectionLimitCooldownUntil ~60s in the future (regression)', () => {
    const client = new AlpacaClient(dummyCfg)
    const before = Date.now()
    fireEquity(client, { T: 'error', code: 406, msg: 'connection limit' })
    const cooldown = cooldownUntilOf(client)
    expect(cooldown).toBeGreaterThanOrEqual(before + 59_000)
    expect(cooldown).toBeLessThanOrEqual(Date.now() + 60_500)
  })

  it('equity error with a non-406 code leaves the cooldown at 0', () => {
    const client = new AlpacaClient(dummyCfg)
    fireEquity(client, { T: 'error', code: 401, msg: 'auth failed' })
    expect(cooldownUntilOf(client)).toBe(0)
  })

  it('crypto 406 ALSO sets the shared cooldown (the fix this commit lands)', () => {
    const client = new AlpacaClient(dummyCfg)
    const before = Date.now()
    fireCrypto(client, { T: 'error', code: 406, msg: 'connection limit' })
    const cooldown = cooldownUntilOf(client)
    expect(cooldown).toBeGreaterThanOrEqual(before + 59_000)
    expect(cooldown).toBeLessThanOrEqual(Date.now() + 60_500)
  })

  it('crypto error with a non-406 code does NOT set the cooldown', () => {
    const client = new AlpacaClient(dummyCfg)
    fireCrypto(client, { T: 'error', code: 401, msg: 'auth failed' })
    expect(cooldownUntilOf(client)).toBe(0)
  })

  it('crypto 406 followed by an equity 406 keeps the LATER cooldown (max, not overwrite)', () => {
    // Both branches write to the same field unconditionally with now+60s.
    // The "max" property is preserved by the later call having a higher
    // timestamp; assert the field strictly advances rather than getting
    // stuck on the earlier value.
    const client = new AlpacaClient(dummyCfg)
    fireCrypto(client, { T: 'error', code: 406, msg: 'connection limit' })
    const first = cooldownUntilOf(client)
    // sleep equivalent — bump wall clock by faking
    const later = first + 50  // arbitrary advance
    vi.spyOn(Date, 'now').mockReturnValue(later)
    try {
      fireEquity(client, { T: 'error', code: 406, msg: 'connection limit' })
      const second = cooldownUntilOf(client)
      expect(second).toBeGreaterThan(first)
    } finally {
      vi.restoreAllMocks()
    }
  })
})

describe('AlpacaClient — onConnectionStateChange event source (F.1 task A.6)', () => {
  /** Cast-helper: poke private state + call private emit. The wire-up of
   *  emit() at real WS open / close / reconnect-timer points is verified at
   *  the AlpacaBrokerSession integration layer; here we pin the helper. */
  type Internals = {
    connected:            boolean
    accountConnected:     boolean
    reconnectTimer:       NodeJS.Timeout | null
    acctReconnectTimer:   NodeJS.Timeout | null
    cryptoReconnectTimer: NodeJS.Timeout | null
    emitConnectionState:  () => void
  }
  const internals = (c: AlpacaClient): Internals => c as unknown as Internals

  it('fires the listener with the current snapshot when state changes', () => {
    const c = new AlpacaClient(dummyCfg)
    const seen: AlpacaConnectionState[] = []
    c.onConnectionStateChange(s => seen.push(s))
    internals(c).connected = true
    internals(c).emitConnectionState()
    expect(seen).toHaveLength(1)
    expect(seen[0]).toEqual({ equity: true, account: false, crypto: false, reconnecting: false })
  })

  it('dedups: two emits with identical state fire the listener only once', () => {
    const c = new AlpacaClient(dummyCfg)
    const seen: AlpacaConnectionState[] = []
    c.onConnectionStateChange(s => seen.push(s))
    internals(c).accountConnected = true
    internals(c).emitConnectionState()
    internals(c).emitConnectionState()              // same state
    expect(seen).toHaveLength(1)
    expect(seen[0]?.account).toBe(true)
  })

  it('reports reconnecting:true when any of the three reconnect timers is armed', () => {
    const c = new AlpacaClient(dummyCfg)
    const seen: AlpacaConnectionState[] = []
    c.onConnectionStateChange(s => seen.push(s))
    internals(c).acctReconnectTimer = setTimeout(() => { /* noop */ }, 99_999)
    try {
      internals(c).emitConnectionState()
      expect(seen).toHaveLength(1)
      expect(seen[0]?.reconnecting).toBe(true)
    } finally {
      clearTimeout(internals(c).acctReconnectTimer!)
    }
  })

  it('unsub stops further notifications', () => {
    const c = new AlpacaClient(dummyCfg)
    const seen: AlpacaConnectionState[] = []
    const off = c.onConnectionStateChange(s => seen.push(s))
    internals(c).connected = true
    internals(c).emitConnectionState()              // listener fires once
    off()
    internals(c).connected = false
    internals(c).emitConnectionState()              // state changed but listener removed
    expect(seen).toHaveLength(1)
  })
})
