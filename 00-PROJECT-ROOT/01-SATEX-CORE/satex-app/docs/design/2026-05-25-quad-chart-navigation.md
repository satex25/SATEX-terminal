# Quad chart navigation + data-coherence upgrade

**Date:** 2026-05-25
**Branch:** `feat/quad-chart-navigation` (atop `fix/offhours-chart-backfill-no-hijack`)
**Status:** design → implementing

## Problem (from live QA, 2026-05-25)

1. **Quad panes show flat lines at stale prices** (NVDA 965.20, SPY 608.45, BTC 103400.20).
   Root cause confirmed: `QuadChartPanel.usePaneData` returns a 2-bar **stub at the hardcoded
   `UNIVERSE.seed`** whenever a symbol's candle store is empty — which happens after a replay
   wipes/reseeds candles and the equity-only historical import never carried ES/BTC.
2. **Quad is "stuck on one visual per stock"** — the panes are a static hand-drawn SVG of
   `candles.slice(-140)` with a hover crosshair but **no pan / zoom / scrub**.
3. **Single chart shows gapped candles** during historical replay — sparse free-IEX 1-min bars.

## Decisions (user, via visual companion)

- **Engine:** adopt **lightweight-charts** (the engine the single Trade/Focus/Replay chart
  already uses) in every Quad pane, re-themed to the Black-Box palette. Replaces the bespoke SVG.
- **Navigation:** **independent per pane** — each pane has its own time window and is
  scrolled/zoomed on its own (native drag-pan + wheel-zoom). No shared/forced crosshair.
- **No sections / data overlaps:** each pane is an isolated chart instance fed *only* its own
  symbol's candles; empty → a clean "awaiting data" state, **never** a fabricated seed price.

## Architecture

### New component: `QuadPaneChart` (`src/renderer/panels/QuadPaneChart.tsx`)
A single self-contained lightweight-charts pane. Props: `{ symbol, emaPeriods, theme, expanded }`.
- On mount: `createChart` into its own container; add candlestick series + one line series per
  EMA period + (optional) VWAP line. Configure an **independent** time scale
  (`handleScroll`/`handleScale` enabled; `fitContent` on first data). Built-in crosshair.
- Subscribes to `useMarketStore(selectCandles(symbol))` — its sole data source. `setData` on
  bulk change, `series.update()` on the in-flight candle. EMA/VWAP/RSI derived via
  `@shared/indicators` (reuse — no new math).
- **Empty-state:** when the candle array is empty, render a centered themed
  "— awaiting <symbol> data —" overlay; do **not** create stub candles.
- **Theme-reactive:** maps `THEMES[candleStyle]` + `useChartOpts` to lightweight-charts options
  (transparent background, grid, up/down, crosshair); re-applies on theme change.
- Disposes the chart on unmount / symbol change (no leaks, no stale series).

### `QuadChartPanel` (rewrite)
- 2×2 grid of `QuadPaneChart`, plus the existing **symbol-swap picker** and
  **click-to-expand** (1-of-4 focus) — both preserved.
- **Removes:** the shared `hover` crosshair state, the hand-drawn SVG `ChartCanvas`, the
  `usePaneData` stub, and the local `emaSeries/vwapSeries` SVG plumbing (~300 lines deleted).
- RSI14 stays in each pane header (computed from the same candles).

### Data coherence
- Empty panes no longer mask the problem with a seed stub — they show "awaiting data" until
  real candles arrive (live sim/stream, or the post-replay reseed).
- **Off-hours backfill reuse:** when a pane is empty *and* the market is closed *and* the symbol
  is equity/index, reuse `planLastSessionBackfill` + `window.satex.getHistoricalBars` (from the
  hijack-fix branch) to silently populate that pane's candles — same replay-free path, per pane.
  Futures/crypto (ES/BTC) fall back to the live stream / "awaiting data".

### Single-chart gaps (`ChartPanel`)
- Verify the time-scale config packs contiguous bars (lightweight-charts spaces by data index,
  not wall-clock, so sparse bars render adjacent). If gaps persist, ensure the historical feed
  yields contiguous bars and the series isn't padded with whitespace points. Scoped as a
  follow-on within this effort; the Quad rebuild is primary.

## Testing (Vitest, Node — no jsdom)
- Pure helpers extracted and unit-tested: theme→lightweight-charts options mapper; EMA/VWAP
  series derivation (if not already covered); the "empty vs has-data" decision.
- lightweight-charts rendering itself is validated by the existing **renderer perf canary** +
  manual QA (offscreen E2E for boot-without-crash on Quad).
- Regression guard: a pane fed an empty candle array yields the empty-state result, **never**
  a seed-priced candle.

## Out of scope
- Synced navigation (option A) — can add an "unlink/link" toggle later (YAGNI now).
- Replacing the single `ChartPanel` wholesale — it works; only the gap behavior is touched.
