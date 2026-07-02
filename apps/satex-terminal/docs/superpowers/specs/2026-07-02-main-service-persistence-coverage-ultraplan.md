# ULTRAPLAN — Main-service persistence coverage (intel-layout + workspace-state)

```
[DATE]      2026-07-02 (dawn planner, scheduled 05:00)
[STATUS]    SHIPPED 2026-07-02 — T1-T6 all DONE; gates 115 files / 1447 tests / 0 fail
[PICK PATH] (d) audit/continuation — 2026-07-01 work-layer §8 NEXT pointer (both 07-01
            handoffs COMPLETE; no IN-PROGRESS ledger entries; DECIDED entries all
            operator/phase-gated: P-009 sign-off, P-011 density-modes, P-012 post-L1.D-F)
[BASELINE]  typecheck exit 0 | lint exit 0 (0 warnings) | vitest 113 files / 1419 tests /
            0 fail (sharded 4×: 382+447+306+284) | knip exit 0 (55 lines) — byte-exact
            match with the 2026-07-01 work-layer final stamp. Recipe: mount node_modules,
            Node v22.22.3, master @ 664c0d5 + inherited unstaged P-024→P-057 backlog.
```

## Layer 1 — OBJECTIVE

Pin the persistence + sanitize contracts of the two **live, zero-coverage** main-process
settings services — `src/main/services/intel-layout.ts` (the P-048 Intel flagship's
layout persistence) and `src/main/services/workspace-state.ts` (boot-state sanitize incl.
the freshly-shipped-untested `landingWorkspace` fallback, `workspace-state.ts:162-164`) —
with **new-file-only** co-located vitest suites following the proven
`subsecond-prefs.test.ts` real-tmpdir round-trip convention (which itself mirrors
`kill-switch-store.test.ts`).

**Success criteria (measurable):**
- NEW `src/main/services/intel-layout.test.ts` — 14 tests green.
- NEW `src/main/services/workspace-state.test.ts` — 14 tests green.
- vitest: 113 → **115 files**, 1419 → **1447 tests**, 0 fail.
- typecheck exit 0, lint exit 0 (0 warnings), knip exit 0 with **no new lines** vs the
  55-line baseline (tests export nothing; consume already-consumed exports).
- Both service sources **byte-for-byte unchanged**.

**Constraints (AGENTS.md / Constitution):** off the trading-safety perimeter (Vault
settings persistence routes no order — patch-grep to confirm); new-file-only (lowest
file-bridge risk, the P-047/P-050/P-051/P-052 precedent); nothing staged or committed;
new files LF; report real gate numbers only.

**Assumptions (all verified this session):**
- Fixture ground truth: `DEFAULT_WORKSPACE_STATE` = `{version:1, workspace:'Quad',
  quadSymbols:['NVDA','SPY','ES','BTC'], chartSymbol:'NVDA', landingWorkspace:'Trade'}`
  (`src/shared/types.ts:65-72`); `WORKSPACE_TABS` = Trade/Focus/Markets/Replay/Quad/Intel
  (`types.ts:46`); `INTEL_MODULE_IDS` = reliability/attribution/regime/weight-drift/
  correlation/microstructure/macro/scenario (`types.ts:76-79`); UNIVERSE includes QQQ
  (valid non-default fixture) and excludes `ZZZZ` (`src/shared/constants.ts:97`).
- Both services take `projectRoot` in the constructor and derive
  `<root>/Vault/Settings/<file>.md` — a `mkdtempSync` root isolates each test.
- `main/index.ts:29-30` imports both from the FLAT `./services/` paths — the flat layer
  is the live layer (see Layer 6, divergence P-058).

## Layer 2 — DOMAIN MAP

| File | Role | Touch |
|---|---|---|
| `src/main/services/intel-layout.test.ts` | NEW test suite | create |
| `src/main/services/workspace-state.test.ts` | NEW test suite | create |
| `src/main/services/intel-layout.ts` | SUT (get/set/cache, `parseJsonFence`, `sanitizeShape` :117-136) | read-only |
| `src/main/services/workspace-state.ts` | SUT (get/set/cache, `sanitize` :131-167) | read-only |
| `src/shared/types.ts`, `src/shared/constants.ts` | fixture imports | read-only |
| `Vault/00-Audit/PROBLEM-LEDGER.md`, `satex-app/CHANGELOG.md`, `Vault/Daily/2026-07-02-agent-handoff.md` | bookkeeping | python-edit / create |

Service domain: system persistence (flat `services/` layer). Layer: main. Renderer,
IPC, engine: untouched. **RISK-TOUCH: none** — no ⚠️ file in blast radius; no approval
nodes in this plan.

