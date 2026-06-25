---
type: home
title: SATEX — Home
tags: [satex, home, moc]
updated: 2026-06-14
---

# SATEX — Home

> [!abstract] The cockpit
> One screen between you and everything this system knows. Machine notes flow
> in by themselves — sessions, observer checkpoints, learnings, self-evals,
> and trades once P-013 closes. The maps below are curated and never dead-end.
> Structure last reviewed **2026-06-12**.

## Start here

| Door | What's behind it |
| --- | --- |
| [[2026-06-14-master-execution-plan-ultraplan\|⭐ Master Execution Plan (today)]] | the holy list — eat-the-frog sequence anchored to L1.D, all phases + operator track |
| [[Vault/00-Audit/PROBLEM-LEDGER\|Problem Ledger]] | the living PSD queue — open → decided → shipped → verified |
| [[Vault/00-Audit/2026-06-10-FULL-SYSTEM-AUDIT\|Latest full audit]] | verified system state, findings, priority matrix |
| [[Vault/00-INDEX\|Vault index]] | the map of every folder in this vault |
| [[AGENTS]] · [[ARCHITECTURE]] | how to work the repo · the one-page system map |

## Live state — updates itself

![[Vault/_dashboards/sessions.base]]

More views: [[Vault/_dashboards/trades.base|trades]] · [[Vault/_dashboards/learning-loop.base|learning loop]] — see [[Vault/_dashboards/README|_dashboards]].

## The day

- **Open today's note** — *Cmd/Ctrl-P → "Open today's daily note"*. Lands in `Vault/Daily/` with [[Vault/Templates/Daily|the template]] pre-filled (pre-open checklist → focus → session log → extraction).
- **Watchlist:** [[Vault/Symbols/NVDA|NVDA]] · [[Vault/Symbols/AMD|AMD]] · [[Vault/Symbols/MSFT|MSFT]] · [[Vault/Symbols/AAPL|AAPL]] · [[Vault/Symbols/TSLA|TSLA]] · [[Vault/Symbols/META|META]] · [[Vault/Symbols/IWM|IWM]]

## How notes arrive (nobody files anything by hand)

| Folder | Written by | Cadence |
| --- | --- | --- |
| [[Vault/Sessions/README\|Sessions]] | engine (vault-writer) | session start + close |
| [[Vault/Observer/README\|Observer]] | market observer | ~every 10 min while running; archived monthly |
| [[Vault/Trades/README\|Trades]] | engine, on position close | per trade — **empty until P-013 closes** |
| [[Vault/Tactics/README\|Tactics]] | MAY-TACTICS state machine | on observe ⇄ armed ⇄ veto transitions |
| [[Vault/Learnings/README\|Learnings]] | engine shutdown | one ≤4 KB note per session (kept: 30) |
| [[Vault/Backtests/README\|Backtests]] | nightly self-eval (02:30) | verdict tables vs locked baselines |
| [[Vault/Brain/README\|Brain]] | brain milestones | rare, on milestone |
| [[Vault/Daily/README\|Daily]] · [[Vault/Manual/README\|Manual]] | **you** | daily note · phase retros |

## Program state (dated 2026-06-12 — the ledger is the truth)

- Ladder: **L1.A–C merged** · branch `feat/audit-psd-batch-2026-06-11` awaiting push → PR · **L1.D (funded compliance) next**
- P-013 instrumented and decisive — run one simulated close, read the log, watch [[Vault/_dashboards/trades.base|trades]]
- Live numbers are never copied here — they rot. Open the newest note in `Learnings/` or the dashboards above.
