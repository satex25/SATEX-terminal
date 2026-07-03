---
type: ultraplan
date: 2026-06-29
slug: settings-modal-selfeval-timer-leak
ledger: P-046
status: SHIPPED (2026-06-29; ledger P-046 SHIPPED, gates green; confirmed still-shipped 2026-07-02 work-layer audit)
author: satex-psd-daily (planner / first executor, scheduled 5 AM)
branch: master
head: 664c0d5
perimeter: OFF (renderer presentation; routes no order)
---

# Ultraplan — SettingsModal self-eval poll timers leak setState-after-unmount (P-046)

> 7-layer Structured Cognitive Decomposition per the scheduled-task constitution.
> Written before any code. Off the trading-safety perimeter. No APPROVAL NODES.

---

## LAYER 1 — OBJECTIVE

**Goal (one sentence):** Make the three self-eval poll `setTimeout`s in
`SettingsModal.runSelfEvalNow()` cancellable on unmount so closing the Settings dialog within
~8 s of pressing "Run Self-Eval Now" no longer fires `refreshSelfEval()` (a `setSeStatus`
setState + a `getSelfEvalStatus` IPC round-trip) on an unmounted component three times.

**Success criteria (measurable):**
- `SettingsModal.tsx` no longer schedules an untracked `setTimeout` — every poll timer ID is
  held in a ref and cleared in an unmount cleanup (`file:line` of the new ref + the new
  cleanup effect named in the handoff).
- Defect class: the PR #6 "clean up what you create" / setState-after-unmount class
  (AGENTS.md load-bearing invariant), here on the open-Settings → Run-Self-Eval → close-fast
  path.
- All four gates stay green: typecheck exit 0, lint exit 0 / 0 warnings, vitest 0 fail,
  knip exit 0 (no new warnings). Test count delta: **0** (see Layer 6 — no component-test infra).
- The fix byte-matches the canonical in-repo pattern (`App.tsx` `armTimerRef` +
  `clearTimeout(armTimerRef.current)`).

**AGENTS.md constraints that apply:**
- "Clean up what you create: disconnect observers, clear timers, cancel in-flight async on
  unmount" — this is the exact invariant.
- "State is Zustand, not Redux" — untouched (no store change).
- Gate bar: all four green; report **real** results, never assert.
- Off-perimeter: no OrderManager / risk-gates / kill-switch / interlock / Alpaca submit.
- Branch→PR flow: leave UNSTAGED for operator (do not commit).
- File-bridge hazard (rule 5): SettingsModal.tsx is **CRLF** (568 CRLF / 0 lone-LF / 0 NUL) →
  edit via python with CRLF preservation, NOT the Edit tool.

**Assumptions (flagged):**
- A1 [VERIFIED]: `refreshSelfEval` calls `setSeStatus` (setState) — read `SettingsModal.tsx:54-59`.
- A2 [VERIFIED]: the three timers are untracked/uncleared — read `:69-82`; no `clearTimeout`
  for them anywhere (`grep clearTimeout` in renderer shows only App/ExitReflection/Splash/
  UpdateToast/ChartPanel).
- A3 [VERIFIED]: `useRef` is NOT yet imported (`:10` imports only `useEffect, useState`).
- A4 [VERIFIED]: no `@testing-library/react`, no `*.test.tsx` in `src/renderer` → no React
  component-test harness exists.

---

## LAYER 2 — DOMAIN MAP

**Blast radius (exact):**
- `src/renderer/components/modals/SettingsModal.tsx` — the only file changed.
  - `:10` import line (add `useRef`).
  - `runSelfEvalNow()` `:69-82` — the loop at `:76-78` that schedules the three timers.
  - new ref declaration (near the self-eval state, `:51-52`).
  - new unmount cleanup `useEffect` (mount-once).
- `CHANGELOG.md` — one entry under the first `### Fixed` in `## Unreleased`.
- `Vault/00-Audit/PROBLEM-LEDGER.md` — P-046 entry + session log + date bump.

