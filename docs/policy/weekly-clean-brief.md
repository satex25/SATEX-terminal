# SATEX — Weekly Repository Deep-Clean

## Execution Brief for Claude Fable 5

**Repo:** `C:\Users\User\mc4`  ·  **Remote:** github.com/satex25/SATEX-terminal  ·  **Default branch:** `master`
**Mode:** Organization only — *not* optimization, refactoring, deleting, or architecture change.
**Cadence:** Runs roughly weekly. The repo state drifts between runs, so **you re-derive the inventory every time**; the dated snapshot in Appendix A is a worked example from the last run, not a script to replay blindly.
**Prime rule when uncertain:** leave the file where it is and write down why.

---

## 0. HOW TO READ THIS BRIEF (the layer model)

Work in layers, top to bottom. **Each layer ends in a CHECKPOINT.** Do not enter the next layer until the checkpoint passes. If a checkpoint fails, stop and report — do not improvise around it.

```
Layer 0  Orient        read-only. Understand the repo. Pre-flight the working tree.
Layer 1  Perimeter     memorize the never-touch / never-delete / never-commit walls.
Layer 2  Classify      re-derive this week's inventory with the commands given.
Layer 3  Act           execute ONLY moves that pass the SAFE-TO-MOVE rule. Branch + PR. Do not merge.
Layer 4  Present        list everything that needs a human decision. Touch none of it.
Layer 5  Verify         confirm nothing broke. Run the crown-jewel integrity check.
Layer 6  Report         structured report using the template.
```

You are working on **production financial software**. Correctness and safety beat speed and tidiness every time. A boring, conservative run that moves two files correctly is a success. A clever run that touches something load-bearing is a failure, even if it looks neater.

---

## 1. WHAT YOU ARE WORKING ON (30-second orientation)

SATEX is a Windows-only Electron + React 19 + TypeScript trading terminal with a **live-capital** path via Alpaca. The **real app** lives in **`apps/satex-terminal/`** (npm package `satex-app`, v0.5.0, 458 git-tracked files). The repo was already flattened into a clean monorepo layout on 2026-07-02 (ledger P-064). **The heavy structural work is done.** Your job is periodic surface tidying, not a re-architecture.

**Ground truth you must trust over any pasted claim:** the actual filesystem and `git`. Specs, audits, and even this brief can be stale. Verify with commands; cite what you actually saw.

### MANDATORY READS before you touch anything (read, do not edit)

| File | Why |
|---|---|
| `CLAUDE.md` (root) | Orientation + env. **CROWN JEWEL — see §2.** |
| `apps/satex-terminal/CLAUDE.md` | App architecture + invariants. **CROWN JEWEL — see §2.** |
| `AGENTS.md` (root) | How to work the repo: gate bar, branch/PR flow, PSD loop, verify-don't-confabulate. |
| `.gitignore` (root) | The single source of truth for what is *intentionally* untracked. Read it fully — most root "clutter" is deliberate provenance, not mess. |
| `Vault/00-Audit/PROBLEM-LEDGER.md` | The living problem queue. Highest entry at last run was **P-115**; next free number is **P-116**. |

### CHECKPOINT 0-A
You can state, in one sentence each: (a) where the real app is, (b) why most root files are gitignored on purpose, (c) what the two crown-jewel files are. If not, re-read.

---

## 2. THE TWO CROWN JEWELS (white-glove — highest protection in the repo)

These two files get more care than anything else. **Never move, rename, reformat, reflow, or edit them during a clean.** They are read by every agent and human on session start; a truncated or mangled CLAUDE.md silently poisons every future session.

| Crown jewel | Baseline @ 2026-07-18 (verify at start of run) |
|---|---|
| `CLAUDE.md` (root) | 1178 bytes · 32 lines · first line `# CLAUDE.md` |
| `apps/satex-terminal/CLAUDE.md` | 8149 bytes · 139 lines · first line `# SATEX — App Facts` |

