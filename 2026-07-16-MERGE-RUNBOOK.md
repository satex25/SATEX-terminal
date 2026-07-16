# SATEX — Merge Runbook (2026-07-16)

**Supersedes `2026-07-15-ADOPTION-RUNBOOK.md` — delete that file, it describes work that
is already merged.** Prepared by an independent verification session (Claude Sonnet 5,
Cowork). Every claim below was re-measured against the live tree and origin this
session, not copied from memory or from the prior runbook. Run every command on the
Windows machine in `C:\Users\User\mc4`. Branch → PR → CI green → merge → verify SHA →
sync, every time (Constitution §2.2).

---

## 0. What actually changed since the old runbook (read this first)

The 2026-07-15 runbook described three items (p101, p102, p105-bundle) as "pending
adoption." **They are not pending — they are already merged to `master` on origin**:

| Item | Claimed state (old runbook) | Verified actual state (this session) |
|---|---|---|
| P-103 (canonical name + doc truth) | pending push | merged, `master@3aa7bef` |
| P-104 (constitution v3.1) | pending push | merged, `master@fa19b19` |
| P-105 (v3.1 verification + housekeeping) | pending push | merged, `master@28d2903` |
| P-102 (intro Quad fade-in) | pending PR | merged, `master@a18fa29` |
| P-101 (DISCIPLINE EDGE block) | pending §2.7 sign-off | merged, `master@94fc8df` + `729b1ce` |

Confirmed independently: `origin/master` = `729b1ce0eae94eddb2074d935b25a4328d6679bd`
(fresh `git fetch`), GitHub shows **0 open PRs / 41 closed**, and none of the three
`.bundle` files the old runbook references exist on disk anymore. Someone (an earlier
session, per the Vault/Daily handoffs) already ran that runbook to completion. Local
stale branches/refs for this work still exist (`feat/discipline-edge`,
`feat/intro-fade-quad`, `chore/p103-canonical-name-and-doc-truth`, etc.) — cosmetic only,
safe to delete later, not part of this runbook.

**What's actually new and unmerged is today's (2026-07-16) work**, produced by five
autonomous dawn/work-layer sessions running back-to-back overnight. That's what this
runbook lands.

## 1. Today's pile — independently verified, not just read from handoffs

Four tracked files modified, everything else untracked/new. I ran the gates myself
against the live sandbox rather than trusting the session reports:

