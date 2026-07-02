# ULTRAPLAN — swing-points degenerate-parameter guard (P-049) + workspaceStore / subsecondStore coverage (P-050 / P-051)

```
[DATE]        2026-07-01 (dawn shift, satex-psd-daily)
[STATUS]      SHIPPED — executed same session (T1–T8 all DONE; final gates 106 files / 1374 tests / 0 fail)
[BRANCH]      master @ 664c0d51b9d15da323b24d289cb717845ada183e (+ inherited unstaged P-024→P-048 backlog)
[BASELINE]    typecheck exit 0 | lint exit 0 (0 warnings) | vitest 104 files / 1340 tests / 0 fail
              (sharded 4×: 354+423+290+273; mount node_modules, Node v22) | knip exit 0 (Node-20 shim;
              pre-existing warnings only, 55 output lines)
[PERIMETER]   ZERO contact — shared chart-indicator display math + renderer Zustand stores only.
              No file under services/execution/, services/risk/, no OrderManager / kill-switch /
              interlock / Alpaca-submit reference. No APPROVAL NODES in this plan.
```

## LAYER 1 — OBJECTIVE

Close the one genuine defect found by auditing the 2026-06-29 work-layer's NEXT list —
`swing-points.ts` accepts degenerate `window` / `lookback` parameters that either fabricate
signals (window=0 ⇒ **every** bar reported as both swing-high and swing-low) or crash
(negative or fractional window ⇒ `TypeError` reading `.high` of `undefined`) — and pin the
two highest-value untested renderer stores (`workspaceStore`, `subsecondStore`) with
new-file-only regression tests.

**Success criteria (measurable):**
1. `swingHighs/swingLows(candles, 0)` → `[]` (was: n spurious swings); `(candles, -2)` → `[]`
   (was: TypeError); `(candles, 2.5)` ≡ `(candles, 2)` (was: TypeError). Proven by repro
   script + new regression tests in `indicators.test.ts`.
2. `averageVolume(candles, 2.5)` → finite floored-window average (was: TypeError).
3. New `workspaceStore.test.ts` + `subsecondStore.test.ts` pass; vitest file count 104 → 106;
   test count 1340 → ~1370 (exact counts measured, never asserted).
4. All four gates green after each major task (exit codes recorded).

**Constraints (AGENTS.md / Constitution):** off-perimeter only; no `git add`/`commit`;
python-scripted edits on EXISTING files with per-file EOL preservation; NUL/CRCR byte-scan
after every edit; unique-anchor assertion (count==1) before every replacement; CHANGELOG
entries only under the FIRST `### Fixed` / `### Added` inside `## Unreleased`; ledger updated
with full PSD entries; everything left UNSTAGED.

**Assumptions, verified:** swing-points.ts is CRLF (63 CRLF / 0 lone-LF); indicators.test.ts
is LF (411 lone-LF); both NUL/CRCR-clean pre-edit. `indicators.test.ts` already covers the
normal paths of all four files the work-layer NEXT called "untested" (divergence recorded in
Layer 6 / handoff). Store-test convention = `vi.stubGlobal('window', { satex: … })` +
`useXStore.setState(…)` reset (per `dataSourceStore.test.ts`). Vitest env supports this
(existing store tests pass).

## LAYER 2 — DOMAIN MAP

| File | Layer/domain | Role in plan | Perimeter |
|---|---|---|---|
| `src/shared/chart-indicators/swing-points.ts` | shared / chart display math | SOURCE EDIT (P-049 guard) | OFF |
| `src/shared/chart-indicators/indicators.test.ts` | shared tests | EDIT — append P-049 describe block | OFF |
| `src/renderer/stores/workspaceStore.ts` | renderer / Zustand | READ-ONLY (P-050 pins it; zero source change) | OFF |
| `src/renderer/stores/workspaceStore.test.ts` | renderer tests | NEW FILE (P-050) | OFF |
| `src/renderer/stores/subsecondStore.ts` | renderer / Zustand | READ-ONLY (P-051 pins it; zero source change) | OFF |
| `src/renderer/stores/subsecondStore.test.ts` | renderer tests | NEW FILE (P-051) | OFF |
| `CHANGELOG.md` | docs | EDIT — 1 Fixed + 1 Added entry | OFF |
| `Vault/00-Audit/PROBLEM-LEDGER.md` | vault | EDIT — P-049/050/051 entries + `updated:` bump | OFF |

