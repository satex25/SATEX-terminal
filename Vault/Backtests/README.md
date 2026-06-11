---
type: index
tags: [satex, backtest, self-eval]
---

# Backtests — nightly self-evaluation output

Written automatically by `services/self-eval.ts` (02:30 local, or Settings → Run Now).

- `YYYYMMDD-HHMMSS-self-eval.md` — verdict table per (strategy, symbol) vs locked baseline.
- `baselines/*.json` — locked regression baselines. **Promote an intentional improvement by deleting its stale baseline** — the next run re-locks it.

Toggle lives in Settings → Nightly Self-Evaluation. Observational only — never places or gates an order.
