#!/usr/bin/env bash
# update-baseline.sh — refresh the ARCHITECTURE.md §4 "Baseline" line in one command.
#
# Quick (you already know the numbers):
#   scripts/update-baseline.sh 98 1268
# Auto (compute counts by running the vitest gate, sharded 4x):
#   scripts/update-baseline.sh
#
# Idempotent: replaces the single line starting with "Baseline " in ARCHITECTURE.md.
# Leaves the change UNSTAGED (per AGENTS.md — operator commits).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARCH="$ROOT/ARCHITECTURE.md"
APP="$ROOT/00-PROJECT-ROOT/01-SATEX-CORE/satex-app"

FILES="${1:-}"; TESTS="${2:-}"

if [[ -z "$FILES" || -z "$TESTS" ]]; then
  echo "Computing counts via vitest (sharded 4x)…" >&2
  FILES=0; TESTS=0
  for k in 1 2 3 4; do
    out="$(cd "$APP" && npx vitest run --shard="$k/4" 2>/dev/null | grep -E 'Test Files|Tests ')"
    f=$(echo "$out" | grep 'Test Files' | grep -oE '[0-9]+ passed' | grep -oE '[0-9]+')
    t=$(echo "$out" | grep -E '^\s*Tests ' | grep -oE '[0-9]+ passed' | grep -oE '[0-9]+')
    FILES=$((FILES + ${f:-0})); TESTS=$((TESTS + ${t:-0}))
  done
fi

DATE="$(date +%Y-%m-%d)"
BRANCH="$(git -C "$ROOT" branch --show-current)"
SHA="$(git -C "$ROOT" rev-parse --short HEAD)"

python3 - "$ARCH" "$DATE" "$FILES" "$TESTS" "$BRANCH" "$SHA" <<'PY'
import sys, re
arch, date, files, tests, branch, sha = sys.argv[1:7]
d = open(arch, encoding='utf-8').read()
line = (f"Baseline {date}: **{tests} tests / {files} files**, all four gates green on "
        f"`{branch}` @ {sha} + edits (working tree; jsdom — see P-019). "
        f"<!-- refresh: scripts/update-baseline.sh -->")
new, n = re.subn(r'(?m)^Baseline .*$', line, d, count=1)
assert n == 1, f"expected exactly one 'Baseline ' line, found {n}"
open(arch, 'w', encoding='utf-8').write(new)
print(line)
PY
echo "Updated $ARCH (UNSTAGED — review with: git -C \"$ROOT\" diff ARCHITECTURE.md)" >&2
