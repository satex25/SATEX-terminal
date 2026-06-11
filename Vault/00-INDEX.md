---
type: index
title: SATEX Vault — Index
tags: [satex, index, moc]
updated: 2026-06-10
---

# SATEX Vault

> Cold-open entry point. Curated map of what's here and what to read first.
> Counts below verified 2026-06-10 — if a number looks stale, trust the folder, then fix this file.

## Read first

- [[Vault/00-Audit/2026-06-10-FULL-SYSTEM-AUDIT]] — current verified system state, findings, priority matrix
- `ARCHITECTURE.md` (repo root) — the one-page system map incl. the learning loop
- [[Vault/00-Audit/SATEX-HANDOFF]] — 2026-05-14 forensic baseline (historical; many findings since fixed)
- [[Vault/00-Audit/MASTER-FIX-PLAN]] · [[Vault/00-Audit/MAY TACTICS]] · [[Vault/00-Audit/P0-1-FOOTPRINT-PLAN]]

## The learning loop's paper trail (new 2026-06-10)

| Folder | Written by | What lands there |
|---|---|---|
| `Backtests/` | nightly self-eval (02:30, or Settings → Run Now) | verdict tables vs locked baselines |
| `Backtests/baselines/` | first run per (strategy, symbol) | regression baselines — delete to promote an improvement |
| `Learnings/` | engine shutdown | ≤4 KB session notes: weight drift, confidence honesty, signal funnel (pruned to 30) |

## Vault layout

| Folder | Purpose | State (2026-06-10) |
|---|---|---|
| `00-Audit/` | Audit deliverables | 5 docs — start with the 2026-06-10 audit |
| `Backtests/` | Self-eval verdicts + baselines | populates on first nightly run |
| `Learnings/` | End-of-session learning notes | populates on first session close |
| `Observer/` | Live checkpoints (newest 48) | flood archived → `Observer/archive/YYYY-MM/` (1,164 notes) |
| `Sessions/` | Session start/close pairs | 37 files |
| `Trades/` | Per-trade outcomes | 0 — populates when autonomous closes trades (diagnostic pending, audit §5) |
| `Tactics/` | MAY-TACTICS transitions | 0 — populates on regime changes |
| `Daily/` | Daily notes (`YYYY-MM-DD.md`) | dormant since 2026-05-15 — revive or retire |
| `Manual/` | Human-written phase retros | **empty** — the 5 retros listed in the May index are no longer present (pre-2026-06-10; recover from git/backup if wanted) |
| `Symbols/` | Per-ticker hubs | 7 stubs (watchlist source: `src/shared/constants.ts → AUTONOMOUS_WATCHLIST`) |
| `Templates/` | Templater scaffolds | `Daily.md` |
| `Settings/` | App-managed settings files | indicator-toggles · workspace-state (· subsecond-prefs on first save) |

## Symbols

[[Symbols/NVDA]] · [[Symbols/AMD]] · [[Symbols/MSFT]] · [[Symbols/AAPL]] · [[Symbols/TSLA]] · [[Symbols/META]] · [[Symbols/IWM]]

## Conventions

- Every note carries YAML frontmatter (`type`, `tags`) — Dataview/Bases queries depend on it
- Filenames: `YYYYMMDD-HHMMSS-{scope}-{slug}.md` for time-ordered scopes; bare `{TICKER}.md` for symbols
- Wikilinks to symbols use the explicit `[[Symbols/<TICKER>]]` form
- Live system state is **not** mirrored in this file (it goes stale) — open the newest note in `Observer/` instead

## Boot pointer

Working here from an agent session? Read repo-root `AGENTS.md` first, then `ARCHITECTURE.md`.
