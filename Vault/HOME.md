---
type: home
title: SATEX — Home
tags: [satex, home, moc]
updated: 2026-07-20
---

# Welcome back

This is where SATEX starts. Not a dashboard trying to say everything at
once — just a front door that gets you oriented fast, then sends you to
whatever's actually true right now instead of a copy of it that'll go
stale. Below: the way into the full cockpit, what's changed since you were
last here, and the two or three things most worth five minutes of your
attention today.

## → [[SATEX-COCKPIT.canvas|Open the SATEX Cockpit canvas]]

The full session-start view: the authority-chain reading order, the live
learning loop, the audit trail, the vault map, the watchlist — one screen,
maximalist by design.

## Quick links

- [[Vault/00-Audit/PROBLEM-LEDGER|Problem Ledger]] — the living PSD queue: what's open, decided, shipped, verified
- [[Vault/00-INDEX|Vault index]] — the map of every folder
- [[AGENTS]] · [[ARCHITECTURE]] — how to work the repo · the one-page system map
- [[Vault/Symbols/NVDA|NVDA]] · [[Vault/Symbols/AMD|AMD]] · [[Vault/Symbols/MSFT|MSFT]] · [[Vault/Symbols/AAPL|AAPL]] · [[Vault/Symbols/TSLA|TSLA]] · [[Vault/Symbols/META|META]] · [[Vault/Symbols/IWM|IWM]] — the watchlist
- *Ctrl-P → "Open today's daily note"* for [[Vault/Templates/Daily|the daily template]]

## Recently

*A hand-picked trail, not a live feed. If this looks old, the*
*[[SATEX-COCKPIT.canvas|canvas]] and [[Vault/00-Audit/PROBLEM-LEDGER|ledger]] always know more than this note does.*

- **2026-07-20** — Back in sync on this machine. The three scheduled
  agents — dawn planner (05:05), work-layer finisher (06:06), weekly
  repo-clean (Sun 09:02) — were re-installed from their repo mirrors, and
  the six unused connectors (Linear / Notion / Slack / Datadog / Amplitude
  / Hex) were confirmed to touch nothing in this project. The recurring
  stale `.git/*.lock` snags also got a real root-cause fix: an auto-clean
  hook now runs before every git op (P-125).
- **2026-07-20** — MAY-TACTICS graduation was hardened so it can't arm on
  fabricated data, and the poison-additive order seeder was deleted.
  Merged to master — **your live perimeter smoke-test is still pending**
  (P-121).
- **2026-07-18** — A full dependency upgrade campaign took the whole stack
  to latest-compatible (React 19, Electron 43, TypeScript 6, Vite 7) and
  cleared every HIGH/CRITICAL npm-audit finding — 22 down to 0 — across
  eight reviewed PRs (P-115).
- **2026-07-17** — A Brain persistence bug that was quietly duplicating
  rows on every learning event, forever, got found, fixed, and merged to
  master. 42 new tests pin it down (P-113).

## If you're just sitting down

- Skim the [[Vault/00-Audit/PROBLEM-LEDGER|ledger]] for anything DECIDED
  and waiting on you — usually the highest-leverage five minutes available.
- Glance at the [[SATEX-COCKPIT.canvas|canvas]] for anything flagged red.
- Start [[Vault/Templates/Daily|today's daily note]] if you're trading
  today. The pre-open checklist takes two minutes and has saved worse days
  than it's cost.

---

*Good to have you back — the system remembers everything so you don't have to.*
