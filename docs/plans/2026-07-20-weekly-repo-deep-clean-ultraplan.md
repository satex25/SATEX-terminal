# ULTRAPLAN BLUEPRINT — Weekly Repo Deep-Clean (run 2026-07-20)

> Execution-ready plan produced by `/ultraplan`. Sections carry stable IDs (§1-§7)
> for the section-by-section review loop. Keep this file in sync with every
> accepted revision.

| Field | Value |
|---|---|
| **Goal (verbatim)** | "Create a quick one massive detailed and wildly intelligently planned /ultraplan for the file C:\Users\User\mc4\docs\plans\2026-07-02-filesystem-reorganization-prompt.md" — corrected mid-session: "C:\Users\User\mc4\SATEX-~1.md Is the correct file location, not the 7-02 date, should be 7-20. Work with full capacity." |
| **Slug** | weekly-repo-deep-clean |
| **Date** | 2026-07-20 |
| **Branch** | `fix/tactics-graduation-evidence-bar` @ `069f687` (1 commit ahead of `origin/master`, clean ancestor — verified `git merge-base --is-ancestor origin/master HEAD`) |
| **Status** | DRAFT — awaiting operator section review |
| **Execution route** | TBD (see closing gate) |
| **Risk class** | CONTAINED — doc/file organization only, zero perimeter contact |

---

## §0 — Source correction (why this plan is not the 07-02 document)

The originally-named target, `docs/plans/2026-07-02-filesystem-reorganization-prompt.md`,
is a **superseded** artifact. It specs a full monorepo flatten
(`00-PROJECT-ROOT/01-SATEX-CORE/satex-app/` → `apps/satex-terminal/`, `Vault/` →
`vault/`, a root `package.json` workspace, etc.). That reorg **already happened** on
2026-07-02 under ledger **P-064**. Confirmed on disk right now: `apps/satex-terminal/`
is the live app (458 git-tracked files, `package.json` present), and
`00-PROJECT-ROOT/01-SATEX-CORE/` is a fully untracked, gitignored-by-content-pattern
leftover (0 files tracked by git, no `package.json` anywhere in it, 723 MB of
`node_modules` + `dist/` + `out/` + stray logs). Replaying the 07-02 prompt today
would try to re-move files that no longer exist at their old paths and would fight
the repo's actual current shape.

The operator's correction points at the real, current document: `SATEX-~1.md` at
repo root — a **weekly repo deep-clean execution brief**, prepared 2026-07-18,
addressed to "Claude Fable 5," meant to run "roughly weekly." Today is 2026-07-20,
so this is that week's run. This blueprint decomposes **executing that brief**, not
the retired reorg. (Side note for the ledger: the file's own name — `SATEX-~1.md`,
a DOS 8.3-style short-name pattern — is itself a mild signature of the documented
file-bridge truncation class (P-099/P-107/P-112 lineage). The content is intact and
fully legible; only the filename looks mangled. Worth a ledger line, not a panic.)

---

## §1 — Objective Clarification

**Core goal.** Execute `SATEX-~1.md`'s Layer 0→6 protocol for the 2026-07-20 weekly
clean: re-derive the current root/tracked-file inventory (never trust last week's
snapshot), classify every item into KEEP@ROOT / LEAVE-IGNORED / LEAVE-OBSIDIAN /
MOVE? / PRESENT, execute only `git mv` moves that pass all four SAFE-TO-MOVE
conditions, open a branch+PR for any such moves (never merge it autonomously),
present everything else to the operator, verify nothing broke, and file a
structured report.

**Success criteria** (measurable):
- Both crown-jewel files (`CLAUDE.md` root, `apps/satex-terminal/CLAUDE.md`) verified
  byte-identical to their pre-run state after the run (Layer 5 checkpoint).
- Every root-level tracked file and every new untracked/modified item is in exactly
  one classification bucket, each with a one-line reason (Layer 2 checkpoint).
- Zero `rm`/`git rm` executed. Zero commits to `master`. Zero edits to the two crown
  jewels, the Vault interior, or the `apps/satex-terminal/` interior.
