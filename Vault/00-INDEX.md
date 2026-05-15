---
type: index
title: SATEX Vault — Index
notes-since: 2026-05-12
tags: [satex, index, moc]
---

# SATEX Vault

> Cold-open entry point. Curated map of what's here, what's live, and what to read first.
> Audit baseline 2026-05-15. Knowledge-spine restoration in progress — see [[#Open priorities]].

## Latest session

- [[Vault/Sessions/20260515-070939-session-ses_mp6kugptgufu001]] — most recent start
- All sessions to date: see `Vault/Sessions/` (44 files)

## Open priorities

Pulled from the 2026-05-15 audit. Fix #1 + Fix #4 shipped — see commit `e0fbfdd`.

| Fix | Status | Notes |
|----:|:------:|:------|
| #1 Symbol notes + wikilink resolution | ✅ shipped | 7 stub pages under [[#Symbols]] |
| #2 Move audit docs into vault | ✅ shipped | now at `Vault/00-Audit/` — see [[#Open priorities]] links below |
| #3 Index note | ✅ shipped | this file |
| #4 Brain-checkpoint noise guard | ✅ shipped | guard at `vault-writer.ts:305`; takes effect on next dev-server restart |
| #5 Daily notes wiring | ✅ shipped | folder `Vault/Daily/`, template `Vault/Templates/Daily.md`; pairs with the `/daily` skill |

Active deliverables from the institutional audit (read these before planning Week-1 work):

- [[Vault/00-Audit/SATEX-HANDOFF]] — current state, ~170–220h to v1.0
- [[Vault/00-Audit/MASTER-FIX-PLAN]] — root-cause fix sequencing
- [[Vault/00-Audit/MAY TACTICS]] — May tactical priorities

## Symbols

Watchlist source: `src/shared/constants.ts` → `AUTONOMOUS_WATCHLIST` (7 tickers).

- [[Symbols/NVDA]]
- [[Symbols/AMD]]
- [[Symbols/MSFT]]
- [[Symbols/AAPL]]
- [[Symbols/TSLA]]
- [[Symbols/META]]
- [[Symbols/IWM]]

## Manual checkpoints

High-signal engineering retros. The most recent is the gold standard for Phase-N writeups.

- [[Vault/Manual/20260514-235240-manual-phase-10.1-data-pipeline-restoration-and-workspace-tabs|Phase 10.1 — Data pipeline restoration + Workspace tabs]] (2026-05-14)
- [[Vault/Manual/20260514-074101-manual-phase-9.3-smoke-test-and-replay-bugfixes|Phase 9.3 — Smoke test + replay bugfixes]] (2026-05-14)
- [[Vault/Manual/20260514-034959-manual-phase-9.2-chart-historical-day-picker|Phase 9.2 — Chart historical day picker]] (2026-05-14)
- [[Vault/Manual/20260513-111701-manual-autonomous-verification-of-vault-write-path|Vault write-path verification (2)]] (2026-05-13)
- [[Vault/Manual/20260513-111542-manual-autonomous-verification-of-vault-write-path|Vault write-path verification (1)]] (2026-05-13)

## Vault layout

| Folder | Purpose | Status |
|---|---|---|
| `Vault/00-Audit/` | Institutional forensic audit deliverables | 3 docs — SATEX-HANDOFF, MASTER-FIX-PLAN, MAY TACTICS |
| `Vault/Daily/` | Daily working notes (one per day, `YYYY-MM-DD.md`) | wired; first note 2026-05-15 |
| `Vault/Templates/` | Templater scaffolds for `daily-notes` plugin | 1 template — `Daily.md` |
| `Vault/Sessions/` | Session start + close pairs | 44 files — active |
| `Vault/Trades/` | Per-trade outcomes (wins + loss-learnings) | 0 files — populates when paper trading runs |
| `Vault/Tactics/` | MAY-TACTICS state transitions | 0 files — populates on regime changes |
| `Vault/Brain/` | Brain weight snapshots | 339 historical (mostly zero-payload, frozen); guard now in place |
| `Vault/Observer/` | Continuous observer + learner snapshots | 339 active — learner cycles 1239+ |
| `Vault/Manual/` | Human-written phase retros | 5 files — high signal |
| `Vault/Symbols/` | Per-ticker hub notes | 7 stubs — wikilink targets |

## Live system state

Captured at 2026-05-15T17:29:53Z (latest observer checkpoint):

- Total observations recorded: **16,336**
- Rate: **96/min** across **7** symbols
- Pattern-learner cycles: **1,239** | weights tracked: **24** | forward-return error: 0.0000

Refresh: this section is static. For real-time, open the latest file in `Vault/Observer/`.

## Conventions

- Every note carries YAML frontmatter — Dataview/Bases queries work against `type`, `tags`, and per-scope fields
- Tags hierarchy: `satex` → kind (`session` / `brain` / `observer` / `manual` / `symbol`) → attribute (`mode/simulator`, `outcome/win`, `phase-10.1`, `scope/manual`)
- Filenames: `YYYYMMDD-HHMMSS-{scope}-{slug}.md` for time-ordered scopes; bare `{TICKER}.md` for symbol pages
- Wikilinks to symbols use the explicit `[[Symbols/<TICKER>]]` form going forward (resolves regardless of vault link-mode setting)

## Boot pointer

Working in this vault from Claude Code? Read `MEMORY.md` at `C:\Users\User\.claude\projects\C--Users-User-mc4\memory\` for project context and conventions.
