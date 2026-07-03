import { describe, expect, it } from 'vitest'
import { TOPSTEP_50K_XFA } from './topstep-50k-xfa'
import { getProfile, listProfileIds } from './index'

describe('Topstep $50K XFA preset', () => {
  it('locks the MLL once you cross initialBalance + dailyLossLimit', () => {
    expect(TOPSTEP_50K_XFA.trailingMaxDrawdownLockAt).toBe(1_000)
    expect(TOPSTEP_50K_XFA.initialBalance + TOPSTEP_50K_XFA.trailingMaxDrawdownLockAt).toBe(51_000)
  })

  it('caps daily loss at $1k and trailing drawdown at $2k', () => {
    expect(TOPSTEP_50K_XFA.dailyLossLimit).toBe(1_000)
    expect(TOPSTEP_50K_XFA.trailingMaxDrawdown).toBe(2_000)
  })

  it('flats at 4:10 PM ET', () => {
    expect(TOPSTEP_50K_XFA.flatBy.hour).toBe(16)
    expect(TOPSTEP_50K_XFA.flatBy.minute).toBe(10)
    expect(TOPSTEP_50K_XFA.flatBy.tz).toBe('America/New_York')
  })

  it('enforces only high-impact news blackouts in a ±60s window', () => {
    expect(TOPSTEP_50K_XFA.newsBlackoutImpacts).toEqual(['high'])
    expect(TOPSTEP_50K_XFA.newsBlackoutWindowMs).toBe(60_000)
  })

  it('caps ES at 5 contracts and MES at 50', () => {
    expect(TOPSTEP_50K_XFA.maxContracts.ES).toBe(5)
    expect(TOPSTEP_50K_XFA.maxContracts.MES).toBe(50)
  })

  it('falls through to defaultMaxContracts (1) for unknown symbols', () => {
    expect(TOPSTEP_50K_XFA.maxContracts.AAPL).toBeUndefined()
    expect(TOPSTEP_50K_XFA.defaultMaxContracts).toBe(1)
  })

  it('does not enforce consistency or min-days in the XFA Combine', () => {
    expect(TOPSTEP_50K_XFA.consistencyMaxDayFraction).toBe(0)
    expect(TOPSTEP_50K_XFA.minTradingDays).toBe(0)
  })

  it('exposes a $3,000 profit target', () => {
    expect(TOPSTEP_50K_XFA.profitTarget).toBe(3_000)
  })
})

describe('Profile registry', () => {
  it('lists topstep-50k-xfa', () => {
    expect(listProfileIds()).toContain('topstep-50k-xfa')
  })

  it('looks up by id', () => {
    expect(getProfile('topstep-50k-xfa')?.firm).toBe('topstep')
  })

  it('returns null for unknown ids', () => {
    expect(getProfile('nonsense')).toBeNull()
  })
})