## Layer 3 — TASK TREE

- **T1 · intel-layout.test.ts** (14 tests)
  - T1.1 write the file (test list in Layer 5)
  - T1.2 targeted run: `npx vitest run src/main/services/intel-layout.test.ts` → 14 pass
  - T1.3 byte scan: 0 NUL, 0 `\r\r`, braces balanced
- **T2 · workspace-state.test.ts** (14 tests)
  - T2.1 write the file
  - T2.2 targeted run → 14 pass
  - T2.3 byte scan
- **T3 · full gate bar** — typecheck · lint · vitest sharded 4× · knip (Node-20 shim)
- **T4 · ledger** — NEW P-058 (docs-vs-filesystem divergence, OPEN — evidence in Layer 6)
  + NEW P-059 (this coverage work, SHIPPED w/ gate stamp); bump `updated:` to 2026-07-02
- **T5 · CHANGELOG** — one bullet under the FIRST `### Added` in `## Unreleased`
- **T6 · handoff** — `Vault/Daily/2026-07-02-agent-handoff.md` + blueprint status flip

## Layer 4 — DEPENDENCY DAG

```
T1 ──► T1.2/T1.3 ─┐
                   ├─► T3 ─► T4 ─► T5 ─► T6
T2 ──► T2.2/T2.3 ─┘
```
T1 and T2 are independent (may execute in either order); T3 gates all bookkeeping.
No parallel-unsafe steps; no approval nodes.

## Layer 5 — EXECUTION SPECS

### T1 — `src/main/services/intel-layout.test.ts` (NEW, LF)

Method: Write tool (new file — bridge-safe). Harness: `mkdtempSync(join(os.tmpdir(),
'satex-intel-layout-'))` per test in `beforeEach`, `rmSync(tmpdir,{recursive:true,
force:true})` in `afterEach` — byte-mirror of `subsecond-prefs.test.ts:24-31`.
Import `{ IntelLayoutService }` from `./intel-layout`; ids from `@shared/types`.

Tests (contract → assertion):
1. no file → `get()` returns `[]` AND does not create the file (get is read-only).
2. round-trip: `set([reliability@0,0,4,3 ; regime@4,0,4,3])` → fresh service `get()`
   deep-equals the same two placements (file really persisted).
3. `set()` echo: returns the sanitized array it wrote.
4. cache: after `get()`, overwrite the file on disk with different valid JSON → same
   instance `get()` still returns the first result (documented cache contract).
5. unknown module id in fence → dropped.
6. duplicate id → first wins, second dropped.
7. non-object entries (null / 42 / 'str') → dropped, valid siblings kept.
8. non-finite geometry (NaN / Infinity / string) → entry dropped.
9. fence holds a JSON object (not array) → `[]`.
10. file with no ```json fence → `[]`, no throw.
11. corrupt JSON inside the fence → `[]`, no throw.
12. `set()` sanitizes BEFORE write: raw file fence JSON contains only the known id
    (parse the written markdown by hand in the test).
13. empty-array round-trip: `set([])` → fresh `get()` `[]`; file exists.
14. written markdown is hand-inspectable: preamble line + parseable fence (the
    subsecond-prefs "analyst" contract).

Validation: T1.2 targeted vitest exit 0, `14 passed`. Failure mode: fixture drift from
`ModulePlacement` shape → re-read `types.ts:81-95`, correct the fixture, not the SUT.
Fallback: if the tmpdir harness misbehaves in THIS sandbox only, still ship — CI is the
arbiter (subsecond-prefs proves the pattern in CI); note it in the handoff.

### T2 — `src/main/services/workspace-state.test.ts` (NEW, LF)

Same harness. Import `{ WorkspaceStateService }` from `./workspace-state`;
`DEFAULT_WORKSPACE_STATE` from `@shared/types`.

Tests:
1. no file → `get()` deep-equals `DEFAULT_WORKSPACE_STATE`; file NOT created.
2. defensive copy: `get().quadSymbols` is not the same array reference as
   `DEFAULT_WORKSPACE_STATE.quadSymbols` (pins the `[...]` copy at :63).
3. round-trip: valid full state (`Intel` workspace, QQQ lead quad, `landingWorkspace:
   'Focus'`) → fresh service reads it back identically.
4. invalid `workspace` string → default `'Quad'`; valid siblings preserved.
5. quadSymbols normalization: lowercase input uppercased; non-universe `'ZZZZ'` dropped;
   dupes deduped; padded from defaults to exactly 4.
6. quadSymbols > 4 valid entries → trimmed to first 4.
7. quadSymbols non-array → all-default quad.
8. chartSymbol lowercase valid → uppercased; non-universe → default `'NVDA'`.
9. `landingWorkspace` missing (pre-additive record) → default `'Trade'` (the P-048
   tolerant-hydrate contract at :162-164).
10. `landingWorkspace` invalid value → default; valid `'Intel'` honored.
11. `version: 99` in file → normalized to `1` on read (sanitize output pins version).
12. file with no fence → defaults, no throw.
13. corrupt JSON in fence → defaults, no throw.
14. `set()` echo is sanitized (junk quad in → padded-4 out) and written markdown fence
    is parseable with the preamble intact.

Validation: T2.2 targeted vitest exit 0, `14 passed`. Failure/fallback: as T1.

### T3 — Gate bar

From `satex-app/` (mount, Node v22): `npm run typecheck` (expect exit 0) · `npm run
lint` (exit 0, 0 warnings) · `npx vitest run --shard=k/4` for k=1..4, one bash call each
(expect Σfiles=115, Σtests=1447, 0 fail) · knip via `NODE_OPTIONS="--require
$HOME/satex-agent/node20-shim.js" npx knip` (exit 0; 55 lines, none new). Failure mode:
any red gate → fix the TEST (sources are read-only this session), re-run the failed gate.

