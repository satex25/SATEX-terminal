#!/usr/bin/env bash
# scripts/git-unlock.sh — remove STALE git lock files so they can never block a
# git operation again.
#
# Safe by construction:
#   * refuses to act while a git process is live (a lock then may be a REAL,
#     in-flight mutex — removing it could corrupt the index);
#   * always exits 0, so it is safe to wire as a Claude Code PreToolUse hook
#     (it can never block the tool call it precedes);
#   * fast path: when no lock exists it returns in microseconds (a handful of
#     stat() calls — it never walks .git/objects).
#
# Root cause it recovers from (verified on this machine): on Windows, git
# creates a *.lock for every index/ref/gc write and unlink()s it microseconds
# later. Windows Defender's real-time scanner and the Search indexer can hold a
# handle on that exact .lock at the instant git tries to delete it, so the
# unlink fails (EPERM) and git leaves the lock behind. A killed/timed-out git
# command leaves one the same way. The DURABLE prevention is excluding .git from
# both scanners — see scripts/README-git-locks.md and
# scripts/exclude-git-from-scanners.ps1. This script is the recovery net for
# anything that still slips through.
#
# Usage:
#   bash scripts/git-unlock.sh            # clean the repo this script lives in
#   bash scripts/git-unlock.sh /path/repo # clean a specific repo
set -u

repo="${1:-}"
if [ -z "$repo" ]; then
  repo="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel 2>/dev/null || pwd)"
fi
gitdir="$repo/.git"
# Worktree / submodule: .git may be a file "gitdir: <path>".
if [ -f "$gitdir" ]; then
  gitdir="$(sed -n 's/^gitdir: //p' "$gitdir" 2>/dev/null)"
fi
[ -d "$gitdir" ] || exit 0

# Known top-level lock files git leaves when interrupted mid-write.
top_locks=(
  "$gitdir/index.lock"
  "$gitdir/HEAD.lock"
  "$gitdir/config.lock"
  "$gitdir/packed-refs.lock"
  "$gitdir/shallow.lock"
  "$gitdir/objects/maintenance.lock"
)

# --- fast path: anything to clean? (targeted; never recurses into objects/) ---
have_lock=0
for f in "${top_locks[@]}"; do
  [ -e "$f" ] && have_lock=1 && break
done
if [ "$have_lock" -eq 0 ] && [ -d "$gitdir/refs" ]; then
  if find "$gitdir/refs" -name '*.lock' -type f -print -quit 2>/dev/null | grep -q .; then
    have_lock=1
  fi
fi
[ "$have_lock" -eq 0 ] && exit 0

# --- safety gate: never remove a lock while git itself is running ---
if command -v tasklist >/dev/null 2>&1; then
  if tasklist //FI "IMAGENAME eq git.exe" 2>/dev/null | grep -qi 'git\.exe'; then exit 0; fi
elif command -v pgrep >/dev/null 2>&1; then
  if pgrep -x git >/dev/null 2>&1; then exit 0; fi
fi

# --- remove stale locks (best effort; never fail the caller) ---
for f in "${top_locks[@]}"; do
  [ -e "$f" ] && rm -f "$f" 2>/dev/null && echo "git-unlock: removed ${f#"$repo"/}"
done
if [ -d "$gitdir/refs" ]; then
  while IFS= read -r f; do
    [ -n "$f" ] && rm -f "$f" 2>/dev/null && echo "git-unlock: removed ${f#"$repo"/}"
  done < <(find "$gitdir/refs" -name '*.lock' -type f 2>/dev/null)
fi

exit 0
