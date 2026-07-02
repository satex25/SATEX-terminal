# ULTRAPLAN — Indicator-settings persistence coverage (+ electron-store survey)

```
[DATE]      2026-07-02 (dawn planner RE-RUN, 05:14 — second session of the day)
[STATUS]    SHIPPED 2026-07-02 session 2 — T1-T5 all DONE; gates 116 files / 1463 tests / 0 fail
[PICK PATH] Idempotency rule: today's first blueprint (main-service-persistence-coverage)
            is SHIPPED with nothing REMAINING → inherited its handoff NEXT pointer:
            "indicator-settings.ts (third JSON-in-markdown sibling, same harness shape),
            then survey self-eval-store.ts / alpaca-mode.ts before assuming the pattern".
[BASELINE]  typecheck exit 0 | lint exit 0 (0 warnings) | vitest 115 files / 1447 tests /
            0 fail (sharded 4×: 387+452+316+292) | knip exit 0 (55 lines) — byte-exact
            match with the 05:0x session's final stamp. This ALSO discharges that
            handoff's request (1): P-059 independently re-verified. Node v22.22.3,
            master @ 664c0d5 + inherited unstaged P-024→P-059 backlog. knip shim
            recreated at $HOME/satex-agent/node20-shim.js ($HOME recycled).
```

## Layer 1 — OBJECTIVE

Pin the persistence + sanitize contract of the last **zero-coverage JSON-in-markdown
settings service** — `src/main/services/indicator-settings.ts` (`IndicatorSettingsService`:
get/set/reload, `parseJsonFence` :116-124, `sanitize` :128-161, `clampInt` :163-166) —
with a NEW co-located vitest suite in the proven `subsecond-prefs.test.ts` real-tmpdir
convention, and record **survey verdicts** for `self-eval-store.ts` / `alpaca-mode.ts`
(read this session; the tmpdir pattern does NOT fit them — evidence in Layer 6).

**Success criteria (measurable):**
- NEW `src/main/services/indicator-settings.test.ts` — 16 tests green.
- vitest: 115 → **116 files**, 1447 → **1463 tests**, 0 fail.
- typecheck exit 0; lint exit 0 (0 warnings); knip exit 0, no new lines vs 55-line baseline.
- `indicator-settings.ts` **byte-for-byte unchanged** (new-file-only session).

**Constraints:** off trading-safety perimeter (chart-toggle persistence routes no order);
new-file-only; nothing staged/committed; new files LF; real gate numbers only.

**Assumptions (all verified this session at file:line):**
- `DEFAULT_INDICATOR_SETTINGS` = `{version:1, enabled:{ema:true, rsi:false, 'double-top':
  false, 'double-bottom':false, fibonacci:false, 'pivot-points':false}, emaPeriods:[9,21],
  rsiPeriod:14, fibLookback:50, legendVisible:true}` (`src/shared/chart-indicators/types.ts:115-129`).
- `INDICATOR_IDS` = 6 ids (`types.ts:24-26`); `EMA_PERIODS` = `[9,21,50,200]` (`types.ts:29`).
- Clamps: rsiPeriod [2,200], fibLookback [5,1000], `Math.round` + finite-check
  (`indicator-settings.ts:144-145,163-166`).
- Service ctor takes `projectRoot`; file at `<root>/Vault/Settings/indicator-toggles.md`
  (`indicator-settings.ts:61-63`); `get()` caches (:38-42); `reload()` re-reads (:54-57)
  — reload is UNIQUE to this service vs the two P-059 siblings; test it.
- Preamble line rendered: `# SATEX — Chart Indicator Settings` (:100).

## Layer 2 — DOMAIN MAP

| File | Role | Touch |
|---|---|---|
| `src/main/services/indicator-settings.test.ts` | NEW test suite | create |
| `src/main/services/indicator-settings.ts` | SUT | read-only |
| `src/main/services/self-eval-store.ts`, `alpaca-mode.ts` | surveyed, verdicts only | read-only |
| `src/shared/chart-indicators/types.ts` | fixture imports (via `@shared/chart-indicators` barrel) | read-only |
| `Vault/00-Audit/PROBLEM-LEDGER.md`, `satex-app/CHANGELOG.md`, `Vault/Daily/2026-07-02-agent-handoff.md` | bookkeeping | python-edit |

Domain: system persistence (flat `services/` layer — P-058 ruling pending, flat is
canonical). Layer: main. **RISK-TOUCH: none; no approval nodes.**

## Layer 3 — TASK TREE

- **T1 · indicator-settings.test.ts** (16 tests)
  - T1.1 write the file (test list in Layer 5)
  - T1.2 targeted run: `npx vitest run src/main/services/indicator-settings.test.ts` → 16 pass
  - T1.3 byte scan: 0 NUL, 0 `\r\r`; SUT byte-unchanged (`git diff --stat` shows no src change)
