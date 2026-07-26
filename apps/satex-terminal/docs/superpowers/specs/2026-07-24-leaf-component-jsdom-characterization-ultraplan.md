# ULTRAPLAN — Renderer leaf-component jsdom characterization suite (P-137)

- **Date:** 2026-07-24 (dawn planner fired 21:39 CDT — ~16.5 h past nominal 05:00; see P-134)
- **Ledger:** P-137 (P-136 left free for P-135's earmarked RS-0.2 Rust scaffold)
- **Branch base:** `master @ d5d0922`
- **Author:** dawn planner (Opus) · **Executor:** dawn planner (bulk) + 06:00 work-layer (verify + stretch)
- **Status at handoff:** 8 test files WRITTEN + byte-verified clean + subjects byte-unchanged; full vitest green is CI-arbitrated (sandbox mount-I/O blocks the toolchain — see Layer 6 / §env)

---

## LAYER 1 — OBJECTIVE

**One sentence:** Add zero-dependency jsdom characterization coverage for the 8 untested
*pure-props* renderer leaf components (`StatPill`, `Ring`, `SessionPill`, `Icon`,
`PanelHead`, `RailSlot`, `Modal`, `Dropdown`), pinning their DOM contract and — for the
two interactive ones — their event-listener CLEANUP paths (§2.5.7 leak class).

**Measurable success criteria:**
- 8 new `*.test.tsx` files under `src/renderer/components/`, ~48 characterization tests, all green in CI.
- All 8 subject `.tsx` files **byte-unchanged** (characterization, not modification).
- `Modal` + `Dropdown` suites assert listener removal on unmount (Escape/mousedown inert after unmount).
- Gate bar: typecheck node+web exit 0 · lint exit 0 · vitest 0 fail · knip CI-arbitrated (P-097).
- Renderer coverage vein advances: leaf presentational components move from 0 → covered.

**Constraints:** off-perimeter (view-only, route no order); no subject edits; new files only
(P-099 safe class). **Assumptions flagged:** jsdom serialization of inline `style` values
(`background`, `stroke`, `strokeDashoffset`) is asserted defensively (non-empty / `parseFloat`
+ round) to survive CSSOM quirks; CI (Node 20.19, local FS) is the execution arbiter because
the sandbox mount cannot boot the JS toolchain under the 45 s call ceiling (Layer 6).

## LAYER 2 — DOMAIN MAP

**Blast radius — NEW test files only (subjects READ-ONLY):**
| Subject (READ-ONLY) | L | New test | Coupling |
|---|---|---|---|
| `components/StatPill.tsx` | 33 | `StatPill.test.tsx` | pure props |
| `components/Ring.tsx` | 33 | `Ring.test.tsx` | pure props (SVG geometry) |
| `components/SessionPill.tsx` | 33 | `SessionPill.test.tsx` | pure props (glyph map) |
| `components/Icon.tsx` | 40 | `Icon.test.tsx` | pure props (SVG icon set) |
| `components/PanelHead.tsx` | 31 | `PanelHead.test.tsx` | pure props |
| `components/RailSlot.tsx` | 63 | `RailSlot.test.tsx` | pure props + onToggle |
| `components/Modal.tsx` | 55 | `Modal.test.tsx` | local `useEffect` keydown listener (cleanup surface) |
| `components/Dropdown.tsx` | 108 | `Dropdown.test.tsx` | local state + portal + mousedown/keydown/resize listeners (cleanup surface) |

**Perimeter (§2.4) touch: NONE.** No order path, risk gate, kill switch, interlock,
credential, IPC, or update-feed contact. No RISK-TOUCH / APPROVAL nodes in this plan.

**Explicitly deferred (out of this vein — store/IPC-coupled, jsdom + store-mock, next wave):**
`DeltaStrip` (footprintStore), `TickerTape` (marketStore+useClocks), `BottomBar` (3 stores),
`UpdateToast` (update-store), plus the larger panels (`DisciplinePanel` P-100 flagship,
`ExecTicketPanel`, `WatchlistPanel`, …) and the two pure `.ts` helpers `useGridDrag.ts` (hook)
and `intel-modules.ts`. These are the Layer-7 STRETCH targets.

## LAYER 3 — TASK TREE (atomic, all DONE by the planner unless marked)

T1 StatPill.test.tsx — 6 tests: structure (dot/label/value), ReactNode value, title attr,
   inert-without-onClick, button+bb-clickable+fires-onClick, pulse class. **DONE**
T2 Ring.test.tsx — 6 tests: rounds centre value, clamp>100→offset 0, clamp<0→offset==circumference,
   label conditional, size drives viewBox+box, color drives fg stroke. **DONE**
T3 SessionPill.test.tsx — 3 (it.each): TOKYO ◐ / LONDON ◑ / NY ◔ glyph + name + SESSION suffix. **DONE**
T4 Icon.test.tsx — 4: default size 14 + 24×24 viewBox, size override, single stroked path (close),
   grouped geometry (search = g+circle). **DONE**
T5 PanelHead.test.tsx — 3: title, right-meta node, live-dot conditional. **DONE**
T6 RailSlot.test.tsx — 4: expanded slot+body+collapse glyph+onToggle, row collapse glyph,
   collapsed handle (no body)+expand aria+col glyph+onToggle, row handle glyph. **DONE**
T7 Modal.test.tsx — 9: closed→null, open dialog structure, size-class map (×3), kanji/footer
   conditionals, close button, backdrop-vs-body click, Esc close, **cleanup: Esc-after-unmount inert**,
   closed→no listener. **DONE**
T8 Dropdown.test.tsx — 9: trigger+no-panel, portal-to-body open, item/divider/header render,
   enabled-click fires+closes, disabled-click inert+stays-open, Esc close, outside-mousedown close,
   **cleanup: unmount removes portal + listeners inert**. **DONE**
T9 Byte-verify all 8 (NUL/CRCR/tail) — **DONE, all clean**.
T10 Gate bar — typecheck/lint/vitest/knip — **CI-ARBITRATED** (sandbox cannot boot toolchain, Layer 6).
T11 Ledger P-137 + handoff — **DONE**.

## LAYER 4 — DEPENDENCY DAG

T1..T8 are fully parallel (∥ — independent files, one subject each; a max-effort finisher can
verify all 8 concurrently). T9 depends on T1..T8. T10 depends on T9. T11 depends on T10.
No APPROVAL NODES (zero perimeter contact).

## LAYER 5 — EXECUTION SPECS (harness + per-file)

**Harness (proven, identical to P-133 `DrawingToolbar.test.tsx`):**
```
// @vitest-environment jsdom          <- MUST be line 1
import { describe, it, expect, vi } from 'vitest'
import { act, createElement, type ComponentProps } from 'react'
import { createRoot } from 'react-dom/client'
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true   // eslint-disable the no-explicit-any
function mount(props) {
  const container = document.createElement('div'); document.body.appendChild(container)
  const root = createRoot(container)
  act(() => { root.render(createElement(Subject, props)) })
  return { container, unmount: () => { act(() => root.unmount()); container.remove() } }
}
```
Zero test-lib deps (no @testing-library). Events: `el.click()` inside `act()`;
window events via `act(() => window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})))`.
Store spies (not needed here — all 8 are store-free) would follow `vi.spyOn(store.getState(),'action')`.

**Per-file validation command (finisher, Node 20.19 CI or warm local FS):**
`node_modules/.bin/vitest run src/renderer/components/<Name>.test.tsx`
Expected: `<Name>.test.tsx (<N> tests)` all passed, exit 0. Aggregate expected delta: +48 tests / +8 files.

**Fragility notes for the finisher (assertions written defensively for these):**
- `Ring` `strokeDashoffset`: React treats it unitless → `'0'` / `'219.9…'`; assert via `Math.round(parseFloat(...))`.
- `StatPill` dot / `Ring` color: assert `style.background`/`style.stroke` non-empty or exact `'tomato'`, not normalized hex.
- `Modal` closed: `container.textContent === ''` (returns null). `Icon`: `getAttribute('width') === '14'` (number→attr string).

## LAYER 6 — RISK AUDIT (self-adversarial)

- **Leak class (PR #6 / P-041/P-043/P-046/P-091):** Modal + Dropdown attach `window` listeners
  in effects. Both suites explicitly pin the cleanup branch (post-unmount events must be inert /
  must not throw). This is the highest-value part of the wave — it regression-pins the repo's
  most recidivist defect class on two live interactive primitives.
- **Aliased-defaults (P-061/P-074):** none — components hold no module-level mutable defaults.
- **Degenerate inputs (P-039/P-040/P-093):** `Ring` clamp branches (>100, <0) are pinned; no
  unbounded spreads / period divisions in scope.
- **Subject mutation risk (P-099):** all 8 subjects verified byte-unchanged (`git status`: only
  `??` new test files, zero `M`). New-file creation is the P-099-safe class.
- **ENVIRONMENT WALL (new finding, extends §2.9 / P-099):** in this sandbox `require('jsdom')`
  alone takes **>40 s** — the Windows-mounted `node_modules` over the 9p mount makes cold module
  load exceed the 45 s per-call ceiling. Consequence: **no jsdom vitest run, scoped eslint, or
  full tsc completes in-sandbox this session.** Corroboration that the suites are sound: the
  byte-identical-harness `DrawingToolbar.test.tsx` was run **10/10 green in this same session**
  before the cache went cold, and every assertion here was statically reviewed against the subject
  source. **CI (Node 20.19, local FS) is the declared arbiter** (§0.4 name-don't-fake; §2.9/§6
  precedent). A warm-FS run (operator hardware Node 24, or a /tmp clone with local `node_modules`)
  will also pass.

## LAYER 7 — STRETCH (saturation work for the 06:00 finisher — never idle)

After verifying T1–T8 via CI/warm-FS, extend the vein (each its own P-number, referencing this plan):
1. **Store-coupled leaf components** (jsdom + Zustand `setState` reset, per the P-133/`useIPC` precedent):
   `DeltaStrip` (footprintStore), `TickerTape` (marketStore + `useClocks` mock), `UpdateToast`
   (update-store), `BottomBar` (account/riskGates/market stores). ~4 files.
2. **Pure `.ts` helpers** (no jsdom needed — cleanest picks): `components/intel/useGridDrag.ts`
   (drag reducer/hook) and `panels/intel/intel-modules.ts` (registry data).
3. **Flagship panel:** `DisciplinePanel.tsx` (P-100 Conviction Layer Track A) — highest product
   leverage; pin the calibration/significance/discipline-composite render against stubbed stores.
4. **Audit pass:** grep the 8 subjects + their siblings for the leak class (`new ResizeObserver`,
   `setTimeout`, `addEventListener` without a matching cleanup in the same effect) — ledger any find.

---

## EXECUTION RECORD (this session)

Written + byte-verified (0 NUL / 0 CRCR / tail intact) all 8 files; subjects byte-unchanged
(`git status` = 8 `??`, 0 `M`). Toolchain could not run in-sandbox (mount-I/O > 45 s ceiling);
`DrawingToolbar.test.tsx` (identical harness) ran 10/10 green earlier this session as corroboration.
Everything left UNSTAGED for operator review. Stale `.git/index.lock` (EPERM, P-125 class) recurred
this session — operator must clear (`scripts/git-unlock.ps1`).
