/**
 * SATEX — Health Store (Zustand · P-037)
 *
 * Holds the latest fused `HealthReport` pushed from the engine's Self-Diagnostic
 * Core (HEALTH_REPORT, diff-gated). The HealthPanel reads from here. State is
 * Zustand per the load-bearing invariant — no cross-store coupling.
 */
import { create } from 'zustand'
import type { HealthReport } from '@shared/health/types'

const defaultReport: HealthReport = {
  severity: 'healthy',
  findings: [],
  recommendedAction: null,
  needsAttention: false,
}

interface HealthState {
  report: HealthReport
  setReport: (r: HealthReport) => void
}

export const useHealthStore = create<HealthState>((set) => ({
  report: defaultReport,
  setReport: (report) => set({ report }),
}))
