# ULTRAPLAN — tradesStore.ts characterization coverage

> Dawn-planner blueprint (v4.0 contract). Cold-start target: a max-effort executor
> that has read ONLY the boot documents + this file can write the test, validate it,
> and close the ledger with zero archaeology. Every atomic task carries an exact
> method, a unique anchor, an expected artifact, and a validation command with
> expected output.

- **Date:** 2026-07-21
- **Author:** SATEX Dawn Planner (Claude Opus 4.8), unattended run ~13:06 CDT (off-nominal — see handoff)
- **Ledger:** P-127 (new entry filed this session)
- **Branch base:** `master` @ `e145dd5`
- **Classification:** OFF-PERIMETER · additive test-only · renderer UI state · zero source edit

---

## LAYER 1 — OBJECTIVE

**One sentence:** Add a co-located characterization suite `src/renderer/chart/flow/tradesStore.test.ts`
that pins the load-bearing behavior of the last untested renderer store (`tradesStore.ts`, the
per-symbol raw-trade ring buffer feeding the OrderFlowTape / ChartPanel), closing the renderer-store
coverage program at 24/24.

**Measurable success criteria:**
- New file `src/renderer/chart/flow/tradesStore.test.ts` exists; subject `tradesStore.ts` byte-unchanged (`git diff --stat` shows 0 lines in the subject).
- `npx vitest run src/renderer/chart/flow/tradesStore.test.ts` → all tests pass, run twice order-independent (`--sequence.shuffle`).
- Full-project `npm run typecheck` stays exit 0.
- vitest file-count delta: +1 file, +N tests (N≈18) on the suite; full-suite count rises by exactly N with no other file's count changing.
- Three recidivist defect CLASSES pinned so a future regression turns a test red: unbounded-growth (500-cap ring buffer), stable-reference selector (useSyncExternalStore snapshot invariant — infinite-render-loop prevention), subscription leak/idempotency (§2.5.7).

**Constraints:** off-perimeter only; no source edit; P-099 bash-mount write + byte-verify on every tracked file; knip is CI-arbitrated (sandbox oxc crash, P-097); eslint full-run may hit the 45 s sandbox ceiling → scope to the new file, name CI as full-run arbiter.

**Assumptions (flagged):** (1) vitest default environment is `node` (verified: no `environment` key in vitest.config) — store tests need no DOM because they exercise `getState()`/selectors directly, not React render. (2) The subject is correct as written; this is CHARACTERIZATION (pins measured behavior), not a fix. (3) `window` is stubbable via `vi.stubGlobal` for the subscription path.

---

## LAYER 2 — DOMAIN MAP

**Subject (READ-ONLY, do not edit):** `src/renderer/chart/flow/tradesStore.ts` (68 L).
Exports: `useTradesStore` (zustand v5 `create<State>`), `selectTrades(symbol)`, `ensureTradesSubscription()`, `disposeTradesSubscription()`, `EMPTY_TRADES` (module-private frozen `[]`).
State shape: `{ bySymbol: Record<string, readonly Trade[]>, ingest(batch: Trade[]), reset() }`.
Module-level mutable singletons: `subscribed: boolean`, `cleanup: (()=>void)|null` — reset only by `disposeTradesSubscription()`.

**Constant:** `MAX_PER_SYMBOL = 500` (ring-buffer cap).

**Type:** `Trade` from `@shared/types` = `{ symbol: string; ts: number; price: number; size: number; side: 'buy'|'sell'; provenance: 'real'|'inferred' }`.

**Consumers (leverage evidence):** `ChartPanel.tsx:52,206` (`useTradesStore(selectTrades(symbol))`) — the P3 operator-legibility chart hot path. `FootprintLayer.tsx:40` (comment ref).

**Blast radius:** the new test file only. NO perimeter files. NO source edit. RISK-TOUCH: none.

**Precedent pattern:** `src/renderer/stores/footprintStore.test.ts` (nearest analog — singleton-subscription store; `beforeEach` resets via `setState(getInitialState(), true)`; `Trade` fixture factory).

---

## LAYER 3 — TASK TREE (atomic)

- T1. Write `src/renderer/chart/flow/tradesStore.test.ts` per the Layer-5 spec (one Write/heredoc).
- T2. Byte-verify the new file (0 NUL, 0 CR-CR, LF-only, tail intact).
- T3. Validate: `npx vitest run <file>` → green; re-run with `--sequence.shuffle` → order-independent green.
- T4. Confirm subject byte-unchanged (`git diff --stat src/renderer/chart/flow/tradesStore.ts` → empty).
- T5. Scoped typecheck floor + scoped eslint on the new file (name CI arbiter for full lint/knip).
- T6. Close: file P-127 as SHIPPED with real gate numbers; update the renderer-store vein note; leave unstaged.