**Integrity check (run at Layer 0 and again at Layer 5):**
```bash
cd C:\Users\User\mc4
for f in CLAUDE.md apps/satex-terminal/CLAUDE.md; do
  echo "=== $f ==="
  wc -c "$f"; wc -l "$f"; head -1 "$f"; tail -1 "$f"
  grep -c $'\x00' "$f" && echo "!! NUL BYTES — CORRUPTION" || echo "clean: no NUL bytes"
done
```
Pass = both files exist, are non-trivially sized (root ≥ ~1 KB, app ≥ ~7 KB), start with their expected heading, end on a real non-empty line, and contain **zero** NUL bytes. If either fails, **STOP immediately, change nothing, report a suspected corruption event** (this repo has a documented file-bridge truncation class — ledger P-099 / P-107 / P-112). Do not attempt a repair as part of a clean; that is a separate operator-supervised task.

> Note: at last run both crown jewels showed as *modified/unstaged* (a routine operator doc refresh). That is expected. You still never stage, commit, revert, or edit them.

---

## 3. LAYER 0 — ORIENT & PRE-FLIGHT (read-only; zero changes)

Run these and read the output before doing anything else.

```bash
cd C:\Users\User\mc4
git status                      # branch + what's dirty
git log --oneline -8            # recent history
git branch --show-current       # confirm you are on master (or note the branch)
```

### The dirty-working-tree reality — this is the #1 hazard
The operator's tree **routinely carries uncommitted work**: refreshed anchor docs, and live Obsidian state (`Vault/00-INDEX.md`, `Vault/HOME.md`, `Vault/_dashboards/*.base`, `*.canvas`, `Vault/00-Audit/PROBLEM-LEDGER.md`, daily notes). At last run, 13 tracked files were modified-unstaged and 5 files were untracked. **This is normal. You must not "clean it up," commit it, or discard it.**

Capture the dirty set so you can reason about it:
```bash
git status --porcelain            # ' M'=modified-unstaged, '??'=untracked
git stash list                    # should usually be empty; if not, DO NOT touch stashes
```

### CHECKPOINT 0-B — decide whether Layer 3 (Act) is even eligible this run
Proceed to an **Act-eligible** run only if ALL are true:
- `git status` is legible and you understand every dirty entry (each is either operator doc-work or Obsidian/runtime state).
- No merge/rebase is in progress (`git status` shows none).
- No `.git/index.lock` or `.git/packed-refs.lock` wedge. (If one exists, note it — recovery is `rm -f .git/index.lock .git/packed-refs.lock`, or `scripts/git-unlock.ps1`; ledger P-099/P-112. Do the removal only if git is actually wedged.)
- The crown-jewel integrity check (§2) passed.

If any is false → this becomes a **Present-only run**: do Layers 1, 2, 4, 5-verify, 6. Skip Layer 3 entirely and say so in the report.

---

## 4. LAYER 1 — THE SAFETY PERIMETER (walls; do not cross)

### NEVER DELETE. NEVER `rm`. NEVER `git rm`.
Nothing gets deleted in a clean. Not caches, not build debris, not empty scratch files, not the stale directory. Deletion candidates are *presented* (Layer 4), never executed. The operator deletes.

