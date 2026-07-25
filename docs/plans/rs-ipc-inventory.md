# RS-1.6 — IPC Contract Inventory

```
[TASK]     RS-UP-1 / RS-1.6
[LEDGER]   P-142
[MEASURED] 2026-07-25 against mc4 master (post-RS-1.1)
[METHOD]   Mechanical — the app's own `typescript` transpiles src/shared/ipc-channels.ts
           to CJS, node evaluates it, and the exported `IPC as const` object is walked
           at runtime (scratchpad/ipc-inventory.mjs). NOT regex. Direction derived from
           the preload surface (src/preload/index.ts) and the single main-side
           `ipcMain.handle` wrapper (src/main/index.ts:675).
```

## The count question — RESOLVED: **124**

124 distinct channel constants, **zero duplicate string values**. This confirms the
constitution §1.1 figure (re-measured 2026-07-18) and supersedes the older "122"
(P-103 count method). Every channel value is the literal `satex:<domain>:<name>` string;
the constants live under `export const IPC = {…} as const`. `PUSH_CHANNELS` is an
internal (non-exported) array used only to derive the `PushChannel` type — not a
separate channel set.

## Direction breakdown (124 total)

| Direction | Count | Meaning |
|---|---|---|
| **invoke** (renderer→main, two-way, `.strict()`-validated req/reply) | 92 | called via `invoke(IPC.X)` in preload; registered through the `ipcMain.handle` wrapper (`index.ts:675`) |
| **event** (main→renderer push) | 26 | subscribed in preload's event surface, delivered via `webContents.send` |
| **flagged** (command-shaped; not in `preload/index.ts`) | 6 | have main handlers + schemas but no `preload/index.ts` reference — RS-9.3 must confirm their renderer wiring (secondary preload path or dead) |

## Schema source (the RS-9.2 DTO checklist)

`src/shared/ipc-schemas.ts` (405 lines) defines **124 zod schemas**, all `.strict()`
(unknown-key rejection — the P-103 law). This is the 1:1 DTO surface RS-9.2 must
satisfy: every row below maps to a `serde(deny_unknown_fields)` DTO, and RS-9.2's CI
coverage test asserts every inventory row has a registered Rust command/event and vice
versa (Appendix C step 3).

## EVENT channels (26 — main→renderer push)

- `ACCOUNT_UPDATE`
- `AUTONOMOUS_DECISION`
- `AUTONOMOUS_STATS`
- `CANDLES_BULK_REPLACE`
- `CANDLES_UPDATE`
- `DEPTH_UPDATE`
- `FEED_STATUS_UPDATE`
- `FUNDED_ACCOUNT_UPDATE`
- `HEALTH_REPORT`
- `LEARNER_STATS`
- `LOGS_TAIL`
- `MACRO_UPDATE`
- `NEWS_APPEND`
- `OBSERVER_STATS`
- `ORDERS_UPDATE`
- `QUOTES_TICK`
- `REGIME_UPDATE`
- `REPLAY_STATUS`
- `RISK_GATES_UPDATE`
- `SUBSECOND_CANDLES_UPDATE`
- `SYSTEM_STATUS`
- `TRADES_TICK`
- `TRADE_CLOSED`
- `UPDATE_AVAILABLE`
- `VAULT_STATS`
- `WIRE_UPDATE`

## FLAGGED channels (6 — verify renderer wiring at RS-9.3)

- `CHART_DRAWINGS_GET`
- `CHART_DRAWINGS_SET`
- `CHART_PNG_EXPORT`
- `FUNDED_ACCOUNT_ADVANCE_PHASE`
- `FUNDED_ACCOUNT_CLEAR`
- `FUNDED_ACCOUNT_SET_PROFILE`

## INVOKE channels (92 — renderer→main command, req/reply)

<details><summary>Full list</summary>

