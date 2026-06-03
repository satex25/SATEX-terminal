import { describe, expect, it } from 'vitest'
import { AlpacaSymbolResolver } from './symbol-resolver'
import { BrokerError } from '@shared/broker/broker-error'

describe('AlpacaSymbolResolver', () => {
  const r = new AlpacaSymbolResolver()

  it('returns identity for equity tickers', () => {
    expect(r.toBrokerSymbol('AAPL')).toBe('AAPL')
    expect(r.toBrokerSymbol('SPY')).toBe('SPY')
    expect(r.toCanonical('AAPL')).toBe('AAPL')
  })

  it('normalizes crypto canonical → broker (BTC → BTC/USD)', () => {
    expect(r.toBrokerSymbol('BTC')).toBe('BTC/USD')
    expect(r.toBrokerSymbol('ETH')).toBe('ETH/USD')
  })

  it('normalizes crypto broker → canonical (BTC/USD → BTC)', () => {
    expect(r.toCanonical('BTC/USD')).toBe('BTC')
    expect(r.toCanonical('ETH/USD')).toBe('ETH')
  })

  it('isSupported true for equity tickers in the UNIVERSE', () => {
    expect(r.isSupported('AAPL')).toBe(true)
    expect(r.isSupported('NVDA')).toBe(true)
  })

  it('isSupported true for crypto canonicals (BTC, ETH)', () => {
    expect(r.isSupported('BTC')).toBe(true)
    expect(r.isSupported('ETH')).toBe(true)
  })

  it('isSupported false for unknown tickers', () => {
    expect(r.isSupported('FAKETICKER')).toBe(false)
  })

  it('toBrokerSymbol throws SYMBOL_NOT_SUPPORTED for unknown canonical', () => {
    expect(() => r.toBrokerSymbol('FAKETICKER')).toThrow(BrokerError)
    try { r.toBrokerSymbol('FAKETICKER') }
    catch (e) {
      expect((e as BrokerError).code).toBe('SYMBOL_NOT_SUPPORTED')
      expect((e as BrokerError).broker).toBe('alpaca')
    }
  })

  it('toCanonical throws SYMBOL_NOT_SUPPORTED for unknown broker symbol', () => {
    expect(() => r.toCanonical('NONSENSE-PAIR')).toThrow(BrokerError)
  })
})