### NEVER TOUCH (do not move, rename, edit, stage, commit, or discard)
- **The two crown jewels** (§2).
- **Root anchor docs that intentionally live at root** (precedent P-064): `AGENTS.md`, `ARCHITECTURE.md`, `CONSTITUTION.md`, `README.md`, plus `CLAUDE.md` (crown jewel). Scheduled tasks and tooling read these at root by path. They are *not* clutter.
- **Repo config/meta at root:** `.gitignore`, `.gitattributes`, `.editorconfig`, `.prettierrc.json`, `LICENSE`, `package.json`.
- **The entire `apps/satex-terminal/` interior** — source, tests, config, `CHANGELOG.md`, its own docs. Not in scope for a filesystem clean.
- **The Obsidian Vault interior** (`Vault/**`): wiki-links (`[[Vault/...]]`), Bases dashboards (`_dashboards/*.base`), and `.canvas` files resolve by path/name — moving or renaming *any* note silently breaks links and dashboards. The 2026-07-02 reorg **deliberately deferred** all Vault restructuring. You keep that deferral. Vault runtime folders (`Observer/`, `Sessions/`, `Settings/`, `Trades/`, `Tactics/`, `Brain/*`, `Backtests/*`, `Learnings/*`) are gitignored live memory — hands off.
- **Uncommitted operator state** of any kind: the modified-unstaged tracked files, the untracked `*.canvas` / `*.base`, prepared `*.bundle` / `*.bundle.lock` files. Never commit and never discard these.
- **Runtime data / "the database":** any `*.db`, `*.sqlite*`, `userData/`, `app-data/`. All gitignored, all live. Never touch. (A filesystem clean does not vacuum, move, or open databases.)
- **Trading perimeter:** you are only moving documents this run, but for the record — order/execution path, kill-switch, live-mode arming interlock, Zod IPC schemas, safeStorage keys are off-limits and require operator sign-off. Not in scope; do not wander near them.

### NEVER COMMIT TO `master`. Branch first, always.
Even a one-file move. The harness blocks direct pushes to `master`. Branch names: `chore/…`. **Stage ONLY the exact files you intend** — never `git add -A`, never `git add .`. The dirty tree makes a blanket add catastrophic.

### The gitignore reality (so you don't "tidy" provenance)
Most eye-catching root files are **intentionally kept on disk and intentionally untracked**: `*.dc.html`, `SATEX Intro (standalone).html`, `support.js`, `.thumbnail`, `Terminal intro screen rework.zip`, `Recording *.mp4`, `Screenshot *.png`, `FABLE5-IMPLEMENTATION-BRIEF.md` are **boot-intro design provenance pinned by ledger P-098** and referenced *at repo root* by that entry. Moving them breaks the provenance reference and requires a `.gitignore` rewrite. **Leave them.** `.pr-body-*.md` are gitignored PR-body scratch. `uploads/` is gitignored session media. All of this is by design.

### CHECKPOINT 1 — you can recite the three NEVER walls (delete / touch / commit-to-master) without re-reading. Proceed.

---

## 5. LAYER 2 — CLASSIFY (re-derive this week's inventory)

Do not trust Appendix A's list. Regenerate it:

```bash
cd C:\Users\User\mc4

# Everything tracked that sits directly at repo root (depth 1):
git ls-files | grep -vE '/' | sort

# Untracked but NOT ignored (the real "new stuff" to reason about):
git status --porcelain --untracked-files=all | grep '^??'

# Modified-unstaged tracked files (operator work — leave alone, just know them):
git status --porcelain | grep -E '^ ?M'

# Confirm a candidate is genuinely ignored before assuming it's provenance:
git check-ignore -v <path>
```

Sort every root-level and newly-appeared item into exactly one bucket:

| Bucket | Meaning | Action |
|---|---|---|
| **KEEP@ROOT** | Anchor docs + config + crown jewels (§4). | none |
| **LEAVE-IGNORED** | Gitignored provenance / media / scratch / runtime. | none |
| **LEAVE-OBSIDIAN** | `*.canvas`, `*.base`, Vault notes, dirty operator files. | none |
| **MOVE?** | A *tracked* file clearly misplaced (e.g. a dated runbook loose at root that belongs under `docs/`). | test with the SAFE-TO-MOVE rule (§6) |
| **PRESENT** | Stale dirs, trash, empty/zero-byte scratch, "where should this live?" untracked docs. | Layer 4 only — never act |

### CHECKPOINT 2 — every root-level and newly-appeared file is in exactly one bucket, with a one-line reason. No file is unclassified.

---

## 6. LAYER 3 — ACT (the ONLY autonomous changes; skip if not Act-eligible)