Blast radius of the source edit: `swingHighs`/`swingLows` callers are `double-top.ts:39`,
`double-bottom.ts:30`, `patterns.ts:81/123` (all pass `swingWindow` opts, defaults 3/5);
`averageVolume` callers are `double-top.ts:41`, `double-bottom.ts:32`. All positive-integer
call paths are behavior-identical under the fix (`Math.floor(k)=k` for integer k;
guard only fires for k<1). Live surface: ChartPanel pattern overlay (P-034 evidence:
`ChartPanel.tsx:1148/1163`) — display-only.

## LAYER 3 — TASK TREE

- **T1 — P-049 source fix** (`swing-points.ts`, CRLF python edit)
  - T1.1 `swingHighs`: floor+guard (`const w = Math.floor(window); if (w < 1) return out`), loop bounds use `w`
  - T1.2 `swingLows`: same transform
  - T1.3 `averageVolume`: `const lb = Math.floor(lookback)` used in `start`
  - T1.4 byte-scan (NUL/CRCR 0; CRLF preserved; no lone-LF introduced); brace balance
- **T2 — P-049 repro proof** (`outputs` scratch, `satex-agent-p049-repro.mjs`): OLD vs FIX inline; window 0 / −2 / 2.5 / 3-parity
- **T3 — P-049 regression tests** (`indicators.test.ts`, LF python append): new describe, 6 `it`s
- **T4 — GATE CHECKPOINT 1** (all four, real numbers)
- **T5 — P-050 new file** `workspaceStore.test.ts` (~14 tests: tab validation, quad length/uppercase/no-op, uniqueness-swap, chartSymbol, landingWorkspace (P-048 field), hydrate success/null/throw, persist called/not-called)
- **T6 — P-051 new file** `subsecondStore.test.ts` (~10 tests: hydrate cap 1200, appendBar append/re-seal/out-of-order/trim, getBars fallback + key isolation, hydratePrefs sanitizer, getPref null)
- **T7 — GATE CHECKPOINT 2** (all four)
- **T8 — CLOSE**: CHANGELOG (P-049 first `### Fixed`; P-050/051 first `### Added`), ledger (3 entries, §Shipped top, `updated:` → 2026-07-01), handoff `Vault/Daily/2026-07-01-agent-handoff.md`, final byte-scans, patch-grep perimeter check

## LAYER 4 — DEPENDENCY DAG

```
T1 ──► T2 ──► T3 ──► T4 ──► T5 ──► T6 ──► T7 ──► T8
(T2 proves T1; T3 depends on T1; T5/T6 independent of each other but sequenced
 to keep gate deltas attributable; T8 last, always)
```
No parallel tracks (single executor); no APPROVAL NODES (nothing RISK-TOUCH).

## LAYER 5 — EXECUTION SPECS

**T1 (method):** python via bash on the MOUNT path
`/sessions/<session>/mnt/satex-app/src/shared/chart-indicators/swing-points.ts` (file tools may
NUL-pad shrinking edits — python only). Read bytes → decode utf-8 → assert each anchor
`count==1` → replace → re-encode. File is CRLF: write replacement strings with `\r\n`.
Anchors (unique by `.high` vs `.low` context):
- A1 `swingHighs` body open: `const out: SwingPoint[] = []\r\n  const n = candles.length\r\n  for (let i = window; i < n - window; i++) {\r\n    const h = candles[i]!.high` → insert `const w = Math.floor(window)` + `if (w < 1) return out` after the `n` decl; loop `i = w; i < n - w`; inner `j = i - w; j <= i + w` (inner anchored with `const h` context block).
- A2 same for `swingLows` with `const l = candles[i]!.low`.
- A3 `averageVolume`: anchor `const start = Math.max(0, n - lookback)` → `const lb = Math.floor(lookback)\r\n  const start = Math.max(0, n - lb)`.
Validation: `python3` byte-scan (0 NUL, 0 `\r\r`, lone-LF==0), `grep -c "Math.floor" == 3`, brace balance == 0 delta.
Failure mode: anchor count ≠ 1 → STOP, re-read file, re-derive anchor (divergence rule).

