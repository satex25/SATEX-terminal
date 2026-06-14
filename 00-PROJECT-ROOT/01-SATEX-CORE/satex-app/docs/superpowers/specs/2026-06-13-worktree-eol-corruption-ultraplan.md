# 2026-06-13 · Working-Tree EOL Corruption + Ledger Heal — ULTRAPLAN

> Authored via `/ultraplan` (7-layer Structured Cognitive Decomposition).
> Branch: `feat/audit-psd-batch-2026-06-11` @ HEAD `461f4b0`.
> Status: DRAFT — awaiting operator section review + execution gate.
> Trading-safety blast radius: **NONE** (config, docs, git hygiene only; no `src/` logic,
> no broker/risk/order path touched).

---

## Goal (verbatim intake)

Scheduled `satex-psd-daily` boot found no clean autonomous DECIDED/IN-PROGRESS code
work, but surfaced a real working-tree defect: 136 modified files, of which **134 are
phantom CRLF churn** (HEAD=LF, working-tree=CRLF, zero content delta) and the
**PROBLEM-LEDGER.md on-disk tail is truncated** (`git`/bash see the file end mid-word at
`typ`; the file-bridge Read serves a fuller version — the two disagree). Operator
directive mid-session: *"Incorporate our new /ultraplan skill for this process."*

**Plan boundary:** clean the working tree so the operator's branch→PR is legible, heal
the corrupted ledger from known-good content, and stop the churn recurring — without
staging, committing, or touching the trading-safety perimeter.

---

## §1 — Objective Clarification

**Core goal.** Return `git status` on `feat/audit-psd-batch-2026-06-11` to exactly the
intended uncommitted delta (the MIT-license bump + the legitimate ledger updates),
eliminate 134 phantom CRLF diffs, heal the truncated ledger, and add a durable
`.gitattributes` normalization rule so future bridge writes stop flipping line endings.

**Success criteria (measurable).**
- `git diff --name-only` drops from **136 → 2** (only `package.json` + `PROBLEM-LEDGER.md`),
  OR a clean renormalization where every remaining diff is intentional content.
- `PROBLEM-LEDGER.md` on disk and via Read agree, end properly (no mid-word tail, no NUL
  bytes, no doubled `\r\r`), and carry today's P-019 + session-close entries.
- A `.gitattributes` `* text=auto eol=lf` rule is present so future `git add` normalizes.
- All four gates remain green in a fresh sandbox clone (P0 system integrity — no
  regression from the cleanup).

**Constraints (named).**
- AGENTS.md §"Branch→PR flow": **do NOT commit, do NOT stage** — leave the result
  UNSTAGED for the operator. (This plan's destructive step is `git restore`, which
  *discards* phantom churn; it never stages.)
- Constitution **0.4** (never skip verification) + **0.5** (never assume prior state) —
  every file healed is re-scanned for NUL/`\r\r` after write.
- AGENTS.md trading-safety guardrails — **none in blast radius**; this plan asserts and
  re-checks that no `src/main` order/risk/kill-switch/interlock file is touched.
- Bridge edit hazard (CLAUDE.md): EXISTING repo files get NUL/truncation corruption via
  Edit/Write — so existing-file heals go through **python in bash with per-file EOL
  detection**; only brand-new files use Write.

**Environment.** Windows host, sandbox Linux bridge. Git repo root `mc4/`; app nested at
`00-PROJECT-ROOT/01-SATEX-CORE/satex-app/`. No runtime, no broker facet, no data feed.

**Assumptions (unverified flagged).**
- (verified) 134 files are EOL-only: `git diff --ignore-cr-at-eol --stat` reports content
  lines only for `package.json` + `PROBLEM-LEDGER.md`.
- (verified) HEAD blobs are LF for the sampled phantom files; working tree is CRLF.
- (⚠ unverified) the file-bridge "fuller" Read view of the ledger (131 lines, incl. the
  2026-06-13 session entry + `updated: 2026-06-13`) is the prior session's *intended*
  content. Treated as source-of-truth for the heal because it is internally complete and
  ends properly; the disk version is provably truncated.
