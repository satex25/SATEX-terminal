---
type: ultraplan
date: 2026-07-04
slug: market-observer-coverage
author: satex-psd-daily (dawn planner / first executor, scheduled 5 AM)
status: SHIPPED
ledger: P-083
tags: [satex, ultraplan, coverage, market-observer, bounded-growth, learning-loop]
---

# ULTRAPLAN — `market-observer.ts` coverage sweep (P-083)

> Continuation of the untested-service coverage sweep (P-076 → P-080). Picked per the
> 2026-07-03 work-layer §NEXT pointer (`market-observer.ts` among the carried-forward
> candidates). New-file-only suite; the service source is byte-for-byte unchanged.
> Off the trading-safety perimeter: the observer "learns nothing" — it is a dense
> recorder feeding PatternLearner + VaultWriter, with no execution/risk/kill-switch/
> broker coupling (verified against source header, `market-observer.ts:1-23`).

## Layer 1 — OBJECTIVE

One sentence: pin the observable contract of `MarketObserver`
(`src/main/services/market-observer.ts`, 196 LOC) with a new-file-only Vitest suite,
so its bounded ring buffer, rolling per-minute window, flush error-swallow, and regime
classification are regression-locked without touching the source.

Success criteria (measurable):
- NEW `src/main/services/market-observer.test.ts` exists; **source unchanged** (git diff
  on `market-observer.ts` = empty).
- Targeted `vitest run market-observer.test.ts` → all green; suite adds **~20 tests**.
- Full gate bar: `typecheck` node+web exit 0, `lint` exit 0 (0 warnings), segmented
  vitest green with test-file count +1 and test count +~20.
- Byte-scan of the new file: 0 NUL, 0 doubled `\r\r` (P-078 discipline).

Applicable constraints (Constitution / AGENTS.md):
- 0.1 never fabricate — every gate number measured, not asserted.
- 0.4 measure, don't assert.
- 2.4 perimeter: NONE touched (recorder only). No APPROVAL NODES.
- 2.5 bounded-growth invariant — the ring cap is the point of the suite.
- P-078 tool hazard — byte-scan new file; heredoc-through-mount if Write truncates.

Assumptions (all verified from source this session):
- `MarketObserver` takes `ObserverDeps { getCandles, getWatchlist }` by constructor DI
  (`market-observer.ts:60`) — mockable without electron. VERIFIED.
- Only external module dep in the hot path is `db.insertObservations`
  (`market-observer.ts:180`) and `computeSnapshot` (`@shared/indicators`,
  `market-observer.ts:127`). Both mockable. VERIFIED.
- `createLogger` is noop-safe in tests (pattern-learner.test.ts does not mock it).
  VERIFIED by analogy.

## Layer 2 — DOMAIN MAP

- **Blast radius:** ONE new file, `src/main/services/market-observer.test.ts`.
- **Under test (read-only):** `src/main/services/market-observer.ts` —
  `start/stop/ingestQuotes/getRecent/stats` (public) + `observationFromQuote/
  computeVelocity/recordToRing/flush` (private, exercised through public surface) +
  module-level pure `classifyRegime`.
- **Mocked:** `./persistence` (`insertObservations`), `@shared/indicators`
  (`computeSnapshot`).
- **Service domain:** `intelligence`-adjacent (observability/learning-loop input).
  Layer: `main`. Perimeter files touched: **NONE** — no RISK-TOUCH.

## Layer 3 — TASK TREE (atomic actions)

- T1 · NEW `src/main/services/market-observer.test.ts` with the groups below.
- T2 · Targeted vitest on the new file; expect all green.
- T3 · Byte-scan the new file (python byte read): assert 0 NUL, 0 `\r\r`.
- T4 · Full gate bar (typecheck node+web, lint, segmented vitest).
- T5 · Ledger P-083 + CHANGELOG bullet (first `### Added` under `## Unreleased`) +
  handoff; UNSTAGED.

Test groups inside T1 (~20 tests):
1. **Lifecycle** — start sets `running` (via `stats()`); start idempotent (one timer);
   stop clears timer + does a final flush; stop idempotent.
2. **ingestQuotes gating** — no-op when not running; non-watchlist symbol ignored;
   watchlisted symbol recorded (`totalObserved`↑).
3. **Null-guards** — `<21` candles → no observation; `computeSnapshot` throw → no
   observation (both leave `totalObserved` unchanged).
4. **Ring bounded-growth** — >200 obs for one symbol → `getRecent()` length capped at
   `RING_PER_SYMBOL` (200); pre-wrap ordering newest-last; unknown symbol → `[]`;
   `limit` param honored.
5. **Rolling per-minute window** — `observationsPerMinute` counts current-window obs;
   trims entries older than 60s (fake timers).
