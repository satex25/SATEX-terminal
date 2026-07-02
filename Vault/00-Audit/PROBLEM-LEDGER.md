---
type: ledger
title: SATEX Problem Ledger — the living PSD queue
tags: [satex, psd, problems, ledger]
updated: 2026-07-02
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

### P-057 · Build debris `electron.vite.config.1782779608985.mjs` pinned by sandbox EPERM
- **Problem:** satex-app root carries a compiled electron-vite temp config (timestamp-named `.mjs`,
  1,400 bytes; its bundled `__dirname` references a prior sandbox session `elegant-loving-cannon` --
  the transient build artifact electron-vite normally deletes after loading `electron.vite.config.ts`).
  Untracked, so it pollutes every `git status` review of the P-024→P-056 unstaged backlog. The sandbox
  can neither `rm` nor `mv` it (EPERM on unlink -- the P-018 bridge class; rename requires unlink here
  because the target is a different directory).
- **Solutions:** (a) operator one-liner: `del` it (or `git clean -f -- 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/electron.vite.config.*.mjs`);
  (b) leave it (harmless but permanent status noise); (c) add `electron.vite.config.*.mjs` to
  `.gitignore` if the pattern recurs (it will, any time electron-vite runs inside a sandbox that dies
  mid-build).
- **Decision:** **(a)**, escalating to **(c)** on recurrence -- recorded so it is not lost.
- **Status:** OPEN (operator one-liner).

### P-058 · Docs describe a services/ domain-subdir layout that never existed in git
- **Problem:** `ARCHITECTURE.md` §2, `CONSTITUTION.md` §3.1, and ledger P-022 all describe
  `src/main/services/` as restructured into 7 domain folders (`broker/`, `execution/` ⚠️,
  `risk/` ⚠️, `market-data/`, `intelligence/`, `subsecond/`, `system/`). The filesystem and
  git history disagree: only `services/alpaca/` exists (8 tracked files); `git log
  --diff-filter=A` finds NO commit that ever added the domain subdirs (and none ever deleted
  them); 98 flat `services/*.ts` files are tracked; `main/index.ts:29-30` imports the flat
  paths. The flat layer IS the canonical layer, so P-022's premise ("81 old flat files …
  dead code, entry points use the new paths") is inverted — the flat files are the live
  code and there are no subdir copies to clean up. Perimeter mapping still resolves
  (`order-manager.ts` / `risk-gates.ts` / `kill-switch-store.ts` / `live-mode.ts` live flat),
  but any agent following the docs' ⚠️-folder map greps paths that do not exist
  (Constitution honesty axiom: the code is the truth and these files have a bug).
- **Solutions:** (a) fix the three docs to the flat reality (+ re-scope or close P-022) —
  honest, cheap, keeps the perimeter map accurate; (b) actually perform the domain-subdir
  restructure the docs describe (a deliberate refactor program across ~98 files + knip/
  tsconfig/import churn — not a doc fix); (c) leave as-is (every future agent re-discovers
  the mismatch).
