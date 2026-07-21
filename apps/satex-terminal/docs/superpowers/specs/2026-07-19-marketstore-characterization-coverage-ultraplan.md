# ULTRAPLAN — marketStore.ts characterization coverage

- **Date:** 2026-07-19
- **Author:** dawn planner (Claude Opus 4.8), unattended scheduled run (real fire 22:30 CDT — see handoff §1)
- **Ledger:** P-116
- **Status at write:** EXECUTED same session — the dawn agent both planned and shipped this. Blueprint retained as executed-plan documentation.
- **Blast radius:** `apps/satex-terminal/src/renderer/stores/marketStore.test.ts` (NEW). Subject `marketStore.ts` byte-unchanged. Zero perimeter contact.

---

## Why this pick (leverage)

The services-layer coverage program (P-094) is **complete for every safe unit**: a fresh
scan of `src/main/services/` shows exactly two files without a sibling `.test.ts` —
`live-mode.ts` (the live-arming interlock) and `tactics.ts` (the MAY-TACTICS graduation
interlock). **Both are trading-safety perimeter; both are human-gated** (P-094 explicitly,
even for adding tests). The `shared/broker/` untested files are pure interface/type
contracts (no runtime behavior — correctly untested). So the next highest-leverage safe,
additive, off-perimeter pick moves to the **renderer store layer**, which had a rich
untested vein.

`marketStore.ts` is the renderer's central quote/candle store — **every price and every
bar the chart draws flows through it** (P3, operator legibility). It carries three
load-bearing guards that had **no regression pin**:

1. **Unbounded candle growth → `MAX_CANDLES = 30_000` trim** (`updateCandle`,
   `bulkReplaceCandles`). The same growth/spread class this repo tracks in P-041/P-093
   (`ChartPanel` `Math.max(...view)` over this very array).
2. **live↔replay history bleed → `resetCandles`** wipes candles to empty on data-source
   swap (invariant 6 — stale historical bars must not cross a mode transition).
