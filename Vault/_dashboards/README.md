---
type: index
tags: [satex, dashboards]
---

# _dashboards — live views over the vault

`.base` files (Obsidian **Bases**, core plugin — no community plugins needed).
Each renders an auto-updating table from note frontmatter; they are embedded
in [[HOME]] and can be opened directly.

- [[sessions.base|sessions]] — session closes: outcome, realized PnL, trade count, drawdown
- [[trades.base|trades]] — per-trade outcomes (+ a losses view, worst first). Fills when [[Vault/00-Audit/PROBLEM-LEDGER|P-013]] closes
- [[learning-loop.base|learning-loop]] — session learnings + nightly self-evals

If a table ever renders an error after an Obsidian update, open the `.base`,
re-pick columns in the view menu, and it re-serialises itself — the YAML
schema occasionally drifts between Obsidian versions.
