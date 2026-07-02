# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

SATEX is a Windows-only Electron + React 18 + TypeScript trading terminal with a live-capital trading path via Alpaca. Treat it as production financial software.

## Read these first

- `AGENTS.md` — how to work this repo: gate bar, branch/PR flow, trading-safety guardrails, PSD loop
- `apps/satex-terminal/CLAUDE.md` — app architecture, invariants, broker abstraction
- `ARCHITECTURE.md` — one-page system map
- `Vault/00-Audit/PROBLEM-LEDGER.md` — living PSD queue (read on session boot, update on close)

## First-clone setup

Run once per clone before the first commit:

```
git config core.hooksPath .husky
cd apps/satex-terminal && npm install
```

All gate commands (`typecheck`, `lint`, `test`, `knip`) run from `apps/satex-terminal/`.

## Env vars

| Var | Purpose |
|---|---|
| `SATEX_VAULT_ROOT` | Override vault root (needed for packaged installs; auto-discovered in dev) |
| `SATEX_HW_ACCEL=1` | Enable GPU hardware acceleration (opt-in) |

Alpaca credentials are stored in Electron `safeStorage` (configured in-app) — not in env files.
