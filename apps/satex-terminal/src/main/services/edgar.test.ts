/**
 * SATEX — EdgarService tests (coverage sweep, 2026-07-05 · P-088).
 *
 * New-file-only suite. Source (`edgar.ts`) is byte-for-byte unchanged.
 * EdgarService polls SEC EDGAR's free public submissions endpoint and turns
 * filings into NewsItems for the Catalysts panel. Off the trading-safety
 * perimeter (news/catalyst feed only — no execution/risk/kill-switch/broker
 * coupling; `poll()`'s own try/catch means a bad SEC response can never throw
 * out of the service).
 *
 * Pins: start/stop timer lifecycle (idempotent start, safe double-stop),
 * `ensureCikMap` ticker-map caching (24h) + uppercasing, the `TRACKED_FORMS`
 * filter, the 7-day lookback cutoff + invalid-date guard, the seen-set
 * dedup, the seen-set bounded-growth halving above 5000 entries (the
 * PR#6/P-041/P-043/P-046 class), the 20-filing-per-symbol cap in
 * `fetchSubmissions`, the 404-is-quiet / non-404-throws-but-poll-swallows
 * distinction, and the per-form `kind`/`sentiment` mapping in `emit()`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { NewsItem } from '@shared/types'
import { EdgarService, type EdgarServiceDeps } from './edgar'

const TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json'

interface RecentShape {
  accessionNumber: string[]
  filingDate: string[]
  form: string[]
  primaryDocument: string[]
  primaryDocDescription: string[]
}

function tickersResponse(map: Record<string, { cik_str: number; ticker: string; title: string }> = {
  '0': { cik_str: 320193, ticker: 'NVDA', title: 'NVIDIA CORP' },
}): Response {
  return new Response(JSON.stringify(map), { status: 200 })
}

function submissionsResponse(recent: RecentShape, status = 200): Response {
  return new Response(JSON.stringify({ filings: { recent } }), { status })
}

function emptyRecent(): RecentShape {
  return { accessionNumber: [], filingDate: [], form: [], primaryDocument: [], primaryDocDescription: [] }
}

/** n synthetic filings, all dated "today" (always within the 7-day cutoff). */
function makeRecent(n: number, opts: { startIdx?: number; form?: string; filingDate?: string } = {}): RecentShape {
  const startIdx = opts.startIdx ?? 0
  const form = opts.form ?? '8-K'
  const filingDate = opts.filingDate ?? new Date().toISOString().slice(0, 10)
  const out = emptyRecent()
  for (let i = 0; i < n; i++) {
    out.accessionNumber.push(`acc-${startIdx + i}`)
    out.filingDate.push(filingDate)
    out.form.push(form)
    out.primaryDocument.push('doc.htm')
    out.primaryDocDescription.push(`filing ${startIdx + i}`)
  }
  return out
}

function deps(watchlist: string[] = ['NVDA']): EdgarServiceDeps {
  return { getWatchlist: () => watchlist }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

// ── lifecycle ────────────────────────────────────────────────────────────────

describe('EdgarService lifecycle', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(submissionsResponse(emptyRecent())))
  })

  it('start() schedules exactly one interval + one initial timeout, even if called twice', () => {
    vi.useFakeTimers()
    const setIntervalSpy = vi.spyOn(global, 'setInterval')
    const setTimeoutSpy = vi.spyOn(global, 'setTimeout')
    const svc = new EdgarService(deps())
    svc.start()
    svc.start() // no-op: this.timer is already set
    expect(setIntervalSpy).toHaveBeenCalledTimes(1)
    expect(setTimeoutSpy).toHaveBeenCalledTimes(1)
    svc.stop()
  })

  it('stop() clears the timer so a subsequent start() re-arms it', () => {
    vi.useFakeTimers()
    const setIntervalSpy = vi.spyOn(global, 'setInterval')
    const svc = new EdgarService(deps())
    svc.start()
    svc.stop()
    svc.start()
    expect(setIntervalSpy).toHaveBeenCalledTimes(2)
    svc.stop()
  })

  it('stop() before start() is a safe no-op', () => {
    const svc = new EdgarService(deps())
    expect(() => svc.stop()).not.toThrow()
  })

  it('start() fires the first poll ~10s later, not immediately', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(tickersResponse()))
    const svc = new EdgarService(deps())
    svc.start()
    expect(fetch).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(fetch).toHaveBeenCalled()
    svc.stop()
  })
})

// ── onNews / emit mapping ────────────────────────────────────────────────────

