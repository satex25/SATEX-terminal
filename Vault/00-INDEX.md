---
type: index
title: SATEX Vault — Index
tags: [satex, index, moc]
updated: 2026-06-12
---

# SATEX Vault

> Cold-open entry point. Curated map of what's here and what to read first.
> The cockpit view lives at [[HOME]] — live dashboards, watchlist, the day's workflow.
> Numbers go stale by design — trust the folder (every folder now has a README explaining itself).

## Read first

- [[Vault/00-Audit/PROBLEM-LEDGER]] — **the living PSD queue**: open → decided → shipped → verified
- [[Vault/00-Audit/2026-06-10-FULL-SYSTEM-AUDIT]] — current verified system state, findings, priority matrix
- `ARCHITECTURE.md` (repo root) — the one-page system map incl. the learning loop
- [[Vault/00-Audit/SATEX-HANDOFF]] — 2026-05-14 forensic baseline (historical; many findings since fixed)
- [[Vault/00-Audit/MASTER-FIX-PLAN]] · [[Vault/00-Audit/MAY TACTICS]] · [[Vault/00-Audit/P0-1-FOOTPRINT-PLAN]]

## The learning loop's paper trail

| Folder | Written by | What lands there |
|---|---|---|
| `Backtests/` | nightly self-eval (02:30, or Settings → Run Now) | verdict tables vs locked baselines |
| `Backtests/baselines/` | first run per (strategy, symbol) | regression baselines — delete to promote an improvement |
| `Learnings/` | engine shutdown | ≤4 KB session notes: weight drift, confidence honesty, signal funnel (pruned to 30) |
| `Trades/` | engine, on position close | per-trade outcomes + loss learnings — **gated on P-013** |

## Vault layout

| Folder | Purpose | Notes |
|---|---|---|
| `00-Audit/` | Audit deliverables + the Problem Ledger | start with the ledger, then the 2026-06-10 audit |
| `_dashboards/` | Bases — auto-updating tables | embedded in [[HOME]]; see [[Vault/_dashboards/README\|README]] |
| `Backtests/` | Self-eval verdicts + baselines | [[Vault/Backtests/README\|README]] |
| `Learnings/` | End-of-session learning notes | [[Vault/Learnings/README\|README]] |
| `Observer/` | Live checkpoints (newest ~48) | flood archived → `archive/YYYY-MM/`; archive excluded from search · [[Vault/Observer/README\|README]] |
| `Sessions/` | Session start/close pairs | frontmatter feeds the sessions dashboard · [[Vault/Sessions/README\|README]] |
| `Trades/` | Per-trade outcomes | empty — P-013 IN-PROGRESS, instrumented · [[Vault/Trades/README\|README]] |
| `Tactics/` | MAY-TACTICS transitions | populates when trades flow · [[Vault/Tactics/README\|README]] |
| `Brain/` | Brain milestone notes | rare by design · [[Vault/Brain/README\|README]] |
| `Daily/` | Daily notes (`YYYY-MM-DD.md`) | **revived 2026-06-12** — plugin wired to folder + template · [[Vault/Daily/README\|README]] |
| `Manual/` | Human-written phase retros | empty — P-014 (recover from backup if any) · [[Vault/Manual/README\|README]] |
| `Symbols/` | Per-ticker hubs | 7 pages, backlink-accumulating · [[Vault/Symbols/README\|README]] |
| `Templates/` | Note scaffolds | `Daily.md` (rewritten 2026-06-12) |
| `Settings/` | App-managed settings notes | [[Vault/Settings/README\|README]] |
| `_attachments/` | Pasted images / recordings | default attachment folder |

## Symbols

[[Symbols/NVDA]] · [[Symbols/AMD]] · [[Symbols/MSFT]] · [[Symbols/AAPL]] · [[Symbols/TSLA]] · [[Symbols/META]] · [[Symbols/IWM]]

## Conventions

- Every note carries YAML frontmatter (`type`, `tags`) — the `_dashboards/` Bases query it
- Machine notes are **never hand-edited** — writers prune and overwrite; your voice goes in `Daily/`, `Manual/`, and symbol-page operator notes
- Filenames: `YYYYMMDD-HHMMSS-{scope}-{slug}.md` for time-ordered scopes; bare `{TICKER}.md` for symbols
- Wikilinks to symbols use the explicit `[[Symbols/<TICKER>]]` form
- Live system state is **not** mirrored in index files (it goes stale) — open [[HOME]]'s dashboards or the newest `Observer/` note

## Boot pointer

Working here from an agent session? Read repo-root `AGENTS.md` first, then `ARCHITECTURE.md`,
then the [[Vault/00-Audit/PROBLEM-LEDGER|ledger]] — the PSD loop is mandatory.
