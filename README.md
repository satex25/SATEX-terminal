# SATEX — Smart Autonomous Trading EXperience

[![CI](https://github.com/satex25/SATEX-terminal/actions/workflows/ci.yml/badge.svg)](https://github.com/satex25/SATEX-terminal/actions/workflows/ci.yml)

A **Windows-only** Electron + React 19 + TypeScript trading terminal — TradingView
Lightweight Charts v5, Zustand, better-sqlite3, Zod-validated IPC — with a
**live-capital path via Alpaca**. Treat every line as production financial software.

**Version:** 0.5.0 · v0.6 "Black Box" in flight · Windows-only

## Repository layout

```
mc4/
├── apps/
│   └── satex-terminal/    # THE app — Electron main/preload/renderer, tests, app docs
├── docs/                  # Workspace-level docs: policy, plans, guides, vendor refs
├── scripts/               # Live automation (archived one-offs in scripts/archive/)
├── reference/             # Historical artifacts (git bundles)
├── Vault/                 # Obsidian operational memory (runtime data, mostly untracked)
├── AGENTS.md              # How agents & humans work this repo (gates, PR flow, guardrails)
├── ARCHITECTURE.md        # One-page system map
├── CONSTITUTION.md        # Behavior constitution for every intelligence on the repo
└── CLAUDE.md              # Claude Code entry point
```

## Quick start

```
git config core.hooksPath .husky   # once per clone
cd apps/satex-terminal
npm install
npm run dev          # electron-vite dev
```

The four gates (from `apps/satex-terminal/`, or from the root via `npm run gates`):

```
npm run typecheck    # tsc (main + renderer)
npm run lint         # eslint
npm test             # vitest
npm run knip         # dead-code / unused deps
```

## Documentation

- **[ARCHITECTURE.md](ARCHITECTURE.md)** — the one-page system map: workspace layout,
  runtime architecture, the learning loop, gates, and the program ladder.
- **[AGENTS.md](AGENTS.md)** — how agents and humans work this repo: the gate bar,
  branch → PR → merge flow, trading-safety guardrails, and the grounded-review routine.
- **[CONSTITUTION.md](CONSTITUTION.md)** — the persistent behavior constitution.
- **[Getting started](docs/GETTING-STARTED.md)** · **[Contributing](docs/CONTRIBUTING.md)**
  · **[Security policy](docs/SECURITY.md)** · **[FAQ](docs/FAQ.md)**
- **[CHANGELOG](apps/satex-terminal/CHANGELOG.md)** — release history.
- **[App notes](apps/satex-terminal/CLAUDE.md)** — app architecture facts & invariants.
- **[Releases](https://github.com/satex25/SATEX-terminal/releases)** — tagged builds.

## ⚠️ Trading-safety

SATEX can trade **real capital** in live mode. Autonomous financial execution is
**forbidden**: the order/execution path, risk gates, kill-switch, and the live-mode
and MAY-TACTICS interlocks are off-limits to automated change without explicit human
approval. See the guardrails in **[AGENTS.md](AGENTS.md)**.
