# AGENTS.md — Working on SATEX

Guidance for AI agents (Claude Code, Codex, etc.) and humans doing maintenance on
the **SATEX** trading terminal. Read this before touching the repo. App-specific
facts live in `apps/satex-terminal/CLAUDE.md` — this file is
about *how to work*, that one is about *what the app is*.

## What SATEX is

Windows-only Electron + React 18 + TypeScript trading terminal (TradingView
Lightweight Charts v5, **Zustand**, better-sqlite3). It has a **live-capital
trading path** via Alpaca. Treat it as production financial software, not a toy.

## Repo map

- **System map:** `ARCHITECTURE.md` (workspace + runtime + learning loop — keep it current)
- **App (THE app, nested):** `apps/satex-terminal/`
- **CI:** `.github/workflows/ci.yml`
- **Vault (Obsidian, runtime data — untracked by design):** `Vault/` — incl.
  `Backtests/` (nightly self-eval + baselines) and `Learnings/` (capped session notes)
- **Reference dumps (gitignored):** `90-REFERENCE/`
- **Default branch:** `master` · **Remote:** github.com/satex25/SATEX-terminal (renamed from `satex-trading`, 2026-07)

## The gate bar — all four must be green

Run from `apps/satex-terminal/`:

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
- Open a PR → let CI go green → `gh pr merge <n> --rebase` (or `--squash`; **merge
  commits are banned** by the ruleset's linear-history rule) → verify the head SHA is
  an ancestor of `master` → sync local (`git checkout master && git pull --ff-only`).
- `master` is protected by the GitHub ruleset **`main-protection`** (realigned
  2026-07-10 — ledger P-095): PR required, required check
  `Gates (typecheck, lint, knip, tests)`, linear history, force-push + deletion
  blocks, empty bypass list. The server enforces the floor; the discipline above
  stays load-bearing for everything the ruleset can't see.

## Agent operating constitution

`docs/policy/rule-VS.md` — the full INFRASTRUCTURE MANDATE. Read it before executing
any non-trivial change. The key invariants are summarised in the sections below.

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
- Equity + account WS lifecycle goes through **`AlpacaBrokerSession.connect()`
  / `.disconnect()`** at the three engine construction call-sites (cold boot,
  data-feed switch, reconnect), not bare `market.start()` / per-stream
  disconnect calls. F.1 (2026-06-02). New broker concretes (Rithmic /
  Tradovate) should implement the `@shared/broker/` interfaces and slot in
  via the same shape. Crypto WS is still engine-owned (not part of the
  session today).
- Clean up what you create: disconnect observers, clear timers, cancel in-flight
  async on unmount (a real `ResizeObserver` leak shipped once — see PR #6).

## The PSD loop — continuous problem → solution → decision (MANDATORY, 2026-06-10)

Operator directive: green gates are the FLOOR, not the goal. A passing typecheck
does not mean the operator is looking at a world-class quant terminal. Every agent
session runs this loop:

1. **Boot:** read `Vault/00-Audit/PROBLEM-LEDGER.md` — the living problem queue.
   Pick up DECIDED/IN-PROGRESS entries before inventing new work.
2. **PSD every problem** (the `/problem-solution-decision` skill is the template):
   evidenced PROBLEM (file:line or repro) → **≥2 candidate SOLUTIONS with
   trade-offs** → DECISION with rationale. No solution ships undecided.
3. **Mid-task findings enter the ledger immediately.** An unrecorded problem is a
   lost problem. Never delete entries — solved ones sink to §Closed with evidence.
4. **Close:** update statuses (OPEN → DECIDED → IN-PROGRESS → SHIPPED → VERIFIED),
   stamp commits/PRs, and leave the next agent a runnable starting point.
5. **The bar after gates pass:** does this change make a live trading session
   calmer, faster, more legible? Features are tools for the operator's mind —
   ease-at-the-open is the product. Review, revise, re-review before handing off.

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
6. **If merging:** branch → PR → CI green → `gh pr merge --rebase` → verify SHA in master → sync.

## Pre-commit (strict, local)

`.husky/pre-commit` runs `npm run typecheck` + `npm run lint` in `satex-app` and
**blocks the commit** on failure. One-time per clone (hooks live outside `.git`):

```
git config core.hooksPath .husky
```

Heavier checks (full vitest + knip) run in CI on every PR. If the hook ever blocks
a legitimate WIP commit, fix the lint/type error — don't `--no-verify`.