3. **snapshot-cache stable reference → `selectCandles`** returns a single **frozen**
   empty array for every miss — the Zustand-v5 `useSyncExternalStore` invariant, and the
   *correctly-handled* member of the P-061/P-074 shared-default class (a fresh `?? []`
   here would infinite-loop the renderer; the file's own comment documents this).

A silent regression of any of these has **no failing gate today**. That is the gap.

---

## Layer 1 — OBJECTIVE

Ship a characterization test suite that pins the measured behavior of every `marketStore`
action + the `selectCandles` selector, so a future refactor that changes a bound or an
immutability/stable-ref contract turns a test red.

**Success criteria (all met):** new `marketStore.test.ts` with the store's full action
surface pinned; suite green twice, order-independent; subject byte-unchanged; typecheck
of the new file clean under repo-equivalent strict/bundler settings; zero perimeter
contact. **Which count changes:** renderer test count +19 (CI-measured against the full
suite).

**Constraints:** test-only; no source edit; no native deps (pure Zustand + React types),
so it runs in a Linux /tmp harness and on CI/operator hardware identically.

## Layer 2 — DOMAIN MAP

- **Subject (read-only):** `src/renderer/stores/marketStore.ts` — `useMarketStore`
  (`setSymbol`, `seedQuotes`, `updateQuotes`, `updateCandle`, `bulkReplaceCandles`,
  `appendNews`, `resetCandles`) + `selectCandles`, `EMPTY_CANDLES` (frozen),
  `MAX_CANDLES=30_000`, `MAX_NEWS=200`.
- **Fixtures use:** `@shared/types` (`Candle`, `Quote`, `NewsItem` — type-only, erased at
  runtime) and `@shared/constants` (`UNIVERSE` — value; self-contained, only a type import).
- **NEW artifact:** `src/renderer/stores/marketStore.test.ts`.
- **Perimeter files in blast radius:** NONE. (No order/risk/kill/arm path; renderer UI state.)

## Layer 3 — TASK TREE

- T1 Scan services/core/shared/renderer for untested behavior modules; confirm perimeter
  status of the two remaining untested services. → DONE
- T2 Read subject + exact `@shared` type shapes + `UNIVERSE`. → DONE
- T3 Build /tmp vitest harness: copy subject + `shared/{constants,types}.ts`, alias
  `@shared`, install `vitest@4.1 zustand@5.0.1 react@19`. → DONE
- T4 Author the characterization suite (19 tests). → DONE
- T5 Run green ×2, order-independent. → DONE
- T6 Scoped strict `tsc --noEmit` over test + imports (repo-equivalent config). → DONE
- T7 Copy to mount as NEW file; byte-verify (md5==/tmp, 0 NUL, 0 CR-CR, tail). → DONE
- T8 Ledger P-116 + CHANGELOG + handoff + session report. → DONE

## Layer 4 — DEPENDENCY DAG

T1 → T2 → T3 → T4 → T5 → T7 (mount write) ; T6 ∥ T5 (independent of the mount copy) ;
T8 after T7. **No APPROVAL NODES** — nothing in the DAG touches the perimeter.

## Layer 5 — EXECUTION SPECS (as executed)

- **Harness:** `/tmp/satex-agent-marketstore/` — `vitest.config.ts` aliases `@shared` →
  copied `shared/`; installed **zustand 5.0.14 · vitest 4.1.10 · react 19.2.7** (matches
  repo `^5.0.1 / ^4.1 / ^19`). `zustand/react/shallow` pulls `react`, hence react is a
  harness dep even though the tests never render.
- **State reset:** `beforeEach(() => useMarketStore.setState(useMarketStore.getInitialState(), true))`
  — restores data + actions between tests (Zustand v5 `getInitialState()`).
- **Behavior pinned (19 tests):** initial state (NVDA focus; one seeded quote per UNIVERSE
  entry; bid=seed×0.9999 / ask=seed×1.0001; 30-pt sparkline); `setSymbol`; `seedQuotes`
  fresh-Map merge preserving untouched; `updateQuotes` shallow-merge onto prior + unknown-
  symbol insert + new-ref-per-call; `updateCandle` first-insert / in-flight replace /
  empty-isNew-false / **MAX_CANDLES ceiling on append** / new-ref; `bulkReplaceCandles`
  under-ceiling replace + **last-MAX_CANDLES trim**; `appendNews` newest-first + **MAX_NEWS
  cap**; `resetCandles` wipe; `selectCandles` stored-array hit + **shared frozen empty on
  miss**.
- **Validation command:** `npx vitest run` in the harness → `19 passed`, twice
  (31 ms tests). Expected exit 0.
- **Cold-start test:** an agent with only this blueprint + the boot docs can rebuild the
  harness from Layer 5 and reproduce 19/19.

## Layer 6 — RISK AUDIT

- **Leak class (PR#6/P-041):** N/A — pure store, no timers/observers/listeners.
- **Degenerate inputs (P-039/P-040):** covered — empty history on both `updateCandle`
  branches; oversized series trims; unknown-symbol select returns frozen empty.
- **Aliased shared defaults (P-061/P-074):** the suite *pins the correct handling* — one
  shared **frozen** `EMPTY_CANDLES` returned for every miss (asserted `.toBe` identity +
  `Object.isFrozen`). Mutation is impossible (frozen); aliasing is intentional and
  required by the snapshot-cache invariant.
- **NUL-corruption path (P-099):** mount write byte-verified (md5 match, 0 NUL, 0 CR-CR,
  LF-only, tail intact); subject untouched (md5 identical pre/post).
- **Perimeter:** none touched. No veto required.

## Layer 7 — GATES (real numbers)

- **typecheck:** full `tsc -p tsconfig.web.json --noEmit` in-mount = **exit 124 (timeout,
  45 s ceiling)** — documented env scar (2026-07-17 handoff); **CI is the full-typecheck
  arbiter.** Scoped strict `tsc --noEmit` over the new test + its imports (target ES2022,
  bundler resolution, `strict`, `skipLibCheck`, `@shared` alias) = **exit 0**.
- **test:** `npx vitest run` (harness) = **19/19 pass ×2**, order-independent.
- **lint:** scoped `eslint marketStore.test.ts` in-mount **exceeded the 45 s startup
  ceiling** (eslint 10.7 + typescript-eslint flat config) — **CI is the lint arbiter**;
  the file matches accepted sibling-test style (same `import { describe, expect, it } from
  'vitest'`, non-null `!`, `as` casts — all used in `footprint-aggregator.test.ts`).
- **knip:** CI-arbitrated (Node-22 oxc crash, P-097).
- Subject `marketStore.ts` byte-unchanged. No `package-lock.json` mutation (harness is /tmp).