| Check | Result |
|---|---|
| `tsc -p tsconfig.node.json --noEmit` | **exit 0** |
| `tsc -p tsconfig.web.json --noEmit` | **exit 0** |
| `eslint` on the 3 new test files | **exit 0**, 0 warnings |
| `vitest run` on the 3 new test files | **3 files / 41 tests / 0 fail** (18+15+8) |
| Byte-scan (NUL / CRCR) on all 7 touched files | **0 NUL / 0 CRCR** everywhere |
| `PROBLEM-LEDGER.md` tail | clean, ends on a complete sentence + `\n` (291,271 B — matches the ledger's own claimed byte count exactly) |
| Subjects (`alpaca-mode.ts`, `depth-feed.ts`, `self-eval-store.ts`) | `git diff --stat` empty — byte-unchanged, test-only |
| Perimeter grep (`order-manager`/`risk-gates`/`kill-switch`/`live-mode`) across new test files | one hit — a **comment**, not an import, explaining alpaca-mode.ts is *not* the arming path |
| knip | not sandbox-runnable (Node 22 crash, P-097 — CI is the arbiter, as documented) |

Verdict: **all of today's work is real, gate-clean, and off the trading-safety
perimeter.** Nothing here touches `order-manager.ts`, `risk-gates.ts`,
`kill-switch-store.ts`, `live-mode.ts`, or `tactics.ts`. No §2.7 human sign-off is
required for this batch (unlike the already-merged P-101, which needed and — per the
merge — already got it).

One pre-existing, non-blocking issue found and confirmed by my own byte-scan, not new:
`apps/satex-terminal/CHANGELOG.md`'s **committed** tail (in git history, at `HEAD`) is
truncated mid-sentence — this is P-107's already-ledgered, already-deferred follow-up
(a multi-event splice across a 2026-07-02 path rename). It sits at the *bottom* of the
file; today's new entries insert at the *top*, so committing today's pile does not make
it worse. Leave it deferred — do not attempt the splice in this PR.

## 2. A lock problem I caused this session — fix it first

Investigating GitHub state, I ran `git fetch origin --prune` from this sandbox. It
deleted 8 stale remote-tracking refs for already-merged branches, but the sandbox mount
couldn't remove its own lock files afterward (`EPERM`, the same class as P-099). These
locks now sit in the **same `.git` directory your Windows machine uses**:

```
.git/packed-refs.lock
.git/refs/remotes/origin/chore/backlog-checkpoint-p024-p063.lock
.git/refs/remotes/origin/chore/ledger-close-tree-hygiene.lock
.git/refs/remotes/origin/chore/ledger-market-open-verify-2026-07-13.lock
.git/refs/remotes/origin/chore/p103-canonical-name-and-doc-truth.lock
.git/refs/remotes/origin/feat/discipline-edge-v2.lock
.git/refs/remotes/origin/feat/discipline-edge.lock
.git/refs/remotes/origin/feat/intro-fade-quad.lock
.git/refs/remotes/origin/refactor/filesystem-reorganization.lock
```

`git status`/`git log` still read fine (verified), but any write (checkout -b, fetch,
commit) may hit them. `scripts/git-unlock.ps1` (already in the repo, untracked) is built
to remove exactly this class of file and is safe — it refuses to run while a live
`git.exe` process exists. **Run it before anything else below.**

Separately: `git fsck` reports `bad index file sha1 signature` in this sandbox. Every
independent read this session (git status, git diff, three separate agent session
reports) has been mutually consistent, so I don't believe this is corrupting data you
can see — but it's one more reason all destructive git operations happen on your
machine, never from this sandbox. If `git-unlock.ps1` doesn't fully clear things, run
`git fsck` on the Windows side before doing anything else.

## 3. Commands — run in order on `C:\Users\User\mc4`

```powershell
cd C:\Users\User\mc4

# STEP 0 — clear the locks from §2, confirm clean state
powershell -ExecutionPolicy Bypass -File scripts\git-unlock.ps1
git status                                # should show no lock errors
git rev-parse HEAD                        # expect 729b1ce0eae94eddb2074d935b25a4328d6679bd
git rev-parse origin/master               # expect the same
git fsck --no-progress                    # should be clean on your machine; if not, stop and investigate before continuing

# STEP 1 — branch (carries today's uncommitted working-tree changes onto it)
git checkout -b chore/2026-07-16-p094-p106-p107-p108-coverage-and-workflow

# STEP 2 — stage EXACTLY this file set (not `git add -A` — .agents/, .codex/, and
# the stale 2026-07-15-ADOPTION-RUNBOOK.md are deliberately excluded)
git add `
  Vault/00-Audit/PROBLEM-LEDGER.md `
  apps/satex-terminal/CHANGELOG.md `
  docs/policy/scheduled-psd-daily.md `
  docs/policy/scheduled-work-layer.md `
  apps/satex-terminal/docs/superpowers/specs/2026-07-16-alpaca-mode-coverage-ultraplan.md `
  apps/satex-terminal/docs/superpowers/specs/2026-07-16-dawn-workflow-v4-two-file-contract-ultraplan.md `
  apps/satex-terminal/docs/superpowers/specs/2026-07-16-depth-feed-coverage-ultraplan.md `
  apps/satex-terminal/docs/superpowers/specs/2026-07-16-self-eval-store-coverage-ultraplan.md `
  apps/satex-terminal/src/main/services/alpaca-mode.test.ts `
  apps/satex-terminal/src/main/services/depth-feed.test.ts `
  apps/satex-terminal/src/main/services/self-eval-store.test.ts `
  Vault/Daily/2026-07-16-agent-handoff.md `
  Vault/Daily/2026-07-16-agent-handoff-p094-selfevalstore.md `
  Vault/Daily/2026-07-16-agent-handoff-p094-depthfeed.md `
  Vault/Daily/2026-07-16-work-layer.md `
  Vault/Daily/2026-07-16-work-layer-p107-r4-sweep.md `
  Vault/00-Audit/2026-07-15-CONSTITUTION-V3.1-VERIFICATION.md `
  scripts/git-unlock.ps1

git status                                # confirm the staged list matches this exactly

# STEP 3 — gate bar one more time on your hardware (adds knip, which the sandbox can't run)
cd apps/satex-terminal
npm run typecheck
npm run lint
npm test
npm run knip
cd ..\..

# STEP 4 — commit (message below)
git commit -F - <<'EOF'
chore(ledger): P-094 coverage + P-106 v4.0 dawn/work-layer workflow + P-107 ledger-tail repair + P-108 finding

- P-094: characterization coverage for 3 off-perimeter services (41 new tests):
  alpaca-mode.ts (15), depth-feed.ts (18), self-eval-store.ts (8). All three
  subjects are byte-unchanged (test-only). Two safe picks remain for a future
  session: persistence.ts (992 LOC SQLite layer, needs CI/operator hardware —
  better-sqlite3's native binding does not load under sandbox Node 22).
  live-mode.ts and tactics.ts stay explicitly human-gated (perimeter).
- P-106: scheduled dawn/work-layer prompts reworked v3.1 -> v4.0 (explicit
  two-file contract: ultraplan ~90% of effort + handoff-as-mission-brief for
  the finisher). Installed Cowork tasks re-synced same session; both left
  disabled pending operator re-enable.
- P-107: found the P-099 file-bridge-corruption class had reached git history
  (committed tails, not just working-tree writes) at least 4 times across
  PROBLEM-LEDGER.md and CHANGELOG.md. Ledger tail repaired and byte-verified
  this change (291,271 B, 0 NUL, 0 CRCR, clean tail). CHANGELOG.md's tail
  truncation is pre-existing, multi-event, and spans a 2026-07-02 path rename —
  scoped as a follow-up requiring a dedicated splice, deliberately NOT
  attempted here.
- P-108: latent unbounded-spread finding in Sparkline.tsx logged (ledger-only;
  not a live defect, no call-site currently exercises it; fix deferred to a
  renderer session).
- Also tracks scripts/git-unlock.ps1 (the P-099 lock-recovery tool, referenced
  throughout the ledger but previously untracked) and the P-105 verification
  evidence doc (previously an orphaned untracked file).

Zero trading-safety-perimeter contact: order-manager.ts, risk-gates.ts,
kill-switch-store.ts, live-mode.ts, tactics.ts all untouched.

Gates — sandbox (Node 22.22.3): typecheck node+web exit 0 * eslint (touched
files) exit 0, 0 warnings * vitest 3 files / 41 tests / 0 fail * knip CI-only
(P-097, sandbox crash under Node 22). Full four-gate bar re-run on operator
hardware in this same commit's CI run.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF

# STEP 5 — push + open the PR
git push -u origin chore/2026-07-16-p094-p106-p107-p108-coverage-and-workflow

gh pr create `
  --title "chore: P-094 coverage + P-106 v4.0 workflow + P-107 ledger repair + P-108 finding" `
  --body-file - <<'EOF'
## Summary

Lands five 2026-07-16 autonomous dawn/work-layer sessions' worth of off-perimeter
work: three new characterization-test suites (P-094), a rework of the scheduled
agent prompts (P-106), a repair to committed ledger corruption plus a new audit
finding (P-107/P-108).

**Zero trading-safety-perimeter contact.** `order-manager.ts`, `risk-gates.ts`,
`kill-switch-store.ts`, `live-mode.ts`, `tactics.ts` are all untouched — verified by
diff and by grep across every new file in this PR.

## What's in it

- **P-094** — `alpaca-mode.test.ts` (15), `depth-feed.test.ts` (18),
  `self-eval-store.test.ts` (8) = 41 new tests. All three subjects byte-unchanged.
- **P-106** — `docs/policy/scheduled-psd-daily.md` and `scheduled-work-layer.md`
  reworked v3.1 -> v4.0; installed Cowork tasks re-synced (left disabled).
- **P-107** — `PROBLEM-LEDGER.md` committed-tail truncation (P-099 class, in git
  history since at least commit `28d2903`) repaired; `CHANGELOG.md`'s analogous
  truncation is scoped as a deliberately-deferred follow-up (multi-event, spans a
  path rename — needs its own careful session, not bundled here).
- **P-108** — ledger-only finding, no code change (latent, not live).
- Housekeeping: tracks `scripts/git-unlock.ps1` and the P-105 verification
  evidence doc, both previously untracked/orphaned.

## Gates

Sandbox (Node 22.22.3): typecheck node+web exit 0 · eslint (touched files) exit 0 ·
vitest 3 files / 41 tests / 0 fail · knip CI-only (P-097). Full four-gate CI run is
this PR's own check.

## Follow-ups (explicitly NOT in this PR)

- P-094: `persistence.ts` coverage (needs CI or operator hardware — native binding
  doesn't load in-sandbox).
- P-107 follow-ups 1-2: CHANGELOG.md splice + ledger event-1 deep restore.
- P-108: migrate `Sparkline.tsx` to `extent()`.
- Operator-only, unrelated to this PR: re-enable the `satex-psd-daily` /
  `work-layer` scheduled tasks (P-106 A1); P-101/P-102 live-render QA on real
  hardware (both already merged separately, holding at SHIPPED pending that QA).
EOF

# STEP 6 — wait for CI, then merge
gh pr checks --watch
gh pr merge --rebase

# STEP 7 — verify + sync
git checkout master
git pull --ff-only origin master
git rev-parse HEAD          # the new master SHA — record this in the ledger
git branch -d chore/2026-07-16-p094-p106-p107-p108-coverage-and-workflow
```

## 4. After merge — ledger housekeeping

- Flip the P-094 (three service portions), P-106, P-107, P-108 ledger entries from
  their current "SHIPPED (unstaged)" language to committed-SHA evidence (the new
  `master` SHA from Step 7).
- Delete `2026-07-15-ADOPTION-RUNBOOK.md` (stale, superseded by this file — its
  contents are now history, not a to-do).
- Decide `.agents/` and `.codex/` (untracked agent-tooling dirs) — gitignore or
  track; not part of this PR either way.
- This file (`2026-07-16-MERGE-RUNBOOK.md`) can be deleted once Step 7 is done — it's
  a run-once instruction sheet, not permanent documentation.

## 5. Explicitly out of scope — operator-only, no command can do these

- **P-101/P-102 live-render QA**: launch the app (`npm run dev`), complete the boot
  ceremony, confirm the staggered Quad fade-in and that Settings → Run Self-Eval Now
  renders the EDGE rows correctly. Needs your eyes on real hardware.
- **Re-enabling `satex-psd-daily` / `work-layer`** scheduled tasks (P-106 A1) — a
  conscious decision to let unattended agents run again, not something to automate.
- **Installed-task-vs-mirror drift check** — compare the live Cowork task text
  against `docs/policy/scheduled-*.md` directly in the Cowork UI; this sandbox has no
  path to the installed task prompts.
