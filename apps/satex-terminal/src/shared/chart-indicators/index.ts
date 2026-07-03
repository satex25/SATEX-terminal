/**
 * Barrel for chart-indicators (Phase 11 + L1.D). Renderer and main may import
 * from here directly. Pure functions only -- no side effects, no IO.
 *
 * Selective re-exports only -- types/helpers used solely by sibling modules
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

// -- L1.D additions (CHART-15..20) -------------------------------------------

// CHART-15 -- Alt chart types (Renko, Line Break, Kagi)
export {
  type AltCandle, type RenkoOptions, type LineBreakOptions, type KagiOptions,
  renkoTransform, lineBreakTransform, kagiTransform,
} from './chart-types'

// CHART-16 -- Realized-vol surface (CONFIRM-OPT: no IV feed; computed from OHLCV)
export {
  VOL_LOOKBACKS, type VolLookback, type VolSurfacePoint, type RealizedVolSurface,
  logReturnStdev, annualize, computeVolSurface, computeVolSurfaceHistory,
} from './vol-surface'

// CHART-17 -- Correlation heatmap (watchlist x watchlist rolling correlation)
export {
  pearsonCorrelation, rollingCorrelation, alignSeries, correlationMatrix,
} from './correlation'

// CHART-18 -- No-code indicator builder (node graph, visual alerts only)
export {
  type GraphNode, type PipelineResult,
  evalPipeline, emaCrossPipeline, rsiAlertPipeline,
} from './indicator-graph'

// CHART-19 -- Pattern recognition (extends double-top/bottom with H&S, wedge, flag)
export {
  type PatternMatch, type PatternOptions,
  detectHeadShoulders, detectInverseHeadShoulders, detectWedges, detectFlags,
} from './patterns'

// CHART-20 -- Block print / large-trade detector (CONFIRM-L3: no L3 data; proxy)
export {
  type BlockPrint, type BlockPrintOptions,
  detectBlockPrints, blockPrintThreshold,
} from './block-prints'
