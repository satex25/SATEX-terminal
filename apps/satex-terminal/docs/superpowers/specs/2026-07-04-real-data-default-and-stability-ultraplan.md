# ULTRAPLAN — Real-Data-by-Default, Historical Day Fix, Stability

[DATE] 2026-07-04
[STATUS] DRAFT — awaiting section-by-section review
[SCOPE] Phase A only (per D1: "Phased: stability + real data first"). Teaching the
Brain/AI Advisor from replayed history is explicitly OUT OF SCOPE — deferred to a
future, separate ultraplan.

---

## §1 — Objective Clarification

**Core goal.** When the operator has valid Alpaca keys stored, the terminal should
show real market data (or the last real close, frozen, when markets are shut) by
default with no hidden extra step, the existing Historical Day replay UI should
actually work end-to-end instead of failing with a misleading message, and the app
should degrade gracefully instead of black-screening when something throws outside
the center workspace column.

**Success criteria** (tied to the gate bar + measurable behavior, not vibes):
- Four gates green (`typecheck`, `lint`, `test`, `knip`) after every task.
- A fresh `npm run dev` boot with valid stored paper (or live) keys and
  `SATEX_USE_SIMULATOR` unset results in `dataSource === 'live'` with zero manual
  clicks (this is already true today at the engine level — see Assumptions; the
  fix is closing the *mid-session* gap and making the state legible).
- Saving credentials in a session that is already running and already past boot
  surfaces an explicit, one-click path to start using them — no silent "nothing
  happened."
- Clicking "⤓ Fetch Day" while the active feed is the Simulator tells the operator
  *why* it can't return real bars, before or instead of a generic "no bars"
  message, and does not read as broken/misleading in real-feed mode either.
  With a live Alpaca feed, Fetch Day returns real bars for a valid session date.
- A thrown error in `TopBar` or either side rail degrades that one region, not the
  whole renderer tree (mirrors the P-044 fix already shipped for the center column).
- No regression to existing 1,287+ tests; new coverage added for every new branch.

**Constraints** (Constitution numbers cited):
- 0.2 / 3.7 — no task here touches order placement, arming, or the perimeter
  (execution/, risk/, kill switch, interlocks). Confirmed: every task below is
  UI/data-feed/health-signal/error-boundary work, zero perimeter contact.
- 2.5 — respect existing invariants: data-feed switch goes only through
  `AlpacaBrokerSession.connect()`/engine's `setDataSource`, never bare
  `market.start()`; SIM badges render only from `isSyntheticFeed`/canonical gates,
  never inline duplicated logic; clean up every new observer/timer/listener.
  §2.9 file-bridge hazard — all edits to existing tracked files go through the
  python-through-mount technique with a byte-scan after, never a naive shrinking
  Edit-tool call on a large file.
- 0.6 — all four gates before any commit; no `--no-verify`.

**Environment.** Renderer (`src/renderer/`) for UI/error-boundary/nudge-copy work;
main (`src/main/services/historical-importer.ts`, `market-data.ts`) for the Fetch
Day root cause; `src/shared/health/` for the heap-alert statistics (carried over
from the earlier "System Health module" analysis this session — folding it in here
since it's the same "the terminal is telling the operator something misleading"
class as Fetch Day). Broker facet: `MarketDataSource` (Simulator vs LiveMarket).
Data feed: both — this plan must work correctly in Simulator (clear messaging) and
in live Alpaca (actual bars).

**Assumptions** (flagging which are verified vs. inherited):
- VERIFIED (`trading-engine.ts:486`): `useAlpaca = !env.useSimulator && !!keyId &&
  !!secretKey` — a fresh boot with stored creds and no forced-simulator env var
  already selects `dataSource = 'live'` automatically. The operator's "still shows
  fake data after saving keys" experience is therefore almost certainly a
  **mid-session** save (engine already running in Simulator) or the Settings
  toggle I relocated today (P-087) hasn't been clicked yet — not a boot-time bug.