---

## LAYER 4 — DEPENDENCY DAG

T1 → T2 → T3 (∥ with T4 once T1 lands) → T5 → T6.
No APPROVAL NODES (nothing touches the perimeter). A max-effort finisher can interleave T4 and the Layer-7 stretch audit while T3/T5 run.

---

## LAYER 5 — EXECUTION SPECS

### T1 — the test file (exact content)

Path: `src/renderer/chart/flow/tradesStore.test.ts`. Write through the bash mount (heredoc), NOT the file-tool bridge on the mount's existing tree (P-099). Content contract — an ~18-test suite in five describe blocks:

**Fixture factory** (mirror footprintStore.test.ts):
```ts
function trade(symbol: string, price: number, size = 1, side: Trade['side'] = 'buy'): Trade {
  return { symbol, ts: 1_700_000_000_000, price, size, side, provenance: 'inferred' }
}
```

**Reset discipline:** `beforeEach(() => { useTradesStore.setState(useTradesStore.getInitialState(), true); disposeTradesSubscription() })` — the second call resets the module-level `subscribed`/`cleanup` singletons between tests. `afterEach(() => vi.unstubAllGlobals())`.

Describe blocks + assertions:

1. `ingest — guards`
   - `ingest([])` → `bySymbol` deep-equals `{}` (no-op).
   - `ingest(null as unknown as Trade[])` → no-op (defends `!batch`).
2. `ingest — routing & order`
   - single-trade batch → `bySymbol['AAPL']` length 1, element is the trade.
   - mixed-symbol batch `[AAPL, MSFT, AAPL]` → `AAPL` length 2, `MSFT` length 1 (per-symbol isolation).
   - two separate `ingest` calls append oldest-first (verify prices `[100, 101]` in order).
3. `ingest — ring buffer cap (MAX_PER_SYMBOL=500, unbounded-growth class)`
   - ingest exactly 500 (price=i) → length 500, first price 0, last price 499.
   - ingest 501 in one batch (price=i, i∈[0,500]) → length capped 500; retained window is the LAST 500 → first price **1**, last price **500** (proves oldest-index-0 evicted, FIFO).
   - ingest 500 then a second batch of 10 (price 500..509) → length 500; first price **10**, last price **509** (cross-call eviction).
4. `immutability (P-061/P-074 class)`
   - `getState().bySymbol` reference changes after ingest (fresh object, not mutated).
   - capture `arr1 = getState().bySymbol['AAPL']` after ingest 1; ingest 2 for AAPL; `arr1.length` unchanged (prior array not mutated in place) and `getState().bySymbol['AAPL'] !== arr1`.
5. `selectTrades — stable-reference invariant (useSyncExternalStore / infinite-render-loop guard)`
   - `selectTrades('MISS')(getState())` returns a value that `=== selectTrades('MISS2')(getState())` (both the same frozen EMPTY_TRADES ref, not a fresh `[]`).
   - the empty result `Object.isFrozen(...) === true`.
   - present symbol: `selectTrades('AAPL')(getState()) === getState().bySymbol['AAPL']` (identity, no copy).
6. `reset`
   - after ingest, `reset()` → `bySymbol` deep-equals `{}`; `selectTrades('AAPL')(getState())` is the frozen empty ref.
7. `subscription lifecycle (leak/idempotency §2.5.7)`
   - stub `window` via `vi.stubGlobal('window', { satex: { onTradesTick: mock } })` where `mock` returns a `cleanup` spy and captures the handler; `ensureTradesSubscription()` → `onTradesTick` called once; invoking the captured handler with a batch reaches the store (`bySymbol` updates).
   - second `ensureTradesSubscription()` → `onTradesTick` still called exactly once (idempotent).
   - `disposeTradesSubscription()` → cleanup spy called; a subsequent `ensureTradesSubscription()` re-subscribes (onTradesTick call count increments).
   - no `window.satex` (stub `window` to `{}`): `ensureTradesSubscription()` does not throw, `disposeTradesSubscription()` (never truly subscribed) does not throw.

Imports: `import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'`; `import type { Trade } from '@shared/types'`; `import { useTradesStore, selectTrades, ensureTradesSubscription, disposeTradesSubscription } from './tradesStore'`.

**Failure mode / fallback:** if the `getInitialState()` reset does not clear module `subscribed`, tests in block 7 bleed — the explicit `disposeTradesSubscription()` in `beforeEach` is the guard. If `vi.stubGlobal('window', …)` is not seen by the subject (it reads `window as unknown`), fall back to `Object.defineProperty(globalThis, 'window', {...})` — but stubGlobal patches `globalThis.window`, which is exactly what the subject reads, so it will be seen.

