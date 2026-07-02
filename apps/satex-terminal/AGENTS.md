# AGENTS — SATEX Operational Runbook

**How to work on SATEX.** This document is the operational spec for any agent (human or AI) contributing to this repository. It covers the four gates, branch→PR flow, and trading-safety guarantees.

**Architecture facts live in** `CLAUDE.md`. **Release history lives in** `CHANGELOG.md`. **This file** owns the development workflow.

---

## The Four Gates

Nothing commits or merges without **all four passing**. These gates run locally (pre-commit) and on CI (every push/PR).

| Gate | Command | What Fails | Exit on Failure |
|---|---|---|---|
| **Types** | `npm run typecheck` | TypeScript type errors (tsc on tsconfig.node.json + tsconfig.web.json, --noEmit) | 0 = pass, 1+ = fail |
| **Lint** | `npm run lint` | ESLint violations (eslint src tests) | 0 = pass, 1+ = fail |
| **Tests** | `npm test` | Vitest unit test failures (vitest run, all suites) | 0 = pass, 1+ = fail |
| **Dead Code** | `npm run knip` | Unused files, exports, dependencies (knip) | 0 = pass, 1+ = fail |

### Before Pushing

```bash
# Run locally in this order (pre-commit hook enforces typecheck + lint)
npm run typecheck   # must exit 0
npm run lint        # must exit 0
npm test            # must exit 0
npm run knip        # must exit 0
```

**Report real results.** Never assert gate status — measure it. CI on Ubuntu Node 20.19 runs all four; if you see a different environment, surface that.

---

## Branch → PR Flow

### Branch Rules

- **Branch name format**: `<category>/<issue>-<slug>` (e.g., `feat/P-013-vault-writer` or `fix/S1-8-license`)
- **Only branch from `master`**: `git checkout -b feat/P-013-vault-writer origin/master`
- **Commits before a push**: squash or curate into logical units. CI will see the full commit history.

### Before Opening a PR

1. **All four gates pass locally** (typecheck, lint, test, knip)
2. **Git status clean** (working tree unmodified, except .gitignore exceptions; see CLAUDE.md)
3. **Commit message is clear**: describe the *what* and *why*, not the implementation detail
4. **No debug code or commented-out lines** (except obvious TODOs with issue references)

### Opening the PR

- Use `gh pr create --title "<imperative title>" --body "<description>"` or the GitHub UI
- Link the issue in the body: `Resolves #<issue>` or `Addresses #<issue>`
- **Never force-push to a PR branch** once it's opened — CI + review state will drift

### Review & Merge

- **Minimum one approval** (human review for safety-critical code: engine, broker, IPC, risk gates)
- **CI must pass** on the latest commit
- **No merge conflicts** — rebase if needed: `git rebase origin/master` (never merge master into your branch)
- **Squash-on-merge** is the default — one clean commit lands on master

---

## Trading-Safety Guardrails

SATEX executes real trades on live capital (Alpaca paper account during dev, live later). Safety is non-negotiable.

### Immutable Contracts

- **Order execution only via `AlpacaBrokerSession`** — never call `this.alpaca.submitOrder` directly from trading-engine
- **Risk gates cannot be overridden** — `RISK-AGENT` veto is final (see SATEX Constitution in project instructions)
- **Position size ≤ 1% of session equity per trade** — hard-coded, not configurable
- **Max daily loss ≤ 2% of session equity** — auto-halt trading if breached
- **All IPC payloads Zod-validated** — strict schemas, no loose JSON
- **API keys in `safeStorage` only** — never plaintext in logs, localStorage, or code

### Code Review Checklist for Trading Logic

When reviewing engine, broker, or order code:

- [ ] Does the code touch order submission? Must route through `AlpacaBrokerSession`
- [ ] Does it access account state? Must go through `AccountSyncer`, not raw API
- [ ] Does it calculate position size? Must enforce ≤ 1% capital rule
- [ ] Does it log data? API keys, session tokens, credentials must NOT appear
- [ ] Does it hold state? Must clean up on unmount (timers, observers, streams)
- [ ] Does it call the broker? Disconnection + reconnection must not lose order state

