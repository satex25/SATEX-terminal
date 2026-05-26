import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { MarketSimulator } from './market-data'
import type { Quote } from '@shared/types'
import { UNIVERSE } from '@shared/constants'

// Saturday 12:00 ET → US equity market closed (no holiday handling needed,
// the gate only checks weekday + RTH window per shared/market-hours.ts).
const SATURDAY_NOON_ET = new Date('2026-05-23T16:00:00Z')
// Tuesday 10:00 ET → US equity market open (09:30-16:00 ET).
const TUESDAY_OPEN_ET  = new Date('2026-05-26T14:00:00Z')

describe('MarketSimulator — per-asset-class emission gate (2026-05-26)', () => {
  beforeEach(() => {
    delete process.env['SATEX_SIMULATOR_24_7']
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('off-hours: only crypto + future symbols emit ticks; equities + indices stay frozen', () => {
    vi.setSystemTime(SATURDAY_NOON_ET)
    const sim = new MarketSimulator(1)
    const received: Quote[] = []
    sim.onQuotes((qs) => received.push(...qs))

    sim.start()
    vi.advanceTimersByTime(60) // one 50ms tick interval
    sim.stop()

    const classes = new Set(received.map(q => q.assetClass))
    expect(classes.has('crypto')).toBe(true)
    expect(classes.has('future')).toBe(true)
    expect(classes.has('equity')).toBe(false)
    expect(classes.has('index')).toBe(false)
    // Concrete symbol checks pin the behavior — BTC/ES on, NVDA/SPY off.
    const symbols = new Set(received.map(q => q.symbol))
    expect(symbols.has('BTC')).toBe(true)
    expect(symbols.has('ES')).toBe(true)
    expect(symbols.has('NVDA')).toBe(false)
    expect(symbols.has('SPY')).toBe(false)
  })

  it('market-open: every UNIVERSE symbol emits on a single tick', () => {
    vi.setSystemTime(TUESDAY_OPEN_ET)
    const sim = new MarketSimulator(1)
    const received: Quote[] = []
    sim.onQuotes((qs) => received.push(...qs))

    sim.start()
    vi.advanceTimersByTime(60)
    sim.stop()

    const classes = new Set(received.map(q => q.assetClass))
    expect(classes.has('equity')).toBe(true)
    expect(classes.has('index')).toBe(true)
    expect(classes.has('future')).toBe(true)
    expect(classes.has('crypto')).toBe(true)
    expect(received.length).toBe(UNIVERSE.length)
  })

  it('SATEX_SIMULATOR_24_7=true forces all classes to emit off-hours', () => {
    vi.setSystemTime(SATURDAY_NOON_ET)
    process.env['SATEX_SIMULATOR_24_7'] = 'true'
    const sim = new MarketSimulator(1)
    const received: Quote[] = []
    sim.onQuotes((qs) => received.push(...qs))

    sim.start()
    vi.advanceTimersByTime(60)
    sim.stop()

    expect(received.length).toBe(UNIVERSE.length)
  })

  it('rollCandle off-hours: new bars only roll for crypto + futures', () => {
    vi.setSystemTime(SATURDAY_NOON_ET)
    const sim = new MarketSimulator(1)
    const rolled: Array<{ symbol: string; assetClass: string }> = []
    sim.onCandle((symbol, _candle, isNew) => {
      if (!isNew) return
      const entry = UNIVERSE.find(u => u.symbol === symbol)
      if (entry) rolled.push({ symbol, assetClass: entry.assetClass })
    })

    sim.start()
    // Candle timer fires every 1000ms; SIMULATOR_CANDLE_INTERVAL_SEC = 1, so
    // crossing one second is enough to push past the bucket boundary.
    vi.advanceTimersByTime(1500)
    sim.stop()

    const classes = new Set(rolled.map(e => e.assetClass))
    expect(classes.has('crypto')).toBe(true)
    expect(classes.has('future')).toBe(true)
    expect(classes.has('equity')).toBe(false)
    expect(classes.has('index')).toBe(false)
  })
})
