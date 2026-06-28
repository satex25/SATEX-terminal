---
name: gates
description: Run all four SATEX gates (typecheck → lint → test → knip) from satex-app/ and report real exit codes and counts. Use before any commit, merge, or to verify a clean baseline.
---

Run all four gates in sequence from `00-PROJECT-ROOT/01-SATEX-CORE/satex-app/`. Report the real exit code and output from each:

1. `npm run typecheck` — report exit code
2. `npm run lint` — report exit code and warning count
3. `npm test` — report exit code, suite count, and passing/failing counts
4. `npm run knip` — report exit code

If any gate fails, stop and show the actual error output. Never assert a gate passed — only report what the tool actually returned.