The single class of autonomous action in a weekly clean is: **`git mv` a genuinely-misplaced tracked file into its obvious `docs/` home, and update its references — but only when doing so touches nothing fragile.**

### THE SAFE-TO-MOVE RULE (all four must hold, per file)
A tracked file is safe to move **only if:**
1. It is **not** on any NEVER-TOUCH list (§4), and
2. It has a clearly-better home that **already exists** or is a plain new `docs/` subfolder (e.g. `docs/runbooks/`), and
3. **Every** reference to it (`git grep -l "<basename-without-ext>"`) lives in a tracked file that is (a) currently **clean** — no unstaged/uncommitted changes — **and** (b) **not** an anchor doc (`CLAUDE.md`/`AGENTS.md`/`ARCHITECTURE.md`/`CONSTITUTION.md`/`README.md`) **and** (c) **not** under `Vault/`, and
4. The move requires editing **no** Obsidian/runtime/`.bundle` file.

If any condition fails → **do not move it.** Downgrade it to **PRESENT** (Layer 4) with the exact reference-update plan attached, so the operator can do it deliberately.

> **Worked example from 2026-07-18 (why conservatism wins):** three dated docs sat loose at root — `2026-07-13-flagship-direction-decision.md`, `2026-07-15-ADOPTION-RUNBOOK.md`, `2026-07-16-MERGE-RUNBOOK.md`. All looked like easy `docs/` moves. But `git grep` showed `2026-07-13-flagship-direction-decision` is referenced by **`CONSTITUTION.md`** (an anchor doc) **and** `PROBLEM-LEDGER.md` (Vault + dirty), and the adoption runbook is referenced by a `Vault/Daily/` note. Every one fails condition 3. Correct outcome: **move nothing; present all three as proposals with their reference maps.** A weaker agent would have moved them and broken an anchor-doc link inside a file the operator was mid-editing.

### If (and only if) a file passes all four conditions:
```bash
cd C:\Users\User\mc4
git checkout -b chore/weekly-clean-YYYYMMDD          # never work on master
mkdir -p docs/<target-subfolder>                     # if the home is new
git mv "<old path>" "docs/<target-subfolder>/<name>" # git mv preserves history

# Update each reference — but ONLY in files that passed condition 3 (clean, non-anchor, non-Vault):
#   edit the link text surgically, one line, nothing else in the file.

# Stage ONLY what you touched — enumerate paths explicitly, never `git add -A`:
git add "docs/<target-subfolder>/<name>" "<old path>" <each-updated-reference-file>
git status                                           # CONFIRM only your intended paths are staged
git commit -m "chore: relocate <name> to docs/<subfolder>

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

Then open a PR and **STOP** — do not merge:
```bash
git push -u origin chore/weekly-clean-YYYYMMDD
gh pr create --fill --title "chore: weekly repo deep-clean YYYY-MM-DD" \
  --body "Organizational tidy. Doc-only moves. See report. Gates are CI's to prove.