### T4/T5/T6 — Bookkeeping

Ledger + CHANGELOG are EXISTING files: python-scripted edits through bash with per-file
EOL detection, unique-anchor assertion (count==1), then NUL/CRCR byte-scan (python read,
not grep). CHANGELOG bullet goes ONLY under the FIRST `### Added` inside `## Unreleased`.
Handoff is a NEW file (Write tool). Blueprint status flip is a python edit to this file.

## Layer 6 — RISK AUDIT (self-adversarial)

- **Perimeter:** Vault settings persistence; no OrderManager / risk-gates / kill-switch /
  interlock / Alpaca-submit references anywhere in blast radius. Patch-grep of both new
  test files at T3 to prove it. VERDICT: off-perimeter, no approval nodes.
- **How could this plan be wrong?** (1) Fixture drift — mitigated: every fixture constant
  read from source this session at file:line. (2) The real-fs harness could be flaky in
  sandbox — mitigated: identical pattern already runs green in this sandbox today inside
  the 1419 (subsecond-prefs, kill-switch-store, vault-writer). (3) Cache test (T1.4)
  could over-pin an implementation detail — REVIEWED: the cache is documented service
  behavior (`intel-layout.ts:38-42`) and main/index.ts depends on it for IPC-read cost;
  contract, not accident. (4) Windows CI paths — `join(os.tmpdir(),…)` + `rmSync(force)`
  is the in-repo proven idiom.
- **Degenerate-input classes** (P-039/P-040 lineage) are the SUBJECT of half the tests:
  non-array, non-object, NaN/Infinity geometry, corrupt JSON, missing fence, version
  drift. No unbounded spreads introduced (tests iterate fixture arrays of ≤ 5).
- **Teardown/leak class (PR #6 lineage):** tests create no timers, observers, or
  listeners; the only resource is the tmpdir, reaped in `afterEach` with `force: true`.
- **Divergence found during boot (→ ledger P-058):** ARCHITECTURE.md §2, CONSTITUTION.md
  §3.1, and ledger P-022 describe a 7-domain-subdir `services/` layout (`broker/`,
  `execution/` ⚠️, `risk/` ⚠️, …). The filesystem and git disagree: only `services/alpaca/`
  exists (8 tracked files); `git log --diff-filter=A` shows the domain subdirs were
  **never added in any commit**; `main/index.ts:29-30` imports the flat paths; 98 flat
  `services/*.ts` files are tracked and live. The flat layer IS the canonical layer.
  Direction (fix docs vs perform the restructure) is an operator call — ledgered, not
  freelanced. This plan's only dependence: tests are co-located in the FLAT dir, which
  is correct either way for today's tree.
- **Vetoes:** none required — no task touches the perimeter or a one-way door.

## Layer 7 — ASSEMBLED PLAN

This file. Execute T1 → T2 → T3 → T4 → T5 → T6 in order; divergence rule applies (if
reality contradicts a spec, re-derive the minimal correct action AND correct this file).

---
*Status log:*
- 05:0x — baseline green (see header), blueprint written, execution begun.
- 05:1x — T1+T2 shipped (28/28 targeted green, scans clean); T3 gates: typecheck 0 | lint 0
  (0 w) | vitest 115/1447/0 (387+452+316+292) | knip 0 byte-identical. T4 ledger (P-058 OPEN,
  P-059 SHIPPED) + T5 CHANGELOG + T6 handoff written. Zero divergences from Layer 5 specs —
  predicted counts landed exactly.
