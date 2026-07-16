---
type: ultraplan
date: 2026-07-16
slug: self-eval-store-coverage
ledger: P-094 (self-eval-store.ts portion)
author: dawn planner (Claude Opus 4.8), unattended 02:25 CDT run
target: apps/satex-terminal/src/main/services/self-eval-store.ts (34 LOC, zero test coverage)
perimeter: OFF (self-eval is strictly observational — CONSTITUTION §3.6 invariant 3; store persists a toggle, touches no order/risk/kill/arming path)
---

# Ultraplan — self-eval-store.ts characterization coverage

## LAYER 1 · OBJECTIVE
Add `apps/satex-terminal/src/main/services/self-eval-store.test.ts`, a characterization
suite that locks in the observable contract of the self-eval toggle store, closing one of
the four safe off-perimeter coverage gaps surveyed in P-094.

Measurable success:
- New file `self-eval-store.test.ts` exists; `npx vitest run` on it is green.
- Test-count baseline rises by exactly the suite's test count (target ≥ 6).
- `npm run typecheck` (node + web) exit 0; `npm run lint` on the new file exit 0.
- No production source changed — coverage only, zero blast radius.

Constraints: bash-mount write (P-099); no edit to the production module; no perimeter
contact. Assumption (flagged): logger `createLogger` has no electron dependency —
VERIFIED at logger.ts:14 (imports only `node:fs`/`node:path`); the module's sole electron
coupling is `app.getPath('userData')` at self-eval-store.ts:16.

## LAYER 2 · DOMAIN MAP
- SUBJECT (read-only, never edited): `src/main/services/self-eval-store.ts`
  - `load()` (module-private) — reads `<userData>/self-eval.json`, defaults `{enabled:true, updatedAt:0}` on any throw; coerces `enabled !== false`, `updatedAt || 0`.
  - module singleton `let state = load()` — evaluated once at import.
  - `getSelfEvalEnabled(): boolean` — returns `state.enabled`.
  - `setSelfEvalEnabled(enabled): void` — sets `state`, writes pretty JSON, logs; write failure is swallowed (logged, never thrown).
- NEW: `src/main/services/self-eval-store.test.ts`.
- HARNESS REFERENCE: `src/main/services/auto-update.test.ts` (first `vi.mock('electron')` harness in the repo).
- PERIMETER FILES IN BLAST RADIUS: none. (self-eval-store is NOT `order-manager`/`risk-gates`/`kill-switch`/`live-mode`.)

## LAYER 3 · TASK TREE
- T1  Byte-verify subject unchanged (git diff HEAD -- self-eval-store.ts == empty).
- T2  Write self-eval-store.test.ts via bash-mount heredoc.
- T3  Byte-scan new file (NUL/CRCR/tail) via python.
- T4  Run vitest on the new file; record pass count.
- T5  Typecheck (node + web).
- T6  Lint scoped to the new file.
- T7  Confirm subject + package-lock.json still byte-unchanged.

## LAYER 4 · DEPENDENCY DAG
T1 → T2 → T3 → T4 → (T5 ∥ T6) → T7.
No APPROVAL NODES — zero perimeter contact. Every task autonomous.

## LAYER 5 · EXECUTION SPECS
Test strategy: real `fs` + real per-test temp dir (`fs.mkdtempSync(os.tmpdir()+'/satex-se-')`);
mock ONLY `electron` so `app.getPath('userData')` returns that temp dir. Because `state`
is an import-time singleton computed by `load()`, use `vi.resetModules()` in `beforeEach`
and `await import('./self-eval-store')` inside each test so each case re-runs `load()`
against a freshly-seeded (or absent) `self-eval.json`. `afterEach` removes the temp dir.

Cases (the observable contract):
1. absent file → `getSelfEvalEnabled()` === true (default-enabled heartbeat).
2. `{enabled:false}` on disk → getter returns false (opt-out is explicit and honored).
3. `{enabled:true}` on disk → getter returns true.
4. malformed JSON → getter returns true (load() swallow-to-default; the disk-poison guard).
5. missing `enabled` key → coerced true (`enabled !== false` semantics).
6. `setSelfEvalEnabled(false)` → getter now false AND on-disk JSON has `enabled:false` + a numeric `updatedAt` > 0.
7. `setSelfEvalEnabled(true)` after a false → getter true, disk round-trips true.
8. set-then-write failure (point userData at a path made un-writable, e.g. a file-as-dir) → does NOT throw; getter still reflects the in-memory set (write failure is swallowed per source).

Validation: `npx vitest run src/main/services/self-eval-store.test.ts` → exit 0, "Tests N passed (N)", N ≥ 6.
Failure mode: if `vi.resetModules()` + dynamic import does not re-trigger `load()` (stale singleton across cases), fall back to exporting nothing new — instead re-import path with a cache-busting query is unavailable for TS; the resetModules+dynamic-import pattern is the sanctioned one (mirrors how auto-update.test re-imports the class). If case 8 is flaky across OS (temp perms differ Linux/Win), downgrade it to asserting the logger.error path via a `vi.mock('./logger')` spy rather than a real un-writable path.
Cold-start test: an agent with only this blueprint + boot docs can write the file — the case list, the harness reference, and the resetModules rationale are all inline.

## LAYER 6 · RISK AUDIT
- Teardown: `afterEach` MUST `fs.rmSync(dir,{recursive:true,force:true})` — no temp-dir leak (the PR#6/P-041 cleanup discipline applied to test scaffolding).
- Singleton bleed: without `vi.resetModules()` case 1 would poison case 2. Reset in `beforeEach`, dynamic-import per case. Verify by running the file twice — order-independence.
- Aliased default: source returns a fresh object literal each `load()`/`set`; no shared-mutable-default risk (P-061/P-074 class) — no assertion needed, but do not introduce one in the test via a shared fixture object.
- NUL/CRCR: python byte-scan post-write (P-099).
- Perimeter: NONE. self-eval feeds no gate/size/multiplier (§3.6). Confirmed by import graph — sole consumer is trading-engine.ts:65, read-only getter + setter wired to a toggle.
- Lockfile drift: md5 package-lock.json before/after (baseline c6c32fa16eb9ac3701f8f14b706580c0).

## LAYER 7 · (this file)
Blueprint written to specs/. Execute Layer 5 in Layer 4 order; gates per §6 of the dawn prompt.