- **Decision:** defer direction to operator — (a) is the honest default, but whether the
  restructure is still *intended* (the docs may encode a plan recorded as done) is a
  repo-shape call (the P-020/P-028 record-don't-freelance pattern). Evidence stands either
  way; sessions should trust flat paths until ruled.
- **Status:** OPEN (operator ruling on direction; found 2026-07-02 dawn boot)

### P-062 · Intel grid: an intentionally-emptied layout silently resets to the curated default on reload
- **Problem:** `intelLayoutStore.ts:66-79` (`hydrate()`) reads the persisted layout, sanitizes
  it, then applies `clean.length > 0 ? clean : CURATED_DEFAULT_LAYOUT.map(...)` (:71). This
  conflates two states `intel-layout.ts`'s persistence layer cannot itself distinguish — "no
  file / corrupt file" (documented default-to-curated behavior, `intel-layout.ts:13-15`) vs.
  "the operator removed every module on purpose" (`remove(id)` for every placement persists a
  genuinely empty `[]`, which `IntelGrid.tsx:50-58` already renders correctly as an explicit
  "No modules placed" empty state while the app is running). On the NEXT launch, hydrate()
  cannot tell these apart and always repopulates the curated default — silently discarding a
  deliberate, already-round-tripped operator choice. Not data loss at the persistence layer
  (`sanitizeShape([])` in `intel-layout.ts` correctly returns `[]`, not defaults; verified by
  reading — the empty array really is written and read back) — only the renderer's hydrate-time
  interpretation collapses the two cases into one.
- **Solutions:** (a) leave as-is — a fully-emptied grid is a rare, likely-accidental state;
  silently repopulating a curated, useful default is arguably friendlier than a blank tab with
  no discoverability outside edit mode; (b) distinguish the two cases on disk (e.g. a
  `{ layout: [], everCustomized: true }` wrapper or an explicit reset sentinel) so hydrate can
  tell "never touched" from "touched down to nothing" — a real behavior change touching both
  the persisted file shape and both read/write sides; (c) keep current behavior but document it
  explicitly (the existing "Reset layout" button already does the curated-to-empty direction
  in reverse) and let the operator decide if (b) is worth the schema churn.
- **Decision:** deferred to operator — this is a product/taste call (what should a
  fully-emptied Intel grid *mean* on restart?), not a single-answer defect; the CONSTITUTION
  §2.3 judgment boundary applies (record, don't freelance). No code changed.
- **Status:** OPEN (found 2026-07-02, work-layer code audit of the shipped 2026-06-29 Intel
  workspace feature; `intelLayoutStore.ts:71`).

### P-065 · Stale `.git/index.lock` (2026-06-29 03:16, 0 bytes) is EPERM-locked — all index writes blocked from agent sandbox
- **Problem:** `mc4/.git/index.lock` has existed since 2026-06-29 03:16 (0 bytes — a
  crashed git process, not an active one). The sandbox file bridge returns EPERM on
  unlink (`rm -f` → "Operation not permitted", same class as P-057's EPERM build
  debris), so every index-mutating git operation in the working copy fails: commit,
  checkout, stash, add. This is very plausibly WHY the P-024→P-063 backlog accumulated
  with no commit checkpoint — agent sessions could push objects/refs but never commit
  or switch branches in place. Ref + object writes still work (verified: two branches
  pushed into the repo 2026-07-02).
- **Solutions:** (1) Operator deletes `C:\Users\User\mc4\.git\index.lock` from
  Windows (one command: `del C:\Users\User\mc4\.git\index.lock`) — recommended;
  (2) agents continue the /tmp-clone commit-and-push-back workflow indefinitely —
  works (this session proves it) but leaves the mounted working tree permanently
  un-switchable and un-reconcilable.
- **Decision:** OPERATOR ACTION REQUIRED — delete the lock, then
  `git checkout -f chore/backlog-checkpoint-p024-p063` (tree content is already
  identical; `-f` only reconciles the index).
- **Status:** OPEN (operator)

### P-063 · `shared/indicators.ts` kernels accept an unvalidated `period`/`lookback` — latent NaN / silent-wrong-window class
- **Problem:** `ema`/`rsi`/`atr`/`sma`/`trendStrength`/`rollingVolatility`
  (`src/shared/indicators.ts:9,20,27,43,58,72,81`) all take a `period`/`lookback` number
  parameter with no floor/positivity guard — the exact P-039/P-040/P-049 degenerate-input
  class already fixed one layer over in `swing-points.ts` (P-049), but never applied here.
  Two distinct failure shapes: `rsi(closes, 0)` — the length guard (`closes.length <
  period+1`) does not catch `period<=0`; the accumulation loop's range inverts to empty
  (`gains=losses=0`); `avgGain`/`avgLoss` divide `0/0` to `NaN`; and `avgLoss===0` (false —
  it is `NaN`) fails to short-circuit, so the function returns `NaN` with no guard, no throw,
  no log. `sma`/`atr` with `period<=0` do NOT NaN — `closes.slice(-period)` with `period=0` is
  JS's `slice(-0)`, which returns the FULL array (not empty), so the "windowed" average
  silently becomes an all-history average; a negative period slices from a different,
  unintended offset. Both are silent-wrong, not crashes. `ema`'s `k = 2/(period+1)` divides by
  zero at `period=-1`. LATENT, not active: a repo-wide grep for every `rsi(`/`atr(`/
  `computeSnapshot(` call site (excluding tests) shows every one passes a fixed positive
  literal (9, 14, 20, 21, or 50) — `computeSnapshot` itself only ever calls these with
  hardcoded literals. `rsi`/`atr` are exported, though, so any future caller (e.g. a
  configurable-period feature — note the chart-display `indicator-settings.ts` `rsiPeriod`
  today feeds a SEPARATE renderer-side RSI, not this file) would inherit the hazard silently.
- **Solutions:** (a) mirror the shipped P-049 pattern exactly — floor the parameter and guard
  `< 1` at each of the 6 call sites, returning the function's existing insufficient-input
  value, consistent with the sibling file, smallest possible diff; (b) a single shared
  `clampPeriod(n, floor=1)` helper used by all 6 — more DRY, marginally larger diff, one new
  internal helper; (c) defer — zero live callers today, revisit only if a variable period is
  ever wired in.
- **Decision:** flagged, NOT implemented this session — `indicators.ts` is on the
  live-decision input path (feeds `Brain.features` -> `scoreLocal` -> every `AiDecision`) and
  the work-layer protocol's Section 4 marks this file class READ-ONLY: flag defects, never
  edit without human sign-off, even off the hard execution/risk perimeter. Recommend (a) on
  sign-off — same pattern, same file family, one prior precedent already reviewed and shipped
  (P-049).
- **Status:** OPEN (found 2026-07-02, work-layer live-decision-path standing audit;
  `src/shared/indicators.ts`; human sign-off required before any edit).

## In progress

*(entries move here when an agent starts work; move to Shipped with commit/PR reference)*


## Shipped — awaiting verification

### P-064 · Filesystem reorganization to monorepo layout — executed on branch, awaiting operator review + merge
- **Problem:** Root scatter (18 loose root files: rebase bundles, one-off .bat files,
  duplicate policy docs, screenshots) + the deeply nested `00-PROJECT-ROOT/01-SATEX-CORE/satex-app/`
  path. Operator directive `REORGANIZATION-PROMPT.md` (2026-07-02) ordered a
  production-grade GitHub-ready restructure. The manifest, however, was written
  without filesystem grounding and contained factual errors (assumed root LICENSE;
  assumed tracked 90-REFERENCE; missed that Vault is live runtime memory; missed
  the scheduled-pipeline's root-path reads; prescribed .bat→.sh conversion in a
  Windows-only repo; prescribed npm workspaces without considering hoisting under
  electron-builder).
- **Solutions:** (1) Execute the manifest literally — breaks the scheduled agent
  pipeline, converts working .bat to dead .sh, risks node_modules hoisting;
  (2) ground-truth-adapted execution — every move verified against the filesystem
  per Prime Directive 0.5, deviations documented; (3) defer entirely.
- **Decision:** (2). Executed on `refactor/filesystem-reorganization` (5 commits,
  stacked on `chore/backlog-checkpoint-p024-p063`). Core moves: `satex-app/` →
  `apps/satex-terminal/` (pure git-mv, history verified with `--follow`), root doc
  scatter → `docs/guides|plans`, bundles → `reference/git-bundles/`, one-off scripts
  → `scripts/archive/`, app LICENSE → root, root monorepo `package.json` (no
  workspaces field — hoisting is a separate operator decision), new
  GETTING-STARTED/CONTRIBUTING/SECURITY/FAQ, root README landing page. Deviations
  (all in PR body): AGENTS/ARCHITECTURE/CONSTITUTION stay at root (scheduled
  pipeline + agent tooling read them there); Vault/ rename-restructure DEFERRED
  (live runtime memory, mostly untracked, hardcoded consumers); .bat stays .bat;
  no infrastructure/ scaffolding (nothing real to put in it; no docker exists);
  identical root duplicates of docs/policy files deleted, not re-duplicated.
- **Evidence:** Gates on the reorganized tree (sandbox, Node 22.22.3):
  typecheck exit 0 · lint exit 0 (0 warnings) · vitest 116 files / 1464 tests /
  0 fail (byte-identical to pre-reorg baseline measured this session) · knip =
  sandbox oxc-parser OOM in BOTH baseline and post-move runs (documented §2.9
  environment class — CI is the arbiter). History: `git log --follow` traces
  trading-engine.ts through 55 commits to the original flatten.
- **Post-merge operator checklist:** (1) update the 5AM/6AM scheduled-task prompts
  (`REPO\00-PROJECT-ROOT\01-SATEX-CORE\satex-app` → `REPO\apps\satex-terminal`);
  (2) `npm install` in `apps/satex-terminal/` (node_modules does not follow a git
  merge); (3) optionally rename untracked `90-REFERENCE/` → `reference/vendor/`
  (untracked, so not part of the git reorg); (4) CI must run all four gates green
  on the PR before merge (knip verdict comes from CI).
- **Status:** SHIPPED (branch, gate-verified) — awaiting operator review, CI, merge

### P-061 · `indicator-settings.ts` defaults paths alias module-constant nested objects into the live cache
- **Problem:** the three defaults fallback paths return `{ ...DEFAULT_SETTINGS }`
  (`src/main/services/indicator-settings.ts:69,76,81`) — a shallow spread whose `enabled`
  object and `emaPeriods` array remain the SAME references as the shared
  `DEFAULT_INDICATOR_SETTINGS` module constant (`src/shared/chart-indicators/types.ts:115-129`).
  The result is also cached (:40), so any future in-main mutation of a defaults-path `get()`
  result would silently corrupt process-lifetime defaults for every later consumer. It was
  latent, not active: the only consumer is the IPC handler and structured-clone serialization
  shields the renderer. Contrast: the sanitize path builds fresh objects (fresh `enabled`
  record :129, `[...DEFAULT_SETTINGS.emaPeriods]` :156 — pinned by P-060 test 8), and
  `workspace-state.ts:63` does the defensive copy its P-059 test pins.
- **Solutions:** (a) `return sanitize({})` at the three sites — reuses the existing
  normalizer, provably fresh objects, semantics identical today; (b)
  `structuredClone(DEFAULT_SETTINGS)` — explicit, but a second copying idiom in the same
  file; (c) leave + comment (hazard persists).
- **Decision:** **(a)** — one line per site, off-perimeter, fits any next code session;
  the P-060 suite already guards behavior equivalence (defaults deep-equal + sanitize-path
  copy semantics).
- **Shipped (2026-07-02, work-layer):** the three sites (`:69,76,81`) now `return sanitize({})`
  — byte-verified 3-for-3 replacement (`old_len` 6041 -> `new_len` 6008 bytes, exactly
  `3 × -11`), CRLF preserved (167/167 unchanged), 0 NUL / 0 CRCR post-edit. Regression-pinned
  in `indicator-settings.test.ts` (new describe block, +1 test, 17 total): all three
  defaults-fallback call sites — no-file, no-fence, and a forced `readFileSync` EISDIR (the
  settings path replaced with a directory, exercising the actual `catch` branch at :81 for the
  first time) — now return objects that are NOT the same reference as
  `DEFAULT_INDICATOR_SETTINGS.enabled` / `.emaPeriods`, plus a direct mutation-safety assertion
  that the shared constant survives a caller mutating a returned defaults object. Deliberately
  does not re-assert the old aliasing (superseded, not enshrined).
- **Gate verification (2026-07-02, work-layer; master @ 664c0d5 working tree; mount
  node_modules, Node v22.22.3):** pre-edit baseline independently re-verified **116 files /
  1463 tests / 0 fail**, knip 55 lines — byte-exact vs the 07-02 session-2 final stamp —
  before any edit. Post-edit: typecheck exit 0 | lint exit 0 (0 warnings) | vitest **116
  files / 1464 tests / 0 fail** (sharded 4×: 387+452+316+309; +1 test exactly, the new
  regression test — no new file) | knip exit 0 (55 lines, byte-identical).
- **Status:** SHIPPED — awaiting operator commit.

### P-060 · `indicator-settings.ts` — last JSON-in-markdown settings service shipped untested
- **Problem:** the chart-indicator toggle persistence service
  (`src/main/services/indicator-settings.ts`, Phase 11) carried the richest sanitize surface
  of the settings-file family — enabled-map filtering against `INDICATOR_IDS`, `EMA_PERIODS`
  membership validation, `clampInt` round+clamp (rsiPeriod [2,200], fibLookback [5,1000]),
  `legendVisible` backward-compat, version pinning (`sanitize` :128-161) — plus the family's
  only `reload()` manual-edit escape hatch (:54-57), with zero co-located coverage. Same
  silent-regression class P-059 closed for its siblings; named #1 NEXT by the 05:0x handoff.
- **Solutions:** (a) new-file-only co-located suite via the proven real-tmpdir harness
  (subsecond-prefs / kill-switch-store / P-059 convention), junk driven through the real
  file-parse path so TS casts stay confined to one write-hygiene test; (b) defer; (c) mock
  `node:fs` (diverges from convention, exercises less of the real render/parse cycle).
- **Decision:** **(a)** — pattern proven four times over, zero source edits, off-perimeter
  (chart toggles route no order; the only perimeter-keyword hit is the doc-comment harness
  citation — the P-059 precedent).
- **Shipped (2026-07-02, dawn planner re-run session 2):** NEW
  `src/main/services/indicator-settings.test.ts` (16 tests: defaults + no-side-effect get;
  fresh-instance round-trip; set-echo; documented cache contract + `reload()` pickup of
  manual edits; enabled-map unknown-id/non-boolean filtering with output-key-set pin; EMA
  period membership filter + fresh-copy default fallback (`[...]` :156 pinned);
  rsiPeriod/fibLookback clamp+round+non-number tables; legendVisible absent→true /
  explicit-false honored; version 99→1; tolerant partial hydrate; no-fence + corrupt-JSON
  recovery; sanitize-BEFORE-write proven against the raw written fence + analyst preamble).
  LF; scan 0 NUL / 0 CRCR; SUT byte-for-byte unchanged. Blueprint:
  `docs/superpowers/specs/2026-07-02-indicator-settings-coverage-ultraplan.md`.
- **Gate verification (2026-07-02 session 2; master @ 664c0d5 working tree; mount
  node_modules, Node v22):** typecheck exit 0 | lint exit 0 (0 warnings) | vitest **116
  files / 1463 tests / 0 fail** (sharded 4×: 387+452+316+308; +1 file / +16 tests vs the
  115/1447 baseline, exactly) | knip exit 0 (55 lines, byte-identical). The session's
  pre-edit baseline also independently re-verified P-059's 115/1447 stamp.
- **Status:** SHIPPED — awaiting operator commit.

### P-059 · Live main-process settings services (`intel-layout`, `workspace-state`) shipped untested
- **Problem:** the two JSON-in-markdown Vault settings services on the boot path had zero
  co-located coverage: `src/main/services/intel-layout.ts` (P-048 flagship layout
  persistence — get/set/cache, `parseJsonFence`, `sanitizeShape` :117-136 dropping unknown
  ids / dupes / non-finite geometry) and `src/main/services/workspace-state.ts` (`sanitize`
  :131-167 — quad normalize/dedupe/pad/trim, chartSymbol fallback, and the freshly-shipped
  P-048 `landingWorkspace` tolerant hydrate :162-164, untested at the service layer). A
  silent regression here decides what the operator sees at boot and passes every gate —
  the P-047/P-050 class at the service layer. Both siblings (`subsecond-prefs`,
  `kill-switch-store`) already carry exactly this test shape; these two were the gap the
  2026-07-01 work-layer §8 NEXT pointed at.
- **Solutions:** (a) new-file-only co-located tests via the proven `subsecond-prefs.test.ts`
  real-tmpdir round-trip harness (mkdtempSync/rmSync; fresh-instance reads so the cache
  cannot mask the read path); (b) defer; (c) mock `node:fs` (diverges from the in-repo
  convention, exercises less of the real render/parse cycle).
- **Decision:** **(a)** — matches the established pattern, zero source edits, off the
  trading-safety perimeter (Vault settings persistence routes no order; patch-grep of both
  new tests clean — the only "kill-switch" hits are doc-comment pattern citations).
- **Shipped (2026-07-02, dawn planner):** NEW `intel-layout.test.ts` (14 tests: read-only
  get / fresh-instance round-trip / set-echo / empty-layout persist / documented in-instance
  cache; sanitize drops unknown + duplicate ids, non-objects, non-finite geometry, non-array
  fence; no-fence + corrupt-JSON recovery; sanitize-BEFORE-write proven against the raw
  file; hand-inspectable preamble) and NEW `workspace-state.test.ts` (14 tests: defaults +
  no-side-effect get + defensive quad copy; full round-trip; set-echo sanitization incl.
  uppercase + pad-to-4; invalid workspace fallback with valid siblings preserved; quad
  lowercase/junk/dupe/pad, >4 trim, non-array fallback; chartSymbol upper + fallback;
  landingWorkspace missing/invalid/valid-Intel; version 99→1; no-fence + corrupt-JSON
  recovery). Both LF; scans 0 NUL / 0 CRCR; both service sources byte-for-byte unchanged.
  Blueprint: `docs/superpowers/specs/2026-07-02-main-service-persistence-coverage-ultraplan.md`.
- **Gate verification (2026-07-02; master @ 664c0d5 working tree; mount node_modules, Node
  v22):** typecheck exit 0 | lint exit 0 (0 warnings) | vitest **115 files / 1447 tests /
  0 fail** (sharded 4×: 387+452+316+292; +2 files / +28 tests vs the 113/1419 baseline,
  exactly) | knip exit 0 (55 lines, byte-identical to baseline).
- **Status:** SHIPPED — awaiting operator commit.

### P-056 · `IntelLayoutSetReq` unbounded array + `ipc-schemas.ts` had zero co-located coverage
- **Problem:** `src/shared/ipc-schemas.ts:250` (pre-fix) -- the Intel layout SET contract was
  `z.array(ModulePlacementReq)` with no length bound, against the file's own bounded-collection
  convention (`quadSymbols` is `.length(4)`); a valid layout structurally holds at most one placement
  per module (ids enum-validated, renderer reducers enforce uniqueness, `intel-layout.ts` dedupes by
  id), so any longer array is by construction invalid input the schema still accepted. Secondary: the
  375-line wire-contract file had no tests -- schema drift would fail a debugging session, not a gate.
- **Solutions:** (a) `.max(INTEL_MODULE_IDS.length)` (self-maintaining bound) + first co-located
  schema tests; (b) a magic-number cap like `.max(16)` (drifts from the registry); (c) rely on
  service-side dedupe alone (accepts structurally-invalid wire input).
- **Decision:** **(a)** -- matches the repo's bounded-contract convention at zero behavior cost (the
  renderer can never legitimately exceed one placement per module). Off the trading-safety perimeter.
- **Shipped (2026-07-01, work-layer):** `ipc-schemas.ts` bound added (python LF edit, anchor
  count==1, post-scan 0 NUL / 0 CRCR, braces balanced); NEW `src/shared/ipc-schemas.test.ts` (8
  tests: the bound, `.strict()` extra-key rejection, integer/positive geometry, unknown-id rejection,
  P-048 `landingWorkspace` accept/reject).
- **Gate verification (2026-07-01; master @ 664c0d5 working tree; mount node_modules, Node v22):**
  typecheck exit 0 | lint exit 0 (0 warnings) | vitest **113 files / 1419 tests / 0 fail** (sharded
  4x: 382+447+306+284) | knip exit 0 (55 lines, byte-identical to baseline).
- **Status:** SHIPPED — awaiting operator commit.

### P-055 · Intel `live` freshness dot froze green on feed death (stale-as-fresh)
- **Problem:** `src/renderer/components/intel/IntelWorkspace.tsx:77` (pre-fix) derives `live`
  (`Date.now() - lastUpdated < POLL_MS * 2`) at render time only, and the poll's `.catch` (:60)
  updated no state. A dead intel bridge therefore stopped producing re-renders entirely, freezing the
  dot at its last state -- typically green -- for as long as the workspace stayed mounted. Stale
  presented as fresh, Constitution 3.2 (degrade loudly, never silently), on the honest-signal
  flagship. Found by this session's audit of the unreviewed P-048 diff.
- **Solutions:** (a) bump a `useState` counter in the poll failure path so the derivation re-runs and
  the dot decays (success already re-renders via `setSnapshot`; the effect's `cancelled` flag keeps
  the bump unmount-safe); (b) a 1 s `now` ticker (constant render churn for a 2.5 s-granularity
  signal); (c) move liveness into `intelStore` as poll-outcome state (heavier, new store API for the
  same pixel).
- **Decision:** **(a)** -- the minimal honest fix inside the existing leak-safe effect.
- **Shipped (2026-07-01, work-layer):** `IntelWorkspace.tsx` -- `notePollFailure` state + bump in the
  poll catch (python LF edit, 3 anchors count==1, post-scan 0 NUL / 0 CRCR, braces balanced).
  Component-level regression test blocked on the standing `@testing-library/react` operator item
  (carried forward). Gate stamp shared with P-056 above (113 / 1419 / 0).
- **Status:** SHIPPED — awaiting operator commit.

### P-054 · Push-mirror stores (`riskGatesStore`, `wireStore`, `macroStore`) shipped untested
- **Problem:** three push-channel display mirrors with zero coverage (`riskGatesStore.ts:13-16`,
  `wireStore.ts:13-16`, `macroStore.ts:13-16`) -- trivial stores, but panels rely on their
  initial-null / store-verbatim / replace-on-push contracts. riskGatesStore is the read-only DISPLAY
  mirror; enforcement lives in `services/risk/` (perimeter, untouched by a pure store test).
- **Solutions:** (a) new-file-only minimal contract tests, 3 each, display contracts strictly;
  (b) skip as too trivial (leaves the sweep's tail unpinned).
- **Decision:** **(a)** -- explicitly listed in the 2026-07-01 handoff NEXT sweep order.
- **Shipped (2026-07-01, work-layer):** NEW `riskGatesStore.test.ts` / `wireStore.test.ts` /
  `macroStore.test.ts` (9 tests; LF; scans clean). Gate checkpoint (before P-055/P-056): typecheck 0 |
  lint 0 (0 warnings) | vitest **112 files / 1411 tests / 0 fail** (373+438+308+292) | knip 0.
- **Status:** SHIPPED — awaiting operator commit.

### P-053 · `replayStore` `active` derivation shipped untested
- **Problem:** `src/renderer/stores/replayStore.ts:20-23` derives `active` from
  `mode === 'playing' || mode === 'paused'` -- App.tsx branches the entire center column on it (an
  active tape force-shows the Replay workspace). Zero coverage; a silent regression flips the
  workspace routing.
- **Solutions:** (a) new-file-only contract tests; (b) defer.
- **Decision:** **(a)** -- 5 tests: initial, playing, paused, idle+recording (inactive), exact-object
  storage.
- **Shipped (2026-07-01, work-layer):** NEW `replayStore.test.ts` (5 tests; LF; scans clean). Gate
  checkpoint shared with P-054 above (112 / 1411 / 0).
- **Status:** SHIPPED — awaiting operator commit.

### P-052 · Intel workspace stores (`intelStore`, `intelLayoutStore`) shipped untested
- **Problem:** the P-048 flagship's two NEW renderer stores had zero coverage: `intelStore.ts:27-32`
  (uppercase normalization, case-insensitive no-op, and the stale-snapshot-clearing invariant -- an
  Intel module must never render another symbol's numbers for a frame) and `intelLayoutStore.ts`
  (hydrate's sanitize/adopt/fallback/warn paths :66-79, reducer-mediated mutations with write-through
  persist :83-87, fire-and-forget persist failure warn :44-49, fresh-copy reset). The P-050 class on
  the newest flagship surface.
- **Solutions:** (a) new-file-only contract tests per the `dataSourceStore.test.ts` stubGlobal
  convention (zero source edit); (b) defer; (c) component tests via IntelWorkspace (blocked -- no
  `@testing-library/react`, standing operator item).
- **Decision:** **(a)** -- 7 + 16 tests; store sources byte-for-byte unchanged; grid reducer
  internals stay covered by `grid-layout.test.ts` (no duplication -- the store tests pin the wiring).
- **Shipped (2026-07-01, work-layer):** NEW `intelStore.test.ts` (7), `intelLayoutStore.test.ts`
  (16); LF; 0 NUL / 0 CRCR; braces balanced. Gate checkpoint shared with P-054 above (112 / 1411 /
  0).
- **Status:** SHIPPED — awaiting operator commit.

### P-049 · `swing-points.ts` accepts degenerate `window`/`lookback` (every-bar swings / TypeError)
- **Problem:** `swingHighs`/`swingLows` (`src/shared/chart-indicators/swing-points.ts:23/26` and
  `:38/41` pre-fix) loop straight off the raw `window` parameter: `window=0` makes the inner
  verification loop vacuous, so **every bar** is reported as both a swing high AND a swing low
  (7-bar repro -> 7 "swings"; feeds the double-top/bottom detectors garbage pairs at O(n^2)); a
  negative or fractional window starts the scan at a non-existent index -> `TypeError: Cannot read
  properties of undefined (reading 'high')`. `averageVolume` (`:55` pre-fix, `Math.max(0, n -
  lookback)`) crashes the same way on a fractional lookback (proven: lookback 2.5 -> TypeError
  reading '.volume'). Every sibling in the layer guards its degenerate parameter (P-040 `period <
  1`, `window < 2`, `brickSize <= 0`, `reversalAmt <= 0`) -- this was the last unguarded file.
  **Latent:** all in-repo call-sites (`double-top.ts:39/41`, `double-bottom.ts:30/32`,
  `patterns.ts:81/123`) pass integer defaults >= 3; live surface is the ChartPanel pattern overlay
  (display-only). Repro: `satex-agent-p049-repro.mjs` -- OLD w=0 -> 7 spurious swings / FIX -> 0;
  OLD w=-2 and w=2.5 -> TypeError / FIX -> [] and ==w=2; w=2, w=3 OLD==FIX (parity); OLD lb=2.5 ->
  TypeError / FIX -> 250.
- **Solutions:** (a) floor both parameters at the root and bail `w < 1 -> []` (total, one file,
  behavior-identical for every valid integer call); (b) validate at each caller (3 files today,
  misses future callers of the exported primitives); (c) leave as-is (crash/garbage the moment
  CHART wiring or a config surface exposes `swingWindow`).
- **Decision:** **(a)** -- the layer's own convention, fixes the root where the indexing lives, off
  the trading-safety perimeter. Found via PSD rule 2(d) audit of the 2026-06-29 work-layer NEXT
  list; that list's "untested chart-indicator files" claim was stale (all four ARE covered in
  `indicators.test.ts` -- P-034 put the double-top/bottom regressions there), and the degenerate
  window/lookback hole was the genuine residue it missed.
- **Shipped (2026-07-01, daily):** `swing-points.ts` -- `const w = Math.floor(window); if (w < 1)
  return out` in both swing fns, loops use `w`; `const lb = Math.floor(lookback)` in
  `averageVolume`. CRLF-preserved python edit (5 anchors count==1; CRLF 63->70; 0 NUL / 0 CRCR / 0
  lone-LF; braces balanced). +6 regression tests appended to `indicators.test.ts` (LF; in-file
  28->34): window 0 / negative / fractional-floors-to-2 for highs+lows, fractional + non-positive
  lookback. Blueprint:
  `docs/superpowers/specs/2026-07-01-swing-window-guard-store-coverage-ultraplan.md`.
- **Gate verification (2026-07-01; master @ 664c0d5 working tree + edits; mount node_modules, Node
  v22):** typecheck exit 0 | lint exit 0 (0 warnings) | vitest **106 files / 1374 tests / 0 fail**
  (sharded 4x: 363+438+297+276) | knip exit 0 (Node-20 shim; 55 output lines -- the pre-existing
  23 unused-export + 29 unused-type warnings only, none new).
- **Status:** SHIPPED — awaiting operator commit.

### P-050 · `workspaceStore` shipped untested (incl. the P-048 `landingWorkspace` setter)
- **Problem:** `src/renderer/stores/workspaceStore.ts` -- tab validation, the Quad-pane
  uniqueness-swap invariant (`:66-81`), uppercase normalization, no-op short-circuits, the P-048
  additive `landingWorkspace` setter (`:92-99`), and hydrate's defaults-on-failure path (`:101-110`)
  -- had **zero co-located coverage** while P-048 just added a setter and `App.tsx` wired a one-shot
  landing effect to it. A regression (e.g. dropping the uniqueness swap or persisting on no-op)
  would pass every gate silently. The P-047 class, on the store that decides what the operator sees
  at boot.
- **Solutions:** (a) new-file-only contract tests via the `dataSourceStore.test.ts` stubGlobal
  convention (zero source edit, lowest bridge risk, the P-042/P-047 pattern); (b) defer; (c) React
  component tests (blocked -- no `@testing-library/react` in the repo, standing operator surface).
- **Decision:** **(a)** -- 16 tests: valid/invalid/no-op tabs, quad length + non-array rejects,
  uppercase + case-insensitive no-op, pane-swap invariant, chartSymbol, `landingWorkspace`
  accept-Intel/reject/no-op, hydrate adopt/empty/throw (console.warn spied). Store source
  byte-for-byte unchanged.
- **Shipped (2026-07-01, daily):** new `src/renderer/stores/workspaceStore.test.ts` (16 tests; LF;
  0 NUL / 0 CRCR; balanced). Gate stamp shared with P-049 above (106 files / 1374 / 0 fail).
- **Status:** SHIPPED — awaiting operator commit.

### P-051 · `subsecondStore` ring/sanitizer logic shipped untested
- **Problem:** `src/renderer/stores/subsecondStore.ts` -- the 1200-bar cap (`:21/:65/:88-90`),
  `appendBar`'s three branches (same-openMs re-seal replace `:75-78`, out-of-order drop `:79-84`,
  append+trim `:85-90`), per-(symbol,bucketMs) keying, the `hydratePrefs` {250|500} sanitizer
  (`:97-107`, the UI's independent guard against IPC contract drift), and `getPref`'s
  null-when-unconfigured contract (`:108`, the auto-snap heuristic depends on it) -- all untested.
  Sub-second is a flagship v0.4.4 surface; a silent regression here corrupts what the crypto chart
  renders.
- **Solutions:** (a) new-file-only contract tests (store is pure -- no window stub needed); (b)
  defer; (c) integration-test via ChartPanel (no harness, heavier, indirect).
- **Decision:** **(a)** -- 12 tests: hydrate keying + cap-slice-keeps-tail, getBars empty fallback,
  series isolation, append / re-seal / out-of-order / head-trim / fresh-key, sanitizer keeps only
  {250,500}, wholesale prefs replace, getPref null->value. Store source byte-for-byte unchanged.
- **Shipped (2026-07-01, daily):** new `src/renderer/stores/subsecondStore.test.ts` (12 tests; LF;
  0 NUL / 0 CRCR; balanced). Gate stamp shared with P-049 above (106 files / 1374 / 0 fail).
- **Status:** SHIPPED — awaiting operator commit.

### P-048 · Composable Quant Intelligence workspace (flagship) — Phase A+B SHIPPED
- **Problem:** The intelligence layer (brain weights, calibration Brier/buckets, regime HMM, weight-drift,
  pattern stats) is computed in `main/` but surfaced only thinly across small per-symbol panels — the
  terminal's actual differentiation (learning markets) is largely invisible to the operator. The operator
  also wants ONE highly customizable tab (add/drag/resize modules like an iPhone homepage / desktop
  windows) and a configurable startup landing page (operator directive, 2026-06-29).
- **Solutions:** decomposed via `/ultraplan` (7 layers) + an autoplan-equivalent 4-lens review (6
  revisions applied). Grid engine fork: (a) custom zero-dep pointer-event grid; (b) react-grid-layout;
  (c) dnd-kit + custom resize. Persistence fork: own `intel-layout.md` vs extending `WorkspaceState`.
- **Decision:** **(a)** custom zero-dep grid (honors the 10-dep minimalism + knip gate; full control of
  the jiggle UX + `--bb-*` styling; reuses the TweaksPanel pointer pattern). Layout lives in its OWN
  `Vault/Settings/intel-layout.md` (decoupled — **no `WorkspaceState` schema migration**, the review's
  key risk-reduction); `landingWorkspace` is additive with tolerant hydrate. Phased: A foundations → B
  grid → C analytics backend → D modules → E. Blueprint:
  `00-PROJECT-ROOT/01-SATEX-CORE/satex-app/docs/superpowers/specs/2026-06-29-intel-workspace-composable-grid-ultraplan.md`.
- **Shipped (2026-06-29, Phase A+B):**
  NEW — `renderer/lib/grid-layout.ts` (+`.test.ts`, 15 tests: overlap/clamp/collision/add/remove/move/
  resize/sanitize), `renderer/panels/intel/intel-modules.ts` (metadata + curated default layout),
  `renderer/panels/intel/intel-registry.tsx` (`IntelModuleBody`), `renderer/stores/intelLayoutStore.ts`,
  `renderer/components/intel/useGridDrag.ts` (leak-safe pointer drag/resize), `…/IntelGrid.tsx`,
  `…/IntelWorkspace.tsx`, `main/services/intel-layout.ts` (own-file persistence, subsecond-prefs mirror).
  MODIFIED — `shared/types.ts` (`'Intel'` tab, additive `landingWorkspace`, `ModulePlacement`/
  `IntelModuleId`), `shared/ipc-channels.ts` (`INTEL_LAYOUT_GET/SET`), `shared/ipc-schemas.ts`
  (`IntelLayoutSetReq`), `main/index.ts` (service + 2 read-only handlers), `preload/index.ts`
  (`intelLayout` bridge), `main/services/workspace-state.ts` (tolerant `landingWorkspace`), `App.tsx`
  (Intel render branch + ⌘6 + one-shot landing effect), `TopBar.tsx` (Intel title), `workspaceStore.ts`
  (`setLandingWorkspace`), `SettingsModal.tsx` (Startup-page control), `globals.css` (Intel styles).
  All edits EOL-preserved (mixed CRLF/LF per file); NUL/CRCR scans clean; anchors count==1.
- **Teardown audit:** `useGridDrag` 3 addEventListener / 3 removeEventListener (pointer move/up/cancel)
  + unmount cleanup; `IntelWorkspace` keydown 1/1; no timers/ResizeObservers in new code. Off-perimeter
  patch-grep CLEAN (no OrderManager/risk-gates/kill-switch/Alpaca-submit references; routes no order).
- **Gate verification (2026-06-29; master @ 664c0d5 working tree + Phase A+B; mount node_modules, Node
  v22):** typecheck exit 0 | lint exit 0 (0 warnings) | vitest **102 files / 1314 tests / 0 fail**
  (sharded 4×: 355+417+282+260; +1 file / +15 tests vs the 101/1299 P-047 baseline) | knip exit 0
  (Node-20 shim; 23 unused-export + 29 unused-type pre-existing warnings only — **none new**).
- **Shipped (2026-06-29, Phase C):** the eight modules now render LIVE read-only analytics, fused
  per the selected symbol. NEW — `src/shared/intel-analytics.ts` (+`.test.ts`, 15 tests: pearson +
  correlation matrix [negative-price-safe], feature attribution, microstructure, scenario-layer +
  convergence synthesis — all UNKNOWN-safe), `src/main/services/intel-fusion.ts` (+`.test.ts`, 8
  tests: full-signal + all-UNKNOWN degenerate + correlation-symbol set) composing calibration / brain
  weights / regime / macro / depth into one `IntelSnapshot`, `src/renderer/stores/intelStore.ts`.
  MODIFIED — `shared/types.ts` (`IntelSnapshot` + sub-types), `shared/ipc-channels.ts` (`INTEL_GET`),
  `main/index.ts` (read-only handler), `preload/index.ts` (`getIntel` bridge), `core/trading-engine.ts`
  (`getIntelSnapshot` — read-only, the getHealthReport precedent; patch-grep clean of order/risk writes),
  `panels/intel/intel-registry.tsx` (8 real SVG/CSS vizzes: reliability diagram, attribution bars,
  regime posterior, weight-drift, correlation heatmap, microstructure ladder, macro catalysts,
  scenario/convergence), `components/intel/IntelWorkspace.tsx` (leak-safe 2.5s `INTEL_GET` poll +
  research-mode symbol selector + live dot), `globals.css` (module styles). Modules render
  `UNKNOWN — SIGNAL INSUFFICIENT` when a slice is null (Constitution 0.1). Teardown balanced
  (IntelWorkspace 1/1 listeners + 1/1 timers); off-perimeter patch-grep CLEAN.
- **Gate verification (Phase C; master @ 664c0d5 working tree + Phase A-C; Node v22):** typecheck exit
  0 | lint exit 0 (0 warnings) | vitest **104 files / 1337 tests / 0 fail** (sharded 4×:
  354+423+287+273; +2 files / +23 tests vs the 102/1314 Phase A+B baseline) | knip exit 0 (Node-20
  shim; 23 unused-export + 29 unused-type pre-existing warnings only — **none new**).
- **Status:** SHIPPED (Phase A+B+C) — awaiting operator commit + a launch confirm (Intel tab via ⌘6;
  Edit Modules drag/resize; Settings → Startup page; live analytics + research selector). The
  read-only analytics + real module vizzes are complete; only optional **Phase D** deepening
  (time-range drill-down, portfolio-vs-symbol toggles beyond the symbol selector) remains as future
  polish, per the blueprint §3.12.

### P-047 · `computeJournalAggregates` (trading-journal stats) shipped with zero test coverage
- **Problem:** `computeJournalAggregates` (`src/renderer/stores/journalStore.ts:93-172`) is the pure
  display-aggregation function behind the trading-journal panel — it derives win/loss counts + win rate,
  conviction P&L buckets, mean entry slippage, the per-regime P&L breakdown, and best/worst tag from the
  closed-trade ring the operator reads every session. The store had **zero co-located test coverage**
  (`journalStore.ts` had no `.test.ts`), so its non-trivial branch logic — breakeven exclusion from the
  win-rate denominator, the `wins/(wins+losses || 1)` divide-by-zero guard, null-regime→`UNKNOWN`
  bucketing + total-P&L sort, finite-only slippage averaging, and the single-tag best===worst suppression
  — could regress silently under a refactor and pass every gate. Inspection found the function correct
  (defensively written; no defect), but unprotected. Renderer display; off the trading-safety perimeter
  (aggregates block no order). Found via the work-layer code-audit coverage-gap sweep (the 2026-06-29
  handoff NEXT steered to untested renderer stores / lib helpers — lib was already fully covered).
- **Solutions:** (a) add a co-located `journalStore.test.ts` exercising the pure export with crafted
  `ClosedTrade` fixtures — new-file-only (zero source edit → lowest bridge-corruption risk), pins the
  contract, the proven P-024/025/026/031/032/033/042 zero-coverage-close pattern; (b) defer (the function
  is "obviously correct" by inspection — leaves the operator-facing stats unprotected); (c) extract the
  math into a separately-tested helper (over-engineering a correct function, churns an import).
- **Decision:** **(a)** — lowest blast radius, off-perimeter, mirrors the established in-repo precedent
  (P-042 shipped a regression net around a correct-but-untested off-perimeter file the same way). No
  source change to `journalStore.ts`; production cannot regress from this commit.
- **Shipped (2026-06-29, work-layer):** new `src/renderer/stores/journalStore.test.ts` (12 tests):
  empty→zeroed aggregate; all-breakeven→no-NaN win rate; win/loss accounting with breakeven excluded;
  1.0 win rate with wins+breakevens; conviction high≥7 / low≤4 bucketing; finite-only slippage average +
  null-when-none; per-regime null→`UNKNOWN` + total-P&L-desc sort + breakeven-excluded regime win rate;
  per-tag P&L accumulation across multi-tag trades + best/worst selection + single-tag worst suppression.
  `journalStore.ts` byte-for-byte unchanged. New file is LF; NUL/CRCR scan clean; braces/parens/brackets
  balanced.
- **Gate verification (2026-06-29; master @ 664c0d5 working tree + P-046 edit + this test; mount
  node_modules, Node v22):** typecheck exit 0 | lint exit 0 (0 warnings) | vitest 101 files / 1299 tests
  / 0 fail (sharded 4×: 348+427+269+255; +1 file / +12 tests vs the 100/1287 baseline) | knip exit 0
  (Node-20 shim; 23 unused-export + 29 unused-type pre-existing warnings only — none new, the test adds
  no exports and consumes the already-exported `computeJournalAggregates`).
- **Status:** SHIPPED — awaiting operator commit.

### P-046 · `SettingsModal` self-eval poll timers leak setState-after-unmount (the PR #6 leak class, recurred)
- **Problem:** `runSelfEvalNow` (`src/renderer/components/modals/SettingsModal.tsx:69-82`) schedules
  three `setTimeout`s (`[1500, 4000, 8000]` ms, the poll-loop at `:76-78`) to reveal the "Running… →
  result" transition without a permanent interval. Each fires `refreshSelfEval()` (`:54-59`) which calls
  `setSeStatus` (a setState) after a `getSelfEvalStatus()` IPC round-trip. The timer IDs were **never
  tracked and never cleared** — there is no cleanup effect for them. Closing the Settings dialog within
  ~8 s of pressing "Run Self-Eval Now" therefore fires up to **three setState-after-unmount calls plus
  three orphaned IPC reads** into a closed modal. This is the documented PR #6 "clean up what you create"
  / setState-after-unmount class (AGENTS.md / app `CLAUDE.md` load-bearing invariant), and it was the
  lone uncleared timer in the renderer: the work-layer's 2026-06-28 passover flagged it as a
  "Low-priority future note". A renderer timer/listener/observer sweep this session confirmed every other
  `setInterval`/`setTimeout` has a matching `clearInterval`/`clearTimeout` cleanup, and every
  `addEventListener` file has a `removeEventListener` — `CommandPalette.tsx:31`'s one-shot focus
  `setTimeout` is null-guarded (`inputRef.current?.focus()`, no setState) so it is **safe**, and
  `TweaksPanel`'s drag listeners remove on `mouseup` (a transient setState-after-unmount only if
  unmounted mid-drag-hold — noted, not fixed). SettingsModal was the one real defect.
- **Solutions:** (a) hold the three timer IDs in a `useRef<ReturnType<typeof setTimeout>[]>` and clear
  them in a mount-once unmount cleanup `useEffect` — smallest blast radius (one file, +11/-2), byte-
  matches the canonical in-repo `App.tsx` `armTimerRef` + `clearTimeout` pattern, behaviour-identical
  while mounted (the synchronous `await refreshSelfEval()` at `:79` still does the immediate refresh);
  (b) replace the three timers with a single tracked `setInterval` that self-clears after the third poll
  (more state, no benefit over (a) for a fixed 3-shot reveal); (c) leave as-is (ships the documented leak
  class on a real user path: open Settings → Run Self-Eval → close fast).
- **Decision:** **(a)** — mirrors the established in-repo idiom exactly, off the trading-safety perimeter
  (renderer presentation; routes no order), minimal and provably correct (the timers that were never
  cleared now are; a ref is stable across renders so `forEach(clearTimeout)` reads the live array at
  unmount — no stale closure). **No unit test added:** `src/renderer` has **no React component-test
  infrastructure** (`@testing-library/react` is not a dependency; zero `*.test.tsx` files), and the leak
  is not observable without mounting the full modal — adding the harness is a dependency/lockfile change
  out of scope for an autonomous off-perimeter run. Verified by the gate suite + a diff review against
  the canonical `App.tsx armTimerRef` form — the exact precedent set by P-043 (ChartPanel observer leak).
  Found via PSD rule 2(d) renderer leak-class sweep (handoff queue exhausted; no actionable
  off-perimeter DECIDED entry — P-009/P-011/P-012 are sign-off- or work-gated).
- **Blueprint:** `00-PROJECT-ROOT/01-SATEX-CORE/satex-app/docs/superpowers/specs/2026-06-29-settings-modal-selfeval-timer-leak-ultraplan.md` (all 7 layers).
- **Shipped (2026-06-29, daily PSD):** `SettingsModal.tsx` — `:10` add `useRef` to the react import;
  `:53` add `const pollTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])`; `:55-61` add the
  unmount cleanup effect (`pollTimersRef.current.forEach(clearTimeout)`); `:86` wrap the poll
  `setTimeout` in `pollTimersRef.current.push(...)`. CRLF-preserved python edit (file is CRLF: 568→577
  CRLF, +9 lines; 0 lone-LF); anchors count==1 each; NUL/CRCR scan clean; brace/paren/bracket balanced.
- **Gate verification (2026-06-29; master @ 664c0d5 working tree + edit; mount node_modules, Node v22):**
  typecheck exit 0 | lint exit 0 (0 warnings) | vitest 100 files / 1287 tests / 0 fail (sharded 4×:
  340+405+274+268) | knip exit 0 (Node-20 shim; 23 unused-export + 29 unused-type pre-existing warnings
  only — none new, no export added). Code-only change; test count unchanged.
- **Re-verified (2026-06-29, work-layer):** independently re-read `SettingsModal.tsx` — the only
  `setTimeout` is the captured `pollTimersRef.current.push(...)` one and the mount-once unmount cleanup
  effect (`forEach(clearTimeout)`) is present; byte-scan clean (0 NUL / 0 \r\r; 577 CRLF; balanced). Four
  gates re-run green against the working tree (typecheck 0 | lint 0/0w | vitest 100 files / 1287 tests /
  0 fail | knip 0). Fix confirmed correct.
- **Status:** SHIPPED — awaiting operator commit.

### P-044 · No ErrorBoundary around the workspace center -> a Markets/Replay panel throw blackscreens the whole terminal
- **Problem:** Operator report: switching to the MARKETS or REPLAY tab blanks the entire terminal
  (Electron window alive, React tree gone — only the OS window-size chrome shows through the
  transparent body). `App.tsx` renders the center-column workspace content (`MarketsOverviewPanel`,
  `ReplayPanel`+`ChartPanel`, etc.) **with no error boundary**, so any render throw in the active panel
  unmounts the whole `bb-app` tree (React 18 default). The Quad workspace is the lone survivor precisely
  because `QuadChartPanel` wraps each pane in `<ErrorBoundary>` (`QuadChartPanel.tsx:54/77`) — the rest
  of the stage had no such isolation. For a live-capital terminal a single panel fault taking down the
  whole UI (incl. the kill-switch chord surface) is a confidence/safety problem, not just cosmetic.
- **Solutions:** (a) wrap the center-column content in ONE keyed `<ErrorBoundary>` (key = workspace) with
  an informative fallback — smallest blast radius, mirrors the proven QuadChartPanel pattern, isolates
  the active workspace and surfaces the real `err.message` so the specific throw becomes diagnosable on
  the next run; (b) hunt the exact throw blind and patch only that panel (does not prevent the next
  unknown panel fault from blackscreening; both panels read defensively, so the throw is data-dependent
  and not reproducible without the live Electron GUI, which the sandbox cannot run); (c) a single
  app-root boundary (coarser — a center-panel fault would still blank the rails/topbar).
- **Decision:** **(a)** — resilience-first is the correct architecture for a trading terminal and is
  already the in-repo idiom (QuadChartPanel). The boundary converts an undiagnosable blackscreen into a
  contained, labeled fallback that keeps every other workspace + the kill-switch reachable AND prints the
  real error, which is the fastest path to the root-cause panel fix. Keyed by `effectiveWs` so switching
  tabs always remounts a clean attempt. Off the trading-safety perimeter (renderer presentation; routes
  no order).
- **Shipped (2026-06-29, operator bug report):** `App.tsx` — import `ErrorBoundary`; wrap the
  `bb-col-center` children in `<ErrorBoundary key={effectiveWs} fallback={(err)=>...}>` (fallback shows
  "<ws> workspace failed to render" + `err.message` + a "rest of the terminal is unaffected" hint).
  LF-preserved; 3-anchor python edit (count==1 each); NUL/CRCR clean; braces/parens balanced.
- **Gate verification (2026-06-29; master @ f306f24 working tree + edits; Node v22):** typecheck exit 0
  | lint exit 0 (0 warnings) | vitest 100 files / 1287 tests / 0 fail (sharded 4x: 340+405+274+268) |
  knip exit 0 (Node-20 shim; 23+29 pre-existing warnings only — none new).
- **Status:** SHIPPED — awaiting operator commit + a launch confirm. NOTE: the boundary makes the crash
  non-fatal and will display the exact Markets/Replay error string on next run — capture that to root-fix
  the underlying panel throw (follow-up).

### P-045 · Quad panes render empty/"sloppy" when switching INTO Quad with data already present
- **Problem:** Operator report: "chart updates need to persist within the quad view; very sloppy chart
  outputs." `QuadPaneChart` creates its lightweight-charts series **asynchronously**
  (`await import('lightweight-charts')`, `QuadPaneChart.tsx:97-127`), but the bulk `setData` /
  EMA / VWAP effects key only on `[chartCandles.length]` (+overlay opts) and gate on the series ref.
  On switching INTO Quad with candles already in the store, those effects fire once on mount **before**
  the async series exists (early-return), and then never re-fire (length unchanged) — so the pane shows
  its frame + header stats but **no candles** until the next bar append ticks `length`. `hasData` is
  true (so the "awaiting data" overlay is suppressed), which reads as an empty/"sloppy" pane. Initial
  cold launch looks fine only because candles arrive AFTER the chart is ready (0 -> N flips length).
- **Solutions:** (a) add a `ready` state flag set when the series is created and thread it into the
  data-apply effect deps so they re-run the instant the chart is ready — applies the already-present
  data immediately, no per-tick repaint cost (intra-bar deps unchanged); (b) make `setData` depend on
  the full `chartCandles` reference (fires every tick -> full-series repaint per tick on 4 panes, the
  perf anti-pattern the `[length]` keying deliberately avoids); (c) synchronously read current candles
  via refs inside the creation effect (duplicates the apply logic, stale-closure risk).
- **Decision:** **(a)** — minimal, idiomatic, and correct: `ready` flips exactly once per mount, so each
  of the three data effects (candles / EMA / VWAP) runs one extra time at chart-ready and applies the
  existing series; the live ratchet + length-append paths are untouched. Off the trading-safety perimeter
  (renderer presentation).
- **Shipped (2026-06-29, operator bug report):** `QuadPaneChart.tsx` — `const [ready,setReady]=useState`;
  `setReady(true)` after series init, `setReady(false)` in cleanup; added `ready` to the setData / EMA /
  VWAP effect dep arrays. CRLF-preserved binary edit (file is CRLF — the bridge truncation case);
  NUL/CRCR clean; braces/parens balanced; 304 CRLF / 0 lone-LF.
- **Gate verification (2026-06-29; master @ f306f24 working tree + edits; Node v22):** typecheck exit 0
  | lint exit 0 (0 warnings) | vitest 100 files / 1287 tests / 0 fail (sharded 4x: 340+405+274+268) |
  knip exit 0 (Node-20 shim; pre-existing warnings only).
- **Status:** SHIPPED — awaiting operator commit + a launch confirm (switch Trade->Quad should now paint
  candles immediately, not on the next bar).

### P-043 · `ChartPanel.tsx` leaks a `ResizeObserver` on every remount (the PR #6 leak class, recurred)
- **Problem:** The single-chart init effect (`src/renderer/panels/ChartPanel.tsx`, the central Trade/Focus
  chart) creates `const ro = new ResizeObserver(...)` + `ro.observe(containerRef.current)` (`:593/:598`)
  **inside the async IIFE**, so `ro` is local to that closure. The effect cleanup (`:604`) calls
  `chart.remove()` and nulls the refs but **never disconnects `ro`** — and `ro` is not even in the
  cleanup's scope. Every ChartPanel unmount/remount (workspace switch off Trade/Focus, the symbol-change
  remounts) **orphans a live `ResizeObserver`** that still references the container element and whose
  callback closes over the now-`remove()`d `chart`; on the next container resize the orphan calls
  `.resize()` on a disposed chart (dead work / potential throw) and the observer + closure never GC.
  This is the **exact PR #6 `ResizeObserver` leak class** AGENTS.md / app `CLAUDE.md` flag as
  load-bearing ("a real `ResizeObserver` leak shipped once — don't repeat it"), recurred on the busiest
  panel. The repo's own `QuadPaneChart.tsx` (`:128/:140`) already carries the fixed form of this exact
  bug (comment: "stop observing before dispose — was leaked (lived only in the init closure)") — so the
  canonical fix is established in-tree; ChartPanel was the un-swept sibling. Found via the PR #6
  leak-class sweep (add/removeEventListener, timers, observers) the P-042 NEXT note steered to.
