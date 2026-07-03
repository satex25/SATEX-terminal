---
type: ultraplan-blueprint
date: 2026-07-03
author: satex-psd-daily (dawn planner / first executor, scheduled 5 AM)
slug: live-candle-buffer-system-logs-coverage
status: SHIPPED
branch: refactor/filesystem-reorganization
head: b5be6d0
tags: [satex, ultraplan, coverage, leak-class, bounded-growth, P-076, P-077]
---

# ULTRAPLAN — Coverage for `live-candle-buffer.ts` + `system-logs.ts`

New-file-only Vitest suites for two untested, pure, in-memory main-process
services. Zero source change, zero perimeter contact. Picked from the
2026-07-02 work-layer §8 NEXT pointer #2 (coverage-gap sweep of the
"unsurveyed" class) after every DECIDED ledger item was found operator- or
sign-off-gated (P-058, P-062, P-063, P-069, P-071 all deferred).

## Layer 1 — OBJECTIVE

Add two new-file-only test suites that pin the observable behavior of
`src/main/services/live-candle-buffer.ts` and `src/main/services/system-logs.ts`
without editing either source file, raising main-process coverage of two
invariant-bearing services: the candle buffer's **bounded-growth cap**
(`MAX_CANDLES_PER_SYMBOL`) and **listener-unsubscribe** contract (the
PR#6 / P-041 / P-043 / P-046 leak class), and the system-logs **ring-buffer
cap** (`BUFFER_SIZE=60`) and **listener-unsubscribe** contract.

Success criteria (measurable):
- +2 test files (`live-candle-buffer.test.ts`, `system-logs.test.ts`).
- +~22 tests (≈12 candle-buffer, ≈10 system-logs), all passing.
- Both service sources byte-for-byte unchanged (`git diff --stat` shows only
  the two NEW test files + this blueprint + ledger/changelog/handoff docs).
- All four gates green (knip = CI arbiter; sandbox OOMs on oxc-parser).
- Post-work total test count = baseline + exactly the new-test count.

Applicable constraints: Prime Directives 0.1 (no fabrication — all types/
constants verified at file:line before writing), 0.4 (measure, don't assert),
0.6 (four gates), 2.4 (no perimeter contact — neither file is on the perimeter),
2.5.7 (leak-class cleanup — these tests *assert* the cleanup paths exist).

Assumptions (all verified this session, none unverified):
- `Candle` = `{time,open,high,low,close,volume}` (types.ts:206).
- `MAX_CANDLES_PER_SYMBOL=3600`, `SIMULATOR_CANDLE_INTERVAL_SEC=1`
  (constants.ts:31-32).
- `LogEntry`/`LogLevel` = `{ts,level,ns,msg,data?}` /
  `'trace'|'debug'|'info'|'warn'|'error'` (logger.ts:17,28).
- `SystemLogEntry` = `{ts,level,tag,msg}`, `SystemLogsTail={lines}`
  (types.ts:939,949).
- `createLogger` is side-effect-free at import (emit no-ops without a
  configured push) — many existing service tests import loggered services with
  no mock. No logger mock needed.
- Vitest fake timers fake `Date` by default → `maybeRoll`/`bucketFor` are
  deterministic under `advanceTimersByTime`.
- Test style: explicit `import { describe, it, expect, ... } from 'vitest'`
  (no globals), mirrors `subsecond-aggregator.test.ts`.

## Layer 2 — DOMAIN MAP

| File | Role | Layer | Perimeter |
|---|---|---|---|
| `src/main/services/live-candle-buffer.ts` | tick→OHLC aggregation, per-symbol buffer | main | NO |
| `src/main/services/system-logs.ts` | ring-buffer log tail service | main | NO |
| `@shared/constants` (read) | MAX_CANDLES_PER_SYMBOL, interval | shared | NO |
| `@shared/types` (read) | Candle, SystemLogEntry, SystemLogsTail | shared | NO |
| `./logger` (read, types only) | LogEntry/LogLevel shapes | main | NO |

No RISK-TOUCH files. No APPROVAL NODES. Service domain: `system/` (logs) +
`market-data/` (candle buffer, but the buffer itself is pure aggregation, not
a feed — no `onTick`/broker coupling touched).

## Layer 3 — TASK TREE

- **T1** NEW `src/main/services/live-candle-buffer.test.ts`
  - T1.1 OHLC seed + multi-tick aggregation + negative-volume clamp
  - T1.2 `getCandles` unknown-symbol `[]` + limit slicing
  - T1.3 `seedHistory` empty no-op + `MAX_CANDLES_PER_SYMBOL` cap (bounded growth)
  - T1.4 `onCandle` unsubscribe removes listener (leak class, fake timers)
  - T1.5 intra-bar coalesced flush (most-recent-wins, one emit/window)
  - T1.6 `stop()` clears timers + pendingUpdates, idempotent; `start()` idempotent
  - T1.7 `maybeRoll` bucket roll → closed→history + isNew=true new candle
- **T2** NEW `src/main/services/system-logs.test.ts`
  - T2.1 ingest→getTail mapping (ts/level/tag/msg)
  - T2.2 getTail default 6 + custom n + empty `{lines:[]}`
  - T2.3 ring-buffer cap 60 (bounded growth; oldest-kept assertion)
  - T2.4 classify EVENT tags + normalizeLevel 5-level mapping
  - T2.5 onTail broadcast on ingest + unsubscribe removes listener (leak class)
- **T3** targeted vitest on both new files (count new tests)
- **T4** byte-scan both new files (NUL / `\r\r`)
- **T5** re-run affected segments (main-svcA/B) → confirm no regression + delta
- **T6** ledger: P-076 + P-077 SHIPPED; CHANGELOG bullet; this handoff

## Layer 4 — DEPENDENCY DAG

T1 ∥ T2 (independent new files) → T3 → T4 → T5 → T6. No parallel hazard; no
APPROVAL NODE anywhere in the DAG.

## Layer 5 — EXECUTION SPECS

- **T1 / T2 method:** `Write` NEW files (tool-hazard rule: new files write
  normally; only *existing* repo files need python-scripted edits). Import
  `{ describe, it, expect, beforeEach, afterEach, vi } from 'vitest'`. Fake
  timers for flush/roll/unsubscribe emission tests via
  `vi.useFakeTimers()` in `beforeEach`, `vi.useRealTimers()` in `afterEach`.
  - Validation: `npx vitest run <file>` exit 0.
- **T3 method:** `npx vitest run src/main/services/live-candle-buffer.test.ts
  src/main/services/system-logs.test.ts` → expect exit 0, record file+test
  counts. Failure mode: assertion mismatch → re-derive from source (divergence
  rule), correct the test, re-run.
- **T4 method:** python byte-read each new file, assert `b'\x00' not in data`
  and `b'\r\r' not in data`. Expected: 0 / 0 (LF-native new files).
- **T5 method:** `npx vitest run <svcA list> ` and `<svcB list>` (the flat
  services split from baseline) → the two new files fall in one half; expect
  that half's file/test count = baseline + new. Other gates
  (typecheck/lint) re-run: exit 0 (tests are additive, export nothing).
  - Validation: typecheck exit 0, lint exit 0, both service halves exit 0.
- **T6 method:** ledger + changelog are EXISTING files → python-scripted
  anchored edits, anchor-uniqueness asserted (count==1), CHANGELOG bullet under
  the FIRST `### Added` inside `## Unreleased`, placement re-verified, byte-scan
  after. Handoff + blueprint are NEW files → Write normally.

Predicted gate delta: `+2 files / +N tests` where N = measured new-test count;
knip byte-neutral (tests export nothing); typecheck/lint unchanged (exit 0).

## Layer 6 — RISK AUDIT (self-adversarial)

- **Fake-timer Date coupling:** `maybeRoll` reads `Date.now()`. If vitest's
  fake timers did NOT fake Date, the roll test would be nondeterministic.
  Mitigation: confirmed vitest fakes Date by default; test also uses
  `vi.setSystemTime(0)` to anchor the first bucket. Fallback: if Date is not
  faked in this config, assert only the intra-bar flush path (T1.5) and mark
  T1.7 as covered-by-seedHistory parity — do NOT force a flaky timer assertion.
- **Bounded-growth cost:** `MAX_CANDLES_PER_SYMBOL=3600` → the seedHistory cap
  test builds a 3650-element array (cheap, in-memory, no timers). The
  `maybeRoll` `history.shift()` path at >3600 would need 3600+ rolls — NOT
  unit-tested (too slow); covered by logic-parity with the seedHistory cap.
  This is a deliberate scope boundary, not an omission.
- **Listener-leak assertion is the point:** both suites assert that the
  unsubscribe closure actually removes the listener (call-count frozen after
  `off()`), directly exercising the cleanup contract the constitution's most
  recidivist defect class violates.
- **Empty/degenerate paths (P-039/P-040 class):** T1.2 covers `getCandles`
  unknown-symbol `[]`; T1.3 covers `seedHistory([])` no-op; T2.2 covers
  `getTail` on an empty buffer. Degenerate inputs explicitly asserted.
- **No perimeter contact:** neither source imports execution/risk/kill-switch;
  grep confirms. Zero one-way doors. No source edited at all.
- **Divergence rule armed:** if any assertion contradicts the source mid-run,
  re-derive the minimal correct assertion from the source and note it here.

## Layer 7 — ASSEMBLED PLAN

Execute T1 ∥ T2 → T3 → T4 → T5 → T6 in order. All four gates after T5. Ledger
two SHIPPED PSD entries (P-076 candle-buffer coverage, P-077 system-logs
coverage), one CHANGELOG bullet, this blueprint status → SHIPPED, and the
agent-handoff. Leave everything UNSTAGED for operator review per AGENTS.md.

### Post-execution result (filled in after EXECUTE)
See `Vault/Daily/2026-07-03-agent-handoff.md` for measured gate numbers and
per-task DONE/REMAINING status.
