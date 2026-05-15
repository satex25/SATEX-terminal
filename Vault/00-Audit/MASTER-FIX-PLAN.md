# SATEX MASTER FIX PLAN

**Generated:** 2026-05-14
**Source:** Forensic audit synthesis from 5 specialist agents (Architecture+IPC+State, Performance+Chart+MarketData, UI/UX, Trading Safety+Replay, Code Quality+DevOps).
**Methodology:** Every finding cites file:line. Brutal honesty — no sugarcoating, no hidden flaws.
**Repo:** `C:\Users\User\mc4\00-PROJECT-ROOT\01-SATEX-CORE\satex-app`

---

## Severity legend

- **S0 — Production-blocking.** Trading-correctness, data-loss, security, or crash-recovery risk. Must fix before any institutional deployment.
- **S1 — High.** Operational risk, user-facing breakage, regression-prone. Fix before 1.0.0.
- **S2 — Medium.** Quality/UX defect, latent risk, technical debt with measurable cost.
- **S3 — Low.** Polish, micro-optimization, comment/doc.

Each finding: file:line — issue — impact — fix — effort (h).

---

## Tier S0 — Production blockers

### S0-1 — No process-level error handlers
- **Where:** `main/index.ts:232-257`
- **Issue:** No `process.on('uncaughtException')` or `process.on('unhandledRejection')`. Any unhandled error in main process terminates silently.
- **Impact:** Main process crash → lost session, stranded orders, no crash logs, no audit trail.
- **Fix:**
  ```ts
  process.on('uncaughtException', (err) => { log.error('uncaught', {err: String(err), stack: err.stack}); gracefulShutdown() })
  process.on('unhandledRejection', (reason) => { log.error('unhandledRejection', {reason: String(reason)}); gracefulShutdown() })
  ```
- **Effort:** 2h (handler + gracefulShutdown helper that persists state).

### S0-2 — Renderer crash not auto-recovered
- **Where:** `main/index.ts:51-53`
- **Issue:** `render-process-gone` logged but no reload. User sees frozen window, must force-quit.
- **Impact:** Stuck app; any pending orders stranded; user loses workspace state.
- **Fix:** `mainWindow.webContents.reload()` after `render-process-gone`; on reload, renderer fetches latest session+order state from main via IPC.
- **Effort:** 3h (reload + state restoration handshake).

### S0-3 — Pervasive `void` async without try/catch
- **Where:** `core/trading-engine.ts:234-237, 264, 297` and 10+ other sites (`void this.syncAlpacaAccount()`, `void this.vault.writeSessionStart()`, etc.)
- **Issue:** Fire-and-forget async work; failures swallowed silently. Vault checkpoints can fail (disk full, permissions) and engine continues as if persisted.
- **Impact:** Silent data loss; incomplete trade logs; stale account state; brain learns from corrupted history.
- **Fix:** Wrap each in `try { await ... } catch (e) { log.error('<op> failed', {e}) }`. Never `void` critical operations.
- **Effort:** 4h (audit + wrap ~15 sites).

### S0-4 — Dual-control-surface sequencing trap (paper/live)
- **Where:** `services/alpaca.ts:133`, `services/alpaca-mode.ts`, `services/live-mode.ts`
- **Issue:** Endpoint mode (URL switch) and live-mode interlock (typed phrase) are independent. If operator flips endpoint to live BEFORE arming the interlock, AlpacaClient throws "Live trading requires explicit consent" — confusing because it implies endpoint is the problem, but the missing wall is the interlock.
- **Impact:** Procedural risk. No exploit path for unauthorized live submission (both walls required), but operators get unclear errors and may misconfigure.
- **Fix:** Enforce dependency order: require typed-phrase interlock armed *before* endpoint can flip to 'live'. Reject `setAlpacaMode('live')` if `isLive() === false`. Document the dual-wall design in operator manual + Settings modal copy.
- **Effort:** 3h (dependency check + UX copy + test).

### S0-5 — No CI/CD
- **Where:** repo root (`.github/workflows/` absent)
- **Issue:** No automated typecheck/test/build on commit. Broken builds can be packaged and shipped.
- **Impact:** Regressions reach users; release process is manual and error-prone.
- **Fix:** Add `.github/workflows/ci.yml` (typecheck + test on PR/push) and `.github/workflows/release.yml` (build + sign + publish on tag).
- **Effort:** 6h initial setup + tuning.

