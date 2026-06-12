---
type: index
tags: [satex, trades]
---

# Trades — per-trade outcome notes (the journal the learning loop feeds on)

On every position close, `recordTradeClose` → `vault-writer.writeTradeClose`
drops one note: entry/exit, PnL, regime + tactics state at entry, and — per the
MAY-TACTICS extraction principle — **learnings on losses**, not just the number.
[[../_dashboards/trades.base|The trades dashboard]] tables them automatically.

> [!warning] Why this folder is empty — P-013 (IN-PROGRESS)
> The writer is proven good (4 integration tests, 2026-06-11) and the engine
> path is instrumented: any close that skips journaling now logs
> `trade close not journaled` with the reason. Evidence so far says **no trade
> has ever closed through the engine** — today's learnings note agrees:
> *"No closed trades fed the brain this session — check that trades are closing."*
> Next: one simulated round-trip close, then read the log.
> Full trail: [[../00-Audit/PROBLEM-LEDGER|Problem Ledger → P-013]].
