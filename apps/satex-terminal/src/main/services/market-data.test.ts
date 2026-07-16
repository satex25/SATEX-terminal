import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { MarketSimulator } from './market-data'
import type { Quote } from '@shared/types'
import { UNIVERSE } from '@shared/constants'

// Saturday 12:00 ET → US equity market closed (no holiday handling needed,
// the gate only checks weekday + RTH window per shared/market-hours.ts).
const SATURDAY_NOON_ET = new Date('2026-05-23T16:00:00Z')
// Tuesday 10:00 ET → US equity market open (09:30-16:00 ET).
const TUESDAY_OPEN_ET  = new Date('2026-05-26T14:00:00Z')

describe('MarketSimulator — 24/7 synthetic emission (2026-07-16)', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(()  => { vi.useRealTimers() })

  // The synthetic feed no longer gates on market hours: every asset class emits
  // continuously. A market-closed instant (Saturday) and a market-open instant
  // (Tuesday) must now behave identically — this is what makes the sim ticks
  // move 24/7. Real-hours freezing is the LIVE feed's concern, not the sim's.
  const CASES = [
    ['off-hours (Saturday)',   SATURDAY_NOON_ET],
    ['market-open (Tuesday)',  TUESDAY_OPEN_ET],
  ] as const

  for (const [label, when] of CASES) {
    it(`emits every UNIVERSE symbol on a single tick — ${label}`, () => {
      vi.setSystemTime(when)
      const sim = new MarketSimulator(1)
      const received: Quote[] = []
      sim.onQuotes((qs) => received.push(...qs))

      sim.start()
      vi.advanceTimersByTime(60) // one 50ms tick interval
      sim.stop()

      const classes = new Set(received.map(q => q.assetClass))
      expect(classes.has('equity')).toBe(true)
      expect(classes.has('index')).toBe(true)
      expect(classes.has('future')).toBe(true)
      expect(classes.has('crypto')).toBe(true)
      expect(received.length).toBe(UNIVERSE.length)
      // Concrete symbols across classes all tick, closed market or not.
      const symbols = new Set(received.map(q => q.symbol))
      for (const sym of ['NVDA', 'SPY', 'ES', 'BTC']) expect(symbols.has(sym)).toBe(true)
    })

    it(`rolls new candles for every class — ${label}`, () => {
      vi.setSystemTime(when)
      const sim = new MarketSimulator(1)
      const rolled: Array<{ symbol: string; assetClass: string }> = []
      sim.onCandle((symbol, _candle, isNew) => {
        if (!isNew) return
        const entry = UNIVERSE.find(u => u.symbol === symbol)
        if (entry) rolled.push({ symbol, assetClass: entry.assetClass })
      })

      sim.start()
      // Candle timer fires every 1000ms; SIMULATOR_CANDLE_INTERVAL_SEC = 1, so
      // crossing one second pushes past the bucket boundary.
      vi.advanceTimersByTime(1500)
      sim.stop()

      const classes = new Set(rolled.map(e => e.assetClass))
      expect(classes.has('equity')).toBe(true)
      expect(classes.has('index')).toBe(true)
      expect(classes.has('future')).toBe(true)
      expect(classes.has('crypto')).toBe(true)
    })
  }
})

describe('MarketSimulator — seedOverrides (Task 3, 2026-05-26)', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(TUESDAY_OPEN_ET) })
  afterEach(()  => { vi.useRealTimers() })

  it('uses seedOverrides for the initial price when an override exists', () => {
    const overrides = new Map<string, number>([['NVDA', 135.50], ['BTC', 71_000]])
    const sim = new MarketSimulator(1, overrides)
    const nvda = sim.getQuote('NVDA')!
    const btc  = sim.getQuote('BTC')!
    expect(nvda.last).toBe(135.50)
    expect(btc.last).toBe(71_000)
    expect(nvda.prevClose).toBe(135.50)
    expect(btc.prevClose).toBe(71_000)
  })

  it('falls back to UNIVERSE.seed for symbols not in the overrides map', () => {
    const overrides = new Map<string, number>([['NVDA', 135.50]])
    const sim = new MarketSimulator(1, overrides)
    const spy = sim.getQuote('SPY')!
    const spyEntry = UNIVERSE.find(u => u.symbol === 'SPY')!
    expect(spy.last).toBe(spyEntry.seed)
  })

  it('rejects non-finite + non-positive overrides — falls back to UNIVERSE.seed', () => {
    // Defense against a hostile or malformed Alpaca response leaking NaN/0 into
    // the GBM walk. price === 0 would also DoS Math.exp(log-return) math.
    const overrides = new Map<string, number>([
      ['NVDA', NaN],
      ['SPY',  0],
      ['BTC',  -1],
    ])
    const sim = new MarketSimulator(1, overrides)
    expect(sim.getQuote('NVDA')!.last).toBe(UNIVERSE.find(u => u.symbol === 'NVDA')!.seed)
    expect(sim.getQuote('SPY')!.last).toBe(UNIVERSE.find(u => u.symbol === 'SPY')!.seed)
    expect(sim.getQuote('BTC')!.last).toBe(UNIVERSE.find(u => u.symbol === 'BTC')!.seed)
  })

  it('treats omitted seedOverrides identically to the pre-Task-3 constructor', () => {
    const a = new MarketSimulator(1)
    const b = new MarketSimulator(1, new Map())  // empty map === no overrides
    for (const u of UNIVERSE) {
      expect(a.getQuote(u.symbol)!.last).toBe(b.getQuote(u.symbol)!.last)
    }
  })
})

describe('MarketSimulator — F.1 L1.A interface compliance', () => {
  it('getBars returns []', async () => {
    const sim = new MarketSimulator()
    expect(await sim.getBars('AAPL', '1Min', '2026-06-02T13:00:00Z')).toEqual([])
  })
  it('getCryptoBars returns []', async () => {
    const sim = new MarketSimulator()
    expect(await sim.getCryptoBars('BTC', '1Min', '2026-06-02T00:00:00Z')).toEqual([])
  })
  it('getClock reports isOpen=true', async () => {
    const sim = new MarketSimulator()
    expect((await sim.getClock()).isOpen).toBe(true)
  })
  it('isConnected is always true', () => {
    const sim = new MarketSimulator()
    expect(sim.isConnected()).toBe(true)
  })
  it('msSinceLastTick returns 0 when no ticks have been emitted', () => {
    const sim = new MarketSimulator()
    expect(sim.msSinceLastTick()).toBe(0)
  })
})

describe('MarketSimulator — msSinceLastTick', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(()  => { vi.useRealTimers() })

  it('is 0 before any tick, then reflects elapsed time once ticks emit (even off-hours)', () => {
    // 24/7 emission means every tick sets lastTickAt regardless of market hours.
    // The conditional assignment (only when the batch is non-empty) still holds,
    // and here the batch is always non-empty, so msSinceLastTick advances.
    vi.setSystemTime(SATURDAY_NOON_ET)
    const sim = new MarketSimulator(1)
    expect(sim.msSinceLastTick()).toBe(0)  // pre-tick invariant

    sim.start()
    vi.advanceTimersByTime(60)   // ticks fire off-hours → lastTickAt is set
    sim.stop()
    vi.advanceTimersByTime(100)  // wall clock advances with no new ticks
    // If lastTickAt had NOT been set, msSinceLastTick would still be 0.
    expect(sim.msSinceLastTick()).toBeGreaterThanOrEqual(100)
  })
})
