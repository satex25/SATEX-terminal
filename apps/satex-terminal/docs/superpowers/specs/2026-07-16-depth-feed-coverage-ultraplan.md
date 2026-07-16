# ULTRAPLAN — `depth-feed.ts` characterization coverage (P-094, pick 3 of 4)

```
[DATE]      2026-07-16 (dawn re-run, real fire ~03:57 CDT — fourth session of the day)
[LEDGER]    P-094 (mixed disposition; this executes the depth-feed.ts portion)
[BRANCH]    master @ 729b1ce (work UNSTAGED for operator review, per scheduled-task close law)
[PRIOR]     self-eval-store.test.ts (8 tests, 02:25) · alpaca-mode.test.ts (15 tests, 03:2X)
[EXECUTOR]  this session; REMAINING inherited by next work-layer via handoff
```

## L1 — OBJECTIVE

One sentence: give `src/main/services/depth-feed.ts` (141 LOC, zero coverage) a
characterization suite pinning its public contract and degenerate-input behavior,
leaving the subject file byte-unchanged.

Success criteria:
- New `src/main/services/depth-feed.test.ts` with ~17 tests, all passing (vitest exit 0).
- `git diff --stat` shows ZERO change to `depth-feed.ts`; `package-lock.json` md5 unchanged.
- Gates: typecheck node+web exit 0 · eslint scoped to the new file exit 0 ·
  targeted vitest exit 0 · knip CI-arbitrated (P-097, sandbox cannot run it).
- P-094 ledger entry gains a dated evidence update; one CHANGELOG line under the FIRST
  `### Added` in `## Unreleased`.

Constraints: perimeter untouched (depth-feed is display-data synthesis only — it feeds
the DepthPanel ladder, never the order path); no DI refactor of the subject (P-094's
other targets needed `vi.resetModules()` singleton surgery; this one is already a
clean injectable class — test it as-is).

Assumptions flagged: `createLogger` (./logger) is electron-free (verified: node:fs only,
file sink inert until initialized) — no `vi.mock('electron')` needed. VERIFIED this
session, pre-plan.

## L2 — DOMAIN MAP

| File | Role | Risk |
|---|---|---|
| `src/main/services/depth-feed.ts` | Subject. `DepthFeedService` class, constructor-injected `{getQuote}`. READ-ONLY this session | none (off-perimeter) |
| `src/main/services/depth-feed.test.ts` | NEW — the only write in `src/` | none |
| `src/shared/types.ts:190,985,994` | `Quote` / `DepthLevel` / `DepthSnapshot` shapes for assertions | read-only |
| `Vault/00-Audit/PROBLEM-LEDGER.md` | P-094 evidence update | bash-mount write, /tmp backup first |
| `apps/satex-terminal/CHANGELOG.md` | one Unreleased line | bash-mount write, anchor-unique check |

Perimeter contact: NONE. `depth-feed.ts` imports only `@shared/types` + `./logger`;
its consumers render the L2 ladder panel. It cannot reach `order-manager.ts`,
`risk-gates.ts`, `live-mode.ts`, or any broker facet.

## L3 — TASK TREE (atomic)