- VERIFIED (`SettingsModal.tsx:222-243`): `savePaper()`/`saveLive()` call
  `window.satex.setCredentials()` then `reconnectAlpaca()` on success. Neither
  calls `hydrateFeed()` (the new Market Data Feed section's store refresh) nor
  `setDataSource('live')`. So `liveAvailable` in the UI can go stale for the
  rest of that session, and the active source never changes on its own.
  `getDataSource()` itself (`trading-engine.ts:1316-1322`) is a cheap live read
  (`!!getAlpacaCreds('paper')`), not cached — a fresh `hydrate()` call is enough.
- VERIFIED (`historical-importer.ts:141-147`, `market-data.ts:184`): Simulator's
  `getBars()` unconditionally returns `[]`. The importer cannot distinguish
  "Simulator, will never return bars" from "real feed, this particular window
  had zero trades" and emits one message for both.
- VERIFIED (`App.tsx:295-374`): `ErrorBoundary` wraps only the `bb-col-center`
  workspace content; TopBar, both side rails, and bottom panels render outside
  any boundary.
- VERIFIED (`health-signals.ts` `computeMemGrowthPctPerHr`, `diagnose.ts:47/49`):
  heap-growth alert is a 2-point (first-vs-last sample) slope over a rolling
  60-sample ring, thresholds 10%/hr degraded, 25%/hr critical, with a remediation
  string ("restart the worker process") that doesn't match Electron's single
  main-process architecture.
- ASSUMED, not yet verified: whether `npm run dev`'s cold-start time has any
  fixable contributor beyond Vite's inherent transform cost. Per the operator's
  own answer this is descoped to a quick sanity check only (Task Group 5).

**Unknowns.** None blocking — every item above was verified against the actual
code this session. No AskUserQuestion needed for this layer; the three answers
already given (keys freshly saved, `npm run dev`, fix existing Historical Day UI)
resolve the only real ambiguities that existed going in.

---

## §2 — Domain Mapping

**Classification.** Primarily a **functional + operational** problem (state
reflected to the operator lags real state; one code path produces a misleading
message) with a smaller **temporal** slice (the health-signal's growth-rate window
is too short to be statistically meaningful) and a **resilience** slice (crash
containment). No **data-integrity** or **risk** domain contact — no order, no risk
limit, no kill-switch code is touched.

**SATEX structural touch-map:**
- `services/market-data/` — Simulator's `getBars()` stub (root cause, Fetch Day).
- `services/system/` (via `src/shared/health/`) — heap-growth alert statistics.
- Renderer: `components/TopBar.tsx`, `components/modals/SettingsModal.tsx`,
  `panels/ReplayPanel.tsx`, `panels/ChartPanel.tsx`, `lib/feed-status.ts`,
  `lib/chart-backfill.ts`, `App.tsx`, `stores/dataSourceStore.ts` (read-only reuse).
- Broker facet: `MarketDataSource` (read path only — `getBars`). `OrderRouter`,
  `AccountSyncer`, `SymbolResolver`, and the execution/risk perimeter are **not**
  in blast radius for any task in this plan.
- Load-bearing invariants in blast radius: "SIM/SUB badges render only from
  canonical gates" (§2.5) — Task Group 3's Fetch Day gating must reuse
  `isSyntheticFeed`, never duplicate the check inline. "Clean up what you create"
  (§2.5) — any new listener in the credential-save-to-feed-hint flow needs a
  cleanup path.

---

## §3 — Task Decomposition

### Task Group 1 — Close the "keys saved, still simulator" gap
**Purpose:** make the already-correct boot-time behavior legible mid-session, and
give the operator one obvious click to start using a live feed once it's available.

- 1.1 After a successful `savePaper()`/`saveLive()` + `reconnectAlpaca()`, call
  `hydrateFeed()` so the Market Data Feed section's `liveAvailable` reflects reality
  immediately, no modal-reopen required.
  - Inputs: existing `useDataSourceStore` hydrate action (already wired in the
    modal's open-effect). Outputs: `SettingsModal.tsx` edit only.
- 1.2 When `liveAvailable` flips true while `feedSource === 'simulator'` inside the
  Settings modal, show an inline highlighted prompt in the Market Data Feed section
  ("Live Alpaca is now available — switch from Simulator?") instead of a silent,
  easy-to-miss state change in a segmented control the operator isn't looking at.
  - Purely additive JSX + a `useEffect` watching the two store fields; no new store,
    no IPC change.
- 1.3 Do **not** auto-switch the running engine's data source without a click. A
  running session's data source is a deliberate choice (the existing confirm dialog
  already treats switching to live as consequential — clears sim positions). Making
  1.2 a prompt instead of an automatic flip preserves that consent model. This is a
  design decision, not left open — no AskUserQuestion needed, it follows directly
  from the existing confirm-before-live-switch pattern already in the codebase.

### Task Group 2 — Extend the "why is this simulated" signal to all hours
**Purpose:** today `planLastSessionBackfill`'s no-creds nudge only fires when the
market is closed; during market hours with the feed still on Simulator there is no
banner at all beyond the small per-symbol SIM badge.
- 2.1 Extend the existing off-hours nudge banner in `ChartPanel.tsx` to also render
  (with adjusted copy) when the market is open but the active feed is Simulator —
  reuse `isSyntheticFeed`/`feed-status.ts`, do not add a second, parallel check.
- 2.2 Correct the nudge's stale copy ("Settings → Data Source") to point at the
  actual current section name. Fold in a one-line rename pass: since P-087 there are
  now two similarly-named Settings sections — "Alpaca · Paper/Live Trading"
  (credentials) and "Market Data Feed" (the sim/live switch). Cross-link them in
  copy so a user in one section knows the other exists.

### Task Group 3 — Fix the Fetch Day misleading-error root cause
**Purpose:** the diagnosis already done earlier this session, now formally scheduled.
- 3.1 `historical-importer.ts` — split the single "No bars returned…" reason string:
  detect Simulator-backed `MarketDataSource` (no real feed exists at all, will never
  return bars for any date) vs. a genuine zero-bars real-feed result (closed
  market/holiday/too-recent date), and return a distinct, accurate reason for each.
- 3.2 `ReplayPanel.tsx` (`HistoricalImporterRow`) — gate the "⤓ Fetch Day" button's
  hint/disabled-adjacent state using `isSyntheticFeed`, so the operator sees "this
  needs a live feed" before clicking, not only after a failed attempt.
- 3.3 Add/extend unit coverage for the new branch in `historical-importer.ts`
  (Simulator-source vs. real-feed-zero-bars), consistent with the file's existing
  test patterns.

### Task Group 4 — Heap-growth alert: fix the statistics and the remediation copy
**Purpose:** from the earlier "System Health module" screenshot analysis — a 2-point
slope over a 60-sample ring produces false CRITICAL alerts from ordinary GC sawtooth,
and "restart the worker process" doesn't match a single-process Electron app.
- 4.1 Replace the first-vs-last 2-point slope in `computeMemGrowthPctPerHr` with a
  least-squares linear regression (or median-of-medians) over the full sample
  window, keeping `MEM_GROWTH_MIN_SAMPLES`/`MEM_GROWTH_MIN_SPAN_MS` gates as-is.
  Pure function, already unit-testable in isolation.
- 4.2 Correct `diagnose.ts`'s remediation string for `memGrowth()` to something
  accurate for this architecture (e.g. "Restart the app" or "Open Task Manager /
  Activity Monitor and check the SATEX process" — not "the worker process," which
  implies a separate process that doesn't exist here).
- 4.3 Re-tune or re-verify `memGrowthDegradedPctPerHr`/`memGrowthCriticalPctPerHr`
  against the new estimator's typical noise floor (may need a slightly different
  threshold since a regression-based slope is less noisy than a 2-point one —
  verify with a synthetic ring of realistic GC-sawtooth samples in the test).

### Task Group 5 — Crash isolation beyond the center column
**Purpose:** the parallel dev-session screenshot showed a `TopBar` throw
(`FeedSwitch is not defined`) unmounting the entire renderer tree — P-044's
ErrorBoundary doesn't cover `TopBar` or either rail.
- 5.1 Wrap `TopBar` in its own keyed `ErrorBoundary` in `App.tsx`.
- 5.2 Wrap the left rail (Watchlist) and right rail similarly.
- 5.3 Confirm the kill-switch chord (Constitution §3.4 / P-044's own requirement)
  stays reachable from within each new boundary's fallback state — this is a hard
  requirement carried over from P-044, not optional polish.
- ⚠️ Note (not RISK-TOUCH): this touches rendering only, not the kill switch's own
  code — but because the kill chord's reachability is the acceptance criterion,
  Task 5.3 needs an explicit manual/visual check in addition to gates, not just
  gates alone.

### Task Group 6 — Historical Day UX polish ("extremely lovely" scroll-through)
**Purpose:** the operator's own words — once Fetch Day actually returns real bars
(Task Group 3), make reviewing that day pleasant, not just functional.
- 6.1 Audit `ReplayPanel.tsx`'s existing scrub/step controls against the polish bar
  (P3: calm, fast, legible) — identify concrete, scoped improvements (e.g. keyboard
  step, visible progress/position within the day, clearer play/pause affordance) —
  this sub-task's exact scope is intentionally left to Layer 5's execution spec
  rather than over-specified here, since it's UI polish, not a structural change.
- 6.2 No new remote data source, no new persistence — reuse the existing
  `HistoricalImporter`/`ReplayPanel` machinery end to end.

### Task Group 7 — Dev-launch speed: sanity check only (descoped)
**Purpose:** operator confirmed this is about `npm run dev` specifically, i.e.
expected Vite cold-start cost, not a packaged-app regression.
- 7.1 One-time check: is there a synchronous, non-Vite-related delay in
  `main/index.ts`'s boot path before the `dom-ready` watchdog's 8s window (e.g. a
  blocking DB migration, a blocking network call with no timeout)? If yes, note it
  as a candidate fix. If the delay is purely Vite transform/HMR warmup, do nothing
  further — do not chase inherent dev-tooling cost.
- 7.2 No code changes unless 7.1 finds a genuine, fixable, non-Vite contributor.

---

## §4 — Dependency + Ordering

**Ordered execution sequence** (topological; groups with no listed dependency can
run in parallel within their slot):

1. **Slot A (parallel, independent):** Task Group 1 (credential→feed-hint gap),
   Task Group 4 (heap-growth statistics), Task Group 5 (crash isolation), Task
   Group 7.1 (launch-speed sanity check). None of these four share files or state.
2. **Slot B (depends on nothing new, but logically before Group 6):** Task Group 3
   (Fetch Day root-cause fix) — must land before Task Group 6, since polishing a
   scroll-through UI that still can't fetch real bars is wasted motion.
3. **Slot C (after Slot A's Task Group 1, since it reuses the same nudge-copy
   surface):** Task Group 2 (always-visible sim-feed signal) — sequenced after
   Group 1 so the corrected Settings section names (if any renamed) are copy-stable
   before Group 2 writes cross-link text pointing at them.
4. **Slot D (after Slot B):** Task Group 6 (Historical Day polish) — depends on
   Group 3 actually returning real bars to review.

**Approval nodes.** No task in this plan is RISK-TOUCH (Constitution §2.4/§3.7)
and none is a one-way door — every change is reversible via normal git revert, and
none touches execution, risk gates, kill switch, or arming. Per §2.7's own
definition, this plan requires no human approval **node mid-execution** beyond the
plan-review gate itself (this document). Task 5.3's manual kill-chord check is a
verification step, not an approval gate.

---

## §5 — Execution Specification

### Task Group 1
- **Method:** call `hydrateFeed()` inside the existing `savePaper`/`saveLive`
  success branches (after `reconnectAlpaca()` resolves); add a small
  `useEffect([feedLiveAvailable, feedSource])` in the Market Data Feed section that
  sets a local `justBecameAvailable` flag when `liveAvailable` flips `false→true`
  while still on `simulator`, rendering one extra `form-hint`-styled line with a
  "Switch now" button that calls the existing `requestFeedSwitch('live')`.
- **Artifacts:** `SettingsModal.tsx` edit only (python-through-mount, byte-scan
  after). No new files, no new IPC channel, no new store.
- **Validation:** typecheck/lint/test/knip green; a targeted RTL-style test (or
  existing modal test file, if one exists — check first) asserting the hint renders
  when `liveAvailable` transitions true while `source` stays `'simulator'`, and does
  not render once the operator switches.
- **Failure modes:** stale `liveAvailable` if `reconnectAlpaca()` rejects — already
  handled by the existing `paperMsg`/`liveMsg` error paths; the new hint simply
  never appears in that case, no new failure surface introduced.
- **Fallback:** if reusing `requestFeedSwitch` directly proves awkward from this
  effect's scope, fall back to just linking focus to the existing segmented control
  rather than duplicating switch logic.

### Task Group 2
- **Method:** extend the boolean condition already gating `ChartPanel.tsx`'s
  off-hours nudge banner (lines ~340-360) with an additional OR-branch:
  `isSyntheticFeed(activeSymbol, feedStatus) && dataSource === 'simulator'`,
  independent of market-hours state. Reuse the existing `sessionStorage`-latched
  dismissal so it doesn't nag every render.
- **Artifacts:** `ChartPanel.tsx` edit; possibly a one-line export addition to
  `feed-status.ts` only if a helper is missing (unlikely — `isSyntheticFeed` already
  covers exactly this check).
- **Validation:** gates green; existing `chart-backfill.test.ts`/ChartPanel test
  coverage extended for the market-open + simulator-active case.
- **Failure modes:** double-firing both the off-hours and always-visible variants
  simultaneously — guard with a single derived boolean, not two independent renders.
- **Fallback:** if `ChartPanel.tsx` is judged too risky for the CRLF/large-file edit
  hazard (§2.9), do the edit via python-through-mount exclusively, never the raw
  Edit tool, consistent with this session's own established practice.

### Task Group 3
- **Method:** in `historical-importer.ts`, check `this.data instanceof
  MarketSimulator` (or a lighter capability check, e.g. a `isLiveCapable` flag/method
  the facet already exposes if one exists — verify at implementation time rather
  than assuming a class check is the cleanest path) before formatting the "no bars"
  reason string; branch to a distinct `'Simulator has no historical data — switch to
  the live Alpaca feed in Settings → Market Data Feed to fetch a real day.'` message.
  In `ReplayPanel.tsx`, read the same signal (via `isSyntheticFeed` or the store's
  `source` field, whichever the panel already has closest at hand) to show a
  pre-emptive inline note near the Fetch Day button when in Simulator.
- **Artifacts:** `historical-importer.ts`, `ReplayPanel.tsx` edits; new/extended
  test cases in `historical-importer`'s existing test file.
- **Validation:** gates green; a new unit test asserting the Simulator-source branch
  returns the new distinct message; existing zero-bars-on-real-feed test (if present)
  still passes unchanged.
- **Failure modes:** false-classifying a real feed that legitimately has zero bars
  as "Simulator" (or vice versa) — mitigate by checking the actual live class/facet
  identity, not a heuristic on the returned array.
- **Fallback:** if a clean capability check isn't available on the facet, add one
  (a `readonly kind: 'simulator' | 'live'` on `MarketDataSource` implementations) —
  small, additive, no perimeter contact.

### Task Group 4
- **Method:** replace the 2-point slope in `computeMemGrowthPctPerHr` with an
  ordinary-least-squares fit over all samples in the window (slope in MB/ms,
  converted to %/hr against the window's starting heap value). Keep the existing
  minimum-sample and minimum-span gates. Update `diagnose.ts`'s `memGrowth()`
  remediation string.
- **Artifacts:** `health-signals.ts`, `diagnose.ts` edits; extend
  `health-signals.test.ts` (or equivalent) with a synthetic sawtooth-noise fixture
  that the old 2-point method would have falsely flagged CRITICAL and the new
  regression method correctly reads as flat/degraded-only.
- **Validation:** gates green; new test explicitly encodes "sawtooth GC noise does
  not trip CRITICAL" as a regression guard.
- **Failure modes:** a regression fit still won't distinguish real leaks from a
  long, slow, real climb — that's fine, it's supposed to catch real climbs; the
  fix targets false positives from noise, not sensitivity to true leaks.
- **Fallback:** if OLS proves noisier than expected in practice, fall back to a
  median-of-first-half vs. median-of-second-half comparison — still more robust
  than 2 raw points, simpler than a full regression.

### Task Group 5
- **Method:** wrap `<TopBar />` and each rail's JSX in `App.tsx` with the same
  `ErrorBoundary` component already imported and used for the center column,
  each with its own `key` and a minimal fallback (e.g. "Top bar unavailable —
  reload" for TopBar, given its buttons are not safety-critical read state).
- **Artifacts:** `App.tsx` edit only, reusing the existing `ErrorBoundary` import.
- **Validation:** gates green; a test that mounts `App` with a component forced to
  throw in place of TopBar's content and asserts the rest of the tree (rails,
  center column) still renders — mirrors however P-044's original center-column
  test was structured, if one exists (check first, follow its pattern).
- **Failure modes:** a boundary around TopBar could theoretically hide a kill-chord
  affordance if that chord lives inside TopBar's subtree — Task 5.3 exists
  specifically to verify this is not the case (grep + a manual screenshot check
  post-implementation, not just an automated assertion).
- **Fallback:** if the kill chord does live inside TopBar, render it as a sibling
  outside the new boundary (a small structural reorg, still zero perimeter-code
  contact — this only touches where a button renders, not what it does).

### Task Group 6
- **Method:** scoped at implementation time per 6.1's audit findings; likely
  candidates (to confirm against the real component, not assumed): visible
  date/session label while scrubbing, keyboard arrow-key stepping, a compact
  progress indicator. No new remote data path.
- **Artifacts:** `ReplayPanel.tsx` and/or its subcomponents only.
- **Validation:** gates green; any new interactive control gets its own test.
- **Fallback:** if 6.1's audit finds nothing concretely broken beyond Group 3's
  fix, this task shrinks to "verify polish is already adequate" and closes with a
  short note rather than forcing invented scope.

### Task Group 7
- **Method:** read `main/index.ts`'s boot sequence start-to-finish once, looking
  for a synchronous blocking call before first paint; time it with a console
  timestamp diff if unclear from reading alone.
- **Artifacts:** none, unless 7.1 finds something — in which case scope a minimal,
  separate fix and re-run this layer for it.
- **Validation:** N/A unless a fix is scoped.

---

## §6 — Risk + Ambiguity Audit

**CRITIC pass.**
- Assumption check: "boot-time already picks live correctly" was verified from the
  actual line, not inferred — low risk of being wrong, but worth a smoke-test after
  Task Group 1 ships (start the app fresh with valid stored keys, confirm it boots
  live) since no automated test currently exercises the *real* Alpaca boot path
  end-to-end (existing tests presumably mock `AlpacaClient`).
- Cleanup/teardown: Task Group 5's new boundaries need the same unmount discipline
  as everything else in this codebase's recidivist leak class (§2.5) — but
  `ErrorBoundary` itself is already a proven, reused component; no new
  observer/timer/listener is introduced by this plan anywhere. Verified: none of
  Task Groups 1-7 add a `setTimeout`, `setInterval`, `ResizeObserver`, or raw event
  listener. Task Group 4 only reads from the existing `memSamples` ring, doesn't
  add a new one.
- Left out and now added back in: Task 5.3 (kill-chord reachability check) was
  nearly left as "should be fine" — added as an explicit verification step because
  P-044's own history shows this exact class of gap (chord unreachable from an
  error state) has bitten this repo before.
- Worst case if Task Group 3 is wrong: a real, non-Simulator feed with a
  legitimately empty result window gets mislabeled "Simulator has no historical
  data" — confusing but not unsafe; caught by the explicit test in §5's validation
  step before merge.

**RISK-AGENT pass** (Constitution §2.4/§3.7 perimeter check).
- Order/execution path (`services/execution/`) — NOT touched by any task.
- Risk gates (`services/risk/`) — NOT touched.
- Kill switch — NOT modified; Task 5.3 only *verifies reachability*, does not
  change kill-switch code.
- Live-mode arming interlock / MAY-TACTICS — NOT touched.
- Credentials — Task Group 1 calls existing `setCredentials`/`reconnectAlpaca` IPC,
  does not add a new credential-handling path or touch `safeStorage` internals.
- IPC — no new channel added or Zod schema changed anywhere in this plan.
- **Verdict: no veto.** Every task stays inside UI, market-data-read, and
  health-signal code. Nothing here proposes risk-per-trade, live-capital action,
  self-modifying risk parameters, or a safety-layer bypass.

---

## §7 — Final Plan Assembly

**Decision log:**
- D1 (prior turn): "Phased: stability + real data first" — accepted; this plan is
  Phase A only.
- Layer-1 clarifiers (prior turn): Alpaca paper+live keys freshly stored; slowness
  is `npm run dev`-specific; "lovely scroll-through" means fix the existing
  Historical Day Replay UI, not build new — all three folded into §1/§3/Group 7.

**Ordered execution sequence** (repeated from §4 for the record): Slot A
{Group 1, Group 4, Group 5, Group 7.1} parallel → Slot B {Group 3} → Slot C
{Group 2, depends on Group 1} → Slot D {Group 6, depends on Group 3}.

**Acceptance criteria (gate-stated):**
- `npm run typecheck` (both configs) exit 0 after every task group lands.
- `npm run lint` exit 0, 0 warnings.
- `npm test` — all existing tests still pass; new tests added per Task Groups 1-5
  all green (targeted runs per this session's established sandbox practice; full
  suite is CI's job per §2.9).
- `npm run knip` — run if sandbox memory allows; otherwise CI is the arbiter,
  per documented §2.9 limitation.
- Manual/visual check: Task 5.3's kill-chord reachability from each new boundary's
  fallback state (screenshot or direct verification, not just an assertion).

**Out of scope, explicitly:** teaching the Brain/AI Advisor from replayed history
(deferred, per D1, to its own future ultraplan); any packaged-app (`pack:win`)
performance work; any change to `services/execution/`, `services/risk/`, kill
switch, or arming interlocks.

---

**STATUS: DONE** — blueprint written to
`apps/satex-terminal/docs/superpowers/specs/2026-07-04-real-data-default-and-stability-ultraplan.md`.
Awaiting section-by-section review.