**Layer / domain:** renderer (`main/renderer/shared` = **renderer**); no domain service folder
(`broker/execution/intelligence/market-data/risk/subsecond/system`) touched. **No RISK-TOUCH.**

---

## LAYER 3 — TASK TREE

- **T1 — Fix the leak in SettingsModal.tsx** (python CRLF-safe edits, each anchor count==1)
  - T1.1 `:10` `import { useEffect, useState }` → `import { useEffect, useRef, useState }`.
  - T1.2 After the self-eval state (`:52`), add
    `const pollTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])`.
  - T1.3 Add a mount-once cleanup effect that clears every pending poll timer on unmount.
  - T1.4 In `runSelfEvalNow` `:76-78`, capture each `setTimeout` ID and push it into
    `pollTimersRef.current`.
- **T2 — Verify the edit** (python byte-scan: NUL==0, `\r\r`==0; brace/paren balance; CRLF count
  preserved; `grep` confirms no untracked poll `setTimeout` remains).
- **T3 — Four gates** (typecheck, lint, vitest sharded, knip Node-20 shim).
- **T4 — Close** (ledger P-046 SHIPPED + session entry; CHANGELOG; handoff). UNSTAGED.

---

## LAYER 4 — DEPENDENCY DAG

```
T1.1 ─┐
T1.2 ─┼─→ T1.3 ─→ T2 ─→ T3 ─→ T4
T1.4 ─┘   (T1.3 needs the ref from T1.2; T1.4 needs the ref from T1.2)
```
- T1.1 / T1.2 parallel-safe (independent anchors). T1.3 and T1.4 both depend on T1.2.
- All four edits land before T2 (single python pass). Sequential thereafter.
- **No APPROVAL NODES** — zero RISK-TOUCH tasks; nothing on the live-capital path.

---

## LAYER 5 — EXECUTION SPECS

**Method:** one python script (run via bash) that reads the file as bytes, asserts each anchor
occurs exactly once, replaces, and writes back preserving CRLF. The file is uniformly CRLF, so
operate on the text with `\r\n` line endings intact (read bytes, decode, replace exact CRLF-
bearing substrings, re-encode).

**T1.1 — import (anchor count==1):**
- old: `import { useEffect, useState } from 'react'`
- new: `import { useEffect, useRef, useState } from 'react'`

**T1.2 — ref (anchor: the self-eval state block, count==1):**
- old anchor: `  const [seBusy, setSeBusy] = useState(false)\r\n`
- new: append `  const pollTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])\r\n`
  immediately after it.

**T1.3 — unmount cleanup (insert right after T1.2 ref line):**
```ts
  // Cancel any pending self-eval poll timers on unmount so a fast modal-close
  // does not setState (refreshSelfEval -> setSeStatus) on an unmounted component
  // (PR #6 "clean up what you create"; mirrors App.tsx armTimerRef).
  useEffect(() => () => {
    pollTimersRef.current.forEach(clearTimeout)
    pollTimersRef.current = []
  }, [])
```
(authored with `\r\n` line endings to match the file)

**T1.4 — capture IDs (anchor count==1, the poll loop body):**
- old:
  ```
        for (const delay of [1500, 4000, 8000]) {
          setTimeout(() => { void refreshSelfEval() }, delay)
        }
  ```
- new:
  ```
        for (const delay of [1500, 4000, 8000]) {
          pollTimersRef.current.push(setTimeout(() => { void refreshSelfEval() }, delay))
        }
  ```

**Validation criteria:**
- T2: `python` byte-read → `data.count(b'\x00')==0`, `data.count(b'\r\r')==0`, CRLF count ==
  pre-edit + (lines added); `{`/`}` balance equal, `(`/`)` balance equal; `grep -n "setTimeout"
  SettingsModal.tsx` shows the only call is the now-captured one inside `.push(...)`.
