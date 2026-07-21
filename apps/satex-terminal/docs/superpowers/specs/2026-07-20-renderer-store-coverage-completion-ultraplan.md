# Renderer-Store Characterization-Coverage Completion

> **Ultraplan blueprint.** Authored 2026-07-20 (re-run session, real fire 16:37 CDT — see
> handoff) on `master` @ `81b115a`. Continues the P-116/P-117 renderer-store coverage vein.
> Status: LEAD EXECUTED (accountStore, 12 tests, unstaged); 7 finisher targets specced below.
> RISK-TOUCH: **none.** Every target is a renderer UI store with no order/risk/kill/arm
> path contact. Test-only, additive (NEW `.test.ts`, subjects byte-unchanged). No perimeter,
> no human gate — this is exactly the safe-coverage class P-094→P-116→P-117 established.

---

## §1 — Objective (Layer 1)

**Core goal.** Close the renderer-store test-coverage gap opened after the P-094 services
sweep completed. Of 24 renderer Zustand stores, P-116 (marketStore) and P-117
(indicatorStore) are pinned; **8 remained untested** at boot. This session ships the
highest-leverage one (`accountStore.ts`, 50 L — the central account/orders/status store
every equity readout and TopBar flow through) and specs the other 7 as a parallel finisher
group. Characterization tests: they assert MEASURED current behavior so a future refactor
that silently breaks a default, a bound, or a shared-reference immutability contract turns a
test red.

**Success criteria (which count changes, which gates flip).**
- One NEW `*.test.ts` per store, each passing ≥2× order-independent in the /tmp harness.
- Every load-bearing guard in each store asserted explicitly (enumerated per target, §5).
- Subjects byte-unchanged (md5 mount == /tmp).
- Gates: scoped strict `tsc --noEmit` exit 0 per file; vitest green; full `eslint src tests`,
  full `tsc`, and `knip` are **CI-arbitrated** (sandbox 45 s startup ceiling on eslint 10.7
  flat-config; Node-22 oxc knip crash, P-097) — named, not faked (§0.4).

**Constraints (named).** §2.5 invariant 2 (equity is `DEFAULT_EQUITY`, never
`STARTING_EQUITY`) — accountStore must be pinned against reintroduction. Invariant 1
(Zustand, no cross-store coupling). P-061/P-074 shared-mutable-default class — every
fresh-copy path (accountStore's `setIndicators` Map; feedStore/healthStore module-const
defaults) gets an aliasing pin. Correctness precedes optimization (§2.7): **subjects are not
edited** — if a latent aliasing smell is found (e.g. an initial-state spread that aliases an
array/Map), it is ledgered as an operator-taste deferral (P-020/P-028/P-092 pattern), not
fixed unattended.

**Environment.** All targets: Electron **renderer** Zustand stores. Runtime dep graph per
store is `zustand` + the store's `@shared` value imports only (type imports erase). Node
vitest environment suffices for every `getState()/setState()` reducer test;
`useFootprintCandles` (the one hook-based selector) needs jsdom/`renderHook` and is deferred
to a follow-up (its underlying `ingest`/`reset`/`version` behavior IS node-testable and is
the load-bearing part — specced below).

**Assumptions (flagged).** (A1) Repo dep versions: zustand ^5.0.1, react ^19.2.7, vitest
^4.1.10, typescript ^6.0.3 — VERIFIED against `package.json`. (A2) `@shared` aliases to
`src/shared` — VERIFIED in `vitest.config.ts:16`. (A3) The sibling harness recipe (copy
`src/shared` + subject + test into /tmp, `npm install zustand vitest react react-dom` in ONE
command — multiple `--no-save` installs prune each other, confirmed this session) works for
every target — VERIFIED on accountStore.

---

## §2 — Domain map (Layer 2)

| Store | Lines | Load-bearing behavior | RISK-TOUCH |
|---|---|---|---|
| `accountStore.ts` (LEAD, DONE) | 50 | DEFAULT_EQUITY defaults + buyingPower=2×equity; `setIndicators` fresh-Map immutability; 4 whole-slice setters | none |
| `footprintStore.ts` | 59 | `ingest` null/empty bail + version bump + aggregator feed; `reset` clearAll + version bump; shared aggregator | none |
| `feedStore.ts` | 25 | pessimistic DEFAULT shape (equity off / futures synthetic / crypto off); `setStatus` replace | none |
| `logsStore.ts` | 16 | `setTail({lines})` destructure → `tail` | none |
| `fundedAccountStore.ts` | 24 | snapshot null until first push; `setSnapshot` replace (L1.D funded-overlay display) | none |
| `healthStore.ts` | 26 | default `HealthReport` (healthy/empty); `setReport` replace; module-const aliasing | none |
| `regimeStore.ts` | 16 | snapshot null; `setSnapshot` replace | none |
| `depthStore.ts` | 16 | snapshot null; `setSnapshot` replace | none |

