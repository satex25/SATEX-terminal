# ULTRAPLAN — persistence.ts characterization coverage (P-094 final pick) + brain NULL-PK upsert fix (P-113)

Date: 2026-07-17 (dawn session, real fire ~20:43 CDT — off-nominal evening run)
Author: dawn planner (Claude Fable 5), unattended
Ledger: P-094 (persistence portion) + NEW P-113 (defect found during Layer-2 domain probing)

## Layer 1 — OBJECTIVE

Close P-094's last safe autonomous pick by shipping a characterization suite for
`src/main/services/persistence.ts` (992 LOC, 13-table SQLite layer), and fix the live
defect the domain probe proved: `upsertBrainParam` uses `INSERT OR REPLACE` on
`brain(key, symbol)` whose composite PK treats `symbol NULL` as always-distinct, so the
Brain's 8 global params append a NEW row on every `learn()` — unbounded growth + a
restore path (`Brain.initialize()`, brain.ts:63) that only reads the newest value by
accident of PK-index scan order.

Success criteria:
- New `persistence.test.ts` measured green (Linux better-sqlite3 11.10.0 harness).
- Regression pins: 3 null-symbol upserts of one key ⇒ exactly 1 row, newest wins;
  pre-seeded duplicate rows ⇒ deduped to newest-per-key by the migrate() cleanup.
- `persistence.ts` subject diff limited to: `upsertBrainParam`, one dedup statement in
  `migrate()`, header schema comment truth-fix (5 tables listed vs 13 real).
- typecheck node+web exit 0; eslint scoped exit 0; full vitest + knip = CI arbiter.

Constraints: §2.4 perimeter untouched (verified in Layer 2 — no order path, no risk
gates, no kill switch, no live-mode, no update feed). Everything UNSTAGED. Tracked-file
edits via bash mount only (P-099).

Assumption flagged: in-mount vitest boot exceeded the sandbox 45 s call ceiling TODAY
(two probe attempts died at RUN banner; background processes confirmed to die with the
call) — measurement therefore runs in a /tmp harness against md5-verified byte-identical
copies of the sources with a local Linux better-sqlite3; CI (Node 20.19) is the in-repo
arbiter. This is an environment regression vs the 2026-07-16 sessions; recorded in the
handoff.

## Layer 2 — DOMAIN MAP

- `src/main/services/persistence.ts` — SUBJECT. Module singleton `_db`; `openDB()` does
  `require('better-sqlite3')` in try/catch → `NullDB` no-op fallback; `migrate()` DDL
  (13 tables) + idempotent `trace_id` ALTER; ~40 exported functions.
- `src/main/services/logger.ts` — imported by subject; node:fs only, file sink inert in
  tests (never `enableFileSink`).
- `src/main/services/brain.ts` — CALLER (read-only this session): `persist()` brain.ts:148
  writes 8 params `symbol: null` per learn; `initialize()` brain.ts:63 reads all rows.
- `src/main/core/trading-engine.ts:471,885,1290,1565,1637,2498` — `listBrainParams()`
  consumers (read-only; :1637 health count grows with the dup rows today).
- `@shared/types` — type-only import (erased; no runtime edge).
- NEW `src/main/services/persistence.test.ts` — the suite.
- RISK-TOUCH: none. §2.4 files absent from blast radius by construction.

## Layer 3 — TASK TREE  ·  Layer 4 — DAG

T1 blueprint (this file) → T2 /tmp harness (local vitest@repo-version + better-sqlite3
@11.10.0 + md5-verified source copies) → T3 write suite; prove defect (red pins) →
T4 fix subject in /tmp; suite fully green → T5 apply same fix in-mount via python
anchored edits (anchors asserted unique; byte-verify NUL/CRCR/tail) + add test file
in-mount (new-file, byte-verify) → T6 gates (typecheck ×2 in-mount; eslint scoped
in-mount; suite in harness; CI named as full arbiter) → T7 CHANGELOG Fixed entry
(python, first `### Fixed` under `## Unreleased`, placement verified) → T8 ledger:
NEW P-113 full PSD + P-094 persistence-portion update (backup to /tmp first) →
T9 handoff v4 + session report → T10 delete session scratch files (2 probe files;
requires allow_cowork_file_delete — bash rm is blocked on this mount, measured).
Parallel groups: T3∥T4 iterate together in the harness; everything else linear.
APPROVAL NODES: none executed by agent; operator reviews the unstaged diff (A-nodes in
handoff: adopt p112 bundle; review P-113 migration before merge).

