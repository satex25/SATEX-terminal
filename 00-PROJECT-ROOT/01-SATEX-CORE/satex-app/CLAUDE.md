# SATEX App — Project Notes

## Health Stack

- typecheck: npm run typecheck
- lint: npm run lint
- test: npm test
- deadcode: npm run knip

## Renderer perf canary (v0.6)

Opt-in frame-budget E2E (NOT in CI — CI is typecheck + vitest only). Run before a
renderer-heavy release:

```powershell
npm run build
$env:SATEX_E2E_PERF='1'; npx playwright test tests/e2e/renderer-perf.spec.ts
```

Boots isolated + offscreen (throwaway `--user-data-dir`/`SATEX_VAULT_ROOT`, and
`SATEX_SIMULATOR_24_7=true` so candles stream off-hours), drives the Trade `ChartPanel`, and
asserts p50 ≤ 16 ms + p95 ≤ 10 ms under symbol-rotation + tick-stream load. The percentile
math + profiler lifecycle are unit-tested in `src/renderer/lib/perf.test.ts` (runs in CI).
Design + the full diagnosis trail: `docs/design/2026-05-22-renderer-perf-budget.md`.

## Data-feed switch (Simulator ⇄ Live Alpaca)

Runtime market-data-feed toggle in the TopBar (`FeedSwitch.tsx` → `dataSourceStore` → IPC
`DATA_SOURCE_SET` → `engine.setDataSource`). Reconciliation is reset-to-clean (OrderManager
`resetToPaper` on →Sim; `syncFromAlpaca` on →Live). Interlock logic is the pure, unit-tested
`data-source-guard.ts`. Paper-safe (blocked while real-capital armed / replay active).
Opt-in E2Es: `$env:SATEX_E2E_FEED='1'; npx playwright test tests/e2e/feed-switch.spec.ts`
(switch + rollback) and `tests/e2e/creds-persistence.spec.ts` (keys survive relaunch).
Design: `docs/design/2026-05-24-data-feed-switch.md`.

## v0.4.4 — Sub-second crypto candles (2026-05-19)

Commits riding into the v0.4.4 cut:
- `d962539` docs(design) — A1 sub-second candles design doc
- `24d496d` feat(a1) Sprint 1 — aggregator + SQLite table + IPC + store + ChartPanel timeframe buttons
- `a71caac` refactor(a1) — class rename SubSecondAggregator → SubSecondCandleAggregator
- `3ebbd67` chore(health) — lint cleanup (12 → 0 warnings) + dead-code purge (66 → 0)
- `81f724e` feat(a1) Sprint 2 — per-symbol bucket pref + SUB legend badge

### Sprint 2 surfaces

1. **Per-symbol bucket preference (Settings UI)**
   - Location: `Settings → Sub-second Candles · Crypto only`
   - One row per crypto symbol from `UNIVERSE.filter(u => u.assetClass === 'crypto')` (BTC, ETH today; auto-extends if the universe grows)
   - `.seg` toggle: 250 ms / 500 ms, persisted via `SubsecondPrefsService`
   - File: `Vault/Settings/subsecond-prefs.md` (markdown + JSON fence, hand-editable)
   - IPC: `SUBSECOND_PREFS_GET` (no payload) / `SUBSECOND_PREFS_SET` (Zod `SubsecondPrefsSetReq`, `.strict()`, `{250|500}` literal-union)

2. **Chart legend SUB badge (design doc §4.3 marker)**
   - File: `src/renderer/panels/ChartPanel.tsx` line 1073
   - JSX: `{showSub && <span className="bb-sub-badge" ...>SUB · {subBucketMs} ms</span>}`
   - Gate: `showSub = isSubsecondTimeframe(tf) && isCryptoSymbol` (single source of truth — same pattern as the SIM badge gated by `isSyntheticFeed`)
   - CSS: `src/renderer/globals.css` (`.bb-sub-badge`) — brand-accent cyan `var(--accent-soft)` / `var(--accent-glow)` (resolves to `#00c8ff`), visually distinct from the warn-yellow SIM badge

3. **Auto-snap on crypto symbol focus**
   - File: `src/renderer/panels/ChartPanel.tsx` around line 213
   - `prevSymbolRef` gate: fires only on actual symbol change (initial mount included via null sentinel)
   - Non-crypto + no-pref are both no-ops — never surprises the user with a tf they didn't pick

### Engine API additions (`subsecond-aggregator.ts`)

- `setPreferredBucket(symbol, ms)` — silently rejects non-crypto, fires `onPreferenceChanged`
- `getPreferredBucket(symbol)` — defaults to 250
- `hydratePreferredBuckets(prefs)` — bulk restore on boot (REPLACES, doesn't merge)
- `getAllPreferredBuckets()` — fresh snapshot for IPC response (mutation-safe)
- `getCandleResolutionMs(symbol)` — returns 1000 for non-crypto so existing 1s consumers keep their contract

### Health score (locked at 10/10)

| Gate | Result | Notes |
|---|---|---|
| `npm run typecheck` | 0 errors | node + web tsconfigs |
| `npm run lint` | 0 warnings, 0 errors | floor; 12 prior cleared in `3ebbd67` |
| `npm test` | 222/222 passed (17 files) | +26 cases from Sprint 2 (11 aggregator prefs, 15 prefs service round-trip) |
| `npm run knip` | 0 unused files / exports / types / deps | floor |

### CI

`.github/workflows/ci.yml` runs typecheck + vitest on Ubuntu Node 20.19 on every push to master / PR.
Last run for `81f724e`: ✅ success in 59s.
(CI does NOT cover lint or knip — those gates are local-only today.)

### Manual QA still needed before release

Code-path verification was complete in the Sprint 2 session. The following require interactive QA in a live Electron window:
- Click 250 / 500 in Settings → reopen modal → verify the choice persisted
- Restart the app → reopen Settings → verify pref still loaded from disk
- Switch from NVDA → BTC with a BTC pref of 500 → verify timeframe auto-snaps to `500ms` and the SUB badge appears
- Switch from BTC at `250ms` → ETH (also crypto) → verify chart stays in a coherent state (no NaN, no broken bars)
- Hand-edit `Vault/Settings/subsecond-prefs.md` with a bogus value (`"BTC": 100`) → restart → verify sanitizer drops the bad entry

### Known blocker for shipping v0.4.4

**S1-8 Authenticode certificate procurement.** CSR is at `00-PROJECT-ROOT/01-SATEX-CORE/satex-app/certs/satex-codesign.csr`; `electron-builder.yml` picks up `CSC_LINK` + `CSC_KEY_PASSWORD` automatically. Once a `.pfx` lands on the build machine, `npm run pack:win` produces a signed installer with zero code changes. See `certs/HANDOFF.md` for the CA workflow. This is unavoidably user-action (pick CA → pay → submit identity docs → wait 3-15 business days).
