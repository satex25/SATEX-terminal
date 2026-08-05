#!/usr/bin/env bash
# update-baseline.sh — refresh the ARCHITECTURE.md §4 "Baseline" line in one command.
#
# Quick (you already know the numbers):
#   scripts/update-baseline.sh 175 2238        # <files> <tests>
# Auto (compute counts by running the vitest gate):
#   scripts/update-baseline.sh
#
# Idempotent: replaces the single line starting with "Baseline " in ARCHITECTURE.md.
# Leaves the change UNSTAGED (per AGENTS.md — operator commits).
#
# The line's format lives in scripts/baseline.mjs, shared with check-baseline.sh so
# the writer and the CI checker cannot disagree (P-158).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="$ROOT/apps/satex-terminal"

FILES="${1:-}"; TESTS="${2:-}"

if [[ -z "$FILES" || -z "$TESTS" ]]; then
  # One unsharded run with the JSON reporter. The previous version sharded 4x and
  # scraped the human-readable summary, which depended on text vitest is free to
  # reformat; the JSON report is a stable contract and needs no summing.
  echo "Computing counts via vitest…" >&2
  REPORT="$(mktemp -t vitest-report-XXXXXX.json)"
  (cd "$APP" && npx vitest run --reporter=json --outputFile="$REPORT" >/dev/null 2>&1) || true
  if [[ ! -s "$REPORT" ]]; then
    echo "update-baseline.sh: vitest produced no report — run the suite manually and pass counts" >&2
    exit 2
  fi
  read -r TESTS FILES <<<"$(node "$ROOT/scripts/baseline.mjs" count "$REPORT")"
  rm -f "$REPORT"
fi

node "$ROOT/scripts/baseline.mjs" write "$TESTS" "$FILES"
echo "Updated $ROOT/ARCHITECTURE.md (UNSTAGED — review with: git -C \"$ROOT\" diff ARCHITECTURE.md)" >&2