- T3 gates (run from `00-PROJECT-ROOT/01-SATEX-CORE/satex-app`):
  - `npm run typecheck` → exit 0.
  - `npm run lint` → exit 0, 0 warnings.
  - `npx vitest run --shard=k/4` k=1..4 → 0 fail; **test count unchanged** vs baseline
    (100 files / 1287 tests).
  - knip with `NODE_OPTIONS="--require /tmp/satex-agent-node20-shim.js" npx knip` → exit 0,
    only the 23 unused-export + 29 unused-type pre-existing warnings (none new — no export added).

**Failure mode + fallback:**
- If an anchor count != 1 → STOP, re-read the file, re-derive a unique anchor (do not blind-
  replace). Fallback: widen the anchor with surrounding context.
- If python edit introduces NUL/`\r\r` → restore from `git show HEAD:<path>` and re-apply.
- If typecheck flags `useRef` unused (won't — used by T1.2) or `ReturnType<typeof setTimeout>`
  mismatch → it is `number` in the browser lib; the `ReturnType<typeof setTimeout>` form is the
  repo idiom (App.tsx `:76`) and is correct under the DOM lib. Fallback: copy App.tsx's exact
  type.

---

## LAYER 6 — RISK AUDIT (self-adversarial)

**How is this plan wrong? What did I miss?**
- *"Add a test."* There is **no React component-test infrastructure** — `@testing-library/react`
  is not a dependency and `src/renderer` has zero `*.test.tsx`. Adding it = a new dep + lockfile
  churn (out of scope, perimeter-adjacent for an autonomous run). The leak is not observable
  without mounting the full modal. **Decision:** ship test-count-unchanged, verified by gates +
  a diff review against the canonical `App.tsx armTimerRef` pattern — the exact precedent set by
  P-043 (ChartPanel ResizeObserver leak shipped with no unit test for the same reason). Pinning
  the timer-cleanup idiom in pure form would require extracting a hook = over-engineering a 3-line
  fix. VETO any test-infra addition this session.
- *Stale-closure risk on `pollTimersRef`.* A ref is stable across renders; `forEach(clearTimeout)`
  reads the live array at unmount. No stale closure. ✔
- *Does clearing on unmount drop a legitimately-pending refresh?* Only if the component is
  unmounting — at which point there is nothing to setState into. The synchronous
  `await refreshSelfEval()` at `:79` (while still mounted) already does the immediate refresh; the
  three timers are only the "Running… → result" reveal, which is moot once the modal is closed. ✔
- *Re-entrancy:* pressing "Run" twice stacks timers in the same ref array — all are cleared on
  unmount; while mounted they harmlessly re-call `refreshSelfEval` (idempotent read). No leak. ✔
- *`open` prop gating:* the modal stays mounted (`Modal` controls visibility) — the cleanup runs
  on true unmount; this is strictly safer than today and never worse. ✔
- *CRLF corruption (the bridge):* mitigated — python byte-level edit + post-scan (T2), file is
  uniformly CRLF.
- *AGENTS guardrails:* no perimeter file; no Zustand store; no IPC contract change; no macOS
  target. Clean.

No task touches a one-way door or the safety perimeter → all tasks proceed to Layer 7.

---

## LAYER 7 — ASSEMBLED PLAN

Execute T1.1–T1.4 in one CRLF-safe python pass → T2 byte-scan + brace/paren balance + grep →
T3 four gates (typecheck, lint, vitest 4-shard, knip Node-20 shim) → T4 close (ledger P-046
SHIPPED, CHANGELOG under first `### Fixed`, handoff). Everything UNSTAGED for operator review.
No commit, no PR. No APPROVAL NODES.

**The bar (post-gate):** a self-eval run no longer leaves orphaned IPC polls firing into a closed
dialog — one fewer stray async write-back during a live session, marginally calmer/cleaner. Small,
correct, off-perimeter hygiene on the documented leak class.