### T2 — byte-verify (mandatory, P-099 rule c)
```
python3 - <<'PY'
b=open('src/renderer/chart/flow/tradesStore.test.ts','rb').read()
print('NUL',b.count(b'\x00'),'CRCR',b.count(b'\r\r'),'bytes',len(b),'tail',repr(b[-40:]))
PY
```
Expected: `NUL 0 CRCR 0`, tail ends with a closing `})` + newline.

### T3 — validate (real numbers)
```
npx vitest run src/renderer/chart/flow/tradesStore.test.ts
npx vitest run src/renderer/chart/flow/tradesStore.test.ts --sequence.shuffle
```
Expected: `Test Files 1 passed`, `Tests N passed` (N≈18), both runs identical. Sandbox needs `npm i @rollup/rollup-linux-x64-gnu @esbuild/linux-x64 --no-save` first (verify `package-lock.json` md5 unchanged); vitest env is node.

### T4 — subject unchanged
`git diff --stat src/renderer/chart/flow/tradesStore.ts` → empty output.

### T5 — floor gates
`npm run typecheck` → exit 0 (both tsconfigs). `npx eslint src/renderer/chart/flow/tradesStore.test.ts` → exit 0 (or, if the 45 s flat-config cold-start ceiling trips in-sandbox, name CI the lint arbiter, P-116/P-123 precedent). knip → CI-arbitrated (P-097).

---

## LAYER 6 — RISK AUDIT (self-adversarial)

- **Shared-mutable-default (P-061/P-074):** `getInitialState()` returns the SAME `{bySymbol:{}}` object every `beforeEach`; safe ONLY because the subject never mutates `state.bySymbol` in place (ingest builds `next={...}`; reset sets a fresh `{}`). Block-4 immutability assertions incidentally guard this — if a future refactor mutates in place, both the immutability test AND cross-test bleed would surface. No risk introduced.
- **Module-singleton bleed (subscription):** `subscribed`/`cleanup` are module-scoped and survive across tests in the file. Mitigation: `disposeTradesSubscription()` in `beforeEach` + `vi.unstubAllGlobals()` in `afterEach`. Vitest isolates per-file, so no cross-FILE leak.
- **False-green trap:** cap assertions must be exact (`=== 500`, first/last price discriminators) not `<= 500`; an off-by-one in the subject's `slice(prev.length - MAX + 1)` would otherwise pass. The FIFO price-discriminator (first price = 1 after 501-ingest) is the precise oldest-evicted proof.
- **Degenerate inputs (P-039/P-040):** empty/null batch covered (block 1). No unbounded spread introduced (the test builds arrays with a bounded loop, not `Math.max(...arr)`).
- **NUL/CRCR corruption path:** heredoc write + python byte-scan (T2); no file-tool bridge edit on the mount tree.
- **Perimeter:** none touched. No order/risk/kill/arm/credential/update-feed reach. VETO check: clean.

---

## LAYER 7 — ASSEMBLED PLAN / STRETCH (for the finisher)

Core = T1..T6 above (one target, cold-start-complete). If a max-effort finisher saturates the core, the parallelizable stretch (off-perimeter, real-defect hunt — never idle):

- **AUDIT-A — ChartPanel.tsx leak/spread sweep.** The 1.6 kL P3 god-panel where P-093 already found a live `Math.min/max`-spread defect. Hunt the recidivist classes: every `new ResizeObserver`/`setInterval`/`setTimeout`/`addEventListener` must have a visible cleanup in the same `useEffect` return (§2.5.7); any `Math.min(...arr)`/`Math.max(...arr)` over candle arrays (route via `extent.ts`, P-093/P-108 class); aliased module-const defaults returned from selectors (P-061/P-074). Ledger real finds as new PSD entries; fix only single-answer defects, defer taste calls.
- **AUDIT-B — chart-indicator behavioral gaps.** `indicators.test.ts` covers the happy paths but NOT: `rsiSeries` flat-line branch (`avgLoss===0 && avgGain===0 → 50`, `rsi.ts:rsiFromAvgs`), `computeFibonacci` uptrend-vs-downtrend DIRECTION selection (`highIdx > lowIdx`, `fibonacci.ts`), `computePivotPoints` R/S ordering + all 7 levels beyond the single formula test. Additive assertions in `indicators.test.ts`; pure vitest, no harness.
- **AUDIT-C — chart/flow + chart/drawing coverage.** `drawing-renderer.ts` (145 L, canvas — jsdom), `export.ts` (207 L, PNG export), `useChartOpts.ts` / `useIPC.ts` hooks (renderHook + jsdom). Lower priority (DOM-coupled); ledger as a coverage survey if not implemented.

Deliverable naming matches existing specs (`YYYY-MM-DD-<slug>-ultraplan.md`). A plan that was executed becomes documentation; link it from the ledger entry.
