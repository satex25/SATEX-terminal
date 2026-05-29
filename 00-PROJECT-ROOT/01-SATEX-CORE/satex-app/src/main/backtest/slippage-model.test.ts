/**
 * SATEX — SlippageModel tests.
 * Locks down the behavior contract for every model. The Zero model is the
 * control — every other model is judged by its deviation from Zero on
 * matched inputs.
 */
import { describe, expect, it } from 'vitest'
import { FixedBpsSlippageModel, ZeroSlippageModel } from './slippage-model'
import type { OrderRequest, Quote } from '@shared/types'

function quote(last: number, overrides?: Partial<Quote>): Quote {
  return {
    symbol: 'NVDA', name: 'NVIDIA', assetClass: 'equity',
    last, bid: last - 0.01, ask: last + 0.01,
    prevClose: last, changePct: 0, change: 0, volume: 0, vwap: last,
    sparkline: [], timestamp: Date.now(),
    ...overrides,
  }
}

function buy(qty = 100): OrderRequest {
  return { symbol: 'NVDA', side: 'buy', type: 'market', quantity: qty }
}

function sell(qty = 100): OrderRequest {
  return { symbol: 'NVDA', side: 'sell', type: 'market', quantity: qty }
}

describe('ZeroSlippageModel', () => {
  it('returns exactly quote.last for both sides', () => {
    const m = new ZeroSlippageModel()
    expect(m.fill(buy(),  { quote: quote(500) }).fillPrice).toBe(500)
    expect(m.fill(sell(), { quote: quote(500) }).fillPrice).toBe(500)
  })
  it('reports name = "zero"', () => {
    expect(new ZeroSlippageModel().name).toBe('zero')
  })
  it('returns a 50ms default fill delay', () => {
    expect(new ZeroSlippageModel().fill(buy(), { quote: quote(100) }).delayMs).toBe(50)
  })
})

describe('FixedBpsSlippageModel', () => {
  it('marks buys UP by configured bps, sells DOWN by configured bps', () => {
    const m = new FixedBpsSlippageModel(5) // 5 bps = 0.05%
    expect(m.fill(buy(),  { quote: quote(100) }).fillPrice).toBeCloseTo(100.05, 6)
    expect(m.fill(sell(), { quote: quote(100) }).fillPrice).toBeCloseTo( 99.95, 6)
  })
  it('rejects negative bps at construction', () => {
    expect(() => new FixedBpsSlippageModel(-1)).toThrow(/bps must be >= 0/)
  })
  it('accepts zero bps (degenerate to ZeroSlippage behavior)', () => {
    const m = new FixedBpsSlippageModel(0)
    expect(m.fill(buy(),  { quote: quote(100) }).fillPrice).toBe(100)
    expect(m.fill(sell(), { quote: quote(100) }).fillPrice).toBe(100)
  })
  it('scales bps regardless of price magnitude (no absolute-cents bug)', () => {
    const m = new FixedBpsSlippageModel(10)
    const cheap = m.fill(buy(), { quote: quote(5) }).fillPrice
    const expen = m.fill(buy(), { quote: quote(5000) }).fillPrice
    expect(cheap / 5).toBeCloseTo(expen / 5000, 6) // both = 1.001
  })
  it('reports name = "fixed-bps"', () => {
    expect(new FixedBpsSlippageModel(5).name).toBe('fixed-bps')
  })
})
