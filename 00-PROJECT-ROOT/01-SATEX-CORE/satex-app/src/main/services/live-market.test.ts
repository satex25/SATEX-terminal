/**
 * SATEX — LiveMarket bid/ask sentinel tests (B2, v0.4.3).
 *
 * Locks down the 2026-05-18 fix: trade frames (`kind: 't'`) ship
 * `bid: 0, ask: 0` instead of cloning the trade price. The LiveMarket
 * OR-fallback chain (`q.bid = tick.bid || q.bid || q.last * 0.9999`) then
 * preserves the prior quote-derived spread, eliminating the 10×/sec
 * spread-collapse-and-re-expand flicker on liquid names.
 *
 * Also pins the volume/VWAP gating: only `kind === 't'` frames accumulate.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AlpacaClient, AlpacaTick } from './alpaca'
import { LiveMarket } from './live-market'

interface FakeAlpaca {
  __tickHandlers: Array<(t: AlpacaTick) => void>
  emit(t: AlpacaTick): void
}

function makeFakeAlpaca(): AlpacaClient & FakeAlpaca {
  const handlers: Array<(t: AlpacaTick) => void> = []
  const fake = {
    __tickHandlers: handlers,
    emit(t: AlpacaTick) { for (const h of handlers) h(t) },
    onTick(fn: (t: AlpacaTick) => void): () => void {
      handlers.push(fn)
      return () => { const i = handlers.indexOf(fn); if (i >= 0) handlers.splice(i, 1) }
    },
    onTradeUpdate: vi.fn(() => () => {}),
    connectMarketStream: vi.fn(async () => {}),
    connectAccountStream: vi.fn(async () => {}),
    connectCryptoStream:  vi.fn(async () => {}),
    disconnectMarketStream: vi.fn(),
    disconnectAccountStream: vi.fn(),
    disconnectCryptoStream:  vi.fn(),
    isConfigured: true,
    isPaperEndpoint: true,
  } as unknown as AlpacaClient & FakeAlpaca
  return fake
}

function tick(opts: Partial<AlpacaTick> & { symbol: string; kind: 'q' | 't' }): AlpacaTick {
  return {
    symbol: opts.symbol,
    price: opts.price ?? 100,
    size:  opts.size  ?? 0,
    bid:   opts.bid   ?? 0,
    ask:   opts.ask   ?? 0,
    timestamp: opts.timestamp ?? Date.now(),
    kind: opts.kind,
  }
}

describe('LiveMarket — trade-frame bid/ask sentinel preserves spread (B2, v0.4.3)', () => {
  let alpaca: AlpacaClient & FakeAlpaca
  let lm: LiveMarket

  beforeEach(async () => {
    alpaca = makeFakeAlpaca()
    lm = new LiveMarket(alpaca, ['NVDA'])
    await lm.start()
  })

  it('preserves prior bid/ask when a trade frame arrives with bid:0, ask:0', () => {
    // 1. Quote frame establishes the spread: 99.95 / 100.05
    alpaca.emit(tick({
      symbol: 'NVDA', kind: 'q', price: 100.0,
      bid: 99.95, ask: 100.05, size: 200, timestamp: 1_000,
    }))
    let q = lm.getQuote('NVDA')!
    expect(q.bid).toBe(99.95)
    expect(q.ask).toBe(100.05)

    // 2. Trade frame ships bid:0, ask:0 sentinel + new last price 100.01
    alpaca.emit(tick({
      symbol: 'NVDA', kind: 't', price: 100.01,
      bid: 0, ask: 0, size: 10, timestamp: 2_000,
    }))
    q = lm.getQuote('NVDA')!

    // 3. The OR-fallback (q.bid = tick.bid || q.bid || ...) sees tick.bid=0
    //    as falsy and falls through to q.bid — preserving the prior spread.
    //    Pre-fix this would have collapsed to bid=100.01, ask=100.01.
    expect(q.bid).toBe(99.95)
    expect(q.ask).toBe(100.05)
    expect(q.last).toBe(100.01)
  })

  it('volume/VWAP only accumulate on kind === "t" (quote frames are inert)', () => {
    // Quote frame with non-zero size — must NOT accumulate volume
    alpaca.emit(tick({
      symbol: 'NVDA', kind: 'q', price: 100, bid: 99.9, ask: 100.1,
      size: 500, timestamp: 1_000,
    }))
    expect(lm.getQuote('NVDA')!.volume).toBe(0)
    // VWAP defaults to last when vwapVol === 0
    expect(lm.getQuote('NVDA')!.vwap).toBe(100)

    // Trade frame: 10 shares @ 100.01 — volume += 10, vwapNumer += 1000.1
    alpaca.emit(tick({
      symbol: 'NVDA', kind: 't', price: 100.01, bid: 0, ask: 0,
      size: 10, timestamp: 2_000,
    }))
    expect(lm.getQuote('NVDA')!.volume).toBe(10)
    // VWAP = 1000.1 / 10 = 100.01
    expect(lm.getQuote('NVDA')!.vwap).toBeCloseTo(100.01, 5)

    // Another quote frame — volume must stay at 10 (no inflation from quote churn)
    alpaca.emit(tick({
      symbol: 'NVDA', kind: 'q', price: 100.02, bid: 99.95, ask: 100.05,
      size: 999, timestamp: 3_000,
    }))
    expect(lm.getQuote('NVDA')!.volume).toBe(10)
  })

  it('multiple alternating quote/trade frames keep spread stable', () => {
    // Establish spread
    alpaca.emit(tick({ symbol: 'NVDA', kind: 'q', bid: 99.50, ask: 100.50, price: 100, size: 100, timestamp: 1 }))
    // Trade should not move bid/ask
    for (let i = 0; i < 10; i++) {
      alpaca.emit(tick({ symbol: 'NVDA', kind: 't', bid: 0, ask: 0, price: 100 + i*0.01, size: 1, timestamp: 1000 + i }))
      const q = lm.getQuote('NVDA')!
      expect(q.bid).toBe(99.50)
      expect(q.ask).toBe(100.50)
    }
  })

  it('quote frame after trades updates the spread (sanity)', () => {
    alpaca.emit(tick({ symbol: 'NVDA', kind: 'q', bid: 99.95, ask: 100.05, price: 100, size: 50, timestamp: 1 }))
    alpaca.emit(tick({ symbol: 'NVDA', kind: 't', bid: 0, ask: 0, price: 100.02, size: 5, timestamp: 2 }))
    // Spread preserved through the trade
    expect(lm.getQuote('NVDA')!.bid).toBe(99.95)
    // New quote frame moves the spread legitimately
    alpaca.emit(tick({ symbol: 'NVDA', kind: 'q', bid: 100.00, ask: 100.10, price: 100.05, size: 75, timestamp: 3 }))
    expect(lm.getQuote('NVDA')!.bid).toBe(100.00)
    expect(lm.getQuote('NVDA')!.ask).toBe(100.10)
  })
})
