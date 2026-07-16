# SATEX — Unified Adoption Runbook (2026-07-15)

**One ordered sequence to land everything pending on `master`.** Prepared by the
verification session (Opus 4.8). All SHAs verified live against `origin` this session;
`origin/master` = `32ceccd` (no drift). Run every command on the Windows machine in
`mc4/`. Branch → PR → CI green → merge → verify SHA → sync — every time (§2.2).

> Live-capital note: none of this touches the trading perimeter except p101 (learning
> core + one IPC channel), which is called out for §2.7 human sign-off. Nothing here
> arms, trades, or moves money.

---

## SHA reference (verified live)

| Item | Branch | Tip SHA | Base | On origin? | Risk |
|---|---|---|---|---|---|
| **p105 bundle** (P-103+P-104+P-105) | `chore/p103-canonical-name-and-doc-truth` | `9c5ba73` | `32ceccd` | no — push it | docs + 1 comment, zero perimeter |
| p102 | `feat/intro-fade-quad` | `06aefe9` | `32ceccd` | **yes** (pushed) | UI only |
| p101 | `feat/discipline-edge` | `83d0cd7` | `32ceccd` | **yes** (pushed) | learning-core + 1 IPC — §2.7 sign-off |

`p105-constitution-plus-housekeeping.bundle` **supersedes** the `p103` and `p104`
bundles (it contains all three commits). Ignore/delete p103 + p104 bundles.

---

## STEP 0 — Preflight: clear the stale locks, confirm master

The P-099 stale-lock recurrence is live (`.git/index.lock` + `.git/objects/maintenance.lock`)
and will block every index write until cleared.

```powershell
cd C:\Users\User\mc4
powershell -ExecutionPolicy Bypass -File scripts\git-unlock.ps1   # removes stale .git locks
# (or manually: del .git\index.lock ; del .git\objects\maintenance.lock)
git status                      # should run without "index.lock exists"
git ls-remote origin refs/heads/master   # expect 32ceccd2c1... — the base everything rebases on
```

---

## STEP 1 — Adopt p105 (the v3.1 constitution + doc-truth + housekeeping)

The working tree already holds these changes uncommitted; the bundle is the committed,
byte-verified form (3 commits). `reset --hard FETCH_HEAD` replaces the loose working-tree
copy with the clean committed chain. (Untracked files — bundles, `.agents/`, `.codex/` —
are left alone. The pre-existing `package-lock.json` working-tree churn is discarded; run
`git diff package-lock.json` first if you want to inspect it.)

```powershell
git fetch .\p105-constitution-plus-housekeeping.bundle chore/p103-canonical-name-and-doc-truth
git reset --hard FETCH_HEAD
git log --oneline -3            # expect: 9c5ba73  0945d8e  19b8c08
git push -u origin chore/p103-canonical-name-and-doc-truth
```

Open the PR (title + body in **PR BODY A** below), let CI go green, then:

```powershell
gh pr merge <n> --rebase        # or --squash — linear history bans merge commits
git checkout master
git pull --ff-only origin master
git ls-remote origin refs/heads/master   # note the NEW master SHA — call it MASTER1
```

After merge: in the ledger, flip **P-103 / P-104 / P-105** Status lines to `VERIFIED`
(CI green on `<MASTER1>`). Delete the now-superseded bundles: `p103-canonical-name-doc-truth.bundle`,
`p104-constitution-v3.1.bundle`, `p105-constitution-plus-housekeeping.bundle`.

---

## STEP 2 — Adopt p102 (post-intro Quad fade-in, UI only)

Already on origin at `06aefe9`. It was cut off `32ceccd`, so rebase it onto `MASTER1`
before the PR. Only likely conflict: the CHANGELOG `## Unreleased` region (p102 adds an
`### Added` bullet; p104/p105 added `### Fixed` bullets — usually auto-merges). **Do not
add a P-102 ledger entry — it already rides in p105.**

```powershell
git fetch origin feat/intro-fade-quad
git checkout -b feat/intro-fade-quad origin/feat/intro-fade-quad
git rebase master               # resolve CHANGELOG if it stops; keep both bullets
git push --force-with-lease
```

Open the PR (**PR BODY B**) → CI green → `gh pr merge <n> --rebase` → sync master (→ MASTER2).
**Live QA before/after merge:** `npm run dev`, complete the boot ceremony, confirm the
staggered Quad fade-in (820ms, rows cascading) and that a fresh profile lands on Quad.

---

## STEP 3 — Adopt p101 (Track B EDGE block) — ⚠️ §2.7 HUMAN SIGN-OFF

Already on origin at `83d0cd7`. **This one touches the learning core**
(`core/trading-engine.ts`, `self-eval.ts`) and **adds one IPC channel** — it is the only
pending item requiring §2.7 review + your explicit sign-off. It carries its own ledger
entry (P-101) and ultraplan spec. Rebase onto `MASTER2`; expect conflicts in
`PROBLEM-LEDGER.md` (P-101 vs the new head), `CHANGELOG.md`, and possibly `types.ts` /
`globals.css` (shared with p102).