- `ALPACA_MODE_GET`
- `ALPACA_MODE_SET`
- `ALPACA_RECONNECT`
- `APP_RESTART`
- `AUTONOMOUS_CONFIG_GET`
- `AUTONOMOUS_CONFIG_SET`
- `AUTONOMOUS_DISABLE`
- `AUTONOMOUS_ENABLE`
- `AUTONOMOUS_RECENT`
- `AUTONOMOUS_STATUS`
- `BRAIN_DECISION`
- `BRAIN_GET`
- `CALIBRATION_GET`
- `CANDLES_GET`
- `CLOSED_TRADES_GET`
- `CREDENTIALS_CLEAR`
- `CREDENTIALS_GET_MASKED`
- `CREDENTIALS_SET`
- `CREDENTIALS_STATUS`
- `CSP_VIOLATION_REPORT`
- `DATA_SOURCE_GET`
- `DATA_SOURCE_SET`
- `DEPTH_GET`
- `DEPTH_SUBSCRIBE`
- `FUNDED_ACCOUNT_GET`
- `FUNDED_ACCOUNT_TRIGGER_FLAT`
- `HEALTH_CHECK`
- `INDICATORS_GET`
- `INDICATOR_PRIOR_DAY_HLC`
- `INDICATOR_SETTINGS_GET`
- `INDICATOR_SETTINGS_SET`
- `INTEL_GET`
- `INTEL_LAYOUT_GET`
- `INTEL_LAYOUT_SET`
- `JOURNAL_REFLECT`
- `LAYOUT_SAVE`
- `LEARNER_GET`
- `LEARNER_WEIGHTS`
- `LIVE_MODE_GET`
- `LIVE_MODE_SET`
- `LLM_CONFIG_GET`
- `LLM_CONFIG_SET`
- `LOGS_GET`
- `MACRO_GET`
- `MARKET_HISTORICAL_BARS`
- `OBSERVER_GET`
- `ORDERS_EXPORT_CSV`
- `ORDERS_HISTORY`
- `ORDER_CANCEL`
- `ORDER_SUBMIT`
- `REGIME_GET`
- `REPLAY_BOOKMARKS`
- `REPLAY_BOOKMARK_ADD`
- `REPLAY_BOOKMARK_DEL`
- `REPLAY_DELETE_SESSION`
- `REPLAY_IMPORT_HISTORICAL`
- `REPLAY_PAUSE`
- `REPLAY_RESUME`
- `REPLAY_SEEK`
- `REPLAY_SESSIONS`
- `REPLAY_SET_SPEED`
- `REPLAY_START`
- `REPLAY_STATUS_GET`
- `REPLAY_STOP`
- `RISK_GATES_GET`
- `RISK_KILL`
- `SELF_EVAL_GET`
- `SELF_EVAL_REPORT_GET`
- `SELF_EVAL_RUN`
- `SELF_EVAL_SET`
- `SESSIONS_LIST`
- `SESSIONS_SNAPSHOTS`
- `SNAPSHOT_EXPORT`
- `SUBSCRIBE`
- `SUBSECOND_CANDLES_GET`
- `SUBSECOND_PREFS_GET`
- `SUBSECOND_PREFS_SET`
- `TACTICS_GRADUATE`
- `TACTICS_STATUS`
- `UPDATE_INSTALL`
- `VAULT_CHECKPOINT`
- `VAULT_GET`
- `WATCHLIST_GET`
- `WATCHLIST_SET`
- `WINDOW_GET_ZOOM`
- `WINDOW_SET_ZOOM`
- `WINDOW_TOGGLE_DEVTOOLS`
- `WINDOW_TOGGLE_FULLSCREEN`
- `WIRE_GET`
- `WIRE_SET`
- `WORKSPACE_STATE_GET`
- `WORKSPACE_STATE_SET`

</details>

## Handoff to RS-9.2 / RS-9.3

1. RS-9.2 (`satex-ipc`) registers exactly 124 command/event DTOs; the CI coverage test
   fails if the count drifts from this inventory (regenerate via `ipc-inventory.mjs`).
2. Every DTO is `#[serde(deny_unknown_fields)]` — the Rust twin of zod `.strict()`; a
   fuzz-lite test rejects a payload with one extra key per DTO (the P-103 law).
3. RS-9.3's `window.satex` adapter must present the existing preload surface unchanged;
   the 6 flagged channels are the first thing to reconcile (are they live renderer
   calls via a secondary preload, or retired?).
4. Full per-channel {handler file:line, exact request/reply schema} enrichment is the
   RS-9.2 build's job — this inventory is its completeness skeleton, not its endpoint.
