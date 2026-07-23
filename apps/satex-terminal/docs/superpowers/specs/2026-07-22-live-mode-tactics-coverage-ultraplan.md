---
type: ultraplan
date: 2026-07-22
slug: live-mode-tactics-coverage
ledger: P-094 (live-mode.ts + tactics.ts human-gated remainder)
author: Claude Sonnet 5, operator-directed session
target: apps/satex-terminal/src/main/services/live-mode.ts (zero test coverage) + apps/satex-terminal/src/main/services/tactics.ts (gap-fill on the 12-test P-121 suite)
perimeter: RISK-TOUCH — live-mode.ts is the live-capital arming interlock (CONSTITUTION §2.4), tactics.ts is the MAY-TACTICS graduation interlock. Test-only; no source-behavior change. Even test-only touches require human-in-the-loop review of this plan + PR sign-off before merge (CONSTITUTION §0.3/§2.4, AGENTS.md:73).
---

# Ultraplan — live-mode.ts characterization coverage + tactics.ts gap-fill

> Status: DRAFT — awaiting operator section-by-section review. No test code written yet.
> Execution route: TBD (set at the end of this file once approved).

## §0 — Decision log

| ID | Question | Answer |
|---|---|---|
| D1 | Boundary: live-mode.ts full suite + tactics.ts reconciliation, test-only, human-gated merge | **Draft it** |
| D2 | tactics.ts treatment given P-121 already shipped 12 tests | **Small gap-fill addendum** (recordOutcome mutation path, veto-lift branch, post-graduation drift refusal) |
| D3 | PR bundling | **One branch, one PR** for both files — mirrors how P-127–P-130 landed together as PR #68 |

---

## §1 — Objective Clarification

**Core goal.** Add `live-mode.test.ts` as a from-scratch characterization suite pinning
every branch of the live-capital arming interlock, and extend the existing
`tactics.test.ts` with the gap-fill tests identified in preflight — all test-only, zero
production-source edits, closing the human-gated remainder of P-094.

**Success criteria (tied to gates / priority stack):**
- New file `src/main/services/live-mode.test.ts` exists; `npx vitest run` on it is green,
  target ≥ 16 tests (one per branch/boundary enumerated in §3.1).
- `tactics.test.ts` grows from 12 to 18 tests (append-only, +6); existing 12 stay
  byte-identical in intent (may reformat imports only if required by the new harness
  additions, but no existing assertion is weakened or removed).
- `npm run typecheck` (node + web) exit 0, `npm run lint` exit 0, `npm run knip`
  CI-arbitrated (per repo convention, P-097), full `npm test` green.
- **Subjects `live-mode.ts` and `tactics.ts` byte-unchanged** (`git diff` empty on both) —
  this is a coverage-only pass, P0 integrity constraint.
- PROBLEM-LEDGER.md P-094 entry gets an update recording: (a) this suite shipped, (b) the
  discovery that tactics.ts's "zero coverage" framing was stale (P-121 already covered the
  core graduation machinery on 2026-07-20), (c) new Status line.
- Finding F-1 (veto-lift near-unreachability, see §6) filed as its own finding-only ledger
  entry for operator disposition — surfaced by this review, not fixed here.

**Constraints (cited by number):**
- CONSTITUTION §0.3 / §2.4: "Never touch the safety perimeter autonomously... even adding
  tests to interlock code (P-094) requires an explicit human in the loop and PR sign-off."
  This blueprint IS that human-in-the-loop step; the PR that follows still needs your
  explicit merge sign-off, not just green CI (exact P-121 precedent — PR #63 was "routed to
  operator for independent perimeter check before merge, not auto-merged").
- AGENTS.md:73: same rule, restated at the working-doc level.
- CONSTITUTION §2.5 invariant 9 / P-061/P-074 class: never return shared mutable defaults —
  relevant because `load()` in both subjects returns fresh object literals; tests should
  assert independent loads don't alias (cheap to add, matches repo's own recidivist-defect
  discipline).
- Harness convention (repo-established, not my invention): `vi.mock('electron')` for
  `app.getPath` only; real `fs` against a per-test `fs.mkdtempSync` temp dir; `vi.resetModules()`
  + dynamic `await import(...)` per test case because both subjects compute a module-level
  singleton (`state` / `TacticsEngine.store`) at import/construction time. Source: this
  exact pattern in `self-eval-store.test.ts`, `alpaca-mode.test.ts`, `tactics.test.ts` itself.

