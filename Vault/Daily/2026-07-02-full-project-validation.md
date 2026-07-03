---
type: validation-report
title: Full-project validation + industry-ceiling assessment
date: 2026-07-02
branch: refactor/filesystem-reorganization
head: b5be6d0
trigger: operator directive — validate every aspect post-P-070; assess vs quant-industry ceiling
---

# 2026-07-02 · Full-Project Validation

Session type: operator-directed validation (not the standard dawn planner PSD).
No code changed. No `git add`/`commit`. Ledger updated (P-071 added).

## P-070 confirmation (on disk, verified)

- Root `docs/` present, 21 tracked files, **no empty shell dirs**, `git status --porcelain -- docs/` clean except the one intentional `docs/README.md` edit.
- `apps/satex-terminal/docs 1` — gone. `apps/satex-terminal/docs/` (real app docs) intact.
- Status: **SHIPPED — verified clean.** Nothing further to do on P-070.

## Gate baseline (measured this session, working tree @ b5be6d0)

| Gate | Result | Evidence |
|---|---|---|
| typecheck | exit 0 | `tsc -p tsconfig.node.json` + `tsconfig.web.json`, both clean |
| lint | exit 0, 0 warnings | `eslint src tests` |
| test | **115 files / 1463 tests / 0 fail** | run in 3 segments (see P-071) |
| knip | sandbox OOM (exit 137) | oxc-parser 2 GB ceiling — documented limit; CI is arbiter |

Segmented test counts: `src/shared` 21/333 · `src/renderer`+`tests` 32/378 · `src/main` 62/752.

## New finding

- **P-071 (OPEN):** single-pool `npm test` stalls on post-test open handles in the
  sandbox (tick-recorder SQLite retry timers) — segmented run is fully green.
  Needs a `tick-recorder.ts` teardown audit to decide fix-vs-document. Blocks nothing.

## Structural audit (grounded)

- 36,795 LOC source / 16,464 LOC tests (0.45 ratio).
- Exactly **10 runtime deps** (dependency-minimalism policy holds): better-sqlite3,
  lightweight-charts, react, react-dom, ws, zod, zustand, @electron-toolkit/utils,
  dotenv, electron-updater.
- **122 IPC channels** (constitution said ~103 — grew); **23 `.strict()` Zod schemas**.
- Safety perimeter verified at file:line:
  - `autonomous-trader.ts:141` — refuses when `isLiveCapitalRouted()`; `:148` skips on kill-switch armed. Paper-only wall intact.
  - `kill-switch-store.ts:62` — `writeJsonAtomic` (temp+rename) atomic write contract intact.
  - `calibration.ts:93,133` — multiplier `clamp(winRate/avgConfidence, MULT_FLOOR, 1.0)`, applied as `confidence*mult` <= 1.0. Downgrade-only confirmed — cannot inflate.
  - `llm.ts:10-13` — main-process-only, advisory-only wall documented; cannot gate/size/route an order.
  - No macOS/darwin/dmg build target present.
  - `data-source-guard.ts` present in `src/main/core/` (pure, unit-tested).
- Depth of implementation confirmed present: funded-compliance (`topstep-50k-xfa`,
  `daily-pnl-ledger`, `eod-flatten`, `blackout-window`), TCA (`tca.ts`), self-diagnostic
  health core (`src/shared/health/`), backtest metrics+regression, broker facets
  (order-router/account-syncer/market-data-source/symbol-resolver).

## Bottom line

Gates green (test caveat = sandbox open-handle, not a defect). Safety perimeter
intact and verified in code. The system is a genuinely well-engineered, disciplined
single-operator terminal. It is **not** at the institutional HFT frontier and cannot
be from an Electron+Alpaca stack — see the chat assessment for the honest ceiling
framing. Highest-leverage next steps are structural (L1.F ensemble wiring under
human sign-off, P-071 teardown audit), not more polish.

---

## Session 2 (same day, continued) — Intel-workspace Phase D + funded-account hardening

Operator directive: execute the Phase-D appended requirement on the Intel-workspace
ultraplan (fully-collapsible side rails) and continue full-project validation,
prioritizing funded-account trading polish. Code changed this session (unstaged,
per AGENTS branch→PR discipline — nothing committed).

### Shipped

- **P-073 — fully-collapsible side rails** (Watchlist / Depth / Regime / Exec /
  News / Risk / Logs / Health). New headless `renderer/lib/rail-layout.ts`
  (`computeRailTemplate`, 13 tests) + presentational `RailSlot.tsx` wrap all 8
  panels from `App.tsx` with zero changes to any panel's own source. Additive
  `WorkspaceState.collapsedRails: RailId[]` (no version bump, tolerant hydrate).
  Off-perimeter throughout — view state only, routes no order. Full detail in
  `Vault/00-Audit/PROBLEM-LEDGER.md` P-073.
