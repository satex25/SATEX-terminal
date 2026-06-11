---
type: ledger
title: SATEX Problem Ledger — the living PSD queue
tags: [satex, psd, problems, ledger]
updated: 2026-06-11
---

# Problem Ledger

> The continuous **Problem → Solutions → Decision** loop, mandated by `AGENTS.md` §PSD.
> Every agent session: read this on boot, update it on close. Each entry uses the
> `/problem-solution-decision` shape: evidenced PROBLEM, ≥2 candidate SOLUTIONS with
> trade-offs, a DECISION with rationale. Statuses: **OPEN → DECIDED → IN-PROGRESS →
> SHIPPED → VERIFIED**. Nothing is ever deleted — solved entries sink to §Closed.

---

## Open

### P-007 · Copilot chat window (operator-requested feature)
- **Problem:** Operator wants a chat surface that opens with the app, journals trades into the conversation in real time, and answers questions over account state (col, 2026-06-10).
- **Solutions:** (a) second BrowserWindow with its own renderer entry + IPC trade feed + `llm.ts` Q&A; (b) dockable in-shell panel in the existing renderer; (c) external web app talking to a local API.
- **Decision:** **(a)** — keeps CSP/sandbox guarantees, reuses the LLM adapter, separate-window matches the operator's stated workflow. Advisory-only wall applies: chat can never route an order.
- **Status:** OPEN (design next session — sized too large to batch with other work)

### P-008 · Global/world-markets data for the nightly study
- **Problem:** Self-eval studies only the day's in-memory candles; operator wants previous-day + world-market coverage (Asia/Europe sessions, FX).
- **Solutions:** (a) extend `getCandles` dep to Alpaca historical multi-day; (b) new data provider behind `MarketDataSource` (Polygon/Databento) post-L1.G; (c) both, staged.
- **Decision:** **(c)** — (a) is a small dep change worth doing now-ish; (b) rides the broker-abstraction pattern after L1.G.
- **Status:** OPEN

### P-009 · Brain depth features inert until L1.F
- **Problem:** `depth_imbalance` / `microprice_dev` always 0 at decision+learning time (engine never passes `this.depth.get(symbol)`; audit §3.5).
- **Solutions:** (a) wire now; (b) fold into L1.F's checklist where the ensemble rewires the trader anyway.
- **Decision:** **(b)** — avoids conflicting with the L1.F cherry-pick stack; added to L1.F scope. Human sign-off required (live decision path).
- **Status:** DECIDED


### P-011 · Inline TSX fontSize numbers bypass the type scale
- **Problem:** The 9-token `--text-*` scale covers globals.css; inline `fontSize: 11` style props in ~20 components don't re-scale and will fight density modes.
- **Solutions:** (a) mechanical sweep to `'var(--text-…)'` strings; (b) tiny `text()` helper; (c) wait for density-mode work and sweep then.
- **Decision:** **(c)** — one sweep, one visual QA pass, when density modes land.
- **Status:** DECIDED

### P-012 · Engine god-object (2,297 lines, ~17 services, 12 timers)
- **Problem:** Every feature pays a navigation tax; shutdown list grows by hand (audit §3.10).
- **Solutions:** (a) decompose now into OrderLifecycle/LearningLoop/BroadcastHub/SessionLifecycle; (b) after L1.D-F land.
- **Decision:** **(b)** — decomposing under an active cherry-pick program multiplies conflicts.
- **Status:** DECIDED

### P-013 · `Vault/Trades/` never populates
- **Problem:** Paper sessions ran but no trade-outcome notes exist — either autonomous never closed a trade in those sessions or the VaultWriter path is unreached (audit §5). The learning loop's journal depends on this.
- **Solutions:** (a) diagnostic session: enable autonomous in simulator, watch for `Trades/` note + `learning hook fired` log; (b) add an integration test driving a simulated close through `recordTradeClose` asserting the vault write.
- **Decision:** **(a) then (b)** — observe first, then pin with a test.
- **Status:** OPEN (operator can run (a) in minutes)

### P-014 · `Vault/Manual/` retros vanished
- **Problem:** The 5 human-written phase retros listed in the May index are gone (pre-2026-06-10; vault is untracked so git can't restore).
- **Solutions:** (a) recover from machine backup/OneDrive if any; (b) accept loss, note in index.
- **Decision:** pending operator — only they know if a backup exists.
- **Status:** OPEN

## In progress

*(entries move here when an agent starts work; move to Shipped with commit/PR reference)*

## Shipped — awaiting verification

*(none currently)*

## Closed — verified

### P-010 · Risk-gate correlation computed on prices, not returns
- **Evidence:** `toLogReturns()` function in `risk-gates.ts` guards zero prices; calls to `correlation(toLogReturns(aligned.a), toLogReturns(aligned.b))` use returns not prices; `correlationWatch` retuned 0.60→0.45 with comment explaining return-space ρ structural difference.
- **Verified:** 2026-06-11 — code review confirms implementation matches problem statement.

### P-001 · PatternLearner duplicate SGD updates (S1)
- **Evidence:** `private lastLabeledTs = new Map<string, number>()` cursor in `pattern-learner.ts`; check `if (x.ts <= cursor) continue` prevents re-learning same observation; comment confirms "P-001: ONE gradient step per observation across overlapping cycles".
- **Verified:** 2026-06-11 — cursor implementation prevents duplicate SGD updates.

### P-002 · ExecTicket clips to invisible at min window height (S1)
- **Evidence:** `@media (max-height: 1009px)` rule in `globals.css` makes `.bb-col-right` scrollable with `overflow-y: auto` below 1010px window height; comment cites P-002 and explains full-size panels remain reachable.
- **Verified:** 2026-06-11 — media query makes order entry reachable at 1200×720.

### P-003 · Accessibility floor: no focus rings, no reduced-motion (S3→prioritized)
- **Evidence:** Global `:focus-visible { outline: 1px solid var(--bb-accent); outline-offset: 1px; }` rule; `:focus:not(:focus-visible) { outline: none; }` suppresses mouse-click outline; `@media (prefers-reduced-motion: reduce)` collapses animations to 0.01ms.
- **Verified:** 2026-06-11 — focus ring and reduced-motion rules present in globals.css.

### P-015 · THE WIRE — toggleable live world-news desk (operator request)
- **Evidence:** `WireFeedService` in `wire-feed.ts` with RSS sources (BBC, NPR, Guardian, Hacker News); toggleable via `wire.stop()` when OFF; 10s fetch timeout; IPC push updates via `wire.onUpdate(snap) → IPC.WIRE_UPDATE`; comments confirm "OFF by default".
- **Verified:** 2026-06-11 — live news desk implemented with RSS polling.

### P-016 · Standing agent — daily PSD session scheduled
- **Evidence:** `satex-psd-daily` scheduled task is executing this very session (this line is proof — the task was created, scheduled, and now running autonomously).
- **Verified:** 2026-06-11 — standing agent functional (running now).

### P-000 · 2026-06-10 audit remediation batch
ERNIE timeout · CSP exfil channel · CLAUDE.md drift · provider-agnostic LLM (Groq default) ·
Brier calibration (downgrade-only) · nightly self-eval + Settings toggle · LEARNINGS notes (capped) ·
type scale (277 decls → 9 tokens) · theme leaks · vault reorg + ARCHITECTURE.md.
Evidence: all four gates green, 651/651 tests; `Vault/00-Audit/2026-06-10-FULL-SYSTEM-AUDIT.md`.