```powershell
git fetch origin feat/discipline-edge
git checkout -b feat/discipline-edge origin/feat/discipline-edge
git rebase master               # resolve ledger head (keep P-101 newest-first) + CHANGELOG
# In the SAME PR, bump the IPC count 122 -> 123 (p101 adds a channel):
#   ARCHITECTURE.md §2  and  CONSTITUTION.md §1.1 + §3.1  ("122 channels" -> "123 channels")
git push --force-with-lease
```

Open the PR (**PR BODY C**) → **your sign-off** → CI green → `gh pr merge <n> --rebase`
→ sync. **Live QA:** Settings → Run Self-Eval Now → confirm the EDGE rows (top-3 by DSR,
verdict dots) render and fit the DISCIPLINE panel.

---

## STEP 4 — Close-out

- Ledger: flip P-101 / P-102 to `VERIFIED` once their CI is green on master.
- Delete adopted local bundles: `p101-discipline-edge.bundle`, `p102-intro-fade-quad.bundle`
  (and the three from Step 1). Remove their `.bundle.lock` siblings.
- Optionally decide `.agents/` and `.codex/` (untracked agent-tooling dirs): gitignore or track.
- Consider tracking `scripts/git-unlock.ps1` — it is the operator P-099 recovery tool and
  currently untracked.
- Constitution review cadence unchanged: next 2026-10-13 or next L1.x advance.

---

## PR BODY A — chore/p103-canonical-name-and-doc-truth (P-103 + P-104 + P-105)

**Title:** `chore: canonical repo name + v3.1 constitution + verification housekeeping (P-103/P-104/P-105)`

Three linear commits, docs + one comment, zero trading-path contact:

- **P-103** — canonical `satex25/SATEX-terminal` everywhere functional (electron-updater
  feed + pinned test, README badge/Releases, `docs/SECURITY.md`, git remote); README front
  page links repaired to the real `docs/` layout; `ARCHITECTURE.md` refreshed to measured
  reality (flat `services/`+`core/`; IPC 122; 21 panels/7 modals/24 stores/3 themes/9 rails;
  13 tables; baseline 1668/126); `scripts/update-baseline.sh` path fixed. History left
  untouched (append-only law).
- **P-104** — `CONSTITUTION.md` v3.0.0 → **v3.1.0**: every factual claim re-verified against
  the tree, new scar tissue absorbed (funded gates 9-13, PSR/DSR layer, Conviction Layer,
  P-097 false-green law, P-099 write workflow, scheduled work layer), Appendix C delta log.
- **P-105** — independent re-verification of v3.1 (**all claims measure true**) + two
  off-perimeter nits closed: `App.tsx:251` stale ⌘ comment (⌘1..⌘5 → ⌘1..⌘6; comment only)
  and the unledgered P-102 back-filled. Evidence:
  `Vault/00-Audit/2026-07-15-CONSTITUTION-V3.1-VERIFICATION.md`.

Gates (sandbox Node 22): typecheck node+web exit 0 · eslint scoped exit 0 · targeted
vitest `auto-update.test.ts` 14/14 · full suite (1668/126) + knip = CI arbiter (§2.9).

## PR BODY B — feat/intro-fade-quad (P-102)

**Title:** `feat(intro): post-intro session reveal — staggered fade-in landing on Quad (P-102)`

Renderer/CSS only, zero perimeter. `.bb-app` gains `bb-shell-reveal` on `splashDone`
→ `session-reveal` keyframe (820ms cubic-bezier, `translateY(6px)→0` + opacity, staggered
0/70/150/230/300ms; `prefers-reduced-motion` → 240ms plain fade); `DEFAULT_WORKSPACE_STATE.landingWorkspace`
Trade→Quad (fresh installs only). Ledger entry rides in p105 (P-102 back-fill) — not
duplicated here. Gates: typecheck node+web 0 · eslint 0/0 · targeted vitest 64/64 · knip CI.

## PR BODY C — feat/discipline-edge (P-101) ⚠️ perimeter-adjacent

**Title:** `feat(discipline): Track B — surface nightly PSR/DSR expectancy as the EDGE block (P-101)`

Executes `2026-07-13-track-b-significance-expectancy-surface-ultraplan.md`. DISCIPLINE panel
EDGE block surfacing nightly PSR/DSR (top-3 by DSR, verdict dots). `classifyEdge` extracted
to `@shared/backtest/edge-verdict.ts`; `SelfEvalService.getLastReport()`; **new invoke-only
`SELF_EVAL_REPORT_GET` IPC channel** (no setter — §3.6 observational wall) → **IPC 122→123,
bump ARCHITECTURE §2 + CONSTITUTION §1.1/§3.1 in this PR**. Touches `core/trading-engine.ts`
and `self-eval.ts` → **§2.7 human sign-off required**. Gates (sandbox): typecheck 0 · lint 0 ·
vitest exact-cover 127 files / 1686 tests / 0 fail · knip CI.
