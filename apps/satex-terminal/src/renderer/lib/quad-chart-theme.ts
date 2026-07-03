/**
 * SATEX — Quad pane candle theming (2026-05-25).
 *
 * Maps the active theme's CSS tokens to lightweight-charts candlestick colors,
 * mirroring ChartPanel's theme-reactive effect so the Quad panes look identical
 * to the single chart. The one DOM dependency (reading a CSS custom property) is
 * injected via `readVar` — callers pass their `readCssVar`; tests pass a fake.
 */
import { applyOpacity } from './color'

export interface CandleColors {
  upColor: string
  downColor: string
  borderUpColor: string
  borderDownColor: string
  wickUpColor: string
  wickDownColor: string
}

/** Reads a CSS custom property value (e.g. ChartPanel's `readCssVar`). */
type ReadVar = (name: string) => string

/**
 * Candlestick series colors from `--bb-pos` / `--bb-neg`. Wicks render at 60%
 * opacity so they read as lighter accents over the dark background — the same
 * derivation ChartPanel uses. Falls back to the Classic green/red when the
 * tokens are absent (first paint before the theme is applied).
 */
export function candlestickColors(readVar: ReadVar): CandleColors {
  const pos = readVar('--bb-pos') || '#21c97a'
  const neg = readVar('--bb-neg') || '#ff4655'
  return {
    upColor:         pos,
    downColor:       neg,
    borderUpColor:   pos,
    borderDownColor: neg,
    wickUpColor:     applyOpacity(pos, 0.6),
    wickDownColor:   applyOpacity(neg, 0.6),
  }
}
