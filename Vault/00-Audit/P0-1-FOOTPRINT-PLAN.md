---
type: implementation-plan
title: P0-1 — Footprint Chart Layer + DeltaStrip
generated: 2026-05-15
status: deferred-to-next-session
source: docs/research/modern-terminal-survey.md §2 + the P0 ranked table
estimate: 2-3 days (confirmed after data-path investigation)
tags: [satex, phase-11, footprint, microstructure, plan]
---

# P0-1 — Footprint Chart Layer + DeltaStrip

> Forward-looking implementation plan written 2026-05-15 after investigating
> the data path. The original ROI table claimed "data dependency: Alpaca
> trades stream — already live." That premise turned out to be wrong.
> This doc lays out the actual path so a future session can pick up cold.

## Premise correction

`modern-terminal-survey.md` §2 says the footprint chart's data dependency is
"Alpaca trades stream — already live. Tag bid-hit vs ask-lift → bucket per
candle. Zero new API cost."

After verification:

- `src/main/services/depth-feed.ts` does **not** consume a trade stream. It
  synthesizes a deterministic 9-level ladder from `quote.bid` / `quote.ask`
  per tick. The `vpinEma` field is explicitly noted as a proxy because real
  VPIN requires buy/sell classification we don't have.
- `MarketDataSource` interface (`market-data.ts:17-26`) defines `onQuotes`,
  `onCandle`, `onNews` — there is **no `onTrades`** hook.
- Alpaca's free IEX tier doesn't expose per-trade with side; SIP+L2 does
  (paid). Currently SATEX boots in simulator mode unless paper keys are
  loaded; the simulator emits ticks via GBM but no discrete trade events
  with sides.

So the spec's "zero new API cost" was true only for the *paid* Alpaca tier.
For the dev environment + free tier, we need a synthetic-trade emission
path AND an Alpaca-trades-stream subscription path.

## Architecture (3 layers)

### Layer 1 — Trade event source

Goal: surface a typed `Trade { ts, symbol, price, size, side }` stream that
both renderer and engine can consume.

Files & edits:

1. `src/shared/types.ts` — new types:
   ```ts
   export type TradeSide = 'buy' | 'sell'
   export interface Trade {
     symbol: string
     ts: number
     price: number
     size: number
     side: TradeSide
     /** 'real' when from Alpaca SIP feed, 'inferred' when reconstructed from quote ticks. */
     provenance: 'real' | 'inferred'
   }
   ```

2. `src/main/services/market-data.ts` — extend `MarketDataSource`:
   ```ts
   onTrades(fn: (trades: Trade[]) => void): Unsub
   ```
   `MarketSimulator` emits **inferred** trades: on each tick, if price moved
   up classify as 'buy' (ask-lift), down as 'sell' (bid-hit), unchanged as
   the prior side. Size = the simulated volume increment for that tick.

3. `src/main/services/alpaca.ts` — when SIP+L2 entitlement is detected,
   subscribe to the `t.*` (trades) channel and pass `Trade` events through.
   Falls back gracefully to inferred on IEX-only.

4. `src/main/core/trading-engine.ts` — fan trade events into a new
   `tradeListeners` set; expose `onTrade()` hook on TradingEngine.

### Layer 2 — Per-candle aggregator

Pure module — no Electron, no IO. Easy to unit-test.

Files:

5. `src/shared/footprint-aggregator.ts` (new, pure):
   ```ts
   export interface FootprintBucket {
     priceLevel: number   // rounded to nearest tick
     bidVolume:  number   // aggressive-sell size at this level
     askVolume:  number   // aggressive-buy  size at this level
   }
   export interface FootprintCandle {
     candleTime: number   // candle bucket start (seconds, epoch)
     buckets: Map<number, FootprintBucket>
     totalBid:  number
     totalAsk:  number
     delta:     number    // totalAsk − totalBid
   }
   export class FootprintAggregator {
     constructor(private tickSize: number, private candleSec: number) {}
     ingest(trade: Trade): void { ... }
     forCandle(candleTime: number): FootprintCandle | null { ... }
     recent(limit: number): FootprintCandle[] { ... }
     clear(symbol: string): void { ... }
   }
   ```

6. Unit test stub: `src/shared/__tests__/footprint-aggregator.test.ts`. Run
   2000 synthetic trades, assert bucket sums match raw input. The spec's
   "100% match" validation criterion lives here.

### Layer 3 — Renderer overlay

Two new components, both canvas-2D for performance (200 candles × 4 panes
is well below the `lightweight-charts` cliff per the survey).

