/**
 * Barrel for chart-indicators (Phase 11). Renderer and main may import from
 * here directly. Pure functions only — no side effects, no IO.
 *
 * Selective re-exports only — types/helpers used solely by sibling modules
 * (e.g., swing-points, pivot-points internals) are imported directly from
 * their source files by tests/double-top/double-bottom, not via this barrel,
 * to keep the public surface tight.
 */
export {
  // public types + constants
  type Candle,
  type IndicatorId, type EmaPeriod, type IndicatorSettings,
  INDICATOR_IDS, EMA_PERIODS, FIB_RATIOS, DEFAULT_INDICATOR_SETTINGS,
} from './types'
export { emaSeries } from './ema'
export { rsiSeries } from './rsi'
export { detectDoubleTops } from './double-top'
export { detectDoubleBottoms } from './double-bottom'
export { computeFibonacci } from './fibonacci'