**T2 (method):** write `satex-agent-p049-repro.mjs` under the session outputs dir; implement
OLD and FIX variants inline (mjs cannot import the TS); run `node`; expected output:
`OLD w=0 → 7 spurious swings on a 7-bar series; FIX → 0` · `OLD w=-2 → TypeError; FIX → []`
· `OLD w=2.5 → TypeError; FIX ≡ w=2` · `w=3 OLD ≡ FIX` (parity proof). Real output pasted
into the ledger entry.

**T3 (method):** python append to `indicators.test.ts` (LF file, `\n` only) BEFORE EOF:
assert file ends `})\n`; append new block:
`describe('swing-points degenerate window/lookback (P-049)', …)` with 6 its:
window 0 highs → `[]`; window 0 lows → `[]`; window −2 → `[]` no-throw; window 2.5 ≡ window 2
(peak fixture from the existing `swingHighs` describe: closes `[1,2,3,10,3,2,1]` pattern);
`averageVolume(candles, 2.5)` = average of last 2 (`(200+300)/2=250` fixture volumes
100/200/300); `averageVolume(candles, -1)` → 0. Uses existing `candle`/`flatCandles` helpers.
Validation: vitest single-file run green (`npx vitest run src/shared/chart-indicators/indicators.test.ts`) — expect 34 tests in file (28 existing + 6) [CORRECTED at execution — the original 40/34 prediction miscounted].

**T4/T7 (method):** from mount app dir — `npm run typecheck`; `npm run lint`; `npx vitest run
--shard=k/4` (k=1..4, each its own bash call, synchronous); knip via
`NODE_OPTIONS="--require /tmp/satex-agent-node20-shim.js" npx knip` (shim: two
`Object.defineProperty` lines pinning v20.19.0 — recreate if /tmp was recycled). Expected:
T4 = 104 files / 1346 tests / 0 fail (+6); T7 = 106 files / ~1370 / 0 fail [ACTUAL: 1374 — 363+438+297+276]; knip warning
line-count unchanged (55) — new tests export nothing.

**T5 (method):** Write tool, NEW file `src/renderer/stores/workspaceStore.test.ts` (LF).
Convention: `vi.stubGlobal('window', { satex: { workspace: { setState: vi.fn().mockResolvedValue(undefined), getState: vi.fn() } } })`;
`beforeEach` resets `useWorkspaceStore.setState({ state: {...DEFAULT_WORKSPACE_STATE, quadSymbols: [...DEFAULT_WORKSPACE_STATE.quadSymbols]}, hydrated: false })`;
`afterEach(() => vi.unstubAllGlobals())`. DEFAULT state (verified `shared/types.ts:65-71`):
`{version:1, workspace:'Quad', quadSymbols:['NVDA','SPY','ES','BTC'], chartSymbol:'NVDA', landingWorkspace:'Trade'}`;
`WORKSPACE_TABS` includes `'Intel'` (P-048). Tests per Layer 3. Validation: single-file vitest green.

**T6 (method):** Write tool, NEW file `src/renderer/stores/subsecondStore.test.ts` (LF).
`makeBar(symbol,bucketMs,openMs,close=1)` builds full `SubSecondCandle`
(`{symbol,bucketMs,openMs,open,high,low,close,volume}` — `shared/types.ts:977-987`).
`beforeEach`: `useSubsecondStore.setState({ series: new Map(), prefs: {} })`. No window stub
needed (pure store). Cap tests build 1201+ bars programmatically. Validation: single-file
vitest green.