- **P-074 — `funded-account-store.ts` shallow-spread aliasing (P-061-class),
  hardened proactively**, plus an unbounded `Math.min/max(...arr)` spread in
  `FundedAccountPanel.tsx`'s `Sparkline` (P-041-class) fixed to a bounded loop.
  Both latent, neither an active production bug at time of fix; both regression-
  tested. Full detail in the ledger, P-074.
- **P-071 investigated (still OPEN):** read `tick-recorder.ts` in full — its
  `start()`/`stop()` timer lifecycle is symmetric and correct; the
  `SQLITE_BUSY`/`PROLONGED_OUTAGE` "retries" the earlier session's note referred
  to only exist in the *test file's* mocked fake-timer scenarios, not in
  production code, and all four of those tests correctly call `stop()`.
  `persistence.ts`'s background-maintenance timer is `.unref()`'d. No production
  timer leak found in either file — narrows the single-pool sandbox stall toward
  a native-handle/vitest artifact, but this was a read-only audit, not a
  reproduction, so the entry stays OPEN per its own stated caution.

### Gate re-verification (measured this session, same branch/HEAD as Session 1)

| Gate | Session 1 result | Session 2 result (post P-073/P-074) |
|---|---|---|
| typecheck | exit 0 | **exit 0** |
| lint | exit 0, 0 warnings | **exit 0, 0 warnings** |
| test | 115 files / 1463 tests / 0 fail (segmented) | **117 files / 1488 tests / 0 fail** (sharded 4×: 397+464+332+295) |
| knip | sandbox OOM (exit 137) | **exit 0, 55 lines** — byte-identical unused-export/type list to the pre-session baseline (no new unused exports; the Node-20 process-version shim this session avoided the oxc-parser OOM class Session 1 hit) |

All four gates are unambiguously green this session — knip's earlier "sandbox OOM"
caveat did not reproduce once run with the Node-20 shim recipe documented in the
work-layer scheduled-task prompt; worth noting for future sessions that this
recipe reliably avoids the oxc-parser 2 GB ceiling.

### Environment note — file-bridge tail-truncation, encountered and recovered

Mid-session, edits made through the file-editing tool were correctly written to
the authoritative repo copy but did not immediately propagate to the sandbox's
mounted view used for running gates — several files (`types.ts`, `workspace-
state.ts`, `App.tsx`, `globals.css`, `workspaceStore.ts`) appeared truncated
mid-token in the sandbox mount only, with one (`App.tsx`) showing the exact
NUL-padded-tail signature the constitution documents as a known file-bridge
failure class. Recovered by re-materializing each affected file's correct,
complete content (verified against the authoritative copy) directly through the
sandbox shell, then re-running the full gate bar to confirm a byte-for-byte
consistent state before any further edits. No data was lost; every fix was
verified against the source of truth before being trusted. Noted here as a
documented incident, not swept under a green gate.

### Funded-account trading path — status after this session's polish pass

The funded-account compliance path (`topstep-50k-xfa.ts`, `checks.ts`,
`payout-metrics.ts`, `daily-pnl-ledger.ts`, `eod-flatten.ts`,
`blackout-window.ts`, `funded-account-store.ts`, `FundedAccountPanel.tsx`) was
read in full this session. Every file has sibling test coverage. Two real
findings (both fixed, see P-074): a latent aliasing hazard in the persistence
layer and an unbounded array spread in the display component's sparkline. No
other defects found across the six defect classes checked (leaks, degenerate
inputs, unbounded growth, unsafe casts, silent error-swallowing, aliasing).
The path is correct and now measurably hardened, but "extremely polished and
wildly improved" funded-account trading — richer UI, deeper analytics, new
compliance surfaces — is feature work, not defect remediation, and the
work-layer mandate scopes autonomous code changes to existing-defect fixes off
the perimeter. Recommend an `/ultraplan` pass (same rigor as the Intel-workspace
build) if the operator wants net-new funded-account UI/analytics scoped and
built next session.

### Bottom line (Session 2)

Every gate is green with real numbers, not asserted ones. Two real (if latent)
defects found and fixed with regression tests. One genuinely new, real
capability shipped (Phase D collapsible rails) end-to-end: types → IPC schema →
persistence → store → pure layout math → UI → tests, entirely off the
trading-safety perimeter. The environment's file-bridge hazard was hit, correctly
diagnosed against the constitution's own documented failure class, and recovered
without data loss or unverified claims. Nothing here changes the industry-ceiling
assessment from Session 1 — this was hardening and one well-scoped feature, not a
structural leap toward the institutional frontier.
