# Killing stale `.git/*.lock` files for good (Windows)

If you keep hitting `fatal: Unable to create '.../.git/index.lock': File exists`
(or the same for `packed-refs.lock`, a `refs/**/*.lock`, or
`objects/maintenance.lock`), this is the complete, permanent fix. It has two
layers because the problem has two causes.

## Why it happens (root cause)

Git creates a `*.lock` file for **every** write to the index, a ref, or during
gc/maintenance, then `unlink()`s it microseconds later. On Windows two things
can hold a handle on that exact `.lock` file at the instant git tries to delete
it, so the delete fails (`EPERM`) and **git leaves the lock behind**:

1. **Windows Defender** real-time scanning (`MsMpEng.exe`) scanning `.git`.
2. The **Windows Search indexer** indexing `.git`.

A killed / timed-out git command (e.g. an agent run that was interrupted
mid-commit) leaves a lock the same way. A leftover lock then **blocks the next
git write** until it is removed. It is always safe to delete a lock *when no git
process is running* — a 0-byte lock with no owning process is stale by
definition.

## Layer 1 — Prevent them (run ONCE, as administrator)

Stops the scanners from racing git, so stale locks stop being **created**.
Requires admin (Defender exclusions need elevation).

**Open PowerShell as administrator** (Start → type "PowerShell" → *Run as
administrator*), then:

```powershell
powershell -ExecutionPolicy Bypass -File C:\Users\User\mc4\scripts\exclude-git-from-scanners.ps1
```

That script:
- adds the repo, its `.git`, and `git.exe` to Defender's exclusion list;
- marks `.git` "not content indexed" so Windows Search skips it.

It is idempotent — re-running is harmless. You only need to do this once per
machine (re-run if you move/clone the repo elsewhere).

## Layer 2 — Auto-recover (already wired, no action needed)

Even with Layer 1, an interrupted git command can still leave a lock. So a
Claude Code hook clears any stale lock **before every Bash command and at
session start**, guarded so it never touches a lock while git is actually
running. Config lives in `.claude/settings.json` (`PreToolUse` + `SessionStart`
→ `scripts/git-unlock.sh`). From the workflow's side, stale locks simply never
block you again. Review/disable it anytime via the `/hooks` menu.

## Manual recovery (if you ever need it by hand)

```bash
bash scripts/git-unlock.sh          # Git Bash — same script the hook runs
```
```powershell
powershell -ExecutionPolicy Bypass -File scripts\git-unlock.ps1   # PowerShell
```

Both refuse to act while a `git.exe` process is live, so they can never remove a
live lock.

## Verify Layer 1 took (optional, in an elevated shell)

```powershell
(Get-MpPreference).ExclusionPath      # should list the repo + .git
```
