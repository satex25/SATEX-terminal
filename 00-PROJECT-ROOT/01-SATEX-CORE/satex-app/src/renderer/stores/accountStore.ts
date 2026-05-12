/**
 * SATEX — Account & Orders Store (Zustand)
 */
import { create } from 'zustand'
import type { Account, Order, SystemStatus, IndicatorSnapshot } from '@shared/types'
import { STARTING_EQUITY } from '@shared/constants'

interface AccountState {
  account: Account
  orders:  Order[]
  status:  SystemStatus
  indicators: Map<string, IndicatorSnapshot>
  setAccount:    (a: Account) => void
  setOrders:     (o: Order[]) => void
  setStatus:     (s: SystemStatus) => void
  setIndicators: (sym: string, snap: IndicatorSnapshot) => void
}

const defaultAccount: Account = {
  equity: STARTING_EQUITY, cash: STARTING_EQUITY,
  buyingPower: STARTING_EQUITY * 2, openPositions: [],
  dailyPnl: 0, dailyLossLimitPct: 0.02, mode: 'paper',
  killSwitchArmed: false, sessionStartedAt: Date.now(),
}

const defaultStatus: SystemStatus = {
  connected: false, mode: 'simulator', tickHz: 0, latencyMs: 0,
  cpuPct: 0, memMb: 0, uptime: 0, lastError: null, lastTickIso: null,
}

export const useAccountStore = create<AccountState>((set) => ({
  account:    defaultAccount,
  orders:     [],
  status:     defaultStatus,
  indicators: new Map(),
  setAccount:    (account) => set({ account }),
  setOrders:     (orders)  => set({ orders }),
  setStatus:     (status)  => set({ status }),
  setIndicators: (sym, snap) => set(state => {
    const m = new Map(state.indicators)
    m.set(sym, snap)
    return { indicators: m }
  }),
}))
