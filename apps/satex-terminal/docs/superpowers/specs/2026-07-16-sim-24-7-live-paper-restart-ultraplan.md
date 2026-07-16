# Ultraplan — Land the simulator-24/7 + LIVE→PAPER-restart pile (P-111)

**Date:** 2026-07-16 · **Branch:** `feat/p111-sim-24-7-live-paper-restart` · **Base:** `master` @ `4720666`
**Status:** landed to branch, all four gates green, PR open — **awaiting operator §0.3 arm before merge.**
**Class:** perimeter-adjacent (engine core + mode-switch + app-lifecycle), human-gated.

---

## §1 Objective

**Core goal.** Commit the 7-file uncommitted pile (simulator emits 24/7; real crypto WS ignored in
sim mode; `reconnectAlpaca` no-op in sim; LIVE→PAPER = confirm + clean-slate restart) into a branch +
PR, with every coupled doc/ledger/CHANGELOG update in one changeset. **Do not merge** — stop at the
operator's sign-off gate.

**Success criteria (measured, not asserted).**
- All four gates green from `apps/satex-terminal/`: typecheck node+web, eslint `src tests`, vitest, knip.
- Safety perimeter provably untouched (P0 integrity, Constitution §0.3).
- Invariant 4 open question resolved with a written ledger verdict.
- Coupled docs carry no stale claim about `SATEX_SIMULATOR_24_7` or the IPC count.

**Constraints.** §0.3 (no autonomous perimeter change — human arm required), §2.3 (append-only ledger,
no in-place rewrite — P-107), §2.9 (bash-mount byte-verified writes), §2.7 (decompose before build).

**Environment.** Electron main (`trading-engine.ts`, `market-data.ts`, `index.ts`), preload, renderer
(`TopBar.tsx`), shared (`ipc-channels.ts`). Broker facet: MarketDataSource (simulator + crypto WS).
Data feed: simulator ⇄ live Alpaca. Account mode: paper ⇄ live (orthogonal to data feed).

## §2 Domain map

Functional + operational + risk-adjacent. Agents touched: DATA (feed emission), EXEC-adjacent
(mode-switch lifecycle — but not the order path). Facet: MarketDataSource. Session call-sites:
`setDataSource` (feed switch), `setAlpacaModeMode` (account endpoint flip). Blast-radius invariants:
sub-second aggregator feed path (app CLAUDE.md), SIM/SUB badge gates, data-feed switch interlock.

## §3 Task tree

1. Verify pile diff against the summary (done — 7 files, matches).
2. ⚠️ RISK-TOUCH — perimeter proof: confirm no order/risk/kill/arming file touched; `APP_RESTART`
   cannot route an order; LIVE→PAPER ordering leaves no half-armed state.
3. Invariant-4 trace: is the sub-second aggregator fed by anything in sim mode? → verdict.
4. Coupled edits: CONSTITUTION §2.9, ARCHITECTURE §2+§4+header, perf-spec comment, README,
   GETTING-STARTED, app CLAUDE.md ×2, CHANGELOG, ledger (prepend P-111).
5. Gates ×4 → real counts.
6. Byte-verify tracked writes; commit; push; PR. **Stop before merge.**

## §4 Dependency DAG

verify(1) → perimeter-proof(2) + invariant-trace(3) → coupled-edits(4) → gates(5) →
byte-verify+commit+push+PR(6) → **[APPROVAL NODE: operator §0.3 arm]** → merge.
Edits (4) parallelizable across files. Node 6→merge is a one-way door (Constitution §8.1).

## §5 Execution specs (validation)

- **Perimeter proof:** `git diff --stat` = 7 files, none in the ⚠️ set; grep confirms `APP_RESTART`
  handler is `register()` no-arg. Validated by inspection + the four gates.
- **Invariant 4:** sole feed `trading-engine.ts:1927` inside `onCryptoTick`, subscribed only to the
  real crypto WS (`:1897`); new guard `:1919`. Sim mode → aggregator fed nothing. **Verdict: intended
  coherence fix** (sim emits 20 Hz quotes, not `'t'` ticks; empty SUB > mislabeled real data).
- **Docs:** each edit makes a currently-stale claim true. Validation: `grep SATEX_SIMULATOR_24_7`
  leaves only history (CHANGELOG:955, dated design/spec docs) describing it as functional.
- **Gates:** typecheck/lint/vitest/knip all exit 0; vitest 1753/134/0-fail.

## §6 Risk + ambiguity audit (self-adversarial)

- **CRITIC:** Did any doc reference get missed? — Reality check found 9 `SATEX_SIMULATOR_24_7` sites,
  not the 2 the directive named; operator chose to sweep the 3 extra *live* user-facing docs and leave
  append-only history. Teardown path? — `reconnectAlpaca` no-op does not orphan a timer (it returns
  before building a client); the crypto WS stays connected by design (engine-owned).
- **RISK-AGENT:** No risk-parameter change, no live-capital action, no arming bypass, no single-signal
  trade logic. LIVE→PAPER is a *downgrade* to the safe endpoint and re-arming to LIVE still requires the
  typed-phrase interlock. **No veto.** The one-way door (merge) is gated behind the operator arm node.

## §7 Acceptance

Merge only after: operator §0.3 sign-off; CI re-runs the four gates green on the PR; (beta build also
needs knip-on-CI + the Authenticode cert, both out of scope here). Gate outcome at authoring time:
**typecheck 0 · lint 0 · vitest 1753/134/0 · knip 0** (operator hardware, Node 24.15.0).

---

**Decision log.**
- D1 (doc-sweep scope) → *Named + live user-facing docs*: CONSTITUTION §2.9, perf-spec comment, README,
  GETTING-STARTED, app CLAUDE.md; mark inert, leave append-only history.
- D2 (invariant-4 verdict) → *Intended coherence fix*; refine app CLAUDE.md invariant wording.