6. **Velocity** — first tick → 0; subsequent tick → non-zero bps; guarded when prev≤0.
7. **Flush** — empty buffer → `insertObservations` NOT called; `MAX_BUFFER` (500)
   auto-flush; timer-driven flush; **error-swallow**: `insertObservations` throws →
   no crash, `bufferedRows`→0 (batch dropped, intentional); `lastFlushAt/Size` set on
   success.
8. **classifyRegime** — via mocked `IndicatorSnapshot` + velocity, assert the `regime`
   field on the produced observation for each branch: `trend_up`, `trend_down`,
   `range`, `chop`, `unknown`.

## Layer 4 — DEPENDENCY DAG

T1 → T2 → T3 → T4 → T5 (strictly sequential; each gate gates the next).
No parallelism, no APPROVAL NODES (nothing on the perimeter).

## Layer 5 — EXECUTION SPECS

- **T1 method:** write a new Vitest file. Header block: `vi.mock('./persistence', () => ({
  insertObservations: vi.fn(() => N) }))` and `vi.mock('@shared/indicators', () => ({
  computeSnapshot: vi.fn(() => snapshot) }))` (per pattern-learner.test.ts precedent).
  Use `vi.useFakeTimers()` + `vi.setSystemTime(...)` in `beforeEach`; `vi.useRealTimers()`
  + `observer.stop()` in `afterEach`. Factories: `makeQuote(symbol,last,bid,ask)`,
  `makeCandles(n)` (returns n trivial `Candle`s so the ≥21 guard passes),
  `makeSnapshot(overrides)`. Control `computeSnapshot` return per-test with
  `vi.mocked(computeSnapshot).mockReturnValue(...)` to drive `classifyRegime` branches.
  - **Validation:** `npx vitest run src/main/services/market-observer.test.ts` → exit 0.
  - **Failure mode:** an assertion about post-wrap ordering fails → the modulo ring does
    not reorder on read; assert length-cap + membership post-wrap, ordering only pre-wrap.
  - **Fallback:** if Write truncates (P-078), rewrite via `cat > file <<'EOF'` heredoc
    through the Linux mount.
- **T2:** `npx vitest run src/main/services/market-observer.test.ts` — expect
  `N passed`, exit 0.
- **T3:** python `open(path,'rb').read()` → assert `b'\x00' not in data` and
  `b'\r\r' not in data`.
- **T4:** `npx tsc -p tsconfig.node.json --noEmit` (0) · `-p tsconfig.web.json` (0) ·
  `npx eslint src tests` (0) · segmented `vitest run` by path (45s bash ceiling; P-071
  single-pool stall — segment disjoint by path). knip: sandbox oxc-parser OOM is the
  documented §2.9 ceiling, CI is arbiter; new test exports nothing → knip-neutral.
- **T5:** ledger + changelog + handoff (see Layer 3 T5).

## Layer 6 — RISK AUDIT (self-adversarial)

- **Post-wrap ordering trap:** `getRecent` does `buf.slice(0, cursor).slice(-limit)`;
  once `cursor > 200` the modulo ring overwrites in place and is NOT reordered on read,
  so "newest last" holds only pre-wrap. → Assert ordering ONLY pre-wrap; post-wrap assert
  length cap + membership. Ledger the ordering quirk as a finding (do NOT fix in a
  coverage-only pass — pin current behavior; pattern of P-079's `SATEX_RNG_SEED` note).
- **Flush drops on error by design:** `batch = flushBuffer.splice(0)` runs BEFORE the
  try, so a throwing `insertObservations` drops the batch (not requeued). → Assert
  `bufferedRows`→0 even on failure; this is intended ("dropping batch",
  `market-observer.ts:186`), not a bug.
- **Fake-timer/Date coupling:** `ingestQuotes` uses `Date.now()`; the 60s window trim and
  flush timer both depend on it. → Drive with `vi.setSystemTime` + `vi.advanceTimersByTime`
  deterministically; never wall-clock.
- **≥21 candle guard precedes computeSnapshot:** so `getCandles` must return ≥21 for any
  observation to record. → `makeCandles(25)` default; a `makeCandles(10)` case proves the
  guard.
- **Empty/degenerate (P-039/P-040 class):** `spreadBps` guards `q.last > 0`; velocity
  guards `prev > 0`. → Cover `last <= 0` (spreadBps 0) and first-tick (velocity 0).
- **Leak class (PR#6/P-041/P-043/P-046):** the flush `setInterval` is the only timer;
  `stop()` clears it. → `afterEach` calls `stop()`; a test asserts stop clears the timer
  (no further flush after stop).

## Layer 7 — ASSEMBLED PLAN

Execute T1→T5 in order. One new test file, one ledger entry (P-083), one CHANGELOG
bullet, one handoff. Everything UNSTAGED for operator review. No commit, no perimeter
contact, no APPROVAL NODES.
