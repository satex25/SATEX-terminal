<!-- /autoplan restore point: /c/Users/User/.gstack/projects/mc4/master-autoplan-restore-20260720-070540.md -->
# MAY-TACTICS Graduation Rebuild — Evidence-Gated Interlock

> **Ultraplan blueprint** (rev 3, post-full-review). Authored 2026-07-20 on `master` @ `c10f9bc`.
> Status: DRAFT — CEO + Design + Eng phases complete; at final approval gate (one operator
> decision open: T1.3 existing-poison stance).
> RISK-TOUCH: modifies the MAY-TACTICS graduation interlock (AGENTS.md:66). Execution
> requires a human-in-the-loop PR with explicit sign-off. This file is the deliverable;
> no code ships from this run.

> **Direction change (D9).** Rev 1 gated graduation on the Probabilistic Sharpe Ratio and
> footnoted a constitutional carve-out. The CEO review (both voices) found — and the code
> confirmed — that (a) `significance.ts`'s own header and Constitution §3.3 forbid PSR
> outputs from feeding *any* gate, so the plan's "pure functions are exempt" clearance was
> invalid; (b) PSR's skew/kurtosis estimates are noise at n=30; (c) per-trade return is not
> time-normalized, so D6's "correctness fix" was oversold; (d) the "harder to arm = safer"
> logic was inverted for a restriction-only gate. Rev 2 drops PSR, regime, and the §3.3
> amendment. It ships the real P0 (the `seedFromOrders` bug) and replaces count-of-8 with a
> bar built from metrics the engine already computes. Rev-1 decisions D2/D3/D6/D8 are
> **superseded**; see §0.

---

## §0 — Decision log

| ID | Question | Answer |
|---|---|---|
| D1 | Draft with the graduation-rebuild boundary? | **Draft it** |
| D2 | Criterion replacing count-of-8 | ~~PSR ≥ 0.95 + N floor~~ **SUPERSEDED by D9** |
| D3 | Regime segmentation role | ~~overall PSR + per-regime veto~~ **SUPERSEDED by D9 — regime deferred** |
| D4 | seedFromOrders fix | **Drop seed from the graduation path** — persisted `tactics.json` is the single source (unchanged) |
| D5 | GRADUATE button vs criterion | **Gate the button on the criterion**; `graduate()` re-checks server-side; human still clicks (unchanged) |
| D6 | Significance input series | ~~per-trade return for PSR~~ **SUPERSEDED — no PSR, no return series needed** |
| D7 | Sample floor value | **30**, keeping the existing `MIN_TRADES_FOR_ARMED` symbol but raising 8→30. Distinct rationale from Calibration's `MIN_SAMPLES` (that governs a win-rate proportion; this governs a trade-count floor) — the shared number is a convenience, not a claim that the two estimators share an adequacy threshold. |
| D8 | §3.3 constitutional amendment | ~~operator footnote riding the PR~~ **SUPERSEDED by D9 — no amendment; the plan no longer gates on PSR, so §3.3 is untouched** |
| D9 | Foundation (premise gate / User Challenge) | **Split + simple bar.** Ship the `seedFromOrders` P0 now. Replace count-of-8 with `n ≥ 30 ∧ expectancy > 0 ∧ winRate ≥ MIN_WIN_RATE`, all from `metrics()`. No PSR, no regime, no constitutional change. Fix the inverted safety framing; enumerate all 5 `MIN_TRADES_FOR_ARMED` use-sites. |

---

## §1 — Objective (Layer 1)