- **T2 · full gate bar** — typecheck · lint · vitest sharded 4× · knip (Node-20 shim)
- **T3 · ledger** — NEW P-060 (this coverage, SHIPPED w/ gate stamp) + NEW P-061
  (defaults-path aliasing hazard, OPEN — evidence Layer 6); `updated:` stays 2026-07-02
- **T4 · CHANGELOG** — one bullet under the FIRST `### Added` in `## Unreleased`
- **T5 · handoff** — APPEND "Session 2" section to `Vault/Daily/2026-07-02-agent-handoff.md`
  (same-day same-task file, not an "older handoff"; append-only, never rewrite Session 1)
  + flip this blueprint's status

## Layer 4 — DEPENDENCY DAG

```
T1.1 ─► T1.2 ─► T1.3 ─► T2 ─► T3 ─► T4 ─► T5
```
Strictly sequential; no parallel-unsafe steps; no approval nodes.

## Layer 5 — EXECUTION SPECS

### T1 — `src/main/services/indicator-settings.test.ts` (NEW, LF)

Method: Write tool (new file — bridge-safe), then LF-verify via python byte-read.
Harness: `mkdtempSync(join(os.tmpdir(),'satex-indtoggles-'))` in `beforeEach`,
`rmSync(tmpdir,{recursive:true,force:true})` in `afterEach` — byte-mirror of
`subsecond-prefs.test.ts:24-31`. Import `{ IndicatorSettingsService }` from
`./indicator-settings`; `{ DEFAULT_INDICATOR_SETTINGS, EMA_PERIODS, INDICATOR_IDS }`
from `@shared/chart-indicators`. Local helper `writeSettingsFile(json: string)` renders
a minimal markdown doc with a ```json fence at
`<tmpdir>/Vault/Settings/indicator-toggles.md` (mkdirSync recursive first).

Tests (contract → assertion):
1. no file → `get()` deep-equals `DEFAULT_INDICATOR_SETTINGS` AND does not create the
   file (get is read-only — vault writes can fail; get() is on the boot hot path).
2. round-trip: `set()` a full custom valid settings (ema+rsi enabled, emaPeriods
   `[50,200]`, rsiPeriod 21, fibLookback 100, legendVisible false) → FRESH service
   `get()` deep-equals it (file really persisted).
3. `set()` echo: returns the sanitized object it wrote.
4. cache: after `get()`, overwrite the file on disk with different valid JSON → same
   instance `get()` still returns the first result (documented cache contract :37-42).
5. `reload()`: after the same on-disk overwrite, `reload()` returns the NEW content
   (the "useful after manual edits" contract :53-57 — unique to this service).
6. enabled sanitize: unknown id key (`macd`) never reaches output (output keys are
   exactly the 6 known ids); non-boolean values (`'true'`, `1`, `null`) → default for
   those ids; valid booleans honored.
7. emaPeriods: invalid members (`7`, `'21'`, `null`) filtered, valid kept (`[9,7,50]`
   → `[9,50]`).
8. emaPeriods all-invalid/empty → defaults `[9,21]`, and NOT the same array reference
   as `DEFAULT_INDICATOR_SETTINGS.emaPeriods` (pins the `[...]` copy at :156 —
   sanitize path only).
9. rsiPeriod clamp via file: `1`→2, `999`→200, `14.6`→15 (round), `"abc"`→14,
   `null`→14. (JSON cannot carry NaN/Infinity — non-finite is covered in test 15
   through `set()`, where NaN/Infinity are number-typed and need no cast.)
10. fibLookback clamp via file: `2`→5, `5000`→1000, `null`→50.
11. legendVisible backward-compat: field ABSENT from persisted JSON → `true`
    (:146-151); explicit `false` round-trips as `false`.
12. `version: 99` in file → sanitized output pins `version: 1` (:154).
13. file with no ```json fence → defaults, no throw (:74-77).
14. corrupt JSON inside the fence → defaults, no throw (:119-123).
15. written markdown: contains preamble `# SATEX — Chart Indicator Settings` + a
    parseable fence; AND sanitize-happens-BEFORE-write — `set()` junk (emaPeriods
    `[7]` via one confined cast, rsiPeriod `NaN`, fibLookback `Infinity`) → raw
    file fence JSON parses to sanitized values (`[9,21]` / `14` / `50`).
16. partial file (only `{"rsiPeriod": 21}` in fence) → tolerant hydrate: rsiPeriod 21,
    every other field defaulted.

Validation: T1.2 targeted vitest exit 0, `16 passed`. Failure mode: fixture drift →
re-read `types.ts:115-129`, fix the FIXTURE not the SUT. Fallback: harness flake in
this sandbox only → ship anyway, CI is arbiter (pattern proven in-repo), note in handoff.

