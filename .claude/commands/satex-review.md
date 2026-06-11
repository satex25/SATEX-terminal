---
description: Grounded review of the current branch/PR against SATEX's gate bar + trading-safety guardrails
---

Run the **Grounded Review routine** (defined in `AGENTS.md`) on $ARGUMENTS
(default: the current branch's diff vs `master`).

1. Run all four gates from `00-PROJECT-ROOT/01-SATEX-CORE/satex-app/`
   (`npm run typecheck`, `npm run lint`, `npm test`, `npm run knip`) and record
   the REAL results — exit codes and test counts, not assertions.
2. Read the actual diff. Verify every claim against the code, citing `file:line`.
   Do NOT trust pasted specs/audits — verify against the filesystem first.
3. Trading-safety blast radius: if it touches `OrderManager`, `risk-gates`, the
   kill-switch, or the live-mode / MAY-TACTICS interlocks → STOP, flag it, and
   require explicit human sign-off.
4. Hunt real defects: races, leaks (undisconnected observers / timers / listeners),
   unsafe casts, unguarded IPC, swallowed errors.
5. Produce an evidence-backed verdict: what's verified true, what's unverified,
   what's wrong. No theatrical scores or "CERTIFIED" stamps.
6. If merging: branch → PR → CI green → `gh pr merge` → verify the SHA is in
   `master` → sync local.