**Core goal.** Two things. (1) Fix the `seedFromOrders` data-integrity bug that lets the
graduation gate arm on fabricated / double-counted rows. (2) Replace the naive count-of-8
graduation precondition with a bar that requires the closed-trade record to already clear
the armed gate's own floors over an adequate sample: `n ≥ 30 ∧ expectancy > 0 ∧
winRate ≥ MIN_WIN_RATE (0.45)`. The engine arms only once it has met, over ≥30 real trades,
the same standard it will then enforce.

**Success criteria (priority stack + four gates).**
- **P0 integrity:** the graduation series contains no fabricated (`pnl=0` seeded) or
  double-counted rows. Verifiable: a unit test where boot with a prior `tactics.json` + a
  populated orders DB yields history equal to the persisted history, not the sum.
- **P1/P3:** `graduate()` returns `ok:true` only when `n ≥ 30 ∧ expectancy > 0 ∧
  winRate ≥ 0.45`. Verifiable: boundary unit tests on each clause.
- **P2 risk:** the change opens no new *arming* path (graduation only gets harder). Two
  regressions the naive version WOULD introduce are explicitly closed: (2b) boot-time
  drawdown-veto reconstruction is preserved via a constructor `refresh()` (T1.2); (5) raising
  the floor does not de-arm already-graduated legacy users, because armed-state gates on the
  `graduated` flag alone (T2.2). Honest note: for a restriction-only gate, "harder to
  graduate" means longer pass-through — acceptable only because the engine is paper-only
  (§6), not because it is "safer."
- **Gates:** `typecheck`, `lint`, `test`, `knip` green from `apps/satex-terminal/`.

**Constraints (named).**
- AGENTS.md trading-safety: the graduation interlock is a risk control; human-in-loop +
  explicit PR sign-off (AGENTS.md:66). No autonomous graduation.
- Constitution §3.3 (line 572): PSR/DSR feed no gate. **Rev 2 honors this by not gating on
  PSR at all** — the criterion uses only realized win-rate and expectancy, which are already
  the armed gate's floors. No constitutional change.
- Constitution 0.5 (stateless-first): `graduate()` recomputes from history every call.
- Load-bearing invariants: Zustand not Redux; IPC stays Zod-validated.

**Environment.** Electron **main** (`tactics.ts`, `trading-engine.ts`); shared
(`@shared/types.ts`, tiny); **renderer** (`TacticsModal.tsx`). No broker facet. Feed-agnostic.
`significance.ts` and the regime observer are **not touched** (rev-1 dependencies dropped).

**Assumptions (flagged).**
- (A1) `recordOutcome` persists every live closed trade to `tactics.json`; `load()` restores
  it on boot — VERIFIED (tactics.ts:56-61, 38-44).
- (A2) `metrics()` already computes `winRate`, `expectancy`, `trades` from `history`
  (tactics.ts:144-157) — VERIFIED. The criterion needs no new math.
- (A3) `MIN_TRADES_FOR_ARMED` is read at tactics.ts lines **24, 67, 73, 90, 92, 111** —
  VERIFIED. Raising 8→30 propagates to the state badge (67), the IPC `tradesRequired`
  display (73), the `preTradeGate` pass-through boundary (90), the win-rate-floor activation
  (92), and the `graduate()` precondition (111), consistently.
- (A4) `seedFromOrders` (tactics.ts:119-130) pushes `pnl=0` rows additively onto loaded
  history (double-count + poison) — VERIFIED; called once at boot (trading-engine.ts:474).

**Unknowns.** None outstanding.

---

## §2 — Domain map (Layer 2)

**Classification.** **Data-integrity** (the seed bug, a P0) + a thin **risk** slice (the
graduation threshold) + a trivial **operational** slice (button enable + one status boolean).

**Specialist agents.** RISK (the gate), LEARN (graduation is the learning checkpoint),
AUDIT (series integrity). No DATA/TECH/NEWS/MACRO/EXEC changes.

**Broker facets.** None.

**Blast radius.**
- `src/main/services/tactics.ts` — delete `seedFromOrders`; raise `MIN_TRADES_FOR_ARMED`
  8→30; enrich `graduate()`; add derived `graduationEligible` to `status()`. **Core.**
- `src/main/core/trading-engine.ts` — remove the `seedFromOrders` call (474). No other change.
- `src/shared/types.ts` — add `graduationEligible: boolean` to `TacticsStatus`.
- `src/renderer/components/modals/TacticsModal.tsx` — gate the button on
  `status.graduationEligible`; show the unmet clause.
- **Not touched:** `significance.ts`, the regime observer, `CONSTITUTION.md`.
- Invariant in blast radius: the MAY-TACTICS interlock (AGENTS.md:66).

---

## §3 — Task decomposition (Layer 3)

### T1 — Delete the seedFromOrders integrity bug  ⚠️ RISK-TOUCH (gating-series integrity) — the P0
- **T1.1** Remove `seedFromOrders` (tactics.ts:119-130) and its call-site
  (trading-engine.ts:474). `tactics.json` via `recordOutcome` is the single source (D4).
  (`seedFromOrders` is a public method, not an export — removing method + call-site is
  correct; `knip` does not flag unused methods, so gate-greenness is not at risk either way.)
- **T1.2 — Preserve boot-time drawdown-veto reconstruction (Eng finding 2b).** `vetoActive`
  is NOT persisted (`load()` restores only `history`+`graduated`), and `refresh()` — which
  sets the drawdown veto — is today reached at boot ONLY via `seedFromOrders`. Deleting the
  call would boot a drawdown-breached session with `vetoActive=false` until the next close.
  Fix: call `this.refresh()` in the `TacticsEngine` constructor right after `load()`. Test it.
- **T1.3 — Existing-poison stance (Eng finding 2a) — DECIDED (D10): versioned store, reset
  once.** Add a `version` field to the `Stored` shape (`{ version, history, graduated }`).
  `load()`: if the on-disk `version` is missing or below the current constant, return a fresh
  `{ history: [], graduated: <preserved> }` and re-save at the new version. Preserve `graduated`
  (per T2.2 — never de-arm a live gate); clear only the poison-contaminated `history`. A
  returning operator recalibrates to 30 from clean data. `pnl=0` is indistinguishable from a
  legit break-even, so surgical stripping is impossible — a one-time reset is the only clean
  option, and it is cheap in the paper phase. Test: a v0 (no-version) file with seeded rows
  loads as empty history + preserved `graduated`.
- *Safety note (corrected):* removing the fabricated rows cannot loosen the gate, BUT the
  naive deletion would have (2b) — hence T1.2. With T1.2 in place, net safety is preserved.

### T2 — Raise the sample floor + enrich the graduation criterion  ⚠️ RISK-TOUCH (the gate)
- **T2.1** `MIN_TRADES_FOR_ARMED`: 8 → 30 (D7). This governs when graduation becomes
  *available* — the `graduate()` precondition (111), the badge target `tradesRequired` (73),
  and the pre-graduation `calibrating` display (67). Note (Eng finding 1): the `&& trades ≥ MIN`
  conjunct at `preTradeGate`:92 is **redundant** — line 90 already returns pass-through when
  `trades < MIN`, so by line 92 it is always true. Raising the constant does not change line
  92's behavior; do not describe it as an active seam.
- **T2.2 — Decouple armed-state from the raised floor (Eng finding 5).** Today `status()`:67
  and `preTradeGate`:90 gate on `!graduated || trades < MIN`. Raising MIN 8→30 would kick an
  already-`graduated` legacy user (10–29 trades) back to `calibrating`/pass-through —
  **silently de-arming a live risk gate on upgrade.** Fix: once `graduated === true`, treat the
  engine as armed on the flag alone (drop the `|| trades < MIN` redundancy at the armed
  sites). New graduates already have ≥30 by the T2.3 precondition, so this only protects
  legacy graduates from being de-armed. Honors persisted graduation; never de-arms.
- **T2.3** Rewrite `graduate()` (tactics.ts:109-116): `ok` iff `m.trades ≥ 30 ∧
  m.expectancy > 0 ∧ m.winRate ≥ MIN_WIN_RATE`. Precise `reason` per failing clause. All three
  from the existing `metrics()`.
- **T2.4 — Honest limitation note (Eng finding 3).** n=30 is stricter than count-of-8 but not
  strong evidence: a true zero-edge (coin-flip, symmetric payoff) strategy clears
  `winRate ≥ 0.45 ∧ expectancy > 0` roughly 50–70% of the time, and dollar-expectancy is
  gameable under variable notional (a few large-notional wins). Acceptable because the gate is
  paper-only and human-clicked, but state it in the CHANGELOG as a known limitation of the
  chosen bar — do not oversell "evidence-gated." (This is the conscious cost of dropping PSR
  per D9; a returns/Bayesian bar remains a future option if the checkpoint ever gates live.)

### T3 — Surface eligibility + gate the button
- **T3.1** Add `graduationEligible: boolean` to `TacticsStatus` (types.ts) and populate it in
  `status()` from the same three-clause check `graduate()` uses (single source; the renderer
  never recomputes). Correction (Eng minor): `TACTICS_STATUS` is a bare IPC handler
  (index.ts:879) and the preload casts `as Promise<TacticsStatus>` (preload:115) — there is no
  runtime Zod schema on this response, so adding the field is type-only and safe; do not claim
  it "rides an existing Zod-validated payload."
- **T3.2 — Pin `graduationEligible` semantics (Eng finding 4).** It is the pure 3-clause
  metrics check. After graduation the 3 clauses still pass, so `graduationEligible` stays
  `true` while the button must be hidden. The modal keeps ANDing `state === 'calibrating'`
  (TacticsModal.tsx:43) for button *visibility*; `graduationEligible` drives *enabled*. Test both.
- **T3.3** In `TacticsModal.tsx`, enable GRADUATE only when `status.graduationEligible` (while
  visible per T3.2). Render the unmet clause ("24/30 trades", "win-rate 41% < 45%",
  "expectancy −0.12") so a disabled button explains itself.
- **T3.4** `graduate()` re-checks server-side (T2.3), so a stale/spoofed enabled button still
  cannot arm below the bar (defense in depth).

### T4 — Tests + docs
- **T4.1** `tactics.ts` unit tests: seed-deletion integrity (boot = persisted history, not
  sum); each graduation clause at its boundary (29 vs 30 trades; expectancy −ε vs +ε;
  winRate 0.44 vs 0.45); `graduationEligible` matches `graduate()`'s verdict exactly;
  null-safety (empty / all-loss history → not eligible, no throw).
- **T4.2 — graduate→gate invariant (the plan's headline; Eng finding 4).** After `graduate()`
  succeeds at exactly `trades=30, winRate=0.45, expectancy=+ε`, assert
  `preTradeGate(highConfidence).ok === true` — i.e. the record that arms the gate also clears
  it. This is the whole thesis and must be tested.
- **T4.3 — boot-time veto reconstruction (T1.2 / finding 2b).** Construct with a loaded
  history whose drawdown > 6%; assert `status().vetoActive === true` before any `recordOutcome`.
- **T4.4 — legacy-graduate not de-armed (T2.2 / finding 5).** Construct with
  `{ graduated: true, history: <20 trades> }`; assert `status().state === 'armed'` (not
  `calibrating`) and `preTradeGate` can veto — proving the raised floor did not de-arm.
- **T4.5** `TacticsStatus` type-checks through IPC (typecheck; no runtime schema exists).
- **T4.6** Update `apps/satex-terminal/CHANGELOG.md` and the PROBLEM-LEDGER (P0 seed bug +
  boot-veto fix + graduation-bar change + the n=30 limitation note + the chosen T1.3 stance).

---

## §4 — Dependency DAG + ordering (Layer 4)

```
T1 (delete seed) ──┐
                   ├──> T2 (floor + criterion) ──> T3 (status + button) ──> [APPROVAL: human PR sign-off + operator perimeter check] ──> merge