- T1 write `depth-feed.test.ts` (new file; file tool OK per P-099 new-file clause, then byte-verify + LF-normalize if needed)
- T2 targeted vitest run on the new file
- T3 typecheck node+web
- T4 eslint scoped to the new file
- T5 byte-scan (python) all touched files: 0 NUL, 0 `\r\r`, tail intact; `git diff` empty on subject; lockfile md5
- T6 ledger P-094 update (backup to /tmp first) — bash mount
- T7 CHANGELOG one line under FIRST `### Added` in Unreleased (anchor count==1 verified) — bash mount
- T8 handoff file (new name, never mutate today's three existing Daily files) + session report

## L4 — DEPENDENCY DAG

T1 → T2 → (T3 ∥ T4) → T5 → (T6 ∥ T7) → T8. No APPROVAL NODES — nothing touches the
perimeter. ∥ groups are safe to interleave for a finisher.

## L5 — EXECUTION SPECS

**T1 — the suite.** Harness: `vi.useFakeTimers()` per test (mocks Date + setInterval);
`vi.spyOn(Math, 'random').mockReturnValue(0.5)` — with r=0.5 the churn delta is
`(0.5−0.5)*0.18 = 0`, so the per-symbol jitter array stays at its deterministic
initializer `0.85 + sin(i*1.7 + symbol.length)*0.18` and every snapshot is exactly
reproducible. Direct `new DepthFeedService({getQuote})` — no module reset needed.
`mkQuote(overrides)` helper returns a full `Quote` (all 13 fields, types.ts:190).

Pinned behaviors (one `it` each unless merged):
1. `start()` emits an immediate snapshot, then one per 250 ms (TICK_HZ=4): 1 call
   after start, 2 after +250 ms, 5 after +1000 ms total.
2. `start()` idempotent — second call adds no second interval.
3. `stop()` halts emissions; `start()` again resumes (leak-class §2.5.7: the timer
   handle is cleared, not orphaned). `stop()` before any `start()` is a no-op, no throw.
4. `onUpdate()` returns an unsubscribe fn; unsubscribed listener silent, others live.
5. All listeners receive the SAME snapshot object per tick (reference equality).
6. `subscribe(sameSymbol)` is a no-op (no emission); `subscribe(newSymbol)` emits an
   immediate snapshot with `snap.symbol === newSymbol`.
7. `get()` with no prior tick computes fresh (symbol = default 'NVDA') and does NOT
   cache (two bare `get()`s both compute; vpin EMA advances between them — pin values,
   that side effect is current behavior). `get(other)` routes through `subscribe` →
   tick → returns the CACHED `lastSnapshot` (reference-equal to what listeners got).
8. Ladder geometry, equities tick 0.01 (bid 100.00 / ask 100.02 / last 100.01):
   asks[0].p = 100.02 ascending +0.01 × 9 levels; bids[0].p = 100.00 descending;
   mid 100.01, spread 0.02; `tot` strictly cumulative both sides; every size ≥ 20
   (floor) and ≤ 2400 (SIZE_BASE×jitter-clamp 2.0).
9. Tick scaling: mid>500 → 0.05 spacing (bid 999.95/ask 1000.05); mid>10000 → 1.0
   spacing (bid 39999/ask 40001).
10. DEGENERATE (P-039/P-040 class, §5d): `getQuote` → `undefined`: zero-anchored
    ladder, mid 0, spread 0.01, EVERY numeric field `Number.isFinite`, no NaN/throw.
11. DEGENERATE: quote with `bid:0, ask:0, last:100` — `??` does NOT fall back on 0,
    so ladder anchors at 0 while `mid = (0+0)/2 || last = 100`: pin this quirk
    (asks[0].p===0, mid===100, spread===0.01). It is current behavior; the pin makes
    the quirk visible to any future fixer.
12. Fallback derivation: `bid/ask: undefined as unknown as number, last:200` →
    bestBid 199.98 / bestAsk 200.02 (±0.01%), asks[0].p = 200.02, spread 0.04.
13. vpin: starts from 0.18 seed, EMA step |Δ| ≤ 0.08 per tick, always within [0,1],
    3-decimal rounded.
14. Per-symbol jitter continuity: snapshot(A) sizes → subscribe(B) → subscribe(A)
    again → sizes exactly equal (Map persistence; churn is a no-op at r=0.5).

Validation: `npx vitest run src/main/services/depth-feed.test.ts` → exit 0, 18 passed (measured; L3 estimate said ~17).
Failure mode: fake-timer Date leakage → assert via relative time only. Fallback: if
`toFixed` float edges bite (e.g. 100.01999…), assert with `toBeCloseTo(p, 2)`.

**T2–T5 validations:** as commands in L3, expected exits all 0; lockfile md5 must equal
`c6c32fa16eb9ac3701f8f14b706580c0` (P-094 prior updates' recorded value).

**T6 anchor:** the line `- **Update 2026-07-16 (work-layer, Opus 4.8, unattended ~03:2X CDT):**`
inside P-094 (count==1 verified before edit); append AFTER that bullet, before the `\n\n### ` next-entry heading (measured: this ledger region has NO `---` separators — L5 originally said `---`, corrected per divergence rule); original text: append the new dated update block AFTER
that bullet, before the entry's closing `---`.

**T7 anchor (corrected per divergence rule):** FIRST bullet under the single `### Fixed` in `## Unreleased` — measured reality: both prior P-094 portions file under Fixed, not Added (assert count==1 within the
Unreleased section slice, per the 3-match scar in §5b of the installed prompt).

**T8:** handoff name `Vault/Daily/2026-07-16-agent-handoff-p094-depthfeed.md`
(follows the `-p094-selfevalstore` precedent; today's base-named handoff already exists
and is immutable).

## L6 — RISK AUDIT (self-adversarial)

- Teardown/leak class (PR#6/P-041/P-043/P-046/P-091): the SUITE itself must restore
  real timers + Math.random in `afterEach` (`vi.useRealTimers()`, `vi.restoreAllMocks()`)
  or it poisons sibling suites in a full run. Included in harness.
- Flakiness: Math.random pinned; Date mocked by fake timers; no fs, no net, no electron.
  Order-independence: run the file twice back-to-back (P-094 self-eval precedent).
- Aliased-defaults class (P-061/P-074): not applicable to subject (constructs fresh
  arrays per compute) — but test 5's reference-equality pin documents the INTENTIONAL
  sharing of one snapshot across listeners so nobody "fixes" it into per-listener clones
  without noticing consumers may rely on identity.
- Perimeter: zero contact (L2). No APPROVAL NODE needed.
- Corruption path: new files byte-verified; ledger/CHANGELOG edited only via bash mount
  with /tmp backups; subject file never written.

## L7 — THIS DOCUMENT

Blueprint complete; execution follows immediately in the same session. Divergences
found while executing will be corrected here per the divergence rule.
