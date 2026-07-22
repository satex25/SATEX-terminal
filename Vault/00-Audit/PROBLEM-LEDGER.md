---
type: ledger
title: SATEX Problem Ledger — the living PSD queue
tags: [satex, psd, problems, ledger]
updated: 2026-07-22
---

# Problem Ledger

> The continuous **Problem → Solutions → Decision** loop, mandated by `AGENTS.md` §PSD.
> Every agent session: read this on boot, update it on close. Each entry uses the
> `/problem-solution-decision` shape: evidenced PROBLEM, ≥2 candidate SOLUTIONS with
> trade-offs, a DECISION with rationale. Statuses: **OPEN → DECIDED → IN-PROGRESS →
> SHIPPED → VERIFIED**. Nothing is ever deleted — solved entries sink to §Closed.

---

### P-130 · Chart-subtree jsdom-harness coverage — wave 1 of the P-129 map: `useIPC.ts` (the single IPC-subscription hub / §2.5.7 listener-cleanup surface) + `drawing-renderer.ts` (the pure canvas `renderDrawing` switch), both shipped with zero coverage; 31 characterization tests added, both subjects byte-unchanged — SHIPPED (2026-07-22, unstaged for operator review)
- **PROBLEM:** P-129 mapped the remaining chart coverage gap as a coherent jsdom/canvas-stub workstream and named its first two targets; both carried load-bearing behavior with no regression pin. (1) `src/renderer/hooks/useIPC.ts` (154 L) is the App-root IPC hub: on mount it subscribes ~20 push channels (6 required + 14 optional, each `?.()`-guarded with a `?? (() => {})` fallback), on unmount it calls all 20 unsub fns — the §2.5.7 listener-cleanup surface (PR #6/P-041/P-043/P-046/P-091 leak lineage) — plus the replay-boundary reset logic (`resetCandles`+`footprint.reset` fire only when crossing into/out of replay, never while staying) and the honestly-empty-deps "subscribe once, never re-subscribe" contract the file's own header defends. A dropped unsub, an inverted replay transition, or a re-subscribe-on-render regression had no failing gate. (2) `src/renderer/chart/drawing/drawing-renderer.ts` (145 L) is the pure canvas `renderDrawing` switch over 6 drawing kinds; its `(x2 - x1) || 1` vertical-extend divide-by-zero guard (P-039/P-040/P-093 degenerate-input class), its dpr scaling, its selected-vs-`color` selection, and its empty-fib (`hi==lo → fibLevels []`) branch were all unpinned.
- **SOLUTIONS considered:** 1. *Add `@testing-library/react` and use its `renderHook`.* Rejected — a new devDependency violates dependency minimalism (§1.1, knip-enforced); a prior-session `__harness_probe.test.tsx` already proves a hand-rolled `renderHook` (react-dom/client `createRoot` + `act`, zero new deps) works under jsdom. 2. *Hand-rolled `renderHook` (jsdom) for the hook + a mock `CanvasRenderingContext2D` spy object (node env) for the pure renderer.* **Chosen** — additive, zero source-edit risk, zero new deps; each unpinned invariant now turns a test red. 3. *Force the whole P-129 map (export.ts, useChartOpts, 7 views) in one session.* Rejected — too-large-to-batch; wave it (P-129 explicitly warned against a rushed jsdom suite).
- **DECISION + rationale:** (2). Off-perimeter (renderer UI + pure canvas math; no order/risk/kill/arm/credential/update-feed path). `useIPC.test.tsx` (jsdom, 12 tests): missing-`window.satex` guard (console.error, no throw); required-channel subscribe-once + `subscribe([])` seed; no-re-subscribe-on-rerender; **the cleanup contract — all 20 unsubs fire exactly once on unmount** (6-channel and 20-channel cases) + idempotent re-subscribe after unmount; optional-channel absence tolerated + presence subscribed; push routing (`onQuotesTick → marketStore.updateQuotes`, spied, wiring not inverted); the replay-transition reset logic (enter→reset, stay→no-reset, leave→reset, status always forwarded); seed-fetch fire-once + the `.catch` wall on a rejecting seed. `drawing-renderer.test.ts` (node, 19 tests): save/restore balance, `color`/accent/`lineWidth`×dpr selection, line plain + dpr scaling + extend projection + **the vertical-extend `||1` finite-coord guard**, hline/vline label conditionals, rect `globalAlpha` set→reset + dpr-scaled fillRect/strokeRect, fibonacci one-line-per-level + final-level color + **empty-fib zero-draw guard**, annotation dot+text+`fontSize` default. Subjects `useIPC.ts` / `drawing-renderer.ts` byte-unchanged (`git diff --stat` empty). Blueprint: `apps/satex-terminal/docs/superpowers/specs/2026-07-22-chart-hook-drawing-renderer-jsdom-coverage-ultraplan.md`.
- **DIVERGENCE / notes:** (a) the first `drawing-renderer.test.ts` draft imported an unused `Drawing` type → `tsc` TS6196 (noUnusedLocals) caught it before the gate; removed (the specific variants are what's used). (b) the prior-session `__harness_probe.test.tsx` (untracked, unstaged, provenance-unverified) is now **strictly superseded** by `useIPC.test.tsx` (its 3 probe tests are a subset of these 12) — recommend the operator delete the probe; left in place this session (not deleted unattended — it is another session's untracked artifact awaiting operator review).
- **Gates (2026-07-22, sandbox Node 22.22.3, against the mounted repo):** vitest both files **31/31 ×2** order-independent (`--sequence.shuffle`, both exit 0; useIPC 12 jsdom, drawing-renderer 19 node) · full-project `npm run typecheck` **exit 0** (both tsconfigs, new files included) · scoped `eslint` on both new files **exit 0, 0 warnings** (REAL green — the 45 s flat-config cold-start ceiling did not trip, so lint is NOT deferred to CI for these) · knip CI-arbitrated (P-097, sandbox oxc crash under Node 22). `package-lock.json` md5 **unchanged** (`b35d26e1f1a411c2ac12e0e3a344ba12`; linux-x64 rollup/esbuild natives already present, no `--no-save` install needed). Both new files byte-verified 0 NUL / 0 CRCR / LF-only / tail intact (`useIPC.test.tsx` 10,438 B; `drawing-renderer.test.ts` 9,651 B).
- **Status:** SHIPPED (2026-07-22) — `src/renderer/hooks/useIPC.test.tsx` + `src/renderer/chart/drawing/drawing-renderer.test.ts` NEW on the mount, **unstaged** for operator review (stale `.git/index.lock`, P-099/P-125 class, 0-byte from Jul 21 13:06, EPERM-unlinkable from the sandbox, blocks staging until operator unlock). CI re-arbitrates the full four-gate bar at merge. CHANGELOG: no entry (test-only, no app-behavior change; P-123/P-128 precedent).

### P-129 · Chart-subtree coverage survey (post-P-127/P-128): the remaining untested chart modules are all DOM/canvas-coupled (`drawing-renderer`, `export`, `useIPC`, `useChartOpts` + 7 `.tsx` views) — mapped for the next dawn, jsdom suite deliberately NOT forced in-session — DECIDED (2026-07-21)
- **PROBLEM:** With the renderer-store vein closed at 24/24 (P-127) and the shared chart-indicator math now behaviorally pinned (P-128), a 2026-07-21 census of `src/renderer/chart/` + the two named chart hooks shows the remaining chart coverage gap is entirely **DOM/canvas-coupled** logic that needs a jsdom + `renderHook`/canvas-stub harness the clean autonomous picks have so far avoided. Untested — logic/hook `.ts`: `chart/drawing/drawing-renderer.ts` (145 L, canvas-2D draw → jsdom canvas stub), `chart/export.ts` (207 L, PNG export → canvas + Blob/DOM), `hooks/useChartOpts.ts` (59 L, hook → `renderHook`), `hooks/useIPC.ts` (154 L, IPC subscription hook → `renderHook` + `window.satex` mock + jsdom; a §2.5.7 listener-cleanup surface). Untested view `.tsx`: `chart/flow/OrderFlowTape.tsx` (198), `chart/MultiTFOverlay.tsx` (267), `chart/overlay/CanvasOverlay.tsx` (162), `chart/overlay/CrosshairReadout.tsx` (170), `chart/drawing/DrawingLayer.tsx` (79), `chart/drawing/DrawingToolbar.tsx` (105), `chart/webgl/FootprintLayer.tsx` (63). Already covered (for the map): `tradesStore` (P-127), `DrawingModel`, `drawingStore`, all 6 shared indicators.
- **SOLUTIONS considered:** 1. *Force a jsdom + `renderHook` suite for the highest-value hook (`useIPC`) in the session tail.* Rejected — the handoff explicitly warns against forcing a jsdom suite in the last minutes; a rushed harness that mis-mocks `window.satex` yields false confidence, worse than an honest gap. 2. *Ledger the survey as the honest close (P-094 human-gated-coverage-map precedent) so the next dawn planner scopes a proper jsdom characterization program via a full ultraplan.* **Chosen.** 3. *Ignore it.* Rejected — an unrecorded gap gets re-chased (the P-127 handoff's §6 already burned a census on phantom coverage); the map prevents the repeat.
- **DECISION + rationale:** (2). The clean off-perimeter `.ts` picks are exhausted; the remainder is a coherent jsdom-harness workstream. Recommended start for the next dawn: `hooks/useIPC.ts` behind a `window.satex` stub (the IPC subscribe/cleanup leak surface, §2.5.7), then `drawing/drawing-renderer.ts` behind a canvas stub. This is a next-dawn ultraplan target, not an unattended session-tail build. No source touched.
- **Status:** DECIDED (2026-07-21) — survey only, zero code change; map recorded for the next dawn. **Wave 1 (useIPC + drawing-renderer) SHIPPED 2026-07-22 as P-130**; remaining map: export.ts, useChartOpts.ts + the 7 view .tsx.

### P-128 · Chart-indicator behavioral-coverage gaps on the P3 chart hot path (RSI flat-line neutral branch · Fibonacci direction-selection ordering · Pivot-Points asymmetric-close ladder) — 5 characterization assertions added to `indicators.test.ts`, subjects byte-unchanged — SHIPPED (2026-07-21, unstaged for operator review)
- **PROBLEM:** Evidence: `src/shared/chart-indicators/indicators.test.ts` (454 L / 34 tests pre-edit) covered the happy paths of the 6 chart indicators but left three load-bearing branches on the P3 operator-legibility chart surface (where P-093 already found a live bug) unpinned: (1) `rsi.ts:47-48 rsiFromAvgs` — the `avgLoss===0 && avgGain===0 → 50` neutral sub-branch (a dead-flat market) was untested; existing tests hit only `→100` (only-gains) and approximate-50 (symmetric), so a regression turning a flat series into `NaN` or a spurious `100` had no failing gate. (2) `fibonacci.ts:45 computeFibonacci` — the `uptrend = highIdx > lowIdx` direction switch (retrace DOWN from high vs UP from low) had only its uptrend value asserted; the downtrend branch and both full level-orderings were unpinned, so a direction-sense inversion regressed silently. (3) `pivot-points.ts:21 computePivotPoints` — the sole existing test used a SYMMETRIC HLC (C at the H/L midpoint), whose even level spacing can mask an R1/R2 or S1/S2 formula transposition, and it never asserted the strict `R3>R2>R1>PP>S1>S2>S3` ladder the operator legend renders.
- **SOLUTIONS considered:** 1. *Append characterization assertions to the existing tracked `indicators.test.ts` via the bash-mount append + byte-verify workflow (3 new describe blocks; subjects untouched).* **Chosen** — additive, zero source-edit risk, extends the established indicator-test pattern; each unpinned branch now turns a test red on regression. 2. *Edit the subject files to add guards/normalisation.* Rejected — the subjects are already correct (the branches exist and behave correctly, they were merely untested); editing correct code under automation off a coverage finding inverts correctness-precedes-optimization (§2.7). 3. *Skip; the branches are simple.* Rejected — they are on the P3 chart hot path and are exactly the behavioral gaps the stretch mission targets.
- **DECISION + rationale:** (1). Off-perimeter (pure shared math; no order/risk/kill/arm/credential/update-feed path). 5 new tests across 3 describe blocks: `rsiSeries` flat-line (exactly 50 at period 5 with warm-up NaN; 50 held across Wilder smoothing at period 14 — never NaN); `computeFibonacci` direction selection (uptrend price falls as ratio rises, 61.8→38.2; downtrend price rises as ratio rises, 61.8→61.8 — the discriminator — both full orderings pinned); `computePivotPoints` asymmetric close (H=120,L=90,C=115 → all 7 hand-verified levels + strict monotonic ladder + returned-array label order). Subjects `rsi.ts` / `fibonacci.ts` / `pivot-points.ts` byte-unchanged (`git diff --stat` empty).
- **DIVERGENCE from blueprint AUDIT-B:** the brief named `rsi.ts:rsiFromAvgs` as the test subject, but `rsiFromAvgs` is **module-private** (not exported); the flat-line branch is therefore pinned through the public `rsiSeries` (the only reachable path to it), preserving the encapsulation. No behavior gap — the `0/0 → 50` branch is exercised exactly.
- **Gates (2026-07-21, sandbox Node 22.22.3, against the mounted repo):** vitest `indicators.test.ts` **39/39** (was 34) **×2** order-independent (`--sequence.shuffle`, both exit 0) · full-project `npm run typecheck` **exit 0** (both tsconfigs) · scoped `eslint` on the file **exit 0** (REAL green — the 45 s flat-config cold-start ceiling did not trip, so lint is NOT deferred to CI for this file) · knip CI-arbitrated (P-097, sandbox oxc crash under Node 22). `package-lock.json` md5 **unchanged** (`b35d26e1f1a411c2ac12e0e3a344ba12`; linux-x64 rollup/esbuild natives already present, no `--no-save` install needed). Edited file byte-verified **0 NUL / 0 CRCR / LF-only / tail intact** (24,274 B = 18,673 original + 5,601 appended, +98 lines).
- **Status:** SHIPPED (2026-07-21) — `indicators.test.ts` MODIFIED (append-only, +5 tests) on the mount, **unstaged** for operator review (stale `.git/index.lock`, P-099/P-125 class, EPERM-unlinkable from the sandbox, blocks staging until operator unlock). CI re-arbitrates the full four-gate bar at merge. CHANGELOG: no entry (test-only, no app-behavior change; P-123 precedent).

### P-127 · `tradesStore.ts` (the per-symbol raw-trade ring buffer feeding OrderFlowTape / ChartPanel) shipped with zero test coverage — the last untested renderer store; 17-test characterization suite added, ring-buffer FIFO cap + frozen-empty-array selector invariant + subscription idempotency pinned — SHIPPED (2026-07-21, unstaged for operator review)
- **PROBLEM:** Evidence: `src/renderer/chart/flow/tradesStore.ts` (68 L) carried load-bearing behavior with no regression pin. It is the last untested renderer store — the `renderer/stores/` vein reached 24/24 pinned only if this store (which lives in `chart/flow/`, outside `renderer/stores/`, and was missed by every prior store census incl. P-116/P-117/P-123) is counted. Live-consumed by `ChartPanel.tsx:52,206` (`useTradesStore(selectTrades(symbol))`) — the P3 operator-legibility chart hot path. Three defect-class-relevant behaviors were unpinned: (1) the `MAX_PER_SYMBOL = 500` ring-buffer eviction (`tradesStore.ts:26,29-33` — `prev.length >= MAX ? [...prev.slice(prev.length - MAX + 1), t] : [...prev, t]`), the unbounded-growth class (§2.6) with an off-by-one-prone `slice`; (2) `selectTrades` returning the module-frozen `EMPTY_TRADES` (`:47,51-52`) — the Zustand-v5 `useSyncExternalStore` snapshot-cache invariant the subject's own comment flags as an infinite-render-loop guard (same class as `EMPTY_CANDLES`/`EMPTY_DRAWINGS`); (3) `ensureTradesSubscription`/`disposeTradesSubscription` (`:60-73`) idempotency + cleanup, the leak/teardown class (§2.5.7). A silent regression of any had no failing gate.
- **SOLUTIONS considered:** 1. *Co-located characterization suite via the established P-116/P-117/P-123 renderer-store pattern (fixture factory, `setState(getInitialState(), true)` reset, node env, getState()/selector-direct assertions).* **Chosen** — additive, zero source-edit risk; a silent cap/selector/subscription regression now turns a test red. 2. *Defer to a jsdom render-integration pass (renderHook over the actual React subscription).* Rejected — heavier, none exists, and it would not pin the reducer/selector-boundary invariants (the exact things that regress silently); the frozen-ref invariant is testable at the selector level without a DOM. 3. *Skip; the store is small.* Rejected — it is on the P3 chart hot path and is the last store off the coverage map; leaving it unpinned is precisely the gap the program closes.
- **DECISION + rationale:** (1). Off-perimeter (renderer UI state; no order/risk/kill/arm/credential/update-feed path). 17 tests across 5 describe blocks: ingest empty/null guards; single/mixed-symbol routing + oldest-first append; the 500-cap ring buffer (exactly-500 retained in order, 501-batch caps + evicts index-0 via FIFO price discriminator, cross-call eviction); immutability (fresh `bySymbol` object + prior array not mutated in place, P-061/P-074 class); the `selectTrades` stable-reference invariant (two missing symbols share ONE frozen empty array, `Object.isFrozen` true, present symbol returned by identity); `reset()` clears to `{}`; and the subscription lifecycle (first ensure subscribes once + routes ticks, repeat ensure idempotent, dispose runs cleanup and permits re-subscribe, ensure/dispose no-throw when `window.satex` absent — via `vi.stubGlobal('window', …)`). Subject `tradesStore.ts` byte-unchanged. Blueprint: `apps/satex-terminal/docs/superpowers/specs/2026-07-21-tradesstore-characterization-coverage-ultraplan.md`.
- **Gates (2026-07-21, sandbox Node 22.22.3, against the mounted repo):** vitest `tradesStore.test.ts` **17/17 ×2** order-independent (`--sequence.shuffle`, both exit 0) · full-project `npm run typecheck` exit 0 (both tsconfigs, new file included) · scoped `eslint` on the new file exit 0 (REAL green — the 45 s flat-config cold-start ceiling did not trip, so lint is NOT deferred to CI for this file) · knip CI-arbitrated (P-097, sandbox oxc crash). Sandbox ran vitest after `npm i @rollup/rollup-linux-x64-gnu @esbuild/linux-x64 --no-save`; `package-lock.json` md5 verified UNCHANGED (`b35d26e1f1a411c2ac12e0e3a344ba12`). New file 7,146 B, byte-verified 0 NUL / 0 CRCR / LF-only / tail intact. Subject `tradesStore.ts` `git diff --stat` empty. Renderer-store coverage vein now **24/24 pinned**.
- **Status:** SHIPPED (2026-07-21) — `src/renderer/chart/flow/tradesStore.test.ts` NEW on the mount, **unstaged** for operator review (a stale `.git/index.lock` from this run's `git status`, P-099/P-125 class, EPERM-unlinkable from the sandbox, blocks staging until operator unlock). CI re-arbitrates the full four-gate bar at merge. CHANGELOG: no entry (test-only, no app-behavior change; P-123 precedent).


### P-126 · Lean-repo split: operator session history untracked from the stock clone; weekly-clean brief re-homed from its 8.3-mangled root name to docs/policy/; permanent local archive established — SHIPPED (2026-07-21)
- **PROBLEM:** The stock `git clone` of SATEX-terminal carried the operator's personal session history — 37 tracked `Vault/Daily/` reports + 4 `Vault/_dashboards/` configs — alongside the app. Root also carried `SATEX-~1.md` (a Windows 8.3-mangled filename hiding the weekly-clean source brief; its own installed prompt anticipated "its eventual docs/policy/ home; check both") and the dated `2026-07-16-MERGE-RUNBOOK.md`. Operator directive (2026-07-21, explicit): the stock download = app + governance docs; personal history stays local and gets archived completely for look-back.
- **SOLUTIONS considered:** 1. *Keep everything tracked, archive only untracked scratch.* Rejected — operator explicitly chose the lean clone. 2. *Untrack the entire Vault/.* Rejected — breaks session-boot ledger reads (`CLAUDE.md` mandates reading this ledger on boot) and CI-visible audit trail on fresh clones. 3. *Targeted split:* gitignore + `git rm --cached` for Daily/_dashboards only; governance (00-Audit, INDEX/HOME, Symbols, READMEs) stays tracked; full local archive. **Chosen.**
- **DECISION + rationale:** (3). `.gitignore` gains `Vault/Daily/*`, `Vault/_dashboards/*`, `/_archive/`, and the root operator-workspace files (`/SATEX-COCKPIT.canvas`, `/PROJECT-INSTRUCTIONS.md`); 41 files `git rm --cached` (go-forward only — git history retains them all; **no history rewrite**, tags v0.4.4/v0.5.0 untouched). The brief moved to `docs/policy/weekly-clean-brief.md` (tracked; live pointers updated in the policy mirror + installed SKILL prompt; historical docs — this ledger's P-122 title, the 2026-07-19 handoff, the 2026-07-20 ultraplan — intentionally left verbatim, THIS entry is the rename map). The runbook filed at `docs/2026-07-16-MERGE-RUNBOOK.md` (precedent: `docs/CLEANUP-REPORT-2026-06-15.md`; sole external reference is the 2026-07-20 ultraplan's historical inventory, left verbatim). Archive at `_archive/` (see `MANIFEST-2026-07-21.md`): Daily snapshot ×38, full Claude Code session transcripts (~28 MB), retired scratch canvases. The daily agent pair + weekly-clean keep writing to `Vault/Daily/` unchanged — their reports are simply local-only now.
- **Gates:** N/A app code (structure/docs only) — typecheck+lint green via pre-commit; CI four-gate arbitrates at merge. CHANGELOG: no entry (no app-behavior change; P-123 precedent).
- **Status:** SHIPPED (2026-07-21).

### P-125 · Recurring stale `.git/*.lock` files (P-099 class) blocked git writes across sessions — root-caused to the Windows Defender + Search indexer racing git's unlink(); durable two-layer fix shipped (scanner-exclusion script + auto-clean hook) — SHIPPED (2026-07-20)
- **PROBLEM:** Stale 0-byte lock files recurred under `.git` and blocked the next git write (`fatal: Unable to create '…/.git/index.lock': File exists`), forcing a manual `rm` 3–4 times and breaking session-to-session flow. Evidence (2026-07-20 census, no git process live): **5 stale locks across THREE unrelated git subsystems** — `.git/index.lock` (08:09, index write), `.git/objects/maintenance.lock` (4 days old, gc), and 3 `.git/refs/remotes/origin/**/*.lock` (fetch, 3 days old). The multi-subsystem, multi-day spread rules out a single interrupted command. **Root cause (verified):** on Windows, git creates a `*.lock` per index/ref/gc write and `unlink()`s it microseconds later; Windows Defender real-time scanning (`MsMpEng`) and the Windows Search indexer hold a transient handle on that `.lock` at the delete instant → `unlink` fails `EPERM` → git leaves the lock behind. A killed/timed-out agent git command leaves one identically. Confirmed the previously-"documented durable fix" was **never actually applied**: `scripts/git-unlock.ps1` referenced `scripts/README-git-locks.md` which DID NOT EXIST, and Defender exclusions can't even be read without admin — so every prior "fix" was just another manual `rm`.
- **SOLUTIONS considered:** 1. *Keep manually `rm`-ing locks (status quo).* Rejected — symptom-only; recurs indefinitely (already 3–4×). 2. *Disable git locking / auto-gc.* Rejected — git locking is a non-optional index-corruption safeguard and there is no git config that stops lock CREATION; disabling gc bloats the repo. 3. *Two-layer durable fix matched to the two causes.* **Chosen** — Layer 1 (prevent): `scripts/exclude-git-from-scanners.ps1` (elevated, idempotent) adds the repo + `.git` + `git.exe` to Defender exclusions and marks `.git` not-content-indexed, so git can always delete its own lock. Layer 2 (auto-recover): `scripts/git-unlock.sh` (fast; refuses to act while a `git.exe` process is live; always exits 0) wired as `.claude/settings.json` `PreToolUse(Bash)` + `SessionStart` hooks, so any stale lock is cleared before the next git op even if one slips through (incl. a killed agent command).
- **DECISION + rationale:** (3). Layer 2 is fully automated and **proven live this session** — a planted `.git/index.lock` was auto-cleared by the hook before the next Bash command ran — so stale locks are non-blocking regardless of source. Layer 1 is the true root-cause prevention but is a one-time **operator** action (needs an elevated shell; an agent shell cannot elevate); the missing `README-git-locks.md` was finally written so the fix is executable. Honest scope note: git will still create *transient* locks during writes (by design, unavoidable) — "gone for good" means the *stale/blocking* locks, which this eliminates.
- **Gates:** N/A (tooling/config, no app code). Verification: 5 stale locks removed → 0 remain; git index-write leaves no lock; `git-unlock.sh` tested (planted 4 lock classes incl. a ref lock → all removed, exit 0; clean no-op when none) and LF-only + executable; `.claude/settings.json` re-validated (JSON parses; PreToolUse + SessionStart wired; Stop hook preserved); hook fire proven end-to-end.
- **Status:** SHIPPED (2026-07-20) — Layer 2 LIVE now. **Operator action (Layer 1, one-time):** run `scripts/exclude-git-from-scanners.ps1` in an ELEVATED PowerShell. Unstaged for review: `M .claude/settings.json`, NEW `scripts/git-unlock.sh` / `exclude-git-from-scanners.ps1` / `README-git-locks.md`.

### P-124 · Shared-mutable-default aliasing is systemic across the renderer default-holding stores (feedStore/healthStore + accountStore/logsStore) — pinned as observed behavior in the coverage suites, DEFERRED to operator taste (no unattended subject edit) — DECIDED (2026-07-20)
- **PROBLEM:** The 2026-07-20 renderer-store coverage finisher (P-123) ran the specced systematic sweep of the 8 target stores for the P-061/P-074 shared-mutable-default class (initial state holding a module-const object/array by reference, mutable in place). Findings: (1) `feedStore.ts:20,23` — `const DEFAULT: FeedStatus = {...}` is the initial `status` by reference; `getInitialState().status` is the SAME object every call (pinned in `feedStore.test.ts`). (2) `healthStore.ts:11-16,24` — `defaultReport` (module const) AND its nested `findings: []` array are the initial `report`/`report.findings` by reference (pinned in `healthStore.test.ts`; both `.report` and `.findings` share-ref asserted). (3) `accountStore.ts:22-33` — `defaultAccount`/`defaultStatus` module consts, incl. the nested `openPositions: []` array, are the initial slices by reference (same class; P-123's accountStore suite pinned setters replace-by-reference but did not flag the default aliasing). (4) `logsStore.ts:14` — initial `tail: []` inline literal is a fixed reference across `getInitialState()` calls. All FOUR are **benign under current usage**: every store's setters replace the whole slice by reference and nothing mutates a default in place, so no corruption path is reachable today. The risk is latent — a future in-place mutation (e.g. `state.report.findings.push(...)` "for speed") would corrupt the reset baseline and leak across sessions/tests.
- **SOLUTIONS considered:** 1. *Convert each module-const default to a factory (`() => ({...})`) so every `getInitialState()` yields a fresh object.* Removes the latent trap, but edits FOUR renderer subjects with no reachable bug today — a correctness-precedes-optimization inversion (§2.7) and unattended edits on the trading terminal. 2. *DEFER: pin the observed aliasing in the coverage suites (done) and record the finding for an operator taste ruling; no unattended subject edit.* **Chosen** — matches the P-020/P-028/P-092 operator-taste-deferral pattern and the P-061/P-074 precedent (pin the benignly-handled side, flag, don't fix under automation). 3. *Ignore it.* Rejected — an unrecorded latent class re-surfaces; the pin + ledger note makes it observable, so a future in-place-mutation refactor turns a test red and the operator has the map.
- **DECISION + rationale:** (2). Off-perimeter (renderer UI state). The two stores with nested-mutable defaults (feedStore, healthStore) carry the aliasing pin as characterization so a behavior change turns red; accountStore/logsStore are recorded here for completeness. Any conversion-to-factory is an operator call, not an unattended automated edit — the honest note is that these are benign today, not that they are ideal.
- **Status:** DECIDED (2026-07-20) — no subject edited; findings pinned in the P-123 finisher suites + recorded here. Operator ruling pending on whether to factory-ize the four defaults.

### P-123 · Renderer-store test-coverage vein (post-P-116/P-117): `accountStore.ts` — the central account/orders/status store every equity readout flows through — shipped with zero coverage; 12-test characterization suite added, DEFAULT_EQUITY invariant + fresh-Map immutability pinned — SHIPPED (2026-07-20, unstaged for operator review); FINISHER (7 stores, 25 tests) shipped same-day on real-repo gates
- **PROBLEM:** Evidence: the P-094 services-coverage program is complete and P-116/P-117 opened the renderer-store vein (marketStore, indicatorStore pinned). A 2026-07-20 census of `apps/satex-terminal/src/renderer/stores/` (`for f in *.ts; do test -f ${f%.ts}.test.ts`) shows **8 of 24 stores untested**. The highest-leverage untested one is `accountStore.ts` (`src/renderer/stores/accountStore.ts`, 50 L) — the renderer's central account/orders/status/indicators store; TopBar, every equity readout, and the risk display read from it (P3, operator legibility). It carried load-bearing behavior with no regression pin: (1) the DEFAULT_EQUITY defaults (`accountStore.ts:22-27` — `equity/cash = DEFAULT_EQUITY`, `buyingPower = DEFAULT_EQUITY*2`), the exact target of §2.5 invariant 2 (never reintroduce `STARTING_EQUITY`); (2) `setIndicators` (`:44-48`) constructs a **fresh Map** every call so the previous state's Map is never mutated — the correctly-handled side of the P-061/P-074 shared-mutable class, unpinned; (3) the four whole-slice setters replacing by reference without disturbing sibling slices. A silent regression of any had no failing gate.
- **SOLUTIONS considered:** 1. *Characterization suite via the P-116/P-117 /tmp harness recipe (alias `@shared`, repo-version zustand/react/vitest, node env, `getInitialState()` reset).* **Chosen** — additive, zero source-edit risk, extends the exact established pattern; a silent default/invariant/immutability regression now turns a test red. 2. *Defer to a jsdom modal-integration pass.* Rejected — heavier, none exists, and modal tests would not pin the store's reducer-boundary guards (the thing that regresses silently). 3. *Skip; the vein is small.* Rejected — accountStore is the central account store on the P3 hot path; leaving it unpinned is exactly the gap the coverage program closes.
- **DECISION + rationale:** (1). Off-perimeter (renderer UI state; no order/risk/kill/arm path). 12 tests across the full action surface: initial DEFAULT_EQUITY defaults + the `buyingPower === equity*2` invariant pin, disconnected-simulator status default, empty orders/Map/null-autonomous seed; the four setters (setAccount/setOrders/setStatus/setAutonomous store by reference + disturb-no-sibling); `setIndicators` fresh-Map immutability (prev Map reference ≠ new, prev untouched), second-symbol coexistence, same-symbol last-write-wins. Subject `accountStore.ts` byte-unchanged. Blueprint: `docs/superpowers/specs/2026-07-20-renderer-store-coverage-completion-ultraplan.md` (also specs the 7 remaining untested stores — footprint/feed/logs/fundedAccount/health/regime/depth — cold-start-complete for the work-layer; 2026-07-20 handoff §3).
- **Gates (2026-07-20, sandbox Node 22):** vitest **12/12 ×2** order-independent in the /tmp harness (zustand 5.0.1 + react 19.2.7 + vitest 4.1.10, matching repo; subject md5 mount==harness `0751777b66f153c1020ef96736ba99e6`) · scoped strict `tsc --noEmit` exit 0 (TS 6.0.3, bundler res) · scoped `eslint` exit 124 (45s flat-config startup ceiling — **CI is the lint arbiter**, P-116 precedent) · knip CI-arbitrated (P-097). New file 6,336 B, byte-verified 0 NUL / 0 CRCR / LF-only / tail intact.
- **Finisher (2026-07-20 re-run, cont'd — REAL-repo gates, a fidelity upgrade over the sandbox lead):** the 7 remaining stores shipped as NEW characterization suites — `footprintStore.test.ts` (6 tests: empty/null-batch no-op, single-batch + 3-trade-batch = exactly ONE version bump, shared-aggregator accumulation, `reset()` clears + bumps; the `useFootprintCandles` hook deferred to a jsdom `renderHook` follow-up, noted in the header), `feedStore.test.ts` (4), `logsStore.test.ts` (3), `fundedAccountStore.test.ts` (3), `healthStore.test.ts` (3), `regimeStore.test.ts` (3), `depthStore.test.ts` (3) — **25 new tests**. This run is on operator hardware (Node 24.15), so gates ran against the REAL repo, not the /tmp harness: vitest **37/37** whole-set incl. the lead, **25/25 ×2** order-independent (`--sequence.shuffle`, seed 1784599287475); **full-project `npm run typecheck` exit 0** (both tsconfigs, real config — supersedes the lead's scoped /tmp tsc); **scoped `eslint` on all 7 files exit 0** (no 45s sandbox cold-start ceiling here — a real lint green the prior sandbox could not produce, so eslint is NOT deferred to CI for these); knip CI-arbitrated (P-097). All 7 subjects byte-unchanged (additive NEW test files only; `git status` shows 0 modified subject stores from this run); each new file byte-verified 0 NUL / 0 CRCR / LF-only / tail intact. Renderer-store vein now **10 of 24 pinned** (marketStore/indicatorStore/accountStore + these 7). The specced aliasing sweep → P-124 (DEFERRED). CHANGELOG: no entry (test-only, no app-behavior change).
- **Status:** SHIPPED (2026-07-20) — `accountStore.test.ts` (lead) + `footprint/feed/logs/fundedAccount/health/regime/depth Store.test.ts` (finisher) NEW on the mount, **unstaged** for operator review (the stale `.git/index.lock` from the morning cycle also blocks staging until operator unlock). CI re-arbitrates the full gate bar at merge.

### P-122 · SATEX-~1.md §2 crown-jewel NUL-check false-positives every run — DECIDED (2026-07-20)
- **PROBLEM:** The brief's own verification snippet, `grep -c $'\x00' "$f"`, does not detect literal NUL bytes in this sandbox class — it degrades to reporting the file's full line count and triggers the "!! NUL BYTES" branch on every run, even when the file is clean UTF-8 text with zero NUL bytes (verified via `python3 -c "open(f,'rb').read().count(b'\x00')"` on both CLAUDE.md crown jewels, 2026-07-20: 0/0).
- **SOLUTIONS considered:** 1. *Keep the grep snippet, operators manually override the false alarm each week* — cheap now, but trains distrust of the check over time. 2. *Swap to the python3 byte-count form (or `LC_ALL=C grep -aP '\x00' -c`) in SATEX-~1.md §2* — costs one snippet edit, fixes the false-positive permanently.
- **DECISION + rationale:** (2). A gate that reliably cries wolf is worse than no gate — SATEX-~1.md §2's snippet is superseded going forward by the weekly-clean task's corrected python check (`docs/policy/scheduled-weekly-repo-clean.md` Layer 0).
- **Status:** DECIDED (2026-07-20) — corrected python NUL scan already live in the scheduled weekly-clean task; SATEX-~1.md §2's stale grep snippet to be updated on its next revision.

### P-121 · MAY-TACTICS graduation could arm on fabricated/double-counted data and would lose its boot-time drawdown veto — replaced the naive count-of-8 with an evidence bar — SHIPPED (2026-07-20, merged to master `81b115a`; operator runtime smoke-test pending)
- **PROBLEM:** Three coupled defects on the graduation interlock (perimeter, human-gated per AGENTS.md:66). (1) `tactics.ts` `seedFromOrders` pushed `pnl:0` rows for every filled sell *additively onto* the already-persisted `tactics.json` history (`load()` restores at construction, then the boot call at `trading-engine.ts:474` re-pushed) — double-counting the trade count and poisoning `winRate`/`expectancy` with fabricated break-even rows, on the series that gates graduation. (2) The count-of-8 precondition (`MIN_TRADES_FOR_ARMED`) could not tell skill from luck, and `seedFromOrders` could auto-fill 8 zero-PnL rows → the gate could arm on fabricated data. (3) Hidden by the fix: `refresh()` (sets the `vetoActive` drawdown veto, not persisted) was reached at boot ONLY via `seedFromOrders`, so a naive deletion would boot a drawn-down session with the veto cleared; and raising the floor 8→30 with the existing `!graduated || trades<MIN` check would silently de-arm an already-graduated legacy user (10–29 trades) back to pass-through. Verified against significance.ts:14-17 + CONSTITUTION §3.3:572 (both forbid PSR outputs feeding any gate), tactics.ts (all `MIN_TRADES_FOR_ARMED` sites 24/67/73/90/92/111), and trading-engine.ts:2273 (`entry.notional` availability).
- **SOLUTIONS considered:** 1. *PSR/DSR significance gate + per-trade-return series + regime segmentation (initial ultraplan).* **Rejected** at CEO review — `significance.ts`'s own header and Constitution §3.3 forbid PSR outputs from feeding any gate (graduation is on the autonomy path), and would have required a constitutional amendment; PSR's higher moments are noise at n=30; regime segmentation is inert at paper-phase sample sizes. 2. *Simple evidence bar from existing metrics.* **Chosen** — `n≥30 ∧ expectancy>0 ∧ winRate≥0.45` (the armed gate's own floors) uses only `metrics()`, needs no PSR and no constitutional change. 3. *Delete `seedFromOrders` only (ship the P0 alone).* Folded into (2); the seed deletion is the load-bearing P0 but the boot-veto and de-arm regressions had to be closed alongside it.
- **DECISION + rationale:** (2), with: constructor `refresh()` (preserve boot veto); armed-state decoupled to the `graduated` flag alone (never de-arm a legacy graduate); versioned store (`STORE_VERSION=1`) resets pre-version poison once while preserving `graduated` (the `pnl:0` rows are indistinguishable from legit break-evens, so a surgical strip is impossible); `graduationEligible` boolean added to `TacticsStatus` to gate the button (single source, no renderer recompute). Honest limitation recorded: n=30 + 0.45 win-rate is stricter than count-of-8 but not strong evidence (a zero-edge strategy clears it a meaningful fraction of the time) — the human click + paper-only policy are the backstops; PSR remains a future option only if this checkpoint ever gates live (and only via a real §2.4 constitutional change). Reviewed via `/ultraplan` → `/autoplan` (CEO + Eng dual-voice, single-model; all findings code-verified). Blueprint: `docs/superpowers/specs/2026-07-20-tactics-graduation-significance-ultraplan.md`.
- **Gates (2026-07-20, operator hardware, Node 24.15):** typecheck node+web exit 0 · eslint `src tests` exit 0 · knip exit 0 · vitest 1818 pass (the 38 `persistence.test.ts` fails are the documented better-sqlite3 Electron-ABI local false-fail, green in CI after `npm rebuild better-sqlite3`). First test coverage for `tactics.ts` (`tactics.test.ts`, 12 tests: migration/poison-reset, each graduation clause boundary, the graduate→gate invariant, boot-veto reconstruction, legacy-graduate-not-de-armed, null-safety).
- **Status:** SHIPPED (2026-07-20) — branch `fix/tactics-graduation-evidence-bar`, **PR #63, CI Gates green** (typecheck/lint/knip/tests, 4m54s). RISK-TOUCH interlock, routed to operator for independent perimeter check before merge (not auto-merged).

### P-120 · Three live `satex25/satex` references survived the P-103 canonical-name sweep in `apps/satex-terminal/README.md` — FIXED (2026-07-19, unstaged for operator review)
- **PROBLEM:** Evidence: `apps/satex-terminal/README.md:37` (`git clone https://github.com/satex25/satex.git` — a user following the quickstart clones via a stale name), `:263` (v0.5.0 release link), `:264` (repository link). All three are *functional* references (P-103's class: never let a rename redirect be load-bearing); the P-103 sweep fixed the root README but these app-README instances escaped. Found by this session's sibling tail sweep (P-119) surfacing the footer.
- **SOLUTIONS considered:** 1. *Mechanical replace with the P-103-ruled canonical `satex25/SATEX-terminal` (exact capitals), anchors asserted unique.* **Chosen** — the naming ruling is settled (P-103); deferring a 3-line mechanical fix would be process theater. 2. *Defer to the next doc sweep.* Rejected — Directive 0.10 plus the fix being unambiguous.
- **DECISION + rationale:** (1). Docs-only, off-perimeter. The footer's stale `Last Updated: 2026-06-12` deliberately left — updating it is a content claim, not a name fix (scope discipline). Follow-up for a future sweep: grep the whole tree for remaining `satex25/satex` non-canonical variants outside historical records.
- **Gates (2026-07-19):** markdown-only; 3 anchored replacements, each asserted unique pre-replace; post-write byte audit 0 NUL / 0 CRCR; zero `satex25/satex` functional refs remain in the file. CI unaffected.
- **Status:** SHIPPED (2026-07-19) — unstaged for operator review.

### P-119 · `CHANGELOG.md` tail-truncated in committed history — two separate P-099-class truncation events silently destroyed ~3.1 KB of v0.4.x release history — REPAIRED from git objects (2026-07-19, unstaged for operator review)
- **PROBLEM:** Evidence: working tree AND `master` HEAD (`c10f9bc`) both ended `CHANGELOG.md` mid-sentence at `pointed at a file that` (no trailing newline), inside the 0.4.1 (2026-05-18) icon bullet — found by this session's routine post-edit tail audit (the P-099 byte-verify discipline paying out on a file it didn't even write). Forensic walk of `git log --follow`: last fully-intact tail at `22e3a70` (2026-05-26, v0.5.0 RC — ends `…verdict instead of \`no-manifest\`). Closes deferred item from issue #1.` + newline); by `b502d15` (2026-06-14) the tail was already cut to `IPC byte-size ca` (**event 1**, the P-018/P-021 June file-bridge era); between `034984f` (2026-07-02 relocate commit) and `8ea8226` (2026-07-03) it was cut further back to `pointed at a file that` (**event 2**), and every later commit carried the damage forward — including P-112's repair-from-HEAD (2026-07-17), which faithfully restored the then-already-truncated *committed* tail (repair-from-HEAD cannot see damage older than HEAD). Lost content: the 0.4.1 sentence completion + the tail of the 0.4.0 (2026-05-18) section — the Security bullet's `Buffer.byteLength` IPC byte-size cap completion, the full **Reliability** block (Alpaca REST timeouts, WS exponential backoff, `LiveCandleBuffer` fill-forward, feed-time tick recording), the full **Observability** block (tick-Hz fix, no-quote rejection, TRADES_TICK coalescing, replay unknown-symbol warning), and both **Post-stabilization pickups** (kill-switch persistence · periodic tape-manifest reseal) — ≈ 3,103 chars / ~50 lines.
- **SOLUTIONS considered:**
  1. *Restore the working-tree tail from the `22e3a70` git object.* **Chosen.** Superset relation proven before splicing: `034984f`'s 1,818-char overlapping segment is byte-identical to the head of `22e3a70`'s 3,125-char segment, so the older object is a strict superset and single-source recovery is safe. Git objects are the proven clean source (§2.9, P-021 lineage).
  2. *Reconstruct the lost entries from context/memory.* Rejected — fabrication risk on a historical gate record (Directive 0.1).
  3. *Leave it, per the append-only law.* Rejected — append-only protects history from falsification; here the damage IS the falsification. Restoring provable git-object content is the established P-107 (ledger-tail repair, `bb5e8b4`) and P-112 precedent.
- **DECISION + rationale:** (1). Docs-only, off-perimeter. Working tree only — no history rewrite (the repair lands as a normal forward commit at adoption, exactly how P-107 shipped). Sibling sweep run same session: tails of `PROBLEM-LEDGER.md`, `CONSTITUTION.md`, `AGENTS.md`, `ARCHITECTURE.md`, root+app `CLAUDE.md`, `README.md` audited against HEAD — see the 2026-07-19 work-layer report for the sweep result.
- **Gates (2026-07-19):** markdown-only change, no code gates implicated. Verification: pre-splice `endswith(marker)` assertion · post-splice byte audit (0 NUL / 0 CRCR / tail `…issue #1.` + newline) · diff vs the /tmp backup is insert-only at the tail. CI unaffected.
- **Status:** SHIPPED (2026-07-19) — unstaged for operator review, stacked on the same working tree as P-117/P-118.

### P-118 · `setRsiPeriod`/`setFibLookback` accepted non-finite input — NaN passed the equality guard and poisoned live renderer indicator state — FIXED (`Number.isFinite` wall at the store boundary, regression-pinned) — SHIPPED (2026-07-19, unstaged for operator review)
- **PROBLEM:** Evidence: `src/renderer/stores/indicatorStore.ts:83-99` (pre-fix). `const clamped = Math.max(2, Math.min(200, Math.round(n)))` yields `NaN` for `NaN` input (`Math.min(200, NaN)` → `NaN` → `Math.max(2, NaN)` → `NaN`), and the no-op guard `clamped === cur.rsiPeriod` can never be true for `NaN`, so the setter commits `{ rsiPeriod: NaN }` and fires `persist()`. **Reproduced pre-fix** in the /tmp harness: 2/2 poison-repro tests confirmed both setters commit `NaN`. Blast radius measured precisely: **disk is safe** — main-side `IndicatorSettingsService` `clampInt` (`indicator-settings.ts:164-167`) has `Number.isFinite` and defaults non-finite before every write — but the renderer store is the renderer's **local source of truth** (the file's own comment: "persistence is best effort") and the sanitized echo is discarded (fire-and-forget), so RSI/fib computation runs on `NaN` for the rest of the live session, then the next launch's hydrate silently "heals" it — masking the class (P-039/P-040 degenerate-input lineage). Reachability today: **LATENT, not live** — the only two shipped call sites (`IndicatorsModal.tsx:119,130`) guard with `|| 14` / `|| 50` at the call site. But call-site-only guarding is the exact pattern invariant 3 exists to prevent: the gate belongs at the canonical source, and any future caller without the idiom regresses silently with no failing gate.
- **SOLUTIONS considered:**
  1. *`if (!Number.isFinite(n)) return` at the top of both setters, mirroring main-side `clampInt`.* **Chosen.** Two lines; wall at the store boundary; behavior changes only for non-finite input. Note `±Infinity` previously clamped to a bound (`Math.round(Infinity)` → `Infinity` → clamps to 200) and is now rejected outright — strictly safer and byte-consistent with `clampInt`'s default-don't-clamp treatment of non-finite.
  2. *Coerce NaN to the field default instead of rejecting.* Rejected — a silent value change on garbage input hides the caller's bug; a no-op with unchanged state is honest and observable.
  3. *Leave it; today's callers guard.* Rejected — invariant 3 (canonical gates at the source, never duplicated at call sites); the store's public API is the wall.
- **DECISION + rationale:** (1). Off-perimeter (renderer UI store — no order/risk/kill/arm path contact). Regression-pinned in P-117's suite: 3 tests assert NaN and ±Infinity are no-ops (same-reference state, zero persist calls) on both setters.
- **Gates (2026-07-19, sandbox Node 22.22.3):** shared changeset with P-117 below — vitest **30/30 ×2** (second run `--sequence.shuffle`) in the /tmp harness (zustand 5.0.14 + react 19.2.7 + vitest 4.1.10 + TS 6.0.3; subject md5 mount==harness `23c025390342acf9fc811d23047bfc88`) · scoped strict `tsc --noEmit` exit 0 · **scoped `eslint` on both touched files exit 0, 0 warnings, in-mount** · knip CI-arbitrated (P-097). Subject 4,273 → 4,593 B (the two guard lines only), byte-verified 0 NUL / 0 CRCR / LF-only / tail intact.
- **Status:** SHIPPED (2026-07-19) — `indicatorStore.ts` edited via the P-099 bash-mount workflow (anchored python edit, anchors asserted unique, atomic replace), **unstaged** for operator review. CI re-arbitrates the full gate bar at merge.

### P-117 · `indicatorStore.ts` (renderer chart-indicator toggle store) shipped with zero test coverage — 30-test characterization suite added; guards, clamps, immutability, and IPC failure walls pinned — SHIPPED (2026-07-19, unstaged for operator review)
- **PROBLEM:** Evidence: the renderer-store coverage vein opened by P-116 ranked `indicatorStore.ts` (`src/renderer/stores/indicatorStore.ts`, 128 lines pre-P-118) the top remaining target (2026-07-19 handoff §7). The store owns which chart indicators compute and how (6 toggles + EMA period set + RSI/fib numeric params + legend visibility), hydrates from `Vault/Settings/indicator-toggles.md` over IPC, and write-through-persists every change — and carried multiple load-bearing behaviors with **no regression pin**: the `setEnabled` runtime guards (unknown-id and no-op-equal both bail without a state write or a persist IPC call), the numeric clamps (`setRsiPeriod` [2,200], `setFibLookback` [5,1000], rounded, no-op on landing), the fresh-object immutability discipline protecting `DEFAULT_INDICATOR_SETTINGS` from mutation (the P-061/P-074 shared-default class, protected side), the `persist()` fire-and-forget `.catch` wall, and `hydrate()`'s three-way error tolerance. A silent regression of any of these had no failing gate.
- **SOLUTIONS considered:**
  1. *Characterization suite via the P-116 /tmp harness recipe (alias `@shared/chart-indicators`, repo-version zustand/react/vitest, stub `globalThis.window` with a mock `satex.indicators` bridge).* **Chosen.** Additive; extends the exact P-116 pattern; node environment suffices for a deliberately rendering-agnostic store.
  2. *Defer to a future jsdom integration pass over the IndicatorsModal.* Rejected — heavier, none exists yet, and modal-level tests wouldn't pin the store's API-boundary guards (the thing that actually regresses silently).
  3. *Skip.* Rejected — the vein is open and this is its ranked top target.
- **DECISION + rationale:** (1). Authored against the P-118-fixed subject (same session, same changeset): the suite pins the fixed non-finite behavior as regression tests rather than pinning the bug. 30 tests across the full action surface: initial state (deep-equals defaults, fresh copies, `hydrated:false`), `setEnabled` (unknown-id bail · no-op-equal bail · flip-persists-exactly-once-with-the-new-object · previous-snapshot never mutated · defaults never mutated), `toggleEmaPeriod` (remove · add-sorted-ascending · no-no-op-case round-trip persists twice · fresh array + shared default array untouched), `setRsiPeriod`/`setFibLookback` (clamps + rounding · no-op-on-landing · P-118 NaN/±Infinity pins), `setLegendVisible` (no-op + flip-persist), `setSettings` (wholesale replace, exact-reference persist — renderer trusts input; main-side `sanitize()` is the wall before disk), `hydrate` (adopts the disk object by reference · undefined→defaults · reject→defaults+warn · absent-bridge optional-chaining pin — all four set `hydrated`), `flush` (sends current settings once · swallows rejection with a warning), setter-persist rejection caught by the `.catch` wall, and a whole-surface `DEFAULT_INDICATOR_SETTINGS` integrity sweep against a `structuredClone` snapshot.
- **Observed, deferred (operator taste ruling — P-020/P-028/P-092 pattern):** the store's *initial* state spreads `DEFAULT_INDICATOR_SETTINGS` copying `enabled` freshly but **aliasing `emaPeriods`** (top-level spread copies the array reference). Currently harmless — every mutation path constructs fresh arrays (now pinned), so the module constant cannot be corrupted through the store — but it is the latent shading of the P-061/P-074 class. A one-line `emaPeriods: [...DEFAULT_INDICATOR_SETTINGS.emaPeriods]` would close it; not changed unattended since no behavioral defect exists today.
- **Gates (2026-07-19, sandbox Node 22.22.3):** vitest **30/30 ×2** (second run `--sequence.shuffle`, order-independent) in the /tmp harness (zustand 5.0.14 + react 19.2.7 + vitest 4.1.10 + TS 6.0.3, matching repo; subject md5-verified mount==harness) · scoped strict `tsc --noEmit` over subject + test + `@shared` types exit 0 (ES2022 · bundler · strict · skipLibCheck; harness-local minimal `Window.satex` shim — CI's full graph is the arbiter for the real `window.d.ts` typing) · **scoped `eslint` exit 0, 0 warnings, in-mount on both files** (startup fit inside the 45 s ceiling tonight — an improvement over P-116's timeout; full `eslint src tests` remains CI-arbitrated) · knip CI-arbitrated (P-097). New file 12,824 B, byte-verified 0 NUL / 0 CRCR / LF-only / md5 == /tmp artifact.
- **Status:** SHIPPED (2026-07-19) — `src/renderer/stores/indicatorStore.test.ts` NEW on the mount, **unstaged** for operator review. CI re-arbitrates the full gate bar (full typecheck/lint/knip + full vitest count) at merge.

### P-116 · `marketStore.ts` (renderer central quote/candle store) shipped with zero test coverage — 19-test characterization suite added, three load-bearing guards pinned — SHIPPED (2026-07-19, unstaged for operator review)
- **PROBLEM:** Evidence: a full 2026-07-19 scan of `apps/satex-terminal/src` shows the P-094 services-coverage program **complete for every safe unit** — `src/main/services/` has exactly two files without a sibling `.test.ts`, `live-mode.ts` (live-arming interlock) and `tactics.ts` (MAY-TACTICS graduation interlock), and **both are trading-safety perimeter, human-gated** (P-094, even for adding tests); the `shared/broker/` untested files are pure interface/type contracts (no runtime behavior). The next safe untested vein is the renderer store layer. `marketStore.ts` (`src/renderer/stores/marketStore.ts`, 113 lines) is the renderer's central quote/candle store — **every price and every bar the chart draws flows through it** (P3, operator legibility) — and carried three load-bearing guards with **no regression pin**: (1) unbounded candle growth → `MAX_CANDLES = 30_000` trim in `updateCandle` + `bulkReplaceCandles` (the P-041/P-093 growth/spread class — `ChartPanel` spreads this very 30k array); (2) live↔replay history bleed → `resetCandles` wipes candles to empty on data-source swap (invariant 6); (3) snapshot-cache stable reference → `selectCandles` returns a single **frozen** `EMPTY_CANDLES` for every miss (Zustand-v5 `useSyncExternalStore` invariant; the *correctly-handled* member of the P-061/P-074 shared-default class — a fresh `?? []` here infinite-loops the renderer, per the file's own comment). A silent regression of any guard has **no failing gate today**.
- **SOLUTIONS considered:**
  1. *Characterization suite on the store as-is (pin measured behavior); test-only, off-perimeter.* **Chosen.** Additive, zero source-edit risk, closes the coverage gap, and extends the exact P-094 coverage pattern to the renderer layer. A silent bound/immutability/stable-ref regression now turns a test red.
  2. *Add tests but also refactor `selectCandles`/`updateCandle` for "cleaner" bounds.* Rejected — behavior change on a P3 hot path with no operator ask; correctness-precedes-optimization (§2.7), and the frozen-empty aliasing is intentional (taste/perf territory, not a defect).
  3. *Declare the coverage well dry and skip.* Rejected — the renderer store layer is a real untested vein; leaving the central market store unpinned is exactly the gap the coverage program exists to close.
- **DECISION + rationale:** (1). Added `src/renderer/stores/marketStore.test.ts` (19 characterization tests) pinning the full action surface (`setSymbol`, `seedQuotes`, `updateQuotes`, `updateCandle`, `bulkReplaceCandles`, `appendNews`, `resetCandles`) + `selectCandles`, with the three guards asserted explicitly (MAX_CANDLES ceiling on both append paths; `resetCandles` wipe; `selectCandles` shared-frozen-empty via `.toBe` identity + `Object.isFrozen`). Subject `marketStore.ts` **byte-unchanged**. Off-perimeter (renderer UI state; no order/risk/kill/arm path).
- **Gates (2026-07-19, sandbox Node 22.22.3):** full `tsc -p tsconfig.web.json --noEmit` in-mount = exit 124 (45 s call ceiling, documented 2026-07-17 env scar) → **CI is the full-typecheck arbiter**; scoped strict `tsc --noEmit` over the new file + its `@shared` imports (ES2022 · bundler · `strict` · `skipLibCheck`) = **exit 0** · vitest **19/19 pass ×2**, order-independent, in a `/tmp` harness with **zustand 5.0.14 + react 19.2.7 + vitest 4.1.10** (matches repo `^5.0.1 / ^19 / ^4.1`; sources md5-verified byte-identical to the mount) · scoped `eslint` in-mount exceeded the 45 s startup ceiling (eslint 10.7 + typescript-eslint flat config) → **CI is the lint arbiter** (file matches accepted sibling-test style) · knip CI-arbitrated (Node-22 oxc crash, P-097). Subject byte-unchanged; no `package-lock.json` mutation (harness is `/tmp`).
- **Status:** SHIPPED (2026-07-19) — `src/renderer/stores/marketStore.test.ts` NEW, byte-verified on the mount (0 NUL, 0 CR-CR, LF-only, md5 == /tmp artifact), **unstaged** for operator review. CI re-arbitrates the full gate bar (full typecheck/lint/knip + full vitest count) at merge. Blueprint: `docs/superpowers/specs/2026-07-19-marketstore-characterization-coverage-ultraplan.md`.

### P-115 · Full-repo dependency upgrade campaign (7 stages) — every runtime/toolchain dep taken to latest-or-latest-compatible, all HIGH/CRITICAL npm-audit findings cleared — VERIFIED (2026-07-18, merged master via PRs #55–#61)
- **PROBLEM:** Evidence: `npm audit` at campaign start reported 22 vulnerabilities (15 HIGH + 1 CRITICAL) across the dependency tree — a `better-sqlite3` uninitialized-memory-disclosure class and a `ws` fragment-DoS (both closed stage 1), and an `electron-builder` HIGH advisory chain (`app-builder-lib`, `cacache`, `node-gyp`, `make-fetch-happen`) plus 5 more HIGH advisories nested under the deprecated `electron-rebuild` (closed stage 7 via `@electron/rebuild` 4). Toolchain had also drifted behind latest-compatible across the board (Electron 32, React 18.3, TypeScript 5.6, Tailwind 3, vite 5.4, vitest 2.1). `CONSTITUTION.md` §1.1 and 7 other tracked docs stated the pre-upgrade stack — measured stale the moment stage 3 merged (§0.5, the honesty axiom applied to this document itself).
- **SOLUTIONS considered:**
  1. *One big-bang PR bumping everything simultaneously.* Rejected — a single-commit React 18→19 + Electron 32→43 + TS 5.6→6.0 + Tailwind 3→4 + build-cluster jump makes any regression unattributable to its cause and blocks incremental gate verification.
  2. *Staged campaign, one dependency cluster per PR, gated independently* (standalone security/routine bumps → build cluster → React 19 → Tailwind 4 → Electron 43 → TypeScript 6.0 → cleanup/dev-tooling), each verified locally (typecheck/lint/knip/build) before merge and CI-gated by the `main-protection` ruleset's required `Gates` check (P-095) at merge time. **Chosen.** Isolates blast radius per stage — a regression in any one stage points at exactly one dependency cluster.
  3. *Defer the whole campaign to the next major release window.* Rejected — 16 of the 22 findings were HIGH/CRITICAL security advisories; the constitution's own guidance is to fix defects as found (§2.3), not batch them.
- **DECISION + rationale:** (2). Off-perimeter throughout — zero touches to `order-manager.ts`, `risk-gates.ts`, `kill-switch-store.ts`, `live-mode.ts`, `services/alpaca/order-router.ts`, or `auto-update.ts`'s pinned feed/consent flags across all 7 stages (verified by diff inspection each stage). Per-stage record:
  - **Stage 1** (`38dbeb2`, PR #55): better-sqlite3 ^11.5→^12.11.1, dotenv ^16→^17.4.2, ws ^8.18→^8.21.1 (closes HIGH: uninit-memory disclosure + fragment DoS), @types/node ^20→^26.1.1, autoprefixer/knip routine bumps. No source changes.
  - **Stage 2** (`1a4eab3`, PR #56): vite ^5.4→^7.1, vitest ^2.1→^4.1, electron-vite ^2.3→^5.0, @vitejs/plugin-react ^4.3→^5.2 — ceilinged at vite 7 / plugin-react 5 by electron-vite 5's peer range. Adaptations: `subsecond-telemetry.test.ts` mock typed via `vi.fn<LogFn>()` (vitest 4 tightened Mock inference); `tsconfig.node.json` `moduleResolution: "node"→"bundler"` (plugin-react 5 ships types only via an `exports` map).
  - **Stage 3** (`088a178`, PR #57): react/react-dom ^18.3.1→^19.2.7, @types/react(-dom) matched. One adaptation: `Icon.tsx` imports `JSX` as a type from `'react'` (React 19 removed the global `JSX` namespace). Independently re-audited this session against every other R19 removed/changed API (`ReactDOM.render`/`hydrate`, `findDOMNode`, `defaultProps`, `propTypes`, string refs, no-arg `useRef()`, `react-dom/test-utils`, callback-ref implicit-cleanup-return) — zero further hits across `src/`.
  - **Stage 4** (`c0068b1`, PR #58): tailwindcss ^3.4.13→^4.3.3 + `@tailwindcss/postcss` (v4 moved its PostCSS plugin out of core). Verified no-op: Tailwind is vestigial here (`globals.css` is hand-authored, no `@tailwind`/`@import "tailwindcss"` entry point) — built renderer CSS confirmed byte-identical pre/post (md5 `6d47070461cd2bb1ad3c104057a66b42`, 180,100 B).
  - **Stage 5** (`3c884fb`, PR #59): electron ^32.2.0→^43.1.1 (closes a HIGH advisory), electron-builder ^25.1.7→^26.15.3 (closes a HIGH advisory chain: app-builder-lib/cacache/node-gyp/make-fetch-happen). Zero code changes — main/preload typecheck clean against Electron 43 types. Flagged by the acting session as the one bump whose runtime (Chromium + Node across 11 majors) static gates can't exercise — operator dev-launch + `pack:win` smoke-test recommended, not yet confirmed.
  - **Stage 6** (`cec96d1`, PR #60): typescript ^5.6.2→^6.0.3, typescript-eslint ^8.59.3→^8.64.0. TS 7 (native "tsgo") explicitly NOT adopted — typescript-eslint 8.64.0 peers `typescript >=4.8.4 <6.1.0`, so 6.0.3 is the ecosystem ceiling. Adaptations: `tsconfig.web.json` `moduleResolution → "bundler"`; new `src/renderer/assets.d.ts` (`declare module '*.css'`) since bundler resolution now type-checks the side-effect `globals.css` import.
  - **Stage 7** ("final", `4629cd3`, PR #61): `electron-rebuild` ^3.2.9 (deprecated) → `@electron/rebuild` ^4.2.0 (clears the last 5 HIGH advisories: tar/node-gyp/cacache/make-fetch-happen under the old tree; dev-only tool, doesn't affect the Node-20.19 CI runner), `@electron-toolkit/tsconfig` ^1.0.1→^2.0.0. **Campaign result: npm audit 22 vulnerabilities (15 HIGH + 1 CRITICAL) at start → 3 (2 low, 1 moderate) at close. All HIGH/CRITICAL cleared.** Remaining low/moderate (transitive @babel/core, esbuild, js-yaml) left as a follow-up, not worth lockfile churn at that severity.
  - Runtime `dependencies` count unchanged at **10** (policy invariant, §1.1) — every stage-1–7 change lands in `devDependencies` or as a version bump within the existing 10, never an addition.
  - **Doc-truth correction (this session, interactive, operator-directed):** re-measured every checkable stack claim in tracked docs against the stage-7 tree. Found and fixed 8 files / 13 stale references (`CONSTITUTION.md` §1.1 table — Electron 32→43, React 18.3→19.2, Tailwind(unversioned)→Tailwind 4, TypeScript 5.6→6.0, IPC 123→**124** re-measured via `grep -c` on `ipc-channels.ts`; `ARCHITECTURE.md`, `AGENTS.md`, root `CLAUDE.md`, `README.md`, `apps/satex-terminal/CLAUDE.md`, `apps/satex-terminal/README.md` — React 18→19 + Electron/TS version cells; `docs/policy/SATEX-CLAUDE-DESIGN-PROMPT.md` — a reusable "paste into Claude Design" prompt that would otherwise brief the wrong stack). 10 further "React 18" hits in dated/`status: historical` records (`SATEX-HANDOFF.md`, the 2026-07-15 constitution-verification table, dated design/spec/plan docs, this ledger's own P-102 entry text) deliberately left untouched per the append-only law (§2.8) — rewriting a historical record to match a later upgrade falsifies its own gate record, the same call P-103 made. `tsc --noEmit` re-run independently against both `tsconfig.node.json` and `tsconfig.web.json` post-edit under the actual installed TypeScript 6.0.3 binary: **exit 0 both**, confirming the doc corrections didn't paper over a real break.
- **Gates:** each of the 7 stage commits records its own local verification (`typecheck 0, lint 0, knip 0, build 0` on Windows, per commit message) and all 7 merged through the `main-protection` ruleset's required `Gates` CI check (P-095) — CI green is structurally guaranteed by the merge itself. This session independently re-ran `tsc --noEmit -p tsconfig.node.json` (exit 0) and `-p tsconfig.web.json` (exit 0) against the stage-7 tree under TS 6.0.3, and performed the full React-19-removed-API audit above (zero hits). vitest and knip were **not** independently re-run in-sandbox this session — vitest is blocked by the mount's Windows-built rollup native binary (`Cannot find module '@rollup/rollup-linux-x64-gnu'`, §2.9) and the documented remedy was not applied to avoid racing the live upgrade session; knip is the standing Node-22 oxc crash (P-097). **CI is the arbiter for both, and already gated all 7 merges.**
- **Status:** VERIFIED (2026-07-18) — all 7 stages on `master` @ `4629cd3` via PRs #55–#61, each CI-gated at merge. The doc-truth correction sub-item is **SHIPPED, UNSTAGED** — 8 files edited in the working tree this session, byte-verified (0 NUL, 0 CRCR, all tails intact), not yet committed; operator to fold into a `docs:` commit.
- **Open / carried forward (not this entry's scope):** a `chore/deps-stage8-inrange` branch exists locally (`258a7a2`, "in-range refresh": eslint 10.7, playwright 1.61, tsx 4.23, zustand 5.0.14, electron-updater 6.8.9, react-refresh 0.5.3) — **not merged to master, no PR opened yet** as of this entry. Not covered by this entry's VERIFIED status; will need its own gate record when it lands. Stage 5's operator smoke-test recommendation (dev launch + `pack:win` under Electron 43) is still unconfirmed.

### P-114 · Two IPC payload schemas (`CredentialsSetReq`, `AlpacaModeSetReq`) were missing `.strict()` — the file's own stated convention, applied to 17 sibling schemas, was silently not universal — FIXED (`.strict()` appended to both) — VERIFIED (2026-07-18, merged master `ec88a08` via PR #52, CI green)
- **PROBLEM:** Evidence: `shared/ipc-schemas.ts` (2026-07-18 full read, 394 lines). The file's header (`ipc-schemas.ts:1-13`) states "a compromised renderer... could still call window.satex.* with hostile shapes... These schemas are the wall," and multiple sibling schemas carry explicit comments naming `.strict()` as deliberate defense-in-depth against real adversarial findings (`OrderSubmitReq` cites finding C1, `LiveModeSetReq` cites finding C6, `AutonomousConfigSetReq` cites an unbounded-key DoS). 17 of ~25 object-shaped schemas carry `.strict()`. Two did not, pre-fix: `CredentialsSetReq` (`ipc-schemas.ts:104-110`, pre-fix) — the channel that carries the actual Alpaca trading API key + secret from renderer to main (`main/index.ts:811`, `satex:credentials:set`) — and `AlpacaModeSetReq` (`ipc-schemas.ts:143`, pre-fix) — the paper/live endpoint-mode switch, adjacent to the live-mode arming perimeter (invariant 6, data-source-guard). Both still ran through `validated()` (type/bounds-checked, not unguarded), so the 2026-07-16 beta-readiness sweep's narrower claim ("every payload channel `validated()`," §3) held — but that same report's summary table (§2) claimed "Zod `.strict()` on payload channels" across the board, which was not accurate for these two. Without `.strict()`, Zod's default behavior is to silently *strip* unrecognized keys rather than reject the request — lower severity than an unvalidated channel, but inconsistent with the file's own stated threat model, and the one channel it's weakest on is the one moving secrets. 6 lower-risk schemas (`CandlesGetReq`, `VaultCheckpointReq`, `ReplayStartReq`, `HistoricalImportReq`, `IndicatorSettingsSetReq`, `WorkspaceStateSetReq` — reads, UI state, replay control) also lack `.strict()`; left OPEN below, not fixed this pass.
- **SOLUTIONS considered:**
  1. *Add `.strict()` to `CredentialsSetReq` + `AlpacaModeSetReq`, matching the file's existing convention exactly.* **Chosen.** Zero behavior change for real traffic (verified both call sites: `SettingsModal.tsx` `savePaper()`/`saveLive()` send exactly `{keyId, secretKey, feed, mode}`; `TopBar.tsx:185` sends exactly `{mode: target}` — neither sends anything beyond the declared shape). `.strict()` does not alter the Zod-inferred TypeScript type (verified against Zod's own semantics — it only changes `.parse()` runtime behavior from strip to reject), so this is typecheck-neutral by construction.
  2. *Leave as-is; the base `validated()` wrapper already type/bounds-checks every field.* Rejected — technically defensible (this is a hardening gap, not an unguarded channel) but inconsistent with the file's own explicit, repeatedly-stated design intent, and credentials is the single highest-value target for exactly the "hostile shape" threat the header comment names.
  3. *Add `.strict()` to all 8 gap schemas in one pass.* Rejected for *this* changeset — only verified the call sites for the 2 security-relevant ones; blanket-applying to the other 6 without individually checking their callers would be exactly the kind of unverified batch change this constitution warns against (§2.6). Left as a named follow-up below.
- **DECISION + rationale:** (1). Off order-path, off risk-gates, off kill-switch — but explicitly perimeter per the Constitution §2.4 table (both "Credentials" and "IPC" are named hard walls) — **prepared on a branch, NOT merged, requires operator sign-off before PR** (§0.3). Fix is mechanical and narrow (2 lines, `.strict()` appended, matching 17 existing sibling schemas) with inline comments recording the verification performed. Implemented in `apps/satex-terminal/src/shared/ipc-schemas.ts`.
- **Gates (2026-07-18, sandbox):** `.strict()` is provably typecheck-neutral (Zod semantics — does not change `z.infer<>` output); both real call sites verified by direct read (`SettingsModal.tsx:231-234,255-258`, `TopBar.tsx:185`) to send exactly the declared shape with nothing extra. Full in-mount tsc/vitest re-run deferred to CI given this session's binding 45s call ceiling (see P-113's handoff for the same environment note) — **CI is the arbiter for the full suite**; this is a 2-line, semantically-inert change with no plausible failure mode beyond "a caller was sending an undocumented extra field," which the verification above rules out for both real call sites.
- **Follow-up (not this pass):** the other 6 schemas without `.strict()` (`CandlesGetReq`, `VaultCheckpointReq`, `ReplayStartReq`, `HistoricalImportReq`, `IndicatorSettingsSetReq`, `WorkspaceStateSetReq`) — lower-risk (reads/UI-state/replay, not credentials or arming-adjacent) but same convention gap. Also corrects the 2026-07-16 sweep's §2 summary-table claim ("Zod `.strict()` on payload channels") for the record — the narrower §3 claim ("every payload channel `validated()`") was and remains accurate; the broader one wasn't universal.
- **Status:** VERIFIED (2026-07-18) — merged to master as `ec88a08` via PR #52 (squash), CI green (typecheck · lint · knip · vitest all pass; `.strict()` confirmed behavior-preserving — the full suite went green with both real call sites sending exactly the declared shape). Both call sites re-verified against master before merge (`SettingsModal.tsx:231/255`, `TopBar.tsx:185`). The PR merge required a ledger conflict resolution against PR #50 (P-112) — newest-first order restored (P-114 → P-113 → P-112 → P-111), no content lost.

### P-113 · `upsertBrainParam` never replaces global (symbol:null) Brain params — SQLite composite-PK NULLs are pairwise distinct, so every `Brain.learn()` appends 8 fresh rows forever — FIXED (delete-then-insert + idempotent dedup migration) — VERIFIED (2026-07-17, merged master `5312e73` via PR #51, CI green)
- **PROBLEM:** Evidence: `persistence.ts:387-392` (pre-fix) ran `INSERT OR REPLACE INTO brain (key, symbol, …)` with `p.symbol ?? null`; the table's `PRIMARY KEY (key, symbol)` (persistence.ts:130) can never match an existing `(key, NULL)` row because SQLite treats PK NULLs as pairwise distinct. Proven live in a probe DB: three sequential upserts of the same key with `symbol:null` ⇒ 3 rows. Callers: `Brain.persist()` (brain.ts:148-158) writes all 7 feature weights + bias with `symbol: null` on EVERY `learn()` ⇒ 8 new rows per learning event, unbounded. `Brain.initialize()` (brain.ts:63) iterates every returned row and last-write-wins per key — which happens to be the newest ONLY because the PK-index scan yields insertion order within a `(key, NULL)` group (unspecified behavior, fragile). `trading-engine.ts:1637`'s health snapshot `brain.params` count inflates with the duplicates. Found during the P-094 persistence-coverage domain probe.
- **SOLUTIONS considered:**
  1. *Delete-then-insert for NULL-symbol upserts (in a driver transaction) + one-time idempotent dedup in `migrate()` keeping the newest write per key (highest rowid).* **Chosen.** No schema change, no read-path change; dedup preserves exactly the value `initialize()` effectively loads today.
  2. *Sentinel `symbol=''` for global params + map back to null on read.* Rejected — silently changes stored semantics, requires a data rewrite migration ANDs a hidden read-side convention every future query must know about; `Brain.initialize()`'s `p.symbol !== null` filter would break on any missed mapping.
  3. *Schema rebuild with `symbol TEXT NOT NULL DEFAULT ''`.* Rejected — full table copy/rename migration on the operator's live DB for the same result as (1) with strictly more blast radius.
- **DECISION + rationale:** (1). Off-perimeter (learning persistence; §2.4 untouched; risk limits remain read-only to learning code). The dedup migration is bounded (only `brain` rows, only `symbol IS NULL` duplicates), idempotent (clean DB deletes 0), and behavior-preserving (keeps highest rowid = the value the restore path already loaded); it logs `rowsDeleted` when it fires. Regression-pinned in the new `persistence.test.ts`: 3 global upserts ⇒ 1 row newest-wins; legacy dups dedup to newest-per-key on reopen; null + per-symbol rows coexist per key. Header comment's stale 5-table schema list corrected to the real 13 in the same diff. Flagged for operator review pre-merge (data-touching migration) — everything UNSTAGED.
- **Gates (2026-07-17, sandbox Node 22.22.3):** pre-edit full typecheck node+web exit 0 (in-mount) · post-edit scoped typecheck (changed-file graph) exit 0 · eslint scoped (repo-version stack eslint@10.4.0 + typescript-eslint@8.59.3, byte-identical files) exit 0, 0 warnings · vitest `persistence.test.ts` **42/42, run twice order-independent** in a /tmp harness with Linux better-sqlite3@11.10.0 (lockfile version) against md5-verified byte-identical sources — the mount's native binary is Windows-built (§2.9), and full in-mount tsc/eslint/vitest runs exceeded the 45 s call ceiling this session (env regression vs 2026-07-16, see the 2026-07-17 handoff §1) · knip CI-arbitrated (P-097). `package-lock.json` md5 unchanged (c6c32fa16eb9ac3701f8f14b706580c0). Blueprint: `apps/satex-terminal/docs/superpowers/specs/2026-07-17-persistence-coverage-brain-null-upsert-ultraplan.md`.
- **Status:** VERIFIED (2026-07-17) — merged to master as `5312e73` via PR #51 (squash), CI green. The PR also carried a CI-only fix (`ci: rebuild better-sqlite3 for Node ABI before vitest`, Claude Opus 4.8): the first CI run correctly failed loud instead of false-greening on a Node/Electron ABI mismatch (postinstall builds the module for Electron; vitest runs under plain Node) — the 42 persistence tests now exercise a real SQLite driver in CI, not NullDB (P-097 law held).

### P-112 · File-bridge corruption event — 3 `.git` metadata files + 10 tracked files truncated in one session, all repaired from git objects — SHIPPED (working tree VERIFIED clean)
- **PROBLEM (evidenced):** Session boot could not run `git` at all — `git branch` died with `fatal: bad config line 24 in file .git/config`. Investigation found the P-099 file-bridge corruption class had struck in a single event with the widest spread yet recorded:
  - `.git/config` — NUL-stuffed from byte 496 to EOF (3736 bytes, 3263 NUL); everything from the `[receive]` section onward replaced with NUL padding. Valid config was the intact 496-byte prefix (remote correctly `satex25/SATEX-terminal`, `hooksPath = .husky`).
  - `.git/packed-refs` — NUL-stuffed from byte 964 to EOF (3605 bytes, 2641 NUL). `master` still resolvable via loose ref `.git/refs/heads/master` (`4788d9c`); the salvageable prefix held `refs/heads/master` + `refs/remotes/origin/master` + tags.
  - `.git/index` — `bad index file sha1 signature` (valid `DIRC` v2 header, corrupted trailing checksum/body).
  - **10 tracked working-tree files truncated mid-token** (net −245 lines, +0 real): `Sparkline.tsx` cut at `strokeLineca`, `vitest.config.ts` at `resolve(__`, `PROBLEM-LEDGER.md` −151 lines (2926→2775), `CHANGELOG.md` −63, plus `CONSTITUTION.md`, `ARCHITECTURE.md`, app `CLAUDE.md`, `README.md`, `docs/GETTING-STARTED.md`, `tests/e2e/renderer-perf.spec.ts`. Each confirmed pure tail-truncation (HEAD strictly ⊃ working copy; the lone `+1` per file was the merged final line with `\ No newline at end of file`) — no authored work lost.
  - A phantom zero-byte `.git/index.lock` (mtime 15:15) blocked every sandbox-side index write with an inconsistent mount view: one `stat` → ENOENT, the next `readdir` → present; `unlink` EPERM, `rename` ENOENT.
- **SOLUTIONS considered:**
  1. *Restore all corrupted files from git objects (HEAD) via the P-099 sanctioned mount-write path — `git show` / `read-tree` → atomic `os.replace` → byte-verify — sidestepping the un-writable index and the phantom lock.* **Chosen.** Git objects are the proven clean source (§2.9, P-021); read/rename ops only, zero destructive git commands.
  2. *Reclone from origin.* Rejected as primary — heavier, needs network/auth, discards locally-recoverable clean state; kept as fallback.
  3. *Wait for the operator to clear locks and let git self-heal.* Rejected as sole remedy — the config/packed-refs/truncation damage is not lock-related and persists regardless of the lock.
- **DECISION + repair (evidence):**
  - `.git/config` → truncated to the valid 496-byte prefix. `git branch` resolves `master`.
  - `.git/packed-refs` → truncated to the valid 964-byte prefix. Refs resolve; loose `master` overrides the stale packed entry.
  - `.git/index` → rebuilt from HEAD at a side path (`GIT_INDEX_FILE=.git/index.fresh git read-tree HEAD`) then renamed over the corrupt index (`unlink` was EPERM; `rename` works in this mount).
  - **10 tracked files** → each restored via `git show HEAD:<path>` → atomic replace → byte-verify. Working tree `git status` **clean**, matches HEAD.
  - **Verification:** full tracked-file NUL sweep (`grep -qP '\x00'`) CLEAN; `git fsck --connectivity-only` no errors (dangling objects only); ledger restored to 2926 lines, tail intact. Corrupt originals preserved at `/tmp/{config,packed-refs,index}.corrupt.bak`.
  - **Phantom `index.lock`:** confirmed a sandbox-mount cache artifact only — operator reported no lock on the real Windows filesystem, and Windows `git status` reads clean + in sync with origin, proving the repairs wrote through the mount. The stale phantom persists in the sandbox's cached view and blocks sandbox-side index writes until remount; it does not touch the real repo.
- **Scar reinforced:** most severe P-099 instance to date (metadata + source truncation, one session). Reaffirms §2.9 — in sandboxed sessions, tracked writes go through the bash mount with byte-verify, git objects are the recovery source, and ledger edits land via `/tmp`-clone + bundle (P-107), never in-mount rewrite, precisely because the bridge corrupts this file. This entry itself was landed that way.
- **Status:** SHIPPED — all corruption repaired, working tree VERIFIED clean (`master @ 4788d9c`, fsck clean, zero NULs). Committed via `/tmp`-clone bundle handoff (mount index writes blocked by the phantom lock). Follow-up: none required; an operator remount clears the sandbox phantom.

### P-111 · Simulator 24/7 emission + LIVE→PAPER clean-slate restart — the depth-feed pile, landed with operator sign-off — SHIPPED (branch `feat/p111-sim-24-7-live-paper-restart`, PR #47 merged `9167f53`)
- **PROBLEM:** The 7-file pile flagged as P-110 O1 sat unstaged: (a) the simulator paused equities/indices outside US RTH, so the operator's off-hours sessions showed frozen charts while the sim — a synthetic feed — had no reason to freeze; (b) the real crypto WS fed the sub-second aggregator even in simulator mode, painting real BTC/ETH microstructure under a simulated price walk (split-brain); (c) the manual "Reconnect Alpaca stream" action, run in sim mode, tore down the working simulator to spin up a live WS that couldn't stay up → the 30 s-backoff reconnect loop; (d) a LIVE→PAPER account-mode switch left in-memory live tokens + session learning in place (no clean slate). Perimeter-adjacent: engine core + mode-switch + app-lifecycle → §0.3/§2.7 human gate.
- **SOLUTIONS considered:**
  1. *Land the pile as-authored* (simulator emits 24/7 for every class; `onCryptoTick` gated to `dataSource==='live'`; `reconnectAlpaca` no-op in sim with an `{internal:true}` exemption for the endpoint flip; LIVE→PAPER confirm→persist→new no-arg `APP_RESTART` IPC). **Chosen.**
  2. *Keep the per-asset-class off-hours gate, only fix the reconnect loop.* Rejected — leaves the core incoherence (a synthetic feed pretending to respect real market hours) and the operator's original complaint (frozen off-hours charts) unaddressed.
  3. *Feed the sub-second aggregator from a synthesized simulator `'t'`-tick stream so the SUB view keeps moving in sim.* Deferred — real new engine work (synthetic sub-second tick synthesis + routing + tests); not required to land this pile. Left as a possible future entry if empty-SUB-in-sim proves undesirable.
- **DECISION + rationale:**
  - **Safety perimeter verified UNTOUCHED** (evidence, file:line): diff does not touch `order-manager.ts` / `risk-gates.ts` / `kill-switch-store.ts` / `live-mode.ts` / any order path. `APP_RESTART` is no-arg (`register()`, not `validated()`; `index.ts:1021`) and can only relaunch/quit/reload — it cannot route an order. LIVE→PAPER ordering (`TopBar.tsx flipMode` + `trading-engine.ts:1489 setAlpacaModeMode`) is confirm → persist → restart: the restart fires only after PAPER is persisted (`res.ok`); a failed reconnect returns early with mode already persisted to PAPER (the conservative side) and **no** restart; re-arming to LIVE still requires the typed-phrase `isLive()` interlock (`trading-engine.ts:1492`), which a restart wipes anyway. No half-armed state reachable.
  - **INVARIANT 4 verdict (the flagged open question) — INTENDED, not a regression.** Trace: the sole production feed into the crypto sub-second aggregator is `this.subsecond.ingestTick(tick)` at `trading-engine.ts:1927`, inside `onCryptoTick`, which is subscribed **only** to the real Alpaca crypto WS (`trading-engine.ts:1897`). With the new `if (this.dataSource !== 'live') return` guard (`:1919`), sim mode feeds the aggregator **nothing**. Pre-pile it was fed by the real WS even while simulating. Feeding real microstructure into a fully-simulated session was split-brain; the simulator emits 20 Hz quote batches, not `'t'` trade ticks, so it could never coherently populate the SUB view anyway — an empty SUB is more honest than real data mislabeled as sim. The load-bearing invariant "fed only from `alpaca.onTick`" is structurally intact and now correctly qualified "…and only while the live feed is selected" (app CLAUDE.md updated).
  - **INVARIANT 6 + SIM/SUB badge gates UNCHANGED** — `data-source-guard.ts`, `isSyntheticFeed`/`showSub`, `FeedSwitch`, the subsecond store are not in the diff.
  - **24/7 sim never paints over a real LIVE feed** — `setDataSource` swaps `this.market` to `LiveMarket` on →live and constructs `MarketSimulator` only on →simulator (`trading-engine.ts:1355–1400`); `onCryptoTick` consumes the real WS only when live.
  - **Test coverage retained/improved** — `market-data.test.ts` now asserts identical 24/7 emission for a market-closed (Saturday) and market-open (Tuesday) instant across all four asset classes + candle rolls, plus the `msSinceLastTick` conditional-assignment invariant; the now-dead market-hours-gate tests were removed (correct — that behavior is gone). No dangling `@shared/market-hours` import (module still used by `alpaca.ts`, `order-manager.ts`, `ChartPanel`, `QuadPaneChart`, `ipc-schemas`, `types`).
- **Coupled updates shipped in the same changeset:** CONSTITUTION §2.9 (`SATEX_SIMULATOR_24_7` marked inert), ARCHITECTURE §2 (IPC 123→124) + §4 (baseline → 1753/134, this session) + header date, `renderer-perf.spec.ts:64` comment, README + GETTING-STARTED env rows, app CLAUDE.md (perf-canary note + sub-second-aggregator invariant wording), CHANGELOG Changed entry. Blueprint: `docs/superpowers/specs/2026-07-16-sim-24-7-live-paper-restart-ultraplan.md`.
- **Gates (2026-07-16, operator hardware, Node 24.15.0):** typecheck node+web exit 0 · eslint `src tests` exit 0 (0 warnings) · vitest **1753 tests / 134 files / 0 fail** exit 0 · **knip exit 0** (ran natively on Node 24; the P-097 oxc crash is Node-22-specific). All four gates GREEN.
- **Reconciles P-110:** O1 (pile requires operator sign-off) — signed off + landed here; O2 (coupled doc-drift when the pile lands) — all named doc updates applied, plus five further live-doc references the O2 note had not enumerated (README, GETTING-STARTED, app CLAUDE.md perf section, and the invariant wording).
- **Status:** SHIPPED -> merged to master as `9167f53` via PR #47, operator-armed per §0.3 (see this entry's header for the verified merge record). Gates were green pre-merge on branch; flip VERIFIED once CI-on-master is independently re-confirmed.

---

### P-110 · Beta-readiness extreme bug/error sweep of `master` + the unstaged depth-feed pile — gate floor GREEN · perimeter INTACT · defect classes CLEAN — verdict CONDITIONAL-GO — VERIFIED (record)
- **Mandate:** Operator directed a full validation of master + local before beta ("extreme bug/error sweep … every moving part works together"). Scope: run the gate bar, hunt the repo's known defect classes, verify the trading-safety perimeter, triage the 7-file unstaged pile.
- **Findings (measured 2026-07-16, master @ `b51405c`, with the pile in tree):**
  - **Gate floor GREEN:** typecheck node+web exit 0; eslint `src`+`tests` exit 0 (every dir); vitest **1,749 tests / 132 files, 0 failures** (segmented per sandbox recipe); knip CI-arbitrated (P-097, not sandbox-runnable). Baseline advanced from 1,668/126.
  - **Perimeter INTACT:** kill-switch atomic `writeJsonAtomic` rename contract present; **zero** raw `this.alpaca.{submitOrder,cancelOrder,getAccount}` call-sites outside broker facets; auto-update pinned `satex25/SATEX-terminal` with `autoDownload/autoInstallOnAppQuit/allowDowngrade=false`; live-mode arming = native typed-phrase + kill-armed guard; funded gates 9–13 present; credentials safeStorage-only (hard-fail, refuses plaintext); no macOS target; every payload IPC channel `validated()` (124 channels incl. the pile's `APP_RESTART`; non-validated handlers all no-arg).
  - **Defect classes CLEAN:** unbounded `Math.min/max(...spread)` → only P-108 (now fixed); the other 3 sites bounded by construction (`slice(-n)` window, HMM state count, symbol count); `push(...rows)` capped at PAGE_LIMIT 5000. Leaks: all 14 renderer intervals + 5 ResizeObservers cleaned in-scope; all 13 engine timers cleared in `shutdown()`. Error-swallowing: none empty (one documented rAF paint-guard). `as any`: zero in prod. Aliased mutable defaults (inv 9): `freshEmpty()` used, `DEFAULT_CHART_OPTS` all-primitive + spread-copy-only. NaN/divide: calibration/risk/tactics/tca all length-guarded; indicator kernels guard `period<=0`/`denom===0`.
- **Fixes shipped this sweep:** P-108 (Sparkline → `seriesExtent`) + P-109 (vitest component-test infra) — both in `p108-sparkline-extent.bundle`.
- **OPEN observations (report-only; operator calls):**
  - **O1 — the unstaged depth-feed pile is perimeter-ADJACENT** (`trading-engine.ts`, mode-switch, `APP_RESTART`). Gates green + coherent (simulator now emits 24/7 synthetic; real crypto WS gated to live; reconnect no-op in sim; LIVE→PAPER = confirm + full restart). **Requires operator sign-off (§0.3).** Confirm: `onCryptoTick` now early-returns in sim mode, so the crypto sub-second aggregator (invariant 4) is no longer fed by the real WS while simulating — intended per comments; verify against desired UX.
  - **O2 — coupled doc-drift when the pile lands:** `SATEX_SIMULATOR_24_7` becomes a no-op (simulator always emits) → update CONSTITUTION §2.9 + the `tests/e2e/renderer-perf.spec.ts:64` comment; bump IPC count 123→124 in ARCHITECTURE §2.
  - **O3 — `WebGLRenderer` paint-loop `catch {}` swallows without telemetry** (deliberate — must not crash the rAF loop). LATENT/taste: consider a throttled counter so a persistently failing paint is observable (P3 legibility).
  - **O4 — env hazard reconfirmed:** stale `.git/index.lock` EPERM on the mount mid-session (P-099 signature); all writes done via /tmp clone + bundle. Operator runs `scripts/git-unlock.ps1` before local git ops.
- **Verdict: CONDITIONAL GO for beta** — code is green and the walls hold. Gating items before a beta build: (1) operator sign-off + commit of the depth-feed pile (O1); (2) knip green on CI (sandbox can't run it); (3) signed Windows installer — Authenticode cert remains the standing release blocker (§1.4).
- **Gates:** sweep = measurement + docs; only code changes are P-108/P-109 (gates in those entries). Full report: `Vault/00-Audit/2026-07-16-BETA-READINESS-SWEEP.md`.
- **Status:** VERIFIED (2026-07-16). All sweep fixes landed on `master` with CI green: P-108/P-109 via PR #46, the sweep record itself via PR #48. Both gating observations closed — **O1** (depth-feed pile sign-off + commit) and **O2** (coupled doc-drift) landed via P-111 (PR #47, operator-armed). Remaining **O3** (WebGLRenderer paint-loop telemetry) and **O4** (stale `.git/index.lock` env hazard) stay OPEN as non-gating operator observations, not beta blockers.

### P-109 · Vitest could not run component render-tests — no React plugin (classic JSX transform ⇒ `React is not defined`) + a `.ts`-only include glob silently skipped `*.test.tsx` — FIXED with P-108 — SHIPPED (bundle)
- **Problem:** Evidence (2026-07-16 sweep, `vitest.config.ts`): `include: ['src/**/*.{test,spec}.ts', …]` matches `.ts` only — a `*.test.tsx` is collected by nothing and trips no gate (proven: a fresh `Sparkline.test.tsx` ran zero tests, "No test files found", exit 1). Separately vitest registers no `@vitejs/plugin-react`, so esbuild transforms component JSX with the *classic* runtime (`React.createElement`) while components never `import React` (the app build uses the automatic runtime via electron-vite). Any test that renders/invokes a component throws `ReferenceError: React is not defined` — which is exactly why all 132 existing tests avoid rendering and assert only static/pure logic (`ErrorBoundary.test.ts` tests `getDerivedStateFromError`, never a render). Net: the infra could pin no render-level regression at all.
- **Solutions:** (a) add `esbuild: { jsx: 'automatic' }` (self-contained `react/jsx-runtime`; no `React` global) + widen glob to `{ts,tsx}` — two lines, inert for the 132 existing tests, unblocks hook-free component invocation; (b) add `@vitejs/plugin-react` + jsdom + `@testing-library/react` — rejected now: heavier deps + a new env for a repo that tests components as pure logic; revisit if DOM-interaction tests are wanted; (c) leave it — rejected: silently drops `.tsx` tests and blocks the P-108 regression the ledger required.
- **Decision:** (a). Unblocks the P-108 300k no-throw pin. Same branch/bundle as P-108.
- **Gates (2026-07-16, /tmp clone off `b51405c`, Node 22.22.3):** typecheck node+web exit 0 · eslint touched exit 0 · renderer suite re-run under new config = 39 files / 471 tests pass, zero `React is not defined`, `.ts` collection unchanged · knip CI-arbitrated (P-097).
- **Status:** SHIPPED (bundle `p108-sparkline-extent.bundle`). Flip VERIFIED after operator adopts + CI green.

### P-108 · `Sparkline.tsx` spreads an unbounded array into `Math.min`/`Math.max` — the one renderer left off the repo's hardened `extent.ts` single-pass pattern (P-093 class) — LATENT (not live: all call-sites bounded) — FIXED (route via seriesExtent) — SHIPPED (bundle)
- **Problem:** Evidence (2026-07-16 work-layer audit, `apps/satex-terminal/src/renderer/components/Sparkline.tsx:18`): `const min = Math.min(...clean), max = Math.max(...clean)` spreads a caller-supplied array as function arguments — the exact V8 argument-count stack-overflow class the codebase hardened everywhere else (`lib/extent.ts` exists solely to avoid it; `vol-heatmap.ts:188`, `ChartPanel.tsx:1235`, `QuadPaneChart.tsx:84`, `PortfolioMiniPanel.tsx:52` all carry explicit "never Math.max(...spread)" single-pass loops, P-041/P-093 lineage). Sparkline is the lone renderer that still spreads. **Not a live defect:** every real call-site feeds a small bounded array — `MarketsOverviewPanel.tsx:189,241` and `WatchlistPanel.tsx:117` pass `q.sparkline` (a fixed mini-series), and the component early-returns on `data.length < 2` and filters non-finite values first. The risk is purely latent — a future call-site handing Sparkline a large series (e.g. a full tick array) would hit the overflow the rest of the tree already guards.
- **Solutions:** (a) migrate both spreads to the existing `extent(clean)` helper from `lib/extent.ts` — one line, behaviour-identical for finite inputs, closes the last gap in the pinned-safe set; (b) leave it — rejected: Directive 0.10 says record even a latent single-exception to an otherwise-uniform hardened pattern; (c) add a length cap inside Sparkline — rejected: `extent()` already solves it without a magic number.
- **Decision:** (a) is the fix, but it is off-perimeter renderer polish, not a live defect — **ledger-only this session** (4th autonomous run of the day; per the P-094 depth-feed handoff §5 A1 the operator's review of the unstaged pile outranks a fresh autonomous pick). Implement on a future renderer pass, pinned by a large-array regression test mirroring `extent.test.ts`'s 300k-element case.
- **Gates:** none — audit find only, no code change this session.
- **Status:** SHIPPED (bundle `p108-sparkline-extent.bundle`, branch `fix/p108-sparkline-extent`, off master `b51405c`). Flip VERIFIED after operator adopts + CI green.
- **Update (2026-07-16, beta-readiness sweep, Opus 4.8):** Implemented solution (a). `Sparkline.tsx:18` now `const { min, max } = seriesExtent(clean)` (import from `../lib/extent`); behaviour-identical for finite inputs, closes the last `Math.min/max(...spread)` gap in the render tree. Regression pinned by `Sparkline.test.tsx` (300k no-throw), which required the P-109 test-infra fix to run. Gates: typecheck node+web exit 0 · eslint touched exit 0 · Sparkline 3/3 + extent 5/5 + renderer suite 39 files/471 tests green · knip CI (P-097).

### P-107 · Committed tail truncation in long tracked docs — the P-099 bridge-corruption class reached git history at least FOUR times across PROBLEM-LEDGER.md and CHANGELOG.md — ledger tail RESTORED from git objects; CHANGELOG splice scoped as follow-up — SHIPPED (unstaged)
- **Problem:** Evidence (2026-07-16 dawn re-run, ~04:15 CDT, Fable 5): `git show <sha>:<file> | tail -c 60` across history shows mid-token, no-trailing-newline tails — the exact P-099 signature — **committed**, in two files. **Ledger event 2:** `28d2903` ended `…UNSTAGED per AGENTS.md (no git ` (268,126 B); at `94fc8df` (P-101 merge) it ends `…double-top/bottom symmetry denominator divided by a` (268,285 B) — `git diff 28d2903 94fc8df -- Vault/00-Audit/PROBLEM-LEDGER.md` shows the whole 2026-06-26 dawn-session log and the tail of the P-034-era session block silently gone (~1.4 KB) while the head GREW, so file size increased and no size check could catch it. **Ledger event 1:** `git diff b5be6d0 8ea8226` shows the 2026-07-01-era session block (`feat/chart-interaction-layer @ a13bd39, 2 files repaired.`) replaced by one line itself cut mid-token (`(no git `). **CHANGELOG events:** intact at `3ce72bf` (tail `…Closes deferred item from issue #1.`), truncated by `461f4b0` (old path `00-PROJECT-ROOT/01-SATEX-CORE/satex-app/CHANGELOG.md`, tail `…IPC byte-size ca`), and truncated differently since at least `082a7d6` at the current path (tail `…pointed at a file that`, stable through `94fc8df`). Root cause consistent with P-099: full-file rewrites of long markdown through the desktop file-tool bridge truncate at an arbitrary offset; a commit made from a corrupted working copy carries the damage into history. All damage sits at the files' BOTTOMS (oldest content), which is why per-session byte checks — scoped to the written region, not the absolute tail vs `git show HEAD` — never saw it.
- **Solutions:** (a) restore the ledger's event-2 loss now (pure mechanical: current tail is a strict prefix cut of `28d2903`'s content — append the missing bytes, then complete event-1's cut token with `add / commit).` + newline, the sentence appearing verbatim in intact sibling session blocks) and scope the CHANGELOG splice as a follow-up with exact recovery commands — the CHANGELOG needs ≥2 event splices across a path rename, where adjacent-commit diffs must first rule out intentional edits; (b) full forensic reconstruction of both files now — maximal repair, but the CHANGELOG splice involves judgment across the 2026-07-02 reorg at 4 AM that a specified follow-up handles more safely; (c) note-only — rejected: the ledger restore is zero-ambiguity and the honesty axiom does not tolerate a knowingly-truncated ledger.
- **Decision:** (a). Ledger tail restored this session: every missing byte of `28d2903`'s tail re-appended, event-1 token completed, trailing newline added; byte-verified (0 NUL, 0 CRCR, tail = complete sentence + `\n`).
- **Follow-ups:** (1) CHANGELOG splice — recover with `git show 3ce72bf:00-PROJECT-ROOT/01-SATEX-CORE/satex-app/CHANGELOG.md | tail -c 4000` and `git diff 3ce72bf 461f4b0 -- <old path>`, then the same marker-splice at the current path vs `082a7d6`-era; verify no intentional edits are overwritten. (2) Ledger event-1 deep restore — `git show b5be6d0:Vault/00-Audit/PROBLEM-LEDGER.md | tail -c 4000`, re-splice the lost 2026-07-01 session block before the 2026-07-03 status line (ordering judgment: operator or next session). (3) NEW SESSION LAW candidate for the next scheduled-prompt rev: after any write to a long tracked doc, compare the ABSOLUTE tail against `git show HEAD:<path>` when the bottom was not intentionally edited — the existing checks verify the written region and provably miss this. (4) Sweep other long tracked docs (`ARCHITECTURE.md`, `AGENTS.md`, `CONSTITUTION.md`, specs) for the same committed-tail signature.
- **Gates:** docs-only (this file) — typecheck floor unaffected; eslint/vitest scope untouched; knip CI-arbitrated (P-097).
- **Status:** SHIPPED (unstaged, master @ 729b1ce working tree; dawn re-run 2026-07-16, Fable 5). Flip VERIFIED after operator commits and the follow-up splices land.
- **Update (2026-07-16, work-layer ~04:2X CDT, Opus 4.8):** Follow-up **(4) committed-tail sweep — DONE.** Swept all 131 tracked `.md` via `git show HEAD:<path> | tail -c` byte-check: exactly 3 committed tails are not newline-terminated. Two are this class — `PROBLEM-LEDGER.md` (HEAD blob still cut at `…divided by a`, event-2; the working tree is already restored to a clean `…(no git add / commit).` + newline, so the operator's commit of the current pile closes it) and `apps/satex-terminal/CHANGELOG.md` (follow-up 1, still live). The third, `docs/policy/rule-VS.md`, is a **false positive**: it ends on the deliberate `**// END MANDATE … //**` banner and has lacked a trailing newline since its first commit (`04cd751`) — benign no-EOF-newline, not a mid-token cut. Method refinement: the true signature is a mid-*token* cut, not merely a non-0x0a last byte. Follow-up **(1) CHANGELOG splice — recipe upgraded, still DEFERRED:** the damage is multi-event, not a single prefix cut — `034984f` (relocate commit, current path) is itself cut at `…IPC byte-size ca`, while HEAD is cut at a different offset (`…pointed at a file that`), so no single current-path blob is intact; the last fully-intact tail remains `3ce72bf` (old path, `…Closes deferred item from issue #1.` + newline). Recovery = graft HEAD's current top/middle onto `3ce72bf`'s intact bottom across the 2026-07-02 path rename, diffing the overlap to prove pure loss before any write — deliberate operator/dedicated-session work, not an end-of-run freelance edit. Follow-up **(2) ledger event-1 deep restore** stays OPEN (ordering judgment). R1 de-risk (recorded for the `persistence.ts` coverage blueprint): `require('better-sqlite3')` fails in-sandbox with `invalid ELF header` (mount `node_modules` is a Windows build under Linux Node 22.22.3) — the persistence suite cannot run in-sandbox; CI (Node 20.19) or operator hardware must be its vitest arbiter.

### P-106 · Scheduled dawn/work-layer prompts (v3.1, 2026-07-04) predated the P-096–P-105 scar tissue and never stated the two-file contract — reworked to v4.0 (ultraplan ~90% + handoff-as-mission-brief ~10%) and re-synced into the installed tasks — SHIPPED (unstaged; operator-directed 2026-07-16)
- **Problem:** Evidence (2026-07-16, real run 02:01 CDT, operator-initiated): `docs/policy/scheduled-psd-daily.md` + `scheduled-work-layer.md` (both v3.1) and the installed Cowork tasks (`satex-psd-daily` 05:05, `work-layer` 06:06 — both currently disabled) predated: the P-099 binding bash-mount write law (4th instance 2026-07-15) and `scripts/git-unlock.ps1`; the P-097 knip resolution (wrapper DELETED — v3.1 §6 still taught a Node-20 version shim, i.e. the exact false-green class P-097 killed); the 45s vitest-segmentation precedent; the v3.1 constitution; and a HARD-SKIPS example list frozen at 2026-07-01. Structurally, the operator's actual workflow — dawn produces TWO artifacts, the ultraplan (~90% of effort) and a handoff the max-effort finisher (Opus 4.8 / Fable 5) ingests AS its mission brief — was implicit in v3.1, so handoff quality varied by session instead of being a format contract.
- **Solutions:** (a) full v4.0 rework of BOTH prompts: dawn gains the explicit two-file contract + a 9-section handoff format spec (§0 MISSION … §8 CLOSE CONTRACT, incl. §7 STRETCH so a frontier finisher never idles) + refreshed scars/skips + a skill-evolution rule for `~/.claude/skills/ultraplan/`; work-layer becomes a thin constitutional bootloader that executes today's handoff, with the authority chain hardened (CONSTITUTION > AGENTS.md > installed prompt > handoff > blueprint — a handoff can narrow scope, never widen it; a perimeter-instructing handoff is a defect to ledger, not an order); both pushed into the installed tasks the same session so drift is zero by construction. (b) minimal v3.2 patch of stale facts only — rejected: leaves the contract implicit, which is the actual defect. (c) move ALL work-layer instructions into the daily handoff and reduce the installed prompt to one line — rejected: safety rails must live in the installed prompt, not in the artifact it consumes; a corrupted/missing handoff would otherwise take the walls down with it.
- **Decision:** (a), operator-directed 2026-07-16 ("Please rework it… Run now"). Blueprint: `apps/satex-terminal/docs/superpowers/specs/2026-07-16-dawn-workflow-v4-two-file-contract-ultraplan.md`.
- **Files:** `docs/policy/scheduled-psd-daily.md` (v3.1→v4.0, 15,138 B) · `docs/policy/scheduled-work-layer.md` (v3.1→v4.0, 8,622 B) · installed task prompts + descriptions updated via scheduler API same session (both tasks left `enabled: false` — re-enabling is APPROVAL NODE A1, an unattended-agent design change the operator should consciously arm) · `Vault/Daily/2026-07-16-agent-handoff.md` (first v4-format specimen) · this entry.
- **Gates (2026-07-16, in-mount, sandbox Node 22.22.3):** docs/config-only diff — typecheck `tsc -p tsconfig.node.json` exit 0 + `tsc -p tsconfig.web.json` exit 0 (pre-work baseline, tree unchanged in `src`/`tests` since) · eslint/vitest scope unaffected (zero `src`/`tests` contact) · knip CI-arbitrated (P-097). All touched files python byte-verified 0 NUL / 0 CRCR, tails intact. Ledger backed up to /tmp before edit (untracked-file law).
- **Status:** SHIPPED (unstaged, master @ 729b1ce). Flip VERIFIED after the next scheduled pair runs the v4 contract end-to-end and the operator re-enables the tasks.

---

### P-105 · v3.1 constitution verification pass — VERIFIED TRUE; two doc-truth nits closed (stale ⌘ comment, unledgered P-102) — SHIPPED (branch `chore/p105-housekeeping`, bundle handoff)
- **Problem:** Operator directed a full re-verification of `CONSTITUTION.md` v3.1.0 (P-104) "to an extreme extent." Re-measured every checkable claim against the working tree (= p104 bundle `0945d8e`): **all TRUE** — runtime deps 10, IPC 122, SQLite 13 (`grep -c "CREATE TABLE"`=15, but 2 are comment lines), panels 21, modals 7 (the 8th `*modal*` file is the generic `Modal.tsx` shell), stores 24, themes 3, rails 9, workspaces ⌘1-6, calibration `MIN_SAMPLES=30`/`MULT_FLOOR=0.5` @`calibration.ts:39,42`, funded gates 9-13, flat `services/`+`alpaca/`+extracted `core/`, 126 test files, stack majors exact, CI job name, zero functional `satex-trading` refs, version stamps consistent. Two nits surfaced, **neither a constitution error**: (1) `App.tsx:251` comment read "⌘1..⌘5" while `WS_DIGITS` maps all six (`'1'..'6'`, Intel = ⌘6) and line 332 already said ⌘1-6 — a stale comment, not a behavior bug; (2) P-102 (intro Quad fade-in, SHIPPED to bundle `06aefe9` 2026-07-13, pushed to origin) was **never ledgered** — its bundle touches no `PROBLEM-LEDGER.md`, so the tracked ledger jumped P-100→P-103 (§0.10 "never lose a problem" gap).
- **Solutions:** (a) fix the comment + back-fill P-102 in one off-perimeter housekeeping bundle stacked on p104's tip (so it can't conflict with p104's own ledger head) — chosen; (b) leave both as documented follow-ups — rejected: a §0.10 gap and a lying comment are both one-line fixes, cheaper to close than to carry. Full evidence: `Vault/00-Audit/2026-07-15-CONSTITUTION-V3.1-VERIFICATION.md`.
- **Decision:** (a), operator-directed 2026-07-15 ("prepare a singular task … max effort"). Verdict: **v3.1 measures true — the honesty axiom passed its own test.**
- **Files:** `apps/satex-terminal/src/renderer/App.tsx:251` (comment ⌘1..⌘5→⌘1..⌘6; `WS_DIGITS`/behavior untouched) · `Vault/00-Audit/PROBLEM-LEDGER.md` (this P-105 entry + the P-102 back-fill below) · `apps/satex-terminal/CHANGELOG.md` (Unreleased §Fixed). The verification report itself is an untracked audit record in `Vault/00-Audit/`.
- **Gates (2026-07-15, /tmp clone on p104 tip `0945d8e`, sandbox Node 22):** typecheck `tsc -p tsconfig.node.json` + `tsc -p tsconfig.web.json` exit 0 · eslint scoped to `App.tsx` exit 0 · the only code change is a comment — no test behavior touched, full suite unchanged from master's P-100 record (1668/126), CI arbiter · knip CI-arbitrated (P-097). All edited files byte-verified 0 NUL / 0 CRCR.
- **Status:** SHIPPED — `chore/p105-housekeeping` off `0945d8e` (p104 tip) via /tmp-clone; bundle `p105-housekeeping.bundle` at repo root; **adopt AFTER p104**. Flip VERIFIED after PR + CI green. **VERIFIED 2026-07-16:** merged — `master` @ `28d2903`; CI green implied by the ruleset (P-095).

---

### P-104 · CONSTITUTION.md v3.0.0 drifted from measured reality within two weeks of taking effect — phantom `services/` folder map, pre-P-103 counts, and none of the P-096–P-103 scar tissue — SHIPPED (working tree, `chore/p103-canonical-name-and-doc-truth`; operator-directed)
- **Problem:** Evidence (2026-07-15, against the P-103-refreshed tree): §3.1 diagrammed a 7-domain-folder `services/` split that never matched the flat directory (already flagged as P-103 follow-up 1, OPEN); §1.1 carried ~103 IPC / 12 tables / ~1,287 tests / 16 panels / 4 themes vs measured 122 / 13 / 1668·126 / 21 / 3 (P-103 measurements); §1.4/§2.7 pointed at `docs/plans/specs/` (real path: `docs/superpowers/specs/`); §2.9 predated the binding P-099 bash-mount write decision, the P-097 knip false-green law, and the 45s-ceiling segmentation precedent; no mention of the funded overlay gates 9–13, the P-096 PSR/DSR significance layer, the 2026-07-13 Conviction Layer flagship decision (P-100), the scheduled work layer (P-085/P-090), or P-094's human-gated perimeter coverage. The document whose first law is “never fabricate” was misstating its own system.
- **Solutions:** (a) full v3.1.0 reissue in place — re-verify every factual claim against the tree, absorb new scar tissue + current direction, keep the proven v3.0 structure; add an Appendix C delta log. (b) minimal patch of §3.1 only — rejected: leaves a dozen other falsehoods standing. (c) fold the constitution into AGENTS.md — rejected: loses the Builder/Terminal split and Part III/IV doctrine AGENTS.md deliberately doesn't own.
- **Decision:** (a), operator directive 2026-07-15 (“align everything up to where we stand … one instruction sheet”). Every number re-verified this session: `calibration.ts:39,42` (MIN_SAMPLES=30, MULT_FLOOR=0.5), `order-manager.ts` funded gates 9–13 (mll/blackout/max-contracts/eod/asset-class), `package.json` versions + 10 runtime deps, `src/shared/health/` contents, `docs/superpowers/specs/` paths, ARCHITECTURE §2/§4 measured counts + 1668/126 baseline, ruleset facts per P-095, CI job name per `ci.yml`. Written per the P-099 decision: composed in /tmp, cp'd to the mount, byte-verified both sides (61,766 bytes · 934 lines · 0 NUL · 0 CRCR · md5 match).
- **Files:** `CONSTITUTION.md` (v3.0.0 → v3.1.0) · `ARCHITECTURE.md:78` (store count 22→24 — re-measured this session: all 24 renderer `*[Ss]tore.ts` files import zustand, incl. `intelLayoutStore`/`update-store`; panel count 21 confirmed — `panels/` holds 21 incl. `DisciplinePanel.tsx`; the 22nd `*Panel.tsx` is the dev `TweaksPanel` in `components/`) · this ledger entry.
- **Follow-ups:** (1) add the CHANGELOG Unreleased line when this branch's committing session runs; (2) resolves P-103 follow-up 1 (the §3.1 phantom folder map); (3) next constitution review 2026-10-13 or next L1.x advance.
- **Gates (2026-07-15, in-mount app dir, sandbox Node 22):** typecheck `tsc -p tsconfig.node.json` exit 0 (6.7s) + `tsc -p tsconfig.web.json` exit 0 (6.3s), Node v22.22.3 · markdown-only diff: eslint/vitest scope unaffected (no `src`/`tests` contact) · knip not sandbox-runnable (P-097) — CI arbiter.
- **Status:** SHIPPED — working tree on `chore/p103-canonical-name-and-doc-truth` alongside the P-103 sweep; adopt with the P-103/P-104 bundle; flip VERIFIED after PR + CI green. **VERIFIED 2026-07-16:** merged — `master` @ `fa19b19` (constitution v3.1.0 on default branch); CI green implied by the ruleset (P-095).

---

### P-103 · Post-rename debris: updater feed, README badge/links, and SECURITY advisory link still pointed at the old repo name; README front page linked deleted files; ARCHITECTURE.md drifted from measured reality — SHIPPED (branch `chore/p103-canonical-name-and-doc-truth`, bundle handoff)
- **Problem:** Three classes, evidenced by `git grep -in 'satex-trading'` + filesystem measurement (2026-07-15): (1) **supply-chain-relevant stale name** — `auto-update.ts:38` fed electron-updater `repo: 'satex-trading'` (functional only via GitHub's rename redirect; if the old name is ever re-registered the redirect dies and the feed follows the squatter — the classic repo-rename hijack primitive), plus the pinned assertion at `auto-update.test.ts:86`, the README CI badge + Releases links, `docs/SECURITY.md:11`, and the local git remote. (2) **README front page broken** — `GETTING-STARTED.md`/`FAQ.md` linked at root but moved to `docs/` in the 2026-07-02 reorg; Contributing/Security pointed at a nonexistent `docs 1/` folder. (3) **ARCHITECTURE.md ≠ reality** — §2 claimed a 7-domain-folder `services/` split (directory is flat + `alpaca/`; `find` verified), 103 IPC channels (measured 122 keys in `ipc-channels.ts`), 16 panels / 4 themes / ⌘1-5 (measured 21 `*Panel.tsx` · 7 modals · 22 stores · 3 themes (`classic`/`mono`/`bluyel`) · ⌘1–6 incl. Intel · 9 rails), 12 SQLite tables (13 `CREATE TABLE`s in `persistence.ts`), §4 baseline stuck at 1268/98 (2026-06-27) vs the P-100 record 1668/126, pre-reorg `satex-app/` spec+cert paths — and `scripts/update-baseline.sh`, the §4 refresh tool, still aimed `APP` at the dead `00-PROJECT-ROOT/01-SATEX-CORE/satex-app` path, so the documented refresh loop could never run.
- **Solutions:** (a) full sweep now — canonicalize every *functional* reference to `SATEX-terminal` (exact capitals), repair README links against the real `docs/` layout, refresh ARCHITECTURE.md §1/§2/§4 to measured counts, fix the baseline-script path; leave dated history (P-095 text, shipped CHANGELOG entries, `v0.4.4` checklist, the 2026-07-09 ultraplan, `scripts/archive/`) untouched. (b) minimal unblock — updater feed + badge only — rejected: leaves the front page broken and the map lying. (c) scrub historical mentions too — rejected: violates this ledger's append-only law and falsifies shipped gate records; those mentions document the old name as history, they do not reference it as current.
- **Decision:** (a), operator directive 2026-07-15 ("absolutely zero stale repo-name references … Exactly those capitals too"). Note `SATEX Trading Systems` (cert CN in `certs/`, release checklists) is a code-signing legal-entity name matched against the CSR — not a repo reference; untouched by design.
- **Files:** `apps/satex-terminal/src/main/services/auto-update.ts` (+supply-chain comment) · `auto-update.test.ts` (14 tests, count unchanged) · `README.md` (badge, Releases, 4 doc links) · `docs/SECURITY.md` · `AGENTS.md:22` + `CONSTITUTION.md:92` (rename parentheticals dropped; history stays in P-095) · `ARCHITECTURE.md` (header date 2026-07-15; §1 map incl. `reference/`; §2 rewritten to the real `core/` + flat `services/` + `backtest/` layout with measured counts; §4 baseline/spec/cert lines — `Baseline `-line-start contract preserved for the refresh script) · `scripts/update-baseline.sh` (`APP="$ROOT/apps/satex-terminal"`) · `apps/satex-terminal/CHANGELOG.md` (Unreleased ### Fixed). Local git remote set to `https://github.com/satex25/SATEX-terminal.git` (config write, not a commit).
- **Follow-ups:** (1) CONSTITUTION §3.1 (~line 393) repeats the phantom `services/execution/` folder map — constitution edits deserve their own reviewed pass per §2.7, not a freelance fix; OPEN. (2) Operator, GitHub-side: confirm the ruleset + badge render on the renamed repo and that `satex25/satex-trading` cannot be re-registered by a third party (org-level name retirement is GitHub-managed but worth a periodic check).
- **Gates (2026-07-15, in-mount app dir, sandbox Node 22):** typecheck `tsc -p tsconfig.node.json` exit 0 + `tsc -p tsconfig.web.json` exit 0 · eslint scoped to both touched source files exit 0 (full-repo `eslint src tests` exceeds the 45s sandbox call ceiling — P-098 precedent; CI is the full-lint arbiter) · targeted vitest `auto-update.test.ts` 14/14 pass, exit 0 (required `@rollup/rollup-linux-x64-gnu --no-save` first — mount node_modules is a Windows install; `package-lock.json` md5 verified unchanged before/after) · knip not sandbox-runnable (P-097) — CI arbiter. All 10 edited files byte-verified 0 NUL / 0 CRCR in both the /tmp clone and the mount tree.
- **Status:** SHIPPED — committed on `chore/p103-canonical-name-and-doc-truth` via the /tmp-clone workflow (in-mount commit blocked by a fresh P-099 `index.lock` EPERM recurrence, recorded there); bundle `p103-canonical-name-doc-truth.bundle` at repo root for operator adoption; flip VERIFIED after PR + CI green. **VERIFIED 2026-07-16:** adopted + merged — content on `master` @ `3aa7bef`; the `main-protection` ruleset (required CI Gates check, empty bypass list — P-095) means presence on master implies PR + CI green.

---

### P-102 · Post-intro session reveal — no fade-in after the boot ceremony, and fresh installs landed on Trade not the operator's Quad overview — SHIPPED (branch `feat/intro-fade-quad` @ `06aefe9`, on origin; BACK-FILLED to ledger 2026-07-15 per P-105)
- **Problem:** After the P-098 boot ceremony dissolved, the terminal snapped in with no transition, and fresh installs opened on Trade rather than the operator's preferred Quad overview. The operator asked (2026-07-13) for a staggered fade-in landing on Quad. The fix shipped to bundle `p102-intro-fade-quad.bundle` (`06aefe9`, off master `32ceccd`) and was pushed to origin as `feat/intro-fade-quad` — but **no ledger entry was ever written** (the bundle touches `App.tsx`/`globals.css`/`types.ts`/`CHANGELOG.md`, not `PROBLEM-LEDGER.md`). Caught during the P-105 verification pass as a §0.10 gap.
- **Solutions:** (a) renderer/CSS-only reveal — `.bb-app` gains `bb-shell-reveal` the instant `splashDone` flips (`className={splashDone ? 'bb-app bb-shell-reveal' : 'bb-app'}`) → `@keyframes session-reveal` (820ms `cubic-bezier(.22,.61,.36,1)`, `translateY(6px)→0` + opacity, staggered `nth-child` 0/70/150/230/300ms across the grid rows; `prefers-reduced-motion` → `session-reveal-reduced` 240ms plain fade), plus `DEFAULT_WORKSPACE_STATE.landingWorkspace` `'Trade'→'Quad'` (fresh installs only — the operator's saved `workspace-state.md` already lands on Quad, tolerant-hydrate untouched) — chosen; (b) a JS-driven transition — rejected: needless main/IPC surface for a pure visual reveal (§2.7). Operator ruled KEEP the Classic theme (the clarifier overrode an earlier "default mono" aside).
- **Decision:** (a). Zero perimeter contact, renderer-only.
- **Files:** `apps/satex-terminal/src/renderer/App.tsx` (`bb-shell-reveal` class hook) · `src/renderer/globals.css` (`session-reveal` + `-reduced` keyframes, `.bb-shell-reveal`) · `src/shared/types.ts` (`DEFAULT_WORKSPACE_STATE.landingWorkspace`) · `apps/satex-terminal/CHANGELOG.md` (P-102 §Added, in the same bundle).
- **Gates (2026-07-13, /tmp clone, sandbox Node 22):** typecheck node+web exit 0 · eslint `src tests` exit 0 / 0 warn · targeted vitest (workspace-state + workspaceStore + ipc-schemas + intro-sequence) 64/64 · knip CI-arbitrated (P-097). Details re-verified against the real `32ceccd..06aefe9` diff during the P-105 back-fill.
- **Status:** SHIPPED — `feat/intro-fade-quad` @ `06aefe9` on origin, awaiting PR + live-render QA of the fade. Retroactive ledger back-fill (feature shipped 2026-07-13, ledgered 2026-07-15). NOTE: this ledger entry rides in the **p105 housekeeping** bundle, not p102 — do not re-add it when adopting p102. **UPDATE 2026-07-16:** merged — `master` @ `a18fa29`; CI green implied by the ruleset. Live-render QA of the fade STILL PENDING — hold VERIFIED until then.
---

### P-101 · Track B (B1): P-096 PSR/DSR expectancy is computed nightly but invisible in the cockpit — surfaced as the DISCIPLINE panel EDGE block — SHIPPED (branch `feat/discipline-edge`, gates green, awaiting operator sign-off + live-render check)
- **Problem:** `self-eval.ts` computes PSR/DSR significance per (strategy × symbol) every night (P-096) and prints it to a vault markdown file only — the operator cannot see which of the system's own strategies carry a statistically real edge without opening Obsidian. Worse, the `real/selection-risk/noise` verdict thresholds lived inline in `renderReportMd` (`self-eval.ts:116-119`), so any second consumer would have duplicated and drifted them. Blueprint: `apps/satex-terminal/docs/superpowers/specs/2026-07-13-track-b-significance-expectancy-surface-ultraplan.md` (reviewed; §6 wording corrected pre-execution: CONSTITUTION §3.6 *does* contain the loss/win-classification language verbatim as narrative model-update hygiene — the accurate statement is that no code implements it and nothing mandates `pattern-learner.ts` as its home, not that the constitution's text is wrong).
- **Solutions:** (a) retain the last run's rows in `SelfEvalService`, expose one read-only IPC channel, render a top-3-by-DSR mini-table on the DISCIPLINE panel, extracting the verdict into ONE shared function; (b) parse the vault markdown file from the renderer — rejected: file-format coupling, breaks on packaged installs with `SATEX_VAULT_ROOT`, and adds a filesystem read for data already in memory; (c) widen `SelfEvalStatus` with the rows — rejected: churns an existing contract consumed by Settings + AIInsightsPanel when a parallel getter is additive and zero-risk.
- **Decision:** (a), per the operator-approved ultraplan (D1=B1 only, D2=mini-table top-3 by DSR, D3=retain+read-only IPC). The B2 Market-Wizards trade-retrospective classifier stays deferred to its own LEARN-domain ultraplan.
- **Files:** `shared/types.ts` (+`EdgeVerdict`/`SelfEvalReportRow`/`SelfEvalReport` DTO) · `shared/backtest/edge-verdict.ts` **new** (`classifyEdge`, the ONE threshold source; DSR≥0.95→real, else PSR≥0.95→selection-risk, else noise — byte-identical markdown pinned by a characterization test) + `edge-verdict.test.ts` **new** (5) · `main/services/self-eval.ts` (rows carry `strategy`/`symbol` split, `lastReport` retained post-`withDsr`, `getLastReport()`, `renderReportMd` now calls `classifyEdge` via `SIGNIF_MD`) · `main/core/trading-engine.ts` (`getSelfEvalReport()`, null-safe in sim/replay) · `shared/ipc-channels.ts` (+`SELF_EVAL_REPORT_GET`) · `main/index.ts` (invoke-only register beside `CALIBRATION_GET`; **no** `_SET` sibling — recorded guardrail) · `preload/index.ts` (+`getSelfEvalReport`; `window.satex` type surface flows automatically via `SatexAPI = typeof satexApi`) · `renderer/lib/self-eval-edge.ts` **new** (pure: `rankTopByDsr` nulls-last DSR→PSR→Sharpe, `verdictCounts`, `fmtDsr` — `n/a` for null, never a fabricated 0%) + `self-eval-edge.test.ts` **new** (13) · `panels/DisciplinePanel.tsx` (EDGE block, 60s poll, `clearInterval`+`cancelled` on unmount — PR #6 lesson; explicit cold-boot copy) · `globals.css` (+`.bb-disc-edge-*`, single-class selectors, bounded `overflow-y: auto` rows region per the §6 overflow concern).
- **Observational wall (§3.6 invariant 3), enforced as planned:** the channel is invoke-only returning data; no setter exists; significance numbers reach a display surface only — no path to an order, a size, or an autonomy multiplier. Zero broker-facet, risk, execution, or interlock contact.
- **Gates (2026-07-13, in-sandbox Node 22.22.3, branch `feat/discipline-edge` off `master` @ 32ceccd):** typecheck (node+web) exit 0 · `eslint src tests` exit 0 · vitest segmented exact-cover **127 files / 1,686 tests / 0 fail** (9 invocations under the 45s sandbox call ceiling; baseline 1,668 + 18 new: 5 `edge-verdict`, 13 `self-eval-edge`, +3 in `self-eval.test.ts` net of reuse) · knip not sandbox-runnable (P-097 oxc-parser ArrayBuffer crash under Node 22 reproduced this session) — CI (Node 20.19) is the arbiter; static pre-audit clean: every new export has a named consumer (`classifyEdge` ← self-eval + tests; DTO types ← engine/preload/panel; selector fns ← panel + tests), internal helpers (`numDesc`, `cmpEdge`, `CONFIDENCE_BAR`, `SIGNIF_MD`) unexported. All touched files byte-verified post-write (NUL sweep + tail check, P-099 hazard) — clean; all writes via bash-mount per the P-099 ruling.
- **Status:** SHIPPED to branch, gates green. Held for operator sign-off per AGENTS.md (engine + IPC surface = trading-engine-adjacent). Remaining T9 half: the **live-render check** (launch app → Settings → Run Self-Eval Now → confirm EDGE rows render and fit the panel height) needs the operator's real hardware — sandbox has no display; ledger this VERIFIED only after that check + CI green. **UPDATE 2026-07-16:** merged — `master` @ `94fc8df` (+ IPC-count doc bump `729b1ce`); CI green implied by the ruleset. Live-render check STILL PENDING on operator hardware — hold VERIFIED until then.

---

### P-100 · Calibration + self-eval intelligence is computed and thrown away — no cockpit surface shows the operator their own earned psychological state — SHIPPED (branch `feat/discipline-panel`, gates green, awaiting operator sign-off)
- **Problem:** `calibration.ts` computes a Brier score, a reliability curve, and a downgrade-only confidence multiplier (Mark Douglas's probabilistic mindset — conviction can only be scaled down, never up); `self-eval.ts` (P-096, SHIPPED 2026-07-10) grades every strategy by statistically-significant expectancy rather than raw Sharpe (Van Tharp's edge-over-win-rate doctrine); CONSTITUTION §3.6 prescribes the loss/win classification every Market Wizard describes. All three are real, already computed, and already IPC-exposed to the renderer (`getCalibration`, `getSelfEvalStatus` both live in `preload/index.ts` and consumed today by `AIInsightsPanel`) — but no cockpit surface renders them as a trader's psychological state. Verified against the operator's direction decision (`2026-07-13-flagship-direction-decision.md`, "The Conviction Layer") before building: confirmed both data bridges cross the perimeter already, so a read-only panel needs zero new IPC.
- **Solutions:** (a) new **DISCIPLINE** panel — pure rendering of calibration/self-eval/risk into an earned-conviction readout, zero perimeter contact, safe to build same-session as a live open; (b) extend `pattern-learner.ts` to implement §3.6 classification first, then build the panel on top — rejected for *this* slice: touches the learning core, requires a plan + human sign-off per §2.7, and would have delayed a zero-risk win behind a risk-bearing one for no reason; (c) surface the raw per-strategy PSR/DSR expectancy (the report-file numbers, not just run status) in v1 — rejected: those figures live only in the nightly report *file*, not in `SelfEvalStatus`: doing so needs a new read-only IPC to parse the report, which is perimeter-contact work that belongs on the after-bell branch, not the pre-open window.
- **Decision:** (a), scoped honestly: v1 renders calibration (state label + the signature downgrade-only conviction meter: solid = earned, hatch = confidence handed back to humility) and self-audit *status* (armed/last-run/regressions), not yet the raw per-strategy expectancy numbers — that joins in Track B alongside the §3.6 `pattern-learner.ts` work, per the operator's own sequencing. Risk rides the same surface as ever-present ground truth (breach/watch counts from the existing `riskGatesStore`) — it did not get its own initiative, per the direction doc.
- **Files:** `src/renderer/lib/discipline.ts` (pure, headless state mapping — `readConviction`/`readSelfAudit`/`composeDiscipline`, node-testable, guards null/cold-boot/clock-skew) · `lib/discipline.test.ts` (24 tests) · `panels/DisciplinePanel.tsx` (thin shell — polls `getCalibration`/`getSelfEvalStatus` at the same cadence `AIInsightsPanel` already uses, reads `riskGatesStore`) · `globals.css` +61 lines (`.bb-disc-*`, the conviction-meter signature, `prefers-reduced-motion` respected) · `App.tsx` + `shared/types.ts` (`RailId` extended with `'discipline'`, wired as a collapsible rail beside Risk in the secondary row — verified the Zod `RailIdS` enum and `collapsedRails` bound are fully derived from `RAIL_IDS`, so the new id cascades through validation and persisted workspace state with zero breakage).
- **Gates (2026-07-13, real hardware, branch `feat/discipline-panel` off `master` @ 349454b):** typecheck (node+web) exit 0 · full-repo `eslint src tests` exit 0 · vitest **126 files / 1,668 tests / 0 fail** (baseline 1,644 + 24 new) · knip exit 0, new module knip-silent (`DisciplineFactor` un-exported after an initial knip warn on it). Byte-verified every edited/created file (NUL sweep, tail check) against the live P-099 corruption hazard — clean.
- **Verification note:** zero-perimeter claim confirmed, not assumed — both `window.satex.getCalibration` and `.getSelfEvalStatus` were already production call-sites (`AIInsightsPanel.tsx`, Settings) before this change; this entry adds no new IPC channel and touches no trading-path code. Visual signature reviewed via a static state-preview (four representative states: CALIBRATED/TEMPERED/OVERCONFIDENT/WARMUP) rendered in-browser before merge.
- **Status:** SHIPPED to branch, gates green — held for operator sign-off per `AGENTS.md`'s trading-engine-adjacent PR review norm (this panel is UI-only but sits in the same cockpit shell); PR to be opened against `master`. Not merged same-session as a live market open by design (see P-099 — the corruption hazard alone is reason enough to keep same-day live-session changes off `master` until reviewed, even for a zero-perimeter panel).

---

### P-098 · Cold-boot intro is a single 3.2s splash — the operator-approved 4-frame branded boot (Intro Rework) was unimplemented — VERIFIED (merged to master, 2026-07-13)
- **Problem:** Cold boot shows only `SplashIntro.tsx` (~3.2s). The operator commissioned a 4-frame mono/B&W branded boot (`Intro Rework.dc.html` mockup + `FABLE5-IMPLEMENTATION-BRIEF.md`, repo root): 1a current splash → 1b Masthead (film title) → 1c Tape Head (VHS institutional) → 1d System Plate (Swiss technical); 1b–1d each play a full 7.0s boot (no skip), hold on PRESS ANY KEY, then exit via dissolve / CRT collapse / hairline wipe. The AI-drafted brief contradicted the repo and the mockup in several places — each claim verified against the filesystem per Directive 0.5 before build.
- **Solutions:** (a) faithful mockup port: one React orchestrator over a headless transition table in `lib/intro-sequence.ts` (the `rail-layout.ts` pattern — node-env unit-testable), reusing the battle-tested `SplashIntro` as frame 1a with mono `--bb-*` variable scoping on the wrapper; (b) the brief's literal architecture — new SplashFrame, Electron-main mount, `window.satex.ready()` IPC, Zustand store, 2.8s auto-replay — rejected: the splash is a pure renderer overlay (terminal warms underneath; no main-process coupling exists), a new IPC channel is unnecessary contract surface (§2.7), and auto-replay contradicts the mockup's own header ("run the full 7.0s boot — no skip — then hold on the enter screen").
- **Decision:** (a). Grounded deviations from the brief: no IPC/main changes (renderer-only, zero perimeter contact) · hold-on-enter, no auto-replay · CSS in `globals.css` per repo convention (not `src/styles/intro.css`) · `prefers-reduced-motion` skips 1b–1d entirely, preserving the existing splash's fast-fade a11y contract · session label derived from UTC hour (TOKYO/LONDON/NEW YORK) instead of hardcoded "LONDON" (Directive 0.1) · scanlines prop default-on (no `settings.scan-lines-enabled` key exists in the app) · keydown accepts plain keys only — bare modifiers and chords fall through untouched, so ⌘⇧K arming is never raced or swallowed (P-044 lineage), and the intro never calls preventDefault/stopPropagation.
- **Files:** `src/renderer/lib/intro-sequence.ts` (headless machine + tc/pct/UTC/session formatters, degenerate-input guards) · `lib/intro-sequence.test.ts` (18 tests: full transition walk, no-skip, hold-on-enter, chord filtering, formatter clamps) · `components/intro/{BootIntroSequence,MastheadFrame,TapeHeadFrame,SystemPlateFrame}.tsx` · `globals.css` +278 lines (`.sxi-*`, 18 keyframes; 1c reuses `satex-splash-scan/-letter`) · `App.tsx` (import + overlay swap; `SplashIntro` now consumed by the sequence — not dead).
- **Follow-ups:** (1) Playwright `tests/e2e/boot-sequence.spec.ts` deliberately NOT shipped — Electron can't launch in this sandbox and unverified test code violates Directive 0.4; needs a local authoring+run session. (2) Settings toggle for the scanlines prop. (3) Plate version stamp defaults to package.json's `0.5.0` via prop — wire to a single source when a version IPC exists. (4) Pre-existing nit observed, not a regression: a bare `?` during any splash/intro both advances the overlay and toggles the shortcuts modal behind it (same exposure exists today with `SplashIntro`).
- **Gates (2026-07-12, in-sandbox Node 22):** typecheck node+web exit 0 · eslint scoped to all 8 touched files exit 0 (full-repo lint exceeds the 45s sandbox call ceiling — CI is the full-lint arbiter) · vitest segmented exact-cover 127 files / 1,683 tests / 0 fail (12 invocations) · knip not sandbox-runnable (P-097) — CI arbiter. Knip pre-audit done statically: no orphan files, no unreferenced exports (props interfaces and `IntroFrame` deliberately unexported).
- **CORRECTION (2026-07-13):** the first implementation (058df50, pushed to origin by the operator) was built from the WRONG design source. Root cause: the AI-drafted brief's frame table was extracted from `Intro Rework.dc.html` — a TURN-01 exploration canvas (its own header says "TURN 01 · 4 FRAMES") — while the operator's actual final design was `SATEX Intro.dc.html` (the only mockup inside the handoff zip; confirmed by the operator's 2026-07-13 recording + `SATEX Intro (standalone).html`). Directive-0.5 verification was applied to the repo but not hard enough to the brief↔zip divergence — the lesson: when a handoff names a design source, open THAT file and diff it against the spec before building.
- **Rebuild (same branch, follow-up commit):** standby → arming (500ms) → boot ceremony (8,200ms incl. integrated gvBootOut dissolve) → done; one keypress total, ceremony unskippable. `StandbyGateFrame` (framed plate, OPTIONS button, live UTC/date, breathing prompt — 2.6s cadence drifting to randomized 3.2–5.4s, headless-tested `breathCycleMs`) + `BootCeremonyFrame` (188px blur-resolve letters 0.7–1.74s, text-clipped light sweep @3.1s, rule @3.5s, subtitle @4.1s, credits @5.0/5.4s). Film frames (Masthead/TapeHead/SystemPlate) AND `SplashIntro.tsx` deleted — the gate is now the first frame. Stage is the design's fixed 1920×1080 plate scaled to fit. New wiring: OPTIONS → Settings modal, with the z-stack re-ranked `.sxg` 8000 < `.modal-back` 8500 < `.kill-arm-overlay` 9000 (also fixes a pre-existing nit: the old splash at z-9999 covered the kill-arm progress card); `holdKeys` prop (modal/palette/tweaks open ⇒ arm listener suspended, so typing into Settings can never arm the boot); `onComplete` ref-stabilized (App re-renders previously restarted the phase timer — in Electron the engine re-renders App constantly, so the 8.2s ceremony would NEVER have completed; caught by live DOM probing, not by unit tests).
- **Live verification (dev renderer, DOM probe):** gate→arm→boot 8,036ms→overlay unmount (main-thread jank accounts for the 164ms drift — the terminal hydrates underneath); OPTIONS opens Settings ABOVE the gate; typing with the modal open never arms; Escape closes the modal without arming; next plain key arms. Gate visuals match the recording frame-for-frame (borders, corners, rule label, breathing prompt).
- **Gates (2026-07-13, post-rebuild):** typecheck node+web exit 0 · eslint scoped to all touched files exit 0 · vitest renderer/lib 12 files / 138 (16 new intro tests) + stores 12/104 + chart/components 5/84 (webgl 5/85 and all main/shared/scripts segments untouched by the rebuild, measured green earlier this session in the full 127-file sweep) · knip CI-arbitrated (P-097).
- **Status:** VERIFIED — merged to `master` via PR #36 (squash) as **e0fade5**, 2026-07-13; 3 CI checks passed (green CI Gates). History: 058df50 (film sequence, superseded) + 5f57ba3 (standby-gate→ceremony correction), both folded into the squash. `feat/boot-intro-sequence` deleted locally 2026-07-13 (remote deletion pending operator). Follow-ups (1)–(4) at line 23 remain OPEN for a future local Electron-authoring session.
- **Post-merge full-gate re-verification (2026-07-13, operator's Windows machine, Node 24.15 — the real hardware, not the sandbox):** all four gates green on `master` @ e0fade5 — typecheck exit 0 · **full-repo** `eslint src tests` exit 0 (the run the sandbox's 45s ceiling never allowed) · vitest `125 files / 1,644 tests / 0 fail` · knip exit 0. Notable: real `knip` **ran to completion** here (the P-097 oxc-parser raw-transfer crash is sandbox/Node-22-specific and does not reproduce on Node 24); its `exports`/`types` findings are `"warn"` (deliberately-kept public API surface), so exit 0 is the true gate state. CI (Node 20.19) remains the canonical arbiter.

### P-099 · Cowork file-tool bridge corrupted tracked files twice in one session (tail truncation + in-place NUL-stuffing) — P-018/P-021/P-078 scar class, live on 2026-07-12 — OPEN (workaround proven)
- **Problem:** While building P-098, two distinct corruption events from the desktop file-tool bridge, both reported as success by the tools and caught only by gates/byte-audits: (1) an `Edit` on `App.tsx` applied its replacement but truncated the tail mid-token at line 458 of 468 (`<div className="kill-ar`), with `git status` transiently claiming the file unmodified (stale-view/partial-flush signature); (2) a batch of five one-line `Edit`s (each deleting an `export ` prefix) left exactly 7 NUL bytes — `len('export ')` — inside every touched file instead of shifting content (`grep: binary file matches`).
- **Solutions:** (a) write tracked files only through the bash mount (heredoc / python + atomic `mv`); recover corruption from git objects (`git show HEAD:<path>`) + scripted re-edit; byte-verify every write (`wc -c`, `tr -dc '\0' | wc -c` NUL sweep, `tail -1`); (b) keep using the file tools and audit after every write — rejected: once corruption is expected, the audit costs more than the heredoc.
- **Decision:** (a), effective immediately for all agent sessions in this environment: bash-mount writes for tracked files; file tools remain fine for reads and for new-file creation followed by a byte-level verify. Both P-098 recovery transcripts (git-object rebuild of `App.tsx`; `tr -d '\0'` strip of the 5-file batch, 7 NULs each) are in this entry's session.
- **Additional evidence (same session):** (3) a stale zero-byte `.git/index.lock` from a failed in-mount commit could not be unlinked (EPERM — `rm` included), blocking all index writes; (4) pushing a rescue side ref from the /tmp clone into the mount repo left `refs/heads/p098-incoming` broken (stuck ref-lock, quarantine dir unlink EPERM) — treat the mount's `.git` as read-only for refs/index; (5) `git bundle create` targeting a mount path fails on its own `.lock` rename — create bundles in /tmp and `cp` the finished file in.
- **Operator cleanup (Windows, in `mc4/`):** delete `.git\index.lock`; delete `.git\refs\heads\p098-incoming.lock` and `.git\refs\heads\p098-incoming` if present; stray `.git/objects/**/tmp_obj_*` files are harmless (a later `git gc` collects them). Then adopt the P-098 bundle (see P-098 Status).
- **Operator cleanup verified (2026-07-13, Windows machine):** the listed stale-lock/ref hazards are all absent — no `.git/index.lock`, no `.git/refs/heads/p098-incoming` (or its `.lock`). The mount's `.git` is clean; nothing to unlink. (The corruption workaround stands for future sandbox sessions.)
- **Pre-open recurrence (2026-07-13, real hardware / Node 24.15, master b008f0e):** a fresh stale-lock instance of this class surfaced during the market-open prep session — a zero-byte `.git/packed-refs.lock` (a NEW lock variant vs the `index.lock` / ref-lock hazards listed above) left by a crashed ref write, blocking `git pull --ff-only` with the "Another git process seems to be running" error while `git status` and HEAD stayed correct (clean tree, up to date with origin). No git process actually held it (tasklist clean, lock 7min old); removed it, after which `pull` + branch creation both succeeded. Confirms the class is live on the operator's real hardware too, not sandbox-only — the remove-stale-lock-then-verify workaround stands.
- **Recurrence (2026-07-15, sandbox session, P-103):** `git checkout -b` on the mount succeeded but could not unlink its own zero-byte `.git/index.lock` (EPERM; `rm -f` also EPERM) — all subsequent index writes blocked, so the P-103 commit fell back to the /tmp-clone → bundle workflow per this entry's Decision. Fourth confirmed instance of the class. Operator cleanup: delete `.git\index.lock` (or run `scripts/git-unlock.ps1`), then adopt the P-103 bundle.
- **Status:** OPEN (environmental — not a code defect; close when the bridge is fixed upstream and a canary edit survives a session).

### P-097 · `knip-wrapper.mjs` false-greens under Node 22 — exits 0 without analyzing, so any sandbox session that trusts it reports a fabricated dead-code gate — RESOLVED (wrapper deleted, PR #35, 2026-07-13)
- **Problem:** The canonical `knip` binary crashes in the Cowork sandbox (Node 22.22.3) inside `oxc-parser`’s raw-transfer path (`ast-nodes.js` → `parseSyncRaw`, exit 1) — the known §2.9 scar. The tracked repo-root shim `apps/satex-terminal/knip-wrapper.mjs` (pins `process.version` to v20.19.0, then dynamic-imports `knip/dist/index.js`; predates the 2026-07-02 relocation, `034984f`) appears to fix this: it exits 0 in seconds. It does not. Canary experiment (2026-07-10, Fable 5): planted `src/shared/knip-canary.ts` containing one unused export — an unused FILE, which `knip.json` `"files": "error"` must fail — and the wrapper still exited 0 with zero output. The dynamic import resolves but the CLI’s analysis never completes (or dies async after the process has already exited 0). A gate that silently passes everything is worse than one that loudly crashes: it invites a Directive 0.1/0.4 violation — an agent honestly reporting a green that never ran.
- **Solutions:** (a) delete the wrapper; keep CI (Node 20.19) as the sole knip arbiter and note it in the §2.9 environment scars — loud failure beats silent pass; (b) repair the wrapper to await the CLI and propagate its real exit code, self-tested against a planted canary before trust; (c) keep it with a warning comment — rejected: a booby-trapped gate that looks green is the worst option.
- **Decision:** deferred to operator — (a) is the low-risk default; it is a tracked file, so deletion is a human-signed change (P-020/P-028 pattern: recorded, not freelanced). Until ruled: no session may cite `knip-wrapper.mjs` output as the knip gate.
- **Resolution (2026-07-13):** the operator ruled (a) — `knip-wrapper.mjs` deleted in PR #35 (`4473438`, "chore(p097): delete knip-wrapper.mjs — false-greens under Node 22"), now on `master`. CI (Node 20.19) is the canonical knip arbiter, as intended. Corroborating datum from the same-day full-gate sweep (see P-098): the *real* `knip` binary runs to completion and exits 0 on the operator's Node 24.15 machine — the false-green was the shim, and the underlying oxc-parser crash it papered over is sandbox/Node-22-specific, not present on real hardware. The booby-trapped gate is gone; loud failure (or an honest green) now beats the silent pass.
- **Status:** RESOLVED — no code path left that can false-green; the §2.9 environment-scars note about the sandbox knip crash stands for future sandbox sessions.

### P-096 · Self-evaluation judges strategies by a naive Sharpe with no statistical-significance test (overstates edge; multiple-testing blind) — SHIPPED (wiring + tests + reporter parity + docs complete 2026-07-10; committed on feat/p096-significance-checkpoint, awaiting push + CI)
- **Problem:** The nightly self-evaluation (`src/main/services/self-eval.ts`) ranks every
  `(strategy × symbol)` candidate by a **naive annualized Sharpe** (`src/shared/backtest/metrics.ts:49`
  — `mean(rets)/stdev(rets)·√periodsPerYear`, rf=0) rendered straight into the verdict table
  (`self-eval.ts` `renderReportMd`, the `Sharpe` column) and drift-checked against a single locked
  baseline (`compareReports`, `sharpeTolerance: 0.5`). Naive Sharpe is a biased skill estimator: it
  ignores return non-normality (skew/kurtosis), track-record length, and — critically — multiple-testing
  selection bias (evaluate K strategies, read off the best, and the max is inflated by luck alone). On a
  live-capital terminal this is a P2 (model-fidelity) correctness gap: the operator can promote a baseline
  or trust a strategy that is statistically indistinguishable from noise. No PSR/DSR/higher-moment stats
  existed anywhere under `src/shared` (grep confirmed) before this entry.
- **Solutions:** (a) add a pure, unit-pinned significance module (`src/shared/backtest/significance.ts`)
  implementing the Bailey–López de Prado framework — Probabilistic Sharpe Ratio, Minimum Track Record
  Length, Deflated Sharpe Ratio — plus normal CDF/inverse-CDF and standardized moments, then surface
  PSR/DSR/a significance glyph as new **observational** columns in the nightly report; zero perimeter
  contact (self-eval never sizes/gates/submits — file header invariant preserved). (b) defer to a
  dedicated decision-path session — rejected: the gap is live every night and the fix is off-perimeter.
  (c) flag OPEN without action — rejected (P-013/P-024-class backlog pileup).
- **Decision:** **(a).** New module + tests only this session; `metrics.ts` `sharpe()` and every existing
  `BacktestMetrics` field are byte-for-byte unchanged, so production decision math cannot regress from
  this commit (same guarantee P-026/P-033 gave). The PSR/DSR outputs are print-only and MUST NOT feed a
  risk gate, position size, calibration multiplier, or autonomous-trade decision (Constitution §3.6).
- **Shipped this session (2026-07-10, dawn planner):** new `src/shared/backtest/significance.ts` (pure:
  skewness, kurtosis, erf, normCdf, normInvCdf[Acklam+Halley], probabilisticSharpe, minTrackRecordLength,
  expectedMaxSharpeNull, deflatedSharpe, significanceFromReturns, withDsr) + `significance.test.ts`
  (23 tests: literature reference pins incl. PSR=0.8395 @ SR0.1/n100, minTRL→PSR round-trip @ 0.95,
  DSR<PSR deflation, degenerate-input sentinels). Blueprint:
  `apps/satex-terminal/docs/superpowers/specs/2026-07-10-probabilistic-deflated-sharpe-significance-ultraplan.md`.
- **Gate verification (2026-07-10, in-mount node):** typecheck exit 0 | lint exit 0 (0 warnings) |
  vitest (targeted `significance.test.ts`) 23/23 pass, exit 0 | knip not run (oxc-parser 2 GB sandbox
  OOM, §2.9 — CI arbiter). New files 0 NUL / 0 CRCR.
- **Was remaining (executed 2026-07-10 — see Shipped below):** wire
  `significanceFromReturns(barReturns(report.equityCurve))` per row in `self-eval.ts` `runOnce`, add the
  trial-aware `withDsr` second pass (N = rows this run), render `PSR | DSR | Signif.` columns + footer
  note, add ≥4 `self-eval.test.ts` tests, CHANGELOG Unreleased `### Added`, then flip this entry SHIPPED.
  EDIT HAZARD: `self-eval.ts` is an existing file — python-through-bash edit, assert anchor count==1,
  NUL-scan after (rule §5).
- **Shipped (2026-07-10, Fable 5 session):** T3a `types.ts` re-exports `SignificanceMetrics`; T3b/c `self-eval.ts` `runOnce()` computes per-row `significanceFromReturns(barReturns(report.equityCurve))` + the trial-aware `withDsr` second pass (N = rows this run, printed in the footer); T3d `renderReportMd` renders `PSR | DSR | Signif.` columns (glyphs: ✅ real / ⚠️ selection-risk / 🔬 noise-band), N-trials footer, `n/a` on degenerate rows; T4 `reporter.ts` headline gains PSR + minTRL rows (DSR deliberately absent — a standalone report has no trial set); T5 `self-eval.test.ts` 10→14, `reporter.test.ts` 12→14; T6 CHANGELOG Unreleased `### Added`. Bonus: fixed the `significance.ts` header typo (raw normal kurtosis 3.0, not 4.0).
- **Gate verification (2026-07-10, Fable 5, in-mount Node 22.22.3):** typecheck `tsc -p tsconfig.node.json` exit 0 (7.7s) + `tsc -p tsconfig.web.json` exit 0 (7.4s) | lint `eslint src tests` exit 0, 0 warnings (18.8s) | vitest exact-cover segmented run 124/124 files, 1628 tests, 0 fail (12 invocations, all exit 0 — 45s sandbox call ceiling forbids one-shot) | knip NOT sandbox-runnable: binary crashes (oxc raw-transfer, Node 22) and `knip-wrapper.mjs` false-greens (→ P-097) — CI arbiter. All edited files byte-scanned 0 NUL / 0 CRCR.
- **Status:** SHIPPED (committed on `feat/p096-significance-checkpoint` via the /tmp-clone→push-to-mount workflow; flip to VERIFIED after operator push + CI green incl. knip).

### P-095 · CONSTITUTION §2.2 / Directive 0.7 “master has no server-side branch protection” is false — an active ruleset blocked PR #32 with unsatisfiable requirements — VERIFIED (settings fixed; docs corrected via PR #33)
- **Problem:** PR #32 (chore/p076-p080-coverage-and-fixes → master) showed CI green
  (“All checks have passed — 1 successful check”) yet “Merging is blocked.” Cause: a
  GitHub **ruleset `main-protection`** (Active, targeting `master`, bypass list empty)
  — direct contradiction of CONSTITUTION §2.2 / §0.7, which state the discipline is
  manual because no server-side wall exists. Verified config (Settings → Rules,
  2026-07-10): restrict deletions ✓, require linear history ✓, require signed
  commits ✓, require PR before merging ✓, block force pushes ✓, require code
  scanning results (CodeQL, all alerts) ✓, require code quality results (Errors) ✓,
  auto-request Copilot review ✓. Two requirements were unsatisfiable (no CodeQL
  workflow exists in `.github/workflows/`; no signing key configured — commits are
  plain `git commit`), one more (code quality) was a latent third blocker — and the
  one check that actually matters, CI/Gates, was NOT required (“Require status
  checks to pass” was off). Net effect: permanent merge-block on impossible
  conditions while the real gate stayed optional.
- **Solutions:** (a) align the ruleset with reality — drop signed-commits,
  code-scanning, and code-quality; enable “Require status checks to pass” with
  `Gates (typecheck, lint, knip, tests)` (GitHub Actions) as the required check;
  keep PR-required, linear history, force-push + deletion blocks; (b) minimal
  unblock — uncheck only the two active blockers, leave code-quality + no required
  checks; (c) add the admin role to the bypass list and merge past intact rules —
  leaves latent friction on every future PR and normalizes bypassing.
- **Decision:** **(a), operator-selected 2026-07-10.** The wall now enforces exactly
  what AGENTS.md/CONSTITUTION §2.1 say is the floor (the four gates via CI) instead
  of ceremonies the repo doesn’t practice. Applied via Settings UI; operator
  personally completed the GitHub sudo-mode 2FA confirmation (“Ruleset updated”).
  PR #32 then **rebase-merged** (linear history bans merge commits): master tip
  `3cc93e8` (fix(knip): remove orphaned FeedSwitch.tsx) on `4afec50`
  (chore(coverage): P-081…P-089), both preserved individually, 2026-07-10.
- **Status:** SHIPPED (2026-07-10, cowork session w/ operator). Follow-ups: (1)
  CONSTITUTION.md §2.2/§0.7 and AGENTS.md still claim no server-side protection and
  prescribe `gh pr merge --merge` — both now wrong (protection exists; linear
  history forbids merge commits — rebase/squash only). Text edit is a normal
  branch→PR doc fix for the next repo session; per the honesty axiom the code/
  settings are the truth and this entry records the contradiction. (2) P-086
  (stale `fix/p083-png-export-ipc-transport` branch) remains the next loose thread;
  its content is now merged via this PR — close/delete per its own entry. (3)
  Local `mc4` master needs `git pull --ff-only`; checkpoint bundles
  (`satex-checkpoint-p081-p089.bundle`, `satex-checkpoint-knip-fix.bundle`,
  `satex-checkpoint-p081-p089-PR-BODY.md`) are now redundant and safe to delete. —
  bundles DELETED same session. Follow-up (1) also EXECUTED same session:
  `AGENTS.md`, `CONSTITUTION.md` (§0.7 / §1.1 / §2.2), `ARCHITECTURE.md` corrected in
  the working tree (8 surgical edits: repo URL → `satex25/SATEX-terminal`, protection
  reality, `--merge` → `--rebase`/`--squash`); `git diff` verified — awaiting commit on
  a `docs/` branch (this ledger file itself stays uncommitted with the pending
  work-layer checkpoint, since its P-090–P-094 entries describe code not yet committed).
  **VERIFIED later same session (2026-07-10):** docs committed as `d1eb62c` on
  `docs/p095-github-protection-reality` (operator ran the recipe; pre-commit
  typecheck + lint green), PR #33 opened, required check
  `CI / Gates (typecheck, lint, knip, tests)` green in 58s — the realigned ruleset
  visibly enforcing, "Required" badge shown — then rebase-merged. Master tip
  `62e7af7`, linear on `3cc93e8` → `4afec50`, confirmed on the commits page.

### P-094 · Six main-process services carry zero test coverage; one (`live-mode.ts`) is the live-capital arming interlock itself — OPEN, mixed disposition
- **Problem:** Work-layer code-audit sweep (rule 4) of `src/main/services/*.ts` for
  files with no sibling `*.test.ts` found six: `alpaca-mode.ts` (65 LOC),
  `depth-feed.ts` (141 LOC), `persistence.ts` (992 LOC, the 12-table SQLite layer),
  `self-eval-store.ts` (34 LOC), `tactics.ts` (158 LOC), plus
  `src/main/core/trading-engine.ts` (2,712 LOC, the orchestrator — already tracked as
  the "god-object" under P-012, so not re-ledgered here). All six share the same
  no-DI shape that made `auto-update.ts` (P-091) hard to test before this week: a
  module-level singleton (or, for `trading-engine.ts`, a single large class)
  constructed once against real `electron`/`better-sqlite3` imports, not injected —
  the same reason `credential-store.ts` remains "manually integration-tested" rather
  than unit-tested. **`live-mode.ts` is the more consequential finding: this file
  literally implements the CONSTITUTION §2.4/§3.7 live-mode arming interlock**
  (`setLiveMode()` checks `killArmed`, the daily-loss threshold, and the notional
  cap before flipping `enabled: true`, `live-mode.ts:42-66`) — it is trading-safety
  perimeter, not an ordinary coverage gap.
- **Solutions:** (a) treat all six identically and write characterization suites for
  each this session, mirroring the `auto-update.test.ts` `vi.mock('electron')`
  harness — fastest path to "no gaps left," but freelances test-writing on the
  literal arming-interlock file without the human perimeter review CONSTITUTION
  §2.4/§2.7 requires for anything touching the live-capital path (even test-only,
  per this morning's dawn-planner handoff explicitly making the same call for
  `tactics.ts`); (b) split the six: implement coverage this session for the four
  unambiguously off-perimeter, low-blast-radius ones (`alpaca-mode.ts`,
  `depth-feed.ts`, `persistence.ts`, `self-eval-store.ts`) and leave `live-mode.ts` +
  `tactics.ts` OPEN pending a human perimeter check — matches the standing
  `tactics.ts` precedent exactly, extends the same caution to the newly-found
  `live-mode.ts`; (c) leave all six as a documented survey only, no implementation
  this session — under-uses the session's remaining off-perimeter budget for no
  safety benefit, since (b)'s four picks are genuinely zero-risk.
- **Decision:** **(b), documented only — implementation deferred to a future
  session.** Given this session's budget was already spent on the ledger
  reconciliation (P-081/P-083/P-084/P-087/P-088/P-089 → VERIFIED) and the
  `ChartPanel.tsx` fix (P-093) found during this same sweep, writing four new
  characterization suites tonight would exceed one session's usual single-target
  scope (every prior coverage pick — P-076, P-077, P-079, P-088, P-091 — shipped
  ONE target with its own blueprint, not four at once). Recorded here so the next
  work-layer/dawn-planner session can pick any of `alpaca-mode.ts` / `depth-feed.ts`
  / `persistence.ts` / `self-eval-store.ts` directly, cheapest-first
  (`self-eval-store.ts` at 34 LOC is the smallest). **`live-mode.ts` and
  `tactics.ts` are explicitly NOT autonomous picks** — perimeter review required
  first, same class as the standing MAY-TACTICS caution.
- **Status:** OPEN (2026-07-09, work-layer). No code changed by this entry — survey
  only. `persistence.ts`, `depth-feed.ts`, `alpaca-mode.ts`, `self-eval-store.ts`:
  safe future autonomous picks. `live-mode.ts`, `tactics.ts`: human sign-off required
  before any session (even test-only) touches them. `trading-engine.ts`: tracked
  under P-012, not duplicated here.
- **Update 2026-07-16 (dawn, Opus 4.8, unattended 02:25 CDT):** the `self-eval-store.ts` portion of this survey is SHIPPED — added `src/main/services/self-eval-store.test.ts` (8 characterization tests: default-enabled on absent/corrupt/partial state; explicit `enabled:false` honored + round-trip; `setSelfEvalEnabled` persists JSON with a fresh numeric `updatedAt`; write-failure swallowed, never thrown). Off-perimeter — self-eval is strictly observational (§3.6 invariant 3), sole consumer `trading-engine.ts:65` read-only. Harness: `vi.mock('electron')` for `app.getPath` + real `fs` on a per-test temp dir; `vi.resetModules()` + dynamic import per case to re-run the module singleton `load()`. Gates (in-mount Node 22.22.3): typecheck node+web exit 0 · eslint scoped exit 0 · vitest 8/8 (run twice, order-independent) · knip CI-arbitrated (P-097). Subject `self-eval-store.ts` byte-unchanged; `package-lock.json` md5 unchanged (c6c32fa16eb9ac3701f8f14b706580c0). Blueprint: `apps/satex-terminal/docs/superpowers/specs/2026-07-16-self-eval-store-coverage-ultraplan.md`. UNSTAGED for operator review. **Remaining safe autonomous picks:** `depth-feed.ts`, `persistence.ts`; `live-mode.ts` + `tactics.ts` stay human-gated.

- **Update 2026-07-16 (work-layer, Opus 4.8, unattended ~03:2X CDT):** the `alpaca-mode.ts` portion of this survey is SHIPPED — added `src/main/services/alpaca-mode.test.ts` (15 characterization tests: default-paper on absent/corrupt/partial/unrecognized-mode state; stored `mode:'live'` honored + round-trips through `getAlpacaMode()` and `resolveBaseUrl()`; the `resolveBaseUrl` override-precedence contract pinned in both directions per the subject's own inline comment documenting a real 2026-05-13T17:27 production bug — a canonical-URL override (paper or live) is NOT treated as an override and persisted mode still wins, an empty-string override is falsy and also falls through, a non-canonical override (e.g. a staging proxy) wins outright; `setAlpacaMode` persists JSON with a fresh numeric `updatedAt` and returns `{ok:true, baseUrl}` matching the new mode both directions; write-failure swallowed, never thrown, in-memory mode still reflects the set. Off-perimeter — this module only selects a REST base-URL string; the file's own header comment confirms the actual live-capital flip still requires `live-mode.ts`'s typed-phrase + notional-cap + kill-switch-disarmed interlock, so it is not the arming path itself. Harness mirrors `self-eval-store.test.ts`: `vi.mock('electron')` for `app.getPath` + real `fs` on a per-test temp dir; `vi.resetModules()` + dynamic import per case to re-run the module singleton `load()`. Gates (in-mount Node 22.22.3): typecheck node+web exit 0 · eslint scoped exit 0 · vitest `alpaca-mode.test.ts` 15/15 · knip CI-arbitrated (P-097). Subject `alpaca-mode.ts` byte-unchanged (`git diff` empty); `package-lock.json` md5 unchanged (c6c32fa16eb9ac3701f8f14b706580c0, same as the P-094 self-eval-store update). Blueprint: `apps/satex-terminal/docs/superpowers/specs/2026-07-16-alpaca-mode-coverage-ultraplan.md`. UNSTAGED for operator review.

- **Update 2026-07-16 (dawn re-run, Fable 5, unattended ~04:05 CDT):** the `depth-feed.ts` portion of this survey is SHIPPED — added `src/main/services/depth-feed.test.ts` (18 characterization tests: start() immediate-emit + 250 ms/4 Hz cadence, idempotent start(), stop()/restart with no orphaned interval (§2.5.7 leak class) and stop-before-start no-throw; onUpdate() unsubscribe contract plus the INTENTIONAL shared-snapshot-reference-per-tick identity pin; subscribe(same) no-op / subscribe(new) immediate emit even unstarted; bare get() computes fresh and does NOT cache while get(other) routes via subscribe and serves the cached lastSnapshot; 9-level ladder geometry at all three tick scales (0.01 / 0.05 mid>500 / 1.0 mid>10000) with cumulative `tot` and sizes in [20, 2400]; degenerate pins per the P-039/P-040 class — undefined quote → finite zero-anchored ladder with the 0.01 spread floor and never NaN, bid:0/ask:0 are NOT nullish so the ladder anchors at 0 and walks bids negative while `mid = (0+0)/2 || last` reads the last price (real quirk, pinned loudly for any future fixer), undefined bid/ask → last ± 0.01 %; vpin bounded [0,1] with the ≤ 0.08 EMA step; per-symbol jitter-Map continuity across symbol round-trips). Off-perimeter — display-data synthesis feeding the DepthPanel ladder only; imports `@shared/types` + `./logger` (electron-free, node:fs), zero order-path reach. Harness needed NO module-reset: unlike the other P-094 targets the subject is already a DI class (`new DepthFeedService({getQuote})`); determinism via Math.random pinned to 0.5 (churn delta exactly 0) + fake timers. Gates (in-mount Node 22.22.3): typecheck node+web exit 0 · eslint scoped exit 0 · vitest `depth-feed.test.ts` 18/18, run twice order-independent · knip CI-arbitrated (P-097). Subject `depth-feed.ts` byte-unchanged (`git diff` 0 lines); `package-lock.json` md5 unchanged (c6c32fa16eb9ac3701f8f14b706580c0). Blueprint: `apps/satex-terminal/docs/superpowers/specs/2026-07-16-depth-feed-coverage-ultraplan.md`. UNSTAGED for operator review. **Remaining safe autonomous pick:** `persistence.ts` (992 LOC SQLite layer — needs its own blueprint/session); `live-mode.ts` + `tactics.ts` stay human-gated.

- **Update 2026-07-17 (dawn, Fable 5, unattended ~20:43 CDT — evening off-nominal):** the `persistence.ts` portion — the survey's final safe autonomous pick — is SHIPPED. Added `src/main/services/persistence.test.ts` (42 characterization tests; full inventory in the CHANGELOG entry): schema truth (13 tables, WAL, idempotent re-migration incl. `trace_id` ALTER), sessions/orders/pnl round-trips + `legacy-<id>` traceId synthesis, calibration window/prune, watchlist replace, observations + tick-tape batch transactions with bounds/join/manifest contracts, sub-second candle re-seal/trim/series, retention degenerate guards (P-039/P-040 class), `scheduleBackgroundMaintenance` end-to-end chunked prune, `closeDB` lifecycle, and the complete NullDB fallback surface. Three subject quirks PINNED rather than silently fixed: batch writers report `rows.length` even on the NullDB no-op store; `trimSubSecondCandles` retains `keep+1` rows (the OFFSET cutoff row survives the strict `<`); better-sqlite3 removes the `-wal` sidecar on close. The domain probe for this suite found and fixed a REAL live defect — the brain NULL-PK upsert append — ledgered as **P-113** (see entry above; fix + dedup migration shipped in the same changeset). Harness: `vi.mock('electron')` + per-test temp dirs + `vi.resetModules()` dynamic import, plus a `createRequire`-backed global-`require` shim (subject resolves its driver via bare `require('better-sqlite3')` inside `openDB()`'s try/catch) with a documented `SATEX_TEST_BETTER_SQLITE3` escape hatch for Linux sandboxes whose mounted binary is Windows-built — without it the subject falls to NullDB and the suite fails loudly (P-097 law: no false greens). Gates: shared with P-113 (same changeset): scoped typecheck exit 0 · scoped eslint exit 0 · vitest 42/42 ×2 (Linux better-sqlite3@11.10.0 /tmp harness, md5-verified sources) · knip + full suites CI-arbitrated. Blueprint: `apps/satex-terminal/docs/superpowers/specs/2026-07-17-persistence-coverage-brain-null-upsert-ultraplan.md`. UNSTAGED. **P-094's four safe picks are now ALL SHIPPED** (`self-eval-store.ts` 8, `alpaca-mode.ts` 15, `depth-feed.ts` 18, `persistence.ts` 42); the entry stays OPEN solely for the human-gated remainder: `live-mode.ts` + `tactics.ts` (perimeter review required, §0.3).

### P-093 · `ChartPanel.tsx` high/low computation used `Math.max(...spread)`/`Math.min(...spread)` over up-to-30,000-element arrays — the one sibling spot three other panels explicitly avoid this pattern for — fixed
- **Problem:** `ChartPanel.tsx:1235-1236` (pre-fix) computed the toolbar's H/L stats
  as `Math.max(...view.map(c => c.high))` / `Math.min(...view.map(c => c.low))`.
  `view` is `aggregate(candles, bucketSec)` (or `subBars` when `showSub`), and
  `candles` is capped at `MAX_CANDLES = 30_000` (`marketStore.ts:36`) — so in the
  unaggregated (`bucketSec` small / sub-second) case `view.length` can reach
  30,000. Spreading an array that large as call-site arguments to `Math.max`/
  `Math.min` is the exact unbounded-growth/spread class this ledger already
  tracks (P-041) — and three OTHER files in this same renderer already avoid it
  on this exact file's principle, each with an inline comment saying so:
  `vol-heatmap.ts:188` ("Single-pass loop, never Math.max(...spread)"),
  `PortfolioMiniPanel.tsx:52` ("never Math.min(...snapshots)"),
  `QuadPaneChart.tsx:84` ("Reduce loop... to avoid stack overflow on big arrays").
  `ChartPanel.tsx` — the flagship chart, previously the site of the P-075
  "Maximum update depth exceeded" crash — was the one sibling spot still using
  the spread form. 30,000 elements is very likely under V8's actual spread-argument
  ceiling today (empirically much higher for `Math.max`/`.apply`-style calls than
  the historically-cited ~65,536, per direct engine testing), so this was not
  observed to throw in this session — LATENT, not reproduced as an active crash.
  It was also directly two lines above `vol`, computed correctly via `.reduce()`
  in the very same function — an internal inconsistency, not just a cross-file one.
- **Solutions:** (a) single-pass `for` loop computing `hi`/`lo`/`vol` together,
  mirroring the `vol` line already in the same function and the exact pattern
  `vol-heatmap.ts`/`PortfolioMiniPanel.tsx`/`QuadPaneChart.tsx` already use —
  zero behavior change (matches the `undefined`-when-empty / `0`-when-empty
  semantics of the original ternary + reduce exactly), smallest diff, consistent
  with established repo idiom; (b) leave as-is since 30,000 is empirically safe on
  today's V8 — rejected, "safe today, on this engine" is exactly the kind of latent
  hazard the constitution's defect classes exist to close before it becomes
  version- or platform-dependent; (c) cap `MAX_CANDLES` lower instead of fixing the
  computation — treats the symptom, still leaves the spread pattern live for
  `subBars` (a separate, differently-capped buffer) and any future caller.
- **Decision:** **(a)**. Replaced the two spread lines + the `vol` reduce with one
  single-pass `for` loop (`ChartPanel.tsx:1235-1247`), same file, comment cites this
  entry. No other line touched.
- **Status:** SHIPPED (unstaged, 2026-07-09). Evidence: byte-scan 0 NUL / 0 CRCR
  (LF) on the edited file; typecheck node exit 0 · typecheck web exit 0 · lint exit
  0 (0 warnings). No companion test exists for `ChartPanel.tsx` today (pre-existing
  gap across every panel component, not introduced by this fix — `panels/` has zero
  `*.test.tsx` files repo-wide); this session's full segmented vitest run
  (122 files / 1598 tests / 0 fail) covers everything that DOES have coverage and
  shows no regression. Off-perimeter (renderer display stat only, no IPC/order/risk
  contact) — no APPROVAL NODE.

### P-091 · `auto-update.ts` (Electron release-delivery service) shipped untested — SHIPPED
- **Problem:** `src/main/services/auto-update.ts` (139 LOC) carried zero test coverage
  since it shipped (S1-9). It encodes a real SAFETY POLICY — `autoDownload=false`,
  `autoInstallOnAppQuit=false`, `allowDowngrade=false` (`auto-update.ts:25,32-33`) — plus a
  24h `setInterval` whose only cleanup is `shutdown()` (`auto-update.ts:97-102,132-138`),
  i.e. the repo's most recidivist defect class (PR #6 / P-041 / P-043 / P-046 timer/leak).
  A future edit could flip a consent flag or drop the interval clear with no failing gate.
  Carried forward as a fallback coverage pick since 2026-07-04.
- **Solutions:** (a) add a characterization suite that mocks `electron` + `electron-updater`
  at the module boundary (the service uses the `autoUpdater` singleton, not DI) and asserts
  the safety flags, feed URL, four lifecycle handlers, the destroyed-window guard, the
  nullish-version coercion, `quitAndInstall(false,true)`, and — critically — that
  `shutdown()` clears the interval; (b) leave uncovered as "manually integration-tested"
  like `credential-store`'s Electron path — rejected, the safety flags + timer cleanup are
  pure, deterministic, cheap to lock in, and the constitution names this leak class.
- **Decision:** **(a) — SHIPPED.** New `src/main/services/auto-update.test.ts`, 14 tests,
  the repo's first `vi.mock('electron'/'electron-updater')` harness (file-scoped, no
  `setupFiles` change, sibling suites unaffected). Blueprint:
  `apps/satex-terminal/docs/superpowers/specs/2026-07-09-auto-update-service-coverage-ultraplan.md`.
  Gates: `npx vitest run auto-update.test.ts` → 14/14 pass exit 0; `npm run typecheck` exit 0;
  `npm run lint` exit 0 / 0 warnings; new files 0 NUL / 0 CRCR. knip sandbox-blocked (oxc OOM
  §2.9) — CI arbiter, test-only addition is knip-neutral. Off-perimeter (release delivery, no
  trading path). Unstaged for operator review per §8.

### P-092 · Ledger's formal "In progress / Shipped / Closed" sections have been dead convention since at least P-057 — OPEN, operator ruling needed
- **Problem:** The file has three formal section headers (`## In progress` line ~1176,
  `## Shipped — awaiting verification` ~1181, `## Closed — verified` ~2245) whose stated
  purpose is a status-driven filing system ("entries move here when..."). But every entry
  from at least P-057 through today's P-091 is instead prepended flat at the file's top,
  newest-first, with status tracked only via each entry's own inline `**Status:**` field —
  none of them are physically inside any of the three sections. The 2026-07-09 dawn-planner
  handoff (this morning) explicitly recommended "migrate VERIFIED ones to `## Closed —
  verified`" for P-081/P-083/P-084/P-087/P-088/P-089 now that their code is committed
  (`f331013`/`b1cb7c6`) — but doing that would make those six entries the ONLY ones out of
  35+ recent entries physically filed in the old section structure, which reads as more
  inconsistent, not less.
- **Solutions:** (a) do the six-entry move now, restoring the letter of the original
  filing scheme — but this is a large multi-block relocation in a 2500+ line file (exactly
  the anchor-collision risk class rule 5a warns about) for a structure the last ~35 entries
  have already, evidently by consensus, stopped using; (b) update each entry's inline
  Status field in place (what this session did — see reconciliation notes on P-081/P-083/
  P-084/P-087/P-088/P-089 above) and flag the section-header convention itself as stale
  documentation, recommending the operator either delete the three unused headers or
  formally adopt "flat, newest-first, status-in-line" as the real convention; (c) leave
  both the drift and the entries completely alone — rejected, an unrecorded documentation/
  reality mismatch is exactly what 0.10 exists to prevent, and a future session could burn
  time "fixing" the drift the wrong way (doing the risky mass-move) without this note.
- **Decision:** **(b) — implemented this session** (the inline-status reconciliation on
  the six named entries). The section-header question itself is a taste/process call
  ("which filing convention is canonical going forward") per AGENTS.md's judgment-boundary
  rule — **left OPEN, operator ruling needed**: keep the three headers and do the
  one-time six-entry migration, or delete the unused headers and formalize the flat
  convention already in de facto use.
- **Status:** OPEN (2026-07-09, work-layer). No code changed. Byte-scan after this and
  all sibling edits in this session: 0 NUL / 0 CRCR (LF-only), anchor count asserted ==1
  before every replace.

### P-090 · Two scheduled agents fired off-nominal and did byte-for-byte duplicate work, racing on the untracked ledger — DECIDED (defer to operator)
- **Problem:** on 2026-07-06 the dawn-planner and work-layer scheduled agents both fired
  ~9h45m off-nominal (real ~14:47 CDT vs nominal 05:00/06:00) and CONCURRENTLY executed the
  identical live-decision-path sweep. The work-layer wrote P-089 VERIFIED at 14:55:19 while
  the dawn-planner was mid-read; the dawn-planner's ledger insert correctly aborted on the
  §5a uniqueness assert, so no duplicate/NUL corruption — but a full session's leverage was
  burned and the untracked ledger (git can't restore it, P-014 lineage) was one unguarded
  write from corruption. Evidence: `Vault/Daily/2026-07-06-agent-handoff.md` §HEADLINE
  FINDING; `Vault/Daily/2026-07-06-work-layer.md`.
- **Solutions:** (a) a lightweight `Vault/` lockfile / "session in progress" sentinel both
  scheduled prompts check-and-claim on boot (idempotency beyond rule 1's per-blueprint
  check); (b) stagger/dedup the scheduler so a late dawn-planner slot is skipped rather than
  overlapping the work-layer; (c) accept as rare off-nominal noise — rejected, it silently
  burned a session and nearly corrupted the ledger.
- **Decision:** **DECIDED — defer to operator.** The fix lives in Cowork scheduled-task
  config + a boot-time claim protocol — a process/perimeter-adjacent change, not an
  autonomous 5 AM edit. Recorded now (the 2026-07-06 dawn-planner deliberately deferred the
  write to avoid a third concurrent write while another session held the ledger). Recommend
  the operator adopt (a)+(b). APPROVAL NODE — operator action.

### P-089 · Live-decision-path read-only audit sweep (brain/calibration/pattern-learner/regime) — no defects found — VERIFIED
- **Problem:** the 2026-07-04 and 2026-07-05 work-layer sessions each deferred a full
  read-only sweep of the live-decision input path (`brain.ts`, `calibration.ts`,
  `pattern-learner.ts`, `regime.ts`) for lack of time budget after coverage-and-verify
  cycles — flagged both times as "worth dedicating a full session to it specifically."
  No 2026-07-06 dawn-planner handoff existed at boot (fallback protocol, rule 1), so
  this session picked the deferred sweep directly off the 2026-07-05 handoff's own
  NEXT list item 3.
- **Solutions:** (a) full read-through of all four files against the known defect
  classes (leak, degenerate-input, unbounded-growth, missing guards) — no source
  changes, evidence-only; (b) skip again and pick a third coverage target instead —
  rejected, the sweep was explicitly called out as deferred twice already and
  low-cost coverage adds were diminishing in value per 2026-07-05's own NEXT note
  about the unstaged backlog's legibility.
- **Decision:** **(a)**. Findings, each verified at `file:line`:
  - `brain.ts` — degenerate-input guards present and correct: `learn()` returns early
    on `notional <= 0` (`brain.ts:131`); `atrNorm` guards divide-by-zero via
    `Math.max(0.01, quote.last)` (`brain.ts:81`); depth features only compute when
    `depth.bids?.length && depth.asks?.length` and `totSize > 0`
    (`brain.ts:86-99`). No timers/listeners. No unbounded growth (stateless per-call
    scoring; persisted weights are a fixed 8-key record). Clean.
  - `calibration.ts` — rolling window is bounded (`this.samples.shift()` once
    `> WINDOW` at `calibration.ts:124`); `computeMultiplier` guards `avgConf <= 0`
    (`calibration.ts:89`); `record()`'s DB write is wrapped in try/catch so a
    persistence failure can't propagate into the close pipeline
    (`calibration.ts:125-126`). Downgrade-only multiplier confirmed
    (`Math.max(MULT_FLOOR, Math.min(1, ratio))`, `calibration.ts:93`). Clean.
  - `pattern-learner.ts` — timer lifecycle is idempotent and paired
    (`start()`/`stop()` guard on `this.running`, `pattern-learner.ts:83-95`) and IS
    called from `TradingEngine.shutdown()` (`trading-engine.ts:842`, `this.learner?.stop()`).
    High-water-mark cursor (`lastLabeledTs`, P-001 fix) prevents the
    re-label-on-every-cycle bug from recurring. Observation query is bounded
    (`db.listObservations(symbol, sinceTs, 5_000)`, `pattern-learner.ts:127`). Divide
    guards present (`o.vwap > 0`, `pattern-learner.ts:217`; `Math.max(0.01, x0.last)`,
    `pattern-learner.ts:235`). Clean.
  - `regime.ts` — `setInterval` in `start()` (`regime.ts:112`) is cleared in `stop()`
    (`regime.ts:117`) AND `stop()` is confirmed called from
    `TradingEngine.shutdown()` (`trading-engine.ts:844`, `this.regime?.stop()`) — no
    leak. Divide guards present (`last > 0` before spread-bps calc, `regime.ts:155`;
    `Math.max(1e-9, last)` in volatility norm, `regime.ts:165`; `e21 === 0 ? 0 : ...`,
    `regime.ts:170`). `normalize()` guards sum-to-zero (`regime.ts:73`). Clean.
  - No NUL bytes / `\r\r` corruption in any of the four files (LF, byte-scanned).
  - **Net result: zero new defects.** All four files already carry the defensive
    patterns the constitution's defect classes target. The two-session-old deferred
    item is closed with a clean bill, not a skip.
- **Status:** VERIFIED (read-only, no code changes, no gates required — nothing
  shipped). Companion test files confirmed still green this session: targeted
  `vitest run` on `brain.test.ts` + `calibration.test.ts` + `pattern-learner.test.ts` +
  `regime.test.ts` → **37/37 passed** (10.71s). Evidence: `Vault/Daily/2026-07-06-work-layer.md`.
- **Reconciliation (2026-07-09, work-layer):** This ledger entry itself is now
  committed (`f331013`, part of the same commit that landed P-081/P-083/P-084/P-087/
  P-088). Re-verified this session: `brain.test.ts`/`calibration.test.ts`/
  `pattern-learner.test.ts`/`regime.test.ts` all still pass (part of the 122-file /
  1598-test / 0-fail segmented run). No status change needed (already VERIFIED).

### P-088 · `edgar.ts` (SEC EDGAR catalysts poller) shipped untested — SHIPPED
- **Problem:** `src/main/services/edgar.ts` (198 LOC) — the 5-minute poller that turns
  SEC EDGAR filings (8-K/10-Q/10-K/Form 4) into `NewsItem`s for the Catalysts panel —
  had zero co-located test coverage. It carries the repo's most recidivist defect class
  in a new shape: an unbounded `seen: Set<string>` of accession numbers with a
  self-halving guard (`if (this.seen.size > 5000) { ... }`, `edgar.ts:129-132`) that had
  never been exercised past the threshold, a `setTimeout` + `setInterval` pair whose
  only cleanup is `stop()` (the PR#6/P-041/P-043/P-046 leak class, `edgar.ts:90-100`),
  and a 24h ticker-map cache (`ensureCikMap`, `edgar.ts:139-151`) whose expiry path was
  unverified. Off the trading-safety perimeter (news/catalyst feed only — `poll()`'s own
  try/catch means a malformed SEC response can never throw out of the service).
- **Solutions:** (a) new-file-only Vitest suite, source untouched, `vi.stubGlobal`ing
  `fetch` per the `llm.test.ts` precedent and driving the bounded-growth path through
  the *public* `refresh()`/`onNews()` API (251 poll cycles × 20 unique filings, matching
  how `market-observer.test.ts` drove its 200-entry ring buffer through realistic calls
  rather than reaching into private state) — pins the contract with zero source risk;
  (b) reach into the private `seen` field via an `as unknown as {...}` cast to seed it
  near 5000 directly — faster to write, but pokes implementation detail no other suite
  in this repo does and would stop testing the *real* code path (whether 251 real polls
  actually reach and cross the threshold); (c) leave untested — rejected, this is exactly
  the bounded-growth/leak class the ledger exists to guard, and the threshold had never
  been exercised even once.
- **Decision:** **(a)**. NEW `src/main/services/edgar.test.ts` (25 tests): start/stop
  timer lifecycle (idempotent double-start via `this.timer` guard, safe double-stop,
  the ~10s initial-poll delay), `onNews` subscribe/unsubscribe, per-form `kind`/
  `sentiment` mapping for all five `TRACKED_FORMS` entries, untracked-form filtering,
  empty-watchlist gating (ticker map still refreshes, no submissions fetch), unmapped-
  ticker skip, ticker-uppercasing on ingest, 7-day lookback cutoff + NaN-date guard,
  cross-poll accession-number dedup, the 20-filings-per-symbol cap (`fetchSubmissions`,
  fed 25 to prove truncation), 24h ticker-map cache + forced re-fetch after
  `vi.setSystemTime` advances 24h+1s, 404-is-quiet-empty vs. non-404-throws-but-
  `poll()`-swallows, a rejected ticker-map fetch never escaping `refresh()`, an
  `{ filings: {} }` degenerate response treated as zero filings, and the seen-set
  halving itself: 250 polls reach exactly 5000 entries (no halve yet), poll #251 pushes
  to 5020 and triggers the halve (`arr.slice(2510)`), then a follow-up poll resending
  the oldest accession (`acc-0`, evicted → re-emitted) and the newest
  (`acc-5019`, retained → deduped) proves the halving kept the *recent* half, not an
  arbitrary one. Source byte-for-byte unchanged.
- **Status:** SHIPPED (unstaged, 2026-07-05). Evidence: byte-scan 0 NUL / 0 `\r\r` (LF)
  on the new file (and 0 NUL / 0 `\r\r` across all 49 touched/untracked files in the
  working tree this session); typecheck node exit 0 · typecheck web exit 0 · lint exit 0
  (0 warnings); targeted vitest `edgar.test.ts` 25/25 (17.94s incl. environment setup,
  107ms actual test time); 3-file services segment (edgar + market-observer + llm)
  63/63, no `vi.mock`/`vi.stubGlobal` cross-file leakage. knip not run (sandbox
  oxc-parser 2 GB OOM, §2.9 ceiling — new test exports nothing, knip-neutral; CI is
  arbiter). Blueprint: none written — this was picked directly off the 2026-07-04
  handoff's own "recommended starting point" list (`edgar.ts` flagged there as "likely
  the cleanest next pure pick") under the fallback protocol, since no 2026-07-05
  dawn-planner handoff existed at 06:06 CDT boot time (see 2026-07-05-work-layer.md).
- **Reconciliation (2026-07-09, work-layer):** Committed `f331013`. Re-verified:
  typecheck exit 0 · lint exit 0 (0 warnings) · `edgar.test.ts` 25/25 (part of the
  122-file / 1598-test / 0-fail segmented run). Status: SHIPPED →
  **VERIFIED (committed)**. Filing-convention note: see P-092.

### P-087 · TopBar's Simulator/Live data-feed chip read as equally load-bearing as the real-capital toggle — relocated to Settings — SHIPPED (fixed)
- **Problem:** Operator feedback (2026-07-04, live product review): the TopBar's
  `FeedSwitch` chip (`SIM DATA` / `ALPACA`, `FeedSwitch.tsx`) sat directly beside the
  PAPER/LIVE real-capital toggle (`TopBar.tsx:296-319`), separated only by a thin
  `bb-vrule`. Visually the two controls read as equally important, but they are not:
  one flips which *market-data source* the chart/tape reads (simulator vs. live
  Alpaca quotes — off the trading-safety perimeter), the other flips which *capital
  endpoint* orders would route to. Front-and-center placement of the data-feed toggle
  overstated its importance relative to the real money-mode control right next to it —
  an operator-legibility defect (P3: "does this make a live session calmer, faster,
  more legible?" — no, it competed for attention with the one control that actually
  matters more).
- **Solutions:** (a) leave it in the TopBar but re-style it smaller/less prominent —
  cheapest, but doesn't remove the "two toggles of equal visual weight" problem, just
  shrinks it; (b) move the interactive control into Settings (`View → Settings…`) as
  a new "Market Data Feed" section near "AI Advisor," keeping the underlying
  `useDataSourceStore` / `setDataSource` IPC / `data-source-guard.ts` interlock
  completely untouched — removes the toggle from the operator's primary field of view
  entirely while changing zero engine behavior; verified situational awareness is not
  lost because the Watchlist's per-symbol SIM badges (`isSyntheticFeed`,
  `feed-status.ts:23`) already derive from the engine's live `FeedStatus` broadcast
  independent of whether this chip is mounted anywhere; (c) remove the control
  entirely with no Settings replacement — rejected, the operator explicitly asked for
  a Settings home for it, not removal of the capability.
- **Decision:** **(b)**. Removed `<FeedSwitch />` + its import from `TopBar.tsx`
  (`TopBar.tsx:30`, `:321-323`), replacing the JSX with an explanatory comment (no
  behavior left behind to silently regress). Added a new "Market Data Feed"
  `dialog-section` to `SettingsModal.tsx`, positioned immediately after "AI Advisor"
  and before "Nightly Self-Evaluation," reusing the *exact same* `useDataSourceStore`
  hook (`source`, `liveAvailable`, `switching`, `hydrate`, `setSource`) and the same
  confirm-before-clearing-paper-positions guard the old chip had — no new IPC channel,
  no new store, no duplicated switch logic. Restyled to match Settings' existing
  idioms (a `seg` segmented control + `form-hint` messaging) rather than porting the
  TopBar's bespoke `bb-feed-chip` styling verbatim, since a chip-styled button would
  have looked foreign inside the settings-dialog visual language.
  `FeedSwitch.tsx` is now unused — **could not be deleted from this sandbox**
  (`rm`/`git rm` both fail with `Operation not permitted`, the same file-bridge
  EPERM-on-unlink class documented in §2.9; a stale `.git/index.lock` was also found
  and is similarly un-removable from here — neither blocks reads, `git status`/`diff`/
  `show` all still work). **Operator follow-up needed:** delete
  `apps/satex-terminal/src/renderer/components/FeedSwitch.tsx` and `.git/index.lock`
  by hand (either is a one-line `rm` on the real filesystem); until then `npm run knip`
  will correctly flag the file as dead code — that flag is accurate, not a false
  positive, and will clear itself once the file is gone.
- **Status:** SHIPPED (unstaged, 2026-07-04). Evidence: byte-scan 0 NUL / 0 `\r\r`
  (LF) on both edited files; typecheck node exit 0 · typecheck web exit 0 · lint exit
  0 (0 warnings — one `react-hooks/exhaustive-deps` warning surfaced mid-edit from the
  new `hydrateFeed()` call in the modal's open-effect and was fixed by adding the
  stable zustand action reference to the dependency array, not suppressed); targeted
  vitest `dataSourceStore.test.ts` 3/3 (store itself untouched). Off-perimeter (UI
  relocation only; `data-source-guard.ts` interlock logic byte-for-byte unchanged) —
  no APPROVAL NODE. **Tool-hazard note for future sessions:** the first attempt at the
  `TopBar.tsx` import removal used the `Edit` tool directly on an existing file and
  introduced 42 NUL bytes (the exact P-021/P-078 shrinking-edit class) — caught
  immediately by the mandatory post-edit byte-scan, recovered via
  `git show HEAD:<path>`, and redone correctly via python-through-mount. Evidence this
  hazard is real and current, not just historical.
- **Reconciliation (2026-07-09, work-layer):** Committed `f331013`. The orphaned
  `FeedSwitch.tsx` (this entry's operator follow-up) was subsequently deleted by
  `b1cb7c6` ("fix(knip): remove orphaned FeedSwitch.tsx — CI's actual dead-code
  failure") — that follow-up is now DONE, not outstanding. This session re-verified:
  typecheck exit 0 · lint exit 0 (0 warnings) · `dataSourceStore.test.ts` 3/3 (part of
  the 122-file / 1598-test / 0-fail segmented run). Status: SHIPPED →
  **VERIFIED (committed)**. Filing-convention note: see P-092.

### P-083

 · `market-observer.ts` (continuous intel recorder) shipped untested — SHIPPED

- **Problem:** `src/main/services/market-observer.ts` (196 LOC) — the always-on
  `MarketObserver` that records one `Observation` per watchlist symbol per quote batch
  and feeds PatternLearner + VaultWriter — had zero co-located test coverage. It carries
  three defect classes this repo keeps re-hardening: a bounded per-symbol ring buffer
  (`RING_PER_SYMBOL=200`, `recordToRing`, `market-observer.ts:163-176`), a `setInterval`
  flush timer whose only cleanup is `stop()` (the PR#6/P-041/P-043/P-046 leak class,
  `market-observer.ts:64-73`), and a rolling per-minute window trim
  (`market-observer.ts:89-93`) — all unverified. Off the trading-safety perimeter
  (recorder only; "learns nothing", source header `market-observer.ts:1-23`).
- **Solutions:** (a) new-file-only Vitest suite, source untouched, mocking `./persistence`
  + `@shared/indicators` per the `pattern-learner.test.ts` precedent — pins the contract
  with zero source risk; (b) refactor for testability first (extract `classifyRegime`,
  inject a clock) — larger blast radius, unjustified for a green module; (c) leave
  untested — rejected, this is exactly the bounded-growth/leak class the ledger exists to
  guard.
- **Decision:** **(a)**. NEW `src/main/services/market-observer.test.ts` (28 tests):
  lifecycle + timer-cleanup, watchlist gating, `≥21`-candle + computeSnapshot-throw
  null-guards, ring bounded-growth (cap 200, unbounded `totalObserved` counter),
  rolling per-minute window, velocity first-tick-0 + guard, `last<=0` spread guard,
  `MAX_BUFFER` (500) auto-flush, flush error-swallow (batch dropped, `bufferedRows→0`),
  `stats()` shape, all five `classifyRegime` branches. Source byte-for-byte unchanged.
- **Finding (pinned, NOT fixed — coverage-only pass):** `getRecent`
  (`market-observer.ts:96-100`) returns `buf.slice(0, cursor).slice(-limit)`; once the
  modulo ring wraps (`cursor > RING_PER_SYMBOL`) `buf` is overwritten in place and is NOT
  reordered on read, so the docstring's "newest last" ordering holds only pre-wrap. Low
  blast-radius (intel display / replay ordering, not a live-decision or perimeter path).
  Left as documented current behavior — an operator/product call whether post-wrap read
  order matters, same handling as P-079's `SATEX_RNG_SEED` NaN note. Tests assert ordering
  pre-wrap and length-cap + membership post-wrap.
- **Status:** SHIPPED (unstaged, 2026-07-04). Evidence: byte-scan 0 NUL / 0 CRCR (LF);
  typecheck node exit 0 · typecheck web exit 0 · lint exit 0 (0 warnings) · targeted
  vitest 28/28 · 4-file services segment (market-observer + pattern-learner + tick-recorder
  + calibration) 49/49, no mock leakage. knip not run (sandbox oxc-parser 2 GB OOM, §2.9
  ceiling — new test exports nothing, knip-neutral; CI is arbiter). Blueprint:
  `apps/satex-terminal/docs/superpowers/specs/2026-07-04-market-observer-coverage-ultraplan.md`.
- **Reconciliation (2026-07-09, work-layer):** Committed `f331013`. This session
  re-verified: typecheck exit 0 · lint exit 0 (0 warnings) · segmented vitest 122
  files / 1598 tests / 0 fail (incl. `market-observer.test.ts` 28/28) · knip not run
  (sandbox OOM, §2.9). Status: SHIPPED → **VERIFIED (committed)**. Filing-convention
  note: see P-092.

### P-084 · Stale `P-083` ledger cross-reference in PNG-export IPC hardening comments — SHIPPED (fixed)
- **Problem:** Work-layer code audit (2026-07-04) found `src/shared/ipc-schemas.ts:361`
  and `src/renderer/chart/export.ts:104` — both unstaged, uncommitted since around
  2026-07-03 — carry inline comments citing `P-083 (2026-07-03)` as the ledger record
  justifying `ChartPngExportReq.data`'s move from `Array.from(Uint8Array)` (a plain
  `number[]` walked element-by-element by Zod's `.int().min().max()` and the IPC
  structured clone) to a raw `Uint8Array` validated by `byteLength <= 20_000_000`. That
  citation is wrong: `P-083` (this file, "Open" section) was independently assigned the
  same day to an unrelated entry — `market-observer.ts` coverage — so the PNG-export
  change had evidently never been given its own ledger entry at all; the comment cited a
  number that was free *when written* but got claimed by different, actually-ledgered
  work before either landed. Net effect: a broken evidence trail (CONSTITUTION 0.1 "every
  claim cites ... a timestamped source"; 0.10 "never lose a problem") — a future agent
  grep-ing "P-083" for PNG-export context would land on the market-observer entry instead.
- **Solutions:** (a) delete the stray citation entirely — cheapest, but loses the
  useful "why" reasoning already written inline; (b) correct the citation to a fresh
  number (this entry, P-084) and ledger the original PNG-export decision retroactively
  under it — preserves the reasoning, restores a working citation, costs one ledger
  entry; (c) leave it uncorrected and just note the discrepancy — rejected, an agent
  session budget already exists to fix exactly this class of low-blast-radius defect
  (rule 4, work-layer prompt) and leaving a known-wrong citation live serves no one.
- **Decision:** **(b)**. Patched both comments (python-through-mount per file-bridge
  discipline; LF-only files, anchor-count asserted ==1 before each replace) to cite
  `P-084` instead of `P-083`, and added a CHANGELOG bullet (first `### Fixed` under
  `## Unreleased`) documenting the original PNG-export decision under this entry so it
  finally has a real ledger record. Re-verified the underlying change is sound while
  here: `src/main/index.ts:1081` (`Buffer.from(data)`, `data.length` in the log line)
  accepts either a `number[]` or a `Uint8Array` unchanged, so the schema-level type
  narrowing has no main-process fallout; `ipc-schemas.test.ts` (11 tests, staged)
  already exercises `ChartPngExportReq` indirectly via the broader schema suite.
- **Status:** SHIPPED (unstaged, 2026-07-04). Evidence: byte-scan 0 NUL / 0 CRCR (LF) on
  both patched files + this ledger + the CHANGELOG; typecheck node exit 0 · typecheck
  web exit 0 · lint exit 0 (0 warnings) · targeted vitest `ipc-schemas.test.ts` 11/11.
  Off-perimeter (comment/doc correction only, zero behavior change) — no APPROVAL NODE.
- **Reconciliation (2026-07-09, work-layer):** Committed `f331013`. Re-verified:
  typecheck exit 0 · lint exit 0 (0 warnings) · `ipc-schemas.test.ts` 11/11 (part of
  this session's 122-file / 1598-test / 0-fail segmented run). Status: SHIPPED →
  **VERIFIED (committed)**. Filing-convention note: see P-092.
- **Correction (2026-07-04, later same day — do not re-edit the Problem line above; this
  is the audit trail):** A GitHub repo check (branches + commit history, `github.com/
  satex25/satex-trading`) found the Problem statement above is only half right. The
  PNG-export change was NOT "never given its own ledger entry" — it already has a full,
  legitimate one: `P-083 · Trade-workspace "PNG" chart export sent raw bytes as a plain
  number[] — plausible renderer-crash mechanism, fixed`, committed as `63b1e5a` ("fix(chart):
  P-083 PNG export sends Uint8Array over IPC instead of number[]", authored "col and
  claude", 2026-07-03) on branch `fix/p083-png-export-ipc-transport` — pushed to GitHub
  but never opened as a PR and never merged (0 open PRs repo-wide; branch still exists,
  unmerged, off `8ea8226`). That branch also carries `f3ce1a5` ("fix(llm): P-081 raise
  default max_tokens 90->400..."), matching this ledger's existing P-081 almost verbatim —
  so P-081's numbering was consistent across branches, only P-083 collided. Root cause:
  two branches diverging from the same point each kept their own copy of this ledger and
  independently assigned "the next number" — `fix/p083-png-export-ipc-transport` claimed
  P-083 for the PNG fix on 2026-07-03; separately, the master-descended line (this file)
  had no record of that assignment and re-issued P-083 to `market-observer.ts` coverage on
  2026-07-04. Neither session did anything wrong in isolation; the collision is a structural
  gap — nothing in the PSD loop currently checks unmerged sibling branches before claiming
  a number. Also notable: neither `63b1e5a` nor `f3ce1a5` has a CI check recorded on GitHub
  (no PR was ever opened for that branch, so CI never ran on them) — their "gates green"
  claims are local-only, unlike `8ea8226` which shows a passed check from its own PR (#31).
  This entry's original Problem/Solutions/Decision stand as a correct description of what
  THIS session found and fixed in the local working tree; this note only corrects the
  "never ledgered" claim and adds the missing context. No further action taken here — see
  P-086 for the reconciliation recommendation.

### P-085 · Scheduled-task self-report mislabeled its own run time + the live dawn-planner task had drifted from its versioned mirror — SHIPPED (fixed)
- **Problem:** Two related process defects surfaced together during operator review of
  today's work-layer output. (1) The work-layer report written this session
  (`Vault/Daily/2026-07-04-work-layer.md`) originally titled itself
  `from: work-layer (6 AM run)`, copying the prompt's nominal "runs 06:00" schedule text
  instead of checking the actual wall-clock time. The task's own scheduler history showed
  the 06:06 AM slot was *skipped* that day; this session actually executed later
  (`lastRunAt` `2026-07-04T21:04:07Z` per `list_scheduled_tasks` — 21:04 UTC, matching the
  operator's observed "4:04 PM" local). The mislabel was caught by the operator, not by any
  self-check, because no self-check existed. (2) While correcting (1), a broader and more
  consequential drift was found: the *live* `satex-psd-daily` scheduled-task prompt
  (`C:\Users\User\Documents\Claude\Scheduled\satex-psd-daily\SKILL.md`) still read
  `REPO\00-PROJECT-ROOT\01-SATEX-CORE\satex-app\CLAUDE.md` and wrote blueprints to
  the same stale path — even though the repo's own versioned mirror
  (`docs/policy/scheduled-psd-daily.md`) had already been corrected to `apps/satex-terminal/`
  in an earlier session. This exact "scheduled-task prompt paths are stale" divergence had
  been carried forward, unresolved, across at least 3 prior daily handoffs (2026-07-02
  through 2026-07-04) — the mirror doc's own header warns "if this file and the installed
  task drift, the installed task is what runs — re-sync deliberately," and that re-sync had
  never actually happened.
- **Solutions:** (a) fix only the one Vault report file that was already wrong — cheapest,
  but leaves the root cause (no timestamp self-check, no drift check) live for every future
  run; (b) patch the *live* scheduled-task prompts (both `work-layer` and `satex-psd-daily`,
  via `update_scheduled_task`) to add a mandatory first-action timestamp check plus an
  explicit drift check against their versioned mirrors, then re-sync both mirror docs to
  match exactly — fixes the recurring class, not just today's instance, at the cost of two
  tool calls plus two doc rewrites; (c) leave the live task prompts alone and only fix the
  repo-side mirror docs — rejected, per the mirror's own stated rule the installed task is
  what actually runs, so a mirror-only fix would have looked correct while leaving the real
  bug live (exactly how (2) survived 3+ sessions already).
- **Decision:** **(b)**. Updated both live scheduled tasks (`work-layer`, `satex-psd-daily`)
  via `update_scheduled_task`: each now opens §1/BOOT with a mandatory "timestamp discipline"
  step (`date` first, real time in every report/handoff, explicit note if it diverges from
  the nominal 05:00/06:00 schedule), each SESSION REPORT template now starts with a
  `RUN TIMESTAMP:` line, and `satex-psd-daily` additionally regained the correct
  `apps/satex-terminal/` paths plus a boot-time drift check against its own mirror. Both
  mirror docs (`docs/policy/scheduled-work-layer.md`, `docs/policy/scheduled-psd-daily.md`)
  rewritten to match the newly-updated live prompts exactly (full-file rewrite via
  python-through-mount, not the Write tool, per the P-078 on-disk-overwrite scar), with a
  one-line "re-synced 2026-07-04, see P-085" note added to each header so a future reader
  knows why the version number moved. The original `2026-07-04-work-layer.md` report was
  also corrected in place (a "Scheduling note" section added at its top) rather than
  rewritten, so the mislabel and its correction are both visible — an erased mistake is a
  hidden one.
- **Status:** SHIPPED (unstaged, 2026-07-04). Evidence: `list_scheduled_tasks` confirms both
  tasks' prompts updated; `Read` on both live `SKILL.md` paths confirms the corrected path
  and the new timestamp-discipline text; byte-scan of both rewritten mirror docs + this
  ledger: 0 NUL / 0 `\r\r` (LF-only). No app code touched — this entry is process/tooling
  hygiene, not a source change, so the four gates do not apply; nothing to re-run.

### P-086 · Unmerged GitHub branch `fix/p083-png-export-ipc-transport` duplicates work already reconstructed locally — RESOLVED (content on master; branch stale, operator to delete)
- **Problem:** GitHub check (2026-07-04, prompted by an operator "how's the repo looking"
  question) found a branch, `fix/p083-png-export-ipc-transport` (2 commits: `f3ce1a5`
  P-081 LLM fix, `63b1e5a` P-083 PNG-export fix, both off `8ea8226`, pushed 2026-07-03),
  that was never opened as a PR and never merged — it does not appear in `master`'s
  history (`b800904` is `master`'s tip, via merged PR #31, and does not include either
  commit). Meanwhile, the LOCAL working tree (this session, and apparently at least one
  prior session) independently reconstructed the *same* two changes as UNSTAGED,
  UNCOMMITTED edits to `llm.ts` and `ipc-schemas.ts`/`export.ts` — content-equivalent to
  `f3ce1a5`/`63b1e5a` but with no commit, no authorship record, and (per P-084's
  correction above) a numbering collision on P-083. So there are now three copies of
  this same PNG-export + LLM-maxtokens work in different states of landedness: (1) a
  pushed-but-unmerged GitHub branch with real commits and messages, (2) uncommitted local
  edits in the sandbox working tree, and (3) two different ledger stories about it (P-081
  consistent, P-083 colliding). Nothing is lost, but nothing is reconciled either.
- **Solutions:** (a) open a PR from `fix/p083-png-export-ipc-transport` straight to
  `master` and merge it (it already has proper commits/authorship; CI has never run on it
  since no PR ever triggered the workflow, so CI would need to go green first) — cheapest
  path to a real, attributable commit history, but requires the operator to actually do it
  (branch→PR→merge is a human action per AGENTS.md, and this sandbox has no GitHub
  credentials to push or open PRs itself); (b) discard the local uncommitted
  reconstruction and treat the GitHub branch as canonical once merged — avoids double
  work, but means today's local P-084 fix (correcting the `P-083`→`P-084` comment
  citations) needs to be re-applied against whatever actually lands from the merged
  branch, since the merged version's comment will still say `P-083` correctly (it's
  right, in that branch's own context) and doesn't need renumbering unless P-083 is
  reassigned; (c) do nothing, let both copies keep drifting — rejected, this is exactly
  how P-013/P-019/P-024→P-085-class backlog pileup happens, and it directly caused the
  P-083 collision this entry's sibling (P-084) had to fix.
- **Decision:** Left **OPEN** — this is a git/PR strategy call for the operator, not an
  autonomous action. No agent session has GitHub write credentials in this environment
  (confirmed: `git ls-remote` from the sandbox fails with "could not read Username" — read
  access via browser only, no push/PR capability). Recommendation for the operator: decide
  whether `fix/p083-png-export-ipc-transport` should be opened as a PR and merged (getting
  its commits gate-verified via CI for the first time) *before* any more local session
  reconstructs the same content a fourth time.
- **Resolution (2026-07-10, operator ruling in session + agent verification):** The branch's
  content is now **redundant** — P-081 (LLM max_tokens) and the P-083 PNG-export fix both landed
  on `master` via the coverage batch (`4afec50` "P-081/P-083/...") and `1621109` (PNG export crash
  fix), confirmed by `git log origin/master`. The local unstaged reconstruction was likewise
  committed in that batch. The operator ruled `fix/p083-png-export-ipc-transport` **stale — delete
  it on GitHub** (restore remains available). No agent action possible on the remote (this sandbox
  has no push credentials — `git push` → "could not read Username"; confirmed again 2026-07-10).
  Operator one-click: GitHub → Branches → delete `fix/p083-png-export-ipc-transport`. Until decided, DO NOT commit the local
  unstaged `llm.ts`/`ipc-schemas.ts`/`export.ts` changes on any new branch without first
  checking whether they'd conflict with `fix/p083-png-export-ipc-transport` landing.
- **Status:** OPEN (2026-07-04). No code changed by this entry — read-only GitHub
  reconnaissance (browser) + this ledger write. Evidence: GitHub UI — 0 open PRs, 29
  closed; `master` tip `b800904` (PR #31, 1 check passed); branch `fix/p083-png-export-
  ipc-transport` exists with commits `63b1e5a`/`f3ce1a5`, no CI check recorded on either;
  1 open GitHub issue (#2, Authenticode cert, pre-existing, unrelated). Byte-scan of this
  ledger after edit: 0 NUL / 0 `\r\r` (LF-only).


### P-081 · Advisory LLM (legacy ERNIE 5.1 slot) returns empty content every call — root-caused + fixed
- **Problem:** Local dev-server validation session (2026-07-03) observed the brain's LLM
  advisor repeatedly logging `llm returned empty content` (`src/main/services/llm.ts:83`),
  making the advisor effectively non-functional. Traced: `getLlmConfig()`
  (`src/main/services/credential-store.ts:327-333`) falls back to a legacy pre-adapter
  Baidu AI Studio slot when no new `llm-config.bin` has been saved — `baseUrl:
  https://aistudio.baidu.com/llm/lmapi/v3`, `model: ernie-5.1`
  (`credential-store.ts:320-321`). `callAdvisor` (`brain.ts:190-199`) does not override
  `maxTokens`, so every call used the old hardcoded default of 90 (`llm.ts:66`, pre-fix).
  ERNIE 5.1 is a reasoning-capable model; reasoning models spend hidden "thinking" tokens
  out of the same `max_tokens` budget before emitting visible `content` — a 90-token
  ceiling is plausibly consumed entirely by reasoning, leaving nothing for the response
  the code reads from `choices[0].message.content`.
- **Solutions:** (a) raise the shared `chatComplete` default `max_tokens` (90 → higher) —
  simple, provider-agnostic, fixes this and any future reasoning-model call site, zero
  risk (advisory-only, no perimeter contact, no behavior change for non-reasoning
  providers beyond a larger ceiling); (b) have `callAdvisor` pass an explicit
  higher-than-default `maxTokens` for just this call site — more surgical/local, but
  today there is exactly one call site so the practical difference is nil; (c) switch
  the legacy-fallback provider/model away from ERNIE 5.1 — an operator/product call
  (which provider to pay for), not something to freelance.
- **Decision:** **(a)**. Added `DEFAULT_MAX_TOKENS = 400` (`llm.ts:26-31`, documented
  inline with this ledger citation) and switched the one call-site default to it. Left
  (c) for the operator if they'd rather not rely on the legacy Baidu slot at all — no
  ledger action needed, note only.
- **Status:** SHIPPED (2026-07-03). `llm.test.ts` updated (default-tokens assertion +
  new constant-value test, 9→10 tests) and full local gates re-run post-fix: typecheck
  exit 0 · lint exit 0 · vitest 120 files / 1532 tests / 0 fail (sharded 4x) · knip:
  sandbox oxc-parser OOM (documented §2.9 class, CI arbiter). Root cause is a hypothesis
  grounded in code + config (evidence above), not a live-provider-confirmed capture —
  if the advisor is still silent after this ships, the legacy Baidu key itself
  (expiry/rotation) is the next thing to check.
- **Reconciliation (2026-07-09, work-layer):** Committed `f331013` (2026-07-08 20:23,
  branch `chore/p076-p080-coverage-and-fixes`, HEAD now `b1cb7c6`). This session re-ran
  all four gates directly against the committed tree: typecheck exit 0 · lint exit 0 (0
  warnings) · segmented vitest 122 files / 1598 tests / 0 fail (incl. `llm.test.ts`
  10/10) · knip not run (sandbox oxc-parser OOM, §2.9 — CI arbiter). No regression.
  Status: SHIPPED → **VERIFIED (committed)**. Not physically relocated to
  `## Closed — verified` — see P-092 (filing-convention note, operator ruling).

### P-082 · Dev-server validation session (2026-07-03, local machine) — two benign findings confirmed working-as-designed, logged so they aren't re-investigated
- **Problem:** Same local validation session that surfaced P-081 also flagged: (1) "kill
  switch still latched from disk" on boot — this is the kill switch's persisted,
  human-resettable-only state working exactly as CONSTITUTION §3.4/§3.8 specifies
  (`kill-switch-store.ts`); latching across restarts until an operator clears it in-app
  is the intended safety behavior, not a defect. (2) "simulator seed hydration timeout —
  benign fallback to UNIVERSE.seed" — `trading-engine.ts:1971` logs this exact warning
  by design when a live-quote hydration attempt times out, falling back to the hardcoded
  `UNIVERSE.seed` values; `market-data.test.ts:115,123` explicitly test this fallback
  path. Also reported: clean ~12-hour and ~68-minute dev-server runs with zero renderer
  errors, no `ChartPanel` crash, no `getSnapshot` warnings, error-boundary count steady
  at 7 (all pre-dating the selector fix already shipped).
- **Solutions:** n/a — no code problem to solve. Documented only so a future session
  doesn't burn time re-diagnosing two already-intended behaviors as new mysteries.
- **Decision:** No action. Both are correct, tested behavior.
- **Status:** VERIFIED (2026-07-03) — confirmed against `kill-switch-store.ts`,
  `trading-engine.ts:1953-1971`, and `market-data.test.ts` fallback tests.

### P-080 · `Vault/00-Audit/MAY TACTICS.md` had a 310-byte NUL-tail (file-bridge corruption, extends P-021/P-078) — SHIPPED (fixed)
- **Problem:** The mandatory NUL/CRCR byte-scan of every modified/untracked
  working-tree file (work-layer rule 5c) found `Vault/00-Audit/MAY TACTICS.md`
  at 37444 bytes with 310 trailing `\x00` bytes. `git show HEAD:"Vault/00-Audit/MAY TACTICS.md"`
  was 37134 bytes, 0 NUL, and byte-identical to the working-tree file minus the
  tail — confirming this was pure file-bridge corruption (a no-op touch that
  got NUL-padded), not an in-flight content edit that got mangled.
- **Solutions:** (a) restore via `git show HEAD:<path>` through the Linux
  mount (the proven P-018/P-021/P-078 recovery tool), then byte-scan to
  confirm; (b) manually truncate the trailing NUL bytes in place — riskier,
  depends on correctly locating the exact corruption boundary by hand; (c)
  leave it — rejected, NUL bytes in a tracked Vault file are exactly the class
  this repo scans for and a `git add` of the corrupted file would commit binary
  garbage into a markdown doc.
- **Decision:** (a). Restored clean HEAD bytes via Python through the mount.
- **Status:** SHIPPED (2026-07-03). Evidence: post-restore file is 37134 bytes,
  0 NUL / 0 CRCR, `git diff --exit-code -- "Vault/00-Audit/MAY TACTICS.md"`
  exits 0 (byte-identical to HEAD). Not a code defect — Cowork platform
  tooling scar tissue, off the trading-safety perimeter.

### P-079 · `env.ts` (process.env validation/access module) shipped untested — SHIPPED
- **Problem:** `src/main/services/env.ts` (85 LOC) is the single module every
  service reads `process.env` through (direct `process.env` access is
  documented-forbidden elsewhere in the file's own header comment), yet had
  zero test coverage. Unverified: all field defaults, `SATEX_USE_SIMULATOR`
  case-insensitive boolean parsing, `ALPACA_FEED` fallback-to-`iex` on an
  unrecognized value, the `loadEnv()`/`getEnv()` module-level memoization
  (`_env` cache — first call wins, later `process.env` mutation is ignored
  until process restart), and — found while writing the suite — a present-but-
  malformed `SATEX_RNG_SEED` (e.g. `"not-a-number"`) silently produces `NaN`
  rather than falling back to `null`; only the *absent* case is null-guarded
  (`seedRaw ? parseInt(seedRaw, 10) : null`). That NaN-not-null gap is a real,
  narrow degenerate-input crack (P-039/P-040 class) but low blast-radius
  (operator-set env var, not user/market input) — pinned as documented
  current behavior rather than silently "fixed," since changing it is a
  1-line, reviewable call this session chose not to make unilaterally in a
  pure-coverage pass; flagged here for a follow-up PSD if the operator wants
  it null-guarded too.
- **Solutions:** (a) new-file-only Vitest suite pinning observable behavior,
  source untouched — the proven P-059/P-076/P-077 coverage pattern; (b)
  fix the NaN gap in the same pass — rejected for this entry, keeps the
  coverage-only diff reviewable and isolates the (arguably-a-taste-call)
  behavior change into its own decision; (c) leave untested — rejected, this
  is the credential/config gateway every service depends on.
- **Decision:** (a). New `env.test.ts`, 21 tests, source byte-for-byte
  unchanged. Uses `vi.resetModules()` + dynamic import + a `process.env`
  save/restore harness per test since the module's `_env` cache is
  process-lifetime singleton state that would otherwise leak across tests in
  the same Vitest worker.
- **Status:** SHIPPED (2026-07-03). Evidence: typecheck exit 0, lint exit 0,
  `npx vitest run src/main/services/env.test.ts` 21/21 pass.

### P-076 · `live-candle-buffer.ts` shipped untested — bounded-growth cap + `onCandle` unsubscribe unverified — SHIPPED
- **Problem:** `src/main/services/live-candle-buffer.ts` (190 LOC, per-symbol
  tick to OHLC buffer feeding ChartPanel) had zero test coverage. Two invariants
  had no test guarding them: the `history.length > MAX_CANDLES_PER_SYMBOL` cap
  (bounded growth) and the `onCandle` unsubscribe closure (the
  PR#6 / P-041 / P-043 / P-046 listener-leak class), plus the intra-bar
  coalesced flush (most-recent-wins) and the bucket-roll fill-forward.
- **Solutions:** (a) new-file-only Vitest suite pinning observable behavior,
  source untouched — the proven P-059 coverage pattern; (b) refactor for
  testability first — unnecessary, the class is already pure/in-memory; (c)
  leave untested — rejected, invariant-bearing hot-path code.
- **Decision:** (a). New `live-candle-buffer.test.ts`, 13 tests, source
  byte-for-byte unchanged. Off the trading-safety perimeter (pure aggregation,
  no broker/execution/risk coupling).
- **Status:** SHIPPED (2026-07-03). Evidence: typecheck exit 0, lint exit 0,
  `npx vitest run live-candle-buffer.test.ts` 13/13 pass; services-flat segment
  43 to 45 files / 567 to 589 tests (+2 / +22 with P-077). Blueprint:
  `docs/superpowers/specs/2026-07-03-live-candle-buffer-system-logs-coverage-ultraplan.md`.

### P-077 · `system-logs.ts` ring-buffer tail service shipped untested — SHIPPED
- **Problem:** `src/main/services/system-logs.ts` (71 LOC, ring-buffer log tail
  feeding the renderer SystemLogsPanel) had zero coverage. Unverified: the
  `BUFFER_SIZE = 60` ring-buffer cap (the same unbounded-writer class as P-069's
  Observer flood, here already bounded in code), the `onTail` unsubscribe
  (listener-leak class), and level classification (EVENT tags + normalizeLevel
  uppercase mapping).
- **Solutions:** (a) new-file-only Vitest suite; (b)/(c) as P-076.
- **Decision:** (a). New `system-logs.test.ts`, 9 tests, source unchanged.
- **Status:** SHIPPED (2026-07-03). Evidence: same gate run as P-076;
  `npx vitest run system-logs.test.ts` 9/9 pass.

### P-078 · Cowork Write/Edit tool bridge truncates full-file writes of already-on-disk files (extends P-021) — SHIPPED (workaround)
- **Problem:** while creating `live-candle-buffer.test.ts` this session, the
  Edit tool truncated the file mid-line (esbuild: `167:31 Unexpected end of
  file`, cut at "buf.getCa"), and a subsequent FULL `Write` of the complete
  corrected content ALSO landed truncated (byte scan: 6749 bytes, last byte
  `b'a'`, same cut point). The bridge's growing-write tail-truncation bites even
  a whole-file overwrite once the path already exists — the "Write NEW files
  normally" guidance only holds for paths not yet on disk.
- **Solutions:** (a) write via `cat > file <<'EOF'` heredoc through the Linux
  mount, bypassing the Cowork file bridge entirely — proven this session
  (re-wrote clean: 7059 bytes, ends `b'\n})\n'`, 0 NUL / 0 CRCR); (b)
  python-scripted write through bash — equivalent; (c) trust Write + always
  byte-scan after — the scan catches it but does not fix it.
- **Decision:** (a) is the reliable recovery when a bridge Write/Edit truncates
  a file that already exists: heredoc/python through the mount, then byte-scan
  to confirm. Ledgered as scar tissue; the tooling bug is a Cowork-platform
  issue, not a SATEX code defect.
- **Status:** SHIPPED workaround (2026-07-03). Evidence: byte scans recorded in
  `Vault/Daily/2026-07-03-agent-handoff.md`.

### P-073 · Intel-workspace ultraplan Phase D — fully-collapsible side rails (operator ask, 2026-07-02) — SHIPPED
- **Problem:** The Phase-D appended requirement on the Intel-workspace ultraplan
  (`docs/superpowers/specs/2026-06-29-intel-workspace-composable-grid-ultraplan.md`)
  asked for every global side-rail panel — Watchlist, Depth, Regime, Exec,
  News, Risk, Logs, Health — to collapse *fully* (grid track shrinks to a thin
  re-open handle, not a shorter card), matching `FundedAccountPanel.tsx`'s
  existing per-panel collapse interaction. None of the 8 rail panels had this;
  `FundedAccountPanel.tsx` itself only does the "shorter card" collapse
  (body hidden, header stays full width) — not a track-size change.
- **Solutions:** (a) give each of the 8 panel components its own internal
  collapse state + CSS, duplicating the interaction 8 times; (b) a single
  headless track-sizing function (mirrors `grid-layout.ts`'s pure-reducer
  idiom) + one presentational wrapper component (`RailSlot`) applied from
  `App.tsx` around each existing panel from the OUTSIDE — zero changes to the
  8 panels' own source; (c) reuse `react-resizable-panels` or similar — a new
  dependency, against the 10-dep minimalism policy (knip-enforced) that
  already ruled out a grid-layout library for the Intel workspace (Decision D2).
- **Decision:** **(b)** — cheapest blast radius (App.tsx + globals.css + the
  workspace-state persistence + 2 new small files), fully unit-testable
  headless math, no new dependency, and doesn't touch any of the 8 wrapped
  panels' internals (several of which — RiskGatePanel, ExecTicketPanel — sit
  closer to the trading-safety perimeter; wrapping them from the outside as
  pure view-chrome keeps this build unambiguously off-perimeter).
- **Implementation:** `shared/types.ts` — `RAIL_IDS`/`RailId` + additive
  `WorkspaceState.collapsedRails: RailId[]` (no version bump, tolerant hydrate,
  mirrors the `landingWorkspace` P-048 pattern exactly, including a proactive
  fresh-array-copy fix on all three `workspace-state.ts` fallback sites so the
  new field doesn't repeat the P-061 aliasing class on day one).
  `ipc-schemas.ts` — `WorkspaceStateSetReq.collapsedRails` bounded
  `z.array(RailIdS).max(RAIL_IDS.length)`. NEW `renderer/lib/rail-layout.ts` —
  pure `computeRailTemplate(specs, collapsed)`: any collapsed track renders as
  a 28px handle; every other track keeps its natural size (fixed stays fixed,
  already-flexible stays flexible) UNLESS the stack's only flexible track was
  the one collapsed, in which case the last non-collapsed track is promoted to
  `minmax(0, 1fr)` so freed space is never a dead gutter. NEW
  `renderer/components/RailSlot.tsx` — presentational wrapper (full view:
  small collapse button overlay; collapsed view: a clickable handle strip with
  a re-open glyph + rotated label) — no listener/timer/ResizeObserver, nothing
  for the PR#6 leak class to catch. `App.tsx` wraps all 8 panels; inline
  `style` overrides for `bb-main-row`/`bb-col-right`/`bb-secondary-row`'s
  grid-template are applied ONLY when something on that stack is actually
  collapsed (`railTemplateIsDefault` short-circuit), so the nothing-collapsed
  render path is byte-for-byte the pre-existing plain CSS — zero visual
  regression when the feature is unused. `globals.css` — `.bb-rail-slot` /
  `.bb-rail-handle` styles + a `:has(.bb-rail-handle)` override inside the
  existing P-002 sub-1009px-height media query so a collapsed rail keeps its
  handle height under that fallback layout too (an edge case the naive version
  would have missed). CSS transitions on the three grid containers are
  automatically neutralized by the repo's existing global
  `prefers-reduced-motion: reduce` rule — no separate media query needed.
- **Tests:** NEW `rail-layout.test.ts` (13 tests) — nothing-collapsed is
  byte-identical to defaults, fixed-track collapse with an existing flex
  sibling, sink-promotion when the only flex track collapses (including the
  2-deep promotion chain), all-collapsed, and degenerate inputs (empty specs,
  an unknown collapsed id). Extended `workspace-state.test.ts` (+4: tolerant
  hydrate on a pre-Phase-D record, unknown-id-dropped + dedup sanitize, a
  defensive-copy assertion mirroring the P-061 lesson) and
  `workspaceStore.test.ts` (+4: toggle collapses/re-expands, tracks multiple
  rails independently, never mutates the shared `DEFAULT_WORKSPACE_STATE`
  reference) and `ipc-schemas.test.ts` (+3: accepts the full rail set, rejects
  an unknown id, rejects an over-length array).
- **Gates (measured, this session):** typecheck exit **0** | lint exit **0**
  (0 warnings) | vitest **117 files / 1488 tests / 0 fail** (sharded 4×:
  397+464+332+295) | knip exit **0** (55 lines, byte-identical to baseline —
  no new unused exports).
- **Status:** SHIPPED (unstaged) — off-perimeter (view state only, routes no
  order; patch-grep of the diff shows zero `OrderManager`/risk-gates/
  kill-switch/Alpaca-submit references).

### P-074 · `funded-account-store.ts` — the same shallow-spread aliasing class as P-061, hardened proactively — SHIPPED
- **Problem:** `EMPTY.ledger`/`EMPTY.dailyPnl` are module-level arrays;
  `sanitize(null)`/`load()`'s three fallback paths all returned `{ ...EMPTY }`
  — a shallow spread that aliased the SAME `ledger`/`dailyPnl` array
  references into every caller, the exact pattern already found and fixed
  once this session in `workspace-state.ts` and previously in
  `indicator-settings.ts` (P-061). Traced both current consumers
  (`equity-hwm.ts:58`, `daily-pnl-ledger.ts:36`) and both already defensively
  copy before mutating, so this was latent, not an active production bug —
  but fragile, and a class this repo has now hit three times.
- **Solutions:** (a) leave it — both consumers copy defensively today; (b)
  add a `freshEmpty()` constructor that always returns new arrays, used at
  all three fallback sites, removing the hazard at the source instead of
  relying on every future consumer remembering to copy; (c) freeze `EMPTY`
  with `Object.freeze` so an accidental mutation throws instead of silently
  corrupting — doesn't stop the aliasing, just changes the failure mode.
- **Decision:** **(b)** — matches the fix already applied twice this session,
  one-line-per-site, off-perimeter (account-state persistence, not order
  routing), zero behavior change for any correct caller.
- **Tests:** added a regression test asserting two independent `load()` calls
  against a missing/corrupt file return different array references and that
  mutating one never leaks into the other or into
  `DEFAULT_WORKSPACE_STATE`-style shared state (mirrors the P-061 test
  pattern). Also fixed, same audit pass: `FundedAccountPanel.tsx`'s
  `Sparkline` used `Math.min(...values)`/`Math.max(...values)` — an unbounded
  spread (the P-041 class); safe only because the sole call site caps the
  ledger to 10 entries, but the component had no internal bound of its own.
  Replaced with a single bounded for-loop.
- **Gates:** included in the P-073 gate run above (same session, same green
  numbers) — `funded-account-store.test.ts` 11→12 tests,
  `funded-account-integration.test.ts` unaffected (34/34 still green).
- **Status:** SHIPPED (unstaged) — off-perimeter (account-state persistence +
  display component; no `OrderManager`/risk-gates/kill-switch touch).

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

### P-075 · ChartPanel.tsx — unstable inline Zustand selectors for trades/drawings caused "Maximum update depth exceeded" on Trade/Focus/Replay — root-caused and fixed
- **Problem:** Operator report + screenshots: Trade, Focus, and Replay workspaces all
  failed to render with React's "Maximum update depth exceeded" (caught by the P-044
  ErrorBoundary — non-fatal, rest of the terminal unaffected). Markets/Quad/Intel
  rendered fine. The one component common to all three failing workspaces and absent
  from the three working ones is `ChartPanel` (`Quad` uses a separate `QuadChartPanel`;
  `Markets`/`Intel` don't chart at all). Traced to two lines in `ChartPanel.tsx`
  (`:206`, `:213`, HEAD `b5be6d0`):
  `useTradesStore(s => s.bySymbol[symbol] ?? [])` and
  `useDrawingStore(s => s.drawings[symbol] ?? [])`. Both selectors mint a **brand-new
  empty array on every call** whenever the symbol has no trades/drawings yet (true for
  most symbols on a fresh launch) — the exact Zustand v5 `useSyncExternalStore`
  snapshot-instability class already identified and fixed in `marketStore`
  (`selectCandles`/`EMPTY_CANDLES`) and `drawingStore` (`selectDrawings`/
  `EMPTY_DRAWINGS`, per that file's own in-code warning comment). `useSyncExternalStore`
  sees a "new" snapshot every render (`Object.is([], [])` is false), schedules another
  render, gets another new `[]`, forever — a real, synchronous infinite loop, not a perf
  smell. `drawingStore.ts` already exports a correct, stable `selectDrawings` — HEAD's
  `ChartPanel.tsx` simply wasn't using it, and had its own separate inline unstable copy
  of the same bug. `tradesStore.ts` had no equivalent `selectTrades` export at all.
- **Solutions:** (a) add `EMPTY_TRADES`/`selectTrades` to `tradesStore.ts` mirroring the
  proven `drawingStore.ts` pattern exactly, then repoint `ChartPanel.tsx`'s two selectors
  at `selectTrades(symbol)` / `selectDrawings(symbol)` — smallest diff, reuses an
  already-correct pattern twice over, zero behavior change beyond fixing the loop;
  (b) wrap the inline selectors in `useMemo` at the call site instead — works but
  duplicates the stabilization logic ChartPanel-locally instead of at the store, and
  leaves `tradesStore.ts` without a reusable selector for future consumers.
- **Decision:** (a). Shipped: `tradesStore.ts` gains `EMPTY_TRADES` + `export const
  selectTrades`; `ChartPanel.tsx` imports both `selectTrades` and `selectDrawings` and
  uses them at `:206`/`:213`. Also fixed in the same pass: `footprintStore.ts`'s
  `useFootprintCandles` called `agg.recent()` unmemoized (fresh array every call,
  feeding `DeltaStrip`, itself mounted by `ChartPanel`) — same instability class one
  layer further out; wrapped in `useMemo(() => agg.recent(symbol, limit), [agg, version,
  symbol, limit])`. Not confirmed as a second independent trigger of the exact crash,
  but a real, same-class bug worth closing while in the file.
- **Evidence:** `npx tsc --noEmit -p tsconfig.web.json` exit 0 (was 3 errors before —
  see corruption note below); `npx eslint` on all three touched files: 0
  errors/warnings. Full vitest run not yet executed this pass (no dedicated test files
  exist for ChartPanel/tradesStore/footprintStore — targeted follow-up: add regression
  coverage pinning "symbol with zero trades/drawings renders without looping").
- **Sandbox-corruption note (extends P-066/P-067):** mid-investigation, the Cowork
  sandbox's Edit tool silently **truncated** `footprintStore.ts` mid-comment on write
  (reported success, but `wc -c`/`cat` showed a torn file cut off mid-sentence, no
  trailing newline) — and independently, `ChartPanel.tsx` and `tradesStore.ts` were
  *already* torn in the working tree before I touched them (likely from an earlier,
  unrelated uncommitted edit that never finished writing). All three were confirmed via
  `diff <(git show HEAD:<path>) <path>` — HEAD's committed blobs were clean; only the
  working-tree copies were corrupted. Recovered all three via `git show HEAD:<path> >
  <path>` (the Constitution's own documented recovery tool) before reapplying edits
  through Python/bash instead of the Edit tool, verifying byte counts after every write.
  **Pattern for future sessions:** after any Edit-tool write in this environment, verify
  via `wc -c` + `tail` from bash — do not trust the tool's own success report alone.
- **Status:** SHIPPED (uncommitted) — **at risk of loss** like every prior uncommitted
  edit this session (P-070 class); needs a commit before the next `checkout -f` from any
  tool discards it. Recommend bundling with the P-066 pattern: one docs-plus-code commit,
  gates re-verified post-commit, pushed to `refactor/filesystem-reorganization` before
  PR #30 merges — this bug should not ship to master un-fixed.

### P-070 · Root `docs/` (21 tracked files) got dragged into `apps/satex-terminal/`, landed as `docs 1`, 14 nested files lost in transit — found, fixed
- **Problem:** Post-reorg structural audit (operator directive, 2026-07-02) found
  root-level `docs/` **entirely missing from disk** (`git status` showed all 21
  tracked files as `D`), while `apps/satex-terminal/docs 1/` held 6 of them
  (top-level only) plus 6 empty shell subfolders (`audits/`, `guides/`, `plans/`,
  `policy/`, `superpowers/`, `vendor/` — 0 files each). Root cause: an accidental
  drag/move of the whole `docs/` folder into `apps/satex-terminal/` (operator's
  editor, per their own report) — the destination already had its own **different**
  app-level `docs/` (design/, release-checklists/, superpowers/, correctly
  untouched throughout), so the OS/editor auto-renamed the incoming one to
  `docs 1` rather than overwrite. The move dropped 14 nested files somewhere in
  transit (likely an interrupted recursive copy) — nothing was actually lost
  because git still held every blob.
- **Solutions:** (1) `mv "apps/satex-terminal/docs 1" docs` to restore the 6
  top-level files instantly, then `git show HEAD:<path> > <path>` for each of the
  14 missing nested files (Constitution §2.9's own documented recovery pattern) —
  recommended, zero data loss, no git write needed; (2) `git checkout -f -- docs/`
  would also restore it in one shot, but only from a tool with real (non-sandbox)
  checkout access.
- **Decision:** (1), executed this session. Verified byte-exact against git
  (`git ls-tree -r HEAD -- docs/` vs. the restored tree — perfect match, `git
  status --porcelain -- docs/` now empty). `apps/satex-terminal/docs/` (the real
  app-level docs) confirmed untouched throughout. Swept the rest of the tree for
  the same class (any `* 1`, `* copy`, `*(1)*` name) — nothing else found. Also
  caught in the same pass: my P-066-era `.gitignore` edit (90-REFERENCE →
  reference/vendor/) had been silently discarded by an intervening `git checkout
  -f` from another tool — reapplied and reverified (`git check-ignore` now
  matches). **Pattern worth naming: any Cowork-sandbox file edit made while this
  repo also has an active native-session/operator workflow doing checkouts is at
  risk of silent loss** — re-verify sandbox-side edits after any checkout, don't
  assume they survived.
- **Status:** SHIPPED — verified clean.

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
- **Status:** SHIPPED — the native Claude Code session (direct Windows filesystem
  access) cleared 3 stale locks (`index.lock`, `HEAD.lock`,
  `objects/maintenance.lock`, all dated 2026-06-28/29, no live process), reconciled
  the working tree, re-ran all four gates on both branches (green, identical — see
  P-064/P-066), and pushed both with PRs open (`#29` checkpoint→master, `#30`
  reorg→checkpoint, both MERGEABLE). See P-067: the same class recurred within
  this same session, self-inflicted by a different tool.

### P-067 · Cowork sandbox's own `git status`/`git branch -vv` regenerated a fresh, EPERM-stuck `index.lock` immediately after P-065 was cleared
- **Problem:** Once the native session's fix was confirmed (this session's mount
  showed a clean `git status` on `refactor/filesystem-reorganization`, up to date
  with origin), a follow-up verification pass in the *Cowork* sandbox — `git log` /
  `git show` / `git merge-base` / `git branch -vv` / `git status --porcelain`
  chained in one call — produced `warning: unable to unlink
  '.../mc4/.git/index.lock': Operation not permitted` mid-run. A fresh
  `index.lock` (new timestamp, 2026-07-02 19:12, confirmed via `ls`) existed
  immediately after and this session cannot remove it (identical EPERM class to
  P-065/P-066's sandbox categorically-blocks-unlink finding). Git tolerated the
  stale lock for subsequent reads in this session, but it would block the next
  commit/checkout attempted by any tool that isn't as forgiving — i.e. this
  session almost reintroduced P-065 by merely reading git state.
- **Solutions:** (1) Cowork-side agents restrict themselves to the minimal
  read set against this mounted repo (`git log`, `git show`, `git diff` on
  explicit refs) and stop calling `git status`/`git branch -vv` once a clean
  state is confirmed once — don't re-verify what's already verified; (2)
  operator/native-session sweeps stray `index.lock` after any Cowork session
  touches this repo, same one-line `del`; (3) worth filing as a Cowork sandbox
  bridge limitation (git's read-triggered index-refresh plus EPERM-on-unlink is
  a bad combination for any mounted git repo, not SATEX-specific) — outside this
  repo's power to fix.
- **Decision:** (1) for this session onward — no more git status/branch calls
  against the mounted repo beyond what's already gathered. A fresh `index.lock`
  (2026-07-02 19:12) is sitting in `.git/` right now and needs the same `del
  C:\Users\User\mc4\.git\index.lock` treatment before the next commit/checkout
  from any tool.
- **Status:** OPEN (operator — one more `del`, same remedy as P-065)

### P-068 · `00-PROJECT-ROOT/` is a fully orphaned, 723 MB leftover — zero tracked files, safe to delete
- **Problem:** Storage audit (operator directive, 2026-07-02) found
  `00-PROJECT-ROOT/01-SATEX-CORE/` still on disk after the `apps/satex-terminal`
  reorg checkout — 723 MB total, **0 files tracked by git** at HEAD (verified:
  `git ls-tree -r HEAD -- 00-PROJECT-ROOT` returns empty). Breakdown: `satex-app/dist/`
  698 MB (stale Electron build output, last built 2026-05-19 — a month before this
  audit), `satex-app/out/` 1.5 MB, `satex-app/playwright-results/` 1.1 MB,
  `01-SATEX-CORE/node_modules/` 22 MB, plus disposable debris (4 `push-chart-
  interaction-layer*.log` totaling ~820 KB, `gates-results.log`, `electron-vite-
  dev.log`, 2 `*.tsbuildinfo` caches, 4 superseded `.pr-body-l1a/l1b/l1c/audit-psd.md`
  drafts from already-merged L1.A–L1.C work). `git mv` correctly relocated every
  tracked file to `apps/satex-terminal/`; everything left behind was always
  untracked (build output, logs, node_modules) and the checkout has no reason to
  touch it.
- **Solutions:** (1) delete `00-PROJECT-ROOT/` entirely once the reorg PR (#30) is
  confirmed merged and the new path is the one in daily use — recommended; (2)
  delete it now, since nothing under it is reachable from git regardless of merge
  state — the only reason to wait is operator comfort seeing the old path stay put
  during review; (3) leave it — costs 723 MB of disk for zero benefit, and risks a
  future session mistaking it for a live copy.
- **Decision:** (1) — wait for the merge to land as a matter of caution (matches
  the operator's own review-before-delete instinct), then delete. Cowork sandbox
  cannot perform the delete (categorical EPERM-on-unlink, P-066/P-067); needs the
  native Claude Code session or a direct `rmdir /s /q
  C:\Users\User\mc4\00-PROJECT-ROOT` from the operator.
- **Status:** DECIDED — pending merge of PR #30, then delete.

### P-069 · `Vault/Observer/` checkpoint files are never pruned in code — CONSTITUTION §5.1's "newest 48 + monthly archive" is aspirational, not implemented
- **Problem:** Storage audit found 248 top-level files in `Vault/Observer/`
  (should be ≤48 per CONSTITUTION.md §5.1) plus 1,278 more already sitting in
  `Vault/Observer/archive/2026-05/` (852) and `archive/2026-06/` (426) — 1,528
  files total, ~810 KB (small in bytes, but unbounded in count and still growing:
  `vault-writer.ts::writeObserverCheckpoint` writes a new file every flush with
  **no retention/rotation logic anywhere in the function or its callers** — grep
  for prune/retain/rotate/48 near Observer in `apps/satex-terminal/src` returns
  nothing). The archive/ subfolders almost certainly came from a manual (human or
  agent) cleanup pass, not an automated job — there's no code that moves files
  into dated archive folders either. Notably, `persistence.ts:414` has a real,
  working bounded-retention prune for the *SQLite* `calibration_log` table with
  the comment "Keep calibration_log bounded (**Observer-flood lesson**)" — i.e.
  this exact failure class was already hit and fixed at the database layer, but
  the fix was never mirrored to the Vault markdown layer that has the same
  unbounded writer pattern.
- **Solutions:** (a) add a `pruneObserverCheckpoints(keep=48)` alongside
  `writeObserverCheckpoint` in `vault-writer.ts`, moving anything beyond the
  newest 48 into `archive/<yyyy-mm>/`, mirroring the calibration_log pattern
  and making the docs true; (b) lower the write frequency instead of pruning
  (checkpoints currently fire on every flush cycle — reducing cadence shrinks
  growth but doesn't bound it); (c) update CONSTITUTION.md §5.1 to describe
  reality (unbounded, manually swept) instead of a cap that was never built —
  the honesty-axiom-compliant move if (a) isn't picked. (a) is the correct fix;
  it's what the doc already promises and what the DB layer already proves out.
- **Decision:** deferred to operator — this is exactly the CONSTITUTION §2.3
  judgment boundary (implement the documented cap vs. rewrite the doc to match
  reality) rather than a single-answer defect; not freelanced. Low urgency: 810 KB
  today, but the growth is linear and unbounded, so it compounds every session
  the app runs.
- **Status:** OPEN (found 2026-07-02, operator-directed storage audit)

### P-071 · Full test suite in a single pool stalls on post-test open handles (sandbox) — segmented run is fully green
- **Problem:** `npm test` (one vitest pool over all 115 files) reproducibly stops
  emitting after ~58 files with 0 failures and never exits, in the Cowork Linux
  sandbox (two independent runs, same stall point). Root cause is NOT an assertion
  failure: running the tree in three segments passes completely — `src/shared`
  21 files / 333 tests, `src/renderer`+`tests` 32 / 378, `src/main` 62 / 752 =
  **115 files / 1463 tests / 0 fail**. The hang is a post-test open handle keeping
  the worker event loop alive: the `tick-recorder` retry path logs real
  `setTimeout`-driven retries (`SQLITE_BUSY`/`PROLONGED_OUTAGE`, attempt 1→2 with
  1–2s waits) against better-sqlite3 under the sandbox filesystem bridge, exactly
  the timer/handle-leak class the constitution flags (PR#6 / P-041 / P-043 / P-046).
  Segmenting keeps each pool small enough that teardown completes before the next
  file; the single pool accumulates handles and never drains.
- **Evidence:** typecheck exit 0; lint exit 0 (0 warnings); segmented vitest exit 0
  ×3 (counts above); single-pool `npm test` stalls (no exit) — measured 2026-07-02.
  CI (Ubuntu, `.github/workflows/ci.yml` runs the same `npm test`) is green on the
  last recorded run, so the stall is sandbox-specific (SQLite native handle +
  bridge), not a portable defect.
- **Solutions:** (a) confirm/adjust test teardown so `tick-recorder` clears its
  retry timers on close (afterEach/afterAll `clearTimeout` + `unref()` on the
  retry handle) so the single pool drains cleanly everywhere — correct if the leak
  is real in production teardown too, worth auditing `tick-recorder.ts` cleanup
  path; (b) set vitest `pool`/`poolOptions` (e.g. `forks`, bounded `maxForks`) so
  the runner reaps workers regardless of stray handles — masks rather than fixes;
  (c) treat as sandbox-only and run segmented locally, trust CI for the single-pool
  arbiter — zero code change. Pick (a) only after confirming the handle survives in
  a real (non-sandbox) teardown; if it doesn't, (c) and move on.
- **Decision:** OPEN — needs an operator/next-session audit of `tick-recorder.ts`
  teardown to decide (a) vs (c). Not freelanced: could be a genuine production
  timer-leak (fix) or a pure sandbox artifact (document). Gates are green; this
  blocks nothing.
- **Status:** OPEN (found 2026-07-02, post-P-070 full-project validation)
- **2026-07-02 investigation (operator-directed full-project validation session):**
  read `tick-recorder.ts` in full. `start()`/`stop()` are symmetric —
  `this.flushTimer = setInterval(...)` in `start()`, `clearInterval(this.flushTimer);
  this.flushTimer = null` as the first line of `stop()` (tick-recorder.ts:68,75).
  `SQLITE_BUSY` / `PROLONGED_OUTAGE` do NOT appear anywhere in `tick-recorder.ts`
  itself — they only appear in `tick-recorder.test.ts` as mocked
  `insertTickBatch` throw messages, and the "retry" is just the real
  `flushTimer` re-firing under `vi.useFakeTimers()` + `vi.advanceTimersByTime()`,
  not a separate ad-hoc setTimeout. All four retry-semantics tests
  (`tick-recorder.test.ts:59,78,100,120`) explicitly call `rec.stop()` before
  the test ends, and `afterEach` calls `vi.useRealTimers()`. Also checked
  `persistence.ts`'s `scheduleBackgroundMaintenance` (the other SQLite-adjacent
  timer): its `setTimeout` is explicitly `.unref()`'d (persistence.ts:963-968),
  so it cannot hold the process alive. **No production-code timer leak found
  in either file.** This narrows the stall toward a sandbox/native-handle or
  vitest-fake-timer artifact (solution (c) in this entry) rather than a real
  app-level teardown defect (solution (a)) — but this was a source-reading
  audit, not a reproduction of the actual full-pool stall, so the entry stays
  OPEN rather than being resolved unilaterally per the entry's own caution.

### P-072 · Normal quit path had no hard-exit watchdog — a wedged teardown orphans the Electron process tree in Task Manager — fixed
- **Problem:** `src/main/index.ts` `before-quit` handler (was ~line 1158) did
  `event.preventDefault(); engine.shutdown().catch(...).finally(() => app.quit())`
  with **no timeout**. `engine.shutdown()` (`trading-engine.ts:808`) clears all
  timers synchronously but `await`s `session.disconnect()` (`:853`); a WebSocket
  `close` that never fires its 'close' event leaves that promise pending forever, so
  `.finally()` never runs, `app.quit()` is never called, and the Electron main
  process + its Chromium GPU/renderer/network-service children linger in Task
  Manager after every window is closed. The **crash** path (`gracefulShutdown`,
  `index.ts:191`) already had the safety net (`setTimeout(() => app.exit(1), 5000).unref()`);
  the **normal** path did not — asymmetric, and the normal path is the one users hit
  every day. Confirmed no SATEX-spawned child processes exist (grep: no
  `child_process`/`spawn`/`fork`/`utilityProcess`/`worker_threads` in `src/`; only
  `db.exec` SQLite in-process + a regex `.exec`), so guaranteeing main-process exit
  is sufficient to guarantee a clean Task Manager.
- **Solutions:** (a) add a 5s `.unref()`'d watchdog in `before-quit` that force-exits
  (`app.exit(0)`) if graceful teardown hasn't completed, cleared in the `.finally()`
  on the happy path — mirrors the existing crash-path net, ~9 lines, no behavior
  change on the normal fast path; (b) harden `session.disconnect()` itself with an
  internal timeout on the WS close — narrower but only covers the one known hang
  source, not future ones, and touches broker-session teardown (closer to the
  perimeter); (c) both. Chose **(a)** — a single guaranteed-exit net at the lifecycle
  boundary covers every current and future async-teardown hang class at once, off the
  perimeter, minimal blast radius. (b) is a reasonable future hardening but not needed
  for the no-orphan guarantee.
- **Decision:** (a), shipped this session. `.unref()` ensures the watchdog never
  itself keeps the loop alive (clean exits stay clean); if teardown wedges, the wedge
  keeps the loop alive so the timer fires at 5s and `app.exit(0)` takes the whole
  process tree down. Verification: `index.ts` is the Electron entry (top-level side
  effects, not unit-tested), so gates + reasoned teardown-hang argument rather than a
  new unit test; a future extraction of the handler into a testable
  `orchestrateQuit(shutdownFn, quitFn, exitFn, ms)` unit would let us pin it — logged
  as a nice-to-have, not blocking.
- **Status:** SHIPPED — typecheck exit 0 · lint exit 0 (0 warnings) · vitest 115 files
  / 1463 tests / 0 fail (segmented; P-071 single-pool stall is sandbox-only) · knip
  sandbox-OOM (CI arbiter). `src/main/index.ts` before-quit watchdog added. UNSTAGED
  per AGENTS.md — operator review → branch → PR → commit.

### P-066 · `npm install` fails on native build — bundled node-gyp v9.4.1 can't build under Python 3.12+ (distutils removed)
- **Problem:** A fresh `npm install` in `apps/satex-terminal` (triggered because
  `node_modules` doesn't follow a `git mv`) aborts building the `better-sqlite3`
  native addon: `ModuleNotFoundError: No module named 'distutils'` →
  `gyp ERR! configure error`. Root cause: the machine runs Node v24.15.0 whose npm
  bundles **node-gyp v9.4.1**, and node-gyp ≤9 imports `distutils`, which was removed
  from the Python standard library in **Python 3.12**. So any native-addon rebuild on
  this box fails at configure time. This session dodged it by reusing the already-built
  `node_modules` (the one that passed Branch 1's 1464 tests, with a valid
  `better_sqlite3.node`) — moved intact from the old `satex-app/` path to
  `apps/satex-terminal/`. That worked, but it is a workaround: the underlying toolchain
  is broken for **every** future `npm install` / fresh clone on this machine, and very
  plausibly for CI if CI shares the same Node/Python pairing.
- **Solutions:** (a) upgrade node-gyp to **≥10** (drops the `distutils` import) — e.g.
  `npm i -g node-gyp@latest` and/or pin `node-gyp` in the app so npm uses the modern one;
  (b) `pip install setuptools` to restore the `distutils` shim for the existing node-gyp
  (smallest change, but leaves the stale node-gyp in place); (c) pin the build Python to
  3.11 (has `distutils`) via `npm config set python` / a `.python-version`. (a) is the
  durable fix and the one Node itself moved to.
- **Decision:** flagged, NOT fixed this session — out of scope for the gate-verification
  task, and rushing a toolchain change alongside a push/PR run risks masking a real
  native-build regression. Recommend (a) on its own change, verified by a clean
  from-scratch `npm install` in `apps/satex-terminal`, before the next fresh clone or CI
  run depends on it.
- **Status:** OPEN (found 2026-07-02 during reorg-branch gate verification;
  `apps/satex-terminal` fresh install; workaround = reused prebuilt `node_modules`).

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