### Testing for Safety

- Unit tests cover nominal path (trade entry / exit, position sizing)
- Integration tests cover failure modes (API down, network latency, stale data)
- No mocks of the broker session (use real dependency injection)
- Verify that rejected trades don't corrupt order state

---

## Local Development Workflow

### Setup

```bash
cd apps/satex-terminal

# Install dependencies
npm install

# Build for development
npm run dev
```

### Dev Loop

```bash
# Terminal 1: Electron dev server (hot reload)
npm run dev

# Terminal 2: Run tests in watch mode (if iterating on logic)
npm test -- --watch

# Terminal 3: Lint in watch mode (optional, pre-commit does this)
npm run lint  # run once or watch via editor integration
```

### Building for Release

```bash
# Full build (Windows signed installer)
npm run pack:win

# Verify the build
signtool verify /pa /v "dist/SATEX Setup 0.5.0.exe"

# Full release procedure: see docs/release-checklists/release-procedure.md
```

---

## Known Invariants (Do Not Break)

1. **State is Zustand, never Redux** — no direct cross-store coupling
2. **Broker abstraction is sacred** — new brokers implement the four facets (OrderRouter, MarketDataSource, AccountSyncer, SymbolResolver)
3. **Equity read from session, not constants** — risk gates use live starting equity
4. **SIM / SUB badges from canonical gates only** — `isSyntheticFeed` and `showSub` are single sources of truth
5. **Sub-second aggregator fed only from `alpaca.onTick`** — no other data path
6. **No macOS build target. Ever.**

See `CLAUDE.md` **Load-bearing invariants** section for the full list + rationale.

---

## Troubleshooting

### "All four gates must pass before commit"

**Pre-commit hook is running.** Run locally first:

```bash
npm run typecheck && npm run lint
# Fix issues, stage, try git commit again
```

### "CI failed on main but passes locally"

**Likely causes:**

- Node version mismatch (CI uses 20.19, check `engines.node` in package.json)
- Platform-specific path issues (Windows vs Linux)
- Timing-sensitive test (race condition in async code)

**Debug:**

```bash
node --version  # should be 20.19.x
npm test -- --reporter=verbose
npm run knip 2>&1 | grep -i "not used"
```

### "I modified a file and the tests changed unexpectedly"

**Likely:** a side effect from a timer or observer.

**Fix:** search the file for `setInterval`, `setTimeout`, `addEventListener`, `ResizeObserver`. Ensure all are cleaned up in a `useEffect` cleanup or class destructor:

```typescript
useEffect(() => {
  const timer = setInterval(...);
  return () => clearInterval(timer);  // <-- cleanup
}, []);
```

---

## When to File an Issue vs. a PR

| Scenario | Action |
|----------|--------|
| Bug in production (v0.4.4+) | File issue with steps to reproduce + error screenshot |
| Feature request with clear scope | File issue with acceptance criteria |
| Experimental idea (pre-architecture) | Chat first (Slack/Discord); PR only after design approval |
| Typo or small doc fix | PR directly (no issue needed) |
| Refactoring across multiple files | File issue with design brief first; then PR once scoped |

---

## Reporting Bugs

Include:

1. **Steps to reproduce** (exact clicks, market state, broker state)
2. **Expected outcome** (what should happen)
3. **Actual outcome** (what actually happened)
4. **Environment** (OS, Node version, branch/commit)
5. **Logs** (copy relevant lines from console or `.electron-logs/`)
6. **Screenshot** (if visual; if error, paste the full stack trace)

---

## Questions?

- **Architecture**: See `CLAUDE.md`
- **What changed**: See `CHANGELOG.md`
- **How to release**: See `docs/release-checklists/release-procedure.md`
- **Design decisions**: See `docs/design/` and `docs/superpowers/specs/`

---

**Last updated:** 2026-06-12 | **Version:** 1.0 | **License:** MIT
