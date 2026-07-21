/**
 * SATEX — Account & Orders Store characterization coverage.
 *
 * Pins the reducer-like behavior of the renderer's central account/orders/status
 * store. TopBar, the risk display, and every equity readout flow from here
 * (P3, operator legibility). Characterization tests: they assert MEASURED current
 * behavior, not a spec, so a future refactor that silently changes a default,
 * breaks the DEFAULT_EQUITY invariant, or mutates a shared Map turns them red.
 *
 * Load-bearing behaviors pinned explicitly:
 *   1. DEFAULT_EQUITY invariant (§2.5 invariant 2) — initial equity/cash are
 *      DEFAULT_EQUITY and buyingPower is exactly 2x it; no STARTING_EQUITY symbol.
 *   2. setIndicators constructs a FRESH Map every call — the previous state's Map
 *      is never mutated (the P-061/P-074 shared-mutable-default class; the
 *      correctly-handled side, pinned so a "mutate in place for speed" refactor
 *      turns red).
 *   3. The four whole-slice setters replace by reference and disturb no sibling
 *      slice.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import type {
  Account,
  Order,
  SystemStatus,
  IndicatorSnapshot,
  AutonomousStatus,
} from '@shared/types'
import { DEFAULT_EQUITY } from '@shared/constants'
import { useAccountStore } from './accountStore'

function indicatorSnap(symbol: string, vwap = 100): IndicatorSnapshot {
  return {
    symbol, vwap, ema9: vwap, ema21: vwap, ema50: vwap,
    rsi14: 50, atr14: 1, trendStrength: 0, volatility: 0,
  }
}
function autonomous(enabled = true): AutonomousStatus {
  return {
    enabled, lastDecisionAt: null, approvedCount: 0, rejectedCount: 0,
    cooldownsActive: 0, signalsFired: 0,
  }
}
function account(equity = 123_456): Account {
  return {
    equity, cash: equity, buyingPower: equity * 2, openPositions: [],
    dailyPnl: 0, dailyLossLimitPct: 0.02, mode: 'live',
    killSwitchArmed: false, sessionStartedAt: 0,
  }
}

beforeEach(() => {
  useAccountStore.setState(useAccountStore.getInitialState(), true)
})

describe('accountStore — initial state', () => {
  it('seeds the DEFAULT_EQUITY account defaults', () => {
    const { account: a } = useAccountStore.getState()
    expect(a.equity).toBe(DEFAULT_EQUITY)
    expect(a.cash).toBe(DEFAULT_EQUITY)
    expect(a.buyingPower).toBe(DEFAULT_EQUITY * 2)
    expect(a.openPositions).toEqual([])
    expect(a.dailyPnl).toBe(0)
    expect(a.dailyLossLimitPct).toBe(0.02)
    expect(a.mode).toBe('paper')
    expect(a.killSwitchArmed).toBe(false)
    expect(typeof a.sessionStartedAt).toBe('number')
  })

  it('DEFAULT_EQUITY invariant — buyingPower is exactly 2x equity (§2.5 inv.2)', () => {
    const { account: a } = useAccountStore.getState()
    expect(a.buyingPower).toBe(a.equity * 2)
  })

  it('seeds a disconnected simulator status', () => {
    const { status } = useAccountStore.getState()
    expect(status.connected).toBe(false)
    expect(status.mode).toBe('simulator')
    expect(status.tickHz).toBe(0)
    expect(status.lastError).toBeNull()
    expect(status.lastTickIso).toBeNull()
    expect(status.crypto).toEqual({ connected: false, subscribedSymbols: 0 })
  })

  it('seeds empty orders, an empty indicators Map, and null autonomous', () => {
    const s = useAccountStore.getState()
    expect(s.orders).toEqual([])
    expect(s.indicators instanceof Map).toBe(true)
    expect(s.indicators.size).toBe(0)
    expect(s.autonomous).toBeNull()
  })
})

describe('accountStore — whole-slice setters', () => {
  it('setAccount stores the exact object by reference', () => {
    const a = account()
    useAccountStore.getState().setAccount(a)
    expect(useAccountStore.getState().account).toBe(a)
  })

  it('setOrders stores the exact array by reference', () => {
    const orders: Order[] = []
    useAccountStore.getState().setOrders(orders)
    expect(useAccountStore.getState().orders).toBe(orders)
  })

  it('setStatus stores the exact object by reference', () => {
    const status = { ...useAccountStore.getState().status, connected: true } as SystemStatus
    useAccountStore.getState().setStatus(status)
    expect(useAccountStore.getState().status).toBe(status)
    expect(useAccountStore.getState().status.connected).toBe(true)
  })

  it('setAutonomous stores the snapshot (null -> populated)', () => {
    const snap = autonomous(true)
    useAccountStore.getState().setAutonomous(snap)
    expect(useAccountStore.getState().autonomous).toBe(snap)
  })

  it('a setter disturbs no sibling slice', () => {
    const before = useAccountStore.getState()
    before.setAccount(account())
    const after = useAccountStore.getState()
    expect(after.orders).toBe(before.orders)
    expect(after.status).toBe(before.status)
    expect(after.indicators).toBe(before.indicators)
    expect(after.autonomous).toBe(before.autonomous)
  })
})

describe('accountStore — setIndicators (fresh-Map immutability, P-061/P-074 class)', () => {
  it('adds an entry without mutating the previous Map (fresh copy)', () => {
    const prevMap = useAccountStore.getState().indicators
    useAccountStore.getState().setIndicators('AAPL', indicatorSnap('AAPL'))
    const nextMap = useAccountStore.getState().indicators
    expect(nextMap).not.toBe(prevMap)        // new reference
    expect(prevMap.size).toBe(0)             // old map untouched
    expect(nextMap.get('AAPL')?.symbol).toBe('AAPL')
    expect(nextMap.size).toBe(1)
  })

  it('a second symbol coexists and again constructs a fresh Map', () => {
    const set = useAccountStore.getState().setIndicators
    set('AAPL', indicatorSnap('AAPL'))
    const afterFirst = useAccountStore.getState().indicators
    set('MSFT', indicatorSnap('MSFT', 200))
    const afterSecond = useAccountStore.getState().indicators
    expect(afterSecond).not.toBe(afterFirst)
    expect(afterFirst.size).toBe(1)          // first snapshot's map not mutated
    expect(afterSecond.size).toBe(2)
    expect(afterSecond.get('MSFT')?.vwap).toBe(200)
  })

  it('the same symbol overwrites in place (last write wins)', () => {
    const set = useAccountStore.getState().setIndicators
    set('AAPL', indicatorSnap('AAPL', 100))
    set('AAPL', indicatorSnap('AAPL', 150))
    const m = useAccountStore.getState().indicators
    expect(m.size).toBe(1)
    expect(m.get('AAPL')?.vwap).toBe(150)
  })
})
