# AGENTS.md — Working on SATEX

Guidance for AI agents (Claude Code, Codex, etc.) and humans doing maintenance on
the **SATEX** trading terminal. Read this before touching the repo. App-specific
facts live in `00-PROJECT-ROOT/01-SATEX-CORE/satex-app/CLAUDE.md` — this file is
about *how to work*, that one is about *what the app is*.

## What SATEX is

Windows-only Electron + React 18 + TypeScript trading terminal (TradingView
Lightweight Charts v5, **Zustand**, better-sqlite3). It has a **live-capital
trading path** via Alpaca. Treat it as production financial software, not a toy.

## Repo map

- **App (THE app, nested):** `00-PROJECT-ROOT/01-SATEX-CORE/satex-app/`
- **CI:** `.github/workflows/ci.yml`
- **Vault (Obsidian, runtime data — untracked by design):** `Vault/`
- **Default branch:** `master` · **Remote:** github.com/satex25/satex-trading

## The gate bar — all four must be green

Run from `00-PROJECT-ROOT/01-SATEX-CORE/satex-app/`:

| Gate | Command |
|---|---|
| Types | `npm run typecheck` |
| Lint | `npm run lint` |
| Tests | `npm test` (vitest) |
| Dead code | `npm run knip` |

Nothing commits or merges unless **all four** pass. CI enforces all four on every
push/PR (see `ci.yml`); a strict local pre-commit runs typecheck + lint (below).
Report **real** results — exit codes, test counts — never assert them.

## Branch → PR → merge flow

- **Never commit or push directly to `master`** — branch first, even for a one-liner.
- Branch names: `feat/…`, `fix/…`, `chore/…`, `release/…`.
- Conventional-commit messages; end with
  `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>` (or the acting model).
- Open a PR → let CI go green → `gh pr merge <n> --merge` → verify the head SHA is
  an ancestor of `master` → sync local (`git checkout master && git pull --ff-only`).
- `master` is a **free-tier private repo → no branch protection exists**, so this
  discipline is manual and load-bearing. Do not rely on the server to stop you.

## TRADING-SAFETY GUARDRAILS — hard; do not cross without explicit human approval

SATEX moves real money in live mode. These are **off-limits to autonomous change**:

- The order/execution path: `OrderManager`, `risk-gates`, Alpaca order submission.
- The **kill-switch** — never bypass the atomic `writeJsonAtomic` write contract.
- The live-mode arming interlock (typed-phrase native dialog) and the MAY-TACTICS
  graduation interlock. These are risk controls, not UI.
- **Autonomous financial execution is forbidden** — an agent must never place,
  cancel, or modify a real order.
- IPC payloads stay **Zod-validated**; API keys stay in **safeStorage** (never
  plaintext in `userData` or logs).
- **No macOS build target. Ever.**

Touching any of the above requires a human in the loop and explicit PR sign-off.

## Load-bearing invariants (partial — full set in app `CLAUDE.md` + git history)

- State is **Zustand, not Redux.** No direct cross-store coupling; go through stores/IPC.
- Don't reintroduce a `STARTING_EQUITY` symbol — it's `DEFAULT_EQUITY`; risk gates
  read the live session-start equity, not a constant.
- Don't render SIM/SUB badges from inline logic — use the canonical gates
  (`isSyntheticFeed`, `showSub`).
- Don't feed the sub-second aggregator from any path but `alpaca.onTick`.
- Clean up what you create: disconnect observers, clear timers, cancel in-flight
  async on unmount (a real `ResizeObserver` leak shipped once — see PR #6).

## Verify, don't confabulate

- Verify every claim against the actual code; cite `file:line`.
- **Do not trust pasted specs / audits / plans at face value.** They are frequently
  AI-generated and wrong about this repo — wrong framework (Redux vs Zustand),
  nonexistent files/scripts (`VERSION`, `pack:win:unsigned`), deprecated tools
  (`vm2`), invented metrics. A pasted "audit" once claimed `React.memo`, generics,
  and a `VERSION` file that do not exist. Check the filesystem and code first.
- **Measure, don't assert** — bundle sizes, latencies, and test counts come from
  running the thing, not from a confident sentence.

## Grounded Review routine

When asked to review a change / PR / branch:

1. **Run all four gates.** Record real results (counts, exit codes).
2. **Read the actual diff.** Verify each claim against code (`file:line`).
3. **Trading-safety blast radius:** does it touch the live-capital path, kill-switch,
   or interlocks? If yes → stop, flag, require human sign-off.
4. **Hunt real defects:** races, leaks (undisconnected observers/listeners/timers),
   unsafe casts, unguarded IPC, error-swallowing.
5. **Evidence-backed verdict:** what's verified true, what's unverified, what's wrong.
   No theatrical scores or "CERTIFIED" stamps.
6. **If merging:** branch → PR → CI green → `gh pr merge` → verify SHA in master → sync.

## Pre-commit (strict, local)

`.husky/pre-commit` runs `npm run typecheck` + `npm run lint` in `satex-app` and
**blocks the commit** on failure. One-time per clone (hooks live outside `.git`):

```
git config core.hooksPath .husky
```

Heavier checks (full vitest + knip) run in CI on every PR. If the hook ever blocks
a legitimate WIP commit, fix the lint/type error — don't `--no-verify`.
