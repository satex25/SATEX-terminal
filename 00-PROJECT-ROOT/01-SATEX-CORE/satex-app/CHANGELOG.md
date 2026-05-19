# Changelog

All notable changes to SATEX (satex-app) are recorded here. Format roughly follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); we don't strictly follow
semver because the app is still pre-1.0 — minor bumps may introduce behavior
changes alongside fixes during the v0.x stabilization series.

## 0.4.3 (2026-05-19)

Technical-debt close-out + signing infrastructure. All seven v0.4.2-deferred
items shipped behind regression tests. Authenticode signing wiring is in
place but the installer remains **unsigned** pending CA-issued certificate
(see `certs/HANDOFF.md`).

### Tests
- **B1 — tick-recorder flush retry.** 4 new vitest cases pin the
  copy-don't-move semantics + bounded overflow + recovery + idempotency.
  Also fixes a latent v0.4.2 bug: the overflow drop sat on the success
  path where it could never fire; moved into the catch block where it
  actually caps recorder memory at ~1.6 MB during a long DB outage.
- **B2 — alpaca bid/ask sentinel.** 4 new cases pin the trade-frame
  `bid: 0, ask: 0` sentinel + the LiveMarket OR-fallback that preserves
  the prior quote spread. Volume/VWAP gating on `kind === 't'` also
  covered.
- **B3 — futures feed badge.** Extracted the `isSyntheticFeed` decision
  into `src/renderer/lib/feed-status.ts` as a pure function; 12 vitest
  cases over every (asset-class × feed-state) pair. WatchlistPanel
  imports from the lib module. Avoided installing `@testing-library/react`
  + `jsdom` by keeping the testable logic out of the React component.
- **B4 — replay clock anomaly.** 5 cases use `vi.setSystemTime` to
  simulate NTP step-backward and laptop suspend. Pin `autoPausedReason`
  semantics and the unpause/setSpeed baseline reset so manual pause +
  speed-flip don't trip the detector.
- **B5 — alpaca NaN injection (critical).** 12 new cases — 8 cover the
  WS-boundary `num()`/`ts()`/`sym()` guards directly; 4 cover the
  OrderManager Gate 0 `Number.isFinite(ctx.refPriceAge)` hardening.
  Hostile-frame payloads (object-shaped numerics, bad timestamps,
  100-char symbol DoS) verified to produce finite values + length-capped
  symbols across both equity and crypto handlers.

### Fixed / refactored
- **B6 — `STARTING_EQUITY` → `DEFAULT_EQUITY`.** Eight call sites
  renamed. Old name implied the live session-start equity; the value is
  in practice a constructor/display default that the OrderManager
  rebases on first Alpaca sync. Grep for `STARTING_EQUITY` in `src/`
  returns 0.
- **B7 — opt-in HW acceleration.** Default behavior preserved (HW accel
  DISABLED — safe for flaky Win11 GPUs) but now opt-in via
  `SATEX_HW_ACCEL=1` env var or `userData/enable-gpu.flag` file. On
  `child-process-gone` (GPU crash) the flag auto-deletes for the next
  boot, so one GPU crash heals itself.
- **B8 — `SATEX_VAULT_ROOT` env override.** Vault root resolution now
  honors the env var first; final fallback changed from `process.cwd()`
  to `userData/Vault` (cwd() in packaged installs lands on Program Files
  where writes either fail or pollute system paths).
- **B10 — initial-state push race removed.** The previous `setTimeout(
  1500ms)` in `app.whenReady()` pushed 12 channels at a hard-coded
  delay. Moved into the `SUBSCRIBE` IPC handler via `rebroadcastSnapshot()`
  so initial state ships on the renderer's actual readiness signal.
  Bonus: previous SUBSCRIBE pushed a `symbols.includes`-filtered
  `QUOTES_TICK` that was always empty (renderer passes `[]`) — now
  pushes the full snapshot.
- **B11 — `powerMonitor` lifecycle for TickRecorder.** Laptop
  suspend → recorder pauses. Resume → recorder resumes + force-flushes
  the in-memory buffer rather than waiting for the next 1s timer tick.
  Listeners off()'d in shutdown to prevent HMR leak.

### Security
- **B9 — CSP violation reporting.** New `CSP_VIOLATION_REPORT` IPC
  channel + Zod schema + preload bridge. Renderer's
  `securitypolicyviolation` event listener forwards each violation to
  main, where the rotating S1-7 file sink captures it at WARN level.
  Any future XSS-via-CSP-block attempt now leaves a forensic trail.