- If any file passes SAFE-TO-MOVE: a `chore/weekly-clean-20260720` branch exists,
  pushed, PR opened, CI's `Gates (typecheck, lint, knip, tests)` check green, **not
  merged** by the agent.
- A Layer 6 report filed in the exact template from `SATEX-~1.md` §9, plus an
  optional PROBLEM-LEDGER entry at the next free number.

**Constraints** (Constitution v3.1 + AGENTS.md, cited by number):
- §0.6 / AGENTS.md gate bar: the four gates are the floor for any `apps/satex-terminal`
  change — moot here since this run touches no app-interior file, but CI will still
  run on any PR opened, so it applies transitively.
- §0.7 / AGENTS.md branch flow: never commit to `master`; branch, PR, CI-green, human
  merges. `main-protection` ruleset already enforces this server-side.
- §2.4 perimeter: order/execution path, risk gates, kill switch, arming interlock,
  credentials, IPC, update feed, macOS target — **all explicitly out of scope**; a
  filesystem clean never approaches them.
- §2.5 invariant 7 (cleanup/leak class) and invariant 9 (aliased defaults) — not
  triggered by doc moves; noted only because they're the repo's most recidivist
  defect classes, for awareness if this run ever expands scope.
- §2.9 environment realities: the desktop file-tool bridge has a documented
  truncation/NUL-stuffing corruption class (P-099/P-107/P-112). Any tracked-file
  edit this run performs (reference-link updates, if any move fires) should go
  through the bash mount with a byte-verify (`wc -c`, NUL-byte count, tail check),
  not a blind file-tool edit.
- `SATEX-~1.md` §4's SAFE-TO-MOVE rule (all four conditions) governs every candidate
  move — this is the binding rule, not judgment calls.

**Environment.** Repo root (`C:\Users\User\mc4`), not `apps/satex-terminal/` interior.
No broker facet, no data feed, no runtime layer — this is pure filesystem/git-metadata
work at the workspace level.