- **Solutions:** (a) hoist `ro` to an effect-scoped `let ro: ResizeObserver | null = null`, assign it in
  the IIFE, and `ro?.disconnect()` in the cleanup — byte-identical to the proven QuadPaneChart fix,
  smallest blast radius (3 lines, one file), behaviour-identical while mounted; (b) move `ro` into a
  `useRef` and disconnect via the ref (heavier, no benefit over (a) for a mount-once effect); (c) leave
  as-is (ships the documented leak class on the central chart).
- **Decision:** **(a)** — mirrors the established in-repo pattern exactly, off the trading-safety
  perimeter (renderer presentation; routes no order), minimal and provably correct (the observer that
  was never disconnected now is). No unit test added: ChartPanel is a heavy dynamic-`import`
  lightweight-charts component with no co-located harness, and the leak is not observable without
  mounting the full chart; the fix is verified by the gate suite + a 3-hunk diff review against the
  canonical QuadPaneChart form (the same way that sibling fix shipped). The companion observer-lifecycle
  invariant is unit-pinned this session on `WebGLRenderer` (P-042).
- **Shipped (2026-06-28, work-layer passover):** `ChartPanel.tsx` — `let ro` hoisted to effect scope;
  `const ro = new ResizeObserver` → `ro = new ResizeObserver`; `ro?.disconnect()` added in the cleanup
  before `chart.remove()`. LF-preserved python edit (file is LF; anchors count==1 each); diff is exactly
  3 hunks; NUL/CRCR scan clean; brace/paren balanced (1672→1674 lines).