None of these files import an order/risk/kill/arm module. Confirmed: `grep -L` shows no
`@shared/broker`, `order`, `risk`, `kill`, or `live-mode` imports in any target.

---

## §3 — Task tree (Layer 3)

- T0 (DONE) accountStore.test.ts — authored, 12 tests, 12/12 ×2, scoped tsc 0, byte-verified.
- T1 ∥ footprintStore.test.ts (node: ingest/reset/version; defer useFootprintCandles hook).
- T2 ∥ feedStore.test.ts (default shape + setStatus + module-const aliasing pin).
- T3 ∥ logsStore.test.ts (empty default + setTail destructure).
- T4 ∥ fundedAccountStore.test.ts (null default + setSnapshot).
- T5 ∥ healthStore.test.ts (default report + setReport + aliasing pin).
- T6 ∥ regimeStore.test.ts (null default + setSnapshot).
- T7 ∥ depthStore.test.ts (null default + setSnapshot).
- T8 verify pass: re-run each test ×2 order-independent; md5 subjects unchanged; byte-scan.

---

## §4 — Dependency DAG (Layer 4)

T0 → (T1 ∥ T2 ∥ T3 ∥ T4 ∥ T5 ∥ T6 ∥ T7) → T8. T1–T7 are fully independent (different NEW
files, no subject edits) — a max-effort finisher runs them in any interleave. Zero APPROVAL
NODES (no RISK-TOUCH anywhere in this blueprint). One shared harness serves all: copy all 8
subjects+tests into one /tmp dir, `include: ['stores/**/*.test.ts']`.

---

## §5 — Execution specs (Layer 5, cold-start complete)

**Harness recipe (all targets).** `H=/tmp/satex-agent-rstore`; `cp -r
apps/satex-terminal/src/shared $H/shared`; copy each `stores/<x>.ts` + `<x>.test.ts` into
`$H/stores/`; `vitest.config.ts` aliases `@shared`→`./shared`, `test.environment:'node'`,
`include:['stores/**/*.test.ts']`; **one** install: `npm install --no-save zustand@5.0.1
vitest@4.1.10 react@19.2.7 react-dom@19.2.7 typescript@6.0.3 @types/react@19 @types/node@20`.
Scoped tsc: `tsconfig.json` with `strict`, `moduleResolution:'bundler'`,
`ignoreDeprecations:'6.0'` (TS 6 flags `baseUrl`), `paths:{'@shared/*':['shared/*']}`,
include the touched files + `shared/types.ts`,`shared/constants.ts`. Reset pattern in each
`beforeEach`: `useX.setState(useX.getInitialState(), true)`. Validation: `npx vitest run`
then `npx vitest run --sequence.shuffle` (expect N/N ×2); `npx tsc --noEmit -p tsconfig.json`
(expect exit 0). **After each write: python byte-scan (0 NUL / 0 CRCR / LF-only / tail
intact) and md5 subject == mount.**

**T1 footprintStore.test.ts** — subject `src/renderer/stores/footprintStore.ts:36-49`.
Pin: (a) `ingest([])` and `ingest(null as any)` are no-ops — `version` unchanged, aggregator
untouched; (b) `ingest([trade])` bumps `version` by exactly 1 and the trade is retrievable
via `getState().agg.recent(symbol)`; (c) `ingest` of a 3-trade batch bumps version by 1
(batch = one bump, not per-trade); (d) `reset()` bumps version and `agg.recent(sym)` returns
empty after. Fixture `Trade` from `@shared/types` (read the interface; construct minimal
valid: symbol, price, size, side, timestamp — verify field names against the type). Node env
(no hook). **Defer** `useFootprintCandles` (needs `renderHook`+jsdom) — note it in the test
header as a follow-up. Expected artifact: ~8 tests. Failure mode: if `FootprintAggregator`
pulls a DOM/canvas dep, switch that file's env to jsdom (check its imports first).

