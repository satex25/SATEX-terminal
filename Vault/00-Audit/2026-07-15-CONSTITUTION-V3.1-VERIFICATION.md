---
type: audit
title: CONSTITUTION.md v3.1.0 — Grounded Verification Audit
tags: [satex, audit, constitution, honesty-axiom, P-104]
date: 2026-07-15
auditor: Opus 4.8 (Builder session)
scope: Re-measure every checkable factual claim in CONSTITUTION.md v3.1.0 against the working tree
verdict: VERIFIED TRUE (2 false-alarms resolved in the document's favor; 2 non-constitution nits noted)
---

# CONSTITUTION v3.1.0 — Grounded Verification Audit

> Directive 0.1 / §2.6 applied to the constitution itself. Every claim below was
> re-measured against the mount working tree on 2026-07-15 (= the p104 bundle
> `0945d8e`, byte-identical). No theatrical scores; evidence-cited; the code is truth.

## 1. Method

- Working copy: `mc4/` on branch `chore/p103-canonical-name-and-doc-truth`.
- Ground truth: `origin/master` @ `32ceccd` (P-100 record) + the uncommitted P-103/P-104
  doc-truth sweep, confirmed byte-identical (CRLF-normalized) to the committed p104
  bundle across all 10 doc-truth files.
- App dir for measurements: `apps/satex-terminal/`.
- Every number below came from running the thing (grep/find/node), not from prose.

## 2. Claim-by-claim result

| Constitution claim | Where | Measured | Verdict |
|---|---|---|---|
| Runtime deps = 10 | §1.1 | `package.json` dependencies = 10 (@electron-toolkit/utils, better-sqlite3, dotenv, electron-updater, lightweight-charts, react, react-dom, ws, zod, zustand) | TRUE |
| IPC = 122 channels | §1.1, §3.1 | `src/shared/ipc-channels.ts` quoted-key count = 122 | TRUE |
| SQLite = 13 tables | §1.1, §3.1 | `persistence.ts` real `CREATE TABLE IF NOT EXISTS` = 13 (see §3 — raw grep of "CREATE TABLE" returns 15; 2 are comment lines) | TRUE |
| Panels = 21 | §3.1 | `src/renderer/panels/*Panel.tsx` = 21 (incl. `DisciplinePanel.tsx`); the 22nd `*Panel.tsx` is the dev `TweaksPanel` in `components/` | TRUE |
| Modals = 7 | §3.1 | 7 modal instances under `components/modals/`; the 8th `*modal*` file is the generic `Modal.tsx` dialog shell (see §3) | TRUE |
| Zustand stores = 24 | §1.1, §3.1 | 24 `*[Ss]tore.ts` files under `src/renderer`, all import zustand | TRUE |
| Themes = 3 (classic/mono/bluyel) | §1.1, §3.1 | `globals.css` `data-theme="bluyel"`; App.tsx names mono/bluyel overrides on a classic base | TRUE |
| Rails = 9 incl. discipline | §3.1 | `types.ts:54 RAIL_IDS` = ['watchlist','depth','regime','exec','news','risk','discipline','logs','health'] | TRUE |
| Workspaces = ⌘1-6 (Trade/Focus/Markets/Replay/Quad/Intel) | §3.1 | 6 workspace literals in App.tsx incl. Intel (`IntelWorkspace`) | TRUE |
| calibration MIN_SAMPLES=30 @39, MULT_FLOOR=0.5 @42 | §3.3 | `calibration.ts:39 const MIN_SAMPLES = 30`, `:42 const MULT_FLOOR = 0.5` | TRUE |
| Funded overlay gates 9-13 | §1.4, §3.4 | `order-manager.ts` funded-mll:299, funded-blackout:313, funded-max-contracts:324, funded-eod:338, funded-asset-class:347 | TRUE |
| Flat services/ + alpaca/, extracted core/ | §3.1 | services/ has only `alpaca/` subdir; core/ holds trading-engine + data-source-guard, ensemble-fuser, order-event-router, order-fill-learning-router, simulator-bracket | TRUE |
| ~53 service modules | §3.1 | `services/*.ts` non-test = 53 | TRUE |
| Self-Diagnostic Core src/shared/health/ | §3.1, §5.2 | health-signals.ts + diagnose.ts (+ types.ts) present | TRUE |
| Spec path docs/superpowers/specs/ | §1.4, §2.7 | exists (topstep-eval-capable, alpaca-broker-session, ...) | TRUE |
| IPC Zod .strict() | §0.9, §2.4 | validation centralized in `src/shared/ipc-schemas.ts`; handlers register in `src/main/index.ts` | TRUE |
| version 0.5.0, engines >=20.19 | §1.1 | `package.json` version 0.5.0, node >=20.19.0 | TRUE |
| Stack: Electron 32, React 18.3, TS 5.6, Zod 4, ESLint 10, Zustand 5, lwc v5 | §1.1 | ^32.2.0 / ^18.3.1 / ^5.6.2 / ^4.4.3 / ^10.4.0 / ^5.0.1 / ^5.0.0 | TRUE |
| Test baseline 126 files | §1.1 | exact vitest include glob (src+scripts, .ts, minus e2e) = 126 (125 src + 1 scripts); no .tsx tests | TRUE |
| CI job "Gates (typecheck, lint, knip, tests)" | §2.1 | `.github/workflows/ci.yml:16` | TRUE |
| Repo canonical satex25/SATEX-terminal everywhere functional | §1.1, §2.4 | auto-update.ts owner:'satex25'/repo:'SATEX-terminal'; README badge/Releases; git remote; zero functional `satex-trading` refs | TRUE |
| Version stamps 3.1.0 / 2026-07-15 / P-104 / review 2026-10-13 | header+footer | consistent in both blocks | TRUE |

## 3. The two false-alarms (both resolved in the constitution's favor)

- **SQLite "15 vs 13":** `grep -c "CREATE TABLE"` returns 15, but two hits are prose —
  line 69 (`// PRAGMA ... BEFORE any CREATE TABLE`) and line 258
  (`// ... The CREATE TABLE`). The actual `CREATE TABLE IF NOT EXISTS <name>` statements
  are exactly 13: sessions, orders, pnl, brain, watchlist, observations, pattern_weights,
  learning_log, calibration_log, ticks, replay_bookmarks, tape_manifest,
  crypto_subsecond_candles. **Constitution correct.**
- **Modals "8 vs 7":** the 8th `*modal*.tsx` file is `components/Modal.tsx` — the generic
  reusable dialog shell ("SATEX — Generic dialog modal shell"), not a modal instance. The
  7 real modals are About, ExitReflection, Indicators, LiveMode, Settings, Shortcuts,
  Tactics. **Constitution correct.**

## 4. Gate floor (sandbox, Node 22.22.3)

| Gate | Result |
|---|---|
| typecheck node (`tsc -p tsconfig.node.json --noEmit`) | exit 0 |
| typecheck web (`tsc -p tsconfig.web.json --noEmit`) | exit 0 |
| lint (eslint on touched `auto-update.ts` + `.test.ts`) | exit 0 |
| vitest `auto-update.test.ts` (touched perimeter-adjacent test) | 14/14, exit 0 |
| full vitest 1668/126 | CI arbiter — `vitest list` collection exceeds the 45s ceiling; the branch changes no test file other than `auto-update.test.ts` (still 14), so the total is definitionally master's P-100 record |
| knip | CI arbiter — P-097 (oxc raw-transfer crash under Node 22) |

Recipe held: `@rollup/rollup-linux-x64-gnu` already present; `package-lock.json` md5
`cd3722f6c677646d151e6681a9ae337d` unchanged before/after.

## 5. Nits found (neither is a constitution error)

1. **Stale code comment** `src/renderer/App.tsx:251` reads "Workspace digits ⌘1..⌘5" while
   the app is ⌘1-6 (line 332 correctly says "⌘1–⌘6"). Off-perimeter, single-answer fix.
2. **Phrasing** §1.1 says the canonical name "per package.json" is "SATEX"; the actual
   `package.json` `name` field is `satex-app` (the product name is SATEX; the npm package
   id is satex-app). Not a factual error about the system, but worth a one-word footnote.

## 6. Git hygiene snapshot

- Working tree = p104 bundle (`0945d8e`) byte-identical across all 10 doc-truth files.
- 4 loose bundles at repo root, all based on `origin/master` `32ceccd`, all apply clean:
  - **p104** (`0945d8e`, chore/p103-...) — P-103 sweep + v3.1 constitution; **supersedes p103**; docs-only, zero perimeter.
  - **p101** (`83d0cd7`, feat/discipline-edge) — Track B EDGE; touches `core/trading-engine.ts` + adds 1 IPC channel (→123 after adopt); carries its own ledger entry + ultraplan; **§2.7 human sign-off required**.
  - **p102** (`06aefe9`, feat/intro-fade-quad) — intro Quad fade-in, UI-only; **no ledger entry anywhere (§0.10 gap)**.
  - **p103** (`19b8c08`) — redundant (ancestor of p104); ignore/delete.
- Overlapping files across p101/p102/p104: CHANGELOG (Unreleased), PROBLEM-LEDGER.md
  (p101/p104), types.ts + globals.css (p101/p102) → sequential adoption needs rebase;
  expect CHANGELOG/ledger-head conflicts.
- Stale locks present: `.git/index.lock`, `.git/objects/maintenance.lock` (P-099
  recurrence) — block in-mount commits; clear via `scripts/git-unlock.ps1` (untracked).
- Tracked-ledger P-numbers run continuous to P-100 then jump to P-103/P-104: P-101 rides
  its own bundle (restored on adoption); **P-102 is genuinely unledgered**.

## 7. Conclusion

The v3.1 constitution did exactly what its preamble promised: it realigned to measured
reality. Independent re-measurement confirms it. The repo is healthy and the gate floor is
green for the doc-truth branch; the remaining "catch-up" is operator-side ceremony.

### Recommended operator close actions
1. Clear the stale locks (`scripts\git-unlock.ps1`).
2. Adopt **p104** first (docs, zero-risk): fetch bundle → branch → push → PR → CI green → merge → verify SHA on master.
3. Then **p102** (UI; add its missing ledger entry as part of the PR).
4. Then **p101** (learning-core-adjacent; §2.7 human sign-off; bump IPC 122→123 in ARCHITECTURE §2 + CONSTITUTION §1.1/§3.1 in the same PR).
5. Fix the `App.tsx:251` comment opportunistically (off-perimeter).
6. Delete the redundant p103 bundle.

*No code or docs were mutated this session beyond creating this untracked report — the
p104 adoption state is preserved pristine.*