### S0-6 — `requestedExecutionLevel: requireAdministrator` unjustified
- **Where:** `electron-builder.yml:21`
- **Issue:** Forces UAC elevation on install/run; no documented reason. Unnecessary admin elevates blast radius if app is compromised.
- **Impact:** User friction, security surface expansion.
- **Fix:** Remove unless a specific reason (e.g., file-I/O outside userData) is documented. Default to `asInvoker`.
- **Effort:** 1h (verify + change + test installer).

### S0-7 — `news-title` / `cal-event-title` clip mid-sentence on small widgets
- **Where:** `globals.css:816-817, 878-879`
- **Issue:** `-webkit-line-clamp: 2` with no `max-height` fallback. On widgets <90 px tall, text clips harshly mid-sentence at 11.5 px font.
- **Impact:** Unreadable news/calendar items in compact layouts — directly maps to the user-reported "text overlaps and breaks in smaller modules."
- **Fix:** Add `max-height: 48px; overflow: hidden; word-break: break-word;` and visually test at 80 px height.
- **Effort:** 1h.

---

## Tier S1 — High priority (1.0.0 blockers)

### S1-1 — Quote-candle visual desync (50 ms vs 0 ms batching)
- **Where:** `core/trading-engine.ts:848`, `services/live-candle-buffer.ts:59`
- **Issue:** Quotes batched 50 ms; candles broadcast immediately per tick. User can see new candle bar paired with the previous quote — visual lag.
- **Impact:** "Candles update too slowly" complaint root cause #1.
- **Fix:** Batch both in one 50 ms window; emit tuple `(quotes[], candles[])` via a single IPC message.
- **Effort:** 4h.

### S1-2 — ChartPanel re-renders on every tick due to timestamp dep
- **Where:** `panels/ChartPanel.tsx:298-299`
- **Issue:** `series.update()` depends on `[quote?.last, quote?.timestamp, view]`; `timestamp` ticks 20 Hz even when price unchanged.
- **Impact:** Chart re-renders 20 Hz with no visual change → CPU burn, perceived stutter. Root cause #2.
- **Fix:** Drop `timestamp` from dependency array; depend on `quote?.last` and aggregated `view` only.
- **Effort:** 1h + verification.

### S1-3 — LiveCandleBuffer emits on every tick (360 events/s)
- **Where:** `services/live-candle-buffer.ts:52-60`
- **Issue:** `ingestTick()` emits the candle copy on every tick with `isNew=false` for intra-bar updates. 20 Hz × 18 symbols ≈ 360 Zustand updates/s.
- **Impact:** Root cause #3 of "slow" chart feel. IPC and React reconciliation pressure.
- **Fix:** Distinguish intra-bar vs. roll events. Emit only on bucket roll (1 s default) for `isNew=true`; for intra-bar, expose via a separate lightweight channel (e.g., `LIVE_PRICE`) consumed only by chart for `series.update()`.
- **Effort:** 6h (channel design + buffer refactor + ChartPanel rewire).

### S1-4 — Kill switch allows bracket exit orders
- **Where:** `services/order-manager.ts:111`
- **Issue:** Kill-switch armed → blocks entries but permits stop/TP bracket exits. If autonomous trader bracket-fill listener fires while killed, a position can be closed unintentionally.
- **Impact:** Operator expects "everything halted"; instead, exits continue.
- **Fix:** Either (a) require explicit operator override to allow exits when killed, or (b) document loudly in UI and operator manual. Recommend (a) for institutional posture.
- **Effort:** 3h + UX flag.

### S1-5 — Stale IPC contracts (orphan push channels)
- **Where:** `shared/ipc-channels.ts:17-20, 71`, `main/index.ts`, `preload/index.ts`
- **Issue:** `BRAIN_UPDATE`, `INDICATORS_UPDATE`, `LOG_EVENT`, `BRAIN_OUTCOME` declared but never pushed or listened.
- **Impact:** Contract drift. Future devs assume they're live; risk wiring against ghost channels.
- **Fix:** Remove from IPC registry, PUSH_CHANNELS array, preload. Run `tsc` to confirm no consumers.
- **Effort:** 1h.

### S1-6 — Electron BrowserWindow sandbox disabled
- **Where:** `main/index.ts:38` (`sandbox: false`)
- **Issue:** Preload runs with elevated OS permissions. With contextIsolation:true and nodeIntegration:false, sandbox:false is inconsistent with Electron security best practices.
- **Impact:** If renderer is compromised (XSS via news feed or AI insight injection), preload's Node API surface is accessible.
- **Fix:** `sandbox: true`. Verify preload still works; safeStorage may need IPC indirection.
- **Effort:** 4h (refactor preload if necessary).