### Infrastructure
- **S1-8 (Authenticode signing).** Build wiring is cert-ready:
  - `electron-builder.yml` documents the `CSC_LINK` / `CSC_KEY_PASSWORD`
    env-var pair; sets `signingHashAlgorithms: [sha256]`.
  - `scripts/prepack-check.js` now warns (not fails) when those env
    vars are unset, so dev/smoke builds still produce an unsigned .exe
    without ceremony.
  - `certs/satex-codesign.inf` + `certs/satex-codesign.csr` generated
    on the build machine (private key in CurrentUser cert store, pending
    issued cert).
  - `certs/HANDOFF.md` documents the full CA-engagement workflow
    (Sectigo/DigiCert/SSL.com options + price + EV vs OV trade-offs;
    `certreq -accept` flow; PFX export; env-var-set + verify-signature
    commands). The actual procurement is unavoidably user-action (CA
    identity verification, payment, multi-day issuance) and remains the
    single v1.0 ship blocker.

### Tests
- Total: **164 / 164 passing** (up from 127 in v0.4.2; +37 across B1, B2,
  B3, B4, B5).

## 0.4.2 (2026-05-18)

### Fixed
- **Tick recorder data loss on flush failure (B1).** `flush()` previously moved
  the in-memory buffer reference into a local before calling `insertTickBatch`,
  so an insert error dropped the rows on the floor with only a `warn` log.
  Buffer is now copied (not moved), spliced only on insert success, and a
  failed flush leaves the buffer intact for the next retry. Bounded overflow
  at `MAX_BUFFER * 4` drops oldest rows during sustained outages, capping
  recorder memory at ~1.6 MB worst-case. `INSERT OR REPLACE` is idempotent
  on the `(session_id, ts, symbol)` PK, so retries can't double-write.
  Surfaced via `failedFlushCount` in `TickRecorder.stats()`.
- **Bid/ask flicker on trade frames (B2).** Alpaca's `t` (trade) frame carries
  no quote book data; the prior code cloned the trade price into `bid` and
  `ask`, which collapsed the LiveMarket spread to 0 on every trade and
  re-expanded it on the next `q` frame (~10×/sec flicker on liquid names).
  Trade frames now ship `bid: 0, ask: 0`; LiveMarket's existing OR-fallback
  preserves the prior quote-derived bid/ask. Replay tape unaffected — it
  records the LiveMarket-public Quote, not the raw tick.
- **Futures-feed badge (B3).** ES/NQ/CL/GC are in UNIVERSE but the IEX
  data feed carries no futures data; quotes for these symbols come from a
  synthetic GBM seed walk via `trading-engine.seedHistoricalCandles`. They
  used to look indistinguishable from live equity quotes in the WatchlistPanel.
  New `FEED_STATUS_UPDATE` IPC push surfaces per-asset-class feed state
  (`equity: 'live' | 'simulator' | 'off'`, `futures: 'live' | 'synthetic'`,
  `crypto: 'live' | 'off'`); WatchlistPanel renders a small SIM badge next
  to the ticker when the row's asset class isn't `live`. Diff-gated in the
  engine so the renderer doesn't re-render on every 2s heartbeat.
- **Replay clock backjump / suspend (B4).** `ReplaySource.tick()` computed
  cursor purely from `Date.now()`, so an NTP correction backward made the
  cursor regress (re-reading drained rows) and a laptop suspend made it
  jump forward by suspend×speed (silently snapping past hundreds of buckets
  beyond `MAX_ROLLS_PER_CALL`). Each tick now compares the wall delta
  against a 5-second anomaly threshold; on detection the source auto-pauses
  with `autoPausedReason` set to `'wall-clock-backjump'` or
  `'suspend-detected'`. ReplayPanel shows a human-readable note in the
  footer; the existing Resume button restarts cleanly because the tape has
  absolute timestamps.

### Added
- **`FEED_STATUS_UPDATE` IPC push channel** + `FeedStatus` shared type. Diff-gated
  emit from `TradingEngine.broadcastStatus` whenever an equity/crypto class
  changes connection state. Initial-state snapshot included in the post-init
  push block and the visibility-restore rebroadcast path.
- **`feedStore`** (Zustand) on the renderer side, subscribed via `useIPC`. The
  WatchlistPanel SIM badge reads from this store; future per-asset-class UI
  surfaces (depth panel, order-bar warning, etc.) can plug in without new
  IPC wiring.
- **`scripts/prepack-check.js`** + new `prepack:check` npm script chained into
  `pack:win`. Refuses to build if `src/main/index.ts` contains a hardcoded
  version literal — catches future drift the same way the 0.3.0→0.4.1 string
  silently drifted three releases.