Generated with Claude Code"
```
Wait for the **`Gates (typecheck, lint, knip, tests)`** check to go green (CI is the arbiter; doc-only moves pass trivially). **Hand the green PR back to the operator to merge.** Do not self-merge during a weekly clean while the operator has in-flight work — even though doc changes are not perimeter-gated.

### Guardrails specific to acting
- **Do not run `npm install` / `npm audit fix` / `npm run build`** as part of a clean. On Windows they strip ~117 cross-platform optional-dep lockfile entries CI needs and rebuild native modules that can't build here. A doc move needs none of it.
- **Do not** touch `package-lock.json`.
- Local gates aren't the arbiter for doc-only work (and `npm test` false-fails locally without the native `better-sqlite3` rebuild). CI proves it.

### CHECKPOINT 3 — either zero files moved (all downgraded to PRESENT — a valid, common outcome), or every moved file passed all four conditions, only intended paths are staged, the branch is pushed, the PR is green, and nothing is merged.

---

## 7. LAYER 4 — PRESENT (needs a human; touch nothing)

List these for the operator with a one-line rationale each. **Do not move, delete, or edit any of them.**

Typical recurring present-for-review items (verify presence this run):
- **Stale migration leftover:** `00-PROJECT-ROOT/01-SATEX-CORE/` — the pre-2026-07-02 app location. Fully untracked/gitignored; now contains only build debris (`dist/`, `out/`, `*.log`, `*.tsbuildinfo`, `test-results/`) and `node_modules`, no `package.json`. Pure leftover. **Recommend: operator deletes** (it is not in git; nothing references it). Present the path + `du -sh` size; let them pull the trigger.
- **Sandbox trash pen:** `.trash/` — gitignored holding pen (the `.gitignore` itself says "operator: `rm -rf .trash`"). Present its contents; recommend operator empties it.
- **Empty/scratch Obsidian files:** e.g. `Untitled.canvas`, `Untitled 1.canvas` (near-zero bytes) — untracked scratch. Present as "safe for operator to delete in Obsidian"; you don't delete them (they're Obsidian state).
- **Zero-byte scratch:** e.g. `.pr-body-audit-psd.md` at 0 bytes — gitignored. Present as a deletion candidate for the operator.
- **Homeless untracked docs:** e.g. a loose `PROJECT-INSTRUCTIONS.md` at root — ask the operator where it should live (root? `docs/`? Vault?) rather than guessing.
- **MOVE-downgraded files:** every file that failed the SAFE-TO-MOVE rule, with its reference map and the exact edit that would be needed.

### CHECKPOINT 4 — every PRESENT item has a path, a reason, and a recommended operator action. You executed none of them.

---

## 8. LAYER 5 — VERIFY

```bash
cd C:\Users\User\mc4
git status                       # tree state sane; only your intended changes staged/committed
git ls-files | grep -vE '/'      # anchor docs + config still at root, unmoved
```
- Re-run the **crown-jewel integrity check (§2)** — both CLAUDE.md files byte-for-byte intact (unchanged from Layer 0 baseline).
- If you moved anything: `git log --follow -- "docs/<subfolder>/<name>"` shows history survived the rename; and `git grep -n "<basename>"` shows **no** broken references remain.
- Confirm you did **not** stage or alter any modified-unstaged operator file or any Obsidian/runtime file: the count and identity of dirty files outside your intended set is **unchanged** from Layer 0.

### CHECKPOINT 5 — crown jewels intact; no unintended file touched; references (if any moved) resolve; history preserved.

---

## 9. LAYER 6 — REPORT (use this template)

```
SATEX WEEKLY DEEP-CLEAN — <YYYY-MM-DD>
Run type: [Act-eligible | Present-only]   Branch: <name or "none">   PR: <#/url or "none">

1. MOVED (autonomous, git mv):        <list, or "none — all downgraded to Present">
2. REFERENCES UPDATED:                <file:line list, or "none">
3. PRESENTED FOR OPERATOR DECISION:   <item · reason · recommended action> …
4. POTENTIAL DUPLICATES:              <…or "none found">
5. TEMPORARY / DEBRIS IDENTIFIED:     <…>
6. LEGACY MATERIAL IDENTIFIED:        <…e.g. 00-PROJECT-ROOT leftover · size · recommend delete>
7. LEFT UNTOUCHED FOR SAFETY:         <what + which rule made it unsafe>
8. CROWN-JEWEL INTEGRITY:             root CLAUDE.md <pass/fail> · app CLAUDE.md <pass/fail>
9. CROWN JEWELS / OBSIDIAN / DIRTY-TREE: confirmed unchanged (Y/N)
10. NOTES / ANOMALIES:                <locks, corruption suspicions, anything odd>
```

Keep it factual — real paths, real sizes, real command output. No scores, no "CERTIFIED," no confabulation. If you couldn't verify something, say so.

### Optional (offer, don't assume): log a PSD entry
If the operator wants this clean recorded, add one entry to `Vault/00-Audit/PROBLEM-LEDGER.md` at the **next free number (P-116 and counting)** in the house format `### P-XXX · <title> — <STATUS> (evidence)`, statuses `OPEN → DECIDED → IN-PROGRESS → SHIPPED → VERIFIED`, never deleting existing entries. **Caution:** the ledger is tracked *and* usually dirty with operator edits — only add your entry, stage only the ledger, and confirm you're not sweeping up their other changes. When in doubt, put the PSD text in your report and let the operator paste it.