**Environment.** Main process (`src/main/services/`), Node/Electron layer, no renderer
involvement, no broker facet involvement — both subjects are local-JSON-file state
machines consulted by `trading-engine.ts` and (for live-mode) the IPC handler in
`main/index.ts`. Neither IPC handler nor `trading-engine.ts` is edited by this plan.

**Assumptions (verified against the actual files this session, not asserted):**
- `live-mode.ts` has zero existing test file — VERIFIED (`find src/main/services -iname
  "*.test.ts"` lists no `live-mode.test.ts`).
- `ALPACA_PAPER_HOST = 'paper-api.alpaca.markets'` — VERIFIED, `shared/constants.ts:132`.
- `NOTIONAL_HARD_CAP = 50_000` module constant in `live-mode.ts:18` — VERIFIED.
- `tactics.test.ts` currently has exactly 12 `it(...)` cases — VERIFIED by direct read,
  matches the ledger's P-121 entry claim.
- Both subjects' `load()` swallow-to-default on any read/parse failure, and `save()`
  swallows write failures behind `log.error`/`log.warn` — VERIFIED by reading both files
  in full this session.
- `tactics.ts`'s `recordOutcome()` is never invoked by the current test file — VERIFIED
  (grep of `tactics.test.ts` shows only `seed()` + `new TacticsEngine()`, no
  `.recordOutcome(` call).

**Unknowns.** None outstanding — all three genuine unknowns from Layer 1 were resolved via
the D1-D3 decision log above before this draft was written.

---

## §2 — Domain Mapping

**Problem classification.** Pure test-authoring / verification-domain work on two
functional, stateless-per-call, file-persisted interlock modules. No data-domain change
(no schema/migration touched), no operational change (no build/CI config touched), no
temporal change. The **risk domain** is why this is gated at all: both subjects are named,
by file, in CONSTITUTION §2.4's hard-wall table ("Live-mode arming interlock" and
"MAY-TACTICS graduation interlock").

**Touch-map.**
- **Agents (SATEX 8-agent model):** RISK-adjacent infra (these modules implement risk-gate
  *mechanics*, not signal generation) — no DATA/TECH/NEWS/MACRO/EXEC/AUDIT/LEARN touch.
- **Broker facets:** none. Neither subject imports `@shared/broker/` or talks to Alpaca
  directly.
