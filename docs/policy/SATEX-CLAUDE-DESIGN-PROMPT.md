# SATEX TERMINAL v3 — "BLACK BOX EVOLVED" — FULL UI/UX OVERHAUL BRIEF

Paste everything below this line into Claude Design.

---

## 1. WHAT YOU ARE DESIGNING

A complete visual redesign of **SATEX**, a production-grade Windows-only Electron + React 19 + TypeScript trading terminal with a live-capital execution path (Alpaca). This is not a marketing site, not a dashboard mockup — it is a dense, operator-facing financial terminal that runs fullscreen for 8+ hours a day. The redesign must feel like institutional infrastructure: the lovechild of a Bloomberg terminal, a fighter-jet HUD, and a Teenage Engineering instrument. Push past what current trading UIs look like — but every pixel must survive translation back into our existing component tree without architectural surgery.

## 2. NON-NEGOTIABLE TRANSFER CONSTRAINTS (read first, obey always)

The output of this design must drop into a working codebase. Therefore:

1. **Single source of truth = CSS custom properties.** Every color, font-size, spacing, radius, and shadow in your design MUST be expressed as a token. Deliver a complete `:root` token block as plain CSS variables using our existing `--bb-*` namespace (extend it, don't replace it). Our current base tokens you must build on: `--bb-bg: #060607`, `--bb-bg-deep: #030304`, `--bb-surf-1/2/3` (#0d0d10 / #14141a / #1a1a20), `--bb-line: rgba(255,255,255,0.06)`, `--bb-txt: #d6d6d8`, `--bb-txt-strong: #f0f0f2`, `--bb-txt-dim: #7a7a83`, `--bb-accent: #00c8ff`, `--bb-pos: #21c97a`, `--bb-neg: #ff4655`, `--bb-warn: #f5a623`, `--bb-gold: #c9a04a`, `--bb-ambient: #e94b3c`. You may evolve the values; you may not abandon the token architecture.
2. **Typography is JetBrains Mono, exclusively** — display, body, and data. Our 9-step type scale is locked: `--text-2xs: 8.5px` → `--text-xs: 9.5` → `--text-sm: 10.5` → `--text-md: 11.5` → `--text-base: 12.5` → `--text-lg: 14` → `--text-xl: 16` → `--text-2xl: 18` → `--text-display: 36px`. Every font-size you specify must be one of these nine steps. No new sizes.
3. **Sharp corners. Zero border-radius, everywhere.** All `--r-*` and `--radius-*` tokens are 0. Hard edges are the brand. Soften with light, not with curves.
4. **Plain CSS + CSS variables, not styled-components, not Tailwind, not CSS-in-JS.** Output styles as vanilla CSS classes (our convention: `bb-` prefixed, e.g. `.bb-col-left`, `.bb-divider-v`, `.bb-trade-stack`). Layout is flexbox/grid with explicit named regions.
5. **Component-for-component mapping.** Do not invent new screen architecture. Design within the exact component inventory in §4 and name every designed element after the component it maps to. Each screen you produce must carry an annotation layer: `component name → file → tokens used`.
6. **No imagery, no gradients-as-decoration, no glassmorphism blur stacks** (Electron renderer perf budget: p50 ≤ 16ms/frame under tick-stream load). Ambient effects must be a single cheap radial gradient driven by `--bb-ambient`, and CSS transitions only on `opacity`/`transform`. Nothing that triggers layout thrash at 4–10 updates/sec per panel.
7. **Theme-ability via token override blocks only.** We ship multiple themes (Black Box, Classic, Mono, Bluyel) as `:root[data-theme="…"]` overrides. Your design must hold up if every `--bb-*` value is swapped; never hard-code a hex in a component style.
8. **Data colors are semantic and immutable in meaning:** `--bb-pos` = bullish/gain/long, `--bb-neg` = bearish/loss/short, `--bb-warn` = caution/pending, `--bb-accent` = interactive/selected/live, `--bb-gold` = premium/AI-derived insight. Never use red/green decoratively.

## 3. APPLICATION SHELL (fixed skeleton — restyle, don't restructure)

Vertical stack, edge-to-edge, no window chrome padding:

1. **TopBar** — brand mark, workspace tabs (`Focus | Trade | Quad | Markets | Replay`), symbol search, `FeedSwitch` (Simulator ⇄ Live Alpaca toggle — this is a safety-critical control, design it like an arming switch), session pill (market session state), connection state, clock.
2. **TickerTape** — full-width horizontal scrolling tape of watchlist symbols with price + delta.
3. **Main row** (three columns separated by 1px `--bb-line` dividers, no gaps — `--gap: 0`):
   - **Left rail:** `WatchlistPanel`.
   - **Center column:** swaps by workspace tab (layouts in §5).
   - **Right rail (top→bottom):** `DepthBookPanel`, `RegimeDashboardPanel`, `ExecTicketPanel`.
4. **MacroStripPanel** — thin horizontal strip under the center content: macro regime, VIX, yields, upcoming events.
5. **BottomBar** — system status line: equity, day P&L, risk-gate state, drawdown, latency, log ticker.
6. **Overlays:** `CommandPalette` (Ctrl+K, the power-user spine — design it as a first-class citizen), `Modal` system, `UpdateToast`, `TweaksPanel` (theme/density settings drawer).

## 4. COMPONENT INVENTORY (design every one; use these exact names)

**Panels:** ChartPanel (TradingView Lightweight Charts v5 host — design the chrome around it: header, timeframe rail, indicator legend, EMA tokens `--bb-ema9`/`--bb-ema21`, price scale, crosshair readout), QuadChartPanel + QuadPaneChart (2×2 synced multi-chart), DepthBookPanel (order-book ladder w/ imbalance visualization), TimeSalesPanel (tick tape w/ size-weighted rows), ExecTicketPanel (order entry: side, qty, stop, target, RR readout, risk-% readout — the most consequential surface in the app, see §6), RiskGatePanel (per-trade 1% / daily 2% / drawdown 5% gate states), RegimeDashboardPanel (HMM market-regime classification display), AIInsightsPanel (signal-convergence readout: layer-by-layer confidence 0.0–1.0, gold-accented), NewsDeskPanel + WirePanel (news/wire feeds w/ sentiment + source-confidence tags), CatalystsPanel (upcoming events), JournalPanel (trade journal entries), PortfolioMiniPanel, MarketsOverviewPanel (heatmap-style market summary grid), SystemLogsPanel (structured log stream), ReplayPanel (tape-replay transport controls: play/pause/speed/scrub — design like a pro audio transport), MacroStripPanel.

**Primitives:** PanelHead (universal panel header: title eyebrow, status chips, actions — single most-repeated element, get it perfect), StatPill, SessionPill, Sparkline, Ring (radial gauge), DeltaStrip, Dropdown, Icon set (stroke-based, 1px, mono-weight), Dragonfly (brand mark), FeedSwitch, CommandPalette, Modal, TweaksPanel, UpdateToast, BottomBar, TopBar, TickerTape.

**Mandatory state badges (canonical, single-source):** `SIM` badge (synthetic feed active) and `SUB` badge (sub-second crypto candles, 250/500ms buckets). These must be unmistakable at a glance — an operator must never confuse simulated data for live.

## 5. THE FIVE WORKSPACES (design all five as full screens)

- **Focus** — single large ChartPanel + MacroStrip. Maximum chart real estate.
- **Trade** — vertical stack: ChartPanel / TimeSalesPanel / AIInsightsPanel / JournalPanel + MacroStrip. The working cockpit.
- **Quad** — QuadChartPanel (2×2) + MacroStrip. Multi-asset monitoring.
- **Markets** — MarketsOverviewPanel grid + MacroStrip. The morning scan.
- **Replay** — ReplayPanel transport + ChartPanel. Forensic review mode; visually distinguish it (e.g., desaturated accent) so replayed data is never mistaken for live.

## 6. DESIGN DOCTRINE — WHERE TO PUSH

1. **Hierarchy through luminance, not color.** Four text tiers (`strong/txt/dim/mute`) and three surface tiers do the layout work. Color is reserved for meaning.
2. **Safety-critical controls get ceremony.** FeedSwitch live-arming, order submission in ExecTicketPanel, and risk-gate breaches deserve deliberate friction: confirmation states, distinct silhouettes, warn/neg token escalation, never one accidental click from capital.
3. **Confidence is a first-class visual primitive.** The system outputs calibrated 0.0–1.0 confidence everywhere (signals, news sources, regimes). Invent one consistent micro-visualization for confidence (segmented bar, ring fill — your call) and reuse it in AIInsightsPanel, NewsDeskPanel, RegimeDashboardPanel, ExecTicketPanel.
4. **Density modes.** Show Compact and Spacious as pure 9-token type-scale + spacing-token override blocks.
5. **Motion as information.** Price flashes (pos/neg row pulse), fill confirmations, gate trips — each ≤ 200ms, opacity/transform only, with a reduced-motion story.
6. **Empty/degraded states.** Design `UNKNOWN — SIGNAL INSUFFICIENT`, feed-disconnected, and `HALT` (kill-switch) states. A halted terminal should look halted from across the room.
7. **Breach the ceiling** in craft, not gimmicks: micro-typography (tabular numerals, em-dash alignment in ladders), 1px discipline, optical alignment of mono grids, a TickerTape and BottomBar that feel like precision instruments. No 3D, no skeuomorphism, no decorative noise.

## 7. REQUIRED DELIVERABLES (in this order)

1. **`tokens.css`** — complete `:root` block: all `--bb-*` colors, the 9-step type scale, spacing scale, z-index scale, shadow/elevation scale, motion-duration tokens, plus one full alternate-theme override block proving the system.
2. **Component sheet** — every primitive from §4 in all states (default/hover/active/disabled/focus-visible/loading/error), each annotated with its component name and tokens.
3. **Five workspace screens** at 1920×1080, fully populated with realistic data (real tickers, plausible prices, mixed pos/neg deltas, confidence scores).
4. **Safety-state screens** — live-armed TopBar, SIM-active, risk-gate VETO in ExecTicketPanel, system HALT.
5. **CommandPalette** open state over the Trade workspace.
6. **Handoff annotation pass** — for each screen, a margin layer mapping every region to `ComponentName.tsx` and listing the exact tokens consumed, so an engineer can diff your CSS against `globals.css` and migrate panel-by-panel with zero guesswork.

Generate the token system first, then primitives, then workspaces. Every downstream artifact must consume only tokens defined in deliverable 1.