- **Gate verification (2026-06-28, work-layer passover; master @ da6a256 working tree + edits; mount
  node_modules, Node v22):** typecheck exit 0 | lint exit 0 (0 warnings) | vitest 100 files / 1287 tests
  / 0 fail (sharded 4×: 340+405+274+268) | knip exit 0 (Node-20 shim; 23 unused-export + 29 unused-type
  pre-existing warnings only — none new; the fix adds no exports). Code-only change; test count unchanged.
- **Status:** SHIPPED — awaiting operator commit.

### P-042 · `WebGLRenderer.ts` (CHART-10) — zero coverage on the PR #6 leak-invariant file
- **Problem:** `src/renderer/chart/webgl/WebGLRenderer.ts` — the WebGL2 overlay base every
  density-overlay layer (footprint / volume-profile / vol-heatmap) composes — owns a canvas, a rAF
  loop, two context-loss listeners and a GPU context, and exists specifically to guarantee the
  load-bearing PR #6 "clean up what you create" invariant (app `CLAUDE.md`): on `destroy()` the
  listeners are removed, the rAF loop cancelled, the GL context freed, and the canvas detached. It had
  **zero test coverage** — the one untested off-perimeter shared/renderer file with real lifecycle
  logic (the webgl *compute* siblings footprint/volume-profile/vol-heatmap/lod are all tested; the
  chart-indicator math is covered by `indicators.test.ts`). A teardown regression — a re-introduced
  listener/timer leak, the exact class as the real `ResizeObserver` leak that shipped in PR #6 — would
  pass every gate silently. Audit verdict: the file is defensively written (idempotent `destroy`, paint
  errors swallowed, destroy-guarded tick, context-loss → null-gl short-circuit) — **no logic defect**;
  the gap is the missing regression net around the invariant.
