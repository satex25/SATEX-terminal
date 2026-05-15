/**
 * SATEX — Chart Indicators (Phase 11 · 2026-05-15).
 *
 * Separate from `shared/indicators.ts` (brain-feature scalars). These modules
 * produce SERIES, PATTERNS, and LEVELS for chart overlays. All pure,
 * deterministic, no side effects, main+renderer-safe.
 *
 * Input convention: candles are oldest-first (index 0 = oldest). All series
 * outputs align 1:1 with input candles (length-preserved, NaN for warm-up).
 */

import type { Candle } from '../types'

/** Stable identifier for each indicator. Used as the key in the toggle registry
 *  and the persisted Vault settings file. */
export type IndicatorId =
  | 'ema'
  | 'rsi'
  | 'double-top'
  | 'double-bottom'
  | 'fibonacci'
  | 'pivot-points'

export const INDICATOR_IDS: readonly IndicatorId[] = [
  'ema', 'rsi', 'double-top', 'double-bottom', 'fibonacci', 'pivot-points',
] as const

/** Default EMA periods exposed in the toggle UI. */
export const EMA_PERIODS = [9, 21, 50, 200] as const
export type EmaPeriod = (typeof EMA_PERIODS)[number]

/** Standard Fibonacci retracement ratios. 61.8 = golden. */
export const FIB_RATIOS = [0.236, 0.382, 0.500, 0.618, 0.786] as const

/** ───── Series outputs ────────────────────────────────────────────────────
 *  Same length as input candles. NaN fills warm-up positions where the
 *  indicator has insufficient data. */
export interface SeriesOutput {
  /** Indicator label, e.g. "EMA(21)". */
  label: string
  /** Length-matched array. NaN for warm-up positions. */
  values: number[]
}

/** ───── Pattern outputs ────────────────────────────────────────────────── */
export interface PatternPoint {
  /** Index into the input candles array. */
  index: number
  /** Price at the pattern point (the peak for top, trough for bottom). */
  price: number
  /** Candle timestamp (epoch seconds, copied from candle.time). */
  time: number
}

export interface DoublePattern {
  kind: 'double-top' | 'double-bottom'
  pointA: PatternPoint
  pointB: PatternPoint
  /** Neckline price (lowest low between A and B for top; highest high for bottom). */
  neckline: number
  /** Volume at peak B (for confirmation logic). */
  volumeB: number
  /** Average volume over the lookback window — for breakout-volume comparison. */
  avgVolume: number
  /** Tolerance achieved between peak A and B prices, expressed as fraction.
   *  e.g. 0.02 means 2% difference. Spec calls for ≤ 3%. */
  symmetry: number
  /** Index at which the neckline was broken (if confirmed), else null. */
  breakIndex: number | null
}

/** ───── Level outputs ─────────────────────────────────────────────────── */
export interface PriceLevel {
  /** Display label, e.g. "Fib 61.8%" or "R2". */
  label: string
  price: number
  /** Semantic role — drives default styling. */
  role: 'fib' | 'support' | 'resistance' | 'pivot'
}

export interface LevelsOutput {
  /** Anchor metadata so the consumer can decide when to recompute. */
  computedFromIndex: number
  levels: PriceLevel[]
}

/** ───── Pure helpers ──────────────────────────────────────────────────── */

/** Returns true if a value is finite (rejects NaN, ±Infinity). */
export function isFiniteNum(x: number): boolean {
  return Number.isFinite(x)
}

/** Re-export Candle for downstream convenience so consumers only depend on
 *  this barrel. */
export type { Candle }

/** ───── Persisted settings shape ──────────────────────────────────────────
 *  Shared type — main writes it to Vault/Settings/indicator-toggles.md, the
 *  renderer hydrates from it via IPC. Lives here (not in main/) so the
 *  preload bundle (which only aliases @shared) can import it cleanly. */
export interface IndicatorSettings {
  /** Schema version — bump if the shape changes incompatibly. */
  version: 1
  /** Per-indicator on/off. */
  enabled: Record<IndicatorId, boolean>
  /** Which EMA periods to draw when ema is enabled. */
  emaPeriods: EmaPeriod[]
  /** RSI lookback period. */
  rsiPeriod: number
  /** Fibonacci anchor lookback (bars). */
  fibLookback: number
}

export const DEFAULT_INDICATOR_SETTINGS: IndicatorSettings = {
  version: 1,
  enabled: {
    'ema':           true,
    'rsi':           false,
    'double-top':    false,
    'double-bottom': false,
    'fibonacci':     false,
    'pivot-points':  false,
  },
  emaPeriods:  [9, 21],
  rsiPeriod:   14,
  fibLookback: 50,
}
