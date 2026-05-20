# v0.6 "Black Box" — Terminal v3 design reference

**Source:** Claude-Design prototype (`standalone.html`), downloaded 2026-05-20
**Status:** Reference material. **Not yet implemented.** Adoption blocked on explicit unlock of locked design invariants (see §Conflicts).
**Owner:** Whoever picks up the v0.6 cycle (post-v0.4.4 cert, post-v0.5 RC).

---

## What's in this folder

| Path | Purpose | Bytes |
|---|---|---|
| `standalone.html` | The original Claude-Design bundler artifact. Double-click in a browser to view the live prototype with synthetic data. Self-contained — no network deps. | ~1.4 MB |
| `template.json` | Unpacked page template (the `<head>`+`<body>` scaffold, including CSS variables and font-face declarations). | ~9 KB |
| `unpack-bundle.cjs` | Node one-shot extractor. Re-extracts component sources from `standalone.html` into a sibling folder. Run: `node unpack-bundle.cjs standalone.html <outdir>`. | ~1.6 KB |
| `components/01-data-mockup.js` | `SX` namespace — Mulberry32-seeded synthetic OHLC + market data. Pure mockup, no real data. | ~17 KB |
| `components/02-side-panels.js` | Watchlist, L2 Depth, Regime, Execution Ticket, Top/Bottom bar JSX. | ~26 KB |
| `components/03-charts-v3.js` | `ChartCanvas` + `ChartToolbar` + `QuadChartV3` — interactive candles with zoom/pan, inline indicator toggles, per-chart `view` state. | ~24 KB |
| `components/04-workspace-views.js` | The six tab views: WorkspaceView, TradeView, FocusView, MarketsView, ReplayView, QuadView (+ HeatTape, FlowPanel, DomLadder, ScenarioGrid). | ~45 KB |
| `components/05-terminal-shell.js` | `Terminal` root — tab-routed shell with persistent rails, theme switcher (Classic/Mono/Blue-Yellow), `applyTheme()`, mounts to `#stage`. | ~27 KB |

**Intentionally NOT included** (kept on disk only via `standalone.html` if you need them):

- React + Babel vendor bundles (~4.5 MB). Reproducible from `npm install react react-dom @babel/standalone`.
- JetBrains Mono `woff2` font files (~86 KB across 6 unicode ranges × 5 weights). Already embedded in the standalone HTML; in production use Google Fonts CDN or a local copy from `npm i @fontsource/jetbrains-mono`.
- `tweaks-panel.jsx` — Claude-Design preview dev-tool (the `useTweaks` host protocol). Not part of the SATEX UI; lives only inside the design preview environment.

## How to view the prototype

```
1. Double-click standalone.html → opens in default browser
2. Resize the window to ≥ 1280×720; the page auto-scales to fit (the design canvas is 1920×1080).
3. Use the workspace tabs (Workspace / Trade / Focus / Markets / Replay / Quad) to explore.
4. The tweaks panel in the bottom-right (Claude-Design dev tool) lets you live-switch themes and toggle EMAs.
```

The prototype is fully interactive (synthetic ticks, drag-to-pan, scroll-to-zoom), but **no data is real** — every quote is generated client-side by `SX.tickEngine`.

---

## Design architecture (concrete facts from the unpacked code)

### Shell

- **`Terminal`** (in `05-terminal-shell.js:64`) is the root component. Mounted via `ReactDOM.createRoot(document.getElementById('stage')).render(<Terminal />)`.
- Tab-routed: `const [tab, setTab] = React.useState(t.startTab || 'quad')` — 6 tabs in `TAB_LABELS`.
- Persistent rails: left (watchlist), right (depth + regime + exec), bottom (portfolio · risk · positions · logs).
- Center swaps based on `tab` (`WorkspaceView`, `TradeView`, …).
- Stage is fixed 1920×1080 (`#stage { width: 1920px; height: 1080px }`) with a scale-to-fit transform in the page-level script.

### Color tokens (Classic theme, default)

```
--bg         #0a0a0e   /* main background */
--bg-deep    #050507   /* outermost */
--surf-1     #14141a   /* panel surface */
--surf-2     #1c1c24   /* nested surface */
--line       rgba(255,255,255,0.14)
--line-2     rgba(255,255,255,0.22)
--txt        #e8e8ec   /* primary text */
--txt-dim    #9a9aa4   /* secondary */
--txt-mute   #62626c   /* muted */
--accent     #00c8ff   /* cyan accent */
--accent-d   #0098c4
--pos        #21c97a   /* green — pos delta */
--neg        #ff4655   /* red — neg delta */
--warn       #f5a623   /* amber */
--gold       #c9a04a
--ema9       #f5c46a   /* gold-amber EMA9 */
--ema21      #b48cff   /* plasma purple EMA21 */
```

### Theme switcher (live)

`THEMES` constant in `05-terminal-shell.js:16-20`:

| Theme | --pos | --neg | --ema9 | --ema21 | --accent |
|---|---|---|---|---|---|
| classic | `#21c97a` | `#ff4655` | `#f5c46a` | `#b48cff` | `#00c8ff` |
| mono | `#f0f0f4` | `#8a8a92` | `#c8c8d0` | `#7a7a84` | `#cfcfd4` |
| bluyel | `#3b9eff` | `#f5c542` | `#ffd86b` | `#69b8ff` | `#3b9eff` |

`applyTheme(name)` mutates `document.documentElement.style.setProperty('--pos', …)` etc. so theme switches cascade through every CSS-variable-bound surface without rerender.

### Typography

JetBrains Mono — `300 / 400 / 500 / 600 / 700` weights, full Latin + Latin-ext + Greek + Cyrillic + Cyrillic-ext + Vietnamese unicode ranges. Body font is `'JetBrains Mono', ui-monospace, monospace` at 12 px base size with `font-variant-numeric: tabular-nums`.

### Component inventory (concrete; from `04-workspace-views.js` + `02-side-panels.js` + `03-charts-v3.js`)

| Component | File:line | Purpose |
|---|---|---|
| `Terminal` | 05:64 | Root shell, tab routing |
| `WorkspaceView` | 04:11 | Default workspace tab |
| `HeatTape` | 04:56 | Streaming flow heatmap |
| `TradeView` | 04:102 | Trade execution layout |
| `DomLadder` | 04:128 | L2 depth ladder (renderered inside TradeView's right pane) |
| `ScenarioGrid` | 04:183 | Scenario PnL preview grid |
| `FocusView` | 04:221 | Single-chart focus mode |
| `FlowPanel` | 04:275 | Trade flow panel (FocusView right pane) |
| `MarketsView` | 04:315 | Top-of-book grid + leaders + sparklines |
| `LeaderCard` | 04:446 | Top-of-day mover card |
| `RowSpark` | 04:478 | Per-row inline sparkline |
| `ReplayView` | 04:505 | Replay layout with scrubber + bookmarks |
| `ReplayScrubber` | 04:643 | Timeline + bookmark markers |
| `QuadView` | 04:691 | 2×2 chart grid |
| `QuadCell` | 04:774 | Single chart cell with chip row |
| `QuadFocus` | 04:892 | Expanded single cell |
| `ChartCanvas` | 03:88 | Core candle canvas (zoom/pan/inline ind toggles) |
| `ChartToolbar` | 03:435 | Symbol header + zoom buttons + indicator chips |
| `QuadChartV3` | 03:487 | Quad-aware wrapper for `ChartCanvas` |
| `Spark` | 02:7 | Mini SVG sparkline |
| (~15 more side-panel components in 02) | 02:* | Watchlist row, L2 row, regime KV, exec form fields, etc. |

Total **~30 hand-written components**, ~3,000 lines of code (excluding React/Babel vendor). All using inline `style={{ }}` props + CSS-variable refs; no CSS-in-JS lib, no css-modules.

### Data layer

- `SX.tickEngine.start()` + `SX.tickEngine.subscribe(callback)` — a synthetic tick stream
- `SX.genSeries({seed, n, start, vol, drift, regime})` — Mulberry32-seeded OHLC generator with regime modes ('trend' | 'chop' | 'breakout')
- `SX.sessionFor(utcHour)` — maps UTC hour to session label
- `SX.tickers[session]` — symbol roster per session

**There is no real-data binding.** The prototype is purely a visual spec; the entire data layer is mockup.

---

## Mapping to existing SATEX code (Tokyo Capital v0.4.x → Black Box v0.6)

| v0.6 prototype concept | Existing SATEX equivalent | Status |
|---|---|---|
| 6-tab routed shell (workspace/trade/focus/markets/replay/quad) | Workspace presets in memory: *Trade (default) / Focus / Markets / Replay (auto) / Quad* | Concept is already there. Names differ slightly. Routing is implicit in current workspace store. |
| Persistent left rail = watchlist | `WatchlistPanel.tsx` | Exists. |
| Persistent right rail = depth + regime + exec | `DepthPanel`, regime in micro-analysis, `ExecutionTicketPanel` | Exists, but laid out differently. |
| Bottom row = portfolio + risk + positions + logs | `PortfolioPanel`, `RiskGatesPanel`, positions in OrdersPanel, `LogsPanel` | Exists. |
| Theme switcher (Classic/Mono/Bluyel) | None | **New.** Would require a theme store + `applyTheme()` action + UI in Settings. |
| Tab routing (top-level `tab` state) | Workspace store with `activePreset` | Maps cleanly; rename + extend. |
| `--accent: #00c8ff` cyan | `var(--accent)` already cyan in `globals.css` | ✓ Already matches. |
| `--pos: #21c97a` / `--neg: #ff4655` | Already used (`COMPRESSION` green / `CAPITULATION` red regime palette) | ✓ Already matches. |
| `--ema9: #f5c46a` / `--ema21: #b48cff` (period-based EMA color) | Regime-driven EMA color via `regimeToEmaColor()` in `ChartPanel.tsx:86` | **Different model.** v0.6 colors by EMA period; current colors by HMM regime. Adoption means picking one or supporting both. |
| `ChartCanvas` (canvas-drawn candles) | `lightweight-charts` v5 series | **Different rendering tech.** v0.6 prototype uses raw `<canvas>` + custom draw; current uses Lightweight-Charts. Replacement = significant rewrite of `ChartPanel.tsx` (~1,500 lines). |
| Synthetic `SX.tickEngine` | Real `trading-engine.ts` + `LiveMarket` + Zustand stores | Prototype has no real-data binding — that's the integration work. |

---

## Conflicts with locked invariants (need explicit user unlock before adopting)

| Invariant (locked 2026-05-11 per memory `project_satex_godmode`) | v0.6 prototype |
|---|---|
| Vermilion `#E94B3C` brand-accent-only | Vermilion is **absent** from all three themes. The `radial-gradient(rgba(233,75,60,0.08))` ambient glow in `globals.css:145` would be removed. |
| Plasma purple BANNED | `--ema21: #b48cff` (plasma) is in the Classic default theme. |
| Tokyo Capital · Lacquer & Vermilion visual lock | v0.6 visual identity is "Black Box" — different. |
| Inter typeface BANNED | JetBrains Mono — **no conflict** (not Inter). |

User stated 2026-05-20: *"I love everything about this new redesign input. Use everything from this new Claude Design upgrade."* — this is an explicit but blanket override. The invariants above should be **explicitly retracted in memory** before any production code adopts them, so a future session doesn't accidentally trip over a stale "BANNED" rule.

---

## Realistic adoption plan (grounded, not the 5-week boilerplate)

Each phase is independently mergeable, cert-independent, and reversible. Numbers reflect *actual* effort estimates based on the unpacked code, not aspirational timelines.

### Phase 0 — Reference + unlock (this branch, ~now)

- ✅ Save standalone HTML + component sources in this folder (done)
- ☐ User retracts the three locked invariants (Tokyo Capital lock, plasma ban, vermilion brand-only) in memory by explicit instruction
- ☐ Decide: is v0.6 a side-by-side workspace mode (Settings → Theme: "Black Box") or a full replacement?

### Phase 1 — Token layer (~half a day)

- Add a *second* set of token CSS variables to `globals.css` under a `.theme-blackbox` class scope (so they don't override Tokyo Capital tokens at `:root`)
- Add a theme store: `useThemeStore` with `'tokyo-capital' | 'blackbox-classic' | 'blackbox-mono' | 'blackbox-bluyel'`
- Settings modal gets a Theme dropdown; selection toggles a class on `<body>`
- **Acceptance:** existing app still looks Tokyo by default. Selecting Black Box in Settings re-skins via CSS-only — no panel restructure.

### Phase 2 — Workspace preset rename + tab rail (~1 day)

- Map current workspace presets to the v0.6 6-tab naming
- Add a top tab rail UI element (visual, doesn't change which panels show)
- Wire `<body class="theme-…">` to the workspace tab so the rail reflects the active workspace

### Phase 3 — Chart layer decision (NOT a small step)

- Decide: rewrite `ChartPanel.tsx` to use the v0.6 `ChartCanvas` (raw canvas + custom draw, period-based EMA colors), OR keep Lightweight-Charts and just steal the legend/toolbar styling.
- The v0.6 prototype's chart implementation (~24 KB of code) replaces ~50% of `ChartPanel.tsx`. This is a multi-week effort and must be a **separate branch + design doc + sign-off**.

### Phase 4 — Real data binding

- The v0.6 components consume `SX.tickEngine` (synthetic). Production binding goes through the existing Zustand stores. Each component needs a wiring pass to swap `SX.*` calls for `useMarketStore` / `useDepthStore` / etc.
- This is where most of the actual integration cost sits — not the styling.

### Phase 5 — Hardening

- Accessibility (`aria-*`, keyboard nav)
- Performance (the v0.6 prototype runs at 1920×1080 with mockup data; real production has more density)
- Tests (zero new component tests in the prototype — every component would need at least smoke coverage)

**Honest estimate:** Phase 1 in one session. Phase 2 in one session. Phase 3 + 4 are each multi-session efforts. Phase 5 is ongoing.

The 4 sidecar `.md` docs in `mc4/UI REWORK/` claiming a 5-week roadmap with `<Button>`/`<Panel>`/`<Input>`/`<Badge>` component library are **not derived from the actual prototype** — the prototype has none of those abstractions. Treat those docs as boilerplate; this file is the real reference.

---

## Re-extraction recipe

If the bundle format changes or you want to inspect a fresher version:

```bash
cd 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/docs/design/v0.6-terminal-v3
node unpack-bundle.cjs standalone.html ./unpacked-fresh
# → unpacked-fresh/ now contains all 15 assets
# → fonts/ vendor bundles/ JSX components all extracted, mime-typed, sized
```

The `_manifest_summary.json` written by the script tells you which UUID maps to which file. Re-extracted JSX matches the canonical files in `components/` (this folder's versions are just renamed for human readability).
