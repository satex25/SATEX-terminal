# ULTRAPLAN — `auto-update.ts` characterization coverage

- **Date:** 2026-07-09 (real run 05:0x CDT, near-nominal)
- **Author:** satex-psd-daily dawn planner
- **Branch:** `chore/p076-p080-coverage-and-fixes` @ `b1cb7c6`
- **Slug:** `auto-update-service-coverage`
- **Ledger:** proposed **P-091** (new coverage entry)

---

## Layer 1 — OBJECTIVE

Add the first Vitest suite for `src/main/services/auto-update.ts` (139 LOC, zero
coverage — carried forward as a fallback pick since 2026-07-04). A single, precise goal:

> Lock in the auto-update service's **safety policy** and **teardown invariant** with
> executable tests, so a future edit that flips `autoDownload`/`autoInstallOnAppQuit` to
> `true`, drops the `setInterval` cleanup, or removes the destroyed-window guard fails a
> gate instead of shipping.

**Measurable success criteria:**
- New file `src/main/services/auto-update.test.ts` exists.
- `npx vitest run src/main/services/auto-update.test.ts` → all tests pass, exit 0.
- Test-count delta: **+1 file / +N tests** (N ≈ 12), full suite still 0 fail.
- `npm run typecheck` stays exit 0; `npm run lint` stays exit 0 / 0 warnings.
- knip: neutral (new file is a `*.test.ts`, imported by vitest glob — not an unused file).

**Applicable constraints (Constitution / AGENTS.md):**
- 0.1 honesty — assert only measured gate numbers.
- 0.4 measure, not assert — real vitest exit codes/counts in the handoff.
- 0.6 four gates green floor; 2.5.7 leak-class discipline (this test *enforces* it).
- **Off-perimeter:** auto-update is Electron release delivery, not the trading path. No
  `execution/`, `risk/`, kill-switch, arming, or MAY-TACTICS contact. NOT a RISK-TOUCH file.

**Assumptions (all verified this session):**
- `createLogger` is inert at import — file sink is opt-in via `enableFileSink`, called only
  from `main/index.ts` (verified `logger.ts:51`). → no logger mock required.
- No existing test mocks `electron` / `electron-updater` (verified: grep returned zero) —
  this suite introduces the pattern. Acceptable: well-scoped module mock, no global config
  change, no impact on other suites (vitest module mocks are file-scoped).
- `IPC.UPDATE_AVAILABLE === 'satex:update:available'` (verified `ipc-channels.ts:247`).

---

## Layer 2 — DOMAIN MAP

| File | Role | Touch |
|---|---|---|
| `src/main/services/auto-update.ts` | SUT — `AutoUpdateService` | READ only (no source edit) |
| `src/main/services/auto-update.test.ts` | NEW test file | CREATE |
| `electron-updater` (`autoUpdater` singleton) | external dep | vi.mock (factory via `vi.hoisted`) |
| `electron` (`BrowserWindow` value import) | external dep | vi.mock (stub class) |
| `@shared/ipc-channels` (`IPC`) | real import | used, not mocked |

- **Service domain:** `system/` (release delivery). **Layer:** main.
- **Blast radius:** the new test file only. Zero production source changes → zero runtime
  blast radius. No perimeter files in scope.

---

## Layer 3 — TASK TREE

- **T1** Scaffold mocks
  - T1.1 `vi.hoisted` block: `handlers` map + `mockAutoUpdater` (props `logger`,
    `allowDowngrade`, `autoDownload`, `autoInstallOnAppQuit`; fns `setFeedURL`, `on`
    capturing handlers, `downloadUpdate`→resolved, `checkForUpdates`→resolved,
    `quitAndInstall`).
  - T1.2 `vi.mock('electron-updater', () => ({ autoUpdater: mockAutoUpdater }))`.
  - T1.3 `vi.mock('electron', () => ({ BrowserWindow: class {} }))`.
  - T1.4 `beforeEach` — `vi.clearAllMocks()` + reset captured `handlers` + reset props.
  - T1.5 `fakeWindow(isDestroyed=false)` helper returning `{ isDestroyed:()=>…,
    webContents:{ send: vi.fn() } }` cast to `BrowserWindow`.
- **T2** Constructor / safety-policy tests
  - T2.1 sets `allowDowngrade=false`, `autoDownload=false`, `autoInstallOnAppQuit=false`.
  - T2.2 calls `setFeedURL` with `{ provider:'github', owner:'satex25', repo:'satex-trading' }`.
  - T2.3 assigns a `logger`.
- **T3** `setWindow` / scheduling tests
  - T3.1 registers all four handlers (`update-available`, `update-not-available`,
    `update-downloaded`, `error`).
  - T3.2 immediate `checkForUpdates()` fired once on `setWindow`.
  - T3.3 `setInterval` armed; advancing fake timers 24h fires another `checkForUpdates`.
