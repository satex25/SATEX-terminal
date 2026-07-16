# Getting started

First-time setup for a fresh clone of the SATEX monorepo.

## Prerequisites

- **Windows** (the app is Windows-only; no macOS build target, ever)
- **Node ≥ 20.19** (CI pins 20.19)
- Git

## One-time per clone

```
git config core.hooksPath .husky
cd apps/satex-terminal
npm install
```

`postinstall` runs `electron-builder install-app-deps`, which rebuilds
`better-sqlite3` against the Electron ABI.

## Run the app

```
cd apps/satex-terminal
npm run dev          # electron-vite dev mode
```

## Run the gates

All four must pass before any commit or merge (the pre-commit hook enforces
typecheck + lint; CI enforces all four):

```
cd apps/satex-terminal
npm run typecheck && npm run lint && npm test && npm run knip
```

## Environment variables

| Var | Purpose |
|---|---|
| `SATEX_VAULT_ROOT` | Override vault root (needed for packaged installs; auto-discovered in dev via the `.obsidian/` marker walk-up) |
| `SATEX_HW_ACCEL=1` | Enable GPU hardware acceleration (opt-in) |
| `SATEX_SIMULATOR_24_7` | Inert since 2026-07-16 (P-111) — the simulator now streams 24/7 for every asset class by default; setting it is a harmless no-op |

Alpaca credentials are configured in-app and stored in Electron `safeStorage` —
never in env files.

## Where to read next

1. `CONSTITUTION.md` — behavior + boundaries (root)
2. `AGENTS.md` — how to work: gates, branch flow, guardrails (root)
3. `ARCHITECTURE.md` — the one-page system map (root)
4. `apps/satex-terminal/CLAUDE.md` — app invariants + contracts
5. `Vault/00-Audit/PROBLEM-LEDGER.md` — the living work queue
