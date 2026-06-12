---
type: index
tags: [satex, sessions]
---

# Sessions — start/close pairs, written by the engine

`vault-writer.ts` drops one note at session start and one at close.
Close notes carry the full result in frontmatter — `outcome`, `realizedPnl`,
`tradeCount`, `drawdownPct`, `endingEquity` — which feeds
[[../_dashboards/sessions.base|the sessions dashboard]] automatically.

Machine-owned: don't hand-edit (the writer never re-reads, but conventions do).
Filenames: `YYYYMMDD-HHMMSS-session-<id>-{start|close}.md`.
