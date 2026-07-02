/**
 * SATEX — Account & Orders Store (Zustand)
 */
import { create } from 'zustand'
import type { Account, Order, SystemStatus, IndicatorSnapshot, AutonomousStatus } from '@shared/types'
import { DEFAULT_EQUITY } from '@shared/constants'

interface AccountState {
  account: Account
  orders:  Order[]
  status:  SystemStatus
  indicators: Map<string, IndicatorSnapshot>
  /** Phase 10: lifted from per-component subscriptions so TopBar reads from store. */
  autonomous: AutonomousStatus | null
  setAccount:    (a: Account) => void
  setOrders:     (o: Order[]) => void
  setStatus:     (s: SystemStatus) => void
  setIndicators: (sym: string, snap: IndicatorSnapshot) => void
  setAutonomous: (s: AutonomousStatus) => void
}

const defaultAccount: Account = {
  equity: DEFAULT_EQUITY, cash: DEFAULT_EQUITY,
  buyingPower: DEFAULT_EQUITY * 2, openPositions: [],
  dailyPnl: 0, dailyLossLimitPct: 0.02, mode: 'paper',
  killSwitchArmed: false, sessionStartedAt: Date.now(),
}

const defaultStatus: SystemStatus = {
  connected: false, mode: 'simulator', tickHz: 0, latencyMs: 0,
  cpuPct: 0, memMb: 0, uptime: 0, lastError: null, lastTickIso: null,
  crypto: { connected: false, subscribedSymbols: 0 },
}

export const useAccountStore = create<AccountState>((set) => ({
  account:    defaultAccount,
  orders:     [],
  status:     defaultStatus,
  indicators: new Map(),
  autonomous: null,
  setAccount:    (account) => set({ account }),
  setOrders:     (orders)  => set({ orders }),
  setStatus:     (status)  => set({ status }),
  setIndicators: (sym, snap) => set(state => {
    const m = new Map(state.indicators)
    m.set(sym, snap)
    return { indicators: m }
  }),
  setAutonomous: (autonomous) => set({ autonomous }),
}))