**T8 (method):** CHANGELOG python edit (detect EOL; P-046 entry shows Unreleased block near
head): assert exactly one `## Unreleased` and locate FIRST `### Fixed` and FIRST `### Added`
after it; insert entries directly under those headers (+ blank-line hygiene); verify
placement by printing ±3 lines. Ledger python edit: assert `updated: 2026-06-29` count==1 →
bump; insert P-049/P-050/P-051 full PSD entries at top of `## Shipped — awaiting verification`
(anchor `### P-048` count==1 → insert before it). Handoff: NEW file, Write tool. Final:
byte-scan every touched file; patch-grep the source diff for perimeter tokens
(`OrderManager|risk-gates|KillSwitch|submitOrder|arm`) — expect zero.

## LAYER 6 — RISK AUDIT (self-adversarial)

- **"Is window=0 really a defect?"** Yes by the layer's own convention: every sibling guards
  its degenerate (`brickSize <= 0`, `period < 1` (P-040), `window < 2`, `reversalAmt <= 0`).
  A 0-window "swing at every bar" also feeds `detectDoubleTops` O(n²) pair scans → garbage
  patterns + quadratic churn on the live ChartPanel overlay path. Negative/fractional crash
  the renderer's compute. Latent (defaults 3/5, no UI wiring today) — exactly like P-040 when
  it shipped; guard now, cheaply, before CHART wiring makes it live.
- **"Does flooring change any legitimate caller?"** No: all in-repo call-sites pass integers
  ≥3 (defaults) — `Math.floor` is identity there; guard unreachable. Proven further by T2
  parity check + the untouched existing 34-test suite.
- **"Could the CRLF edit corrupt the file?"** The known bridge hazard — mitigated by python
  byte-level edit, count==1 anchors, post-edit NUL/CRCR/lone-LF scan, and `git show HEAD:` as
  the recovery path (P-021 lineage).
- **"Anchor uniqueness?"** `for (let i = window; …)` appears TWICE — anchors therefore
  include the `.high`/`.low` context lines (verified unique by construction; still asserted
  count==1 at edit time).
- **"Zustand reset hazards?"** `setState` shallow-merges: resetting the `state` key replaces
  the whole `WorkspaceState` object; `series`/`prefs` keys replaced wholesale. No cross-test
  bleed. `persist` failures are `.catch`-guarded in the store (no unhandled rejection noise).
- **"Empty/degenerate results (scar-tissue rule d)?"** Explicit tests: `getBars` unknown key
  → `[]`; hydrate-throw → defaults + `hydrated:true`; `averageVolume` lookback ≤0 → 0;
  window<1 → `[]`. Nothing resolves `[]` silently where data was expected.
- **"Teardown/unmount class?"** No timers/observers/listeners in any touched file (stores are
  plain Zustand; tests use stubGlobal + unstubAllGlobals).
- **"Perimeter?"** Zero contact (Layer 2 map); closing patch-grep enforces it.
- **What the work-layer NEXT got wrong** (Constitution 0.5, recorded for the handoff): its
  "untested pure chart-indicator files (ema, rsi, swing-points, double-bottom)" claim is
  stale — all four are covered in the shared `indicators.test.ts` (P-034 put the
  double-top/bottom negative-price regressions there). The real residue was the degenerate
  window/lookback hole. The "untested Zustand stores" pointer was accurate.

## LAYER 7 — THIS DOCUMENT

Assembled plan = Layers 1–6. Executor works T1→T8 in DAG order, gates at T4/T7, divergence
rule in force (spec wrong ⇒ fix reality AND this file). All work left UNSTAGED for operator
review. Ledger IDs: **P-049** (defect), **P-050** (workspaceStore coverage), **P-051**
(subsecondStore coverage).