### Security
- **NaN poisoning at WebSocket boundary (D6 · critical).** A crafted JSON
  frame from a compromised upstream proxy or MITM could put NaN into
  `q.volume`, `q.vwapNumer`, and `q.timestamp` via `Number(...)` /
  `new Date(...).getTime()`. The poisoning propagated permanently (NaN
  arithmetic stays NaN) and — worst impact — caused `refPriceAge = NaN` in
  the live order path, where the Gate 0 stale-quote check
  (`NaN > MAX_QUOTE_AGE_MS === false`) **failed open**, allowing orders to
  bypass freshness validation. New `num()`, `ts()`, and `sym()` helpers on
  `AlpacaClient` enforce `Number.isFinite` and a 16-char symbol length cap
  at the WS boundary; `OrderManager.validate` Gate 0 also rejects non-finite
  `refPriceAge` as defense-in-depth.

### Notes
- Test suite: 127/127 passing (same count as 0.4.1; no new cases were
  added with this release because all six fixes are observable in
  pre-existing test scaffolding or in runtime behavior the unit tests
  don't reach — added cases are deferred to 0.4.3).
- Installer still unsigned; SmartScreen warns on first install. Authenticode
  cert procurement (S1-8) remains the next operational blocker for clean
  end-user distribution.

## 0.4.1 (2026-05-18)

### Added
- Brand icon (ember colorway) embedded as multi-resolution `resources/icon.ico`.
  Replaces the prior `icon.png` reference in `electron-builder.yml` that
  pointed at a file that never existed; packaged builds used the default
  Electron icon as a result. Recipe documented in the project memory under
  `reference_logo_assets`.

## 0.4.0 (2026-05-18)

### Fixed
- 1 critical + 4 high + 13 medium/low findings from the 2026-05-17 audit
  (commits `4982185 .. f3ced80`). Highlights:
  - **Paper-mode sell-fill double-count** — `applyFill` no longer adds
    `cost + pnl` to cash; the realized PnL is already implicit in the sale
    proceeds. Pre-fix, every closed position inflated paper-mode cash by
    the PnL delta.
  - **Risk-gate daily-loss baseline** — gate now reads
    `getSessionStartEquity` instead of the `STARTING_EQUITY` constant. The
    constant lags any actual Alpaca account sync.
  - **Volume / VWAP inflation** — `LiveMarket.onTick` only accumulates
    `volume` and `vwap` on `kind === 't'` (trade) frames. Quote-update
    frames previously contributed bid+ask depth to the volume metric,
    inflating it ~10× and poisoning VWAP.
  - **Replay tick skip** — `ReplaySource.refillPrefetch` pages until the
    underlying `readTapeRange` returns fewer than `PAGE_LIMIT` rows. The
    prior single-read silently dropped 25-50% of ticks at ≥30× speed on
    live-recorded tape.
  - **Kill-switch disarm native dialog** — `IPC.RISK_KILL false` now goes
    through `dialog.showMessageBox` whenever live-mode is armed. Mirrors
    the live-mode enable interlock (C6) so a renderer compromise can't
    silently disarm via `window.satex.killSwitch(false)`.

### Security
- **Electron sandbox + CSP hardening (5 medium).** `sandbox: true` on the
  BrowserWindow webPreferences; `script-src 'self'` (no `'unsafe-inline'`)
  on the renderer CSP; scheme allowlist on `shell.openExternal`;
  `AutonomousConfig` Zod schema tightened to `.strict()`; IPC byte-size cap
  enforced via `Buffer.byteLength` (was `String#length`, ~4× looser on
  multibyte payloads).

### Reliability
- 10s timeout on every Alpaca REST call. Exponential backoff on equity,
  crypto, and account WebSocket reconnects (was fixed 5s / 3s — could storm
  unreachable endpoints during outages). `LiveCandleBuffer` fill-forward on
  bucket boundaries. Tick recorder uses feed-time (`q.timestamp`) instead
  of `Date.now()` so bucket alignment and replay clock anchor are accurate.

### Observability
- Rolling-window tick-Hz computation (was inverted by a stale `Date.now -
  lastTickAt` formula). Explicit no-quote rejection. SESSION_VAR "n/a" label.
  TRADES_TICK 50ms coalescing (matches the existing quote-batch cadence).
  Replay unknown-symbol warning so users see dropped tape rows.

### Post-stabilization pickups (same day)
- **Kill-switch persistence** — `kill-switch-store.ts` persists `{ armed,
  reason, armedAt, updatedAt }` to `userData/kill-switch.json`; boot
  restores armed state via `OrderManager.restoreKillSwitch`. Closes
  deferred item from issue #1.
- **Periodic tape-manifest reseal** — `TickRecorder` reseals every 5s during
  recording so a mid-session crash leaves a recoverable tape (`ok-extended`
  verdict instead of `no-manifest`). Closes deferred item from issue #1.