describe('EdgarService onNews + emit()', () => {
  it('onNews returns an unsubscribe function; unsubscribed listeners stop receiving items', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url === TICKERS_URL) return Promise.resolve(tickersResponse())
      return Promise.resolve(submissionsResponse(makeRecent(1)))
    }))
    const svc = new EdgarService(deps())
    const received: NewsItem[] = []
    const unsub = svc.onNews((item) => received.push(item))
    await svc.refresh()
    expect(received).toHaveLength(1)
    unsub()
    await svc.refresh() // acc-0 already seen anyway, but confirms no throw / no re-add
    expect(received).toHaveLength(1)
  })

  it.each([
    ['8-K', 'breaking', -0.1],
    ['10-Q', 'earnings', 0.05],
    ['10-K', 'earnings', 0.05],
    ['4', 'flow', 0],
    ['4/A', 'flow', 0],
  ] as const)('maps form %s to kind=%s sentiment=%s', async (form, kind, sentiment) => {
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url === TICKERS_URL) return Promise.resolve(tickersResponse())
      return Promise.resolve(submissionsResponse(makeRecent(1, { form })))
    }))
    const svc = new EdgarService(deps())
    const received: NewsItem[] = []
    svc.onNews((item) => received.push(item))
    await svc.refresh()
    expect(received).toHaveLength(1)
    expect(received[0].kind).toBe(kind)
    expect(received[0].sentiment).toBe(sentiment)
    expect(received[0].symbol).toBe('NVDA')
    expect(received[0].title).toContain(form)
    expect(received[0].source).toBe('SEC/EDGAR')
  })

  it('untracked form types (e.g. S-1) never reach a listener', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url === TICKERS_URL) return Promise.resolve(tickersResponse())
      return Promise.resolve(submissionsResponse(makeRecent(1, { form: 'S-1' })))
    }))
    const svc = new EdgarService(deps())
    const received: NewsItem[] = []
    svc.onNews((item) => received.push(item))
    await svc.refresh()
    expect(received).toHaveLength(0)
  })
})

// ── poll() gating, cutoff, dedup ─────────────────────────────────────────────

describe('EdgarService poll() gating', () => {
  it('an empty watchlist still refreshes the ticker map but pushes no filings', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === TICKERS_URL) return Promise.resolve(tickersResponse())
      throw new Error('submissions endpoint should not be called for an empty watchlist')
    })
    vi.stubGlobal('fetch', fetchMock)
    const svc = new EdgarService(deps([]))
    const received: NewsItem[] = []
    svc.onNews((item) => received.push(item))
    await svc.refresh()
    expect(received).toHaveLength(0)
    expect(fetchMock).toHaveBeenCalledTimes(1) // tickers only
  })

  it('a watchlist symbol with no CIK match is skipped (no submissions fetch, no emit)', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === TICKERS_URL) return Promise.resolve(tickersResponse()) // only has NVDA
      throw new Error('submissions endpoint should not be called for an unmapped ticker')
    })
    vi.stubGlobal('fetch', fetchMock)
    const svc = new EdgarService(deps(['ZZZZ_UNKNOWN']))
    const received: NewsItem[] = []
    svc.onNews((item) => received.push(item))
    await svc.refresh()
    expect(received).toHaveLength(0)
  })

  it('cikMap lookup is case-insensitive-safe: ticker keys are uppercased on ingest', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url === TICKERS_URL) return Promise.resolve(tickersResponse({ '0': { cik_str: 1, ticker: 'nvda', title: 'NVIDIA CORP' } }))
      return Promise.resolve(submissionsResponse(makeRecent(1)))
    }))
    const svc = new EdgarService(deps(['NVDA']))
    const received: NewsItem[] = []
    svc.onNews((item) => received.push(item))
    await svc.refresh()
    expect(received).toHaveLength(1)
  })

  it('a filing older than the 7-day lookback is skipped', async () => {
    const stale = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url === TICKERS_URL) return Promise.resolve(tickersResponse())
      return Promise.resolve(submissionsResponse(makeRecent(1, { filingDate: stale })))
    }))
    const svc = new EdgarService(deps())
    const received: NewsItem[] = []
    svc.onNews((item) => received.push(item))
    await svc.refresh()
    expect(received).toHaveLength(0)
  })

  it('an unparseable filingDate (NaN date) is skipped, not crashed on', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url === TICKERS_URL) return Promise.resolve(tickersResponse())
      return Promise.resolve(submissionsResponse(makeRecent(1, { filingDate: 'not-a-date' })))
    }))
    const svc = new EdgarService(deps())
    const received: NewsItem[] = []
    svc.onNews((item) => received.push(item))
    await expect(svc.refresh()).resolves.toBeUndefined()
    expect(received).toHaveLength(0)
  })

  it('the same accessionNumber is never emitted twice across poll cycles', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url === TICKERS_URL) return Promise.resolve(tickersResponse())
      return Promise.resolve(submissionsResponse(makeRecent(1))) // always acc-0
    }))
    const svc = new EdgarService(deps())
    const received: NewsItem[] = []
    svc.onNews((item) => received.push(item))
    await svc.refresh()
    await svc.refresh()
    await svc.refresh()
    expect(received).toHaveLength(1)
  })

  it('fetchSubmissions caps at 20 filings per symbol per poll even if SEC returns more', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url === TICKERS_URL) return Promise.resolve(tickersResponse())
      return Promise.resolve(submissionsResponse(makeRecent(25)))
    }))
    const svc = new EdgarService(deps())
    const received: NewsItem[] = []
    svc.onNews((item) => received.push(item))
    await svc.refresh()
    expect(received).toHaveLength(20)
  })
})

// ── ensureCikMap caching + error paths ───────────────────────────────────────