### S1-7 — Logger has no rotation / no file sink
- **Where:** `services/logger.ts`
- **Issue:** Logs only stdout/stderr; no rotation, no persistence. Long-running session (>12 h) consumes memory unboundedly.
- **Impact:** OOM risk on overnight trading; no audit trail post-crash.
- **Fix:** Add `winston` or `pino` with file rotation (10 MB × 7 files in `userData/logs/`). Persist warn+error level always; info on debug toggle.
- **Effort:** 5h.

### S1-8 — No Windows code signing
- **Where:** `electron-builder.yml`
- **Issue:** Installer (.exe) unsigned. Triggers Windows SmartScreen warnings; enterprise rollout blocked.
- **Impact:** "Unknown publisher" prompts on install; some AVs flag unsigned binaries.
- **Fix:** Acquire Windows code-signing cert (.pfx); add `certificateFile` + `certificatePassword` (from env). Document signing procedure.
- **Effort:** 4h plus cert procurement (external).

### S1-9 — No auto-update mechanism
- **Where:** `package.json` (no `electron-updater`)
- **Issue:** Manual reinstall required for updates. Users stay on old builds; security fixes don't propagate.
- **Impact:** Stale fleet. Critical when paired with absent CI.
- **Fix:** Add `electron-updater` + signed release feed (GitHub Releases or self-hosted CDN). Implement update-prompt UI.
- **Effort:** 8h.

### S1-10 — Tick recorder/replay tape integrity unchecked
- **Where:** `services/tick-recorder.ts`, `services/replay-source.ts`
- **Issue:** Recorder writes tape; replay reads tape. No checksums, no invariant verification, no detection of tape gaps.
- **Impact:** Replay sessions can silently diverge from live recordings; reproducibility claim breaks.
- **Fix:** Tape header with hash of (session_id, tick_count, first_ts, last_ts); replay verifies on open and on close. Log mismatches at error level.
- **Effort:** 4h.

### S1-11 — Panel redundancy: WatchlistPanel ≈ TopMoversPanel
- **Where:** `panels/WatchlistPanel.tsx`, `panels/TopMoversPanel.tsx`
- **Issue:** Both render quote rows from same `marketStore.quotes`. TopMovers is a 5-row sorted subset.
- **Impact:** User confusion; wasted real estate; UI inconsistency. Maps to "duplicated/redundant modules" complaint.
- **Fix:** Merge TopMovers into WatchlistPanel as a "Movers" view mode (toggle: All / Gainers / Losers / Active).
- **Effort:** 6h.

### S1-12 — Panel redundancy: NewsPanel ≈ CalendarPanel
- **Where:** `panels/NewsPanel.tsx`, `panels/CalendarPanel.tsx`
- **Issue:** Calendar is `news.filter(n => kind in ['macro','breaking','earnings'])`. No unique rendering.
- **Impact:** Duplicate maintenance surface.
- **Fix:** Merge into NewsPanel with a "Calendar" view mode (filtered preset).
- **Effort:** 4h.

### S1-13 — MenuBar status pips have no `flex-shrink: 0`
- **Where:** `MenuBar.tsx:281-282`
- **Issue:** On screens <1100 px wide, status cluster compresses and pips overlap/clip.
- **Impact:** Status indicators invisible on 13" laptops at 1280×800.
- **Fix:** `flex-shrink: 0` on `.status-pip`, `.pip-dot`, `.tactics-pip`.
- **Effort:** 0.5h.

### S1-14 — IPC handlers lack consistent try/catch
- **Where:** `main/index.ts:100-227` (most async handlers)
- **Issue:** Async handlers (BRAIN_DECISION, ORDERS_EXPORT_CSV, etc.) can reject silently from renderer's perspective.
- **Impact:** Orders fail with no surfaced error; debugging is opaque.
- **Fix:** Standardize handler wrapper: `try { return {ok: true, data: await fn()} } catch (e) { log.error(...); return {ok: false, reason: String(e)} }`.
- **Effort:** 4h (wrap ~40 handlers + adjust callers).

---

## Tier S2 — Medium priority (quality / latent risk)