- **T4** Event-handler behavior tests
  - T4.1 `update-available` → `webContents.send(UPDATE_AVAILABLE, {available:true, version,
    downloaded:false})` AND `downloadUpdate()` invoked.
  - T4.2 `update-not-available` → send `{available:false, downloaded:false}`.
  - T4.3 `update-downloaded` → send `{available:true, version, downloaded:true}`.
  - T4.4 `error` handler does not throw (swallow-to-debug contract).
  - T4.5 `update-available` with `info=undefined` → `version:''` (nullish guard).
- **T5** Window-guard tests
  - T5.1 no `setWindow` called → broadcast path is a no-op (can't send; assert nothing
    thrown by triggering a handler is not possible pre-setWindow → covered via T5.2 instead).
  - T5.2 destroyed window → `webContents.send` NOT called (isDestroyed guard).
- **T6** `quitAndInstall` / `shutdown` tests
  - T6.1 `quitAndInstall()` → `autoUpdater.quitAndInstall(false, true)`.
  - T6.2 `shutdown()` clears the interval (advance 24h after shutdown → no further
    `checkForUpdates`), idempotent on a second call.

---

## Layer 4 — DEPENDENCY DAG

```
T1 (mocks) ─► T2, T3, T4, T5, T6   (all leaf test blocks depend only on T1)
```

Sequential authoring, single file. No APPROVAL NODES (nothing perimeter). No parallelism
needed — one file, one tool write.

---

## Layer 5 — EXECUTION SPECS

**Method:** write `src/main/services/auto-update.test.ts` as a NEW file (Write tool,
normal write — rule 5 file-bridge hazard applies only to EXISTING files).

Key mechanics:
- `vi.hoisted` is required because `vi.mock` factories are hoisted above imports and may
  not reference un-hoisted module-scope consts. Put `mockAutoUpdater` + `handlers` there.
- Fake timers: `vi.useFakeTimers()` in the timer tests; `vi.advanceTimersByTime(24*60*60*1000)`;
  `vi.useRealTimers()` in cleanup. `checkIntervalId.unref()` is a no-op under fake timers
  (mock timer object has `.unref`), so guard the call: the SUT calls `.unref()` on the
  return of `setInterval`; vitest fake timers return an object with `.unref` → safe.
- Trigger a captured handler with `handlers['update-available']({ version:'9.9.9' })`.
- `fakeWindow`: `{ isDestroyed: () => destroyed, webContents: { send: vi.fn() } } as unknown as BrowserWindow`.

**Per-block validation:** `npx vitest run src/main/services/auto-update.test.ts`
→ expected exit 0, all green.

**Failure mode & fallback:**
- If importing `'electron'` still resolves the real path shim and errors → the
  `vi.mock('electron', …)` stub short-circuits it; if a deeper transitive import of electron
  fails, fall back to `vi.mock('electron', () => ({ BrowserWindow: class {} }))` already in
  place (covers the only named import). No other electron symbol is referenced by the SUT.
- If `.unref()` throws under fake timers → wrap timer assertions to set real setInterval
  return; but vitest's fake timer handle implements `.unref`, so not expected.

---

## Layer 6 — RISK AUDIT (self-adversarial)

- **Is the mock lying?** The mock `autoUpdater` is an assignment sink, not an EventEmitter.
  The SUT uses `.on(event, cb)` (captured) and never relies on real emitter semantics, so
  the captured-handler approach faithfully mirrors production dispatch. ✔
- **Leak introduced by the test?** `vi.useFakeTimers` must be paired with `vi.useRealTimers`
  in each timer test's cleanup, else global timer state bleeds into sibling suites (would be
  ironic given the file under test is a timer-cleanup guard). → `afterEach(vi.useRealTimers)`
  or per-test restore. ENFORCED in Layer 3 T3/T6.
- **Global mock bleed?** `vi.mock('electron')` is file-scoped in vitest; sibling suites that
  do NOT import electron are unaffected. No `setupFiles` change. ✔
- **Degenerate input:** T4.5 covers `info=undefined` → `String(info?.version ?? '')` path.
- **Over-fitting to implementation?** Tests assert *observable contract* (IPC payloads,
  which autoUpdater methods fire, timer cadence), not private internals — resilient to
  refactor. ✔
- **knip fallout:** a new `*.test.ts` is consumed by the vitest include glob; knip's vitest
  plugin recognizes it → not flagged unused. Sandbox can't run knip (oxc OOM, §2.9) — CI is
  arbiter; risk is low (pure test addition, no new prod export).
- **No perimeter contact.** Re-checked: no `OrderManager`, no risk gate, no kill switch, no
  arming. Vetoed-task list empty.

---

## Layer 7 — ASSEMBLED PLAN

Write `auto-update.test.ts` per Layers 3/5 → run targeted vitest (expect exit 0) → run
`npm run typecheck` + `npm run lint` (expect exit 0) → record real numbers → ledger P-091
SHIPPED + CHANGELOG Unreleased entry → handoff. No commit (operator review; §8).
