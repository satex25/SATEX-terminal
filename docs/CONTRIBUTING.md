# Contributing

SATEX is production financial software with a live-capital path. The bar is
correspondingly high. `AGENTS.md` (root) is the canonical how-to-work document;
this file is the short version for humans.

## The gate bar

All four gates must pass before anything commits or merges. Run from
`apps/satex-terminal/`:

| Gate | Command |
|---|---|
| Types | `npm run typecheck` |
| Lint | `npm run lint` |
| Tests | `npm test` |
| Dead code | `npm run knip` |

Report **real** results (exit codes, counts) in every PR description — never
assert them.

## Branch → PR → merge

- Never commit directly to `master` — branch first, even for a one-liner.
  There is no server-side branch protection; the discipline is manual and
  load-bearing.
- Branch names: `feat/…` · `fix/…` · `chore/…` · `release/…`
- Conventional-commit messages. AI agents append their model trailer
  (`Co-Authored-By: <Model Name> <noreply@…>`).
- Flow: open PR → CI green → merge → verify the head SHA is an ancestor of
  master → sync local.

## Trading-safety perimeter (hard walls)

The following are off-limits without an explicit human in the loop and PR
sign-off: the order/execution path (`services/execution/`), risk gates
(`services/risk/`), the kill switch, the live-mode arming interlock, and the
MAY-TACTICS graduation interlock. If your change touches these, stop and get
sign-off first.

## Style

- TypeScript strict; ESLint flat config (`apps/satex-terminal/eslint.config.mjs`)
- State is Zustand, not Redux
- IPC payloads stay Zod-validated `.strict()`
- Clean up what you create: disconnect observers, clear timers, cancel
  in-flight async on unmount
- Every defect or open question goes to `Vault/00-Audit/PROBLEM-LEDGER.md`
  the moment it is seen
