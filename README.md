# SATEX — Smart Autonomous Trading EXperience

A **Windows-only** Electron + React + TypeScript trading terminal — TradingView
Lightweight Charts v5, Zustand, better-sqlite3 — with a live-capital path via Alpaca.

**Version:** 0.5.0 · **Status:** v0.5 RC · Windows-only

## Where the app lives

The application is nested in this repository:

```
00-PROJECT-ROOT/01-SATEX-CORE/satex-app/
```

## Quick start

```
cd 00-PROJECT-ROOT/01-SATEX-CORE/satex-app
npm install
npm run dev          # electron-vite dev
```

The four gates (run from the app directory):

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
- **[CHANGELOG](00-PROJECT-ROOT/01-SATEX-CORE/satex-app/CHANGELOG.md)** — release history (see `[0.5.0]`).
- **[App notes](00-PROJECT-ROOT/01-SATEX-CORE/satex-app/CLAUDE.md)** — app-specific architecture, CI, and feature notes.
- **[Releases](https://github.com/satex25/satex-trading/releases)** — tagged builds.

## ⚠️ Trading-safety

SATEX can trade **real capital** in live mode. Autonomous financial execution is
**forbidden**: the order/execution path, risk gates, kill-switch, and the live-mode
and MAY-TACTICS interlocks are off-limits to automated change without explicit human
approval. See the guardrails in **[AGENTS.md](AGENTS.md)**.