describe('EdgarService ensureCikMap caching + fetchSubmissions error handling', () => {
  it('caches the ticker map for 24h — a second refresh() within the window does not re-fetch tickers', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-05T12:00:00Z'))
    const fetchMock = vi.fn((url: string) => {
      if (url === TICKERS_URL) return Promise.resolve(tickersResponse())
      return Promise.resolve(submissionsResponse(emptyRecent()))
    })
    vi.stubGlobal('fetch', fetchMock)
    const svc = new EdgarService(deps())
    await svc.refresh()
    await svc.refresh()
    const tickerCalls = fetchMock.mock.calls.filter((c) => c[0] === TICKERS_URL).length
    expect(tickerCalls).toBe(1)
  })

  it('re-fetches the ticker map once 24h have elapsed', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-05T12:00:00Z'))
    const fetchMock = vi.fn((url: string) => {
      if (url === TICKERS_URL) return Promise.resolve(tickersResponse())
      return Promise.resolve(submissionsResponse(emptyRecent()))
    })
    vi.stubGlobal('fetch', fetchMock)
    const svc = new EdgarService(deps())
    await svc.refresh()
    vi.setSystemTime(new Date('2026-07-06T12:00:01Z')) // +24h and 1s
    await svc.refresh()
    const tickerCalls = fetchMock.mock.calls.filter((c) => c[0] === TICKERS_URL).length
    expect(tickerCalls).toBe(2)
  })

  it('a 404 from the submissions endpoint is treated as "no filings", not an error', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url === TICKERS_URL) return Promise.resolve(tickersResponse())
      return Promise.resolve(new Response('', { status: 404 }))
    }))
    const svc = new EdgarService(deps())
    const received: NewsItem[] = []
    svc.onNews((item) => received.push(item))
    await expect(svc.refresh()).resolves.toBeUndefined()
    expect(received).toHaveLength(0)
  })

  it('a non-404 error status from the submissions endpoint is swallowed by poll()\'s own try/catch', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url === TICKERS_URL) return Promise.resolve(tickersResponse())
      return Promise.resolve(new Response('server error', { status: 500 }))
    }))
    const svc = new EdgarService(deps())
    await expect(svc.refresh()).resolves.toBeUndefined()
  })

  it('a rejected ticker-map fetch (network failure) never throws out of refresh()', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')))
    const svc = new EdgarService(deps())
    await expect(svc.refresh()).resolves.toBeUndefined()
  })

  it('an empty filings.recent object is treated as zero filings', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url === TICKERS_URL) return Promise.resolve(tickersResponse())
      return Promise.resolve(new Response(JSON.stringify({ filings: {} }), { status: 200 }))
    }))
    const svc = new EdgarService(deps())
    const received: NewsItem[] = []
    svc.onNews((item) => received.push(item))
    await expect(svc.refresh()).resolves.toBeUndefined()
    expect(received).toHaveLength(0)
  })
})

// ── bounded-growth: the seen-set halves above 5000 (PR#6/P-041/P-043/P-046 class) ──

describe('EdgarService seen-set bounded growth', () => {
  it('halves the seen-set once it exceeds 5000 entries, evicting the oldest half', async () => {
    let pollIdx = 0
    const fetchMock = vi.fn((url: string) => {
      if (url === TICKERS_URL) return Promise.resolve(tickersResponse())
      const recent = makeRecent(20, { startIdx: pollIdx * 20 })
      pollIdx++
      return Promise.resolve(submissionsResponse(recent))
    })
    vi.stubGlobal('fetch', fetchMock)
    const svc = new EdgarService(deps())
    const received: NewsItem[] = []
    svc.onNews((item) => received.push(item))

    // 250 polls * 20 unique filings = exactly 5000 (acc-0..acc-4999): not yet > 5000.
    for (let i = 0; i < 250; i++) await svc.refresh()
    expect(received).toHaveLength(5000)

    // Poll #251 adds acc-5000..acc-5019 -> seen.size 5020 > 5000 -> halve to the
    // most-recent ~half (arr.slice(2510)): acc-0 is evicted, acc-5019 survives.
    await svc.refresh()
    expect(received).toHaveLength(5020)

    // Resend acc-0 (oldest) and acc-5019 (newest) in one more poll. acc-0 was
    // evicted by the halving -> re-emitted. acc-5019 is still in `seen` -> deduped.
    const resend = emptyRecent()
    resend.accessionNumber.push('acc-0', 'acc-5019')
    resend.filingDate.push(new Date().toISOString().slice(0, 10), new Date().toISOString().slice(0, 10))
    resend.form.push('8-K', '8-K')
    resend.primaryDocument.push('doc.htm', 'doc.htm')
    resend.primaryDocDescription.push('resend', 'resend')
    fetchMock.mockImplementationOnce((url: string) => {
      if (url === TICKERS_URL) return Promise.resolve(tickersResponse())
      return Promise.resolve(submissionsResponse(resend))
    })
    await svc.refresh()
    expect(received).toHaveLength(5021) // only acc-0 re-emitted, acc-5019 deduped
  }, 20_000)
})