### S2-1 — Initial state broadcast flood at 1500 ms
- **Where:** `core/trading-engine.ts:246-254`
- **Issue:** Arbitrary 1500 ms setTimeout pushes initial snapshot; `broadcastContinuousStats()` (line 279) overlaps; first ticks duplicate state.
- **Fix:** Synchronous push immediately after `engine.initialize()`. Remove the timeout. Effort 2h.

### S2-2 — ChartPanel selector reacts to all symbols
- **Where:** `panels/ChartPanel.tsx:192`
- **Issue:** `selectCandles(symbol)` returns new ref on ANY symbol's candle update.
- **Fix:** Wrap selector in `useShallow`; depend on `quotes.get(symbol)` and `candles.get(symbol)` only. Effort 2h.

### S2-3 — DepthPanel inline selector
- **Where:** `panels/DepthPanel.tsx:43-44`
- **Issue:** `s => s.quotes.get(symbol)` creates new ref every parent render; ladder regenerates 1 Hz uselessly.
- **Fix:** `useMarketStore(useShallow(s => s.quotes.get(symbol)))`. Effort 0.5h.

### S2-4 — `marketStore.updateQuotes` always creates new Map
- **Where:** `stores/marketStore.ts:52-59`
- **Issue:** New Map ref even when no quote values changed.
- **Fix:** Shallow-compare and skip notify when batch contains only no-op updates; or adopt Zustand structural sharing. Effort 3h.

### S2-5 — Quote batch unbounded
- **Where:** `core/trading-engine.ts:843-848`
- **Issue:** No `QUOTE_BATCH_SIZE` cap; renderer lag can balloon `quoteBatch`.
- **Fix:** Flush on size ≥100 *or* 50 ms timeout, whichever first. Log if depth > 1000. Effort 2h.

### S2-6 — Order ID generator process-local counter
- **Where:** `services/id-generator.ts:5-11`
- **Issue:** Counter resets on restart; theoretical collision within ms window across restarts.
- **Fix:** Prefix with sessionId (UUID v4 per process start) so cross-restart collision impossible. Effort 1h.

### S2-7 — NullDB silent data-loss fallback
- **Where:** `services/persistence.ts:50-65`
- **Issue:** If `better-sqlite3` fails to load (native module mismatch), NullDB no-ops all writes silently.
- **Fix:** Startup integrity test (dummy insert + select). Fail fast in production (NODE_ENV check) with prominent error banner. Effort 2h.

### S2-8 — Credential plaintext fallback in production
- **Where:** `services/credential-store.ts:34-48`
- **Issue:** When `safeStorage.isEncryptionAvailable() === false`, writes plaintext JSON with WARN only.
- **Fix:** In `NODE_ENV === 'production'`, throw; never silently degrade. Effort 1h.

### S2-9 — No correlation/trace IDs
- **Where:** architectural
- **Issue:** Multi-step trade lifecycle (signal → entry → fill → close → learn) has no `traceId` linking logs.
- **Fix:** Add `traceId: string` UUID to every Order on creation; propagate through IPC and brain learning. Add `traceId` to all log entries that handle that order. Effort 6h.

### S2-10 — No explicit fetch timeout in AlpacaClient
- **Where:** `services/alpaca.ts:88-96`
- **Issue:** REST `fetch()` has no AbortController; can hang on slow Alpaca.
- **Fix:** 10 s for `/v2/orders` submit, 30 s for `/v2/account` and historical. Effort 2h.

### S2-11 — Replay does not block autonomous iteration
- **Where:** `core/trading-engine.ts:379`, `services/autonomous-trader.ts`
- **Issue:** Replay blocks at engine.submitOrder, but autonomous still iterates watchlist and runs decision logic.
- **Fix:** Check `engine.isReplaying()` in `autonomous.runCycle()` before iteration. Effort 1h.

### S2-12 — Audit UUID missing on order submission logs
- **Where:** `services/alpaca.ts:122-156`
- **Issue:** Logs at WARN level; no UUID to correlate submission ↔ trade update ↔ fill.
- **Fix:** Couple with S2-9 traceId; log `{traceId, orderId, side, qty, type}` at every step. Effort 1h (part of S2-9).

