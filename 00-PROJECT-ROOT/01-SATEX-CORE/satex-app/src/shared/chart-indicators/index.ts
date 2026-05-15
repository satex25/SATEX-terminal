/**
 * Barrel for chart-indicators (Phase 11). Renderer and main may import from
 * here directly. Pure functions only — no side effects, no IO.
 */
export * from './types'
export { emaSeries, emaLatest } from './ema'
export { rsiSeries } from './rsi'
export { detectDoubleTops, type DoubleTopOptions } from './double-top'
export { detectDoubleBottoms, type DoubleBottomOptions } from './double-bottom'
export { computeFibonacci, type FibonacciOptions } from './fibonacci'
export { computePivotPoints, priorDayFromCandles, type PriorDay } from './pivot-points'
export { swingHighs, swingLows, averageVolume, type SwingPoint } from './swing-points'