7. `src/renderer/components/FootprintOverlay.tsx`:
   - Props: `{ candles: FootprintCandle[], chartHeight, chartWidth, priceToY, candleX }`
     — the coordinate-mapping fns come from the parent `ChartPanel`
   - Renders per-candle 2-column histogram: bid volume (red, left half) and
     ask volume (green, right half) at each price level
   - Draws as a low-opacity overlay on top of the candles — does not
     replace them

8. `src/renderer/components/DeltaStrip.tsx`:
   - Props: `{ candles: FootprintCandle[], height: number }`
   - A single horizontal strip below the candle row: per-candle vertical bar
     whose height = |delta|, color = green if delta>0, red if delta<0,
     baseline at vertical center

9. New IPC channel `IPC.TRADES_TICK` (push: main → renderer). Trade events
   forward only for the currently-subscribed symbol (avoid bandwidth blow-up).
   Renderer maintains a per-symbol `FootprintAggregator` instance via a new
   `useFootprintStore` Zustand store.

10. Integration into `ChartPanel.tsx` and `QuadChartPanel.tsx`:
    - Single boolean prop `showFootprint` toggled from settings or workspace
      header
    - Pass the chart's `priceToY` / `candleX` coordinate-mapping callbacks
      to the overlay (lightweight-charts exposes these via series APIs)

## Validation criteria (carried from the spec)

| Check | Method | Pass threshold |
|---|---|---|
| Bid/ask split accuracy | Run `FootprintAggregator` over 2000 simulated trades; compare aggregated buckets vs raw input | 100% bucket sum match |
| Render perf | 200 candles × 4 panes with overlay enabled | ≥ 55 FPS sustained (lightweight-charts is canvas2D — fine until ~50k candles) |
| Memory | Heap snapshot after 1hr live | No leak > 2 MB / hr |

## Time budget (revised after investigation)

| Step | Effort | Risk |
|---:|:---|:---|
| 1. Trade type + interface | 0.5 h | low |
| 2. Simulator inferred-trade emitter | 2 h  | low — pure derivative of existing tick stream |
| 3. Alpaca SIP trades subscriber | 2 h  | low IF entitlement available; OFF if free tier |
| 4. FootprintAggregator + tests | 3 h  | low |
| 5. IPC channel + Zustand store | 2 h  | low |
| 6. FootprintOverlay canvas component | 6 h  | medium — coordinate mapping fiddly |
| 7. DeltaStrip component | 2 h  | low |
| 8. ChartPanel + QuadChartPanel integration | 3 h  | medium |
| 9. Settings toggle + persistence | 1 h  | low |
| 10. Manual visual QA + perf check | 2 h  | low |
| **Total** | **~24 h** | matches spec's "2-3 days" estimate |

## Order of operations

Land in this order so each step has a working app at the end:

1. Types (compile-only, no runtime change)
2. FootprintAggregator + tests (no UI, no main-process touch)
3. Simulator emitter (visible: enable trade events in dev mode; verify via
   log lines in DevTools console)
4. IPC channel + renderer store (no visible change yet; verify trade
   events flow through to renderer)
5. DeltaStrip on ChartPanel (visible: a thin strip appears below candles)
6. FootprintOverlay (visible: footprint histogram appears when enabled)
7. QuadChartPanel integration (visible across all 4 panes)
8. Settings persistence + toggle (final polish)
9. Alpaca trades subscriber (when paper credentials get tested)

## What can the user verify between commits?

After step 5 (DeltaStrip alone), the user can already see net order-flow
delta per candle in the live sim. That's most of the value of a footprint
chart for a discretionary trader — the per-level histogram is the cherry on
top.

## Out of scope for P0-1 (future enhancements)

- Iceberg detection (sub-pattern: same price level keeps refilling after
  large prints)
- Stop-detection (the Bookmap headline feature — needs full L2 history)
- Click-to-execute from heatmap (UX delight; depends on IB / Alpaca order
  placement)
- 3D DOM surface (Quantower-tier, low ROI for SATEX scale)

These belong in P1/P2 from `modern-terminal-survey.md` — pursue separately
when SATEX moves off IEX onto a tier that includes full L2.

## Related

- [[../../docs/research/modern-terminal-survey]] — §2 source spec
- [[SATEX-HANDOFF]] — §31 references this work as part of "redesign blueprint"
- [[MASTER-FIX-PLAN]] — does not block any S0/S1 item; can ship in parallel
- [[00-INDEX]]