- **Files in blast radius (read for context, NOT edited):**
  - `src/main/core/trading-engine.ts:59,698,1132,1144-1145,1492,1521-1531,1333` — the only
    caller of `setLiveMode`/`isLive`/`getNotionalCap`/`getLiveModeStatus`; supplies
    `ctx.killArmed` from `this.om.getAccount().killSwitchArmed`.
  - `src/main/index.ts:825-861` — the native-dialog IPC handler (adversarial finding C6,
    2026-05-16) that gates *requesting* live-mode enable before `engine.setLiveMode(req)`
    is ever called. This is the actual XSS-resistant authorization layer; `live-mode.ts`'s
    own `setLiveMode` re-validates the structural interlocks independently so a test-only
    or future direct caller can't sidestep them (per the subject's own header comment).
    **Out of scope for this plan** — no dialog/IPC test added, confirmed by D1.
  - `src/shared/types.ts:527-540` — `LiveModeStatus`/`LiveModeSetRequest` shapes (read-only
    reference for the test file's fixtures).
- **Files in blast radius, edited by this plan:**
  - `src/main/services/live-mode.test.ts` (new)
  - `src/main/services/tactics.test.ts` (append-only)
  - `Vault/00-Audit/PROBLEM-LEDGER.md` (P-094 entry update — docs, not app code)
- **Load-bearing invariant at risk:** none broken (tests are additive/observational), but
  the invariant *being pinned* is CONSTITUTION §2.4's "Live-mode arming interlock" row and
  the tactics.ts docblock's graduation contract (`graduated` flag as sole gate for `armed`
  state — P-121's headline invariant).

---

## §3 — Task Decomposition

### §3.1 — `live-mode.test.ts`: full characterization suite  ⚠️ RISK-TOUCH
- **Purpose:** first-ever test coverage on the live-capital arming interlock file.
- **Inputs:** `live-mode.ts` source (read, not modified), `shared/constants.ts`,
  `shared/types.ts`.
- **Outputs:** `src/main/services/live-mode.test.ts`, new file.
- **Tools:** vitest, `vi.mock('electron')`, real `fs`/`os`/`path`, `vi.resetModules()`.
- **Constraints:** subject byte-unchanged; harness mirrors `alpaca-mode.test.ts`.
- **Depends on:** none (first task, no prior artifact needed).
- Safety note: this is the file CONSTITUTION §2.4 names explicitly. Tests are read-only
  observation of existing behavior — no new interlock logic, no relaxed check, no bypass.
  Every negative-path assertion (kill-switch block, loss-limit block, cap-bounds block)
  is pinned as MUST-STILL-REFUSE, not loosened.
- Subtasks (each an atomic vitest `it(...)` case, grouped by `describe`):
  - **`getLiveModeStatus` (4 cases):**
    - paper endpoint (`baseUrl` contains `paper-api.alpaca.markets`) → `paperOnly:true`,
      `enabled:false` even when persisted `state.enabled === true` (the override clause).
    - live endpoint, persisted `enabled:true` → `enabled:true`, `paperOnly:false`.
    - live endpoint, persisted `enabled:false` → `enabled:false`, `paperOnly:false`.
    - `notionalCap`/`endpoint` pass through unchanged from state/arg respectively.
  - **`setLiveMode` — disable path (2 cases):**
    - `{enabled:false}` succeeds regardless of `ctx` (pass a `ctx` that would fail every
      enable-path check — killArmed:true, deep loss breach — disable still returns
      `{ok:true}` and persists `enabled:false`). This is the "always allowed" contract at
      `live-mode.ts:44`.
    - disabling refreshes `updatedAt` to a newer timestamp than the prior enable.
  - **`setLiveMode` — enable path, interlock order (6 cases):**
    - `killArmed:true` → `{ok:false, reason: /Kill switch is armed/}`, state NOT persisted
      as enabled (re-read via a fresh module import shows `enabled:false` still).
    - `dailyPnl` below threshold (`dailyPnl < -(equity * dailyLossLimitPct)`) →
      `{ok:false, reason: /Daily loss limit reached/}`, exact numeric values in the message
      match `.toFixed(2)` of both operands.
    - `dailyPnl` **exactly at** the threshold (`dailyPnl === lossThreshold`) → boundary is
      NOT blocked (source uses strict `<`) — this is the one genuinely surprising boundary
      in the file, worth pinning loudly so a future refactor to `<=` is a deliberate choice,
      not an accident.
    - `notionalCap <= 0` (test both `0` and a negative value) → rejected, message names the
      bound.
    - `notionalCap` at the exact hard cap (`50_000`) → **allowed** (boundary is inclusive,
      `>` not `>=`).
    - `notionalCap` one over the hard cap (`50_001`) → rejected.
  - **`setLiveMode` — enable success path (2 cases):**
    - valid `ctx` + valid `notionalCap` → `{ok:true}`, `isLive()` now true,
      `getNotionalCap()` reflects the new cap, on-disk JSON round-trips
      `{enabled:true, notionalCap, updatedAt}` with a fresh numeric `updatedAt`.
    - interlock **priority order** — a `ctx` that fails BOTH `killArmed` and the loss
      threshold simultaneously returns the kill-switch reason (proves the guard clauses
      run in source order, not some other precedence future refactors might assume).
  - **Persistence / degenerate-input resilience (4 cases, mirrors self-eval-store /
    alpaca-mode precedent):**
    - absent `live-mode.json` → module loads defaults `{enabled:false, notionalCap:500,
      updatedAt:0}` (`isLive()===false`, `getNotionalCap()===500`).
    - malformed JSON on disk → same defaults, no throw.
    - partial JSON (`{enabled:true}` only, missing `notionalCap`/`updatedAt`) → coerced
      `notionalCap:500`, `updatedAt:0`, `enabled:true` preserved (`!!parsed.enabled`
      semantics, matches the `||` fallback for the other two fields).
    - write failure (point `userData` at a file-as-directory, or spy `fs.writeFileSync` to
      throw) → `setLiveMode` does NOT throw; in-memory `isLive()` still reflects the
      attempted set (write failure is swallowed per `save()`'s catch, logged not thrown).
  - **`getLiveModeStatus` freshness (1 case, CONSTITUTION §2.5 invariant 9 class):** two
    consecutive `getLiveModeStatus(url)` calls return structurally-equal but
    reference-distinct objects (`toEqual` true, `toBe` false). This is a REAL pin, not
    theater: `getLiveModeStatus` is polled by the renderer on every status tick, so a
    future refactor that caches and returns a shared mutable status object would let a
    renderer-side mutation corrupt main-process state — exactly the P-061/P-074 aliased-
    default class. (Note: unlike self-eval-store, whose Layer 6 said "no assertion needed"
    because nothing was returned to a mutating caller, `getLiveModeStatus` DOES hand an
    object across the IPC boundary, so the freshness pin earns its place here.)
  - **`isLive()` vs `getLiveModeStatus` — armed-state / effective-state divergence (1
    case, the most safety-relevant pin in the file):** after a successful enable
    (`setLiveMode({enabled:true}, validCtx)` → ok), assert the deliberate split:
    `isLive() === true` (raw armed flag, `live-mode.ts:68` returns `state.enabled` with NO
    endpoint override), while `getLiveModeStatus('https://paper-api.alpaca.markets')`
    returns `{enabled:false, paperOnly:true}` (the `state.enabled && !paperOnly` override
    at `live-mode.ts:39`). This divergence is load-bearing: `trading-engine.ts` uses
    `isLive()` at :698/:1132/:1144/:1333 as "is the arming flag set" independent of
    endpoint, while `getLiveModeStatus` reports the effective posture given the current
    URL. A refactor that "helpfully unified" the two would silently change what several
    engine gates see. Pin it loudly.

### §3.2 — `tactics.test.ts`: gap-fill addendum  ⚠️ RISK-TOUCH
- **Purpose:** close the real coverage holes found scanning the existing 12-test P-121
  suite — the `recordOutcome` mutation/persist path, the 500-cap FIFO, live veto activation,
  veto stickiness, and post-graduation clause drift (approved scope per D2 — small addendum,
  not a rebuild).
- **Inputs:** `tactics.ts` source (read, not modified), existing `tactics.test.ts` (append
  only, existing 12 cases untouched).
- **Outputs:** `tactics.test.ts` modified, +6 `it(...)` cases (12 → 18).
- **Tools:** same harness already in the file (`vi.mock('electron')`, real fs temp dir,
  no `vi.resetModules()` needed here since `TacticsEngine` is a constructed class, not a
  singleton — matches the existing file's own pattern, confirmed by reading it).
- **Constraints:** subject byte-unchanged; do not alter/weaken any of the 12 existing
  assertions; append new `describe` blocks after the existing ones.
- **Depends on:** none functionally, but sequenced after §3.1 in the DAG (see §4) so the
  harness pattern is freshly re-validated on the newer file first.
- Safety note: `tactics.ts` implements the MAY-TACTICS graduation interlock. New tests
  observe existing behavior only — no change to `MIN_TRADES_FOR_ARMED`, `MIN_WIN_RATE`,
  `MAX_DRAWDOWN_VETO`, or any gate predicate.
- Subtasks:
  - **`recordOutcome` mutation path (1 case):** direct call (not file-seeding) —
    `eng.recordOutcome('AAPL', 12.5)` then `eng.status().tradesObserved` increments by
    exactly 1 and the on-disk `tactics.json` reflects the new row. This is the ring-buffer
    push + persist path, wholly unexercised by the existing 12 tests (all of which seed the
    file and construct fresh — grep of `tactics.test.ts` shows zero `.recordOutcome(` calls).
  - **500-row cap trim (1 case):** seed a history at the 500-row ceiling, call
    `recordOutcome` once more, assert length stays 500 and the OLDEST row (not the newest)
    was the one dropped (`if (length > 500) history.shift()`, both on `tactics.ts:89`,
    after the push on :88) — pins FIFO eviction, not just the cap number.
  - **Veto ACTIVATION mid-session (1 case):** start from a clean (non-vetoed) `graduated`
    engine, then `recordOutcome` a loss sequence that pushes the running `maxDrawdown` over
    `MAX_DRAWDOWN_VETO` (6%), and assert `status().vetoActive` flips `false → true` from the
    `recordOutcome`-triggered `refresh()` — NOT at construction. This is the live-transition
    half of `refresh()`'s activation branch (`tactics.ts:171-173`); the existing T4.3 only
    covers activation reconstructed at *boot*. Reachable and deterministic.
  - **Veto STICKINESS against recovery winners (1 case) — replaces a test I first specified
    wrong, see §6:** construct a drawn-down `vetoActive` engine (history with >6% drawdown,
    mirrors T4.3), then `recordOutcome` a long streak of winning trades and assert the veto
    STAYS active (`vetoActive === true`, `state === 'veto'`). This is the TRUE, safety-
    relevant behavior: `maxDrawdown` is a running max over the whole retained buffer
    (`Math.max(maxDd, …)` at `tactics.ts:191`), so appended winners cannot lower it — the
    veto does NOT self-clear on a recovery streak within a session. Pinning stickiness
    catches any refactor to a windowed/recent-drawdown metric that would silently let the
    gate re-arm on a hot streak after a breach. (The veto-LIFT branch at `tactics.ts:174-178`
    is near-unreachable by design; see the §6 CRITIC finding — we surface it, we do not test
    a path that cannot fire.)
  - **Post-graduation performance-drift refusals (2 cases), isolating each `preTradeGate`
    clause independently from `graduate()`'s own pre-check:**
    - an already-`graduated:true` engine (seeded directly, bypassing `graduate()`) whose
      *subsequent* recorded outcomes drop `winRate` below `MIN_WIN_RATE` while `trades ≥
      MIN_TRADES_FOR_ARMED` → `preTradeGate` refuses on the win-rate clause specifically
      (message matches `/[Ww]in rate/`), proving the post-graduation drift path is live,
      not just the pre-graduation `graduate()` refusal already covered.
    - same setup but drifting `expectancy` negative instead → refuses on the expectancy
      clause (`/[Ee]xpectancy/`).

---

## §4 — Dependency + Ordering (DAG)

**Ordered execution sequence:** §3.1 → §3.2 → (typecheck ∥ lint) → knip (CI-arbitrated) →
ledger update → branch/commit → PR.

**Parallelizable set:** none at the task level — §3.2 is sequenced after §3.1 by choice
(re-validate the harness pattern on the file with zero existing tests first, then extend
the file that already has a working harness, so any harness-level surprise surfaces on the
simpler subject first). `typecheck` and `lint` ARE mutually independent once both test
files exist and can run in parallel.

**Approval nodes (one-way doors — require operator sign-off before execution):**
- ⛔ **PR merge** — the single approval node for this entire plan. Per CONSTITUTION §2.4 /
  AGENTS.md:73 / the P-121 precedent, CI green is necessary but not sufficient: you review
  the diff and explicitly approve the merge. Nothing in §3.1/§3.2 is itself a one-way
  door (both are pure test additions, reversible by `git revert`), so the ONLY hard gate is
  merge, not any individual task.

```
§3.1 (live-mode.test.ts) ──▶ §3.2 (tactics.test.ts gap-fill) ──▶ typecheck ∥ lint ──▶ knip
        ──▶ ledger update ──▶ commit ──▶ branch ──▶ PR ──▶ ⛔ operator merge sign-off
```

---

## §5 — Execution Specification

### §5.1 — spec for §3.1 (`live-mode.test.ts`)
- **Method:** characterization testing via DI-free module mocking — exact harness family
  as `alpaca-mode.test.ts`/`self-eval-store.test.ts`: `vi.mock('electron')` for
  `app.getPath` only, real `fs` on `fs.mkdtempSync(path.join(os.tmpdir(),'satex-lm-'))`,
  `vi.resetModules()` in `beforeEach` + `await import('./live-mode')` per test (subject's
  `state` is an import-time singleton, same shape as `self-eval-store.ts`'s `state`).
- **Expected artifacts:** `src/main/services/live-mode.test.ts`, ~20 `it(...)` cases across
  the 6 `describe` groups enumerated in §3.1.
- **Validation:** `npx vitest run src/main/services/live-mode.test.ts` → exit 0, all cases
  pass, reported count ≥ 16. `git diff -- src/main/services/live-mode.ts` empty.
- **Determinism guard for the exact-loss-threshold boundary case:** `lossThreshold =
  -(ctx.equity * ctx.dailyLossLimitPct)` is float arithmetic (`0.02` etc. is not exactly
  representable). Do NOT hardcode the expected threshold as a literal in the test and pass
  `dailyPnl` as a second literal — a `<` comparison of two separately-rounded floats can
  flip. Instead compute `const threshold = -(equity * pct)` in the test with the identical
  expression and pass `dailyPnl: threshold`, so the boundary case exercises `threshold <
  threshold === false` against bit-identical operands. This makes "exactly at the limit is
  NOT blocked" deterministic regardless of platform float behavior.
- **Freshness/divergence validation:** the `getLiveModeStatus` freshness case asserts
  `toEqual` + `not.toBe` on two consecutive calls; the divergence case asserts `isLive()`
  and `getLiveModeStatus(paperUrl).enabled` disagree after a successful enable. Both read
  the same imported module instance (no `resetModules` between the two reads within a case).
- **Failure modes:** if `vi.resetModules()` + dynamic import doesn't re-trigger the
  singleton (stale `state` bleeding across cases, e.g. case 2's `enabled:true` leaking into
  case 3), tests will show cross-case contamination — run the file twice to confirm
  order-independence, same check the self-eval-store spec used. If the write-failure case
  (file-as-directory trick) is flaky cross-platform (Windows dev box vs CI's Ubuntu Node
  20.19), fall back to spying `fs.writeFileSync` to throw via `vi.spyOn`, same fallback
  the self-eval-store spec pre-authorized for its own case 8.
- **Fallback:** if any single case can't be made deterministic within budget, cut it and
  note the gap in the PR description rather than landing a flaky test — a red flaky test
  is worse than one fewer green one (repo's own P-097 "no false greens" law, applied in
  reverse: no false reds either).

### §5.2 — spec for §3.2 (`tactics.test.ts` gap-fill)
- **Method:** same harness the file already uses (confirmed by reading it — `vi.mock`
  electron only, real fs temp dir, `TacticsEngine` constructed fresh per test, NO
  `vi.resetModules()` since it's a class instance not a singleton). New `describe` blocks
  appended after line 139 (the current EOF), existing 12 cases untouched.
- **Expected artifacts:** `tactics.test.ts` growing from 139 lines / 12 cases to
  roughly 210-230 lines / 18 cases (12 existing + 6 new).
- **Validation:** `npx vitest run src/main/services/tactics.test.ts` → exit 0, count rises
  to 18, previous 12 case names still present and passing unmodified. `git diff --
  src/main/services/tactics.ts` empty.
- **Load-bearing arithmetic quirk the fixtures MUST account for** (`metrics()`,
  `tactics.ts:187-192`): drawdown is `(peak - equity) / Math.max(1, peak || 1000)`. When
  cumulative `equity` never rises above 0, `peak` stays 0, so the denominator is `Math.max(1,
  1000) = 1000` — every drawdown while under water is divided by 1000 and stays tiny. This
  is the ONLY way to build a fixture with `winRate ≥ 0.45 ∧ expectancy < 0` that does NOT
  trip the 6% veto (a net-losing series that climbs positive would show a large peak-to-
  trough drawdown and short-circuit `preTradeGate` on the veto clause before the expectancy
  clause is reached). So the expectancy-drift fixture keeps cumulative equity ≤ 0 throughout
  (lead with a loss so `peak` never leaves 0). Compute the sequence by hand against the
  formula and document it inline, mirroring `eligibleHistory()`'s docstring convention
  (`tactics.test.ts:34-36`).
- **Clause-isolation ordering** (`preTradeGate`, `tactics.ts:133-147`): the guard order is
  graduated → veto → win-rate → expectancy → signal-confidence. To land on a specific
  refusal reason, every EARLIER clause must pass: the win-rate-drift fixture needs
  `vetoActive:false`; the expectancy-drift fixture needs `vetoActive:false ∧ winRate ≥ 0.45`.
  Assert on the returned `reason` regex (`/[Ww]in rate/`, `/[Ee]xpectancy/`) to prove the
  intended clause fired, not just `ok:false`.
- **Failure modes:** if a drift fixture accidentally trips the veto (wrong ordering/
  magnitudes), `preTradeGate` returns the veto reason instead of the intended clause and the
  regex assertion fails loudly — that is the fixture telling you the arithmetic is wrong, not
  a flaky test. Fix the fixture; do not weaken the assertion to a bare `ok:false`.
- **Fallback:** the veto-ACTIVATION and STICKINESS cases assert direction only (`vetoActive`
  false→true, and true-stays-true across a winning streak) — no exact-percentage tuning
  needed, so they are robust. If a drift fixture proves too fiddly to keep under water within
  budget, cut that one case and note the gap in the PR rather than shipping a fragile one.

---

## §6 — Risk + Ambiguity Audit (self-adversarial)

**CRITIC pass.**
- **FINDING F-1 (surfaced, not fixed — perimeter behavioral observation).** While specifying
  the tactics tests, the review found the veto-LIFT branch (`tactics.ts:174-178`, `else if
  (this.vetoActive && m.maxDrawdown < MAX_DRAWDOWN_VETO * 0.5)`) is **near-unreachable within
  a session.** `metrics().maxDrawdown` is a running max over the whole retained history
  (`maxDd = Math.max(maxDd, …)`, :191), and the only history mutations that exist are
  `push` + front-`shift` (grep confirmed: zero reset/splice/clear paths anywhere in
  `src/`). So once a >6% drawdown enters the buffer, `maxDrawdown` cannot fall below the 3%
  lift threshold by recording recovery trades — it can only drop when the trough-defining
  trades age out of the 500-cap FIFO (500+ subsequent trades) or the store-version reset
  wipes history at boot. Practical consequence: a MAY-TACTICS drawdown veto, once tripped,
  effectively **stays latched for the rest of the session** regardless of subsequent
  performance. That may be intentional (conservative: a breached gate stays shut) or a
  latent defect (a gate that cannot self-recover as the docblock's "or daily session resets"
  comment implies it should). **This is a §2.4 perimeter question — the operator decides,
  not this plan.** Recommendation: log F-1 as its own finding-only PROBLEM-LEDGER entry
  (next free P-number) so the disposition is tracked; this coverage PR neither fixes nor
  masks it — the STICKINESS test in §3.2 pins the *actual current behavior* so any future
  intentional change to it turns a test red on purpose.
- Assumption not independently re-verified at write-time: that CI's Node 20.19 environment
  behaves identically to this session's read-only inspection for the file-as-directory
  write-failure trick. Mitigated in §5.1's failure-mode fallback (spy-based alternative
  pre-authorized).
- Worst case if wrong: a flaky or wrong test ships. Bounded — these are test-only files;
  worst realistic outcome is a red CI run or a bad merge of a test that asserts something
  untrue about the interlock's behavior (misleading future readers), NOT a live-capital
  incident, because no production code changes and no test executes against a real broker
  or real money path.
- Left out (cleanup / teardown / unmount / reconnect, PR#6-class discipline): every new
  `describe` block needs an `afterEach` that `fs.rmSync` the temp dir — called out
  explicitly in §5.1 so it isn't dropped; `tactics.test.ts`'s existing `afterEach` at
  line 39 already covers §3.2 since it's the same file/lifecycle.
- What this plan does NOT do, named explicitly so it isn't assumed: it does not test
  `main/index.ts`'s native-dialog IPC handler (out of scope per D1), does not test
  `trading-engine.ts`'s `setLiveMode`/`setLiveMode`-adjacent wiring (that's a different
  file, would need its own blueprint), and does not change any gate threshold, cap value,
  or interlock predicate in either subject.

**RISK-AGENT pass** (against CONSTITUTION §2.4 hard walls + §2.5 invariants):
- Verdict: **APPROVED**.
- Checked against every §2.4 wall: this plan touches "Live-mode arming interlock" and
  "MAY-TACTICS graduation interlock" rows — both explicitly flagged as requiring
  human-in-the-loop, which this blueprint-then-review process satisfies (same mechanism
  P-121 used, PR #63, not auto-merged). No order/execution path, kill-switch, credential,
  IPC-validation, update-feed, or build-target wall is touched. No autonomous financial
  execution occurs or is exercised (tests construct fake `ctx`/`Stored` objects, never
  call any Alpaca-facing code). Not vetoed.
- §2.5 invariant 9 (shared mutable defaults) is actively being tested FOR in §3.1's
  `getLiveModeStatus` freshness subtask, not violated.
- On F-1: the RISK-AGENT verdict stays APPROVED for THIS plan, because the plan is
  test-only and does not change the veto behavior — it pins it. F-1 is a separate,
  operator-owned decision about whether the veto SHOULD self-recover; any fix to it would be
  its own RISK-TOUCH change with its own blueprint and sign-off.

**Unresolved high-risk items surfaced to operator:**
- **F-1** (veto-lift near-unreachability, above) — needs an operator disposition:
  intentional latch vs. latent defect. Does not block this coverage PR; recommended to be
  filed as a finding-only ledger entry. No decision baked into this plan.

---

## §7 — Final Assembly: the plan

**Build order (numbered, copy-ready):**
1. Create branch `chore/p094-live-mode-tactics-coverage` off current `master` (`c966d1c`).
2. Write `src/main/services/live-mode.test.ts` per §3.1/§5.1. Run
   `npx vitest run src/main/services/live-mode.test.ts` — done when green, ≥16 cases.
3. Extend `src/main/services/tactics.test.ts` per §3.2/§5.2. Run
   `npx vitest run src/main/services/tactics.test.ts` — done when green, 12 old + 6 new
   cases all pass.
4. Byte-verify both subjects unchanged: `git diff -- src/main/services/live-mode.ts
   src/main/services/tactics.ts` — done when output is empty.
5. Run full gate bar from `apps/satex-terminal/`: `npm run typecheck`, `npm run lint`,
   `npm test`, `npm run knip` (or note CI-only per P-097 if knip OOMs locally) — done when
   all four report real green exit codes.
6. Update `Vault/00-Audit/PROBLEM-LEDGER.md`: (i) P-094 entry — new dated Update line
   recording this suite shipped with real test counts, the tactics.ts-already-partly-
   covered-by-P-121 discovery, and a Status line change; (ii) file **F-1** as its own new
   finding-only entry (next free P-number) capturing the veto-lift near-unreachability for
   operator disposition. Done when both entries read accurately against the shipped diff.
7. Commit (conventional commit message, `Co-Authored-By` trailer per AGENTS.md:44), push
   branch, open PR against `master` with a description citing this blueprint's path and
   the P-121 precedent for review process.
8. **STOP for operator sign-off** — do not merge even if CI is green. Wait for your
   explicit go-ahead, exactly like PR #63.
9. On approval: `gh pr merge <n> --rebase` (merge commits banned by the ruleset), verify
   head SHA is an ancestor of `master`, `git checkout master && git pull --ff-only`.

**Acceptance criteria (gate outcomes):**
- [ ] `npm run typecheck` clean (node + web)
- [ ] `npm run lint` clean
- [ ] `npm test` green — report real counts for both new/modified files
- [ ] `npm run knip` clean (or CI-arbitrated per P-097 if local OOM)
- [ ] `git diff -- live-mode.ts tactics.ts` empty (P0 integrity: coverage-only)
- [ ] PROBLEM-LEDGER.md P-094 entry updated with accurate, evidence-backed Status
- [ ] PROBLEM-LEDGER.md F-1 filed as a finding-only entry (veto-lift disposition)
- [ ] PR opened, CI green, **held for your explicit merge sign-off** (not auto-merged)

**Deliverables:** `src/main/services/live-mode.test.ts` (new), `src/main/services/
tactics.test.ts` (modified, append-only), `Vault/00-Audit/PROBLEM-LEDGER.md` (P-094 update
+ F-1 finding entry). No CHANGELOG entry — test-only, no app-behavior change, matches the
P-123/P-128 precedent already established for this exact class of change.

---

## Decision Log

| D# | Question | Chosen | Why |
|---|---|---|---|
| D1 | Boundary confirm | Draft it | Scope matched what preflight found: live-mode.ts zero-coverage + tactics.ts reconciliation, test-only, same human-gated merge process as P-121 |
| D2 | tactics.ts treatment | Small gap-fill addendum | 12 existing tests are real and reviewed (P-121/PR#63); genuine gaps found (recordOutcome mutation/persist, 500-cap FIFO, live veto activation, veto stickiness, post-graduation clause drift) are cheap and worth closing without a redundant rebuild. The review revised one intended gap: "veto-lift" is near-unreachable (see F-1), so it became a stickiness pin + a surfaced finding rather than an impossible test. |
| D3 | PR bundling | One branch, one PR | Both files are test-only, same RISK-TOUCH class, same harness family — one review pass mirrors how P-127–P-130 landed as PR #68 |

## Revision Log (review loop)

| # | Section | Change | Trigger |
|---|---|---|---|
| 1 | §3.2, §6 | Removed the impossible "record winners to lift the veto" test — `maxDrawdown` is a running max over the retained buffer (monotonic under append; grep confirmed zero history-reset paths), so it cannot be lowered by recovery trades. Replaced with a veto-STICKINESS pin (true behavior) + filed the veto-lift near-unreachability as finding F-1 for operator disposition. | max-effort source-verification review |
| 2 | §3.1 | Replaced the contrived "independent-load non-aliasing" case (live-mode.ts returns only primitives + fresh literals — no aliasing surface, self-eval-store precedent says don't assert it) with two real pins: `getLiveModeStatus` object-freshness (it crosses the IPC boundary) and the `isLive()`-vs-`getLiveModeStatus` armed-vs-effective divergence (load-bearing for 4 engine gates). | same review |
| 3 | §5.1 | Added a float-determinism guard for the exact-loss-threshold boundary case (compute the threshold in-test with the identical expression, not paired literals). | same review |
| 4 | §5.2 | Documented the `peak || 1000` denominator quirk (net-negative-throughout histories keep drawdown tiny) as the mechanism for building post-graduation drift fixtures without a spurious veto short-circuit; added `preTradeGate` clause-isolation ordering guidance. | same review |
| 5 | §1, §3.2, §7, D2 | Reconciled test counts (tactics 12→18, +6; live-mode ~20) and threaded F-1 through build order, acceptance criteria, and deliverables. | same review |
| 6 | §3.2 | Fixed a line-number citation (500-cap guard is on tactics.ts:89 with the shift, not :88). | same review |
