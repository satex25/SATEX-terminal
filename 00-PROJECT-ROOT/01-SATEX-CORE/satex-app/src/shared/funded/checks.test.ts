import { describe, expect, it } from 'vitest'
import { checkAllowedAssetClass, checkMaxContracts } from './checks'
import { TOPSTEP_50K_XFA } from './topstep-50k-xfa'

describe('checkMaxContracts — known symbol (ES, cap 5)', () => {
  it('flat → buy 5 → OK (resulting +5)', () => {
    const r = checkMaxContracts('ES', 'buy', 5, 0, TOPSTEP_50K_XFA)
    expect(r.ok).toBe(true)
    expect(r.cap).toBe(5)
    expect(r.resultingAbs).toBe(5)
  })

  it('flat → buy 6 → REJECT (resulting +6 > 5)', () => {
    const r = checkMaxContracts('ES', 'buy', 6, 0, TOPSTEP_50K_XFA)
    expect(r.ok).toBe(false)
    expect(r.cap).toBe(5)
    expect(r.resultingAbs).toBe(6)
  })

  it('long 3 → buy 2 → OK (resulting +5)', () => {
    expect(checkMaxContracts('ES', 'buy', 2, 3, TOPSTEP_50K_XFA).ok).toBe(true)
  })

  it('long 5 (max) → buy 1 → REJECT (resulting +6)', () => {
    expect(checkMaxContracts('ES', 'buy', 1, 5, TOPSTEP_50K_XFA).ok).toBe(false)
  })

  it('long 5 → sell 1 (partial close) → OK (resulting +4)', () => {
    const r = checkMaxContracts('ES', 'sell', 1, 5, TOPSTEP_50K_XFA)
    expect(r.ok).toBe(true)
    expect(r.resultingAbs).toBe(4)
  })

  it('long 5 → sell 10 (flip to short 5) → OK (resulting abs 5)', () => {
    const r = checkMaxContracts('ES', 'sell', 10, 5, TOPSTEP_50K_XFA)
    expect(r.ok).toBe(true)
    expect(r.resultingAbs).toBe(5)
  })

  it('long 5 → sell 11 (flip to short 6) → REJECT', () => {
    const r = checkMaxContracts('ES', 'sell', 11, 5, TOPSTEP_50K_XFA)
    expect(r.ok).toBe(false)
    expect(r.resultingAbs).toBe(6)
  })

  it('short 5 → buy 1 (partial cover) → OK', () => {
    expect(checkMaxContracts('ES', 'buy', 1, -5, TOPSTEP_50K_XFA).ok).toBe(true)
  })

  it('short 5 → sell 1 (add) → REJECT', () => {
    expect(checkMaxContracts('ES', 'sell', 1, -5, TOPSTEP_50K_XFA).ok).toBe(false)
  })
})

describe('checkMaxContracts — unknown symbol falls through to defaultMaxContracts', () => {
  it('AAPL (not in map) → buy 1 → OK at default cap of 1', () => {
    const r = checkMaxContracts('AAPL', 'buy', 1, 0, TOPSTEP_50K_XFA)
    expect(r.ok).toBe(true)
    expect(r.cap).toBe(1)
  })

  it('AAPL → buy 2 → REJECT at default cap of 1', () => {
    expect(checkMaxContracts('AAPL', 'buy', 2, 0, TOPSTEP_50K_XFA).ok).toBe(false)
  })
})

describe('checkAllowedAssetClass', () => {
  it('Topstep profile is permissive in the Alpaca overlay (equity / future / crypto allowed)', () => {
    expect(checkAllowedAssetClass('equity', TOPSTEP_50K_XFA)).toBe(true)
    expect(checkAllowedAssetClass('future', TOPSTEP_50K_XFA)).toBe(true)
    expect(checkAllowedAssetClass('crypto', TOPSTEP_50K_XFA)).toBe(true)
  })

  it('index asset class is not in the default allowed list → REJECT', () => {
    expect(checkAllowedAssetClass('index', TOPSTEP_50K_XFA)).toBe(false)
  })
})