(independent)  ────┘                          \
                                               └──> T4 (tests + docs, TDD alongside T2/T3)
```

- **Order:** T1 → T2 → T3, with T4 written test-first alongside T2/T3. T1 is independent and
  could ship as its own commit (it is the P0), but rides the same PR here.
- **Approval nodes:** merge is a mandatory human sign-off (RISK-TOUCH interlock); the PR
  routes back to the operator for an independent perimeter check before merge (operator net
  instruction). No autonomous merge.
- **External blocks:** none.

---

## §5 — Execution specs (Layer 5)

**T1.** *Method:* delete method + call-site. *Validation:* boot-integrity test; `knip` clean.
*Failure mode:* a hidden third caller — grep first (already done: none). *Fallback:* n/a.

**T2.** *Method:* one constant edit (8→30) + a three-clause `graduate()` using `metrics()`.
*Artifacts:* edited `tactics.ts`. *Validation:* boundary tests (§T4.1). *Failure mode:*
`expectancy > 0` on a tiny positive fluke at exactly n=30 — acceptable; the win-rate floor
and the 30-trade minimum are the co-guards, and the operator still clicks. *Fallback:* n/a.

**T3.** *Method:* server-computed boolean; renderer reads it. *Artifacts:* `types.ts`,
`tactics.ts`, `TacticsModal.tsx`. *Validation:* component renders disabled below the bar,
enabled at/above; manual `/run` to see the modal; graduating below bar is server-refused.
*Failure mode:* renderer/engine criterion drift → prevented by the single-source boolean.

**T4.** Gates are the acceptance surface; see §7.

---

## §6 — Risk + ambiguity audit (Layer 6)  — self-adversarial

**CRITIC pass.**
- *"Is anything on the PSR / §3.3 collision path still here?"* No. Rev 2 removes the
  `significance.ts` import, the return series, the regime schema, and the constitutional
  footnote. The criterion uses only `winRate` and `expectancy` — the armed gate's own floors,
  already realized numbers, never PSR. §3.3 is untouched. This was the rev-1 veto risk; it is
  gone by construction.
- *"The safety framing."* Stated honestly now: the armed gate is restriction-only
  (`preTradeGate` only ever returns `ok:false`). Raising the bar keeps the engine in
  pass-through longer, so *more* paper trades go ungated until graduation. That is acceptable
  because (a) the whole tactics engine is paper-only in this phase (autonomous-trader.ts:141
  refuses live capital), so no real capital is exposed by an ungated trade; and (b) the point
  of graduation is to arm on *evidence*, not speed. Rev 1's "harder = safer" was wrong for a
  restriction-only gate; rev 2 does not claim it.
- *"Teardown / cleanup?"* T1 removes a boot-time write path and ADDS a boot-time
  `refresh()` (T1.2) to replace the veto-reconstruction that path incidentally provided.
  Nothing new is created — no observers, timers, or listeners. No leak surface.
- *"Blast radius complete?"* All six `MIN_TRADES_FOR_ARMED` sites (24/67/73/90/92/111)
  reviewed. Correction to rev 2: raising the constant alone was NOT safe at the armed sites —
  it de-armed legacy graduates (finding 5), fixed by T2.2; and site 92 is redundant, not an
  active seam (finding 1). The naive "one constant edit" framing is retired.
- *"P0 fully fixed?"* Only with T1.2 (boot veto) AND a decided T1.3 (existing poison). The
  bare deletion half-fixes it (finding 2a/2b). Rev 3 closes both.

**RISK-AGENT pass (Section 5 / Section 8).**
- Risk-per-trade, exposure caps, live capital, order path, kill-switch: **untouched.** ✅
- Risk-param self-mod: the raised constant and the reused floors are source constants, not
  runtime-mutable by the engine. ✅
- Safety-layer bypass: the change only tightens graduation and adds a server re-check;
  removes no safety. ✅
- Single-signal logic / convergence: N/A — a gate on realized outcomes, not a trade signal. ✅
- Human-in-loop interlock (AGENTS.md:66): preserved; autonomous graduation impossible. ✅
- Constitution §3.3 (PSR feeds no gate): **honored — no PSR gating.** ✅

**Verdict: NOT VETOED** — conditional on rev-3 fixes T1.2 (boot veto) and T2.2 (no
legacy de-arm) landing, plus a decided T1.3 stance. Without them the plan introduces two
gate-weakening regressions (findings 2b, 5). With them: no Section 0/5/8 rule crossed, no
constitutional invariant touched, net gate safety preserved.

---

## §7 — Acceptance criteria (gate outcomes)

Merge only when all hold, reported with real counts/exit codes:
1. `npm run typecheck` — exit 0.
2. `npm run lint` — exit 0.
3. `npm test` — exit 0; new tactics tests present (seed-deletion integrity; each graduation
   clause boundary at 30 / expectancy 0 / winRate 0.45; `graduationEligible` parity;
   null-safety).
4. `npm run knip` — exit 0; no orphaned `seedFromOrders` export.
5. Manual `/run`: TacticsModal shows trades/30, win-rate, expectancy; GRADUATE disabled below
   the bar, enabled at/above; graduating below the bar is server-refused.
6. CHANGELOG + PROBLEM-LEDGER updated (P0 seed bug + graduation-bar change).
7. Human sign-off for the RISK-TOUCH interlock **and** the operator's independent perimeter
   check complete before merge.

---

## Decision Audit Trail (/autoplan)

| # | Phase | Decision | Class | Principle | Rationale |
|---|---|---|---|---|---|
| 1 | CEO | Redirect from PSR-gating to simple bar (D9) | User Challenge | — (operator) | Verified: §3.3 + significance.ts header forbid PSR feeding any gate |
| 2 | CEO | Drop regime segmentation | Auto (consensus) | P3 pragmatic | Both voices: inert at paper-scale samples |
| 3 | CEO | Drop §3.3 amendment | User Challenge | — (operator) | Don't erode an absolute invariant for a paper button |
| 4 | Eng | Add constructor `refresh()` (T1.2) | Auto | P1 completeness | Verified 2b: else boot loses drawdown veto |
| 5 | Eng | Decouple armed-state from floor (T2.2) | Auto | P1 completeness | Verified 5: else upgrade de-arms legacy graduates |
| 6 | Eng | Add invariant + regression tests (T4.2–4.4) | Auto | P1 completeness | Headline thesis + both regressions were untested |
| 7 | Eng | Document n=30 limitation (T2.4) | Auto | P5 explicit | Don't oversell "evidence-gated" |
| 8 | Eng | Existing-poison stance (T1.3) | **Taste → gate** | — | pnl=0 is indistinguishable from legit break-even |

## GSTACK REVIEW REPORT

| Phase | Voices | Result |
|---|---|---|
| CEO | primary + subagent `[codex-unavailable]` | Redirected foundation; 3 verified findings |
| Design | inline | Trivial (one button's enabled state) |
| Eng | primary + subagent `[codex-unavailable]` | 3 verified gate-integrity fixes folded in |

Status: **APPROVED pending 1 taste decision (T1.3) + operator perimeter check before merge.**

## Edit log
- 2026-07-20 rev 1: initial draft (PSR criterion, regime, §3.3 footnote).
- 2026-07-20 rev 2: CEO review redirected the foundation (D9). Dropped PSR / regime / §3.3
  amendment (verified against significance.ts header + Constitution §3.3). Replaced with
  `n≥30 ∧ expectancy>0 ∧ winRate≥0.45` from existing `metrics()`; enumerated the
  `MIN_TRADES_FOR_ARMED` sites. Superseded D2/D3/D6/D8.
- 2026-07-20 rev 3: Eng review (both voices) caught three verified gate-weakening / integrity
  gaps the "one constant edit" framing hid. Added T1.2 (constructor `refresh()` to preserve
  boot-time drawdown veto — finding 2b), T2.2 (decouple armed-state from the raised floor so
  upgrade doesn't de-arm legacy graduates — finding 5), T1.3 (existing-poison stance, operator
  decision — finding 2a), T2.4 (honest n=30 limitation), and tests T4.2–T4.4. Corrected the
  dead-code (92), Zod, and export claims. §6 verdict now conditional on these fixes.