### S2-13 — Text overflow / layout (8 hotspots)
- **Where:** see UI/UX agent report — WatchlistPanel.tsx:78-79, TopMoversPanel.tsx:67, MarketsOverviewPanel.tsx:174, TickerRail.tsx:29, OrderBar.tsx:75/89/91/93, AIInsightsPanel.tsx:68/75, OrderTicketPanel.tsx:49, DepthPanel.tsx:104/106, globals.css:1039-1051.
- **Issue:** Missing `truncate`, `min-width: 0`, `minmax(0, …)`, mono-font tags, responsive flex-wrap.
- **Fix:** Apply class/style fixes per agent report; visually test at 1024 × 768 and within 80 px-tall widgets.
- **Effort:** 6h total.

### S2-14 — `BATCH_MS=50` and `MAX_CANDLES_PER_SYMBOL` magic numbers
- **Where:** `core/trading-engine.ts`, `services/live-candle-buffer.ts`
- **Issue:** Magic constants; no env override; no documentation of trade-off rationale.
- **Fix:** Move to `shared/constants.ts` with comment explaining latency/load trade-off; allow env override for advanced ops. Effort 1h.

### S2-15 — Logger configureLogger override timing
- **Where:** `services/logger.ts:22-25`
- **Issue:** `configureLogger()` can be called after services start; log behavior inconsistent.
- **Fix:** Call ONCE at startup, before any service init; assert on second call. Effort 1h.

### S2-16 — Hardcoded hex colors in JSX
- **Where:** `OrderBar.tsx` and a handful of other inline styles
- **Issue:** Bypass design tokens (CSS vars); theming swap won't propagate.
- **Fix:** Replace with `var(--…)`. Effort 1h.

### S2-17 — AIInsightsPanel Ring overflows small panels
- **Where:** `panels/AIInsightsPanel.tsx:68`
- **Issue:** 72 px Ring crushes content when widget height <120 px.
- **Fix:** Conditional smaller ring (48 px) or stacked layout. Effort 1h.

### S2-18 — Dropdown off-canvas on small screens
- **Where:** `globals.css:1039-1051`
- **Issue:** `min-width: 220px` fixed; can extend past right edge <1024 px.
- **Fix:** `max-width: calc(100vw - 20px)` and right-anchor fallback. Effort 1h.

---

## Tier S3 — Low priority (polish)

- **S3-1** MenuBar selector reads whole `status`/`account`; project to displayed fields only (`MenuBar.tsx:37-38`). 0.5h.
- **S3-2** Renderer console log rate-limit dedup (`main/index.ts:54-56`). 1h.
- **S3-3** market-observer ring buffer flush threshold tuning (`services/market-observer.ts`). 1h.
- **S3-4** `setAutonomousConfig` bounds check (clamp confidenceThreshold[0,1], notionalPct[0.01,0.5]) (`services/autonomous-trader.ts:80`). 0.5h.
- **S3-5** DepthPanel `.tot` column not using `var(--font-mono)`. 0.5h.
- **S3-6** Kill switch button uses Unicode `⏻` — replace with icon component. 0.5h.
- **S3-7** Formalize 6-level type scale (`--text-xs..xl`) and apply globally. 4h.
- **S3-8** Migrate spacing rhythm to 4/8/12/16/24 px standard. 3h.

---

## Major architectural initiatives (multi-week)

### A1 — Native low-timeframe candle support (5s / 10s / 30s)
- **Why:** User explicitly requested institutional-grade responsiveness; current 1 s base + client-side aggregation is wasteful and limits sub-1 m scalping.
- **What:**
  1. Parameterize `LiveCandleBuffer` / `ReplaySource` with `baseIntervalSec`.
  2. Add IPC `CANDLE_RESOLUTION_GET/SET`.
  3. Persist user choice; support hot-swap.
  4. Phase 2: multiple simultaneous buffers (one per TF) for instant switching.
- **Effort:** ~17 h Phase 1; +20 h Phase 2.

### A2 — Trading engine decomposition
- **Why:** Engine has 12+ timers and 4 cross-cutting responsibilities; shutdown sequence has 9 clearIntervals.
- **What:** Split into `OrderLifecycleCoordinator`, `ContinuousLearningCoordinator`, `ReplayManager`, `BroadcastCoordinator`. Each owns its timer set + cleanup.
- **Effort:** 24-32 h with regression tests.

### A3 — Institutional 3-rail UI redesign
- **Why:** Current spatial drag-drop model lacks Bloomberg/Reuters dock ergonomics. Polish score 4.2/10.
- **What:** Fixed 160 px left rail (Watchlist + Movers); responsive center (Chart + Depth/Heat/AI tabs); fixed 180 px right rail (OrderTicket + P&L + News collapsible). Move status to 24 px footer. Add `⌘⇧Z` density toggle (Compact / Normal / Spacious).
- **Effort:** 16-24 h core refactor + 8-12 h per dock section + 6-8 h density mode = 40-60 h.