- (⚠ unverified) `git restore` on the 134 files will not be re-flipped to CRLF by the
  bridge on the next mount read. Mitigated by the `.gitattributes` rule + a post-restore
  re-scan.

**Unknowns → decision briefs (D2/D3 below).** How aggressively to clean (restore vs
renormalize), and whether to heal the ledger in-place now or leave it for the operator.

---

## §2 — Domain Mapping

**Classification.** Operational + data-integrity problem. No functional/risk/temporal
trading logic. Pure repo-hygiene + one corrupted tracked markdown artifact (the work
queue itself, which makes it higher-leverage than a normal doc).

**SATEX agent touch-map.** AUDIT-AGENT only (integrity check + PASS/FAIL on the cleanup).
DATA/TECH/NEWS/MACRO/RISK/EXEC/LEARN: untouched. **Broker facets: none. Session
lifecycle call-sites: none. Load-bearing invariants in blast radius: none** (no Zustand
store, no `DEFAULT_EQUITY`, no SIM/SUB gate, no aggregator path).

**Touch-map (files).**
- `mc4/.gitattributes` — EXISTING, append normalization rule (python edit).
- `mc4/Vault/00-Audit/PROBLEM-LEDGER.md` — EXISTING, heal + new entries (python rewrite).
- 134 EOL-only files across `mc4/` + `satex-app/` — `git restore` (no byte authored).
- `satex-app/CHANGELOG.md` — EXISTING, one Unreleased entry (python edit).

---

## §3 — Task Decomposition

- **T1 — Snapshot + branch-safety check.** Re-confirm branch, HEAD, and that the 134 list
  is byte-identical-modulo-EOL to HEAD. Inputs: git. Outputs: verified file list. No
  RISK-TOUCH.
- **T2 — Add `.gitattributes` normalization rule.** Append `* text=auto eol=lf` (+ keep
  the existing `.husky/** eol=lf`, `*.sh eol=lf`). python edit; re-scan NUL/`\r\r`.
- **T3 — Restore the 134 EOL-only files.** `git restore -- <list>` (the 134, excluding
  `package.json` + `PROBLEM-LEDGER.md`). Discards phantom CRLF; reverts working tree to
  HEAD's LF. **Destructive to working-tree state → operator-approval node.**
- **T4 — Heal `PROBLEM-LEDGER.md`.** Rewrite from the known-good intended content (Read
  view), LF endings, ending properly; fold in T5/T6 entries. python write; re-scan.
- **T5 — Add P-019 ledger entry** (the EOL/bridge-corruption problem, ≥2 solutions, a
  decision) under §Open.
- **T6 — Add the 2026-06-13 session-close entry** under §Closed (honest PARTIAL: cleanup
  shipped to working tree, not committed).
- **T7 — CHANGELOG Unreleased entry** (single, under the FIRST `### Fixed`/`### Added`).
- **T8 — VERIFY:** post-cleanup `git status` is 2 files; re-scan all touched files for
  NUL/`\r\r`; run the four gates in a fresh sandbox clone; report real counts.

No task in this plan trades, sizes a position, touches a risk parameter, or moves
capital. **Zero ⚠️ RISK-TOUCH tasks.**

---

## §4 — Dependency + Ordering (DAG)

```
T1 ──▶ T2 ──▶ [APPROVAL NODE] ──▶ T3 ──▶ T8
   └──▶ T4 ──▶ T5 ──▶ T6 ──▶ T7 ──▶ T8
```

- **Sequential spine:** T1 first (grounding). T8 last (verification gate).
- **Parallelizable:** T2 and the T4→T7 ledger/CHANGELOG chain are independent of T3.
- **Approval node:** **T3** (`git restore` of 134 files) is the one destructive,
  working-tree-mutating step. It is gated on explicit operator approval (option A in the
  execution gate). Everything else is additive/heal-only and reversible from HEAD.

---

## §5 — Execution Specification

- **T2 method.** Read `.gitattributes` bytes in python, detect EOL, append
  `\n* text=auto eol=lf\n` before existing rules (order: catch-all first, specific after
  is fine for git). Validation: file parses, NUL=0, no `\r\r`. Failure mode: bridge
  truncation → re-read and compare length. Fallback: leave rule out, document for operator.