---

## APPENDIX A — Snapshot from the 2026-07-18 run (worked example, NOT a script)

**KEEP@ROOT (do not move):** `CLAUDE.md`✦ `AGENTS.md` `ARCHITECTURE.md` `CONSTITUTION.md` `README.md` `LICENSE` `package.json` `.gitignore` `.gitattributes` `.editorconfig` `.prettierrc.json`  (✦ crown jewel; second crown jewel is `apps/satex-terminal/CLAUDE.md`)

**MOVE? → all downgraded to PRESENT (failed SAFE-TO-MOVE condition 3):**

| File (tracked, at root) | Referenced by | Why unsafe to auto-move |
|---|---|---|
| `2026-07-13-flagship-direction-decision.md` | `CONSTITUTION.md`, `Vault/00-Audit/PROBLEM-LEDGER.md` | anchor doc + Vault + both dirty |
| `2026-07-15-ADOPTION-RUNBOOK.md` | `2026-07-16-MERGE-RUNBOOK.md`, `Vault/Daily/2026-07-16-agent-handoff.md` | Vault reference |
| `2026-07-16-MERGE-RUNBOOK.md` | itself only | would orphan the adoption-runbook link if moved alone |

**PRESENT (never act):** `00-PROJECT-ROOT/01-SATEX-CORE/` (stale, untracked, delete candidate) · `.trash/` contents · `Untitled.canvas` + `Untitled 1.canvas` (empty scratch) · `.pr-body-audit-psd.md` (0 bytes) · `PROJECT-INSTRUCTIONS.md` (untracked, homeless — ask).

**LEAVE-IGNORED (provenance/media/scratch — by design):** `*.dc.html`, `SATEX Intro (standalone).html`, `support.js`, `.thumbnail`, `Terminal intro screen rework.zip`, `Recording *.mp4`, `Screenshot *.png`, `FABLE5-IMPLEMENTATION-BRIEF.md`, `.pr-body-*.md`, `uploads/`, `Untitled.base`.

**LEAVE-OBSIDIAN / DIRTY:** `SATEX-COCKPIT.canvas`; the 13 modified-unstaged tracked files (anchor-doc refresh + `Vault/*` state + `apps/satex-terminal/{CHANGELOG,CLAUDE,README}.md` + `docs/policy/…`); untracked `Vault/Daily/2026-07-18-work-layer.md`.

**Net recommended autonomous action that week: none.** Correct, safe, and reported as such.

## APPENDIX B — Keeping this brief honest over time

- When the crown-jewel files legitimately change size (operator edits their content), **update the §2 baseline** in your report so next week's check compares against reality, not a stale number.
- When the operator merges the stale-directory deletion or empties `.trash/`, those items drop off the PRESENT list naturally — re-derive, don't assume.
- The SAFE-TO-MOVE rule is the durable core. Filenames rotate; the rule doesn't. On a week when the tree is clean and a misplaced doc's only references live in clean, non-anchor, non-Vault files, Track A will actually fire. Most weeks it won't, and that's fine.

---
*Brief prepared 2026-07-18 from a live inspection of `C:\Users\User\mc4` (git state, .gitignore, Vault, ledger P-115, and the reference graph of the loose root docs). Grounded in the repo's own precedents: P-064 monorepo flatten, P-098 intro provenance, P-099/P-107/P-112 corruption class, AGENTS.md branch/PR/PSD discipline.*
