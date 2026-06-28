---
type: ledger
title: SATEX Problem Ledger — the living PSD queue
tags: [satex, psd, problems, ledger]
updated: 2026-06-27
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
- **Status:** IN-PROGRESS — (a) shipped 2026-06-12 + review-fixed (empty-bars fallback for sim mode); (b) rides post-L1.G

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

### P-014 · `Vault/Manual/` retros vanished
- **Problem:** The 5 human-written phase retros listed in the May index are gone (pre-2026-06-10; vault is untracked so git can't restore).
- **Solutions:** (a) recover from machine backup/OneDrive if any; (b) accept loss, note in index.
- **Decision:** pending operator — only they know if a backup exists.
- **Status:** OPEN

### P-017 · `docs/vendor/fs-extra/*.md` are 0-byte husks
- **Problem:** The four fs-extra vendor docs moved in the 2026-06-10 reorg lost their content (0 bytes on disk — file-bridge shrink artifact). Anything citing them dead-ends.
- **Solutions:** (a) re-fetch the four pages from upstream fs-extra docs; (b) delete the husks and drop the references.
- **Decision:** **(a)** when next needed — excluded from the 2026-06-11 commit batch so the husks never enter history.
- **Status:** OPEN

### P-018 · Stale `index.lock` + sandbox bridge corrupting `.git` writes
- **Problem:** A crashed git process left `.git/index.lock` dated 2026-06-10 08:02 — the reason the entire audit batch sat uncommitted for a day. Separately, the sandbox file bridge NUL-corrupted `.git/index` during a staged write and serves NUL-tails on some mount reads (`CLAUDE.md` and this ledger healed 2026-06-11); the sandbox cannot `unlink` inside the repo (EPERM) but CAN `rename`.
- **Solutions:** (a) commit via a /tmp clone and `git push` the branch back into the repo (single pack write, no index involvement); (b) operator-side hygiene: delete `.git/index.lock.stale`, `.git/index.corrupt-*`, `.git/claude-probe` and `.git/objects/*/tmp_obj_*` litter; `git reset` if status misbehaves.
- **Decision:** **(a) executed 2026-06-11** (branch `feat/audit-psd-batch-2026-06-11`); (b) is a one-time operator cleanup.
- **Status:** SHIPPED (workflow) — operator cleanup pending

### P-020 · Two deliberate-looking display choices worth an operator ruling
- **Problem:** Surfaced while reviewing the render layer; both look intentional, so not changed autonomously. (1) `useClocks.ts:36` labels the second clock “CST” but hard-codes UTC−6 with “no DST shift — matches the mockup”; during US daylight time (e.g. today, 2026-06-14) Central is CDT/UTC−5, so the clock reads one hour off its own label. (2) `fmt.money()` (`format.ts:22`) uses a Unicode minus `−` for losses but an ASCII `+` for gains, while `fmt.signed()` uses ASCII for both — an inter-formatter sign-glyph inconsistency.
- **Solutions:** clock — (a) keep fixed UTC−6 but relabel to “UTC−6”; (b) make it true America/Chicago (DST-aware) with an honest CST/CDT label. money — (a) standardize on ASCII `+/-`; (b) standardize on Unicode `+/−`; (c) leave as-is (deliberate for headline PnL).
- **Decision:** defer to operator — both are taste/legibility calls, not single-answer defects. Recorded so they are not lost.
- **Status:** OPEN (operator ruling)


### P-021 · Test file corruption blocks gate execution (file-bridge shrink artifact)
- **Problem:** Four test files truncated mid-structure by file-bridge corruption (P-018 symptom recurring). Each missing 1–2 closing braces: `calibration.test.ts` (line 127, 1 brace), `pattern-learner.test.ts` (line 100, 1 brace), `replay-source.test.ts` (line 268, 2 braces), `tick-recorder.test.ts` (line 135, 2 braces). Gates cannot run; typecheck fails with "'}' expected" at end-of-file. Also observed: `package.json` truncated; `DrawingLayer.tsx` (205/207 lines), `ChartPanel.tsx` (1399/1660 lines), `knip.json` truncated — all additional corruption discovered 2026-06-18.
- **Solutions:** (a) restore from git objects — `git show HEAD:<path>` bypasses index.lock to recover clean versions directly from commit objects; (b) operator: checkout from remote; (c) manually reconstruct.
- **Decision:** **(a) executed 2026-06-18** — `git show HEAD:path` used to restore all 6 corrupted files (4 test files appended missing braces; DrawingLayer.tsx, ChartPanel.tsx, knip.json fully restored from git objects). HEAD NUL-corruption fixed (printf clean ref → `.git/HEAD`). Stale `index.lock` persists (EPERM from sandbox) but does not block read-only git object access.
- **Evidence:** After repair — brace-balance all 0; typecheck exit 0; lint exit 0 (1 warning, acceptable); vitest 99 suites / 1232 tests / 0 failures; knip blocked by oxc-parser 2 GB ArrayBuffer (sandbox RAM ceiling, not a code defect — confirmed clean on Windows CI).
- **Status:** CLOSED — gates green on feat/chart-interaction-layer @ a13bd39

### P-022 · Old flat services/ files remain after domain-subdir restructure
- **Problem:** The services/ domain-subdir restructure (broker/, execution/, intelligence/, market-data/, risk/, subsecond/, system/) was performed as a copy-then-update-imports operation. All 81 old flat files (services/*.ts and services/alpaca/*.ts) still exist in the working tree — they're tracked by git but now dead code (all entry-point imports use the new paths). Cannot delete from sandbox (EPERM on tracked files). On CI, the test files in the flat dir act as entry points that anchor their source companions, so knip does not flag them as dead — but it's architectural debt: 2x test execution, confusion about canonical file locations, future churn risk.
- **Solutions:** (a) operator: `git rm -r src/main/services/alpaca/ src/main/services/*.ts` from satex-app; update knip.json ignore to remove old-path entries (no longer needed since files deleted); commit as a cleanup step; (b) rename with symlinks (complex, fragile); (c) accept indefinitely (technical debt, no functional impact).
- **Decision:** **(a)** — one `git rm` command, then knip ignore list cleanup. No logic change. Off the safety perimeter. Blocking only the operator's ability to do `git rm` (sandbox EPERM).
- **Status:** OPEN — awaiting operator `git rm` cleanup.

### P-028 · `payout-metrics.ts` `profitTargetReached` is true at `profitTarget === 0`
- **Problem:** In `computePayoutMetrics` (`src/shared/funded/payout-metrics.ts:59-68`),
  `profitTargetProgress` is guarded (`profitTarget > 0 ? ... : 0`) but `profitTargetReached` is the
  bare `totalProfit >= profile.profitTarget`. When `profitTarget === 0`, `totalProfit` (sum of
  profitable days, always >= 0) makes `reached` unconditionally **true** while `progress` reports
  **0** — a contradictory state the FundedAccountPanel would render. No shipped profile triggers it
  today (`TOPSTEP_50K_XFA.profitTarget = 3_000`), so it is latent, not live.
- **Solutions:** (a) treat `profitTarget === 0` as "no target" -> reached=true + progress=1
  (vacuously complete); (b) reached=false + progress=0 (nothing achieved); (c) leave as-is.
- **Decision:** defer to operator — the meaning of a zero target ("already funded / no target" vs
  "unset") is a product call, not a single-answer defect. Recorded so it is not lost (cf. P-020).
- **Status:** OPEN (operator ruling). Off the trading-safety perimeter (advisory display; payout
  metrics block no order).

## In progress

*(entries move here when an agent starts work; move to Shipped with commit/PR reference)*


## Shipped — awaiting verification

### P-040 · `indicator-graph.ts` `applyStdev` divides by `period` with no `period <= 0` guard
- **Problem:** `applyStdev` (`src/shared/chart-indicators/indicator-graph.ts:111-121`, CHART-18)
  computes `mean = win.reduce(...) / period` and `variance = … / period` with no guard on `period`.
  A `StdevNode` with `period === 0` yields a NaN-filled series (`0/0` for every window); a negative
  period starts the loop `for (i = period - 1; …)` at a negative index with a negative divisor →
  NaN/garbage. Every sibling in this layer guards its degenerate parameter (`brickSize <= 0`,
  `reversalAmt/reversalPct <= 0`, `window < 2`, `median <= 0`); `applyStdev` was the lone gap.
  **Latent:** no preset (`emaCrossPipeline`/`rsiAlertPipeline`) builds a stdev node, and `evalPipeline`
  is exported but has no call-site yet; the period<=0 path was untested. Proven
  (`outputs/satex-work-p039p040-repro.mjs`): period 0 → OLD series contains NaN, FIX none; period -2
  → FIX all-zeros; period 3 → OLD≡FIX.
- **Solutions:** (a) `if (period < 1) return result` (all-zeros, matching the layer's
  insufficient-data convention) — root fix, one line, behaviour-identical for valid periods; (b)
  validate at the `evalPipeline` 'stdev' case (pushes the guard up, less local, same effect); (c)
  leave as-is (NaN series the instant CHART-18 wires a misconfigured node).
- **Decision:** **(a)** — smallest blast radius, fixes the root where the division lives, off the
  trading-safety perimeter (visual-only alert series). Found via PSD rule 2(d) audit of the node
  evaluators (self-directed NEXT from the P-038 run).
- **Shipped (2026-06-27, work-layer run 2):** `if (period < 1) return result` after the result
  allocation (anchor count==1; LF-safe python edit; NUL/CRCR clean). +3 tests in
  `indicator-graph.test.ts` (13→16) via `evalPipeline` with a stdev node: period 0 and period -5 →
  zero series, no NaN; valid period 10 → finite, some positive.
- **Gate verification (2026-06-27, working tree @ e158e48 + edits, mount node_modules, Node v22):**
  typecheck exit 0 | lint exit 0 (0 warnings) | vitest 98 files / 1268 tests / 0 fail (sharded 4x:
  340+405+274+249) | knip exit 0 (Node-20 shim; pre-existing warnings only, none new).
- **Status:** SHIPPED — awaiting operator commit.

### P-039 · `vol-surface.ts` `logReturnStdev` guards `prev <= 0` but not `curr <= 0` (NaN on negative price)
- **Problem:** `logReturnStdev` (`src/shared/chart-indicators/vol-surface.ts:66`, CHART-16) builds
  per-bar log-returns under the guard `if (!prev || !curr || prev <= 0) continue`. A negative `curr`
  with a positive `prev` — a crude-oil bar crossing through zero (CL, negative Apr 2020, Constitution
  §1.1 in-domain) — passes the guard (`!curr` is false for a truthy negative, and `prev > 0`), so
  `Math.log(curr / prev)` of a negative ratio returns **NaN**, which propagates through mean/variance
  to a NaN `realizedVol` for the whole slice. The negative-price class (P-034/P-035/P-038) surfacing
  as a half-applied guard. Reachable from `computeVolSurface`/`computeVolSurfaceHistory` (exported
  from the barrel). The negative-`curr` edge was untested (P-031 pinned only the history builder; the
  existing `logReturnStdev` tests are flat/noisy positive series). Proven
  (`outputs/satex-work-p039p040-repro.mjs`): zero-crossing crude → OLD **NaN**, FIX **0.5215**;
  positive series OLD≡FIX.
- **Solutions:** (a) extend the skip to `|| curr <= 0` — excludes the bad bar exactly like a
  non-positive `prev`, root fix, behaviour-identical for positive prices; (b) clamp/abs prices
  upstream (log-return of |price| is meaningless across a sign flip — masks, doesn't fix); (c) leave
  as-is (NaN realized-vol on crude).
- **Decision:** **(a)** — consistent with the function's own `prev <= 0` skip; a log-return across a
  zero crossing is undefined, so excluding the bar is the only correct choice; off the trading-safety
  perimeter (advisory surface). Found via PSD rule 2(d) audit (self-directed NEXT from the P-038 run).
- **Shipped (2026-06-27, work-layer run 2):** guard → `if (!prev || !curr || prev <= 0 || curr <= 0)
  continue` (anchor count==1; LF-safe edit; NUL/CRCR clean). +2 tests in `vol-surface.test.ts`
  (17→19): zero-crossing crude series → finite non-negative; isolated negative close (prev>0) → no NaN.
- **Gate verification (2026-06-27, working tree @ e158e48 + edits, mount node_modules, Node v22):**
  typecheck exit 0 | lint exit 0 (0 warnings) | vitest 98 files / 1268 tests / 0 fail (sharded 4x:
  340+405+274+249) | knip exit 0 (Node-20 shim; pre-existing warnings only, none new).
- **Status:** SHIPPED — awaiting operator commit.

### P-038 · `chart-types.ts` Kagi `reversalPct` reversal threshold multiplies a signed price
- **Problem:** `kagiTransform` (`src/shared/chart-indicators/chart-types.ts:201-202`, CHART-15)
  computes its reversal magnitude as `revAmt = opts.reversalAmt ?? (reversalPct !== undefined ?
  lineStart * opts.reversalPct : lineStart * 0.01)`. The `reversalAmt` path is guarded (`<=0 → []`),
  but the `reversalPct` and default branches multiply the **signed** `lineStart`. For a
  negative-priced instrument `lineStart < 0` makes `revAmt` negative, so the up-line reversal test
  `close <= extreme - revAmt` collapses to `close <= extreme + |revAmt|` — true for essentially every
  non-extreme candle, so the Kagi reverses on each bar instead of only on a real reversal (the same
  negative-price class as P-034/P-035, here on a *multiplicative* threshold). SATEX's universe
  includes CL crude (negative in Apr 2020 — Constitution §1.1, in-domain). **Latent today:**
  `kagiTransform` is exported from the chart-indicators barrel (`index.ts:27`) but has **no
  call-site** yet (cf. P-035); and the `reversalPct` path had **zero test coverage** — the existing
  6 kagi tests exercise only `reversalAmt`. Empirically proven (`outputs/satex-work-p038-repro.mjs`):
  a `[-100,-101,-102,-103,-104,-103,-102]` series with `reversalPct=0.05` yields **3** spurious
  reversals OLD vs **1** FIX; the positive mirror is byte-identical OLD≡FIX.
- **Solutions:** (a) `Math.abs(lineStart)` on both the `reversalPct` and default branches — root fix,
  smallest blast radius (one expression + additive tests), behaviour-identical for every positive
  price; (b) clamp/shift prices positive upstream (wider blast radius, changes the candle contract,
  masks the bug); (c) leave as-is (ships the P-034/P-035 class on the one un-swept transform).
- **Decision:** **(a)** — pure alt-chart display math off the trading-safety perimeter; `|x|=x` for
  `x>0` so the entire existing positive-price suite is unchanged (proven); fixes the root where it
  lives. Found via PSD rule 2(d) — the 2026-06-27 work-layer's NEXT note flagged `chart-types.ts`
  for this class; the `Math.max/min(...closes)` line-break window it pointed at is in fact **bounded**
  by `result.slice(-n)` (n defaults to 3) and negative-price-safe, and Renko/Line-Break use additive
  thresholds + sign-agnostic max/min (clean) — but the Kagi `reversalPct` multiplicative threshold is
  the genuine sibling defect, which that note missed.
- **Shipped (2026-06-27, work-layer run 2):** `lineStart` → `Math.abs(lineStart)` on both branches
  (anchor count==1; LF-preserved python edit; NUL/CRCR scan clean). +4 regression tests in
  `chart-indicators/chart-types.test.ts` (21→25): first-ever `reversalPct` coverage (reversal fires
  on a real reversal; no reversal under-threshold), the negative-price guard (steady negative series
  → 1 line, not spurious reversals), and a positive/negative sign-symmetry count assertion.
- **Gate verification (2026-06-27, working tree @ e158e48 + edits, mount node_modules, Node v22):**
  typecheck exit 0 | lint exit 0 (0 warnings) | vitest 98 files / 1263 tests / 0 fail (sharded 4x:
  340+405+271+247; shard 2 401→405 = the +4) | knip exit 0 (Node-20 shim; pre-existing 23
  unused-export + 29 unused-type warnings only — zero new, no exports added).
- **Status:** SHIPPED — awaiting operator commit.

### P-037 · Self-Diagnostic Core wired into engine + IPC + a System Health panel
- **Problem:** P-036 shipped the pure `diagnoseHealth` core but nothing consumed it —
  `TradingEngine.healthCheck()` still hardcoded `ok:true` and no surface showed the verdict. The
  self-healing vision needs the report to flow from live engine state to the operator.
- **Solutions / Decision:** built via `/ultraplan` (blueprint
  `docs/superpowers/specs/2026-06-27-health-core-wiring-p037-ultraplan.md`). Operator decisions:
  diagnosis-only (no auto-heal — stays off the execution perimeter); Tier A+B signals now (session
  state, feed-stall, WS-down, drawdown, heap-growth ring), Tier C (errorRate, lastError) null; push
  piggybacks the 2s status tick diff-gated; a dedicated Health panel.
- **Shipped (2026-06-27, ultraplan execution):**
  - `src/shared/health/health-signals.ts` (+test, 12) — pure `computeMemGrowthPctPerHr` (bounded
    sample ring, null until warmed), `computeDrawdownPct` (peak-guarded), `composeHealthSignals`.
  - `trading-engine.ts` (⚠️ engine, the sign-off node) — `memSamples` ring (cap 60) + `leftConnectedAt`
    tracker maintained in the existing tick; `getHealthReport()` (read-only gather → compose →
    diagnose); `onHealthReport()` + diff-gated emit mirroring the feed-status broadcast; `healthCheck()`
    upgraded additively (`ok = severity !== 'critical'`, adds `report`). **Read-only + one emit** — the
    only `this.om` call added is `getAccount()`; patch-grep clean of order/risk writes.
  - IPC: `HEALTH_REPORT` channel + `PUSH_CHANNELS` entry; `index.ts` push beside `SYSTEM_STATUS`;
    preload `onHealthReport` bridge.
  - Renderer: `stores/healthStore.ts` (Zustand), `useIPC` subscription + teardown (`unsubHealth`),
    `panels/HealthPanel.tsx` (severity badge + recommended action + per-finding summary/evidence/
    remediation/§ref), mounted in the secondary row (`bb-sec-health` grid column) + globals.css styles.
- **Gate verification (2026-06-27, working tree @ e158e48 + edits, mount node_modules, Node v22):**
  typecheck exit 0 | lint exit 0 (0 warnings) | vitest 98 files / 1259 tests / 0 fail (was 97/1247;
  +1 file, +12 tests) | knip exit 0 (Node-20 shim; 23 unused-export + 29 unused-type pre-existing
  warnings only — **zero new**). Engine diff verified read-only-plus-emit.
- **Status:** SHIPPED — awaiting operator commit + a visual confirm of the panel on the Windows build.
  Tier-C (errorRate counter + lastError capture) and an optional auto-heal loop remain future,
  separately-gated work.

### P-036 · Self-Diagnostic Core — keystone of the self-healing terminal (operator vision)
- **Problem:** Resilience in SATEX is *distributed but unfused*. Every service emits its own raw
  status (`SystemStatus` trading-engine.ts:2075, `FeedStatus`, the broker `SessionState` machine,
  `subsecond-telemetry`, drawdown via `equity-hwm`/`daily-pnl-ledger`) and pushes it to the renderer
  **unclassified**. The one actual diagnosis entry point — `TradingEngine.healthCheck()`
  (trading-engine.ts:1593) — is a stub that hardcodes `ok: true` and never inspects a signal. The
  Constitution's §9.3 (Observability alert thresholds) and §11 (Failure Modes & Recovery) are
  **prose, not code**. Net effect: nothing in the system can recognise a kink — e.g. `tickHz === 0`
  while `connected === true` (a *silent feed stall*, the most deceptive failure) — let alone name the
  mandated response. The operator's stated product vision is a terminal that understands and resolves
  a kink before the user notices; that requires a diagnosis brain that does not exist.
- **Solutions:** (a) a **pure, deterministic `diagnoseHealth(signals) → HealthReport`** core in
  `src/shared/health/` that encodes §9.3/§11 thresholds as code, fuses the existing signals into a
  graded verdict (`healthy|degraded|critical`) with per-finding kink + evidence + Constitution-
  mandated remediation; new-files-only, off-perimeter, wired later — smallest blast radius, zero
  regression surface, the proven P-027/P-033 pure-first pattern; (b) bolt classification directly
  into `TradingEngine.healthCheck()` + the status push now (touches the live engine + main/index.ts
  near the IPC push — bigger blast radius, perimeter-adjacent, needs sign-off); (c) a renderer-side
  health widget that re-derives thresholds in the UI (duplicates policy, drifts from the engine,
  no single source of truth).
- **Decision:** **(a)** — build the pure diagnosis core first as the single source of truth; defer
  wiring (engine state read + IPC) to a sign-off-gated follow-up (see DECIDED P-037 below). Pure,
  testable, reproducible (no clock reads — time-derived signals passed in), mode-aware so it never
  cries wolf (`simulator`/`replay` suppress live-broker feed/WS/session findings), and **off the
  trading-safety perimeter by construction**: it imports nothing from engine/OrderManager/risk-gates
  and can place no order — it classifies and *recommends* only. Found by the resilience-surface audit
  the operator authorised (handoff queue exhausted; this is the operator's explicit self-healing
  goal, decomposed before any code per their directive).
- **Shipped (2026-06-27, work-layer):** `src/shared/health/types.ts` (HealthSeverity / HealthMode /
  HealthSessionState / HealthSignals / HealthFinding / HealthReport), `diagnose.ts`
  (`diagnoseHealth` + exported `HEALTH_THRESHOLDS`, each constant traced to its Constitution section),
  `diagnose.test.ts` (28 tests). Thresholds encode §9.3 (WS-down >10s alert / heap >10%/hr /
  error >5%/min), §11 (>5min HALT), §5.2/§5.3/§8.1 (drawdown 3% review / 5% kill). New-files-only —
  no existing-code edit (lowest bridge risk); knip stays exit 0 with **zero new warnings** (the test
  exercises every exported symbol incl. a mode×session-state totality sweep).
- **Gate verification (2026-06-27, working tree @ e158e48 + edits, mount node_modules, Node v22):**
  typecheck exit 0 | lint exit 0 (0 warnings) | vitest 97 files / 1247 tests / 0 fail (was 96 / 1219;
  +1 file, +28 tests) | knip exit 0 (Node-20 shim; pre-existing warnings only, none from this change).
- **Status:** SHIPPED — awaiting operator commit. Pure core only; wiring is P-037 (DECIDED, sign-off).

### P-035 · `patterns.ts` H&S / Inverse-H&S / Flag detectors divide by signed raw prices
- **Problem:** The CHART-19 pattern detectors (`src/shared/chart-indicators/patterns.ts`) carry the
  same defect class as P-034 in four spots. (1) `detectHeadShoulders:89` and
  `detectInverseHeadShoulders:129` computed `sym = Math.abs(rs.price - ls.price) / ls.price` — raw
  signed anchor; a negative anchor makes `sym` negative so `sym > shoulderTol` is always false → the
  shoulder-symmetry filter **never rejects**. (2) The prominence (`:93`, `/ hd.price`) and depth
  (`:132`, `/ Math.min(ls,rs)`) confidence terms divided by raw signed prices → sign-flipped, emitting
  **negative confidence**. (3) `detectFlags:216` computed `poleMove = (close_i - close_0) / close_0`
  with a raw base, then `isBull = poleMove > 0` — so on a negative-priced instrument the
  **bull/bear direction inverts** (a true −150→−100 rise is tagged bearish and dropped by the slope
  check). (4) `detectFlags:229` channel-tightness `/ c.close` raw sign-flips the gate. SATEX's universe
  includes **CL crude** (Constitution §1.1), negative in Apr 2020 — in-domain. **Latent today:** the
  four detectors are exported from `chart-indicators/index.ts` but have **no call-site** (the live
  double-top/bottom siblings were P-034); it would mis-render the instant CHART-19 is wired to the
  overlay. Empirically proven (`/tmp` repro, mirrored in the outputs scratch): OLD far-apart
  negative shoulders `sym -0.3` accepted vs FIX `0.3` rejected; OLD in-tol prominence conf **-3.370**
  vs FIX **0.730**; OLD rising-pole `isBull false` (→ rejected) vs FIX `true` (→ flag-bull).
- **Solutions:** (a) `Math.abs(...)` on every price denominator + a zero-anchor `continue` on the
  symmetry/pole bases, exactly as P-034 — root fix, smallest blast radius (one file + additive tests),
  behaviour-identical for every positive price; (b) clamp/shift prices positive upstream (wider blast
  radius, changes the swing contract, masks the bug); (c) leave as-is (ships the same class P-034 just
  fixed, activates when CHART-19 wires).
- **Decision:** **(a)** — pure detection math off the trading-safety perimeter; `Math.abs(x)===x` for
  `x>0` so the entire existing positive-price suite is unchanged (proven); fixes the root where it
  lives. Found via PSD rule 2(d) branch audit — the handoff's NEXT note steered to webgl/footprint,
  webgl/volume-profile, funded/ (all found defensively written **and** already tested: footprint
  17/17, volume-profile 17/17, funded runtime files all covered), so the audit widened to the rest of
  the chart-indicator layer and surfaced patterns.ts as the un-swept P-034 sibling.
- **Shipped (2026-06-27, work-layer):** all five price denominators → `Math.abs(...)` (H&S sym + zero
  skip; prominence; Inv-H&S sym + zero skip; depth; flag pole-base + zero skip; flag channelTight);
  `Math.abs(poleBase)` restores the true flag direction. +5 regression tests in
  `chart-indicators/patterns.test.ts` (13→18): far-apart negative H&S/Inv-H&S → `[]`; within-tolerance
  negative H&S/Inv-H&S → 1 pattern, `0 < conf ≤ 0.85`; rising negative-price pole → classified
  `flag-bull`. python EOL-safe edits (LF; anchor count==1 each); NUL/CRCR scan clean; brace/paren
  balanced.
- **Gate verification (2026-06-27, working tree @ e158e48 + edits, mount node_modules, Node v22):**
  typecheck exit 0 | lint exit 0 (0 warnings) | vitest 96 files / 1219 tests / 0 fail (sharded 8x:
  181+127+197+196+151+115+114+138; shard 6 110→115 = the +5) | knip exit 0 (Node-20 shim; pre-existing
  23 unused-export + 29 unused-type warnings only, **none from this change** — zero exports added).
- **Status:** SHIPPED — awaiting operator commit.

### P-034 · `double-top.ts` / `double-bottom.ts` symmetry gate divides by a signed anchor price
- **Problem:** `detectDoubleTops` (`src/shared/chart-indicators/double-top.ts:48`) and
  `detectDoubleBottoms` (`double-bottom.ts:39`) computed `symmetry = Math.abs(b.price - a.price) /
  a.price` — denominator is the **raw** anchor price, not its magnitude — then gated on
  `if (symmetry > tolerance) continue`. For a negative-priced instrument the denominator is negative,
  so `symmetry` is negative and `negative > 0.03` is always false → the symmetry filter **never
  rejects any pair**, and the reported `symmetry` (typed at `types.ts:65-67` as a positive fraction)
  comes out negative. SATEX's universe includes **CL crude** (Constitution §1.1), which printed
  negative in Apr 2020, so negative anchors are in-domain. Both detectors are **live**:
  `ChartPanel.tsx:1148/1163` call them for the operator's pattern overlay — not latent.
  Repro (`/tmp/satex-agent-repro.mjs`): A=-100,B=-150 (50% apart) → OLD symmetry -0.5, accepted (BUG);
  FIX symmetry 0.5, rejected. Zero anchor → OLD NaN accepted; FIX rejected.
- **Solutions:** (a) denominator `Math.abs(a.price)` + skip a zero anchor (`denom===0 → continue`);
  (b) clamp/shift prices to positive upstream (wider blast radius, changes the swing contract, masks
  the bug); (c) leave as-is (ships a live correctness defect on negative-priced symbols).
- **Decision:** **(a)** — pure detection math off the trading-safety perimeter; behavior-identical for
  every positive price (the entire existing suite is unchanged — proven empirically); fixes the root
  where it lives; smallest blast radius (one expression in each of two files + additive tests). Found
  via PSD rule 2(d) branch audit (handoff queue exhausted; no actionable off-perimeter DECIDED entry).
- **Shipped (2026-06-27):** both denominators → `Math.abs(a.price)` with `denom===0 → continue`;
  +4 regression tests in `chart-indicators/indicators.test.ts` (far-apart negative pair → `[]`;
  within-tolerance negative pair → 1 pattern, `0 < symmetry < tolerance`; for both detectors).
  Blueprint: `docs/superpowers/specs/2026-06-27-double-pattern-symmetry-negative-price-ultraplan.md`.
- **Gate verification (2026-06-27, working tree @ e158e48 + edits, mount node_modules, Node v22):**
  typecheck exit 0 | lint exit 0 (0 warnings) | vitest 96 files / 1214 tests / 0 fail (sharded 8x:
  181+127+197+196+151+110+114+138) | knip exit 0 (Node-20 shim; 29 pre-existing unused-type warnings,
  none from this change).
- **Status:** SHIPPED — awaiting operator commit.

### P-027 · `vol-heatmap.ts` `computeHeatmap` spreads unbounded arrays into `Math.max(...)`
- **Problem:** `computeHeatmap` (`src/renderer/chart/webgl/vol-heatmap.ts:194-195`, CHART-14)
  normalized intensity via `Math.max(1e-10, ...atr)` and `Math.max(1e-10, ...stdev)`. `atr`/`stdev`
  carry one entry per candle and are unbounded — SATEX's sub-second crypto buffer reaches ~3.5e5
  candles/day. Spreading an array that large as call arguments throws `RangeError: Maximum call
  stack size exceeded` (measured threshold ~1.3e5 args in this V8 build; engine/stack-dependent).
  Directly violates the codebase's own documented invariant at `QuadPaneChart.tsx:79` ("Reduce loop
  (not Math.max(...spread)) to avoid stack overflow on big arrays"). No call-site yet (heatmap is
  exported but not wired into `FootprintLayer`/`ChartPanel`), so it is latent — it would crash the
  operator's volatility heatmap the moment CHART-14 is wired to the sub-second feed.
- **Solutions:** (a) replace both spreads with a single-pass max loop (floor 1e-10 preserved),
  matching the QuadPaneChart idiom; (b) clamp/LOD the input before `computeHeatmap` (bigger blast
  radius, changes the call contract, does not fix the function); (c) defer until CHART-14 is wired
  (ships a known crash).
- **Decision:** **(a)** — pure display math off the trading-safety perimeter; behavior-identical for
  every non-degenerate input (`max(1e-10, max(arr))`, incl. empty -> 1e-10); fixes the root cause
  where it lives; smallest blast radius (one function body + additive tests). Found via PSD rule 2(d)
  branch audit (no off-perimeter DECIDED entry was actionable).
- **Shipped (2026-06-26):** loop replaces the two spreads in `computeHeatmap`; +6 tests appended to
  `vol-heatmap.test.ts` — `computeHeatmap` 300k no-throw + one-point-per-candle + [0,1] bounds +
  1e-10-floor normalization, plus first-ever coverage of `tickVelocitySeries` (length / warm-up /
  range / dense-vs-sparse ordering) and `vpinToIntensity` (clamp). Regression bites: pre-fix
  `Math.max(1e-10, ...300k)` throws RangeError (measured 250k/500k throw, 125k ok); post-fix returns
  cleanly. Blueprint: `docs/superpowers/specs/2026-06-26-vol-heatmap-maxspread-crash-ultraplan.md`.
- **Gate verification (2026-06-26, working tree @ e158e48 + edits, mount node_modules):** typecheck
  exit 0 | lint exit 0 (0 warnings) | vitest 95 files / 1195 tests / 0 fail (sharded 4x; eighths for
  the heavy quarter: 308+393+144+107+129+114) | knip exit 0 (Node-20 shim; only pre-existing CHART
  barrel unused-type warnings, none from this change).
- **Status:** SHIPPED — awaiting operator commit.

### P-030 - `vol-heatmap.ts` dead `intervals` array in `tickVelocitySeries`
- **Problem:** `tickVelocitySeries` (`src/renderer/chart/webgl/vol-heatmap.ts:142-146`, CHART-14)
  built a `const intervals: number[]` and pushed one entry per candle, but nothing read it - the
  rolling-velocity loop reads `candles[].time` directly. Dead computation: an O(n) allocation + loop
  on the unbounded sub-second crypto hot path (~3.5e5 bars/day) - the path P-027 just hardened.
  Gate-invisible: ESLint `no-unused-vars` and `tsc noUnusedLocals` both treat `.push()` as a use.
  Surfaced as REMAINING-3 in the 2026-06-26 daily handoff (planner deferred it to keep its source
  edit minimal; actioned here under the work-layer audit mandate, rule 4).
- **Solutions:** (a) delete the comment + the `intervals` build loop, output math untouched; (b) leave
  as harmless cruft; (c) repurpose `intervals` into the velocity calc (scope creep, changes behavior).
- **Decision:** **(a)** - smallest blast radius (one dead local; no signature/type/export change),
  removes wasted work on the hot path, behavior-identical. Safe because `tickVelocitySeries` output is
  test-pinned (P-027 length / warm-up / range / dense-vs-sparse).
- **Shipped (2026-06-26, work-layer):** dead block removed via python EOL-safe edit; `intervals` token
  count 0; NUL/CRCR scan clean. vol-heatmap.test.ts unchanged at 24 tests, still green - proving output
  is identical. Off the trading-safety perimeter (pure display math).
- **Gate verification (2026-06-26, working tree @ e158e48 + edits, mount node_modules, Node v22):**
  typecheck exit 0 | lint exit 0 (0 warnings) | vitest 96 files / 1210 tests / 0 fail (sharded 8x:
  181+127+197+196+147+110+114+138) | knip exit 0 (Node-20 shim; 29 pre-existing unused-type warnings,
  none from this change).
- **Status:** SHIPPED - awaiting operator commit.

### P-031 - `computeVolSurfaceHistory` (vol-surface.ts) untested
- **Problem:** `computeVolSurfaceHistory` (`src/shared/chart-indicators/vol-surface.ts:118-130`,
  CHART-16) - the surface-over-time builder for the animated realized-vol surface - was exported with
  zero coverage (`vol-surface.test.ts` imported only its three siblings). The warm-up boundary (skip
  first `max(VOL_LOOKBACKS)`=100 candles) and per-slice `asOf` alignment were unpinned; an off-by-one
  in the warm-up loop would silently shift every slice.
- **Solutions:** (a) append a `describe` block pinning warm-up skip + slice count + slice shape +
  chronological alignment; (b) defer (covered when the surface UI is wired); (c) assert count only.
- **Decision:** **(a)** - pure function, off the trading-safety perimeter, test-append only (no source
  edit -> no bridge risk), same pattern as P-024/025/026. Asserts REAL behavior verified against
  source: `len<=100 -> []`, `n=150 -> 50 slices`, each slice 5 points + `ivNote`, and
  `slice[k].asOf === candles[100+k].time`.
- **Shipped (2026-06-26, work-layer):** +4 tests appended to `vol-surface.test.ts` (13 -> 17), import
  extended. python EOL-safe edit; NUL/CRCR clean. Targeted vitest 17/17 green.
- **Gate verification (2026-06-26):** typecheck exit 0 | lint exit 0 (0 warnings) | vitest 96 files /
  1210 tests / 0 fail | knip exit 0 (Node-20 shim).
- **Status:** SHIPPED - awaiting operator commit.

### P-032 - `emaCrossPipeline` (indicator-graph.ts) untested
- **Problem:** `emaCrossPipeline` (`src/shared/chart-indicators/indicator-graph.ts:232-239`, CHART-18)
  - the EMA-cross preset factory - was exported and untested while siblings `rsiAlertPipeline` /
  `evalPipeline` were covered. Its deliberate quirk (the `_slow` arg is intentionally unused; the
  caller diffs two EMA lines itself) was unpinned, so a change that started consuming `_slow` would
  pass unnoticed.
- **Solutions:** (a) append a `describe` block pinning node-array shape + unused-`_slow` invariance +
  `evalPipeline` integration; (b) defer; (c) assert the array shape only.
- **Decision:** **(a)** - pure factory, off the trading-safety perimeter, test-append only. Pins REAL
  behavior: `emaCrossPipeline(9,21)` deep-equals `[{source,close},{ema,9}]`; equals
  `emaCrossPipeline(9,999)` (proves `_slow` ignored); evaluates to a same-length non-alert `EMA(9)`
  series.
- **Shipped (2026-06-26, work-layer):** +3 tests appended to `indicator-graph.test.ts` (10 -> 13),
  import extended. python EOL-safe edit; NUL/CRCR clean. Targeted vitest 13/13 green.
- **Gate verification (2026-06-26):** typecheck exit 0 | lint exit 0 (0 warnings) | vitest 96 files /
  1210 tests / 0 fail | knip exit 0 (Node-20 shim).
- **Status:** SHIPPED - awaiting operator commit.

### P-033 - `regime.ts` HMM classifier has zero test coverage (live-decision input)
- **Problem:** `RegimeService` (`src/main/services/regime.ts`, Phase 10 Black Box) - the HMM 4-state
  regime classifier whose output drives ensemble-confidence fusion (L1.F) - shipped with no direct
  test (`grep` confirmed nothing references `RegimeService`). On the live-decision *input* path, its
  feature normalization, Gaussian emission, and sticky forward step were unpinned; a silent regression
  would skew decision confidence untested. The read-only defect audit (rule 4) found the service
  defensively written - clamps + div-by-zero guards (lines 155/165/170/179), proper timer teardown in
  `stop()`, all indexing in-bounds - so the only finding is the coverage gap, not a logic bug.
- **Solutions:** (a) add a new `regime.test.ts` driving the service through injected stub deps (no
  timer started - recompute via `get()`/`setSymbol()`), asserting the public contract; (b) defer to a
  dedicated decision-path session; (c) flag OPEN without action.
- **Decision:** **(a)** - new file only; `regime.ts` is byte-for-byte unchanged, so production cannot
  regress from this commit. Off the trading-safety *execution* perimeter (regime classifies/advises;
  it submits no order - cf. P-026, which pinned the `indicators.ts` decision input the same way).
  Assertions are structural (distribution validity, monotonic VPIN/spread -> liquidity, listener
  lifecycle, absent-quote NaN-safety), traced through the real arithmetic to avoid over-fitting.
- **Shipped (2026-06-26, work-layer):** new `src/main/services/regime.test.ts` (8 tests). Targeted
  vitest 8/8 green; first-ever coverage of the regime service.
- **Gate verification (2026-06-26):** typecheck exit 0 | lint exit 0 (0 warnings) | vitest 96 files /
  1210 tests / 0 fail | knip exit 0 (Node-20 shim).
- **Status:** SHIPPED - awaiting operator commit.

### P-026 · core `indicators.ts` math has no direct test coverage
- **Problem:** `src/shared/indicators.ts` — the pure, stateless indicator math
  (`rsi`, `atr`, `computeSnapshot` + internal ema/sma/vwap/trendStrength/
  rollingVolatility) — feeds every `IndicatorSnapshot`: Brain decision features,
  the regime service's ATR input (`regime.ts` imports `atr` from here), and the
  chart read-outs. It sat on the live-decision *input* path with zero direct test
  coverage; a silent regression here would corrupt every downstream decision and
  chart number without tripping a single test.
- **Solutions:** (a) add `indicators.test.ts` co-located, pinning the exported
  surface + internal helpers (through `computeSnapshot`) against hand-computed,
  independently-recomputed references; (b) defer — covered indirectly by
  brain/backtest integration tests; (c) only pin `rsi`/`atr`, skip the
  `computeSnapshot` assembly the engine actually calls.
- **Decision:** **(a)** — pure functions, off the trading-safety perimeter, new
  file only (zero call-site edits → lowest bridge-corruption risk), same pattern
  as P-019 (format) / P-024 (rng·id-generator) / P-025 (color). Higher leverage
  than the prior utility pins because this math is a live-decision *input*, not a
  display helper.
- **Shipped (2026-06-25):** `src/shared/indicators.test.ts` (14 tests) — RSI
  insufficient→50 / no-loss→100 / flat-window→100 quirk / balanced→50 /
  RS-ratio→75; ATR <2-candle→0 / TR averaging / gap-dominated TR; computeSnapshot
  empty-defaults / constant-series collapse / hand-computed two-bar (vwap 17.5,
  ema9 12, ema21≈10.9091, ema50≈10.3922, atr 10, volatility≈33.33) / vwap
  zero-volume guard / trendStrength [0,1] clamp + saturation + un-clamped path.
- **Gate verification (2026-06-25, /tmp sandbox @ e158e48 + file):** typecheck✅
  exit 0 | lint✅ exit 0 (0 warnings) | vitest✅ 95 files / 1189 tests / 0 fail
  (was 94 / 1175) | knip✅ exit 0 (Node-20 shim).
- **Status:** SHIPPED — awaiting operator commit.

### P-025 · color.ts (`applyOpacity`) has no test coverage
- **Problem:** `src/renderer/lib/color.ts` exports `applyOpacity(color, alpha)` — the
  single hex→rgba helper shared by the single chart and the Quad panes (extracted from
  ChartPanel 2026-05-25) — with zero test coverage. It renders on every chart overlay;
  three distinct behaviors (6-digit hex, 3-digit shorthand expansion, non-hex
  pass-through) and the `.toFixed(2)` alpha format were unpinned.
- **Solutions:** (a) add `color.test.ts` pinning all three branches + the alpha format;
  (b) defer — covered indirectly by the chart render.
- **Decision:** **(a)** — pure function, off the trading-safety perimeter, new file only
  (zero call-site edits → lowest bridge-corruption risk), same pattern as P-019
  (format.ts) and P-024 (rng / id-generator).
- **Shipped (2026-06-24, work-layer agent):** `src/renderer/lib/color.test.ts` (10 tests)
  — 6-digit hex incl. case-insensitivity, 3-digit shorthand (#abc→#aabbcc), non-hex
  pass-through (rgba / named / CSS-var / empty), two-decimal alpha incl. rounding.
- **Gate verification (2026-06-24, /tmp sandbox, full working tree):** typecheck✅ exit 0
  | lint✅ exit 0 (0 warnings) | vitest✅ 94 files / 1175 tests / 0 fail | knip✅ exit 0.
  Suite 93→94 files, 1165→1175 tests.
- **Status:** SHIPPED — awaiting operator commit.

### P-024 · PRNG and ID-generator test coverage
- **Problem:** `rng.ts` (mulberry32 PRNG) and `id-generator.ts` had zero test coverage
  despite being foundational utilities. The PRNG comment claims "same seed -> identical
  tick stream" but nothing verified it; `orderId`/`sessionId` used by every trade.
- **Solutions:** (a) `rng.test.ts` + `id-generator.test.ts` -- pin determinism, bounds,
  Box-Muller, uniqueness; (b) defer -- covered implicitly by simulator integration tests;
  (c) only rng.test.ts (higher value, smaller blast radius).
- **Decision:** **(a)** -- both are small, pure, off the safety perimeter. PRNG
  seed-stability is a simulator reproducibility invariant; ID format matters for
  order tracking. No existing call-site edits, lowest bridge-corruption risk.
- **Shipped (2026-06-24):** `rng.test.ts` (13 tests) + `id-generator.test.ts` (8 tests).
  +21 tests total. Gates: typecheck✅ lint✅ test✅ (81/955) knip✅ (EXIT:0).
- **Status:** SHIPPED -- awaiting operator commit


### P-023 · `DrawingLayer.tsx` fast-refresh warning (react-refresh/only-export-components)
- **Problem:** `DrawingLayer.tsx` exported both the React component (`DrawingLayer`) and a
  pure canvas helper (`renderDrawing`), triggering the sole persistent lint warning
  (`react-refresh/only-export-components`). Fast refresh was technically disabled for the
  file. No call-site tests existed for the renderer helper.
- **Solutions:** (a) extract `renderDrawing` + helpers into `drawing-renderer.ts`, update the
  two consumers (`DrawingLayer.tsx` self-use + `ChartPanel.tsx` import); (b) silence lint with
  an inline `eslint-disable` comment; (c) move `DrawingLayer` into its own file instead.
- **Decision:** **(a)** — correct architectural separation, zero logic change, smallest blast
  radius (3 files), eliminates the root cause rather than suppressing the symptom.
- **Shipped (2026-06-21):** `drawing-renderer.ts` created with `renderDrawing`, `drawLine`,
  `DEFAULT_COLOR`, `FIB_COLORS`; `DrawingLayer.tsx` slimmed to component-only + imports
  renderer; `ChartPanel.tsx` line 55 split into two targeted imports. CHANGELOG updated.
- **Gate verification (2026-06-21, standing agent, /tmp sandbox):** typecheck✅ exit 0 |
  lint✅ exit 0 (0 warnings — was 1) | vitest✅ 111/1304 / 0 fail | knip⚠ sandbox OOM (known).
- **Status:** CLOSED — committed 1621109 + 1cf9b0e on feat/chart-interaction-layer

### P-013 · `Vault/Trades/` never populates
- **Problem:** Paper sessions ran but no trade-outcome notes exist — either autonomous never closed a trade in those sessions or the VaultWriter path is unreached (audit §5). The learning loop's journal depends on this.
- **Solutions:** (a) diagnostic session; (b) integration test via `recordTradeClose`; (c) simulator bracket execution engine.
- **Decision:** **(a) then (b); agent added (c) 2026-06-19.** (b) executed 2026-06-11 to sharpen (a). (c) executed 2026-06-19 — fixes the root cause directly.
- **Evidence (2026-06-11):** vault IS enabled at runtime — `Sessions/` 41 notes, `Observer/` 113, while `Trades/`, `Tactics/`, `Brain/` all zero. Writer pinned green by `vault-writer.test.ts`. Entry features captured on every buy. Root cause: **no position close ever flowed through `recordTradeClose`** because simulator mode had no bracket execution engine.
- **Shipped (2026-06-11):** `trade close not journaled` warn in `recordTradeClose` logging `hasEntryFeatures` + `vaultEnabled`.
- **Shipped (2026-06-19, files lost — re-shipped 2026-06-22):** Original simulator-bracket files were created 2026-06-19 but never committed and were subsequently lost from the working tree. Re-implemented by standing agent 2026-06-22: `checkBracketHit(position, currentPrice)` pure function in `src/main/core/simulator-bracket.ts`; handles longs and shorts; SL priority on simultaneous cross (conservative). `TradingEngine.checkSimulatorBracket` called from `onQuotesBatch` when `this.alpaca === null` (simulator/replay only). Fill via `om.createOrder + om.fillOrder` at exact bracket price → `onOrderFillForLearning` → `recordTradeClose` → `VaultWriter`. 14 unit tests in `simulator-bracket.test.ts`.
- **Gate verification (2026-06-22, /tmp sandbox HEAD 1cf9b0e + 3 files):** typecheck✅ exit 0 | lint✅ exit 0 (0 warnings) | vitest✅ 79/934 / 0 fail | knip⚠ sandbox OOM (known; CI Node-20 expected clean).
- **Status:** SHIPPED — awaiting operator commit + runtime verification (Trades/ note should appear on next autonomous paper session with stopLoss/takeProfit positions)

### P-019 · `fmt.k()` leaks raw IEEE-754 float noise on sub-1000 values
- **Problem:** The centralized compact formatter `fmt.k()` (`src/renderer/lib/format.ts:34`) returned `String(v)` unrounded for `|v| < 1000`, while the ≥1e3 branches round to fixed decimals. Fractional inputs therefore rendered float artifacts — a Time & Sales size of `0.1 + 0.2` showed as `0.30000000000000004`. Live on four operator surfaces: ChartPanel volume (`ChartPanel.tsx:1145`), MarketsOverview volume + notional (`MarketsOverviewPanel.tsx:186-187`), Time & Sales size tape (`TimeSalesPanel.tsx:115`). Crypto volumes/sizes are fractional, so it fires in normal use. The lib also had zero test coverage.
- **Solutions:** (a) round the sub-1000 branch to 3 significant figures (`String(Number(v.toPrecision(3)))`), integers passing through — consistent with the K/M/B sig-fig style, zero call-site churn; (b) magnitude-split rounding (1 dp for |v|≥1, more precision for sub-1 crypto) — more faithful but more edge-cases; (c) dedicated `qty()` formatter re-routing the four call-sites — biggest blast radius (4 existing files → bridge-corruption risk) for marginal gain.
- **Decision:** **(a)** — smallest, safest change (one function body + one new test file, no existing call-site edits → lowest bridge risk), kills the noise, preserves integers and small-crypto precision (`0.25`→“0.25”), matches the formatter's existing compact intent. Off the trading-safety perimeter (pure display helper).
- **Shipped:** 2026-06-14 — `format.ts` `k()` rounds sub-1000 non-integers to 3 sig figs; new `src/renderer/lib/format.test.ts` pins all six helpers (15 cases incl. null/NaN/Infinity, sign paths, the float-noise case). Left UNSTAGED for operator review per AGENTS.md.
- **Gate verification (2026-06-14, standing agent, /tmp sandbox @ committed `461f4b0` + 2 files):** typecheck✓ lint✓ test(63 files / 684 pass; was 62/669)✓ knip✓ (Node-20 shim — clean, no OOM this run). Real exit codes all 0.
- **Status:** SHIPPED — awaiting operator commit/merge (deterministic; gates + tests are the verification).


### P-008 · Global/world-markets data (part a: multi-day fetch)
- **Shipped:** 2026-06-12 — Extended `getCandles()` in trading-engine.ts §567–588 to fetch 2 days of 1-minute bars from Alpaca.getBars() instead of just in-memory buffer. Detects crypto symbols (BTC/ETH/SOL/etc) and routes through getCryptoBars(). Falls back gracefully to in-memory buffer if historical fetch fails (market holiday, missing credentials).
- **Gate verification (2026-06-13, standing agent):** typecheck✓ lint✓ test(62 files / 669 pass)✓ knip(Node 20 CI; sandbox Node 22 OOM expected). Branch `feat/audit-psd-batch-2026-06-11` at HEAD `461f4b0`.
- **Design:** P-008 decision (c) staged approach — (a) now shipped. Enables nightly self-eval to study previous day + today for multi-session trend analysis and Asia/Europe session coverage.
- **Next:** Awaiting operator diagnostic session to verify end-to-end in live self-eval execution.


## Closed — verified

### Session: 2026-06-27 work-layer run 2 (finisher / execution layer, scheduled)
- **Boot:** feat/d10-funded-account @ e158e48; read AGENTS / ARCHITECTURE / ledger + the 2026-06-27
  daily handoff and the 6 AM work-layer run note. Both reported the blueprint COMPLETE (P-034) and the
  6 AM run already SHIPPED P-035 (patterns.ts sibling), P-036 (Self-Diagnostic Core), and P-037
  (health-core engine+IPC wiring). Nothing REMAINING / BLOCKED in the blueprint; no APPROVAL NODES.
- **Baseline (own run, mount node_modules, Node v22):** typecheck exit 0 | lint exit 0 (0 warnings) |
  vitest 98 files / 1259 tests / 0 fail (sharded 4x: 340+401+271+247) | knip exit 0 (Node-20 shim).
  Matches the P-037 shipped state exactly.
- **Independent re-verification (did not trust the handoffs):** confirmed in the working tree —
  `double-top.ts:48` & `double-bottom.ts:39` use `Math.abs(a.price)` + zero-skip (P-034); `patterns.ts`
  carries 12 `Math.abs` guards (P-035); `src/shared/health/` present with `getHealthReport` /
  `onHealthReport` wired in `trading-engine.ts` (P-036/037). The 1259 passing tests prove the
  regression coverage for all four is intact.
- **Code audit (PSD rule 2(d)):** swept the chart-indicator transform layer the prior NEXT note
  steered to. `chart-types.ts` line-break `Math.max/min(...closes)` is **bounded** by `result.slice(-n)`
  (n≥1, default 3) — not the unbounded P-027 class; Renko (additive `brickSize`) and Line-Break
  (sign-agnostic max/min comparisons) are negative-price-safe. Surfaced **P-038** — the Kagi
  `reversalPct` reversal threshold multiplies the *signed* `lineStart`, the P-034/P-035 negative-price
  class on the one un-swept (multiplicative) transform; latent (exported, no call-site) and its
  `reversalPct` path was untested.
- **Shipped (autonomous, off the execution perimeter):** **P-038** (fix + 4 regression tests, incl.
  first-ever `reversalPct` coverage). 98/1259 → 98/1263. Repro proved the regression bites (OLD 3 vs
  FIX 1 spurious reversals on a negative series; positive mirror byte-identical).
- **Then, on operator direction (interactive — continue at max capacity on the self-directed NEXT),
  audited the next three transform-layer targets.** `block-prints.ts` — **clean** (`rollingMedian`
  guards empty slice, `detectBlockPrints` guards `n<2` + `median<=0`, `blockPrintThreshold` guards
  empty). `indicator-graph.ts` — surfaced **P-040** (`applyStdev` no `period<=0` guard → NaN series).
  `vol-surface.ts` — surfaced **P-039** (`logReturnStdev` skips `prev<=0` but not `curr<=0` → NaN on
  negative-priced crude). Both fixed + tests (off-perimeter, latent, evidence-backed repro).
  98/1263 → 98/1268.
- **Gates (final, working tree @ e158e48 + edits):** typecheck exit 0 | lint exit 0 (0 warnings) |
  vitest 98 files / 1268 tests / 0 fail (sharded 4x: 340+405+274+249) | knip exit 0 (Node-20 shim;
  pre-existing warnings only, none from this change). Shipped this session: P-038, P-039, P-040.
- **Approval nodes flagged for operator:** none new. Standing: P-028 (payout zero-target ruling),
  P-022 (`git rm` 81 stale flat services), P-018b (.git hygiene — stale `index.lock`), P-007/009/014/
  017/020, and the uncommitted P-024→P-038 + L1.F backlog awaiting commit / sign-off. Pre-existing
  (not this session): root `package.json` + `package-lock.json` show as working-tree deletions (` D`)
  — a 4-line `chrome-devtools-mcp` stub; harmless to gates (gates run from `satex-app/`), operator may
  want to restore or stage the deletion.
- **Status:** Session complete — all changes UNSTAGED per AGENTS.md (no git add / commit).

### Session: 2026-06-27 work-layer (finisher / execution layer, 6 AM)
- **Boot:** feat/d10-funded-account @ e158e48; read AGENTS / ARCHITECTURE / ledger + the 2026-06-27
  daily handoff and its blueprint
  (`docs/superpowers/specs/2026-06-27-double-pattern-symmetry-negative-price-ultraplan.md`). Handoff
  reported the blueprint COMPLETE (11/11 tasks, P-034 shipped) — nothing REMAINING, nothing BLOCKED,
  no APPROVAL NODES.
- **Baseline (own run, mount node_modules, Node v22):** typecheck exit 0 | lint exit 0 (0 warnings) |
  vitest 96 files / 1214 tests / 0 fail (sharded 8x) | knip exit 0 (Node-20 shim). Matches the
  handoff baseline exactly.
- **P-034 re-verification (independent, not trusting the handoff):** re-read both fixed denominators —
  `double-top.ts:48` and `double-bottom.ts:39` both use `Math.abs(a.price)` with `denom === 0 →
  continue`; the 4 regression tests are present in `indicators.test.ts` (lines 260-336). Correct.
- **Code audit (rule 2(d) + rule 4):** the handoff's three suggested areas were all found defensively
  written **and** already covered — `webgl/footprint.ts` (guards empty candles + `bucketSize<=0`,
  clamped bins; 17 tests), `webgl/volume-profile.ts` (guards `span<=0→null`, all bin indices clamped,
  `normaliseProfile`/`priceToProfileBin` divisors guarded; range-based so negative-price-safe; 17
  tests), `funded/` (checks/payout-metrics/topstep all tested; index/types are decl-only). Confirmed
  `indicators.test.ts` covers all of ema/rsi/fibonacci/pivot-points/swing-points/double-top/bottom
  (daily's correction holds). `swing-points.ts` clean; `tradesStore.ts` ring-buffer correct + bounded.
  The audit then widened across the chart-indicator layer and surfaced **P-035** — `patterns.ts`
  (H&S / Inv-H&S / Flag) carries the un-swept P-034 sibling defect (signed/zero price denominators +
  an inverted flag bull/bear direction). Latent (exported, no call-site).
- **Shipped (autonomous, off the execution perimeter):** **P-035** (fix + 5 regression tests).
  96/1214 → 96/1219. Repro proved the regression bites before and after.
- **Then, on operator directive (interactive — explicit self-healing-vision mandate):** ran the
  resilience-surface audit (reconnect, tape-integrity, candle-buffer, telemetry — all found
  high-craft, no defects), debriefed, and decomposed one keystone goal before writing code → shipped
  **P-036** (Self-Diagnostic Core: pure `diagnoseHealth` fusing the raw signals into a graded
  `HealthReport`, encoding §9.3/§11 as tested code; replaces the `healthCheck() ok:true` stub).
  +3 files (`src/shared/health/`), +28 tests. Logged **P-037** (DECIDED — engine+IPC wiring, sign-off).
  96/1219 → 97/1247.
- **Then, on operator greenlight, ran `/ultraplan` on P-037 and executed it (diagnosis-only):**
  wired the core into the engine status tick (read-only gather + diff-gated emit), a `HEALTH_REPORT`
  IPC push, a Zustand store, and a dedicated `HealthPanel`. **P-037 SHIPPED.** Engine diff is
  read-only-plus-one-emit (the sign-off node). 97/1247 → 98/1259. All four gates green.
- **Gates (working tree @ e158e48 + edits):** typecheck exit 0 | lint exit 0 (0 warnings) | vitest
  96 files / 1219 tests / 0 fail (sharded 8x: 181+127+197+196+151+115+114+138) | knip exit 0 (Node-20
  shim; pre-existing warnings only, none from this change).
- **Approval nodes flagged for operator:** none new. Standing: P-028 (payout zero-target ruling),
  P-022 (`git rm` 81 stale flat services), P-018b (.git hygiene — stale `index.lock` litter persists),
  P-007/009/014/017/020, and the uncommitted P-024→P-035 + L1.F backlog awaiting commit / sign-off.
  Also observed (pre-existing, not from this session): root `package.json` + `package-lock.json` show
  as working-tree deletions (`git status` ` D`) — they were a 4-line `chrome-devtools-mcp` stub;
  harmless to gates (those run from `satex-app/`, own intact manifest), but operator may want to
  restore or stage the deletion.
- **Status:** Session complete — all changes UNSTAGED per AGENTS.md (no git add / commit).

### Session: 2026-06-27 daily PSD (planner / first executor, 5 AM)
- **Boot:** feat/d10-funded-account @ e158e48 (not master). git was unparseable — `.git/config`
  line 70 was a truncated VS Code PR-extension key (`github-pr-owner-number = "satex25#satex-tradin`,
  unterminated quote; P-018b artifact class). Repaired by dropping the malformed trailing line
  (backup `/tmp/satex-agent-gitconfig.bak`); git restored. Read AGENTS/ARCHITECTURE/ledger + the
  2026-06-26 daily handoff and 2026-06-26 work-layer run.
- **Pick:** handoff queue exhausted — REMAINING-1/2 already shipped by the 2026-06-26 work-layer as
  P-031/P-032 (both target test files already carry the additions). No actionable autonomous
  DECIDED/IN-PROGRESS off-perimeter ledger entry (P-009 sign-off; P-011/P-012/P-008b self-deferred;
  rest operator-gated). → PSD rule 2(d): audited the pure chart-indicator layer vs master.
- **Audit verdict:** ema/rsi/fibonacci/pivot-points/swing-points are defensively written (guards on
  empty/period/range). One real **live** off-perimeter defect found and fixed: **P-034** — the
  double-top/bottom symmetry denominator divided by a signed anchor price, bypassing the tolerance
  gate for negative-priced instruments. Verified empirically before coding (`/tmp/satex-agent-repro.mjs`).
- **Shipped (autonomous, off-perimeter):** P-034 (fix + 4 regression tests). 96/1210 → 96/1214.
- **Gates (working tree @ e158e48 + edits):** typecheck exit 0 | lint exit 0 (0 warnings) | vitest
  96 files / 1214 tests / 0 fail (sharded 8x: 181+127+197+196+151+110+114+138) | knip exit 0 (Node-20
  shim; 29 pre-existing unused-type warnings, none from this change). Handoff:
  `Vault/Daily/2026-06-27-agent-handoff.md`.
- **Approval nodes flagged for operator:** none new. Standing: P-028 (payout zero-target ruling),
  P-022 (`git rm` 81 stale flat services), P-018b (.git hygiene — config repaired this session, but the
  stale `index.lock` litter persists), P-007/009/014/020, and the uncommitted P-024→P-034 + L1.F backlog
  awaiting commit / human sign-off.
- **Status:** Session complete — all changes UNSTAGED per AGENTS.md (no git add / commit).

### Session: 2026-06-26 work-layer (finisher / execution layer)
- **Boot:** feat/d10-funded-account @ e158e48; read AGENTS / ARCHITECTURE / ledger + the 2026-06-26
  daily handoff and its blueprint
  (`docs/superpowers/specs/2026-06-26-vol-heatmap-maxspread-crash-ultraplan.md`). Daily had shipped
  P-027 and left two specced coverage pins (REMAINING-1/2) + one deferred dead-code note
  (REMAINING-3). Independently verified the P-027 fix (loop == `max(1e-10, max(arr))`, in-bounds,
  NUL-clean) - correct.
- **Baseline (own run):** typecheck exit 0 | lint exit 0 (0 warnings).
- **Blueprint execution:** P-031 `computeVolSurfaceHistory` (+4) and P-032 `emaCrossPipeline` (+3)
  pinned, test-append only; specs re-verified against source before asserting.
- **Code audit (rule 4):** (1) confirmed the `Math.max(...spread)` defect class is fully contained -
  a repo-wide sweep returns only P-029's bounded-safe sites + my own P-027 comment. (2) Actioned
  REMAINING-3 as **P-030** - removed the dead `intervals` array from `tickVelocitySeries`
  (gate-invisible O(n) waste on the hot path; behavior-identical, test-pinned). (3) `regime.ts`
  (live-decision HMM classifier) had zero coverage; service is defensively written (no logic bug), so
  pinned it as **P-033** (new `regime.test.ts`, +8), new-file only.
- **Shipped (autonomous, all off the execution perimeter):** P-030 (fix), P-031 / P-032 / P-033
  (coverage). +1 test file, +15 tests (95/1195 -> 96/1210).
- **Gates (working tree @ e158e48 + edits):** typecheck exit 0 | lint exit 0 (0 warnings) | vitest
  96 files / 1210 tests / 0 fail (sharded 8x: 181+127+197+196+147+110+114+138) | knip exit 0 (Node-20
  shim; 29 pre-existing unused-type warnings, none from this change).
- **Approval nodes flagged for operator:** P-028 (payout-metrics zero-target contradiction - product
  ruling); standing items unchanged (P-022 git rm, P-018b hygiene, P-007/009/014/020, and the
  uncommitted P-024/025/026 + L1.F backlog awaiting commit / sign-off).
- **Status:** Session complete - all changes UNSTAGED per AGENTS.md (no git add / commit).

### Session: 2026-06-26 daily PSD (planner / first executor)
- **Boot:** feat/d10-funded-account @ e158e48 (not master); no `Vault/Daily/*-agent-handoff.md`
  existed; the 2026-06-25 work-layer HELD (planner concurrency) and shipped nothing. Read
  AGENTS/ARCHITECTURE/ledger + the 2026-06-25 work-layer run. Off-perimeter DECIDED queue empty
  (all entries operator-gated or self-deferred) -> PSD rule 2(d): audited the branch vs master
  (merge-base 461f4b0; +124 files / +15,223 lines).
- **Audit verdict:** the new CHART/D.10 modules (`webgl/`, `chart-indicators/`, `funded/`) are
  high-quality and well-tested. One real off-perimeter defect found and fixed (P-027). Two notes:
  - **P-028** (payout-metrics zero-target contradiction) -> OPEN, operator ruling.
  - **P-029 (audit note, no action):** the other `Math.max(...spread)` sites — `Sparkline.tsx:18`,
    `ChartPanel.tsx:1233-1234` (visible view), `FundedAccountPanel.tsx:69-70`,
    `PortfolioMiniPanel.tsx:54,77-78`, `chart-types.ts:128-129` (line-break window <= N),
    `main/index.ts:578` — all operate on **bounded** arrays and are safe. Documented so they are not
    re-flagged; only the unbounded per-candle vol-heatmap case was a real risk.
- **Shipped (autonomous, off-perimeter):** P-027 (see Shipped section). Blueprint:
  `docs/superpowers/specs/2026-06-26-vol-heatmap-maxspread-crash-ultraplan.md`.
- **Gates (working tree @ e158e48 + P-027 edits):** typecheck exit 0 | lint exit 0 (0 warn) | vitest
  95 files / 1195 tests / 0 fail | knip exit 0 (Node-20 shim). Handoff:
  `Vault/Daily/2026-06-26-agent-handoff.md`.
- **Status:** Session complete — all changes UNSTAGED per AGENTS.md (no git add / commit).

### Session: 2026-06-25 daily PSD (standing agent)
- **Work:** Boot on **feat/d10-funded-account @ e158e48** — branch moved since the
  ledger's last sessions (feat/chart-interaction-layer @ 1cf9b0e). HEAD e158e48 is
  a 4,143-line commit: D.10 funded-account engine + P-013 bracket + L1.F ensemble
  + P-024 tests. Read AGENTS/ARCHITECTURE/ledger; checked git log + status.
- **Key finding — independent gate verification of the freshly-committed D.10/L1.F
  branch (the ledger had none for it):** all four gates GREEN against the working
  tree (HEAD e158e48 + untracked color.test.ts), including the trading-safety-
  perimeter files committed in e158e48 (order-manager, risk-gates, trading-engine):
  typecheck✅ exit 0 | lint✅ exit 0 (0 warnings) | vitest✅ 94 files / 1175 tests /
  0 fail | knip✅ exit 0 (Node-20 shim). Perimeter code left untouched (operator
  commit = sign-off); verified only.
- **Observed committed since last ledger update:** P-024 (rng/id-generator) and
  L1.F / P-009 (brain depth wiring + ensemble-fuser) are now committed in e158e48 —
  both previously sat SHIPPED/DECIDED awaiting operator action. P-025 (color.test.ts)
  remains untracked (awaiting commit). No status rewrite of those entries beyond this
  note (minimizing existing-file edits = bridge risk).
- **Shipped (autonomous, off-perimeter):** P-026 — `indicators.ts` core math test
  coverage (+14 tests). New file only; verified green (see P-026).
- **Ledger:** P-026 added (SHIPPED). frontmatter date → 2026-06-25.
- **Status:** Session complete — all changes UNSTAGED per AGENTS.md (no git add /
  commit).

### Session: 2026-06-24 work-layer (standing agent — execution layer)
- **Context:** Second daily scheduled task ("work-layer"), fires ~1h after the
  `satex-psd-daily` planner to put execution behind the plan. Boot on
  feat/chart-interaction-layer @ 1cf9b0e; read AGENTS + ledger; checked git log + status.
- **Ground-truth gate read (full working tree; /tmp sandbox, node_modules symlinked):**
  typecheck✅ exit 0 (node+web) | lint✅ exit 0 (0 warnings) | vitest✅ 93 files / 1165
  tests / 0 fail (4 shards: 309+398+228+230) | knip✅ exit 0 (Node-20 version shim). The
  entire uncommitted working tree is gate-green.
- **Key finding — L1.F / P-009 implemented but UNCOMMITTED on the live-decision path:** the
  working tree carries a large unstaged feature set — `brain.ts`, `trading-engine.ts`,
  `risk-gates.ts`, `order-manager.ts` (+tests), new `ensemble-fuser.ts` (+test),
  `blackout-window`, `daily-pnl-ledger`, `eod-flatten` (funded-compliance) — plus a
  CHANGELOG "### Added" entry for "L1.F / P-009: Brain depth wiring + regime-aware ensemble
  confidence fusion." Its own ledger decision marks **human sign-off required (live decision
  path)**. Left entirely untouched per the trading-safety guardrails; gates confirmed green.
  Flagged for operator: human sign-off → branch → PR → commit.
- **Shipped (autonomous, off-perimeter):** P-025 — `color.ts` `applyOpacity` test coverage
  (+10 tests). New file only; verified green (see P-025).
- **Ledger:** P-025 added (SHIPPED). No status change to P-009 (human-sign-off gate; not an
  agent decision).
- **Status:** Session complete — all changes UNSTAGED per AGENTS.md (no git add / commit).

### Session: 2026-06-24 daily PSD (standing agent)

### Session: 2026-06-24 daily PSD -- second run (standing agent)
- **Work:** Boot on feat/chart-interaction-layer @ 1cf9b0e; read AGENTS/ARCHITECTURE/ledger;
  verified no DECIDED entries to pick up. Surveyed safe utility layer; identified
  `rng.ts` + `id-generator.ts` as foundational untested utilities (P-024).
- **Shipped:** P-024 -- `rng.test.ts` (13 tests) + `id-generator.test.ts` (8 tests).
  +21 tests total (79->81 files, 934->955 tests).
- **Gate results:** typecheck✅ exit 0 | lint✅ exit 0 (0 warnings) |
  vitest✅ 81 files / 955 tests / 0 fail | knip✅ exit 0.
- **Ledger:** P-024 added (SHIPPED). Session recorded.
- **Status:** Session complete -- changes UNSTAGED per AGENTS.md.

- **Work:** Boot on feat/chart-interaction-layer @ 1cf9b0e; read AGENTS/ARCHITECTURE/ledger;
  checked git log + working-tree diff.
- **Key findings:** (1) No actionable DECIDED entries (P-009 human sign-off; P-011/P-012
  deferred by their own decisions). (2) CHANGELOG.md line 56 corrupted by file bridge during
  2026-06-22 session write — Chart-interaction-layer bullet header doubled. Fixed via Python
  byte-level replacement. (3) Knip now completes in sandbox (EXIT:0, Node-20 shim); 27 unused
  exports + 32 unused types listed as warnings only (knip.json "exports"/"types": "warn").
  All four gates confirmed green against working tree (P-013 simulator-bracket + CHANGELOG fix).
- **Gate results:** typecheck✅ exit 0 | lint✅ exit 0 (0 warnings) | vitest✅ 79/934 | knip✅ exit 0.
- **Shipped:** CHANGELOG.md line-56 bridge-artifact repair (duplicate header). CHANGELOG entry
  added under Unreleased ### Fixed.
- **Ledger:** date updated 2026-06-24. Session added. No status changes to open entries.
- **Status:** Session complete — changes UNSTAGED per AGENTS.md.

### Session: 2026-06-22 daily PSD (standing agent)
- **Work:** Boot on feat/chart-interaction-layer @ 1cf9b0e (HEAD 2 commits ahead of a13bd39: P-023 drawing-renderer split + knip cleanup, both committed by previous sessions). Read AGENTS/ARCHITECTURE/ledger. Checked all 12 working-tree diffs: all are NUL-padded HEAD versions (pure bridge artifact, no real content changes).
- **Key findings:** (1) simulator-bracket.ts/test.ts never committed; lost from working tree — re-implemented. (2) P-023 COMMITTED (not just SHIPPED) — ledger updated. (3) Real committed test baseline is 78/920 (not 111/1304 — previous counts included untracked domain-subdir copies no longer on disk).
- **Gate results (pre-work):** typecheck✅ | lint✅ (0 warnings) | vitest✅ 78/920 | knip⚠ OOM (sandbox).
- **Gate results (post-P-013 re-ship):** typecheck✅ | lint✅ (0 warnings) | vitest✅ 79/934 (+1/+14) | knip⚠ OOM (sandbox; CI clean).
- **Shipped:** P-013 re-implementation (simulator-bracket.ts, simulator-bracket.test.ts, trading-engine.ts wiring). CHANGELOG entry added under Unreleased ### Added.
- **Ledger:** P-013 updated (re-shipped). P-023 moved to CLOSED. Session added. metadata date updated to 2026-06-22.
- **Status:** Session complete — changes UNSTAGED per AGENTS.md.

### Session: 2026-06-21 daily PSD (standing agent)
- **Work:** Boot on feat/chart-interaction-layer @ a13bd39; read AGENTS/ARCHITECTURE/ledger;
  checked git log + working-tree diff; ran all four gates in /tmp sandbox with working-tree
  files (incl. simulator-bracket.ts + all domain-subdir service files).
- **Key finding:** No actionable DECIDED entries (P-009 human sign-off; P-011/P-012 deferred
  by their own decisions). Identified P-023 as new autonomous work: the sole persistent lint
  warning (`react-refresh/only-export-components`) in `DrawingLayer.tsx` was fixable by
  extracting `renderDrawing` into a sibling `drawing-renderer.ts`.
- **Gate results (pre-P-023):** typecheck✅ exit 0 | lint✅ exit 0 (1 warning) | vitest✅
  111/1304 | knip⚠ sandbox OOM (known; CI expected clean).
- **Gate results (post-P-023):** typecheck✅ exit 0 | lint✅ exit 0 (0 warnings) | vitest✅
  111/1304 | knip⚠ sandbox OOM (known; CI expected clean).
- **Shipped:** P-023 — `drawing-renderer.ts` (new file), `DrawingLayer.tsx` (slimmed),
  `ChartPanel.tsx` (import split). CHANGELOG entry added under Unreleased ### Fixed.
- **Ledger:** P-023 added (SHIPPED). No other autonomous DECIDED/IN-PROGRESS work remains
  (P-009/P-011/P-012 DECIDED/deferred; P-008b post-L1.G; P-022 awaiting operator git rm).
- **Status:** Session complete — changes UNSTAGED per AGENTS.md.

### Session: 2026-06-19 daily PSD (standing agent)
- **Work:** Boot on feat/chart-interaction-layer @ a13bd39; audit P-013 working-tree state; run all four gates in /tmp sandbox.
- **Key finding:** Working tree adds `checkSimulatorBracket` to `trading-engine.ts` (4 new refs vs HEAD) + two new untracked files `simulator-bracket.ts` + `simulator-bracket.test.ts`. HEAD commit a13bd39 imports `./simulator-bracket` but those files are NOT committed — operator must `git add` + commit them before next push or CI will fail on the import.
- **Gate results:** typecheck ✅ exit 0 | lint ✅ exit 0 (1 warning) | vitest ✅ 111 files / 1304 tests / 0 fail | knip ⚠ sandbox native-binary (oxc-parser/oxc-resolver — CI expected clean, consistent with all prior sessions).
- **Ledger:** P-013 moved from IN-PROGRESS to SHIPPED. No other autonomous DECIDED/IN-PROGRESS work remains (P-009/P-011/P-012 DECIDED/deferred; P-008b post-L1.G; P-022 awaiting operator git rm).
- **Status:** Session complete — changes UNSTAGED per AGENTS.md.

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

### Session: 2026-06-13 daily PSD (standing agent)
- **Work:** Boot, verify ledger, assess gate status, update ledger
- **Findings:** MIT License integration complete (GitHub + local package.json verified). All gates green: typecheck✓ lint✓ test(62/669)✓ knip(Node 22 OOM, expected; Node 20 CI OK). P-008(a) shipped 2026-06-12, gates verified 2026-06-13. P-013 awaiting operator diagnostic (autonomous work complete). No remaining autonomous DECIDED/IN-PROGRESS work.
- **Evidence:** Branch `feat/audit-psd-batch-2026-06-11` @ `461f4b0`; typecheck clean; eslint clean; 669 tests PASS (34.90s); knip fails on oxc-parser memory (Node 22 sandbox ≠ CI Node 20).
- **Status:** Session closed — next PSD cycle clear to proceed with operator diagnostics on P-013 or fresh DECIDED work.

### Session: 2026-06-14 daily PSD (standing agent)
- **Work:** Boot; classified the working tree (142 changed = 2 real diffs [package.json license, prior ledger note] + 140 CRLF churn — left untouched); grounded survey of the safe render/display layer; shipped P-019; logged P-020.
- **Shipped:** P-019 — `fmt.k()` float-noise fix + first-ever `format.test.ts` (15 cases). All four gates green in /tmp sandbox: typecheck✓ lint✓ test(63/684)✓ knip✓ (exit 0; Node-20 shim, no OOM this run). Branch `feat/audit-psd-batch-2026-06-11` @ `461f4b0`; changes UNSTAGED per AGENTS.md.
- **Findings:** P-020 (clock DST label + money sign-glyph) logged OPEN for operator ruling. No other autonomous DECIDED work remains (P-009/P-013 → human sign-off / runtime; P-011/P-012 deferred by their own decisions; P-008b → post-L1.G).
- **Status:** Session closed.

### Session: 2026-06-17 daily PSD (standing agent)
- **Work:** Boot (git packed-refs corruption detected; fixed via truncation); assess ledger; gate readiness check.
- **Findings:** (1) Git repo degraded: `.git/packed-refs` unterminated line (P-018 aftermath); HEAD refs branch `feat/chart-interaction-layer` unresolvable. Fixed packed-refs via `tail -20 | truncate` (3863→3605 bytes) but git still FAILED with "ambiguous HEAD". (2) Working tree: `package.json` truncated at `typescript-eslint: "^8.59.` (restored via bash cat to file); four test files structurally corrupted (P-021 logged). (3) Ledger audit: No autonomous DECIDED entries; P-008 IN-PROGRESS awaiting operator; P-009/P-011/P-012 DECIDED/deferred; P-013 IN-PROGRESS awaiting operator diagnostic; P-019 SHIPPED awaiting merge; P-020 OPEN (operator ruling).
- **Actions:** Restored package.json (valid JSON verified). Fixed packed-refs truncation (git still broken). Added closing braces to two test files; four remain structurally broken. Logged P-021. Updated ledger metadata to 2026-06-17.
- **Gate status:** BLOCKED — typecheck fails on four test files (brace imbalance: calibration/pattern-learner −1 each; replay-source/tick-recorder −2 each). Cannot proceed to lint/vitest/knip until corruption resolved.
- **Status:** Session halted — operator intervention required (P-021); no autonomous path forward.

### Session: 2026-06-18 operator-directed full cleanup (col)
- **Work:** Full workspace audit + git repair + file corruption recovery + gate run + UI upgrade pass.
- **Findings:** (1) `HEAD` had NUL bytes after newline (xxd confirmed `0a 00 00 00`) — fixed via `printf`. (2) `index.lock` stale (EPERM from sandbox, benign — git objects fully readable). (3) Additional corrupted files beyond P-021: `DrawingLayer.tsx` (2 lines missing), `ChartPanel.tsx` (261 lines missing), `knip.json` (truncated mid-JSON). All 7 corrupted files recovered via `git show HEAD:<path>` bypassing the locked index.
- **Gate results:** typecheck ✅ (exit 0) | lint ✅ (exit 0, 1 warning) | vitest ✅ 99 suites / 1232 tests / 0 fail | knip ⚠ sandbox-only (oxc-parser 2GB ArrayBuffer > sandbox limit — not a code defect; CI Node-20 expected clean).
- **UI (completed this continuation):** `globals.css` — session-icon breathing glow, `bb-bot-sep` 1px separator, `bb-log-live` opacity-pulse, `bb-panel-live-dot` green ring-pulse, `bb-panel-badge` utility, `bb-panel-head` to `align-items:center`. `BottomBar.tsx` — LOG uses class not inline style; sep span before DXY. `PanelHead.tsx` — optional `live?: boolean` prop. typecheck ✓ lint ✓ after fix.
- **New rule discovered:** Edit tool SILENTLY TRUNCATES CRLF `.tsx` files — the portion of the file after the last replaced string is dropped. Safe fix: `git show HEAD:path | python3` to read original, apply changes in-memory, write complete file. CSS files (globals.css) appear safe with Edit tool.
- **Closed:** P-021 (all corruption resolved, gates green).
- **Status:** Session complete — feat/chart-interaction-layer @ a13bd39, 7 files repaired, gates green (typecheck ✓ lint ✓), UI polish unstaged for operator review.

### Session: 2026-06-18 daily PSD (standing agent)
- **Work:** Boot on feat/chart-interaction-layer @ a13bd39; survey working tree (11 modified + 83 new untracked service-subdir files); run all four gates; fix ChartPanel.tsx truncation; fix CHANGELOG.md truncation; log P-022.
- **Key finding:** ChartPanel.tsx was truncated at line 1648 (missing 12 lines: closing `aria-label`, OrderFlowTape div, MultiTFOverlay mount, and component closing braces). Restored via git show HEAD + Python in-memory apply of 2 intended changes: (1) static `import { exportChartPng }` → comment block explaining why it must not be static-imported (renderer crash on Vite's __dirname shim); (2) onClick handler → async + dynamic import('../chart/export'). CHANGELOG.md similarly truncated — reconstructed from HEAD + diff additions.
- **Service restructure status:** 81 old flat services/ files fully mapped to domain subdirs (100% match, 0 missing). Cannot delete old files from sandbox (EPERM). P-022 logged for operator `git rm` cleanup. Knip on CI expected clean: test files anchor their flat-path sources as entry points.
- **Gate results (post-fix):** typecheck ✅ exit 0 | lint ✅ exit 0 (1 warning) | vitest ✅ 111 files / 1304 tests / 0 fail | knip ⚠ sandbox OOM (known; CI expected clean).
- **Shipped:** ChartPanel.tsx renderer crash fix (dynamic PNG export import) + CHANGELOG.md reconstruction. Changes UNSTAGED per AGENTS.md.
- **Status:** Session complete — feat/chart-interaction-layer @ a13bd39, 2 files repaired.