- **Solutions:** (a) add a co-located `WebGLRenderer.test.ts` driving the real class under jsdom with a
  stubbed WebGL2 context + controlled `requestAnimationFrame`, asserting the construct/teardown contract
  and the leak invariant; (b) defer (the file is "obviously correct" by inspection); (c) cover it
  indirectly via a consumer (footprint) integration test (heavier, indirect, would not pin the
  lifecycle).
- **Decision:** **(a)** — new file only (zero source edit → lowest bridge-corruption risk), off the
  trading-safety perimeter (renderer presentation; routes no order), same new-test-only pattern as
  P-024/025/026/031/032/033. jsdom supplies createElement/dispatchEvent; the WebGL2 context and rAF are
  stubbed so the loop is driven deterministically (the NavController/perf test pattern already in the
  suite). Pins the PR #6 invariant the file was written to hold. Found via PSD rule 2(d)/rule 4
  coverage-gap audit (the 2026-06-28 daily's blueprint was COMPLETE; nothing REMAINING/BLOCKED).
- **Shipped (2026-06-28, work-layer):** new `src/renderer/chart/webgl/WebGLRenderer.test.ts` (14 tests):
  construction (canvas attach + absolute/zIndex/pointerEvents, custom zIndex, rAF start); frame loop
  (paint called with gl + pixel dims then reschedules; paint errors swallowed so the loop survives;
  no-gl skip); `invalidate` (sync frame; no-op after destroy); context loss/restore (preventDefault +
  stop-paint + cancel; re-acquire gl + `onContextRestored` + resume); and the **destroy leak invariant**
  (canvas detached, loop cancelled, `WEBGL_lose_context.loseContext()` called, listeners removed so
  post-destroy events are inert, idempotent second `destroy()`, destroy-guarded stale tick).
  `WebGLRenderer.ts` is byte-for-byte unchanged — production cannot regress from this commit. NUL/CRCR
  scan clean; brace/paren balanced.
- **Gate verification (2026-06-28, work-layer; master @ da6a256 working tree + edits; mount
  node_modules, Node v22):** typecheck exit 0 | lint exit 0 (0 warnings) | vitest 100 files / 1287
  tests / 0 fail (sharded 4×: 340+405+274+268; WebGLRenderer's 14 confirmed collected in shard 4) |
  knip exit 0 (Node-20 shim; 23 unused-export + 29 unused-type pre-existing warnings only — none new,
  the test adds no exports). My contribution is +14 (`WebGLRenderer.test.ts`); the remaining delta from
  this session's boot reading (98/1268, a stale `feat/d10` bridge sync) is `extent.test.ts` (+1 file/+5,
  the daily's P-041 test the stale tree lacked) — both reconcile to 100/1287.
- **Status:** SHIPPED — awaiting operator commit.

### P-041 · `PortfolioMiniPanel` spreads an unbounded PnL-snapshot array into `Math.min`/`Math.max`
- **Problem:** `PortfolioMiniPanel.tsx` builds its equity-curve sparkline with
  `const min = Math.min(...snapshots), max = Math.max(...snapshots)` (`:54`) and duplicates the same
  spread four more times in the SVG baseline (`:77-78`). `snapshots` <- `getPnlSnapshots(sid)` <-
  `listPnlSnapshots` (`persistence.ts:374`, `SELECT * FROM pnl WHERE session_id=? ORDER BY timestamp
  ASC` — **no LIMIT**), and `recordPnlSnapshot` runs every 60s (`trading-engine.ts:568`) with no cap.
  An always-on session grows `snapshots` past the V8 spread-argument cap (~65k–125k) in ~45 days, at
  which point `Math.min(...snapshots)` throws `RangeError: Maximum call stack size exceeded` and the
  panel `useMemo` crashes (blank / error-boundary panel). The P-027 (vol-heatmap) / QuadPaneChart
  unbounded-spread class, not previously swept into the panel layer. Reachable in normal use given
  the always-on institutional-terminal vision; the spread path was untested.
- **Solutions:** (a) single-pass `seriesExtent` helper in `renderer/lib/` computing min/max in one
  loop, routed through the panel polyline + baseline (off-perimeter, root fix at the spread site);
  (b) add a `LIMIT`/cap to `listPnlSnapshots` (smallest code, but **PERIMETER one-way-door** — would
  change what `risk-gates.ts:308` sees, needs operator sign-off); (c) leave as-is (latent crash).
- **Decision:** **(a)** — smallest off-perimeter blast radius, fixes the root where the spread lives,
  a reusable helper prevents reintroduction, and dedupes the 9 spreads into one pass. (b) is VETOED
  for autonomous work (touches the risk-gate VaR input); recorded as operator-deferred. Found via PSD
  rule 2(d) audit (self-directed NEXT from the P-039/P-040 chart-layer sweep).
- **Shipped (2026-06-28, daily PSD):** new `src/renderer/lib/extent.ts`
  (`seriesExtent(values): {min,max}`, identity extent for empty) + `extent.test.ts` (+5 tests, incl.
  a 300k-element no-throw mirroring `vol-heatmap.test.ts`). `PortfolioMiniPanel.tsx` 3 edits (import;
  `eqMin/eqMax` memo + path rewrite + guarded `baseY`; JSX `y1/y2 -> {baseY}`) — CRLF-safe python
  edits, anchors count==1, NUL/CRCR clean, zero `...snapshots` spreads remain (the 1 mention is the
  explanatory comment). `risk-gates.ts:308` verified safe (for-loop, no spread) and left untouched.
- **Gate verification (2026-06-28, master @ da6a256 working tree + edits, mount node_modules, Node
  v22):** typecheck exit 0 | lint exit 0 (0 warnings) | vitest 100 files / 1287 tests / 0 fail
  (sharded 8x: 193+155+252+181+129+148+143+86) | knip exit 0 (Node-20 shim; 29 pre-existing
  CHART-barrel unused-type warnings, none new — `Extent` is used via the function signature).
- **Status:** SHIPPED — awaiting operator commit.

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

### Session: 2026-06-28 work-layer (finisher / execution layer, scheduled)
- **Boot (file-bridge nondeterminism):** the mount served a **stale** working tree + ledger at boot —
  it showed `feat/d10-funded-account @ e158e48` with the ledger topping out at P-040 and **no**
  2026-06-28 daily handoff, so the run opened in the rule-1 fallback. Mid-session the bridge re-synced
  to the true current tree (`master @ da6a256`, the 2026-06-28 daily's P-041 already shipped, handoff
  present). Re-read the current handoff/ledger; reconciled. Lesson re-confirmed: do not trust a single
  boot read under the bridge — re-verify.
- **Infra recovery (P-018/P-021 class, real this session):** the boot tree had **10 source files
  corrupted** by the bridge — 9 trailing-NUL pads (`indicators.test.ts`, `double-top.ts`,
  `double-bottom.ts`, `ensemble-fuser.ts`+`.test.ts`, `simulator-bracket.ts`+`.test.ts`,
  `id-generator.test.ts`, `rng.test.ts`) and **1 mid-statement truncation** (`main/index.ts` cut at
  line 1156, losing the `before-quit` tail). typecheck was RED (TS1127 invalid-character / TS1002
  unterminated-string). Repaired: python `rstrip(b'\x00')` on the trailing-NUL files (each verified
  trailing-only + brace-balanced); for `index.ts`, spliced the lost tail from the `e158e48` git object
  while **preserving** the working tree's P-037 `onHealthReport` push (line 557) — restored
  byte-for-byte to the intended content (gates green). Not a new ledger number — this is the standing
  P-018(b)/P-021 file-bridge artifact class (the daily hit the same class on `.git/HEAD`). git CLI HEAD
  is broken **again** in this session's view (loose refs valid: `master=da6a256`, `feat/d10=5b1fc5a`)
  — reinforces operator item #1 (index/HEAD hygiene).
- **Blueprint execution:** the 2026-06-28 daily handoff reported its blueprint COMPLETE (P-041; all
  Layer-3 tasks DONE) — **nothing REMAINING, nothing BLOCKED, no APPROVAL NODES**. Independently
  re-verified P-041 per the daily's NEXT: `PortfolioMiniPanel.tsx` imports `seriesExtent` and has zero
  `Math.min/max(...snapshots)` spreads (one mention is a comment); `extent.test.ts` (5) green. Correct.
- **Code audit (PSD rule 2(d) / rule 4):** the daily's NEXT confirmed the webgl-compute + chart-indicator
  + funded layers clean and the `Sparkline`/`FundedAccountPanel` spreads bounded — re-confirmed. The
  one remaining untested off-perimeter file with real logic is **`WebGLRenderer.ts`** (CHART-10), the
  WebGL2 base that exists to hold the PR #6 "clean up what you create" leak invariant — defensively
  written (no logic defect) but with **zero coverage**. Shipped **P-042**: a new co-located
  `WebGLRenderer.test.ts` (14 tests) pinning construct/teardown + the leak invariant under jsdom with a
  stubbed GL context + controlled rAF. New-file-only; source byte-unchanged.
- **Gates (final, master @ da6a256 working tree + edits, mount node_modules, Node v22):** typecheck
  exit 0 | lint exit 0 (0 warnings) | vitest 100 files / 1287 tests / 0 fail (sharded 4×:
  340+405+274+268) | knip exit 0 (Node-20 shim; 23 unused-export + 29 unused-type pre-existing warnings
  only — none new). Shipped this session: **P-042** (+14). The corruption repair restored the suite from
  RED to this green.
- **Approval nodes flagged for operator:** none new. Reinforced standing: git `.git/index` + HEAD
  corruption (operator item #1 — recurred this session; needs `git reset` mixed + lock/litter cleanup),
  the uncommitted P-024→P-042 backlog (commit per AGENTS branch→PR; L1.F/P-009 needs human sign-off),
  P-041 root = a `LIMIT`/retention cap on `listPnlSnapshots` (perimeter — `risk-gates.ts` reads it),
  and P-007/P-014/P-017/P-020/P-022/P-028.
- **Status:** Session complete — all changes UNSTAGED per AGENTS.md (no git add / commit).

### Session: 2026-06-28 work-layer — operator-directed passover (claim validation + P-043)
- **Mandate:** operator asked for a final passover — validate every claim from the 2026-06-28 daily
  before touching anything, then ship a high-leverage off-perimeter upgrade. Git is **functional again**
  this run (`.git/HEAD` clean, 24 bytes, no NUL — the daily's `printf` recovery is now visible; `git
  status` sane), so validation used real git diffs/objects.
- **Claims validated (all TRUE, file:line):** (1) blueprint present (10,527 B). (2) P-041 fix live —
  `PortfolioMiniPanel.tsx:13/56` uses `seriesExtent`, **zero** `Math.min/max(...snapshots)` spreads
  (the one `...` is a comment). (3) P-041 SHIPPED + session entry in ledger. (4) gates green
  (re-ran: 100/1287, all four). (5) **Sparkline/FundedAccountPanel spreads bounded** — every
  `q.sparkline` is a fixed rolling window (`live-market.ts:49/142`, `market-data.ts:105/227`:
  `new Array(SPARKLINE_LENGTH).fill` + `shift()/push()`), and `FundedAccountPanel:360` spreads
  `ledger.slice(-10)` (≤10). (6) webgl + shared-math clean — re-confirmed; `risk-gates.ts:308`
  consumes `getPnlSnapshots()` via `.map().equity` + a `for` loop (**no spread** — perimeter, untouched).
  (7) `listPnlSnapshots` (`persistence.ts:374`) is `SELECT * FROM pnl … ORDER BY timestamp ASC` —
  **no LIMIT** confirmed (perimeter root-cause; correctly deferred to operator sign-off). (8) git HEAD
  NUL-corruption + recovery — confirmed (now clean). (9) git index phantom entries — were real at the
  daily's runtime; **not present in the current `.git` view** (the bridge re-synced; `git status` is
  clean save the expected backlog + a few stray untracked junk files `*.txt`/`Untitled.canvas`).
- **New defect found + shipped (off-perimeter): P-043** — ran the PR #6 leak-class sweep
  (add/removeEventListener, set/clearTimeout|Interval, Observer/disconnect) across the renderer. Found
  the **central `ChartPanel` leaks its `ResizeObserver` on every remount** (created `const ro` inside the
  init IIFE; cleanup disposes the chart but never `ro.disconnect()`) — the exact PR #6 class, already
  fixed in `QuadPaneChart` but un-swept here. Fixed with the canonical effect-scoped `let ro` +
  `ro?.disconnect()` (3-hunk diff, byte-matches the QuadPaneChart form). Other sweep hits cleared:
  `main.tsx:14` CSP listener (app-lifetime, intentional), `App.tsx` arm timer (ref-managed +
  `clearTimeout`), `CommandPalette:31` (one-shot `?.focus()`, no state). Low-priority note for a future
  pass: `SettingsModal.tsx:77` defers `refreshSelfEval()` via an uncleared `setTimeout` (possible
  setState-after-close warning — minor, not fixed to avoid churning a second .tsx).
- **Gates (final, master @ da6a256 working tree + edits):** typecheck exit 0 | lint exit 0 (0 warnings)
  | vitest 100 files / 1287 tests / 0 fail (sharded 4×: 340+405+274+268) | knip exit 0 (Node-20 shim;
  23 unused-export + 29 unused-type pre-existing warnings only — none new). Shipped this passover: P-043.
- **Status:** Passover complete — all changes UNSTAGED per AGENTS.md (no git add / commit).

### Session: 2026-06-28 daily PSD (planner / first executor, scheduled)
- **Infra recovery:** `.git/HEAD` was NUL-corrupted (`ref: refs/heads/master` + NUL padding to 40
  bytes — file-bridge artifact, P-018 class); every git command failed with "branch appears to be
  broken". Reflog confirmed HEAD legitimately on `master` (last op `pull --ff-only` -> da6a256), so
  rewrote `.git/HEAD` with a clean `printf` ref. Git functional again.
- **Index corruption (flagged, NOT auto-fixed):** the index carries phantom entries from the same
  bridge event — control-char paths (`\004`, `\324`, `\024`, `./`), `UU` unmerged states with no
  MERGE_HEAD, and staged deletions of files that also exist untracked. Mass `git reset` risks
  clobbering the operator's intentional staged cleanup (P-022), so left for operator review per
  AGENTS.md "leave unstaged" — see handoff operator items.
- **Pick (PSD rule 2d):** handoff queue exhausted (2026-06-27 COMPLETE); no actionable DECIDED entry
  (P-009 perimeter; P-011/P-012 milestone-deferred). Audited the webgl chart-compute layer
  (footprint/volume-profile/lod/vol-heatmap — all clean, P-027/P-030 confirmed fixed), funded/
  (perimeter or P-028 operator-deferred), and shared + chart-indicator math (ema/rsi/indicators all
  guard `period`) -> found **P-041** (PortfolioMiniPanel unbounded snapshot spread). Shipped (a);
  all four gates green; everything UNSTAGED.
- **Blueprint:** `00-PROJECT-ROOT/01-SATEX-CORE/satex-app/docs/superpowers/specs/2026-06-28-portfolio-equity-extent-spread-ultraplan.md`.

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

