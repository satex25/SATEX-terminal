/**
 * SATEX — System Logs Tail Store (Phase 10 · Black Box)
 * Subscribed to LOGS_TAIL push channel via useIPC.
 */
import { create } from 'zustand'
import type { SystemLogEntry, SystemLogsTail } from '@shared/types'

interface LogsState {
  tail: SystemLogEntry[]
  setTail: (s: SystemLogsTail) => void
}

export const useLogsStore = create<LogsState>((set) => ({
  tail: [],
  setTail: ({ lines }) => set({ tail: lines }),
}))