## Layer 5 — EXECUTION SPECS (anchors + validation)

T4/T5 subject edits (3, each anchor asserted count==1 before replace):
1. `upsertBrainParam` — anchor `export function upsertBrainParam(p: BrainParameter): void {`
   … replace body: when `p.symbol == null` run `DELETE FROM brain WHERE key=? AND symbol IS NULL`
   then plain `INSERT`, both inside `db.transaction` when available (NullDB degrades to
   sequential — same graceful-degrade shape as `insertObservations`); non-null symbol
   keeps `INSERT OR REPLACE` (real PK conflict applies).
2. `migrate()` — anchor `log.info('sqlite schema migrated')` … insert before it the
   idempotent dedup:
   `DELETE FROM brain WHERE symbol IS NULL AND rowid NOT IN (SELECT MAX(rowid) FROM brain WHERE symbol IS NULL GROUP BY key)`
   (keeps highest-rowid = newest write per key — byte-identical to what
   `Brain.initialize()` effectively loads today, so restore semantics change ZERO).
3. Header comment — anchor ` *   watchlist  — user-configured symbol list` … extend the
   stale 5-table doc list to name all 13 tables.
Validation: `python3` byte-scan (0 NUL, 0 `\r\r`, intact tail) + `git diff --stat` shows
only intended hunks + harness suite green post-copy.

T3 suite groups (~45 tests): schema (13 tables, WAL, indexes, trace_id ALTER idempotent);
sessions CRUD + partial patch + null endedAt; orders round-trip + `legacy-<id>` traceId
synthesis + per-session/all listing order+limit; pnl asc order; brain (P-113 pins);
calibration insert/list-reversed/prune-count; watchlist replace semantics; observations
batch-tx + empty-batch 0 + since-filter; pattern weights; learning_log raw-db verify;
ticks batch + readTapeRange bounds + getTapeBounds empty {null,null,0} + distinct
symbols + listReplayableSessions join/durationMs + deleteTapeForSession removes manifest
first; bookmarks CRUD + per-session delete count; tape manifest null-when-missing;
sub-second candles idempotent re-seal + ascending order + trim (incl. rows≤keep ⇒ 0
no-op degenerate) + getAllSubSecondSeries; pruneOldTicks degenerate guards (NaN/0/neg ⇒
0); scheduleBackgroundMaintenance end-to-end (delayMs 0, poll ≤5 s: old-session ticks
pruned, recent survive); closeDB idempotent + reopen; NullDB fallback (electron
getPath throws ⇒ reads return empty defaults, writes no-throw, `insertObservations`
returns rows.length QUIRK pinned loudly).
Harness: `vi.hoisted` ctx + `vi.mock('electron')`; `vi.stubGlobal('require', shim)`
where shim = `createRequire(import.meta.url)` with documented
`SATEX_TEST_BETTER_SQLITE3` env override (absolute dir) for Linux sandboxes whose
mounted binary is a Windows build (§2.9 class) — CI/operator resolve normally;
`vi.resetModules()` + dynamic import per case (module singleton, same discipline as
self-eval-store/alpaca-mode).

## Layer 6 — RISK AUDIT (self-adversarial)

- Migration deletes operator data → BOUNDED: only `brain` rows, only `symbol IS NULL`
  duplicates, keeps newest per key; newest is what today's restore effectively loads, so
  observable behavior is preserved while the fragility (unspecified scan order) and the
  growth die. Idempotent (second run deletes 0). Flagged in handoff for operator review
  before merge regardless.
- DELETE+INSERT pair non-atomic on NullDB → NullDB is a no-op store; nothing to corrupt.
  Real DB path wrapped in a transaction.
- Learning-core adjacency (§2.7) → this IS the ultraplan; risk limits remain read-only
  to learning code (no contact); no autonomy widened.
- Leak class: no timers/observers added. maintenance test uses real timers + bounded
  poll, no dangling handles (timer already `.unref()` in subject).
- Env risks: 45 s ceiling (mitigated: /tmp harness); mount rm blocked (mitigated:
  allow_cowork_file_delete); phantom `.git/index.lock` seen again this session
  (read-only git ops unaffected; no staging performed anyway).

## Layer 7 — this blueprint. Execution follows immediately (dawn §4).