**T2 feedStore.test.ts** — subject `feedStore.ts:20-25`. Pin: (a) initial `status` deep-equals
`{equity:'off',futures:'synthetic',crypto:'off'}`; (b) `setStatus(x)` stores `x` by
reference; (c) **aliasing pin** — after `setState(getInitialState(), true)`, mutating the
returned `status` object must not corrupt a fresh store instance's default (the module `DEFAULT`
const is returned by reference in initial state; assert the current behavior — if initial
`status` IS the same reference as a second `getInitialState().status`, pin that as the
observed contract and flag as a P-061/P-074 latent smell in the ledger, do NOT edit). ~4 tests.

**T3 logsStore.test.ts** — subject `logsStore.ts:13-15`. Pin: (a) initial `tail` is `[]`;
(b) `setTail({lines:[e1,e2]})` sets `tail` to that exact array (destructure contract);
(c) `setTail({lines:[]})` clears. `SystemLogEntry` fixture from `@shared/types`. ~3 tests.

**T4 fundedAccountStore.test.ts** — subject `fundedAccountStore.ts:21-24`. Pin: (a) initial
`snapshot` is `null`; (b) `setSnapshot(s)` stores by reference; (c) a second `setSnapshot`
replaces. `FundedAccountSnapshot` from `@shared/funded/types` (read the type for a minimal
fixture). ~3 tests.

**T5 healthStore.test.ts** — subject `healthStore.ts:11-25`. Pin: (a) initial `report`
deep-equals `{severity:'healthy',findings:[],recommendedAction:null,needsAttention:false}`;
(b) `setReport(r)` stores by reference; (c) **aliasing pin** — initial `report.findings` is
the module const's array; assert observed reference behavior and flag if aliased (deferral,
no edit). `HealthReport` from `@shared/health/types`. ~4 tests.

**T6 regimeStore.test.ts** — subject `regimeStore.ts:13-15`. Pin: initial `snapshot` null;
`setSnapshot` by reference; replace. Fixture type from the store's `@shared` import. ~3 tests.

**T7 depthStore.test.ts** — subject `depthStore.ts:13-15`. Pin: initial `snapshot` null;
`setSnapshot` by reference; replace. Fixture type from the store's `@shared` import. ~3 tests.

**Cold-start test.** Could an agent that read only this blueprint + the boot docs execute
T1–T7? Yes: each carries subject `file:line`, the exact guards to assert, the fixture source,
the env choice, the validation commands with expected output, and the harness recipe. The one
soft edge (footprint aggregator DOM deps) has a stated fallback.

---

## §6 — Risk audit (Layer 6)

- **Perimeter:** none touched. Every subject is a renderer UI store; grep-confirmed no
  order/risk/kill/arm imports. No APPROVAL NODES.
- **Subject-edit risk:** zero — additive NEW test files only. Any refactor temptation
  (aliasing fixes) is explicitly deferred to an operator taste ruling (§1 constraint).
- **P-099 file-bridge:** all writes via bash-mount heredoc; byte-scan every file. New files,
  so file-tool creation would also be acceptable, but bash-mount is used for consistency.
- **Harness fidelity:** md5 every subject mount==/tmp before trusting a green; the /tmp
  install must be ONE command (multi `--no-save` prune, confirmed). `package-lock.json` is
  untouched (harness is /tmp, `--no-save`).
- **False-green:** knip and full eslint/tsc are NAMED as CI-arbitrated, never wrapped to
  exit 0 (P-097). Scoped tsc is real (exit code reported).
- **Characterization trap:** these pin CURRENT behavior. If a pinned behavior is itself a
  latent defect (an aliased default), the test pins it AND the ledger flags it — the test is
  not a claim the behavior is ideal, only that it is now observable.

---

## §7 — Assembled plan (Layer 7)

Ship order: T0 (done) → finisher runs T1–T7 in parallel under one harness → T8 verify. Each
lands as a NEW unstaged `.test.ts`; operator adopts via PR (CI re-arbitrates the full gate
bar). Expected total new coverage: ~28 tests across 7 files on top of accountStore's 12.
The bar (§9 of the dawn prompt): none of this changes a live session directly, but a pinned
renderer-store layer is how the P3-legibility hot path stops regressing silently — the store
that feeds every equity readout now fails loud instead of drifting quiet.
