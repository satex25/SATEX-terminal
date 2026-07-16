# SATEX — Beta-Readiness Extreme Bug/Error Sweep

**Date:** 2026-07-16 · **Branch/base:** `master` @ `b51405c` · **Auditor:** Opus 4.8 (Cowork session)
**Ledger record:** P-110 (fixes P-108, P-109) · **Report class:** audit record

---

## Verdict — CONDITIONAL GO for beta

The code is green and every trading-safety wall holds. Nothing structural blocks beta.
Three items gate the actual beta *build* — none are code defects:

1. **Operator sign-off + commit of the unstaged depth-feed pile** (7 files, perimeter-adjacent — see §5).
2. **knip green on CI** — the dead-code gate cannot run in-sandbox (crashes under Node 22, P-097); CI is its arbiter.
3. **Signed Windows installer** — the Authenticode certificate is still the standing release blocker (Constitution §1.4); code is signing-ready.

---

## 1 · Gate bar (the floor) — GREEN

Measured with the operator's uncommitted pile in the working tree. Vitest was segmented per the sandbox recipe (≤45 s/call).

| Gate | Command | Result |
|---|---|---|
| Types | `tsc -p tsconfig.node.json` / `tsconfig.web.json` | **exit 0 / exit 0** |
| Lint | `eslint src tests` (run per-dir) | **exit 0** — every directory clean |
| Tests | `vitest run` (segmented) | **1,749 passed / 132 files · 0 failed** |
| Dead code | `knip` | **CI-arbitrated** — not sandbox-runnable (P-097) |

Baseline advanced from the constitution's 1,668/126 to **1,749/132**. Many suites deliberately exercise failure paths (injected 429/401/`disk full`/`SQLITE_BUSY`/`ENOENT`) and pass — error handling is well covered.

## 2 · Trading-safety perimeter — INTACT

| Wall | Check | Result |
|---|---|---|
| Kill switch | atomic `writeJsonAtomic` temp+rename contract | present, used for state write |
| Order path | raw `this.alpaca.{submitOrder,cancelOrder,getAccount}` outside broker facets | **zero** call-sites |
| Auto-update | repo pin + consent flags | `satex25/SATEX-terminal`; `autoDownload/autoInstallOnAppQuit/allowDowngrade = false` |
| Live-mode arming | typed-phrase native dialog + kill-armed guard | present (`live-mode.ts`) |
| Funded overlay | gates 9–13 | `funded-mll/blackout/max-contracts/eod/asset-class` present |
| Credentials | safeStorage-only | hard-fails if unavailable; refuses plaintext reads; no plaintext writes |
| IPC | Zod `.strict()` on payload channels | 124 channels; every payload handler `validated()`, all non-validated handlers no-arg |
| Build target | macOS | **none** |

Master's advance past the P-100 baseline breached no wall.

## 3 · Defect-class hunt — CLEAN

| Class (constitution §2.5) | Finding |
|---|---|
| Unbounded `Math.min/max(...spread)` | Only **P-108** (Sparkline) — now fixed. Other 3 sites bounded by construction (`slice(-n)` window · HMM state count · symbol count). `push(...rows)` capped at `PAGE_LIMIT=5000`. |
| Timer/observer/listener leaks | All 14 renderer intervals + 5 ResizeObservers cleaned in-scope; all 13 engine timers cleared in `shutdown()` (11 `clearInterval` + 2 `clearTimeout`). |
| Error swallowing | No empty catches. One documented rAF paint-guard (see O3). |
| Unsafe casts | **Zero** `as any` in production. |
| Aliased mutable defaults (inv 9) | `freshEmpty()` used; `DEFAULT_CHART_OPTS` all-primitive + spread-copy-only updates. |
| NaN / divide-by-zero | calibration / risk-gates / tactics / tca all length-guarded; indicator kernels guard `period<=0` and `denom===0`. |
| Unguarded IPC | every payload channel `validated()`; plain `register()` handlers are all no-arg. |

Only **2** TODO markers in production (both benign feature notes); no FIXME/HACK/BUG/XXX.

## 4 · Fixes shipped this sweep

Delivered as `p108-sparkline-extent.bundle` (repo root), branch `fix/p108-sparkline-extent`, two commits off `b51405c`.

- **P-108 — Sparkline unbounded spread → `seriesExtent`.** `Sparkline.tsx:18` now `const { min, max } = seriesExtent(clean)`. Behaviour-identical for finite inputs; closes the last `Math.min/max(...spread)` gap. Pinned by `Sparkline.test.tsx` (300k-element no-throw).
- **P-109 — vitest could not run component render-tests.** Root cause found while writing the P-108 test: `vitest.config.ts` had a `.ts`-only include glob (silently skipped `*.test.tsx`) and no React plugin (classic JSX transform ⇒ `React is not defined` when a component is invoked). Fix: `esbuild: { jsx: 'automatic' }` + glob widened to `{ts,tsx}` — two lines, inert for all 132 existing tests, verified by re-running the full renderer suite (39 files / 471 tests, zero regressions).

**Adopt:** `git bundle verify p108-sparkline-extent.bundle` → `git fetch p108-sparkline-extent.bundle fix/p108-sparkline-extent:fix/p108-sparkline-extent` → open PR → CI (incl. knip) → merge. Committed cleanly off `b51405c`, so it is independent of the unstaged pile.

## 5 · Uncommitted depth-feed pile — triage (report-only)

7 modified files, awaiting operator review: `trading-engine.ts`, `index.ts`, `market-data.ts` (+test), `preload/index.ts`, `TopBar.tsx`, `ipc-channels.ts`. **Coherent and gates-green** — the simulator now emits synthetic ticks 24/7 for all classes; the real crypto WS is gated to live mode; `reconnectAlpaca` is a no-op in sim mode (kills the reconnect loop); LIVE→PAPER now confirms then does a full clean-slate restart (new `APP_RESTART` IPC).

It is **perimeter-adjacent** (engine core + mode-switch + app-lifecycle) → **requires operator sign-off (§0.3)**. One behaviour to confirm: `onCryptoTick` now early-returns in sim mode, so the crypto sub-second aggregator (invariant 4) is no longer fed by the real WS while simulating — intended per the code comments; confirm it matches the UX you want.

## 6 · Open observations (operator calls)

- **O1** — the depth-feed pile is perimeter-adjacent; sign off + commit before beta.
- **O2** — when the pile lands, `SATEX_SIMULATOR_24_7` becomes a no-op → update Constitution §2.9 + the `tests/e2e/renderer-perf.spec.ts:64` comment; bump IPC 123→124 in ARCHITECTURE §2.
- **O3** — `WebGLRenderer` paint-loop `catch {}` swallows without telemetry (deliberate — must not crash the rAF loop). Consider a throttled counter so a persistently failing paint is observable (P3 legibility).
- **O4** — stale `.git/index.lock` EPERM reappeared on the mount mid-session (P-099 signature). All writes were done via a `/tmp` clone + bundle. Run `scripts/git-unlock.ps1` before local git operations.

---

*All gate numbers above are measured, not asserted. knip and the full single-shot vitest run are CI's to arbitrate; every other figure was produced in this session.*