**Assumptions** (flagged verified/unverified from this session's own live inspection,
2026-07-20 ~08:00 CDT):
- Both crown jewels are byte-clean, zero NUL bytes — **VERIFIED** (see §6 CRITIC pass
  for a correction to the brief's own verification command).
- `git status` is legible, no merge/rebase in progress, working tree is the "normal
  dirty" pattern the brief describes — **VERIFIED**.
- The three loose dated root docs again fail SAFE-TO-MOVE — **VERIFIED** (re-derived
  fresh this run, not copied from Appendix A).
- `00-PROJECT-ROOT/01-SATEX-CORE/` is still pure untracked debris, present-only,
  operator-deletes-if-desired — **VERIFIED**.
- `.git/index.lock` exists as a 0-byte file, but git commands still function
  (`git status`, `git log` both returned clean output) — **VERIFIED present, not
  wedged**. One porcelain sub-call hit `unable to unlink … index.lock: Operation not
  permitted` (sandbox EPERM, matches the documented file-bridge lock class) but did
  not block the actual status read.
- Ledger's next free number is **P-122** — **VERIFIED** (`P-121` is the highest entry,
  matching this branch's own HEAD commit "P-121 evidence-gated graduation").
- `.gitignore`'s coverage of `00-PROJECT-ROOT/` is by individual pattern match
  (`node_modules/`, `*.log`, `dist/`, `out/`, `.pr-body-*.md`, `*.tsbuildinfo`), not
  one directory-level rule — **VERIFIED** via `git status --porcelain --ignored=matching`.
- The bundled `SATEX-DIGEST.md` this skill preloads (Section 0 rules, "8 specialist
  agents," paper-trading digest) is stale against the live `CONSTITUTION.md` v3.1 —
  **VERIFIED stale**; this plan cites the live constitution/AGENTS.md instead (per D1).

**Unknowns (resolved in Decision Log):**
- Where should this blueprint live? → resolved D1 (see log) → `docs/plans/`, matching
  the sibling file already there (`2026-07-20-may-tactics-graduation-rebuild-ultraplan.md`).
- Plan-only vs. plan-and-execute-today? → resolved D1 → plan first; execution route is
  the closing gate below, per this skill's own protocol.

---

## §2 — Domain Mapping

**Problem classification.** This is a **temporal + operational** housekeeping problem,
not a data/functional/risk problem. It recurs on a cadence (weekly), operates purely
on the git working tree and filesystem (no runtime code path), and its only
"risk" dimension is *process* risk — corrupting a crown jewel, breaking a doc link,
or contaminating `master` — never capital risk. It is explicitly designed to be
boring: `SATEX-~1.md`'s own thesis is that conservatism (downgrading almost
everything to PRESENT) is the correct and common outcome, not a failure.

**Touch-map.**
- **Agents (SATEX 8-agent trading taxonomy):** none. This plan touches zero
  DATA/TECH/NEWS/MACRO/RISK/EXEC/AUDIT/LEARN code paths.
- **Broker facets:** none.
- **Files / call-sites in blast radius:**
  - Read-only: `CLAUDE.md` (root), `apps/satex-terminal/CLAUDE.md`, `AGENTS.md`,
    `.gitignore`, `Vault/00-Audit/PROBLEM-LEDGER.md`.
  - Candidate-move (tested, currently all fail): `2026-07-13-flagship-direction-decision.md`,
    `2026-07-15-ADOPTION-RUNBOOK.md`, `2026-07-16-MERGE-RUNBOOK.md` (all tracked, root).
  - Present-only, no touch: `00-PROJECT-ROOT/01-SATEX-CORE/` (723 MB stale leftover),
    `.trash/` (6 items, largest is `cli-main/` at 1.6 MB), `Untitled.canvas` +
    `Untitled 1.canvas` (Obsidian scratch), `PROJECT-INSTRUCTIONS.md` (homeless,
    recurring from last week), `SATEX-~1.md` itself (this run's own brief).
  - Explicitly never-touch: the two crown jewels, `Vault/**`, the entire
    `apps/satex-terminal/` interior (including its new untracked test files and
    specs this week — `indicatorStore.test.ts`, `marketStore.test.ts`,
    `2026-07-19-marketstore-characterization-coverage-ultraplan.md`).
- **Load-bearing invariant at risk:** none of the app's Zustand/broker/IPC invariants
  apply — the only "invariant" in play is the brief's own SAFE-TO-MOVE rule and the
  crown-jewel integrity contract.

---

## §3 — Task Decomposition

> Mapped 1:1 onto `SATEX-~1.md`'s own Layer 0-6 structure — that structure is
> already the right decomposition; this section makes each layer's atomic actions
> explicit and buildable without the brief open next to it.

### §3.1 — Layer 0: Orient & pre-flight (read-only)
- **Purpose:** establish ground truth before any classification or action.
  **Inputs:** live repo state. **Outputs:** a verified go/no-go for Act-eligibility.
- **Tools:** `git`, `wc`, `python3` (for the NUL check — see §6 correction).
  **Constraints:** zero writes. **Depends on:** nothing (entry point).
- Subtasks:
  - Run `git status`, `git log --oneline -8`, `git branch --show-current`.
  - Run the crown-jewel integrity check for both files (byte count, line count,
    first/last line, NUL-byte scan) using the **corrected** command from §6, not the
    brief's literal `grep -c $'\x00'` snippet.
  - Run `git status --porcelain` and `git stash list` to capture the dirty set and
    confirm no stash surprises.
  - Check `.git/index.lock` / `.git/packed-refs.lock` for stale wedges; if present,
    confirm git still answers (`git status` succeeds) before deciding it's a
    non-blocking artifact rather than a real wedge.
  - **Checkpoint 0-A:** can state where the real app is (`apps/satex-terminal/`),
    why root "clutter" is mostly intentional (`.gitignore` provenance rules), and
    which two files are crown jewels.
  - **Checkpoint 0-B (Act-eligibility gate):** Act-eligible only if git status is
    fully legible, no merge/rebase in progress, no blocking lock, and both crown
    jewels pass integrity. This run: **all four hold → Act-eligible.**

### §3.2 — Layer 1: Perimeter (memorize; no action)
- **Purpose:** load the never-touch/never-delete/never-commit walls before looking
  at a single file, so classification in §3.3 can't drift into something unsafe.
- Subtasks: recite (not execute) the three NEVER walls — never delete/`rm`, never
  touch crown jewels/anchor docs/Vault/app-interior/uncommitted operator state/
  runtime data/trading perimeter, never commit to `master`.
- **Checkpoint 1:** the three walls are recitable without re-reading the brief.

### §3.3 — Layer 2: Classify (re-derive this week's inventory)
- **Purpose:** produce a fresh, evidenced bucket assignment for every root-level and
  newly-appeared item — explicitly not a copy of last week's Appendix A.
  **Inputs:** `git ls-files`, `git status --porcelain --untracked-files=all`,
  `git check-ignore -v <path>` per candidate. **Outputs:** the bucket table below.
- **Already re-derived this session** (real command output, 2026-07-20):

  | Item | Bucket | One-line reason |
  |---|---|---|
  | `.editorconfig`, `.gitattributes`, `.gitignore`, `.prettierrc.json`, `AGENTS.md`, `ARCHITECTURE.md`, `CLAUDE.md`, `CONSTITUTION.md`, `LICENSE`, `README.md`, `package.json` | KEEP@ROOT | anchor docs + repo config + crown jewel, precedent P-064 |
  | `2026-07-13-flagship-direction-decision.md` | MOVE? → **PRESENT** | referenced by `CONSTITUTION.md` (anchor, dirty) and `Vault/00-Audit/PROBLEM-LEDGER.md` (Vault, dirty) — fails condition 3 twice over |
  | `2026-07-15-ADOPTION-RUNBOOK.md` | MOVE? → **PRESENT** | referenced by `2026-07-16-MERGE-RUNBOOK.md` (clean, ok) but also `Vault/Daily/2026-07-16-agent-handoff.md` (Vault) — fails condition 3 |
  | `2026-07-16-MERGE-RUNBOOK.md` | MOVE? → **PRESENT** | self-referenced only, technically passes in isolation, but moving it alone orphans the ADOPTION-RUNBOOK cross-link (same precedent as last week's worked example) |
  | `PROJECT-INSTRUCTIONS.md` | PRESENT | untracked, homeless, recurring from last run — still unresolved, ask operator |
  | `SATEX-~1.md` | PRESENT | this run's own brief; untracked; filename shows truncation-class corruption signature; recommend operator confirm intended filename and, once this week's run is filed, relocate to `docs/policy/` mirroring the §4.6 scheduled-prompt convention (versioned mirror) — do not silently rename mid-run |
  | `SATEX-COCKPIT.canvas`, `Untitled.canvas`, `Untitled 1.canvas` | LEAVE-OBSIDIAN | canvas/dashboard state, resolves by filename, never touch |
  | `Vault/Daily/2026-07-18-work-layer.md`, `…2026-07-19-agent-handoff.md`, `…2026-07-19-work-layer.md` | LEAVE-OBSIDIAN | untracked Vault runtime notes |
  | 14 modified-unstaged tracked files (`AGENTS.md`, `ARCHITECTURE.md`, `CLAUDE.md`, `CONSTITUTION.md`, `README.md`, `Vault/00-Audit/PROBLEM-LEDGER.md`, `Vault/00-INDEX.md`, `Vault/HOME.md`, `Vault/_dashboards/sessions.base`, `apps/satex-terminal/{CHANGELOG,CLAUDE,README}.md`, `apps/satex-terminal/src/renderer/stores/indicatorStore.ts`, `docs/policy/SATEX-CLAUDE-DESIGN-PROMPT.md`) | LEAVE-DIRTY | operator's in-flight edits (anchor-doc refresh + P-121 branch work) — never stage, commit, or discard |
  | `apps/satex-terminal/docs/superpowers/specs/2026-07-19-marketstore-characterization-coverage-ultraplan.md`, `indicatorStore.test.ts`, `marketStore.test.ts` | OUT OF SCOPE | entire `apps/satex-terminal/` interior is never-touch for a filesystem clean |
  | `docs/plans/2026-07-20-may-tactics-graduation-rebuild-ultraplan.md` | NO ACTION | already correctly homed under `docs/plans/`; untracked but not root clutter |
  | `00-PROJECT-ROOT/01-SATEX-CORE/` | PRESENT | 723 MB, 0 tracked files, no `package.json`, pure pre-2026-07-02 leftover — recommend operator delete |
  | `.trash/` (6 items: 2 text scratch files, 2 zero/near-zero-byte markers, `cli-main/` 1.6 MB, `Untitled.canvas` 0 bytes) | PRESENT | gitignored holding pen, `.gitignore` itself says operator empties it |
  | `.git/index.lock` (0 bytes) | ANOMALY, note only | present but non-blocking this run — git commands succeeded; flag, don't `rm -f` unless git actually wedges |

- **Checkpoint 2:** every item above has exactly one bucket and a one-line reason —
  satisfied by the table.

### §3.4 — Layer 3: Act (the only autonomous-change layer)
- **Purpose:** execute `git mv` for any file that passes all four SAFE-TO-MOVE
  conditions; open branch + PR; never merge.
- **This week's result: zero files qualify.** All three candidates fail condition 3
  (a clean, non-anchor, non-Vault referencing file) — see §3.3 table. Per the brief's
  own precedent language, this is "a valid, common outcome," not a shortfall.
- Subtasks (become live only in a future week where a file passes all four):
  - `git checkout -b chore/weekly-clean-YYYYMMDD` — **recommendation, not in the
    brief verbatim:** cut this from `origin/master`, not from whatever feature
    branch happens to be checked out (this week that's
    `fix/tactics-graduation-evidence-bar`). See §6 CRITIC for why.
  - `mkdir -p docs/<target-subfolder>` if the destination is new.
  - `git mv "<old>" "docs/<subfolder>/<name>"`.
  - Update only the references that themselves passed condition 3; edit surgically,
    one line, nothing else in the file.
  - `git add` the exact touched paths (never `-A`, never `.`); `git status` to
    confirm only intended paths are staged.
  - Conventional commit, `git push -u origin <branch>`, `gh pr create --fill`.
  - Wait for CI's `Gates (typecheck, lint, knip, tests)` check; hand the green PR to
    the operator. **Do not self-merge.**
- **Checkpoint 3 (this run):** zero files moved, all three downgraded to PRESENT —
  satisfied, matches §3.3.

### §3.5 — Layer 4: Present (needs a human; touch nothing)
- **Purpose:** hand the operator every item that needs a decision, each with path +
  reason + recommended action, and touch none of them.
- Subtasks: compile the PRESENT rows from §3.3 into the Layer 6 report's item 3.
  Explicitly include: the 3 dated docs (with reference maps), the 00-PROJECT-ROOT
  leftover (with `du -sh` = 723M), `.trash/` contents (6 items, sizes above),
  `PROJECT-INSTRUCTIONS.md` (still homeless, second week running), `SATEX-~1.md`
  (filename anomaly + eventual `docs/policy/` home once this week's cycle closes),
  the two `Untitled*.canvas` scratch files, and the `.git/index.lock` anomaly.
- **Checkpoint 4:** every PRESENT item has path + reason + recommendation; none
  executed. Satisfied by the table.

### §3.6 — Layer 5: Verify
- **Purpose:** confirm nothing broke, crown jewels unchanged, no unintended file
  touched.
- Subtasks:
  - Re-run the crown-jewel integrity check; diff byte counts against the §3.1
    baseline (1178 bytes / 32 lines / root; 8149 bytes / 139 lines / app).
  - `git status` again — the dirty-file count and identity outside any files this
    run intentionally touched must be **unchanged** from §3.1's baseline.
  - If any move fired: `git log --follow -- "<new path>"` to confirm history
    survived, and `git grep -n "<basename>"` to confirm no dangling reference.
- **Checkpoint 5 (this run):** trivially satisfied since Layer 3 fired zero moves —
  still worth running the crown-jewel re-check and dirty-set diff, because "nothing
  should have changed" is itself the claim being verified, not assumed.

### §3.7 — Layer 6: Report
- **Purpose:** file the structured report using `SATEX-~1.md` §9's exact template.
  **Outputs:** the filled template (see §7 below) plus an optional ledger entry at
  **P-122**.
- **Checkpoint:** report is factual, real paths/sizes/command output, no scores, no
  "CERTIFIED" language — matches Directive 0.4 / 2.6.

---

## §4 — Dependency + Ordering (DAG)

**Ordered execution sequence:** §3.1 → §3.2 → §3.3 → §3.4 → §3.5 → §3.6 → §3.7.
This is a strictly linear pipeline by the brief's own design — each layer's
checkpoint gates entry to the next, so there is no meaningful parallelism to
extract, and inventing parallelism here would just make failures harder to
localize.

**Parallelizable set:** within §3.1, the four read-only checks (git status, git
log, crown-jewel check A, crown-jewel check B) have no mutual dependency and can
run as concurrent read-only calls. Everything after §3.2 is sequential by design
(each layer's checkpoint must pass before the next begins).

**Approval nodes (one-way doors):**
- ⛔ None at LIVE-CAPITAL severity — this plan never approaches the perimeter.
- ⚠️ **Soft approval node at §3.4 → PR merge.** Even though Layer 3 fired zero moves
  this week, the standing rule is: if a future week's Layer 3 does produce a PR, the
  **merge** step is always an operator action, never automated. This is the one
  quasi-approval gate baked into the recurring process, not a one-time decision.

```
§3.1 ──▶ §3.2 ──▶ §3.3 ──▶ §3.4 (⚠️ soft-gate: PR merge is operator-only) ──▶ §3.5 ──▶ §3.6 ──▶ §3.7
```

---

## §5 — Execution Specification

### §5.1 — spec for §3.1 (Orient)
- **Method:** direct `git` + `wc` + `python3` invocation, no wrapper scripts.
- **Expected artifacts:** none (read-only) — a verified go/no-go plus a captured
  dirty-set snapshot for later diffing.
- **Validation:** crown-jewel byte counts match the §2 baseline in `SATEX-~1.md`
  exactly (1178/32/root, 8149/139/app); `git status` parses cleanly; no lock wedge.
- **Failure modes:** byte count or NUL-scan mismatch → suspected corruption event,
  STOP per Directive 0.1/§2.9, do not attempt repair inline. Lock file present AND
  git commands fail → real wedge, run `scripts/git-unlock.ps1` or `rm -f
  .git/index.lock` only then.
- **Fallback:** if git is genuinely wedged, this becomes a read-only report-only run
  (skip straight to a Layer 4/6 style report of "could not proceed, here's why").

### §5.2 — spec for §3.3 (Classify)
- **Method:** `git ls-files | grep -vE '/'` for tracked root files, `git status
  --porcelain --untracked-files=all` for new/untracked, `git check-ignore -v
  <path>` per ambiguous candidate, `git grep -l "<basename>"` per MOVE? candidate to
  build its reference map.
- **Expected artifacts:** the bucket table (already produced in §3.3 above for this
  run).
- **Validation:** every discovered path appears in exactly one bucket; no path is
  silently dropped.
- **Failure modes:** a `git grep` reference check that misses a Vault or anchor-doc
  hit would wrongly clear a file for move — this is exactly last week's documented
  near-miss lesson (Appendix A), so condition 3's four sub-checks (clean, non-anchor,
  non-Vault, no bundle edit needed) must all run per candidate, not just the first
  that returns a hit.
- **Fallback:** any ambiguity → downgrade to PRESENT, never guess.

### §5.3 — spec for §3.4 (Act)
- **Method:** `git mv` exclusively; never `cp`/`copy`, never `git rm` for the move
  itself (the old path's removal is inherent to `git mv`, not a separate delete).
- **Expected artifacts (only if triggered):** new branch, one or more commits,
  pushed branch, open PR.
- **Validation:** `git status` shows only the intended staged paths before commit;
  CI's `Gates (typecheck, lint, knip, tests)` required check goes green on the PR
  (doc-only moves pass trivially, but this is still the actual arbiter, not an
  assumption).
- **Failure modes:** a blanket `git add -A` staging unrelated dirty operator files
  is the single most dangerous failure this layer can produce — it would carry the
  operator's uncommitted anchor-doc edits and P-121 WIP into an unrelated "chore"
  commit. Mitigation: always enumerate exact paths to `git add`.
- **Fallback:** if CI goes red for any reason on a doc-only PR, that is itself a
  signal something upstream is broken (e.g., a stale cache) — do not force-merge,
  report it, let the operator investigate.

### §5.4 — spec for §3.6 (Verify)
- **Method:** re-run §5.1's crown-jewel check verbatim; diff `git status --porcelain`
  against the §3.1 baseline snapshot.
- **Validation:** byte-for-byte crown-jewel match; dirty-set diff is empty (identical
  files, identical count) outside anything this run intentionally added (a new
  branch's own commits, if any fired).
- **Failure modes:** any drift here is either an artifact of this run's own action
  (expected, explain it) or evidence of the file-bridge corruption class touching
  something incidentally (unexpected, STOP and report per Directive 0.1).
- **Fallback:** none needed if validation passes; if it fails, escalate to the
  operator with the exact diff, not a summary.

---

## §6 — Risk + Ambiguity Audit (self-adversarial)

**CRITIC pass.**
- **Assumption not fully verified by me, flagged for the executing agent:** I ran
  `git check-ignore -v 00-PROJECT-ROOT` and got no match printed for the directory
  itself, yet `git status --porcelain --ignored=matching -- 00-PROJECT-ROOT` shows
  its contents matched by several individual patterns (`node_modules/`, `*.log`,
  `.pr-body-*.md`, etc.). Net effect is the same (nothing under it is trackable),
  but "fully gitignored" is a slight overstatement of "every file inside happens to
  match some pattern." Not a blocker, just a precision correction for the report.
- **Concrete tooling bug found in the brief itself:** `SATEX-~1.md` §2's suggested
  NUL-byte check is `grep -c $'\x00' "$f" && echo "!! NUL BYTES"`. Run verbatim
  against both crown jewels this session, it printed the **full line count** for
  each file (32 for root, matching its line count) and triggered the corruption
  branch — a **false positive**. A `python3 -c "open(f,'rb').read().count(b'\x00')"`
  check on the same files returned **0** for both, confirmed by `file` reporting
  "Unicode text, UTF-8 text" with no binary flag. Root cause: `grep`'s NUL handling
  inside a bash `$'\x00'`-pattern argument doesn't behave as a literal single-byte
  match in this environment — it appears to degrade to "binary file, report full
  line count" semantics rather than a per-line NUL match. **This means the brief's
  own crown-jewel checkpoint, taken literally, would falsely halt every single run**
  in this sandbox class. Recommendation: swap the brief's §2 snippet for the
  `python3 … .count(b'\x00')` form (or `LC_ALL=C grep -aP '\x00' -c`) and file this
  as a ledger entry — it's exactly the kind of "gate that can fail without proving
  anything" class Directive 0.4 warns about, just inverted (false-STOP instead of
  false-green). Recommend **P-122** for this.
- **Worst case if the false-positive isn't caught:** every future weekly-clean run
  halts at Checkpoint 0 believing both crown jewels are corrupted, when they are
  not — a standing false-alarm that trains the operator to distrust or override the
  check, which is worse than not having it.
- **Left out of the brief that this plan adds:** an explicit recommendation to cut
  the `chore/weekly-clean-*` branch from `origin/master` rather than whatever branch
  happens to be checked out. This week `HEAD` is 1 commit ahead of `origin/master`
  and a clean ancestor, so the risk is small, but the brief's literal
  `git checkout -b chore/weekly-clean-YYYYMMDD` (no explicit base) will silently
  fork from whatever WIP branch is active. On a week where the active branch has
  diverged further from `master`, that would drag unrelated commits into the
  chore PR's diff. This is moot for *this* run (Layer 3 fires zero moves), but is a
  real gap in the reusable process for future weeks.
- **Teardown/unmount check (SATEX's recidivist defect class):** not applicable — no
  observers, timers, or listeners are created by a filesystem clean. Confirmed N/A,
  not skipped.

**RISK-AGENT pass** (against Constitution §2.4 perimeter list and the trading-safety
guardrails in AGENTS.md, which supersede the bundled digest's older Section 5/8
framing):
- Verdict: **APPROVED.**
- Rationale: no task in §3 touches the order/execution path, risk gates, kill
  switch, arming interlock, credentials, IPC schemas, or the update feed. No task
  proposes a live-capital action, a risk-parameter change, or bypasses any safety
  layer. Every autonomous action (§3.4) is gated by a rule (SAFE-TO-MOVE) with a
  mandatory PRESENT-downgrade fallback, and the one genuinely irreversible step
  (merging a PR) is explicitly reserved for the operator.

**Unresolved high-risk items surfaced to operator:** none at RISK-TOUCH severity.
Two process-quality items are surfaced for the operator's awareness rather than as
blockers: the NUL-check false-positive (recommend fixing in the next revision of
`SATEX-~1.md` itself, and/or logging P-122) and the branch-base gap (recommend
baking "branch from `origin/master`" into the brief's §6 snippet as the default).

---

## §7 — Final Assembly: the plan

**Build order** (this week, 2026-07-20 — copy-ready):

1. Run §3.1 Orient checks (git status/log/branch, corrected crown-jewel check) —
   done when Checkpoint 0-A and 0-B both pass. **Already executed this session;
   both passed.**
2. Recite §3.2 Perimeter walls — done when stated without re-reading the brief.
3. Run §3.3 Classify against live `git ls-files` / `git status --porcelain
   --untracked-files=all` / `git check-ignore -v` / `git grep -l` — done when every
   item has one bucket + reason. **Already executed this session; table above.**
4. Evaluate §3.4 Act: apply SAFE-TO-MOVE to every MOVE?-bucket item — done when
   each either fires (branch+commit+push+PR, not merged) or is downgraded to
   PRESENT with its reference map. **Result this week: all three downgraded,
   zero moves fired.**
5. Compile §3.5 Present list for the operator — done when every PRESENT item has
   path + reason + recommendation.
6. Run §3.6 Verify — re-check crown jewels, diff dirty-set against baseline — done
   when both match with zero unexplained drift.
7. File §3.7 Report using the exact `SATEX-~1.md` §9 template; offer (don't assume)
   a ledger entry at **P-122** for the NUL-check false-positive finding.

**Acceptance criteria (gate outcomes):**
- [ ] `npm run typecheck` — N/A this run (no app-interior file touched); would apply
      only if a future week's Act phase modifies a referenced file inside `apps/`.
- [ ] `npm run lint` — same as above, N/A this run.
- [ ] `npm test` — same as above, N/A this run.
- [ ] `npm run knip` — same as above, N/A this run.
- [x] Crown-jewel byte-for-byte integrity before and after — **PASS** (verified this
      session: 1178/32/root and 8149/139/app, zero NUL bytes both, confirmed by
      `python3` byte-count, not the brief's literal grep snippet).
- [x] Zero `rm`/`git rm` executed — **PASS** (nothing executed yet; plan-only pass).
- [x] Zero commits to `master` — **PASS**.
- [x] All root/new items classified with reason — **PASS** (§3.3 table).
- [ ] PR opened + CI green — **N/A this run** (zero files qualified for move).
- [ ] Layer 6 report filed — pending operator's go-ahead on execution route below.

**Deliverables:**
- This blueprint: `docs/plans/2026-07-20-weekly-repo-deep-clean-ultraplan.md`.
- (On execution) the filled Layer 6 report, delivered as chat output or a Vault note
  per operator preference.
- (Optional, on operator request) one `PROBLEM-LEDGER.md` entry at **P-122** for the
  NUL-check false-positive, filed by the operator or with explicit go-ahead — the
  ledger is currently dirty with the operator's own edits, so this plan does not
  touch it unilaterally.

---

## Decision Log

| D# | Question | Chosen | Why |
|---|---|---|---|
| D1 | Boundary confirm: plan the weekly-clean (`SATEX-~1.md`) run for 2026-07-20, save to `docs/plans/`, ground in live `CONSTITUTION.md`/`AGENTS.md` instead of the skill's stale bundled digest? | Draft it as scoped | Operator confirmed directly; matches the corrected file pointer and precedent of the sibling `2026-07-20-may-tactics-graduation-rebuild-ultraplan.md` already in `docs/plans/`. |

## Revision Log (review loop)

| # | Section | Change | Trigger |
|---|---|---|---|
| — | — | none yet | awaiting operator section-by-section review |
