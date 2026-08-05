#!/usr/bin/env bash
# check-baseline.sh — fail when ARCHITECTURE.md's §4 Baseline counts have drifted
# from what vitest actually observes.
#
#   scripts/check-baseline.sh <vitest-report.json>
#
# The report is vitest's JSON reporter output. CI's "Vitest unit suite" step already
# runs the suite, so it emits the report there and this step only reads it — the
# suite is never run twice.
#
# Run locally without an argument and it will run the suite itself to produce one.
#
# Ledger P-158. Rationale: the baseline is a claim about the repo, and AGENTS.md's
# standing rule is "report real results — never assert them". A hand-maintained
# number drifts silently (it sat 10 days stale before 27aa7dc caught it by eye).
# Hard-failing costs one command on any PR that changes the test count.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="$ROOT/apps/satex-terminal"
REPORT="${1:-}"

if [[ -z "$REPORT" ]]; then
  REPORT="$(mktemp -t vitest-report-XXXXXX.json)"
  echo "[check-baseline] no report given — running the suite to produce one…" >&2
  (cd "$APP" && npx vitest run --reporter=json --outputFile="$REPORT" >/dev/null 2>&1) || true
fi

if [[ ! -f "$REPORT" ]]; then
  echo "✗ check-baseline: vitest report not found at $REPORT" >&2
  echo "  the suite must run before this check — see the CI 'Vitest unit suite' step" >&2
  exit 2
fi

read -r ACTUAL_TESTS ACTUAL_FILES <<<"$(node "$ROOT/scripts/baseline.mjs" count "$REPORT")"
read -r RECORDED_TESTS RECORDED_FILES <<<"$(node "$ROOT/scripts/baseline.mjs" read)"

if [[ "$ACTUAL_TESTS" == "$RECORDED_TESTS" && "$ACTUAL_FILES" == "$RECORDED_FILES" ]]; then
  echo "✓ baseline is current: ${ACTUAL_TESTS} tests / ${ACTUAL_FILES} files"
  exit 0
fi

cat >&2 <<EOF
✗ ARCHITECTURE.md baseline is stale
    recorded: ${RECORDED_TESTS} tests / ${RECORDED_FILES} files
    actual:   ${ACTUAL_TESTS} tests / ${ACTUAL_FILES} files
  fix: scripts/update-baseline.sh ${ACTUAL_FILES} ${ACTUAL_TESTS}
       (arg order is <files> <tests>; then commit ARCHITECTURE.md with your change)
EOF
exit 1