### A4 — Observability stack (correlation IDs + persistent logs + crash dumps)
- **Why:** Mission-critical trading system needs end-to-end traceability and post-mortem capability.
- **What:** TraceId on every Order; winston/pino file sink with rotation; minidump on crash; Electron `webContents.on('crashed')` handler.
- **Effort:** 12-16 h.

### A5 — CI/CD + code signing + auto-update
- **Why:** Required for any institutional fleet rollout.
- **What:** `.github/workflows/{ci,release}.yml`; Windows .pfx cert; `electron-updater` integration.
- **Effort:** 14 h engineering + external cert procurement.

---

## Recommended sequencing

**Week 1 (S0):** S0-1 → S0-2 → S0-3 → S0-4 → S0-7. Plus S1-5 (orphan IPC) — trivial cleanup. ~20 h.

**Week 2 (S1 perf + safety):** S1-1, S1-2, S1-3 (chart latency root causes — biggest user-perceived win); S1-4 (kill-switch exits); S1-6 (sandbox); S1-13 (status pip flex-shrink). ~18 h.

**Week 3 (S1 ops):** S1-7 (logger), S1-8 (signing — start cert procurement); S1-10 (tape integrity); S1-14 (IPC try/catch). ~13 h + external.

**Week 4 (S1 UI consolidation):** S1-11 (Watchlist+Movers merge); S1-12 (News+Calendar merge); S2-13 (8 overflow hotspots). ~16 h.

**Weeks 5-6 (S2 cleanup):** S2-1..S2-12. ~22 h.

**Weeks 7-8 (S2 UI polish + S3):** S2-13..S2-18 + S3-1..S3-8. ~15 h.

**Weeks 9-12 (initiatives):** A1 (low-TF candles), A4 (observability), A5 (CI/CD + signing + auto-update).

**Weeks 13-16 (initiatives):** A2 (engine decomposition).

**Weeks 17-20 (initiatives):** A3 (institutional UI redesign).

**Total estimated effort to 1.0.0 institutional posture:** ~170-220 h focused engineering. Realistic on a single full-time engineer in 8-12 weeks with disciplined scope control.

---

## Production readiness gates

Mark each as **GO / NO-GO** for the named milestone.

### v0.4 — Paper-trading alpha (current target)
- [GO] Trading correctness: 9-gate validator + replay isolation present.
- [NO-GO until S0 done] Process error handlers + renderer recovery.
- [GO] Memory: no acute leaks; bounded buffers.
- [NO-GO until S0-7 done] News/Calendar small-widget text break.

### v0.7 — Internal beta (multi-user paper)
- [NO-GO] CI/CD (S0-5).
- [NO-GO] Persistent logs (S1-7).
- [NO-GO] Auto-update (S1-9).
- [NO-GO] Tape integrity (S1-10).

### v1.0 — Institutional release
- [NO-GO until A1] Native low-TF candles.
- [NO-GO until A3] 3-rail UI redesign with density modes.
- [NO-GO until S1-8] Code signing.
- [NO-GO until A4] Correlation IDs + crash dumps.
- [NO-GO until S0-4] Dual-control sequencing fix + operator manual.

### v1.0-LIVE — Live-capital enablement (separate gate)
- Independent risk review of: 9-gate validator, dual-wall design, autonomous paper-only enforcement, kill-switch behavior.
- External pen test of IPC surface and credential storage.
- Signed legal acknowledgement of "live capital" by operator.
- Reduced max-notional cap during initial 30-day live window.

---

## Final severity tally

- **S0:** 7 findings — production blockers.
- **S1:** 14 findings — high priority.
- **S2:** 18 findings — quality / latent.
- **S3:** 8 findings — polish.
- **Architectural initiatives:** 5 (A1-A5).

**Aggregate effort to institutional v1.0:** ~170-220 hours.

**Current SATEX status:** Production-grade scaffolding with serious production-readiness gaps. Not ready for institutional use. Suitable for single-user paper alpha after S0 batch lands.

---

## Related

- [[SATEX-HANDOFF]] — full production handoff (35 sections, this plan's source audit)
- [[MAY TACTICS]] — institutional quant tactics library (referenced by A1-A5 initiatives)
- [[00-INDEX|Vault Index]]