- **T3 method.** `git -C mc4 restore --source=HEAD --worktree -- <134 paths>`. Validation:
  `git diff --name-only` now lists exactly `package.json` + `PROBLEM-LEDGER.md`. Failure
  mode: bridge re-flips on read (Section 11 "data feed corruption" analogue). Fallback:
  if re-flip recurs, fall back to `git add --renormalize .` runbook handed to operator
  (still unstaged-only is impossible with renormalize, so restore is preferred).
- **T4-T6 method.** Single python write of the full healed ledger (LF), sourced from the
  intended content; assert each new anchor (`### P-019`, the session header) is unique
  (count==1) before/after; end-of-file newline present. Validation: Read==disk agree,
  NUL=0, no `\r\r`, ends at the new session entry not mid-word.
- **T7 method.** CHANGELOG: locate FIRST `### Fixed` under `## Unreleased` (assert
  count, verify it's inside Unreleased not a historical release — the 2026-06-12 anchor
  hazard), insert one line. Validation: placement re-read after write.
- **T8 validation (the gates, real numbers required).** Fresh `/tmp/satex-agent-eol`
  clone, `npm install --ignore-scripts`, electron shim, run typecheck/lint/vitest; knip
  with the Node-20 version shim. Report exit codes + counts. Baseline to beat: 669 tests
  / 62 files green at HEAD `461f4b0`.

---

## §6 — Risk + Ambiguity Audit (self-adversarial)

**CRITIC pass.**
- *What if a "phantom" file actually has a real edit I'd destroy in T3?* Mitigated:
  `--ignore-cr-at-eol --stat` proves 0 content lines for all 134; T1 re-verifies before
  T3 runs. The 2 content files are explicitly excluded from the restore list.
- *What if the bridge re-flips EOL right after restore?* Possible. T2's `text=auto`
  reduces future recurrence; T8 re-checks status; if it re-flips, the plan degrades to a
  documented operator runbook rather than claiming a clean tree.
- *Ledger heal could lose content the disk truncation already cost.* The heal sources the
  *complete* Read view, not the truncated disk — it restores content, never removes. The
  P-000 evidence line and any session entries are preserved verbatim.
- *Teardown:* no observers/timers/listeners created — nothing to unmount. N/A but checked.

**RISK-AGENT pass.** Checked against Constitution §5 (immutable risk rules) and §8
(alignment guardrails). This plan proposes **no** trade, **no** >1% risk, **no**
live-capital action, **no** risk-param self-modification, **no** safety-layer bypass, **no**
single-signal logic. It does not touch OrderManager, risk-gates, kill-switch, or the
live-mode interlock. **RISK-AGENT verdict: APPROVED — no veto condition present.**

**AUDIT-AGENT.** Every count in this plan is from real `git` output quoted in the session,
not asserted. CRITIC_PASS once T8 reports real gate numbers.

---

## §7 — Final Plan Assembly + Acceptance

**Acceptance criteria (stated as gate/measure outcomes).**
1. `git diff --name-only | wc -l` == **2**.
2. `PROBLEM-LEDGER.md`: disk==Read, NUL==0, no `\r\r`, ends at the 2026-06-13 session
   entry, contains a well-formed P-019 (≥2 solutions + decision).
3. `.gitattributes` carries `* text=auto eol=lf`.
4. Four gates green in fresh clone; **≥ 669 tests pass**; real exit codes reported.
5. Nothing staged; nothing committed; CHANGELOG has exactly one new Unreleased line.

**Decision log.**
- **D1 (boundary):** plan the working-tree EOL cleanup + ledger heal, config/docs/git
  hygiene only, no trading-safety touch. → *pending operator confirm.*
- **D2 (cleanup method):** `git restore` the 134 EOL-only files (vs `git add
  --renormalize`, vs leave-as-is). → *recommend restore; pending confirm.*
- **D3 (ledger heal timing):** heal in-place this session from the intended content (vs
  leave truncated for operator). → *recommend heal now; pending confirm.*

**Next.** On approval: build per the §4 DAG, honoring the T3 approval node. Recommended
route for a docs/config/hygiene plan with zero RISK-TOUCH is **A — execute now**;
`/autoplan` (B) is reserved for broker/risk/execution plans.