### T2 — Gate bar

From `satex-app/` mount, Node v22: `npm run typecheck` (exit 0) · `npm run lint`
(exit 0, 0 warnings) · `npx vitest run --shard=k/4` k=1..4, one bash call each
(Σ=116 files / 1463 tests / 0 fail) · `NODE_OPTIONS="--require
$HOME/satex-agent/node20-shim.js" npx knip` (exit 0, 55 lines, none new).
Failure mode: red gate → fix the TEST (source read-only), re-run that gate.

### T3/T4/T5 — Bookkeeping

Ledger + CHANGELOG + handoff are EXISTING files: python via bash, per-file EOL
detection, unique-anchor assert (count==1), post-edit NUL/`\r\r` byte-scan (python
read). CHANGELOG bullet ONLY under FIRST `### Added` in `## Unreleased`. Handoff:
APPEND-only section after the current last line. Blueprint status flip: python edit.

## Layer 6 — RISK AUDIT (self-adversarial)

- **Perimeter:** chart-indicator toggle persistence. Zero references to OrderManager /
  risk-gates / kill-switch / live-mode / order submission in SUT or tests (grep at T1.3).
  VERDICT: off-perimeter.
- **Wrong-plan checks:** (1) fixture drift — all constants read from source this session
  at file:line. (2) `enabled` Record key order in deep-equal — `toEqual` is
  order-insensitive for objects: safe. (3) Cache test could over-pin — REVIEWED: cache
  is doc'd service behavior (:37-42) and `reload()` exists precisely because the cache
  holds; contract, not accident. (4) `INDICATOR_IDS` import unused risk (lint
  no-unused-vars) — used in test 6 to assert output key set; keep it used or drop import.
- **Degenerate inputs are the subject:** non-boolean flags, non-member periods, NaN /
  Infinity / string numerics, corrupt JSON, missing fence, partial object, version drift.
  No unbounded spreads (fixtures ≤ 6 elements). No timers/observers/listeners — only
  resource is the tmpdir, reaped with `force:true` (PR #6 leak-class: N/A).
- **Survey verdicts (recorded, NOT executed — pattern does not fit):**
  - `self-eval-store.ts:16-25` and `alpaca-mode.ts:24-39` both bind
    `app.getPath('userData')` (electron) inside a module-level `let state = load()`
    executed AT IMPORT TIME. The constructor-injected-root tmpdir harness cannot reach
    them; testing needs `vi.mock('electron')` + `vi.resetModules()` + dynamic import.
    `grep -rl "vi.mock('electron'" src/ tests/` = **zero hits** — no in-repo precedent;
    introducing the electron-mock harness is a NEW pattern decision → next session's
    plan (or operator preference), not a mid-session improvisation.
  - `alpaca-mode.ts` is additionally live-capital-ADJACENT (chooses paper vs live URL;
    `resolveBaseUrl` :43-58 encodes the 2026-05-13 env-override bug fix). A future test
    PINNING paper-default + canonical-env precedence is safety-positive and still
    new-file-only, but it inherits the same electron-mock dependency. Flagged in NEXT.
- **Finding (→ ledger P-061, OPEN, source untouched today):** the defaults paths return
  `{ ...DEFAULT_SETTINGS }` (`indicator-settings.ts:69,76,81`) — shallow spread aliases
  the nested `enabled` object (and `emaPeriods` array) of the module constant into the
  live cache. Any in-main mutation of a defaults-path `get()` result would corrupt
  process-lifetime defaults. TODAY: only consumer is IPC (structured clone) — latent,
  not active. Candidates: (a) `return sanitize({})` — builds fresh objects via existing
  logic; (b) `structuredClone(DEFAULT_SETTINGS)`. Tests deliberately do NOT pin the
  aliasing (would enshrine an accident).
- **Vetoes:** none — no task touches the perimeter or a one-way door.

## Layer 7 — ASSEMBLED PLAN

This file. Execute T1 → T2 → T3 → T4 → T5 in order; divergence rule applies.

---
*Status log:*
- 05:2x — baseline green (see header), blueprint written, execution begun.
- 07:5x — resumed after mid-session suspension; world-state re-verified on resume (HEAD
  unmoved @ 664c0d5; NO 6 AM work-layer file — it did not run; no collision). T1 16/16
  targeted (12ms); T2 gates: typecheck 0 | lint 0 (0 w) | vitest 116/1463/0
  (387+452+316+308) | knip 0 byte-identical. T3 ledger (P-060 SHIPPED, P-061 OPEN) +
  T4 CHANGELOG + T5 handoff append done. Zero divergences from Layer 5 — predicted
  counts landed exactly.
